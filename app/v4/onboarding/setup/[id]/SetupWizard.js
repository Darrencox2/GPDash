'use client';

// SetupWizard — guided one-step-at-a-time practice configuration with
// horizontal sliding cards. This is the user's first proper experience
// of GPDash after creating their practice, so the visual design has to
// land: clear hierarchy, generous spacing, smooth transitions, and a
// progress indicator that makes "where am I" obvious at a glance.
//
// Architecture:
//
//   - Step state lives in this component. Each step renders its own
//     content; navigation is wizard-controlled.
//   - Step transitions use a CSS keyframe animation keyed on currentStep,
//     so the new step content remounts and slides in. No animation library.
//   - Each step persists its data immediately as the user types/clicks
//     (debounced auto-save). Navigation never blocks on a save.
//   - Required steps gate the final "Complete setup" button only —
//     forward navigation is always allowed so the user can preview
//     what's coming. The Continue button on a required-but-incomplete
//     step is disabled to nudge action.
//   - Resume: there's no explicit "you're on step 3" tracking. We just
//     start at step 0 and let the user navigate. Already-saved data is
//     pre-filled.
//
// Steps:
//
//   0. Practice details — postcode (REQUIRED), list size, region.
//      Postcode lookup auto-fills region from postcodes.io.
//
//   1. TeamNet calendar sync — URL + how-to-find-it instructions.
//      Fully optional; can skip with one click.
//
//   2. EMIS appointment data — XML download + first CSV upload.
//      CSV upload extracts clinicians; this is the gate for completing
//      setup, since without it the dashboard has nothing to show.
//
//   3. Demand data — optional CSV upload to calibrate the model.
//
//   4. Invite your team — optional, paste comma-separated emails.
//
// On final completion: setup_completed_at gets set and the user is
// redirected to /p/<slug>.

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import BrandHeader from '../../../_lib/BrandHeader';
import EmisReportCard from '@/components/EmisReportCard';
import DemandUpload from '@/app/v4/practice/[id]/DemandUpload';
import { parseHuddleCSV } from '@/lib/huddle';
import { guessGroupFromRole } from '@/lib/data';

// Steps are declared up here so the progress indicator can render them
// before the content. `optional: true` means Continue can advance even
// without action; `required: true` means setup can't complete without it.
const STEPS = [
  { id: 'details',   title: 'Your practice',          subtitle: 'A few key details', required: true },
  { id: 'teamnet',   title: 'TeamNet calendar',       subtitle: 'Optional · sync absences', optional: true },
  { id: 'emis',      title: 'Appointment data',       subtitle: 'EMIS report · build your team', required: true },
  { id: 'demand',    title: 'Demand history',         subtitle: 'Optional · calibrate the model', optional: true },
  { id: 'invites',   title: 'Invite your team',       subtitle: 'Optional · do later if you prefer', optional: true },
];

// ───────────────────────────────────────────────────────────────────────
export default function SetupWizard({
  practice,
  teamnetUrl: initialTeamnetUrl,
  hasClinicians: initialHasClinicians,
  hasDemandData: initialHasDemandData,
  hasInvites: initialHasInvites,
}) {
  const router = useRouter();
  const supabase = createClient();

  // Step state. Animation key is bumped on every step change so the
  // content remounts and the CSS keyframes replay.
  const [currentStep, setCurrentStep] = useState(() => {
    // Resume hint: jump straight to the first step that's still
    // incomplete according to the data. If everything looks done,
    // start at the last step (invites) so they can review or skip.
    if (!practice.postcode || !practice.list_size) return 0;
    if (!initialHasClinicians) return 2;
    if (!initialHasDemandData) return 3;
    return 4;
  });
  const [animKey, setAnimKey] = useState(0);

  // Per-step persisted state. Source of truth for the wizard, mirrored
  // back to the database via the relevant API on edits.
  const [postcode, setPostcode] = useState(practice.postcode || '');
  const [listSize, setListSize] = useState(practice.list_size || '');
  const [region, setRegion] = useState(practice.region || '');
  const [teamnetUrl, setTeamnetUrl] = useState(initialTeamnetUrl);
  const [hasClinicians, setHasClinicians] = useState(initialHasClinicians);
  const [clinicianCountAdded, setClinicianCountAdded] = useState(0);
  const [hasDemandData, setHasDemandData] = useState(initialHasDemandData);
  const [hasInvites, setHasInvites] = useState(initialHasInvites);

  const [globalError, setGlobalError] = useState('');

  // ─── Auto-complete + navigation ──────────────────────────────────────
  // The system knows when setup is "done" — all required steps have data.
  // No need for an explicit "Complete setup" click. We fire the DB
  // update in the background the first time canComplete becomes true,
  // which unlocks /p/<slug> for the owner. The user still chooses when
  // to navigate away via the "Go to dashboard" button (jarring to
  // auto-redirect mid-flight while they might be filling in optional
  // steps).
  const [autoMarkedAt, setAutoMarkedAt] = useState(null);
  const [autoMarkInFlight, setAutoMarkInFlight] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const goToDashboard = async () => {
    setNavigating(true);
    router.push(`/p/${practice.slug}`);
    router.refresh();
  };

  // Per-step "is this done" derivations — drive the progress indicator
  // (filled vs hollow dots), the colored top border on each step card,
  // and the auto-complete trigger.
  const stepDone = [
    !!postcode && !!listSize,                           // 0: details
    teamnetUrl.length > 0,                              // 1: teamnet (optional, but tick if set)
    hasClinicians,                                      // 2: emis
    hasDemandData,                                      // 3: demand
    hasInvites,                                         // 4: invites
  ];
  const requiredIncomplete = STEPS
    .map((s, i) => s.required && !stepDone[i] ? s : null)
    .filter(Boolean);
  const canComplete = requiredIncomplete.length === 0;

  // Fire-once auto-mark: when canComplete first becomes true, write
  // setup_completed_at in the background. Subsequent renders don't
  // re-fire — autoMarkedAt acts as the latch. If the write fails the
  // user can keep using the wizard; we surface the error and they'll
  // get redirected back from /p/<slug> until it succeeds.
  useEffect(() => {
    if (!canComplete) return;
    if (autoMarkedAt) return;
    if (autoMarkInFlight) return;
    let cancelled = false;
    (async () => {
      setAutoMarkInFlight(true);
      const { error } = await supabase
        .from('practices')
        .update({ setup_completed_at: new Date().toISOString() })
        .eq('id', practice.id);
      if (cancelled) return;
      setAutoMarkInFlight(false);
      if (error) {
        setGlobalError(error.message || 'Could not mark setup complete — your changes are saved, but the dashboard may still redirect you back here. Try again or refresh.');
        return;
      }
      setAutoMarkedAt(new Date());
    })();
    return () => { cancelled = true; };
  }, [canComplete, autoMarkedAt, autoMarkInFlight, supabase, practice.id]);

  // Navigation helpers. Forward nav is unrestricted — the user can
  // preview later steps. The per-card colored top border + amber
  // banner on missing-required steps tells them what still needs doing.
  const goNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1);
      setAnimKey(k => k + 1);
    }
  }, [currentStep]);
  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1);
      setAnimKey(k => k + 1);
    }
  }, [currentStep]);
  const goToStep = useCallback((idx) => {
    setCurrentStep(idx);
    setAnimKey(k => k + 1);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      {/* Subtle radial highlight behind the card to lift it off the
          gradient background. Using a fixed-position pseudo via a div
          rather than ::before so it doesn't capture clicks. */}
      <div style={glowStyle} aria-hidden />

      {/* Top strip: brand left, step counter right */}
      <div style={topStripStyle}>
        <BrandHeader />
        <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>
          Step {currentStep + 1} of {STEPS.length}
        </div>
      </div>

      {/* Progress indicator: connected dots */}
      <ProgressDots
        steps={STEPS}
        currentStep={currentStep}
        stepDone={stepDone}
        onStepClick={goToStep}
      />

      {/* Step card with animation. Top border is colour-coded:
            green  → step has data, complete
            amber  → step is REQUIRED but not yet complete (action needed)
            none   → step is optional and not yet complete (no pressure)
          Gives an at-a-glance read of where attention is needed,
          reinforcing the progress dots above. */}
      <div style={cardWrapperStyle}>
        <div key={animKey} style={cardAnimWrapperStyle}>
          <div style={{
            ...cardStyle,
            borderTopWidth: 4,
            borderTopStyle: 'solid',
            borderTopColor:
              stepDone[currentStep] ? '#10b981' :
              STEPS[currentStep].required ? '#f59e0b' :
              'rgba(255,255,255,0.08)',
          }}>
            <StepHeader step={STEPS[currentStep]} index={currentStep} done={stepDone[currentStep]} />
            <div style={{ marginTop: 28 }}>
              {currentStep === 0 && (
                <DetailsStep
                  practiceId={practice.id}
                  practiceOdsCode={practice.ods_code}
                  postcode={postcode}
                  setPostcode={setPostcode}
                  listSize={listSize}
                  setListSize={setListSize}
                  region={region}
                  setRegion={setRegion}
                />
              )}
              {currentStep === 1 && (
                <TeamNetStep
                  practiceId={practice.id}
                  teamnetUrl={teamnetUrl}
                  setTeamnetUrl={setTeamnetUrl}
                />
              )}
              {currentStep === 2 && (
                <EmisStep
                  practiceId={practice.id}
                  hasClinicians={hasClinicians}
                  setHasClinicians={setHasClinicians}
                  setClinicianCountAdded={setClinicianCountAdded}
                  clinicianCountAdded={clinicianCountAdded}
                />
              )}
              {currentStep === 3 && (
                <DemandStep
                  practiceId={practice.id}
                  practiceSlug={practice.slug}
                  hasDemandData={hasDemandData}
                  setHasDemandData={setHasDemandData}
                />
              )}
              {currentStep === 4 && (
                <InvitesStep
                  practiceId={practice.id}
                  hasInvites={hasInvites}
                  setHasInvites={setHasInvites}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer navigation */}
      <div style={footerStyle}>
        <button
          onClick={goBack}
          disabled={currentStep === 0}
          style={{ ...btnSubtle, opacity: currentStep === 0 ? 0.3 : 1, cursor: currentStep === 0 ? 'default' : 'pointer' }}
        >
          ← Back
        </button>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {currentStep < STEPS.length - 1 ? (
            <>
              {STEPS[currentStep].optional && !stepDone[currentStep] && (
                <button onClick={goNext} style={btnGhost}>Skip for now</button>
              )}
              <button
                onClick={goNext}
                disabled={STEPS[currentStep].required && !stepDone[currentStep]}
                style={{
                  ...btnPrimary,
                  opacity: (STEPS[currentStep].required && !stepDone[currentStep]) ? 0.4 : 1,
                  cursor: (STEPS[currentStep].required && !stepDone[currentStep]) ? 'not-allowed' : 'pointer',
                }}
                title={STEPS[currentStep].required && !stepDone[currentStep] ? 'Complete this step before continuing' : ''}
              >
                Continue →
              </button>
            </>
          ) : (
            // Last step. The "complete" state is automatic — setup_completed_at
            // gets written the moment all required steps have data (see the
            // useEffect that watches canComplete). This button is purely
            // navigation: take the user to their dashboard once they're done
            // exploring optional steps.
            <button
              onClick={goToDashboard}
              disabled={!canComplete || navigating}
              style={{
                ...btnPrimary,
                background: canComplete ? '#10b981' : '#0891b2',
                opacity: canComplete ? 1 : 0.4,
                cursor: canComplete && !navigating ? 'pointer' : 'not-allowed',
                paddingLeft: 22, paddingRight: 22,
              }}
            >
              {navigating ? 'Loading…' : (canComplete ? '✓ Go to dashboard' : 'Complete required steps first')}
            </button>
          )}
        </div>
      </div>

      {/* When the system has auto-marked setup complete, give the user
          a clear acknowledgement they can act on regardless of which
          step they're currently looking at. The dashboard is now
          accessible — they don't have to march to the final step. */}
      {autoMarkedAt && currentStep < STEPS.length - 1 && (
        <div style={{
          maxWidth: 720, margin: '14px auto 0',
          padding: '10px 16px',
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          fontSize: 13,
        }}>
          <span style={{ color: '#6ee7b7' }}>
            ✓ All set — you can head to your dashboard whenever you're ready.
          </span>
          <button
            onClick={goToDashboard}
            disabled={navigating}
            style={{ ...btnPrimary, background: '#10b981', padding: '6px 14px', fontSize: 12 }}
          >
            {navigating ? 'Loading…' : 'Go to dashboard'}
          </button>
        </div>
      )}

      {/* Surface what's still required when the user is on the last step */}
      {currentStep === STEPS.length - 1 && !canComplete && (
        <div style={{ maxWidth: 720, margin: '12px auto 0', textAlign: 'center', fontSize: 12, color: '#fbbf24' }}>
          Still to do:{' '}
          {requiredIncomplete.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ', '}
              <button
                onClick={() => goToStep(STEPS.findIndex(x => x.id === s.id))}
                style={{ background: 'transparent', border: 'none', color: '#fbbf24', cursor: 'pointer', textDecoration: 'underline', padding: 0, font: 'inherit' }}
              >
                {s.title}
              </button>
            </span>
          ))}
        </div>
      )}

      {globalError && (
        <div style={{ maxWidth: 720, margin: '12px auto 0', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>
          {globalError}
        </div>
      )}

      <div style={{ maxWidth: 720, margin: '32px auto 0', textAlign: 'center', fontSize: 11, color: '#475569' }}>
        Your changes save automatically. You can leave and come back any time.
      </div>

      <style jsx global>{`
        @keyframes wizardSlideIn {
          from { transform: translateX(28px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes wizardPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(8,145,178,0.5); }
          50%      { box-shadow: 0 0 0 8px rgba(8,145,178,0); }
        }
      `}</style>
    </div>
  );
}

// ─── Top-level styles ──────────────────────────────────────────────────
const pageStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
  color: '#e2e8f0',
  padding: '32px 24px 64px',
  fontFamily: 'inherit',
  position: 'relative',
  overflow: 'hidden',
};
const glowStyle = {
  position: 'absolute',
  top: '20%', left: '50%',
  width: 1000, height: 600,
  transform: 'translate(-50%, -50%)',
  background: 'radial-gradient(circle, rgba(8,145,178,0.08) 0%, transparent 60%)',
  pointerEvents: 'none',
};
const topStripStyle = {
  maxWidth: 900, margin: '0 auto 40px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  position: 'relative', zIndex: 1,
};
const cardWrapperStyle = {
  maxWidth: 720, margin: '0 auto',
  position: 'relative', zIndex: 1,
};
const cardAnimWrapperStyle = {
  animation: 'wizardSlideIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
};
const cardStyle = {
  background: 'rgba(15,23,42,0.7)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '36px 40px',
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(8px)',
};
const footerStyle = {
  maxWidth: 720, margin: '24px auto 0',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  position: 'relative', zIndex: 1,
};
const btnPrimary = { padding: '11px 20px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' };
const btnSubtle = { padding: '11px 16px', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: 'inherit' };
const btnGhost = { padding: '11px 16px', background: 'transparent', color: '#94a3b8', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };

// ─── Progress dots ─────────────────────────────────────────────────────
function ProgressDots({ steps, currentStep, stepDone, onStepClick }) {
  return (
    <div style={{
      maxWidth: 600, margin: '0 auto 40px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'relative', zIndex: 1,
    }}>
      {steps.map((step, i) => {
        const isCurrent = i === currentStep;
        const isDone = stepDone[i];
        const isPast = i < currentStep;
        const fill = isDone ? '#10b981' : (isCurrent ? 'transparent' : 'transparent');
        const border = isDone ? '#10b981' : (isCurrent ? '#0891b2' : 'rgba(255,255,255,0.15)');
        const textColor = isDone || isCurrent ? '#e2e8f0' : '#475569';
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <button
              type="button"
              onClick={() => onStepClick(i)}
              aria-label={`Go to step ${i + 1}: ${step.title}`}
              style={{
                width: 32, height: 32,
                background: fill,
                border: `2px solid ${border}`,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                color: textColor,
                transition: 'all 0.2s',
                animation: isCurrent ? 'wizardPulse 2s infinite' : 'none',
              }}
            >
              {isDone ? <CheckIcon /> : (i + 1)}
            </button>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2,
                background: (isPast || isDone) ? '#10b981' : 'rgba(255,255,255,0.08)',
                margin: '0 8px',
                transition: 'background 0.3s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Step header (number + title + subtitle) ───────────────────────────
function StepHeader({ step, index, done }) {
  // Eyebrow colour matches the card's top-border treatment so the
  // status reads consistently — emerald when done, cyan otherwise.
  const eyebrowColor = done ? '#10b981' : '#0891b2';
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: eyebrowColor, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>Step {index + 1}</span>
        {step.optional && <span style={{ color: '#64748b', letterSpacing: 1 }}>· optional</span>}
        {done && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px',
            background: 'rgba(16,185,129,0.15)',
            border: '1px solid rgba(16,185,129,0.35)',
            borderRadius: 4,
            color: '#6ee7b7', fontSize: 10, letterSpacing: 1,
          }}>
            ✓ Done
          </span>
        )}
        {!done && step.required && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px',
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: 4,
            color: '#fbbf24', fontSize: 10, letterSpacing: 1,
          }}>
            ! Required
          </span>
        )}
      </div>
      <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 32, fontWeight: 600, color: 'white', lineHeight: 1.15, marginBottom: 8 }}>
        {step.title}
      </h1>
      <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.5 }}>
        {step.subtitle}
      </p>
    </div>
  );
}

// ─── Step 1: Practice details ──────────────────────────────────────────
function DetailsStep({ practiceId, practiceOdsCode, postcode, setPostcode, listSize, setListSize, region, setRegion }) {
  const supabase = createClient();
  const [savingField, setSavingField] = useState('');
  const [error, setError] = useState('');
  const lookupTimer = useRef(null);

  // Save a field with optimistic UI. Errors revert by surfacing the
  // error message; we don't try to undo the local state change since
  // that's more confusing than a visible warning + retry.
  const saveField = async (column, value) => {
    setSavingField(column);
    setError('');
    const { error: err } = await supabase
      .from('practices')
      .update({ [column]: value || null })
      .eq('id', practiceId);
    setSavingField('');
    if (err) setError(err.message);
  };

  // Postcode lookup via postcodes.io (free, no auth) — fills region.
  const lookupPostcode = async (pc) => {
    const cleaned = (pc || '').replace(/\s+/g, '').toUpperCase();
    if (cleaned.length < 5) return;
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.result?.region) {
        setRegion(json.result.region);
        await saveField('region', json.result.region);
      }
    } catch (e) {
      // Silent failure — user can type region manually.
    }
  };

  // Save postcode immediately on change but debounce the upstream lookup
  // so we don't hammer the API while they're still typing.
  const onPostcodeChange = (v) => {
    setPostcode(v);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => {
      saveField('postcode', v);
      lookupPostcode(v);
    }, 600);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={fieldHelp}>
        These help us forecast your demand more accurately. The postcode tells us your
        region (which affects school holidays and weather data) and the list size scales
        the model.
      </p>

      <div>
        <Label>Postcode</Label>
        <input
          type="text" value={postcode}
          onChange={e => onPostcodeChange(e.target.value)}
          placeholder="BS25 1AB"
          maxLength={10}
          style={inputStyle}
        />
        {region && (
          <div style={{ fontSize: 12, color: '#10b981', marginTop: 6 }}>
            ✓ {region}
          </div>
        )}
      </div>

      <div>
        <Label>List size</Label>
        <input
          type="number" min="0" value={listSize}
          onChange={e => setListSize(e.target.value)}
          onBlur={() => saveField('list_size', listSize ? parseInt(listSize, 10) : null)}
          placeholder="e.g. 11000"
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
          The number of registered patients at your practice.
        </div>
      </div>

      {practiceOdsCode && (
        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 12, color: '#94a3b8' }}>
          ODS code: <span style={{ color: '#cbd5e1', fontFamily: "'Space Mono', monospace" }}>{practiceOdsCode}</span>
        </div>
      )}

      {savingField && <div style={{ fontSize: 11, color: '#64748b' }}>Saving {savingField}…</div>}
      {error && <div style={errorText}>{error}</div>}
    </div>
  );
}

// ─── Step 2: TeamNet calendar sync ─────────────────────────────────────
function TeamNetStep({ practiceId, teamnetUrl, setTeamnetUrl }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');
  const [showHowTo, setShowHowTo] = useState(false);
  const saveTimer = useRef(null);

  // TeamNet URL lives on practice_settings (one row per practice). Upsert
  // because a brand-new practice might not have the settings row yet.
  const save = async (url) => {
    setSaving(true);
    setError('');
    const { error: err } = await supabase
      .from('practice_settings')
      .upsert({ practice_id: practiceId, teamnet_url: url || null }, { onConflict: 'practice_id' });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSavedAt(new Date());
  };

  const onChange = (v) => {
    setTeamnetUrl(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(v), 600);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={fieldHelp}>
        If you use TeamNet for your practice diary, paste the calendar sync URL below
        and GPDash will pull planned absences automatically. You can skip this step and
        configure it later — closed days will still be detected from your CSVs.
      </p>

      <div>
        <Label>TeamNet calendar sync URL</Label>
        <input
          type="url"
          value={teamnetUrl}
          onChange={e => onChange(e.target.value)}
          placeholder="https://teamnet.clarity.co.uk/Diary/Sync/..."
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: saving ? '#94a3b8' : (savedAt ? '#10b981' : '#64748b'), marginTop: 6 }}>
          {saving ? 'Saving…' : (savedAt ? '✓ Saved' : 'Auto-saves as you type')}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowHowTo(s => !s)}
        style={{
          background: 'transparent', border: 'none',
          color: '#0891b2', fontSize: 13, cursor: 'pointer',
          padding: 0, textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        {showHowTo ? '▼' : '▶'} How to find this URL in TeamNet
      </button>

      {showHowTo && (
        <div style={{
          padding: 16,
          background: 'rgba(8,145,178,0.06)',
          border: '1px solid rgba(8,145,178,0.15)',
          borderRadius: 10,
          fontSize: 13, color: '#cbd5e1', lineHeight: 1.7,
        }}>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Open <strong>TeamNet</strong> and go to the <strong>Diary</strong> module.</li>
            <li>Click <strong>Sync</strong> (top right) and choose <strong>Webcal / iCal subscription</strong>.</li>
            <li>Pick the diary you want to sync from (typically the practice-wide one).</li>
            <li>Set the date range — we recommend "all dates" or a 12-month rolling window.</li>
            <li>TeamNet shows a URL starting with <span style={{ fontFamily: "'Space Mono', monospace", color: '#94a3b8' }}>https://teamnet.clarity.co.uk/Diary/Sync/...</span></li>
            <li>Copy that URL and paste it into the field above.</li>
          </ol>
          <p style={{ marginTop: 12, marginBottom: 0, color: '#94a3b8', fontSize: 12 }}>
            We sync this once a day. After this is set up, planned absences from TeamNet will appear in your buddy roster.
          </p>
        </div>
      )}

      {error && <div style={errorText}>{error}</div>}
    </div>
  );
}

// ─── Step 3: EMIS report + first CSV upload ────────────────────────────
function EmisStep({ practiceId, hasClinicians, setHasClinicians, setClinicianCountAdded, clinicianCountAdded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Clinician extraction logic — same TITLE_LIKE rule we use elsewhere
  // so a CSV name like "Smith, Jane (Mrs)" doesn't store "Mrs" as the
  // role. Title-like parens are dropped; the user picks a real role
  // later via the Clinicians tab.
  const TITLE_LIKE = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'doctor', 'prof', 'professor', 'rev', 'reverend', 'sir', 'dame', 'lord', 'lady']);

  const handleFile = async (file) => {
    setError('');
    setSuccess('');
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = parseHuddleCSV(text);
      const csvNames = parsed.clinicians || [];
      if (csvNames.length === 0) {
        throw new Error("Couldn't find any clinicians in that CSV. Is it the EMIS appointment-data export?");
      }

      // Generate initials for the batch. Two CSV name formats are common:
      //   "SURNAME, Forename"  → forename-then-surname initials: 'MB'
      //   "Forename Surname"   → same shape: 'MB'
      // Single-letter initials (just the surname's first letter, as the old
      // wizard did) collide constantly — every B-surname conflicted with
      // every other, and the database unique index
      // (practice_id, lower(initials)) WHERE status='active'
      // rejected 25+ of every 40-clinician import.
      //
      // Even two-letter initials can collide ("Michelle Balson" and
      // "Mark Banwell" both → 'MB'), so we dedupe within the batch by
      // appending a number ('MB', 'MB2', 'MB3'). The user can pick
      // meaningful initials in Quick Setup afterwards; this just makes
      // sure the import doesn't lose data.
      const baseInitialsFor = (csvName) => {
        const clean = csvName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        // "SURNAME, Forename" → forename first
        if (clean.includes(',')) {
          const [surname, forename] = clean.split(',').map(s => s.trim());
          if (surname && forename) {
            return (forename.charAt(0) + surname.charAt(0)).toUpperCase();
          }
        }
        // "Forename Surname" or just "Surname"
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
      };
      const usedInitials = new Set();
      const assignInitials = (csvName) => {
        const base = baseInitialsFor(csvName) || '';
        if (!base) return null; // empty → let it be NULL (DB skips uniqueness on null)
        let candidate = base;
        let n = 2;
        while (usedInitials.has(candidate)) {
          candidate = base + n;
          n++;
        }
        usedInitials.add(candidate);
        return candidate;
      };

      // Build clinician records — strip any parens that just contain
      // a title; let the user fix initials/role on the Clinicians tab.
      const newClinicians = csvNames.map((csvName) => {
        const cleanName = csvName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        const roleMatch = csvName.match(/\(([^)]+)\)/);
        const rawRole = roleMatch ? roleMatch[1].trim() : '';
        const role = (!rawRole || TITLE_LIKE.has(rawRole.toLowerCase())) ? '' : rawRole;
        const guessedGroup = guessGroupFromRole(role) || 'admin';
        return {
          id: crypto.randomUUID(),
          name: cleanName,
          title: '',
          initials: assignInitials(csvName),
          role,
          group: guessedGroup,
          status: 'active',
          sessions: 0,
          buddyCover: false,
          canProvideCover: true,
          showWhosIn: true,
          aliases: [csvName],
        };
      });

      const res = await fetch(`/api/v4/data?practiceId=${practiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicians: newClinicians }),
      });
      const body = await res.json().catch(() => ({}));
      // res.ok is true for 207 (Multi-Status) too. The API returns 207
      // when SOME inserts succeeded and others failed (e.g. on a unique
      // constraint). Treat that as a partial failure here so the user
      // can see what went wrong rather than getting a green tick while
      // half their team is silently missing.
      if (!res.ok || body?.ok === false) {
        const detail = Array.isArray(body?.errors) && body.errors.length > 0
          ? `${body.errors.length} clinician${body.errors.length === 1 ? '' : 's'} failed to save: ${body.errors.slice(0, 3).join('; ')}${body.errors.length > 3 ? '…' : ''}`
          : (body?.error || `Save failed (${res.status})`);
        throw new Error(detail);
      }

      setHasClinicians(true);
      setClinicianCountAdded(newClinicians.length);
      setSuccess(`✓ Found ${newClinicians.length} clinician${newClinicians.length === 1 ? '' : 's'} in your CSV. Your team is ready.`);
    } catch (e) {
      setError(e.message || 'Something went wrong reading that CSV.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={fieldHelp}>
        GPDash needs your appointment data from EMIS. Download the report definition
        below, import it into EMIS, and run it. Then upload the resulting CSV here
        — we'll detect your team from the appointments and create your clinician list.
      </p>

      {/* Step 3a: Download */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: 16,
      }}>
        <EmisReportCard variant="inline" />
      </div>

      {/* Step 3b: Upload */}
      <div>
        <Label>Then upload the resulting CSV</Label>
        {hasClinicians ? (
          <div style={{
            padding: 16,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckIcon />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: '#6ee7b7', fontWeight: 500 }}>
                Your team is ready
                {clinicianCountAdded > 0 && (
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {clinicianCountAdded} clinician{clinicianCountAdded === 1 ? '' : 's'} found</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Review roles and initials on the Clinicians tab once setup is done.
              </div>
            </div>
            <label style={{ ...btnSubtle, cursor: 'pointer', padding: '7px 12px', fontSize: 12 }}>
              Re-upload
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          </div>
        ) : (
          <label style={{
            display: 'block',
            padding: 28,
            background: 'rgba(255,255,255,0.03)',
            border: '2px dashed rgba(255,255,255,0.12)',
            borderRadius: 10,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(8,145,178,0.4)'; e.currentTarget.style.background = 'rgba(8,145,178,0.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
          >
            <div style={{ fontSize: 14, color: '#cbd5e1', marginBottom: 4 }}>
              {uploading ? 'Reading CSV…' : 'Drop your CSV here or click to browse'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              The file should end in .csv and come from the EMIS report you just imported.
            </div>
            <input
              type="file" accept=".csv,text/csv"
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        )}
        {success && <div style={{ marginTop: 8, fontSize: 12, color: '#34d399' }}>{success}</div>}
        {error && <div style={errorText}>{error}</div>}
      </div>
    </div>
  );
}

// ─── Step 4: Demand history (optional) ─────────────────────────────────
function DemandStep({ practiceId, practiceSlug, hasDemandData, setHasDemandData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={fieldHelp}>
        GPDash can predict demand for any future date based on your historical patterns —
        day of week, school holidays, weather, and so on. Upload your AskMyGP{' '}
        <em>"Crosstab — Demand data"</em> CSV to calibrate the model to your practice.
        You can skip this and add it later.
      </p>

      {hasDemandData ? (
        <div style={{
          padding: 16,
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckIcon />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: '#6ee7b7', fontWeight: 500 }}>Demand data uploaded</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              The model is now calibrated to your practice.
            </div>
          </div>
        </div>
      ) : (
        <DemandUpload
          practiceId={practiceId}
          demandSettings={null}
          history={[]}
          onUploadSuccess={() => setHasDemandData(true)}
        />
      )}

      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
        Don't have a demand CSV handy? Skip for now — you can upload it any time from the
        Demand tab on your practice settings page.
      </div>
    </div>
  );
}

// ─── Step 5: Invite team (optional) ────────────────────────────────────
function InvitesStep({ practiceId, hasInvites, setHasInvites }) {
  const supabase = createClient();
  const [emailsText, setEmailsText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Same parser as BulkInviteButton — pull anything that looks like
  // an email out of the textarea, dedupe.
  const parseEmails = (text) => {
    const re = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    const matches = (text.match(re) || []).map(s => s.toLowerCase());
    return Array.from(new Set(matches));
  };

  const send = async () => {
    const emails = parseEmails(emailsText);
    if (emails.length === 0) {
      setError('Add at least one email address.');
      return;
    }
    setSending(true);
    setError('');
    setResult(null);
    const { data, error: err } = await supabase.rpc('bulk_invite_users_to_practice', {
      target_practice_id: practiceId,
      invitees: emails.map(email => ({ email, role: 'user' })),
    });
    setSending(false);
    if (err) {
      setError(err.message || 'Could not send invites.');
      return;
    }
    setResult(data);
    if (data?.created > 0) setHasInvites(true);
    setEmailsText('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={fieldHelp}>
        Drop in some email addresses and we'll email each person an invite link.
        They'll see your practice as soon as they accept. Skip this if you'd
        rather have a poke around first.
      </p>

      <div>
        <Label>Email addresses</Label>
        <textarea
          rows={4}
          value={emailsText}
          onChange={e => setEmailsText(e.target.value)}
          placeholder="anna@example.com, ben@example.com&#10;chris@example.com"
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
        />
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
          Comma, space, or newline-separated. We'll figure it out.
        </div>
      </div>

      <button
        onClick={send}
        disabled={sending || emailsText.trim().length === 0}
        style={{
          ...btnPrimary,
          alignSelf: 'flex-start',
          opacity: (sending || emailsText.trim().length === 0) ? 0.4 : 1,
          cursor: (sending || emailsText.trim().length === 0) ? 'not-allowed' : 'pointer',
        }}
      >
        {sending ? 'Sending…' : 'Send invites'}
      </button>

      {result && (
        <div style={{
          padding: 14,
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 8,
          fontSize: 13, color: '#6ee7b7',
        }}>
          {result.created > 0 && <>✓ Sent {result.created} invite{result.created === 1 ? '' : 's'}. </>}
          {result.skipped > 0 && <span style={{ color: '#94a3b8' }}>{result.skipped} skipped (already invited or members).</span>}
        </div>
      )}

      {error && <div style={errorText}>{error}</div>}
    </div>
  );
}

// ─── Shared form bits ──────────────────────────────────────────────────
function Label({ children }) {
  return (
    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>
      {children}
    </label>
  );
}
const fieldHelp = { fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, margin: 0 };
const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 14,
  color: '#e2e8f0',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};
const errorText = { marginTop: 8, fontSize: 12, color: '#fca5a5' };
