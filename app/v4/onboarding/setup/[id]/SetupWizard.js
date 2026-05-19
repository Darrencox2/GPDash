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

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import BrandHeader from '../../../_lib/BrandHeader';
import EmisReportCard from '@/components/EmisReportCard';
import DemandUpload from '@/app/v4/practice/[id]/DemandUpload';
import { parseHuddleCSV } from '@/lib/huddle';
import { guessGroupFromRole, buddyDefaultsForRole } from '@/lib/data';

// Steps are declared up here so the progress indicator can render them
// before the content. `optional: true` means Continue can advance even
// without action; `required: true` means setup can't complete without it.
const STEPS = [
  { id: 'details',   title: 'Your practice',          subtitle: 'A few key details', required: true },
  { id: 'teamnet',   title: 'TeamNet calendar',       subtitle: 'Optional · sync absences', optional: true },
  { id: 'emis',      title: 'Appointment data',       subtitle: 'EMIS report · build your team', required: true },
  { id: 'slots',     title: 'Slot types',             subtitle: 'Routine, urgent, duty doctor', optional: true },
  { id: 'sites',     title: 'Practice sites',         subtitle: 'Optional · assign colours', optional: true },
  { id: 'demand',    title: 'Demand history',         subtitle: 'Optional · calibrate the model', optional: true },
  { id: 'invites',   title: 'Invite your team',       subtitle: 'Optional · do later if you prefer', optional: true },
];

// Default colours for sites — picked from the standard practice palette
// (lib/roomAllocation.js SITE_COLOUR_PRESETS). Keeping them duplicated
// here so the wizard doesn't have to import from a v3-era module.
const SITE_COLOUR_PRESETS = [
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#84cc16',
  '#3b82f6', '#14b8a6', '#a855f7', '#eab308', '#64748b',
];

// ───────────────────────────────────────────────────────────────────────
export default function SetupWizard({
  practice,
  teamnetUrl: initialTeamnetUrl,
  hasClinicians: initialHasClinicians,
  hasDemandData: initialHasDemandData,
  hasInvites: initialHasInvites,
  // Server has already marked setup_completed_at — skip the client-side
  // write. Acts as the initial value of autoMarkedAt so we don't re-fire.
  autoCompleted = false,
  // Pre-loaded by server component so new slot/site steps render with
  // existing state on first paint. Each is small enough to ship in HTML.
  initialHuddleSettings = {},
  initialSites = [],
  initialCsvData = null,
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
    if (!initialHasDemandData) return 5;
    return 6;
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

  // ─── CSV data + derived setup ─────────────────────────────────────
  // The EMIS step parses the CSV and pushes the rich data up to the
  // wizard so the slot-types + sites steps can read its allSlotTypes
  // and locationData. Initialised from the server-pre-loaded blob so
  // those steps work even on a fresh page load after upload.
  const [parsedCsv, setParsedCsv] = useState(initialCsvData);

  // Slot-type filters live in huddle_settings.savedSlotFilters
  // (routine + urgent) and huddle_settings.dutyDoctorSlot. Both are
  // editable via Practice settings later — wizard just provides a
  // first-pass starting set.
  //
  // SHAPE: v3 stores each filter as an OBJECT mapping slot name to a
  // boolean ({ "Telephone": true, "Booked": false }) NOT as an array.
  // The dashboard's SlotFilter component reads from this shape, so the
  // wizard has to write the same shape — anything else breaks v3 reads.
  // We also tolerate arrays in case a previous wizard version wrote
  // them (convert: ["A","B"] → { A: true, B: true }).
  const normaliseSlotMap = (v) => {
    if (!v) return {};
    if (Array.isArray(v)) {
      const o = {};
      for (const name of v) if (name) o[name] = true;
      return o;
    }
    if (typeof v === 'object') return v;
    return {};
  };
  const normaliseDutySlot = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return [String(v)]; // legacy: single string
  };
  const [slotFilters, setSlotFilters] = useState({
    routine: normaliseSlotMap(initialHuddleSettings?.savedSlotFilters?.routine),
    urgent:  normaliseSlotMap(initialHuddleSettings?.savedSlotFilters?.urgent),
    dutyDoctorSlot: normaliseDutySlot(initialHuddleSettings?.dutyDoctorSlot),
  });

  // Sites are stored as practice_settings.room_allocation.sites — an
  // array of { id, name, colour, gridSize, rooms } objects. The
  // wizard only configures name+colour; rooms get added via the v3
  // Room Allocation page later.
  const [sites, setSites] = useState(initialSites);

  const [globalError, setGlobalError] = useState('');

  // ─── Auto-complete + navigation ──────────────────────────────────────
  // The system knows when setup is "done" — all required steps have data.
  // No need for an explicit "Complete setup" click. We fire the DB
  // update in the background the first time canComplete becomes true,
  // which unlocks /p/<slug> for the owner. The user still chooses when
  // to navigate away via the "Go to dashboard" button (jarring to
  // auto-redirect mid-flight while they might be filling in optional
  // steps).
  const [autoMarkedAt, setAutoMarkedAt] = useState(autoCompleted ? new Date() : null);
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
  const slotsConfigured = !!(
    Object.values(slotFilters.routine || {}).some(Boolean) ||
    Object.values(slotFilters.urgent || {}).some(Boolean) ||
    (slotFilters.dutyDoctorSlot || []).length > 0
  );
  const sitesConfigured = (sites?.length || 0) > 0;
  const stepDone = [
    !!postcode && !!listSize,                           // 0: details
    teamnetUrl.length > 0,                              // 1: teamnet (optional, but tick if set)
    hasClinicians,                                      // 2: emis
    slotsConfigured,                                    // 3: slots (optional)
    sitesConfigured,                                    // 4: sites (optional)
    hasDemandData,                                      // 5: demand
    hasInvites,                                         // 6: invites
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
                  setParsedCsv={setParsedCsv}
                />
              )}
              {currentStep === 3 && (
                <SlotTypesStep
                  practiceId={practice.id}
                  parsedCsv={parsedCsv}
                  slotFilters={slotFilters}
                  setSlotFilters={setSlotFilters}
                />
              )}
              {currentStep === 4 && (
                <SitesStep
                  practiceId={practice.id}
                  parsedCsv={parsedCsv}
                  sites={sites}
                  setSites={setSites}
                />
              )}
              {currentStep === 5 && (
                <DemandStep
                  practiceId={practice.id}
                  practiceSlug={practice.slug}
                  hasDemandData={hasDemandData}
                  setHasDemandData={setHasDemandData}
                />
              )}
              {currentStep === 6 && (
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
  // Sync state — pressing "Sync now" hits the same /api/v4/sync-teamnet
  // endpoint the standalone editor on the practice management page uses.
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
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

  // Trigger an immediate calendar sync. Useful so users can confirm
  // their URL works without waiting for the daily cron — and the
  // "X absences imported" feedback gives instant confidence.
  const syncNow = async () => {
    setSyncing(true);
    setSyncStatus(null);
    setError('');
    try {
      const r = await fetch(`/api/v4/sync-teamnet?practice=${practiceId}`, { method: 'POST' });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      setSyncStatus({
        ok: true,
        text: `Synced — imported ${json.imported || 0} absence${json.imported === 1 ? '' : 's'}`,
      });
    } catch (err) {
      setSyncStatus({ ok: false, text: `Sync failed: ${err.message}` });
    } finally {
      setSyncing(false);
    }
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

      {/* Sync now: confirms the URL works and pulls the first batch of
          absences immediately rather than waiting for the daily cron.
          Disabled until the URL has been saved (avoids hitting the API
          with stale or empty input). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={syncNow}
          disabled={!teamnetUrl || syncing}
          style={{
            padding: '8px 14px',
            background: (teamnetUrl && !syncing) ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${(teamnetUrl && !syncing) ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: (teamnetUrl && !syncing) ? '#67e8f9' : '#64748b',
            borderRadius: 8,
            fontSize: 13, fontWeight: 500,
            cursor: (teamnetUrl && !syncing) ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Otherwise we sync once a day automatically.
        </span>
      </div>
      {syncStatus && (
        <div style={{
          padding: 10,
          background: syncStatus.ok ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
          border: `1px solid ${syncStatus.ok ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.30)'}`,
          color: syncStatus.ok ? '#34d399' : '#fca5a5',
          borderRadius: 8,
          fontSize: 13,
        }}>
          {syncStatus.text}
        </div>
      )}

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
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Open <strong>TeamNet</strong> and go to <strong>Diary</strong>.</li>
            <li>Make sure <strong>"My items only"</strong> is <strong>unticked</strong> — you want the whole practice diary, not just yours.</li>
            <li>Click <strong>Add to external calendar</strong>.</li>
            <li>Copy the link TeamNet provides and paste it into the field above.</li>
          </ol>
          <p style={{ marginTop: 12, marginBottom: 0, color: '#94a3b8', fontSize: 12 }}>
            We sync once a day. After this is set up, planned absences from TeamNet will appear automatically in your buddy roster.
          </p>
        </div>
      )}

      {error && <div style={errorText}>{error}</div>}
    </div>
  );
}

// ─── Step 3: EMIS report + first CSV upload ────────────────────────────
function EmisStep({ practiceId, hasClinicians, setHasClinicians, setClinicianCountAdded, clinicianCountAdded, setParsedCsv }) {
  const supabase = createClient();
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
        const cleanRaw = csvName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        // EMIS CSVs use "Surname, Firstname" order; flip to
        // "Firstname Surname" so downstream matching (teamnet, room
        // allocator, buddy cover) treats the surname as the actual
        // surname rather than the first name. Without this flip, two
        // clinicians sharing a first name (Katie Ellison + Katie
        // Parkhouse) both get surname="Katie" and the teamnet matcher
        // collides.
        let flipped = cleanRaw;
        if (cleanRaw.includes(',')) {
          const parts = cleanRaw.split(',').map(s => s.trim());
          if (parts.length === 2 && parts[0] && parts[1]) {
            flipped = `${parts[1]} ${parts[0]}`;
          }
        }
        // Title-case any all-caps words (CSVs commonly have
        // "ELLISON, Katie" — surname uppercase, firstname mixed).
        const cleanName = flipped.split(/\s+/).map(w => {
          if (w.length > 1 && w === w.toUpperCase() && !/^(DR\.?|MR\.?|MRS\.?|MS\.?)$/i.test(w)) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
          }
          return w;
        }).join(' ');
        const roleMatch = csvName.match(/\(([^)]+)\)/);
        const rawRole = roleMatch ? roleMatch[1].trim() : '';
        const role = (!rawRole || TITLE_LIKE.has(rawRole.toLowerCase())) ? '' : rawRole;
        const guessedGroup = guessGroupFromRole(role) || 'admin';
        // Role-based buddy defaults: GP Partners and Salaried GPs default
        // in AND can cover; Registrars and ANPs default in but can't
        // cover; everyone else off. See buddyDefaultsForRole in lib/data.js
        // for the full table. Users still override per-clinician.
        const buddyDefaults = buddyDefaultsForRole(role);
        return {
          id: crypto.randomUUID(),
          name: cleanName,
          title: '',
          initials: assignInitials(csvName),
          role,
          group: guessedGroup,
          status: 'active',
          sessions: 0,
          ...buddyDefaults,
          showWhosIn: true,
          // Keep the raw CSV name as an alias so future appointment
          // imports (which use the original format) still match.
          aliases: [csvName],
        };
      });

      const res = await fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`, {
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

      // Push parsed CSV up so the slot-types + sites steps can use it
      // immediately (no need to navigate away and back). Also save the
      // parsed blob to huddle_csv_data so it persists across reloads —
      // direct Supabase write rather than via the API to avoid Vercel's
      // 4.5MB function body limit (parsed CSV can be several MB).
      setParsedCsv?.(parsed);
      try {
        await supabase
          .from('huddle_csv_data')
          .upsert({ practice_id: practiceId, data: parsed }, { onConflict: 'practice_id' });
      } catch (e) {
        // Non-fatal: clinicians are saved, slot/site steps may need
        // a re-upload but the user has what they came for. Log + carry on.
        console.warn('Could not persist parsed CSV to huddle_csv_data:', e);
      }

      // ─── Auto-generate working patterns from CSV ───────────────────
      // For each clinician we just saved, look back at the recent CSV
      // history (the parsed blob we just stored) to infer their AM/PM
      // working pattern. Only clinicians WITHOUT an existing
      // working_patterns row get one — we never overwrite manual edits.
      try {
        const { inferAmPmPatterns } = await import('@/lib/auto-rota');
        // Fetch the inserted clinicians back to get their UUIDs (the
        // /api/v4/data response is { ok: true } without IDs). We need
        // them for the working_patterns foreign key.
        const { data: savedClinicians } = await supabase
          .from('clinicians')
          .select('id, name, initials, role, status, buddy_cover, aliases, metadata')
          .eq('practice_id', practiceId);
        if (savedClinicians && savedClinicians.length > 0) {
          // Skip clinicians who already have a pattern (don't overwrite).
          const ids = savedClinicians.map(c => c.id);
          const { data: existing } = await supabase
            .from('working_patterns')
            .select('clinician_id')
            .in('clinician_id', ids)
            .is('effective_to', null);
          const alreadyHasPattern = new Set((existing || []).map(r => r.clinician_id));
          const targets = savedClinicians
            .filter(c => !alreadyHasPattern.has(c.id))
            .map(c => ({
              id: c.id,
              name: c.name,
              initials: c.initials,
              role: c.role,
              status: c.status,
              buddyCover: !!c.buddy_cover,
              aliases: c.aliases || [],
            }));
          if (targets.length > 0) {
            const { patterns } = inferAmPmPatterns({
              huddleData: parsed,
              clinicians: targets,
              includeOnlyBuddyCover: false,
            });
            if (patterns && patterns.length > 0) {
              const today = new Date().toISOString().slice(0, 10);
              const inserts = patterns.map(p => ({
                clinician_id: p.clinicianId,
                effective_from: today,
                effective_to: null,
                pattern: p.pattern,
              }));
              const { error: wpErr } = await supabase
                .from('working_patterns')
                .insert(inserts);
              if (wpErr) {
                console.warn('Working pattern auto-generation failed:', wpErr);
              } else {
                setSuccess(prev => prev + ` Working patterns generated for ${patterns.length}.`);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Auto-generate working patterns: error', e);
        // Non-fatal — user can fill the grid manually
      }
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

      <div style={{
        padding: 12,
        background: 'rgba(34,211,238,0.05)',
        border: '1px solid rgba(34,211,238,0.15)',
        borderRadius: 8,
        fontSize: 12, color: '#cbd5e1', lineHeight: 1.5,
      }}>
        <strong style={{ color: '#67e8f9' }}>One report does it all.</strong> This is the
        same CSV you'll upload every day going forward — saved as a report definition in
        EMIS, it takes about 30 seconds to run and re-upload. Each daily upload refreshes
        the dashboard with that day's appointments + any new clinicians.
      </div>

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

// ─── Step 3 (slots) + Step 4 (sites) — shared helpers ─────────────────
// Both steps need the parsed CSV in hand. If the user lands here without
// uploading first, render an "upload-first" placeholder rather than an
// empty grid that looks broken.
function UploadFirstPrompt({ message }) {
  return (
    <div style={{
      padding: 24,
      background: 'rgba(245,158,11,0.06)',
      border: '1px solid rgba(245,158,11,0.2)',
      borderRadius: 10,
      color: '#cbd5e1',
      fontSize: 13, lineHeight: 1.6,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ color: '#fcd34d', fontWeight: 600 }}>Upload your appointment CSV first</div>
      <div>{message}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
        Use the back button to return to the Appointment data step.
      </div>
    </div>
  );
}

// Heuristic suggestion for a slot-type name. Returns the suggested
// CATEGORY (routine / urgent / null) and whether it might be a DUTY
// DOCTOR slot — these are independent so a slot can be both
// "urgent" AND "duty doctor". Null category means we don't have a
// confident suggestion and the slot stays in "Other (not included)"
// until the user reviews it explicitly.
//
// Hits on suggestions:
//   - routine: "book", "routine", "pre-book", "appt", "appointment",
//     "f2f", "face to face"
//   - urgent: "urgent", "same day", "OTD", "on the day", "acute",
//     "emergency", "triage", "call back", "callback"
//   - duty: "duty"
// Everything else: no suggestion (user must review).
function suggestSlotCategory(name) {
  const n = (name || '').toLowerCase();
  // urgent first because urgent slots are often phrased with "book" too
  if (/\bsame[\s-]?day\b/.test(n) || n.includes('urgent') || /\bontd\b/.test(n)
      || /\bon[\s-]?the[\s-]?day\b/.test(n) || n.includes('acute')
      || n.includes('emergency') || n.includes('triage')
      || /\bcall[\s-]?back\b/.test(n)) {
    return 'urgent';
  }
  if (n.includes('book') || n.includes('routine') || n.includes('pre-book')
      || /\bappt\b/.test(n) || n.includes('appointment')
      || /\bf2f\b/.test(n) || /\bface[\s-]?to[\s-]?face\b/.test(n)) {
    return 'routine';
  }
  return null;
}
function suggestDuty(name) {
  return /\bduty\b/.test((name || '').toLowerCase());
}

// ─── Step 3: Slot types ────────────────────────────────────────────────
// Classify each slot type from the uploaded CSV.
//
// Three categories (mutually exclusive):
//   - Routine: bookable, not on-the-day (the bulk of demand)
//   - Urgent:  same-day / acute work
//   - Other:   not included in the routine/urgent capacity model
//             (admin, blocked, nursing, vaccinations, etc.) — the default
//
// Duty doctor is a SEPARATE, independent flag. A slot can be marked
// urgent AND duty doctor (typical) or routine AND duty doctor, or
// neither.
//
// Defaults: nothing is set until the user reviews. Slots default to
// "Other" so they don't inadvertently pollute the demand model.
// Heuristic suggestions are shown as hints — the user must explicitly
// pick to commit, or click "Apply suggestions" to commit all at once.
//
// Storage:
//   huddle_settings.savedSlotFilters.routine = { slotName: true, ... }
//   huddle_settings.savedSlotFilters.urgent  = { slotName: true, ... }
//   huddle_settings.dutyDoctorSlot           = [slotName, ...]
// Only true entries are written; slots not in either map are "Other".
function SlotTypesStep({ practiceId, parsedCsv, slotFilters, setSlotFilters }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);

  const slotTypes = useMemo(() => {
    const list = parsedCsv?.allSlotTypes || [];
    return [...list].sort((a, b) => a.localeCompare(b));
  }, [parsedCsv]);

  const categoryOf = (name) => {
    if (slotFilters.urgent && slotFilters.urgent[name]) return 'urgent';
    if (slotFilters.routine && slotFilters.routine[name]) return 'routine';
    return 'other';
  };
  const isDuty = (name) => (slotFilters.dutyDoctorSlot || []).includes(name);

  const saveToDb = async (next) => {
    setSaving(true);
    setError('');
    const { data: existing } = await supabase
      .from('practice_settings')
      .select('huddle_settings')
      .eq('practice_id', practiceId)
      .maybeSingle();
    const merged = {
      ...(existing?.huddle_settings || {}),
      savedSlotFilters: {
        ...(existing?.huddle_settings?.savedSlotFilters || {}),
        routine: next.routine,
        urgent: next.urgent,
      },
      dutyDoctorSlot: next.dutyDoctorSlot,
    };
    const { error: err } = await supabase
      .from('practice_settings')
      .upsert({ practice_id: practiceId, huddle_settings: merged }, { onConflict: 'practice_id' });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSavedAt(new Date());
  };

  const debouncedSave = (next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToDb(next), 500);
  };

  const setCategory = (slotName, category) => {
    // Strip slot from both maps first, then add to the chosen one
    // (if not "other"). Keeping only `true` entries means the dashboard's
    // urgent/routine check `urgentOverrides[name] === true` works without
    // surprise — "Other" is the absence of an entry, not a `false` value.
    const stripFromMap = (m) => {
      if (!m) return {};
      const next = { ...m };
      delete next[slotName];
      return next;
    };
    const next = {
      routine: stripFromMap(slotFilters.routine),
      urgent: stripFromMap(slotFilters.urgent),
      dutyDoctorSlot: slotFilters.dutyDoctorSlot || [],
    };
    if (category === 'routine') next.routine[slotName] = true;
    if (category === 'urgent') next.urgent[slotName] = true;
    setSlotFilters(next);
    debouncedSave(next);
  };

  const toggleDuty = (slotName) => {
    const cur = (slotFilters.dutyDoctorSlot || []);
    const has = cur.includes(slotName);
    const nextDuty = has ? cur.filter(s => s !== slotName) : [...cur, slotName];
    const next = {
      routine: slotFilters.routine || {},
      urgent: slotFilters.urgent || {},
      dutyDoctorSlot: nextDuty,
    };
    setSlotFilters(next);
    debouncedSave(next);
  };

  // "Apply suggestions" — commit every slot that has a confident suggestion
  // and isn't already classified. Slots without a suggestion stay in
  // "Other". Doesn't touch duty doctor flags — that's a separate
  // "Apply duty suggestions" action below.
  const applyCategorySuggestions = () => {
    const nextRoutine = { ...(slotFilters.routine || {}) };
    const nextUrgent = { ...(slotFilters.urgent || {}) };
    for (const slot of slotTypes) {
      const cur = categoryOf(slot);
      if (cur !== 'other') continue; // user already picked
      const suggested = suggestSlotCategory(slot);
      if (suggested === 'routine') nextRoutine[slot] = true;
      else if (suggested === 'urgent') nextUrgent[slot] = true;
    }
    const next = {
      routine: nextRoutine,
      urgent: nextUrgent,
      dutyDoctorSlot: slotFilters.dutyDoctorSlot || [],
    };
    setSlotFilters(next);
    debouncedSave(next);
  };

  const applyDutySuggestions = () => {
    const cur = new Set(slotFilters.dutyDoctorSlot || []);
    for (const slot of slotTypes) {
      if (suggestDuty(slot)) cur.add(slot);
    }
    const next = {
      routine: slotFilters.routine || {},
      urgent: slotFilters.urgent || {},
      dutyDoctorSlot: Array.from(cur),
    };
    setSlotFilters(next);
    debouncedSave(next);
  };

  if (!parsedCsv || slotTypes.length === 0) {
    return <UploadFirstPrompt message="Once you've uploaded your EMIS appointment CSV, we'll list every slot type we found here." />;
  }

  // Count by category for the summary line
  const summary = slotTypes.reduce((acc, s) => {
    acc[categoryOf(s)]++;
    if (isDuty(s)) acc.duty++;
    return acc;
  }, { routine: 0, urgent: 0, other: 0, duty: 0 });

  // Are there pending suggestions the user hasn't acted on?
  const pendingCategorySuggestions = slotTypes.some(s => categoryOf(s) === 'other' && suggestSlotCategory(s) !== null);
  const pendingDutySuggestions = slotTypes.some(s => suggestDuty(s) && !isDuty(s));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        padding: 14,
        background: 'rgba(34,211,238,0.05)',
        border: '1px solid rgba(34,211,238,0.15)',
        borderRadius: 10,
        fontSize: 13, color: '#cbd5e1', lineHeight: 1.55,
      }}>
        <p style={{ margin: 0 }}>
          <strong style={{ color: '#67e8f9' }}>What goes here?</strong> Appointment
          slot types for clinicians whose work is <strong>bookable by patients</strong> —
          typically GP and ANP slots. Most practices set <em>nursing, HCA, phlebotomy,
          vaccination, and admin</em> slots to <strong>Other</strong> since they\'re not
          part of the routine-vs-urgent capacity model.
        </p>
        <p style={{ margin: '8px 0 0' }}>
          <strong>Routine</strong> = booked in advance · <strong>Urgent</strong> =
          same-day / acute work · <strong>Other</strong> = excluded from the model.
          A slot can additionally be flagged as the <strong>duty doctor</strong> slot,
          independent of its category.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
        <SummaryPill colour="#64748b" label="Routine" count={summary.routine} />
        <SummaryPill colour="#f97316" label="Urgent" count={summary.urgent} />
        <SummaryPill colour="#475569" label="Other" count={summary.other} />
        <SummaryPill colour="#8b5cf6" label="Duty doctor" count={summary.duty} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: saving ? '#94a3b8' : (savedAt ? '#10b981' : '#64748b') }}>
          {saving ? 'Saving…' : (savedAt ? '✓ Saved' : 'Auto-saves on change')}
        </span>
      </div>

      {(pendingCategorySuggestions || pendingDutySuggestions) && (
        <div style={{
          padding: 12,
          background: 'rgba(168,85,247,0.08)',
          border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          fontSize: 12, color: '#cbd5e1',
        }}>
          <span>
            <strong style={{ color: '#c4b5fd' }}>Suggestions available</strong> — we\'ve
            guessed categories based on slot names. Apply them all in one go or click
            through individually.
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {pendingCategorySuggestions && (
              <button type="button" onClick={applyCategorySuggestions} style={pillButton('#a855f7')}>
                Apply category suggestions
              </button>
            )}
            {pendingDutySuggestions && (
              <button type="button" onClick={applyDutySuggestions} style={pillButton('#a855f7')}>
                Apply duty suggestions
              </button>
            )}
          </span>
        </div>
      )}

      <div style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 240px 100px',
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.03)',
          fontSize: 11, fontWeight: 600, color: '#94a3b8',
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          <div>Slot type</div>
          <div style={{ textAlign: 'center' }}>Category</div>
          <div style={{ textAlign: 'center' }}>Duty doctor</div>
        </div>
        {slotTypes.map((slot, i) => {
          const cat = categoryOf(slot);
          const duty = isDuty(slot);
          const suggested = suggestSlotCategory(slot);
          const suggestedDuty = suggestDuty(slot);
          const showCategorySuggestion = cat === 'other' && suggested !== null;
          return (
            <div
              key={slot}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 240px 100px',
                alignItems: 'center', gap: 8,
                padding: '10px 14px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                borderTop: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: '#cbd5e1', fontFamily: "'Space Mono', monospace" }}>
                  {slot}
                </div>
                {showCategorySuggestion && (
                  <div style={{ marginTop: 2, fontSize: 10.5, color: '#a78bfa' }}>
                    Suggested: <strong style={{ color: suggested === 'urgent' ? '#fdba74' : '#cbd5e1' }}>{suggested}</strong>
                    {suggestedDuty && !duty && <span style={{ color: '#c4b5fd' }}> + duty doctor</span>}
                  </div>
                )}
                {!showCategorySuggestion && suggestedDuty && !duty && (
                  <div style={{ marginTop: 2, fontSize: 10.5, color: '#a78bfa' }}>
                    Suggested: <strong style={{ color: '#c4b5fd' }}>duty doctor</strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <SlotCategoryPicker value={cat} onChange={(c) => setCategory(slot, c)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => toggleDuty(slot)}
                  role="switch"
                  aria-checked={duty}
                  aria-label={`Mark ${slot} as duty doctor slot`}
                  style={{
                    position: 'relative',
                    width: 36, height: 20, padding: 0,
                    background: duty ? '#8b5cf6' : 'rgba(255,255,255,0.10)',
                    border: `1px solid ${duty ? '#8b5cf6' : 'rgba(255,255,255,0.14)'}`,
                    borderRadius: 999, cursor: 'pointer',
                    transition: 'background 0.15s, border 0.15s',
                    boxShadow: duty ? '0 0 8px #8b5cf655' : 'none',
                  }}
                >
                  <span aria-hidden style={{
                    position: 'absolute', top: 1, left: duty ? 17 : 1,
                    width: 16, height: 16, background: 'white',
                    borderRadius: '50%', boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
                    transition: 'left 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                  }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && <div style={errorText}>{error}</div>}

      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
        These can be changed any time from Practice settings → Demand.
      </div>
    </div>
  );
}

function SummaryPill({ colour, label, count }) {
  return (
    <span style={{
      padding: '4px 10px',
      background: `${colour}22`,
      border: `1px solid ${colour}66`,
      borderRadius: 999,
      color: colour,
      fontWeight: 500,
    }}>
      {count} {label}
    </span>
  );
}

function pillButton(colour) {
  return {
    padding: '5px 12px',
    fontSize: 11, fontWeight: 500,
    background: `${colour}22`,
    color: colour,
    border: `1px solid ${colour}66`,
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

function SlotCategoryPicker({ value, onChange }) {
  const options = [
    { id: 'routine', label: 'Routine', colour: '#64748b' },
    { id: 'urgent',  label: 'Urgent',  colour: '#f97316' },
    { id: 'other',   label: 'Other',   colour: '#475569' },
  ];
  return (
    <div style={{
      display: 'flex',
      background: 'rgba(0,0,0,0.25)',
      borderRadius: 6,
      padding: 2,
      gap: 2,
    }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              padding: '5px 10px',
              fontSize: 11, fontWeight: 500,
              background: active ? o.colour : 'transparent',
              color: active ? 'white' : '#94a3b8',
              border: 'none', borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Step 4: Practice sites ────────────────────────────────────────────
// Multi-site practices show appointments in different locations across
// the CSV. The dashboard uses site colours throughout (room allocation,
// Who's In legend, slot-type stacked bars) so picking colours early is
// useful — defaults are fine for single-site practices and they can
// skip this step.
//
// Storage: practice_settings.room_allocation.sites = [{ id, name, colour, gridSize, rooms }]
// The wizard only sets id/name/colour. Rooms get added later in v3
// Room Settings.
function SitesStep({ practiceId, parsedCsv, sites, setSites }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);

  // Extract unique location names from the parsed CSV. locationData
  // shape: { date: { clinIdx: { locationName: count } } }
  const csvLocations = useMemo(() => {
    const seen = new Set();
    const ld = parsedCsv?.locationData || {};
    for (const date of Object.keys(ld)) {
      for (const idx of Object.keys(ld[date] || {})) {
        for (const loc of Object.keys(ld[date][idx] || {})) {
          if (loc && loc.trim()) seen.add(loc.trim());
        }
      }
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [parsedCsv]);

  // Merge CSV locations with existing configured sites so the user
  // sees BOTH (a) what's already configured and (b) any new
  // locations the CSV mentions that aren't yet sites. New ones get
  // a default colour from the rotation.
  const displayedSites = useMemo(() => {
    const existing = new Map(sites.map(s => [s.name, s]));
    const out = [...sites];
    csvLocations.forEach((loc, i) => {
      if (!existing.has(loc)) {
        out.push({
          id: `site-${Date.now()}-${i}`,
          name: loc,
          colour: SITE_COLOUR_PRESETS[(sites.length + i) % SITE_COLOUR_PRESETS.length],
          gridSize: 'small',
          rooms: [],
        });
      }
    });
    return out;
  }, [csvLocations, sites]);

  const saveToDb = async (nextSites) => {
    setSaving(true);
    setError('');
    const { data: existing } = await supabase
      .from('practice_settings')
      .select('room_allocation')
      .eq('practice_id', practiceId)
      .maybeSingle();
    const merged = {
      ...(existing?.room_allocation || {}),
      sites: nextSites,
    };
    const { error: err } = await supabase
      .from('practice_settings')
      .upsert({ practice_id: practiceId, room_allocation: merged }, { onConflict: 'practice_id' });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSavedAt(new Date());
  };

  const updateColour = (siteId, colour) => {
    const next = displayedSites.map(s => s.id === siteId ? { ...s, colour } : s);
    setSites(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToDb(next), 500);
  };

  const removeSite = (siteId) => {
    const next = displayedSites.filter(s => s.id !== siteId);
    setSites(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToDb(next), 500);
  };

  if (!parsedCsv) {
    return <UploadFirstPrompt message="Once you've uploaded your EMIS appointment CSV, we'll detect the practice sites from appointment locations and let you pick a colour for each." />;
  }

  if (displayedSites.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={fieldHelp}>
          We didn't find any site/location entries in your CSV. Most single-site
          practices won't need to configure this. You can add sites manually later
          via the v3 Room Settings page if needed.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={fieldHelp}>
        We found <strong style={{ color: '#cbd5e1' }}>{displayedSites.length}</strong> site
        {displayedSites.length === 1 ? '' : 's'} in your CSV appointment data. Each gets a
        colour that's used consistently across the dashboard (Who's In, capacity bars, room
        allocation). Pick something distinctive for each, or skip — defaults work fine.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11, color: saving ? '#94a3b8' : (savedAt ? '#10b981' : '#64748b') }}>
          {saving ? 'Saving…' : (savedAt ? '✓ Saved' : 'Auto-saves on change')}
        </span>
      </div>

      <div style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        {displayedSites.map((site, i) => (
          <div
            key={site.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
              borderBottom: i < displayedSites.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: site.colour,
              flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.1)',
            }} />
            <div style={{ flex: 1, fontSize: 13, color: '#cbd5e1', fontWeight: 500 }}>
              {site.name}
            </div>
            <ColourPicker
              value={site.colour}
              onChange={(c) => updateColour(site.id, c)}
            />
            <button
              type="button"
              onClick={() => removeSite(site.id)}
              title="Remove this site"
              style={{
                padding: '4px 8px', fontSize: 11,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#94a3b8', borderRadius: 4,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >×</button>
          </div>
        ))}
      </div>

      {error && <div style={errorText}>{error}</div>}

      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
        Sites can also be edited later from the v3 Room Settings page (rooms, grid size, etc.).
      </div>
    </div>
  );
}

function ColourPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {SITE_COLOUR_PRESETS.map(c => {
        const active = c.toLowerCase() === (value || '').toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={c}
            style={{
              width: 22, height: 22,
              padding: 0,
              background: c,
              border: active ? '2px solid white' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'transform 0.1s',
              transform: active ? 'scale(1.08)' : 'scale(1)',
            }}
          />
        );
      })}
    </div>
  );
}


// ─── Step 5: Demand history (optional) ─────────────────────────────────
function DemandStep({ practiceId, practiceSlug, hasDemandData, setHasDemandData }) {
  const [howToOpen, setHowToOpen] = useState(null); // 'askmygp' | 'anima' | null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={fieldHelp}>
        GPDash can predict demand for any future date based on your historical patterns —
        day of week, school holidays, weather, and so on. Upload an export from{' '}
        <strong style={{ color: '#cbd5e1' }}>AskMyGP</strong> or{' '}
        <strong style={{ color: '#cbd5e1' }}>Anima</strong> to calibrate the model
        to your practice. The file format is auto-detected — drop the CSV and we'll
        figure out which one. You can skip this and add it later.
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

      {/* Per-source how-to guides — expandable so they don't overwhelm
          the page. The two tools have different export flows, so a
          single set of instructions doesn't work. */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <HowToHeader
          title="How to export from AskMyGP"
          open={howToOpen === 'askmygp'}
          onClick={() => setHowToOpen(howToOpen === 'askmygp' ? null : 'askmygp')}
        />
        {howToOpen === 'askmygp' && (
          <div style={howToBody}>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Log in to AskMyGP and open the <strong>Reports</strong> module.</li>
              <li>Choose <strong>"Crosstab — Demand data"</strong> from the list of standard reports.</li>
              <li>Pick the date range you want (12 months recommended for the best calibration).</li>
              <li>Click <strong>Export</strong> and save the CSV.</li>
              <li>Drop it onto the upload area above.</li>
            </ol>
            <p style={{ margin: '10px 0 0', color: '#94a3b8', fontSize: 12 }}>
              The file is UTF-16 tab-separated — that's normal, our parser handles it.
            </p>
          </div>
        )}
        <HowToHeader
          title="How to export from Anima"
          open={howToOpen === 'anima'}
          onClick={() => setHowToOpen(howToOpen === 'anima' ? null : 'anima')}
        />
        {howToOpen === 'anima' && (
          <div style={howToBody}>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>In Anima, go to <strong>Admin → Audit results</strong>.</li>
              <li>Filter by <strong>Event: patientReviewSubmit</strong> over the date range you want.</li>
              <li>Click <strong>Export</strong> — the file is named <span style={{ fontFamily: "'Space Mono', monospace", color: '#94a3b8' }}>ExportedAuditResults_*.csv</span>.</li>
              <li>Drop it onto the upload area above.</li>
            </ol>
            <p style={{ margin: '10px 0 0', color: '#94a3b8', fontSize: 12 }}>
              Both direct patient submissions and staff-proxy entries (receptionist phone-ins)
              count toward your demand total — same as AskMyGP.
            </p>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
        Don't have a demand CSV handy? Skip for now — you can upload it any time from the
        Demand tab on your practice settings page.
      </div>
    </div>
  );
}

// ─── Collapsible how-to row ────────────────────────────────────────────
const howToBody = {
  padding: '12px 16px 16px',
  background: 'rgba(0,0,0,0.15)',
  fontSize: 13, color: '#cbd5e1', lineHeight: 1.55,
};
function HowToHeader({ title, open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '10px 14px',
        background: open ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.02)',
        border: 'none',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        color: '#cbd5e1', fontSize: 13, fontWeight: 500,
        cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <span style={{
        display: 'inline-block', width: 10, color: '#67e8f9',
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s',
      }}>▶</span>
      {title}
    </button>
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
