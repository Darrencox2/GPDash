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
//   3. Slot types — categorise routine / urgent / duty doctor slots.
//
//   4. Clinicians — review role for each person + generate working
//      patterns from CSV. Opens the WorkingDaysGrid for review/edit.
//
//   5. Practice sites — colours per location.
//
//   6. Demand data — optional CSV upload to calibrate the model.
//
//   7. Invite your team — optional, paste comma-separated emails.
//
// On final completion: setup_completed_at gets set and the user is
// redirected to /p/<slug>.

import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import BrandHeader from '../../../_lib/BrandHeader';
import EmisReportCard from '@/components/EmisReportCard';
import DemandUpload from '@/app/v4/practice/[id]/DemandUpload';
import QuickSetupTable from '@/app/v4/practice/[id]/QuickSetupTable';
import { parseHuddleCSV } from '@/lib/huddle';
import { buildFacts } from '@/lib/workload-report';
import { guessGroupFromRole, buddyDefaultsForRole, canonicaliseRole } from '@/lib/data';

// Steps are declared up here so the progress indicator can render them
// before the content. `optional: true` means Continue can advance even
// without action; `required: true` means setup can't complete without it.
const STEPS = [
  { id: 'details',    title: 'Your practice',          subtitle: 'A few key details', required: true },
  { id: 'emis',       title: 'Appointment data',       subtitle: 'EMIS report · build your team', required: true },
  { id: 'slots',      title: 'Slot types',             subtitle: 'Routine, urgent, duty doctor', optional: true },
  { id: 'capacity',   title: 'Urgent capacity',        subtitle: 'Optional · expected urgent slots', optional: true },
  { id: 'clinicians', title: 'Your clinicians',        subtitle: 'Confirm roles + working pattern', optional: true },
  { id: 'teamnet',    title: 'TeamNet calendar',       subtitle: 'Optional · sync absences', optional: true },
  { id: 'sites',      title: 'Practice sites',         subtitle: 'Optional · assign colours', optional: true },
  { id: 'demand',     title: 'Demand history',         subtitle: 'Optional · calibrate the model', optional: true },
  { id: 'invites',    title: 'Invite your team',       subtitle: 'Optional · do later if you prefer', optional: true },
  { id: 'publicbuddy',title: 'Buddy cover EMIS link',  subtitle: 'Optional · public URL for EMIS paste', optional: true },
  { id: 'review',     title: 'Review & finish',         subtitle: 'Check what is set up, then finish' },
];

// Default colours for sites — picked from the standard practice palette
// (lib/roomAllocation.js SITE_COLOUR_PRESETS). Keeping them duplicated
// here so the wizard doesn't have to import from a v3-era module.
const SITE_COLOUR_PRESETS = [
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#84cc16',
  '#3b82f6', '#14b8a6', '#a855f7', '#eab308', '#64748b',
];

// ─── Save tracker context ─────────────────────────────────────────────
// Each step's save function calls trackSave(promise) so the global save
// indicator in the header can show "Saving…" while any save is in
// flight and "✓ Saved" briefly after the last one settles. Each step
// also keeps its own inline feedback (which is more specific —
// "Saving postcode…" etc) but the header gives an at-a-glance read so
// the user knows they can safely navigate away.
const SaveContext = createContext({ trackSave: (p) => p });

// Hook for step components. Wraps a promise (or a function returning
// one) and reports start/end to the shared tracker. Returns the
// awaited result so existing code can be wrapped with minimal change:
//   const ok = await trackSave(supabase.from(...).upsert(...));
function useTrackedSave() {
  const { trackSave } = useContext(SaveContext);
  return trackSave;
}

// ───────────────────────────────────────────────────────────────────────
export default function SetupWizard({
  practice,
  teamnetUrl: initialTeamnetUrl,
  hasClinicians: initialHasClinicians,
  hasDemandData: initialHasDemandData,
  hasInvites: initialHasInvites,
  buddyCoverPublic: initialBuddyCoverPublic = false,
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
  //
  // Always start at step 0 (Details). Onboarding should begin by confirming
  // the practice details and walking through the optional intro steps
  // (TeamNet etc.) rather than jumping ahead to the first technically-
  // incomplete step — that previously skipped people past details and the
  // TeamNet calendar when those were pre-filled at creation. Returning users
  // can jump to any step via the progress dots, and every step auto-saves,
  // so nothing is lost by starting at the beginning.
  const [currentStep, setCurrentStep] = useState(0);
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
  const [buddyCoverPublic, setBuddyCoverPublic] = useState(initialBuddyCoverPublic);
  // Tracks whether the clinicians step has been "sorted" — i.e. all
  // active clinicians have working patterns assigned. Lazy state: the
  // ClinicianRolesStep checks the DB on mount and reports back.
  const [cliniciansSorted, setCliniciansSorted] = useState(false);
  const [expectedCapacitySet, setExpectedCapacitySet] = useState(false);

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
  // ─── Welcome screen (item 7) ─────────────────────────────────────────
  // Fresh-practice intro shown before step 0 when there's clearly no
  // setup work yet (no postcode/list size set, no clinicians). Sets
  // expectations: "this is ~10 minutes; required = details + EMIS data;
  // optional steps add demand forecasting, team invites, etc." Returning
  // users who have any data skip straight past it.
  //
  // Dismissed via a single "Let's go" button. No localStorage — the
  // welcome appears once per page load, which is fine: once the user
  // has saved anything (postcode, listSize), they're not "fresh" any
  // more and won't see it again on revisit.
  const isFreshPractice = !practice.postcode && !practice.list_size && !initialHasClinicians;
  const [showWelcome, setShowWelcome] = useState(isFreshPractice);

  // ─── Global save tracker (item 4) ────────────────────────────────────
  // saveInFlightCount: number of in-flight save promises (0 = all settled)
  // lastSavedAt: timestamp of the most recent successful save, used to
  // briefly show "✓ Saved" after activity stops. Steps wrap their save
  // calls with trackSave() — the hook just maintains the counter and
  // timestamp, all UI lives in <GlobalSaveIndicator> in the top strip.
  const [saveInFlightCount, setSaveInFlightCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const trackSave = useCallback(async (promise) => {
    setSaveInFlightCount(c => c + 1);
    setSaveError(null);
    try {
      const result = await promise;
      // Treat both {error} responses (Supabase) and thrown errors as
      // failures; we want a single error UI regardless of which shape.
      if (result && typeof result === 'object' && result.error) {
        setSaveError(result.error.message || 'Save failed');
      } else {
        setLastSavedAt(new Date());
      }
      return result;
    } catch (e) {
      setSaveError(e?.message || 'Save failed');
      throw e;
    } finally {
      setSaveInFlightCount(c => c - 1);
    }
  }, []);
  const saveCtxValue = useMemo(() => ({ trackSave }), [trackSave]);

  const [autoMarkedAt, setAutoMarkedAt] = useState(autoCompleted ? new Date() : null);
  const [autoMarkInFlight, setAutoMarkInFlight] = useState(false);
  const [navigating, setNavigating] = useState(false);
  // ─── Unsaved-input warning (item 10) ─────────────────────────────────
  // dirtyRef tracks "user has typed something we haven't persisted yet".
  // Steps with debounced auto-save have a tiny window where this might
  // be true; the InvitesStep textarea is the main case (no auto-save —
  // emails only persist after Send is clicked). Browser-level navigation
  // (close tab, refresh, type new URL) triggers a confirmation prompt
  // via beforeunload; in-app router.push() doesn't fire beforeunload so
  // the wizard's own buttons remain frictionless.
  const dirtyRef = useRef(false);
  const setDirty = useCallback((d) => { dirtyRef.current = !!d; }, []);
  useEffect(() => {
    const handler = (e) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = ''; // legacy Chrome
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ─── Completion celebration (item 9) ─────────────────────────────────
  // When the user clicks "Go to dashboard", show a brief celebration
  // overlay before the route change. Just a moment to acknowledge that
  // they've finished — without it the wizard ends with a button click
  // that silently navigates, which feels anticlimactic. ~1.8s is short
  // enough not to be annoying on repeat visits but long enough to read.
  const [celebrating, setCelebrating] = useState(false);

  const goToDashboard = async () => {
    // Clear the dirty flag so beforeunload doesn't fire on the
    // router.push (though router.push doesn't actually trigger
    // beforeunload — being explicit anyway in case state's been
    // touched right before the click).
    dirtyRef.current = false;
    setCelebrating(true);
    // Brief celebration window, then navigate. We don't fight the user
    // here — if they click anywhere during the celebration, that's their
    // choice. The setTimeout fires regardless.
    setTimeout(() => {
      setNavigating(true);
      router.push(`/p/${practice.slug}`);
      router.refresh();
    }, 1800);
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
    hasClinicians,                                      // 1: emis
    slotsConfigured,                                    // 2: slots (optional)
    expectedCapacitySet,                                // 3: urgent capacity (optional)
    cliniciansSorted,                                   // 4: clinicians (optional)
    teamnetUrl.length > 0,                              // 5: teamnet (optional, tick if set)
    sitesConfigured,                                    // 6: sites (optional)
    hasDemandData,                                      // 7: demand
    hasInvites,                                         // 8: invites
    buddyCoverPublic,                                   // 9: public buddy URL
    // 10: review — "done" once the required steps (details + emis) are in,
    // i.e. the practice is genuinely ready to finish. Mirrors canComplete,
    // computed inline because canComplete is derived further down.
    (!!postcode && !!listSize) && hasClinicians,
  ];

  // ─── Live subtitle per step ──────────────────────────────────────────
  // When a step is done, show a concise summary of what's set instead
  // of the generic STEPS[i].subtitle. Helps when scrolling back
  // through completed steps — at-a-glance "TeamNet ✓ Synced" is more
  // useful than "Optional · sync absences". Falls back to the
  // hardcoded subtitle when the step isn't done yet (no useful state
  // to summarise).
  const slotCount = (
    Object.values(slotFilters.routine || {}).filter(Boolean).length +
    Object.values(slotFilters.urgent || {}).filter(Boolean).length
  );
  const dutyCount = (slotFilters.dutyDoctorSlot || []).length;
  const liveSubtitles = [
    // 0: details
    (postcode && listSize)
      ? `${postcode} · ${Number(listSize).toLocaleString()} patients${region ? ` · ${region}` : ''}`
      : STEPS[0].subtitle,
    // 1: emis (count not easily available client-side — use a generic done line)
    hasClinicians ? '✓ Team imported from CSV' : STEPS[1].subtitle,
    // 2: slots
    slotsConfigured
      ? `${slotCount} slot type${slotCount === 1 ? '' : 's'} categorised${dutyCount > 0 ? ` · duty doctor set` : ''}`
      : STEPS[2].subtitle,
    // 3: urgent capacity
    expectedCapacitySet ? '✓ Urgent capacity set' : STEPS[3].subtitle,
    // 4: clinicians (the actual count needs a fetch the step does
    //    internally; just show "✓ Reviewed" when sorted)
    cliniciansSorted ? '✓ Roles + patterns reviewed' : STEPS[4].subtitle,
    // 5: teamnet
    teamnetUrl ? '✓ Calendar URL saved' : STEPS[5].subtitle,
    // 6: sites
    sitesConfigured
      ? `${sites.length} site${sites.length === 1 ? '' : 's'} configured`
      : STEPS[6].subtitle,
    // 7: demand
    hasDemandData ? '✓ Demand model calibrated' : STEPS[7].subtitle,
    // 8: invites
    hasInvites ? '✓ Team invited' : STEPS[8].subtitle,
    // 9: public buddy URL — surfaces the practice's choice
    buddyCoverPublic ? '✓ Public URL enabled' : STEPS[9].subtitle,
    // 10: review
    STEPS[10].subtitle,
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
    <SaveContext.Provider value={saveCtxValue}>
    <div style={pageStyle}>
      {/* Subtle radial highlight behind the card to lift it off the
          gradient background. Using a fixed-position pseudo via a div
          rather than ::before so it doesn't capture clicks. */}
      <div style={glowStyle} aria-hidden />

      {/* ─── Welcome overlay ──────────────────────────────────────────
          Shown for fresh practices only (no postcode, no list size,
          no clinicians yet). Sets expectations before the user hits
          the form. Single "Let's go" button dismisses it. */}
      {showWelcome && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'radial-gradient(ellipse at center, rgba(8,145,178,0.16) 0%, rgba(8,12,22,0.97) 70%)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
          animation: 'wizardCelebrateFade 0.4s ease-out',
          overflowY: 'auto',
        }}>
          <div style={{
            maxWidth: 560,
            background: 'rgba(15,23,42,0.85)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--r-lg)',
            padding: '36px 40px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6)',
            animation: 'wizardCelebratePop 0.5s cubic-bezier(0.34, 1.4, 0.6, 1)',
          }}>
            <div style={{
              fontSize: 11, color: '#0891b2', letterSpacing: 2,
              textTransform: 'uppercase', fontWeight: 600, marginBottom: 14,
            }}>
              Welcome to GPDash
            </div>
            <h1 style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 30, fontWeight: 600, color: 'white',
              lineHeight: 1.2, marginBottom: 14,
            }}>
              Let's set up <strong style={{ color: '#67e8f9' }}>{practice.name || 'your practice'}</strong>
            </h1>
            <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 20 }}>
              Eight short steps, about ten minutes. You can leave at any time —
              everything saves as you go. Required steps unlock the dashboard;
              optional steps add forecasting, team invites, and richer detail you
              can also configure later.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24,
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 'var(--r-md)',
            }}>
              <div>
                <div style={{ fontSize: 10, color: '#fbbf24', letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>
                  REQUIRED
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#cbd5e1', lineHeight: 1.7 }}>
                  <li>Practice details</li>
                  <li>EMIS appointment CSV</li>
                </ul>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#64748b', letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>
                  OPTIONAL (DO LATER IF YOU PREFER)
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
                  <li>TeamNet sync · slot types · clinicians</li>
                  <li>Sites · demand history · team invites</li>
                </ul>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowWelcome(false)}
                style={{
                  ...btnPrimary,
                  padding: '12px 24px',
                  fontSize: 14,
                  background: '#0891b2',
                }}
              >
                Let's go →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top strip: brand left, step counter + save indicator right */}
      <div style={topStripStyle}>
        <BrandHeader />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <GlobalSaveIndicator
            inFlight={saveInFlightCount > 0}
            lastSavedAt={lastSavedAt}
            error={saveError}
          />
          <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>
            Step {currentStep + 1} of {STEPS.length}
          </div>
        </div>
      </div>

      {/* Progress indicator: connected dots */}
      <ProgressDots
        steps={STEPS}
        currentStep={currentStep}
        stepDone={stepDone}
        onStepClick={goToStep}
      />

      {/* "Setup is saved — leave anytime" banner.
          Once setup_completed_at has been auto-marked (canComplete
          first became true), the user can leave to the dashboard
          without losing anything. The "Go to dashboard" button only
          appears on the final step, so without this hint the user
          might think they need to finish every step. Banner appears
          on every step except the final one (which has the dashboard
          button right there). */}
      {canComplete && currentStep < STEPS.length - 1 && (
        <div style={{
          maxWidth: 860, margin: '0 auto 16px',
          padding: '10px 16px',
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 'var(--r-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 13, color: '#a7f3d0', lineHeight: 1.4 }}>
            <strong style={{ color: '#6ee7b7' }}>✓ Setup saved.</strong> You can leave
            to the dashboard anytime — the optional steps below are nice-to-haves
            you can come back to later.
          </div>
          <button
            onClick={goToDashboard}
            disabled={navigating}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--r-sm)',
              background: 'rgba(16,185,129,0.2)',
              border: '1px solid rgba(16,185,129,0.4)',
              color: '#6ee7b7',
              fontSize: 12, fontWeight: 600,
              cursor: navigating ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {navigating ? 'Loading…' : 'Go to dashboard →'}
          </button>
        </div>
      )}

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
            <StepHeader step={STEPS[currentStep]} index={currentStep} done={stepDone[currentStep]} liveSubtitle={liveSubtitles[currentStep]} />
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
                <EmisStep
                  practiceId={practice.id}
                  hasClinicians={hasClinicians}
                  setHasClinicians={setHasClinicians}
                  setClinicianCountAdded={setClinicianCountAdded}
                  clinicianCountAdded={clinicianCountAdded}
                  setParsedCsv={setParsedCsv}
                />
              )}
              {currentStep === 2 && (
                <SlotTypesStep
                  practiceId={practice.id}
                  parsedCsv={parsedCsv}
                  slotFilters={slotFilters}
                  setSlotFilters={setSlotFilters}
                />
              )}
              {currentStep === 3 && (
                <CapacityStep
                  practiceId={practice.id}
                  parsedCsv={parsedCsv}
                  slotFilters={slotFilters}
                  onSetChange={setExpectedCapacitySet}
                  onContinue={goNext}
                />
              )}
              {currentStep === 4 && (
                <ClinicianRolesStep
                  practiceId={practice.id}
                  onSortedChange={setCliniciansSorted}
                />
              )}
              {currentStep === 5 && (
                <TeamNetStep
                  practiceId={practice.id}
                  teamnetUrl={teamnetUrl}
                  setTeamnetUrl={setTeamnetUrl}
                />
              )}
              {currentStep === 6 && (
                <SitesStep
                  practiceId={practice.id}
                  parsedCsv={parsedCsv}
                  sites={sites}
                  setSites={setSites}
                />
              )}
              {currentStep === 7 && (
                <DemandStep
                  practiceId={practice.id}
                  practiceSlug={practice.slug}
                  hasDemandData={hasDemandData}
                  setHasDemandData={setHasDemandData}
                  onContinue={goNext}
                />
              )}
              {currentStep === 8 && (
                <InvitesStep
                  practiceId={practice.id}
                  hasInvites={hasInvites}
                  setHasInvites={setHasInvites}
                  setDirty={setDirty}
                />
              )}
              {currentStep === 9 && (
                <PublicBuddyStep
                  practiceId={practice.id}
                  practiceSlug={practice.slug}
                  buddyCoverPublic={buddyCoverPublic}
                  setBuddyCoverPublic={setBuddyCoverPublic}
                />
              )}
              {currentStep === 10 && (
                <ReviewStep
                  steps={STEPS}
                  stepDone={stepDone}
                  canComplete={canComplete}
                  requiredIncomplete={requiredIncomplete}
                  goToStep={goToStep}
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
          borderRadius: 'var(--r-md)',
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
        <div style={{ maxWidth: 720, margin: '12px auto 0', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-sm)', color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>
          {globalError}
        </div>
      )}

      <div style={{ maxWidth: 720, margin: '32px auto 0', textAlign: 'center', fontSize: 11, color: '#475569' }}>
        Your changes save automatically. You can leave and come back any time.
      </div>

      {/* ─── Completion celebration overlay ─────────────────────────
          Fires when goToDashboard is clicked. Sits above everything
          and fades in over the page. The checkmark pops in, then the
          message lifts up, then we navigate. ~1.8s total to feel
          deliberate without being slow. */}
      {celebrating && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.18) 0%, rgba(8,12,22,0.97) 60%)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'wizardCelebrateFade 0.35s ease-out',
        }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: '#10b981',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
            boxShadow: '0 0 0 8px rgba(16,185,129,0.15), 0 12px 40px -8px rgba(16,185,129,0.5)',
            animation: 'wizardCelebratePop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 12 10 18 20 6" />
            </svg>
          </div>
          <div style={{
            fontSize: 32, fontWeight: 600, color: 'white',
            fontFamily: "'Outfit', sans-serif", marginBottom: 8,
            animation: 'wizardCelebrateLift 0.5s ease-out 0.25s both',
            textAlign: 'center', padding: '0 24px',
          }}>
            You're all set up!
          </div>
          <div style={{
            fontSize: 14, color: '#94a3b8',
            animation: 'wizardCelebrateLift 0.5s ease-out 0.4s both',
            textAlign: 'center', padding: '0 24px',
          }}>
            Taking you to your dashboard…
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes wizardSlideIn {
          from { transform: translateX(28px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes wizardPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(8,145,178,0.5); }
          50%      { box-shadow: 0 0 0 8px rgba(8,145,178,0); }
        }
        @keyframes wizardCelebrateFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes wizardCelebratePop {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes wizardCelebrateLift {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
    </SaveContext.Provider>
  );
}

// Global save indicator that lives in the top strip. Three visual
// states driven by props from the wizard's shared save tracker:
//   - inFlight: at least one save promise pending → "Saving…" with
//     a small pulsing dot
//   - error: most recent save errored → red "Save error" with the
//     specific message in a title tooltip
//   - lastSavedAt within last 4s: brief "✓ Saved" confirmation
//   - otherwise: nothing (no chatter when there's nothing to report)
function GlobalSaveIndicator({ inFlight, lastSavedAt, error }) {
  const [showRecent, setShowRecent] = useState(false);
  useEffect(() => {
    if (!lastSavedAt) return;
    setShowRecent(true);
    const t = setTimeout(() => setShowRecent(false), 4000);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  // Don't show "✓ Saved" while a new save is in flight — the saving
  // indicator wins; otherwise the UI flickers between Saved/Saving on
  // rapid edits.
  const showSaved = showRecent && !inFlight && !error;

  if (!inFlight && !showSaved && !error) return null;

  let bg, border, color, text;
  if (inFlight) {
    bg = 'rgba(8,145,178,0.12)';
    border = 'rgba(8,145,178,0.35)';
    color = '#67e8f9';
    text = 'Saving…';
  } else if (error) {
    bg = 'rgba(239,68,68,0.10)';
    border = 'rgba(239,68,68,0.35)';
    color = '#fca5a5';
    text = 'Save error';
  } else {
    bg = 'rgba(16,185,129,0.10)';
    border = 'rgba(16,185,129,0.35)';
    color = '#6ee7b7';
    text = '✓ Saved';
  }

  return (
    <div
      title={error || (inFlight ? 'A save is in progress' : 'All changes saved')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--r-pill)',
        fontSize: 11,
        fontWeight: 600,
        color,
        letterSpacing: 0.3,
        transition: 'all 0.15s',
      }}
    >
      {inFlight && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: color,
          animation: 'wizardPulse 1.4s infinite',
        }} />
      )}
      {text}
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
  maxWidth: 860, margin: '0 auto',
  position: 'relative', zIndex: 1,
};
const cardAnimWrapperStyle = {
  animation: 'wizardSlideIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
};
const cardStyle = {
  background: 'rgba(15,23,42,0.7)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 'var(--r-lg)',
  padding: '36px 40px',
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(8px)',
};
const footerStyle = {
  maxWidth: 860, margin: '24px auto 0',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  position: 'relative', zIndex: 1,
};
const btnPrimary = { padding: '11px 20px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 'var(--r-md)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' };
const btnSubtle = { padding: '11px 16px', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--r-md)', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' };
const btnGhost = { padding: '11px 16px', background: 'transparent', color: '#94a3b8', border: 'none', borderRadius: 'var(--r-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };

// Step icons — one SVG per step id. Replaces the bare step number on
// the progress dots so the 8 dots are visually distinguishable at a
// glance. Lucide-style strokes for visual consistency with the rest
// of the app's icon usage. Each is sized to fit the 32×32 dot button.
function StepIcon({ stepId }) {
  const props = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (stepId) {
    case 'details':    // building / home
      return <svg {...props}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h1" /><path d="M14 9h1" /><path d="M9 13h1" /><path d="M14 13h1" /><path d="M9 21v-4h6v4" /></svg>;
    case 'teamnet':    // calendar
      return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>;
    case 'emis':       // upload
      return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
    case 'slots':      // clock
      return <svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case 'clinicians': // users
      return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'sites':      // map pin
      return <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
    case 'demand':     // chart line
      return <svg {...props}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>;
    case 'invites':    // mail
      return <svg {...props}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>;
    default:
      return null;
  }
}

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
              title={`${step.title}${step.optional ? ' (optional)' : step.required ? ' (required)' : ''}${isDone ? ' · ✓ Done' : ''}`}
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
              {isDone ? <CheckIcon /> : <StepIcon stepId={step.id} />}
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
function StepHeader({ step, index, done, liveSubtitle }) {
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
            borderRadius: 'var(--r-sm)',
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
            borderRadius: 'var(--r-sm)',
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
        {liveSubtitle || step.subtitle}
      </p>
    </div>
  );
}

// ─── Step 1: Practice details ──────────────────────────────────────────
function DetailsStep({ practiceId, practiceOdsCode, postcode, setPostcode, listSize, setListSize, region, setRegion }) {
  const supabase = createClient();
  const trackSave = useTrackedSave();
  const [savingField, setSavingField] = useState('');
  const [error, setError] = useState('');
  const lookupTimer = useRef(null);

  // Save a field with optimistic UI. Errors revert by surfacing the
  // error message; we don't try to undo the local state change since
  // that's more confusing than a visible warning + retry.
  const saveField = async (column, value) => {
    setSavingField(column);
    setError('');
    const result = await trackSave(
      supabase
        .from('practices')
        .update({ [column]: value || null })
        .eq('id', practiceId)
    );
    setSavingField('');
    if (result?.error) setError(result.error.message);
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
        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--r-md)', fontSize: 12, color: '#94a3b8' }}>
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
  const trackSave = useTrackedSave();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');
  const [showHowTo, setShowHowTo] = useState(false);
  // Sync state — pressing "Sync now" hits the same /api/v4/sync-teamnet
  // endpoint the standalone editor on the practice management page uses.
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const saveTimer = useRef(null);
  // Tracks the last value we successfully persisted, so the onBlur save
  // doesn't re-write/re-sync an unchanged URL.
  const savedUrlRef = useRef(teamnetUrl);

  // Refetch the URL on mount. The wizard's initial prop is captured at
  // server-render time, but the URL can change between visits (e.g. user
  // sets it via the Practice → Resources tab, then revisits the wizard).
  // Without this refetch the field would show blank on return even though
  // a URL is saved in the DB. Same pattern as WorkingDaysGrid's mount
  // refetch fix from v4.18.0.
  //
  // Guard: only refetch when the current state is empty. If the user has
  // already started typing, we don't want to clobber their input with
  // whatever's in the DB.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (teamnetUrl) return; // Don't clobber user input
      const { data } = await supabase
        .from('practice_settings')
        .select('teamnet_url')
        .eq('practice_id', practiceId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.teamnet_url && data.teamnet_url !== teamnetUrl) {
        setTeamnetUrl(data.teamnet_url);
        savedUrlRef.current = data.teamnet_url;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // ─── URL validation ──────────────────────────────────────────────────
  // Quick regex sanity check on the URL format before we bother saving
  // and trying to sync. Three states:
  //   bad-protocol  — empty/non-https; sync would 404 immediately
  //   unusual-host  — https but doesn't mention teamnet/clarity/diary
  //                   (could still work — TeamNet URLs vary — but worth a
  //                   heads-up about typos)
  //   looks-good    — passes both checks; auto-sync once saved
  const urlState = useMemo(() => {
    const v = (teamnetUrl || '').trim();
    if (!v) return null;
    if (!/^https:\/\//i.test(v)) return { kind: 'bad-protocol', text: 'URL should start with https://' };
    if (!/teamnet|clarity\.co\.uk|diary|ics|webcal/i.test(v)) {
      return { kind: 'unusual-host', text: "Doesn't look like a TeamNet URL — double check?" };
    }
    return { kind: 'looks-good' };
  }, [teamnetUrl]);

  // TeamNet URL lives on practice_settings (one row per practice). Upsert
  // because a brand-new practice might not have the settings row yet.
  const save = async (url) => {
    setSaving(true);
    setError('');
    const result = await trackSave(
      supabase
        .from('practice_settings')
        .upsert({ practice_id: practiceId, teamnet_url: url || null }, { onConflict: 'practice_id' })
    );
    setSaving(false);
    if (result?.error) {
      setError(result.error.message);
      return false;
    }
    setSavedAt(new Date());
    savedUrlRef.current = url || '';
    return true;
  };

  const onChange = (v) => {
    setTeamnetUrl(v);
    setSavedAt(null);     // re-edit clears the "Saved" indicator
    setSyncStatus(null);  // ...and the previous sync result
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await save(v);
      // Auto-fire a sync after save if URL looks plausible. This is the
      // "live test" — confirms the URL is reachable + the calendar
      // parses, without the user having to click Sync now manually. We
      // only auto-fire on https URLs (skip the bad-protocol case where
      // it's guaranteed to fail).
      if (ok && v && /^https:\/\//i.test(v)) {
        syncNow();
      }
    }, 600);
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
      if ((json.imported || 0) === 0) {
        // Explain the zero rather than just reporting it.
        const ev = json.eventsParsed ?? null;
        const cl = json.cliniciansConsidered ?? null;
        let why = '';
        if (ev === 0) why = ' The calendar feed returned no events — the URL may be wrong or expired.';
        else if (cl === 0) why = ' No clinicians are loaded yet — import your team first.';
        else why = ` ${ev} calendar event${ev === 1 ? '' : 's'} found but none matched a clinician name.`;
        setSyncStatus({ ok: false, text: `Synced, but imported 0 absences.${why}` });
      } else {
        setSyncStatus({
          ok: true,
          text: `Synced — imported ${json.imported} absence${json.imported === 1 ? '' : 's'}`,
        });
      }
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
          onBlur={() => {
            // Persist immediately on blur (e.g. clicking Continue) so the
            // URL is never lost to the debounce window if the user moves on
            // within 600ms of pasting it.
            if (saveTimer.current) clearTimeout(saveTimer.current);
            if (teamnetUrl && teamnetUrl !== savedUrlRef.current) save(teamnetUrl);
          }}
          placeholder="https://teamnet.clarity.co.uk/Diary/Sync/..."
          style={{
            ...inputStyle,
            borderColor: urlState?.kind === 'bad-protocol' ? 'rgba(239,68,68,0.4)'
              : urlState?.kind === 'unusual-host' ? 'rgba(251,191,36,0.4)'
              : urlState?.kind === 'looks-good' ? 'rgba(16,185,129,0.4)'
              : inputStyle.border,
          }}
        />
        <div style={{
          marginTop: 6,
          fontSize: 11,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          color: '#64748b',
        }}>
          {/* Format check — shown as soon as the user types anything */}
          {urlState && (
            <span style={{
              color: urlState.kind === 'looks-good' ? '#10b981'
                : urlState.kind === 'unusual-host' ? '#fbbf24'
                : '#fca5a5',
            }}>
              {urlState.kind === 'looks-good' ? '✓ Format looks right'
                : urlState.kind === 'unusual-host' ? `⚠ ${urlState.text}`
                : `✗ ${urlState.text}`}
            </span>
          )}
          {/* Save state — separate from format check so the user sees both */}
          <span style={{
            color: saving ? '#94a3b8' : (savedAt ? '#10b981' : '#64748b'),
          }}>
            {saving ? 'Saving…' : (savedAt ? '· ✓ Saved' : (urlState ? '· Auto-saves' : 'Auto-saves as you type'))}
          </span>
          {/* Sync state — shown after the auto-sync fires post-save */}
          {syncing && (
            <span style={{ color: '#94a3b8' }}>· Testing URL…</span>
          )}
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
            borderRadius: 'var(--r-md)',
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
          borderRadius: 'var(--r-md)',
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
          borderRadius: 'var(--r-md)',
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
  // Summary panel: structured replacement for the old success string.
  // null when nothing's been uploaded this session; populated after a
  // successful parse with counts the user actually cares about.
  // Shape: { clinicians, locations, dates, patternsGenerated,
  //          patternsAlreadyExisted, totalClinicians }
  const [summary, setSummary] = useState(null);

  // Clinician extraction logic — same TITLE_LIKE rule we use elsewhere
  // so a CSV name like "Smith, Jane (Mrs)" doesn't store "Mrs" as the
  // role. Title-like parens are dropped; the user picks a real role
  // later via the Clinicians tab.
  const TITLE_LIKE = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'doctor', 'prof', 'professor', 'rev', 'reverend', 'sir', 'dame', 'lord', 'lady']);

  const handleFile = async (file) => {
    setError('');
    setSummary(null);
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = parseHuddleCSV(text);
      const csvNames = parsed.clinicians || [];
      if (csvNames.length === 0) {
        throw new Error("Couldn't find any clinicians in that CSV. Is it the EMIS appointment-data export?");
      }

      // Count unique site/location names across the parsed data. The
      // locationData shape is { date: { clinIdx: { locationName: count } } },
      // so walk all three levels and collect distinct location strings.
      // Used in the post-upload summary so the user knows whether the
      // upcoming Sites step has anything to configure.
      const uniqueLocations = new Set();
      for (const dateMap of Object.values(parsed.locationData || {})) {
        for (const clinMap of Object.values(dateMap || {})) {
          for (const loc of Object.keys(clinMap || {})) {
            if (loc && loc.trim()) uniqueLocations.add(loc.trim());
          }
        }
      }
      const dateCount = Object.keys(parsed.dateData || {}).length;

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
        // Canonicalise: maps "PracticeNurse" → "Practice Nurse", drops
        // titles (Dr, Mrs) and junk (Unknow) to no-role, keeps genuine
        // custom roles. (In this EMIS export the parenthetical is the
        // title, so most resolve to no role and the user assigns it.)
        const role = canonicaliseRole(rawRole);
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
      setSummary({
        clinicians: newClinicians.length,
        locations: uniqueLocations.size,
        dates: dateCount,
        // Pattern counts populated below if the auto-gen runs
        patternsGenerated: 0,
        patternsAlreadyExisted: 0,
        totalClinicians: newClinicians.length,
      });

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
                setSummary(prev => prev ? {
                  ...prev,
                  patternsGenerated: patterns.length,
                  patternsAlreadyExisted: alreadyHasPattern.size,
                  totalClinicians: savedClinicians.length,
                } : prev);
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
        borderRadius: 'var(--r-md)',
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
        borderRadius: 'var(--r-md)',
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
            borderRadius: 'var(--r-md)',
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
            borderRadius: 'var(--r-md)',
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
        {summary && (
          <div style={{
            marginTop: 14,
            padding: 14,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 'var(--r-md)',
          }}>
            <div style={{
              fontSize: 12, color: '#10b981', fontWeight: 700,
              letterSpacing: 1, marginBottom: 10,
            }}>
              ✓ IMPORT COMPLETE
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              marginBottom: summary.patternsGenerated > 0 || summary.patternsAlreadyExisted > 0 ? 10 : 0,
            }}>
              <SummaryStat label="Clinicians" value={summary.clinicians} />
              <SummaryStat label={summary.locations === 1 ? 'Site detected' : 'Sites detected'} value={summary.locations} />
              {summary.dates > 0 && <SummaryStat label="Dates covered" value={summary.dates} />}
            </div>
            {(summary.patternsGenerated > 0 || summary.patternsAlreadyExisted > 0) && (
              <div style={{ fontSize: 12, color: '#a7f3d0', lineHeight: 1.5 }}>
                {summary.patternsGenerated > 0 && (
                  <>Working patterns generated for <strong>{summary.patternsGenerated}</strong> of <strong>{summary.totalClinicians}</strong>{summary.patternsAlreadyExisted > 0 && <> ({summary.patternsAlreadyExisted} already had one)</>}. Review them in step 5.</>
                )}
                {summary.patternsGenerated === 0 && summary.patternsAlreadyExisted > 0 && (
                  <>All <strong>{summary.patternsAlreadyExisted}</strong> existing patterns kept — review or edit in step 5.</>
                )}
              </div>
            )}
            {summary.locations > 1 && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8 }}>
                Multiple sites detected — step 6 lets you pick a colour for each.
              </div>
            )}
          </div>
        )}
        {error && <div style={errorText}>{error}</div>}
      </div>
    </div>
  );
}

// ─── Step 3 (slots) + Step 5 (sites) — shared helpers ─────────────────
// Both steps need the parsed CSV in hand. If the user lands here without
// uploading first, render an "upload-first" placeholder rather than an
// empty grid that looks broken.
function UploadFirstPrompt({ message }) {
  return (
    <div style={{
      padding: 24,
      background: 'rgba(245,158,11,0.06)',
      border: '1px solid rgba(245,158,11,0.2)',
      borderRadius: 'var(--r-md)',
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
// Heuristic categorisation for a slot name. Two layers:
//   - suggestSlotCategory returns the raw 'routine' | 'urgent' | null
//     for places that just need a category guess.
//   - suggestSlotCategoryWithConfidence returns { category, confidence }
//     where confidence is 'high' | 'medium', driven by HOW unambiguous
//     the match is. "Urgent" is high-confidence urgent; "Book" is
//     medium-confidence routine (could be either depending on practice
//     conventions). Used in v4.22.3 to drive visual confidence badges
//     in the wizard so users know which auto-fills to double-check.
function suggestSlotCategoryWithConfidence(name) {
  const n = (name || '').toLowerCase();
  // HIGH-confidence urgent — distinctive keywords with little ambiguity.
  // Note: "triage" and "call back" are deliberately NOT treated as urgent —
  // they are usually administrative/triage contacts rather than bookable
  // urgent appointments, so they default to "other" (uncategorised) and the
  // practice can opt them in manually if they really use them as urgent.
  if (/\bsame[\s-]?day\b/.test(n) || /\burgent\b/.test(n) || /\bontd\b/.test(n)
      || /\bon[\s-]?the[\s-]?day\b/.test(n) || /\bacute\b/.test(n)
      || /\bemergency\b/.test(n)) {
    return { category: 'urgent', confidence: 'high' };
  }
  // HIGH-confidence routine — explicit "routine" or "pre-book"
  if (/\broutine\b/.test(n) || /\bpre[\s-]?book\b/.test(n)) {
    return { category: 'routine', confidence: 'high' };
  }
  // MEDIUM-confidence routine — ambiguous "book"/"appt"/"f2f" markers
  // that ALMOST always mean routine in practice but could conceivably
  // be tagged on a same-day slot too
  if (/\bbook\b/.test(n) || /\bappt\b/.test(n) || /\bappointment\b/.test(n)
      || /\bf2f\b/.test(n) || /\bface[\s-]?to[\s-]?face\b/.test(n)) {
    return { category: 'routine', confidence: 'medium' };
  }
  return null;
}

function suggestSlotCategory(name) {
  const r = suggestSlotCategoryWithConfidence(name);
  return r ? r.category : null;
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
// Compute average urgent OFFERED slots per weekday + session from the
// uploaded appointment CSV, using the urgent slot types the user just
// categorised. Returns { Monday: { am, pm }, ... } — a sensible starting
// point for expected urgent capacity that the practice can then tweak.
function computeExpectedUrgentFromCsv(parsedCsv, slotFilters) {
  if (!parsedCsv) return {};
  const hs = { savedSlotFilters: { urgent: slotFilters?.urgent || {}, routine: slotFilters?.routine || {} } };
  let facts = [];
  try { facts = buildFacts(parsedCsv, [], hs).facts || []; } catch { return {}; }
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const perDate = {};
  for (const f of facts) {
    if (f.category !== 'urgent') continue;
    const k = `${f.iso}|${f.session}`;
    if (!perDate[k]) perDate[k] = { dow: f.dow, urgent: 0 };
    perDate[k].urgent += (f.count || 0);
  }
  const agg = {};
  for (const k in perDate) {
    const { dow, urgent } = perDate[k];
    const session = k.split('|')[1];
    if (dow < 1 || dow > 5) continue;
    agg[dow] = agg[dow] || { am: { sum: 0, n: 0 }, pm: { sum: 0, n: 0 } };
    agg[dow][session].sum += urgent;
    agg[dow][session].n += 1;
  }
  const out = {};
  for (let dow = 1; dow <= 5; dow++) {
    const a = agg[dow];
    if (!a) continue;
    out[DAY_NAMES[dow]] = {
      am: a.am.n ? Math.round(a.am.sum / a.am.n) : 0,
      pm: a.pm.n ? Math.round(a.pm.sum / a.pm.n) : 0,
    };
  }
  return out;
}

// ─── Step 4: Expected urgent capacity ──────────────────────────────────
// Its own step (was previously tucked under slot types). Lets the practice
// set how many urgent slots they aim to offer per session — autofilled from
// their appointment data, entered by hand, or skipped.
function CapacityStep({ practiceId, parsedCsv, slotFilters, onSetChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={fieldHelp}>
        Set your <strong style={{ color: '#fdba74' }}>expected urgent capacity</strong> — the number of
        urgent (same-day) slots you aim to offer each morning and afternoon. The Today gauge and
        Capacity Planning use this to show whether a given day is over or under target. You can
        autofill a starting point from your appointment data, enter it by hand, or skip and set it
        later from Practice settings → Demand.
      </p>
      <UrgentCapacitySection
        practiceId={practiceId}
        parsedCsv={parsedCsv}
        slotFilters={slotFilters}
        onSet={onSetChange}
      />
    </div>
  );
}

// Optional expected-urgent-capacity controls. Self-contained: reads + writes
// huddle_settings.expectedCapacity itself. Three paths — autofill from the
// appointment data, enter manually, or skip for now.
function UrgentCapacitySection({ practiceId, parsedCsv, slotFilters, onSet }) {
  const supabase = createClient();
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const [expected, setExpected] = useState(null);
  const [mode, setMode] = useState('closed');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const { data } = await supabase.from('practice_settings').select('huddle_settings').eq('practice_id', practiceId).maybeSingle();
      const ec = data?.huddle_settings?.expectedCapacity;
      if (ec && Object.keys(ec).length > 0) { setExpected(ec); setMode('set'); onSet?.(true); }
    })();
  }, [practiceId, supabase, onSet]);

  const persist = async (ec) => {
    setSaving(true);
    const { data: existing } = await supabase.from('practice_settings').select('huddle_settings').eq('practice_id', practiceId).maybeSingle();
    const merged = { ...(existing?.huddle_settings || {}), expectedCapacity: ec };
    await supabase.from('practice_settings').upsert({ practice_id: practiceId, huddle_settings: merged }, { onConflict: 'practice_id' });
    setSaving(false);
    setSavedAt(new Date());
    onSet?.(true);
  };

  const autofill = () => {
    const computed = computeExpectedUrgentFromCsv(parsedCsv, slotFilters);
    const filled = {};
    for (const d of DAYS) filled[d] = { am: computed[d]?.am ?? 0, pm: computed[d]?.pm ?? 0 };
    setExpected(filled);
    setMode('set');
    persist(filled);
  };
  const startManual = () => {
    const blank = {};
    for (const d of DAYS) blank[d] = { am: expected?.[d]?.am ?? '', pm: expected?.[d]?.pm ?? '' };
    setExpected(blank);
    setMode('manual');
  };
  const updateCell = (day, session, value) => {
    setExpected(prev => {
      const next = { ...(prev || {}) };
      next[day] = { ...(next[day] || {}), [session]: value === '' ? '' : (parseInt(value) || 0) };
      return next;
    });
  };
  const saveManual = () => {
    const clean = {};
    for (const d of DAYS) clean[d] = { am: parseInt(expected?.[d]?.am) || 0, pm: parseInt(expected?.[d]?.pm) || 0 };
    setExpected(clean);
    setMode('set');
    persist(clean);
  };

  const hasUrgent = slotFilters?.urgent && Object.values(slotFilters.urgent).some(Boolean);

  return (
    <div style={{ padding: 16, background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 'var(--r-md)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#fdba74', marginBottom: 4 }}>Expected urgent capacity (optional)</div>
      <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.55, margin: '0 0 12px' }}>
        How many urgent slots you aim to offer per session. Used by Capacity Planning and as a
        fallback for the Today gauge. You can autofill a starting point from your appointment data,
        set it by hand, or skip and do it later from the Demand tab.
      </p>

      {mode === 'closed' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={autofill} disabled={!hasUrgent} title={hasUrgent ? '' : 'Mark at least one slot type as Urgent above first'} style={{ ...pillButton('#f97316'), opacity: hasUrgent ? 1 : 0.4, cursor: hasUrgent ? 'pointer' : 'not-allowed' }}>
            ✨ Autofill from my data
          </button>
          <button type="button" onClick={startManual} style={pillButton('#6366f1')}>Enter manually</button>
          <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>or skip — it is optional</span>
        </div>
      )}

      {(mode === 'manual' || mode === 'set') && expected && (
        <div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }} />
                  {DAYS.map(d => <th key={d} style={{ textAlign: 'center', padding: '6px 4px', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>{d.slice(0, 3)}</th>)}
                </tr>
              </thead>
              <tbody>
                {['am', 'pm'].map(session => (
                  <tr key={session} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 4px', fontSize: 13, fontWeight: 500, color: session === 'am' ? '#fbbf24' : '#60a5fa' }}>{session === 'am' ? 'Morning' : 'Afternoon'}</td>
                    {DAYS.map(d => (
                      <td key={d} style={{ textAlign: 'center', padding: '4px' }}>
                        {mode === 'manual' ? (
                          <input type="number" min={0} max={999} value={expected[d]?.[session] ?? ''} onChange={e => updateCell(d, session, e.target.value)} placeholder="–"
                            style={{ width: 56, padding: '6px 4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--r-sm)', color: '#e2e8f0', fontSize: 13, textAlign: 'center', fontFamily: "'Space Mono', monospace" }} />
                        ) : (
                          <span style={{ fontFamily: "'Space Mono', monospace", color: '#e2e8f0' }}>{expected[d]?.[session] ?? 0}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {mode === 'manual'
              ? <button type="button" onClick={saveManual} style={{ ...pillButton('#10b981'), background: '#10b981', color: '#06281e', borderColor: '#10b981' }}>{saving ? 'Saving…' : 'Save targets'}</button>
              : <>
                  <button type="button" onClick={startManual} style={pillButton('#6366f1')}>Edit</button>
                  <button type="button" onClick={autofill} disabled={!hasUrgent} style={{ ...pillButton('#f97316'), opacity: hasUrgent ? 1 : 0.4, cursor: hasUrgent ? 'pointer' : 'not-allowed' }}>Re-autofill</button>
                </>}
            <span style={{ fontSize: 11, color: savedAt ? '#10b981' : '#64748b' }}>{saving ? 'Saving…' : (savedAt ? '✓ Saved' : '')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotTypesStep({ practiceId, parsedCsv, slotFilters, setSlotFilters }) {
  const supabase = createClient();
  const trackSave = useTrackedSave();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);
  // Set of slot names the user has explicitly clicked. Slots NOT in this
  // set whose current category matches a suggestion are visually marked
  // as "auto-filled" — once the user interacts with them (clicks the
  // picker or duty toggle), they're treated as confirmed and the
  // "Suggested" badge goes away.
  const [userTouched, setUserTouched] = useState(() => new Set());
  // Latch so the auto-apply effect fires exactly once per mount even if
  // slotFilters changes in the meantime.
  const autoAppliedRef = useRef(false);

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
    const result = await trackSave(
      supabase
        .from('practice_settings')
        .upsert({ practice_id: practiceId, huddle_settings: merged }, { onConflict: 'practice_id' })
    );
    setSaving(false);
    if (result?.error) {
      setError(result.error.message);
      return;
    }
    setSavedAt(new Date());
  };

  const debouncedSave = (next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToDb(next), 500);
  };

  // ─── Auto-apply suggestions on first mount ───────────────────────────
  // If the user lands on this step for a brand-new practice (no slot
  // filters saved yet, no duty doctor flags), pre-fill the categories
  // using the heuristic suggestions. The user then confirms or
  // overrides — much faster than picking each slot from scratch.
  //
  // Only fires when the filters are completely empty; if there's any
  // existing classification the user has already reviewed the step and
  // we don't want to clobber their decisions. Latch via
  // autoAppliedRef so it runs at most once per mount.
  useEffect(() => {
    if (autoAppliedRef.current) return;
    if (!slotTypes || slotTypes.length === 0) return;
    const hasAnyClassification = (
      Object.values(slotFilters.routine || {}).some(Boolean)
      || Object.values(slotFilters.urgent || {}).some(Boolean)
      || (slotFilters.dutyDoctorSlot || []).length > 0
    );
    if (hasAnyClassification) {
      autoAppliedRef.current = true;
      return; // existing user-saved data; don't overwrite
    }
    // Build a fresh classification from suggestions
    const nextRoutine = {};
    const nextUrgent = {};
    const nextDuty = [];
    let appliedAny = false;
    for (const slot of slotTypes) {
      const sug = suggestSlotCategoryWithConfidence(slot);
      if (sug?.category === 'routine') {
        nextRoutine[slot] = true;
        appliedAny = true;
      } else if (sug?.category === 'urgent') {
        nextUrgent[slot] = true;
        appliedAny = true;
      }
    }
    if (!appliedAny) {
      autoAppliedRef.current = true;
      return;
    }
    const next = {
      routine: nextRoutine,
      urgent: nextUrgent,
      dutyDoctorSlot: nextDuty,
    };
    setSlotFilters(next);
    debouncedSave(next);
    autoAppliedRef.current = true;
    // ESLint: intentionally only depend on slotTypes — we don't want to
    // re-run if the user edits filters after first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotTypes]);

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
    // Explicit user pick → confirmed. Removes the "Suggested" badge so
    // the user can scan for slots they haven't yet looked at.
    setUserTouched(prev => {
      const out = new Set(prev);
      out.add(slotName);
      return out;
    });
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
    setUserTouched(prev => {
      const out = new Set(prev);
      out.add(slotName);
      return out;
    });
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        padding: 14,
        background: 'rgba(34,211,238,0.05)',
        border: '1px solid rgba(34,211,238,0.15)',
        borderRadius: 'var(--r-md)',
        fontSize: 13, color: '#cbd5e1', lineHeight: 1.55,
      }}>
        <p style={{ margin: 0 }}>
          <strong style={{ color: '#67e8f9' }}>We've taken a first pass at categorising these</strong> based
          on the slot names — look out for <span style={{ color: '#6ee7b7' }}>✓ AUTO</span> (confident match) and{' '}
          <span style={{ color: '#fbbf24' }}>~ CHECK</span> (educated guess, worth a second look) badges below.
          Click any picker to override; uncertain slots default to <strong>Other</strong>.
        </p>
        <p style={{ margin: '8px 0 0' }}>
          This is about <strong>routine and urgent GP consultation slots</strong> — the
          bookable appointments where a clinician sees a patient. <strong style={{ color: '#6ee7b7' }}>Routine</strong> =
          consultations booked in advance · <strong style={{ color: '#fdba74' }}>Urgent</strong> =
          same-day / acute consultations. Everything else should be <strong>Other</strong>:
          nursing and HCA clinics, phlebotomy, vaccinations, procedures, and admin/triage
          contacts are not patient consultations and are excluded from the routine-vs-urgent
          demand model. Your <strong>duty doctor</strong> slot(s) are set separately in the box
          just below.
        </p>
      </div>

      {/* Duty doctor slot(s) — separate box. Usually only 1–2 slots, so it
          doesn't belong as a per-row toggle on every slot type. Pick from
          the dropdown; selected slots show as removable chips. */}
      <div style={{ padding: 14, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 'var(--r-md)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#c4b5fd', marginBottom: 4 }}>Duty doctor slot(s)</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
          Which slot type(s) are your duty / on-call doctor slots? Usually just 1–2. The huddle and
          Today views highlight these separately.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {(slotFilters.dutyDoctorSlot || []).map(slot => (
            <span key={slot} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 10px', background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 'var(--r-pill)', fontSize: 12, color: '#ddd6fe', fontFamily: "'Space Mono', monospace" }}>
              {slot}
              <button type="button" onClick={() => toggleDuty(slot)} title="Remove" style={{ background: 'none', border: 'none', color: '#c4b5fd', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
          <select
            value=""
            onChange={(e) => { if (e.target.value) toggleDuty(e.target.value); }}
            style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 'var(--r-md)', color: '#e2e8f0', fontSize: 12, cursor: 'pointer', maxWidth: 320 }}
          >
            <option value="">+ Add a duty slot…</option>
            {slotTypes.filter(s => !(slotFilters.dutyDoctorSlot || []).includes(s)).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
        <SummaryPill colour="#10b981" label="Routine" count={summary.routine} />
        <SummaryPill colour="#f97316" label="Urgent" count={summary.urgent} />
        <SummaryPill colour="#475569" label="Other" count={summary.other} />
        <SummaryPill colour="#8b5cf6" label="Duty doctor" count={summary.duty} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: saving ? '#94a3b8' : (savedAt ? '#10b981' : '#64748b') }}>
          {saving ? 'Saving…' : (savedAt ? '✓ Saved' : 'Auto-saves on change')}
        </span>
      </div>

      {pendingCategorySuggestions && (
        <div style={{
          padding: 12,
          background: 'rgba(168,85,247,0.08)',
          border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: 'var(--r-md)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          fontSize: 12, color: '#cbd5e1',
        }}>
          <span>
            <strong style={{ color: '#c4b5fd' }}>Suggestions available</strong> — we have
            guessed categories based on slot names. Apply them all in one go or click
            through individually.
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" onClick={applyCategorySuggestions} style={pillButton('#a855f7')}>
              Apply category suggestions
            </button>
          </span>
        </div>
      )}

      <div style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.03)',
          fontSize: 11, fontWeight: 600, color: '#94a3b8',
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          <div>Slot type</div>
          <div style={{ textAlign: 'center' }}>Category</div>
        </div>
        {slotTypes.map((slot, i) => {
          const cat = categoryOf(slot);
          const sug = suggestSlotCategoryWithConfidence(slot);
          const suggested = sug?.category || null;
          const confidence = sug?.confidence || null;
          // Auto-applied indicator: the current value matches what the
          // suggestion would say AND the user hasn't explicitly clicked
          // this row. Once they click, userTouched gains the slot and
          // the indicator disappears.
          const touched = userTouched.has(slot);
          const isAutoApplied = !touched && (suggested && cat === suggested);
          const showCategorySuggestion = cat === 'other' && suggested !== null;
          return (
            <div
              key={slot}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 300px',
                alignItems: 'center', gap: 8,
                padding: '10px 14px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                borderTop: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: '#cbd5e1', fontFamily: "'Space Mono', monospace", display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {slot}
                  {/* Auto-applied tag: subtle confidence indicator
                      sitting next to the slot name. High confidence
                      gets a green tick, medium gets an amber tilde
                      (suggesting "double-check this one"). Disappears
                      once the user clicks the picker. */}
                  {isAutoApplied && confidence === 'high' && cat !== 'other' && (
                    <span title="Confident auto-suggestion based on the slot name" style={{
                      fontSize: 9.5, padding: '1px 7px', borderRadius: 'var(--r-pill)',
                      background: 'rgba(16,185,129,0.12)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      color: '#6ee7b7', letterSpacing: 0.4, fontFamily: 'inherit',
                    }}>✓ AUTO</span>
                  )}
                  {isAutoApplied && confidence === 'medium' && cat !== 'other' && (
                    <span title="Educated guess — worth double-checking" style={{
                      fontSize: 9.5, padding: '1px 7px', borderRadius: 'var(--r-pill)',
                      background: 'rgba(251,191,36,0.10)',
                      border: '1px solid rgba(251,191,36,0.3)',
                      color: '#fbbf24', letterSpacing: 0.4, fontFamily: 'inherit',
                    }}>~ CHECK</span>
                  )}
                </div>
                {showCategorySuggestion && (
                  <div style={{ marginTop: 2, fontSize: 11, color: '#a78bfa' }}>
                    Suggested: <strong style={{ color: suggested === 'urgent' ? '#fdba74' : '#cbd5e1' }}>{suggested}</strong>
                    {confidence === 'medium' && <span style={{ color: '#94a3b8' }}> (medium confidence)</span>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <SlotCategoryPicker value={cat} onChange={(c) => setCategory(slot, c)} />
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
      borderRadius: 'var(--r-pill)',
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
    borderRadius: 'var(--r-sm)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

function SlotCategoryPicker({ value, onChange }) {
  const options = [
    { id: 'routine', label: 'Routine', colour: '#10b981' },
    { id: 'urgent',  label: 'Urgent',  colour: '#f97316' },
    { id: 'other',   label: 'Other',   colour: '#475569' },
  ];
  return (
    <div style={{
      display: 'flex',
      background: 'rgba(0,0,0,0.25)',
      borderRadius: 'var(--r-sm)',
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
              border: 'none', borderRadius: 'var(--r-sm)',
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

// ─── Step 4: Clinician roles + working pattern ────────────────────────
// After slot types but before sites/demand. The wizard embeds the
// full QuickSetupTable from the Practice → Clinicians tab so the
// user gets every feature without the wizard having to maintain a
// second, simpler version: role section dividers, bulk toolbar
// (set role / status / buddy cover across selected rows), per-row
// inline editing of every field, working days grid modal, clinician
// details side panel, and "needs attention" amber highlights for
// rows with missing initials or placeholder roles.
//
// "Sorted" — reported back to the wizard via onSortedChange — means
// every active clinician has a working pattern. The step is optional;
// users who don't want to fix patterns now can skip and come back
// later via Practice → Clinicians.

// "Reviewed" = there are active clinicians and each has a role assigned.
// Role is the meaningful per-clinician decision on this step (and drives
// buddy-cover defaults). Used both at load and live as the table is edited.
function isCliniciansReviewed(list) {
  const active = (list || []).filter(c => c.status === 'active');
  return active.length > 0 && active.every(c => c.role && String(c.role).trim());
}

// Final step: a summary of everything before finishing. Shows each step's
// status (done / needs attention / skipped) with a jump button so the user
// can fill in anything optional before completing. Crucially this is its
// own step, so it never reports the step you are currently on as "skipped".
function ReviewStep({ steps, stepDone, canComplete, requiredIncomplete, goToStep }) {
  const rows = steps.slice(0, -1).map((s, i) => ({ s, i, done: !!stepDone[i] }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={fieldHelp}>
        {canComplete
          ? "Here's everything. You can finish now and head to your dashboard, or jump back to fill in anything optional first."
          : 'Almost there — finish the required step(s) highlighted below, then you can complete setup.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(({ s, i, done }) => {
          const state = done ? 'done' : (s.required ? 'todo' : 'optional');
          const colour = state === 'done' ? '#10b981' : state === 'todo' ? '#f59e0b' : '#64748b';
          const label = state === 'done' ? 'Done' : state === 'todo' ? 'Needs attention' : 'Skipped (optional)';
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 'var(--r-md)',
              opacity: state === 'optional' ? 0.75 : 1,
            }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: colour, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#e2e8f0' }}>{s.title}</div>
                <div style={{ fontSize: 12, color: colour }}>{label}</div>
              </div>
              {!done && (
                <button type="button" onClick={() => goToStep(i)} style={pillButton(state === 'todo' ? '#f59e0b' : '#64748b')}>
                  {state === 'todo' ? 'Complete' : 'Add now'} →
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!canComplete && (
        <div style={{ fontSize: 13, color: '#fbbf24', lineHeight: 1.5 }}>
          You still need to finish {requiredIncomplete.map(s => s.title).join(' and ')} before you can complete setup.
        </div>
      )}
    </div>
  );
}

function ClinicianRolesStep({ practiceId, onSortedChange }) {
  const supabase = createClient();
  const [initialClinicians, setInitialClinicians] = useState(null);
  const [initialPatterns, setInitialPatterns] = useState({});
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ─── Initial load ────────────────────────────────────────────────
  // Mirrors what app/v4/practice/[id]/CliniciansTab.js does on the
  // server — fetch clinicians + working_patterns + sites in parallel,
  // adapt snake_case → v3-shape camelCase. We're a client component
  // (we have to be — we're inside the wizard's client SetupWizard)
  // so the fetch is on mount rather than at server-render time.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    const [
      { data: rows, error: cliErr },
      { data: patterns },
      { data: settingsRow },
    ] = await Promise.all([
      supabase
        .from('clinicians')
        .select('id, name, title, initials, role, group_id, status, sessions, buddy_cover, can_provide_cover, show_whos_in, aliases, linked_user_id, metadata, created_at')
        .eq('practice_id', practiceId)
        .order('name', { ascending: true }),
      supabase
        .from('working_patterns')
        .select('id, clinician_id, pattern, clinicians!inner(practice_id)')
        .eq('clinicians.practice_id', practiceId)
        .is('effective_to', null),
      supabase
        .from('practice_settings')
        .select('room_allocation')
        .eq('practice_id', practiceId)
        .maybeSingle(),
    ]);
    if (cliErr) {
      setError(cliErr.message);
      setLoading(false);
      return;
    }
    const patternByClinician = {};
    for (const wp of patterns || []) {
      patternByClinician[wp.clinician_id] = { id: wp.id, pattern: wp.pattern || {} };
    }
    // Adapt snake_case → v3-shape camelCase. Same logic as CliniciansTab.
    const adapted = (rows || []).map(c => {
      const meta = c.metadata || {};
      return {
        id: c.id,
        name: c.name,
        title: c.title,
        initials: c.initials,
        role: c.role,
        group: c.group_id,
        status: c.status,
        sessions: c.sessions || 0,
        buddyCover: !!c.buddy_cover,
        canProvideCover: c.can_provide_cover !== false,
        showWhosIn: c.show_whos_in !== false,
        aliases: c.aliases || [],
        linkedUserId: c.linked_user_id,
        primaryBuddy: meta.primaryBuddy || null,
        secondaryBuddy: meta.secondaryBuddy || null,
        roomPreferences: meta.roomPreferences || {},
        notes: meta.notes || '',
      };
    });
    setInitialClinicians(adapted);
    setInitialPatterns(patternByClinician);
    setSites(settingsRow?.room_allocation?.sites || []);
    setLoading(false);
    // Report "reviewed" status — the core task of this step is assigning a
    // role to every active clinician (which also drives their buddy-cover
    // defaults). Working patterns are a bonus set elsewhere, so we don't
    // gate completion on them. This is recomputed live as the user edits,
    // via onCliniciansChange below.
    onSortedChange?.(isCliniciansReviewed(adapted));
  }, [practiceId, supabase, onSortedChange]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={fieldHelp}>Loading your clinician list…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={fieldHelp}>Couldn't load clinicians: {error}</p>
      </div>
    );
  }

  if (!initialClinicians || initialClinicians.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={fieldHelp}>
          No active clinicians yet. Go back to step 3 (Appointment data) and upload
          your EMIS CSV — your team gets built automatically from the appointment list.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={fieldHelp}>
        Here's your team. Edit roles inline, use the toolbar for bulk changes, and
        click <strong style={{ color: '#67e8f9' }}>Working days grid</strong> in
        the toolbar to set everyone's AM/PM pattern. This is the same view you
        get later via Practice → Clinicians — you can come back here any time.
      </p>
      <QuickSetupTable
        practiceId={practiceId}
        initialClinicians={initialClinicians}
        initialPatterns={initialPatterns}
        sites={sites}
        onCliniciansChange={(list) => onSortedChange?.(isCliniciansReviewed(list))}
      />
    </div>
  );
}

// ─── Step 5: Practice sites ────────────────────────────────────────────
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
  const trackSave = useTrackedSave();
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
    const result = await trackSave(
      supabase
        .from('practice_settings')
        .upsert({ practice_id: practiceId, room_allocation: merged }, { onConflict: 'practice_id' })
    );
    setSaving(false);
    if (result?.error) {
      setError(result.error.message);
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
        borderRadius: 'var(--r-md)',
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
              width: 28, height: 28, borderRadius: 'var(--r-sm)',
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
                color: '#94a3b8', borderRadius: 'var(--r-sm)',
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
              borderRadius: 'var(--r-sm)',
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


// ─── Step 6: Demand history (optional) ─────────────────────────────────
function DemandStep({ practiceId, practiceSlug, hasDemandData, setHasDemandData, onContinue }) {
  const supabase = createClient();
  const [howToOpen, setHowToOpen] = useState(null); // 'askmygp' | 'anima' | null
  const [addingMore, setAddingMore] = useState(false);
  // History summary per source. Fetched on mount + refetched after upload
  // so the "what's unlocked" panel updates immediately.
  // Shape: [{ source, row_count, earliest_date, latest_date }]
  const [historySummary, setHistorySummary] = useState([]);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('demand_history_summary')
      .select('source, row_count, earliest_date, latest_date')
      .eq('practice_id', practiceId);
    setHistorySummary(data || []);
  }, [practiceId, supabase]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Compute total span across all sources + total rows. Used to drive
  // the feature-unlock checklist. Thresholds mirror the ones in
  // lib/demand-recalibration.js:
  //   MIN_SAMPLE_FOR_DOW       = 20 rows
  //   MIN_SPAN_DAYS_FOR_TREND  = 90 days
  //   MIN_SPAN_DAYS_FOR_MONTHS = 270 days
  const { totalRows, totalSpanDays, earliest, latest } = useMemo(() => {
    if (historySummary.length === 0) return { totalRows: 0, totalSpanDays: 0, earliest: null, latest: null };
    let rows = 0;
    let earliestStr = null;
    let latestStr = null;
    for (const h of historySummary) {
      rows += (h.row_count || 0);
      if (h.earliest_date && (!earliestStr || h.earliest_date < earliestStr)) earliestStr = h.earliest_date;
      if (h.latest_date && (!latestStr || h.latest_date > latestStr)) latestStr = h.latest_date;
    }
    let span = 0;
    if (earliestStr && latestStr) {
      span = Math.round((new Date(latestStr) - new Date(earliestStr)) / 86400000);
    }
    return { totalRows: rows, totalSpanDays: span, earliest: earliestStr, latest: latestStr };
  }, [historySummary]);
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
          background: 'rgba(16,185,129,0.06)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 'var(--r-md)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckIcon />
            </div>
            <div>
              <div style={{ fontSize: 14, color: '#6ee7b7', fontWeight: 600 }}>Demand data uploaded</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                {totalRows > 0 ? (
                  <>{totalRows.toLocaleString()} rows{totalSpanDays > 0 && <> · {totalSpanDays} day{totalSpanDays === 1 ? '' : 's'} of history</>}{earliest && latest && <> ({new Date(earliest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} → {new Date(latest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})</>}</>
                ) : (
                  'Calibration complete'
                )}
              </div>
            </div>
          </div>
          {totalSpanDays > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
                MODEL FEATURES UNLOCKED
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <FeatureRow
                  on={totalRows >= 1}
                  label="Baseline demand"
                  hint="Average daily demand from your data"
                />
                <FeatureRow
                  on={totalRows >= 20}
                  label="Day-of-week effects"
                  hint={totalRows >= 20 ? "Mondays vs Fridays calibrated to your practice" : `Need 20+ rows — currently ${totalRows}`}
                />
                <FeatureRow
                  on={totalSpanDays >= 90}
                  label="Long-term growth trend"
                  hint={totalSpanDays >= 90 ? "Growth slope calibrated from 90+ days of data" : `Need 90+ days of history — currently ${totalSpanDays}`}
                />
                <FeatureRow
                  on={totalSpanDays >= 270}
                  label="Monthly seasonality"
                  hint={totalSpanDays >= 270 ? "Full-year patterns (school holidays, winter pressures)" : `Need 270+ days of history — currently ${totalSpanDays}. Upload more history to unlock`}
                />
              </div>
            </div>
          )}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 10 }}>
              {totalSpanDays >= 270
                ? 'You have enough history to unlock every model feature. Add more any time, or carry on.'
                : 'More history unlocks more of the model (90+ days for the growth trend, 270+ for full-year seasonality). You can add more now, or carry on and top it up later from the Demand tab.'}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!addingMore && (
                <button type="button" onClick={() => setAddingMore(true)} style={pillButton('#6366f1')}>
                  + Add more history
                </button>
              )}
              {onContinue && (
                <button type="button" onClick={onContinue} style={{ ...pillButton('#10b981'), background: '#10b981', color: '#06281e', borderColor: '#10b981' }}>
                  Looks good — continue
                </button>
              )}
            </div>
            {addingMore && (
              <div style={{ marginTop: 14 }}>
                <DemandUpload
                  practiceId={practiceId}
                  demandSettings={null}
                  history={[]}
                  onUploadSuccess={() => { loadHistory(); setAddingMore(false); }}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <DemandUpload
          practiceId={practiceId}
          demandSettings={null}
          history={[]}
          onUploadSuccess={() => { setHasDemandData(true); loadHistory(); }}
        />
      )}

      {/* Per-source how-to guides — expandable so they don't overwhelm
          the page. The two tools have different export flows, so a
          single set of instructions doesn't work. */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 'var(--r-md)',
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

// ─── Step 7: Invite team (optional) ────────────────────────────────────
function InvitesStep({ practiceId, hasInvites, setHasInvites, setDirty }) {
  const supabase = createClient();
  const [emailsText, setEmailsText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Track unsaved state for the wizard's beforeunload warning. The
  // textarea is the only field on the wizard without auto-save —
  // emails only persist after Send is clicked. Without this hook the
  // user could close the tab with a half-typed invite list and lose
  // it silently.
  useEffect(() => {
    setDirty?.(emailsText.trim().length > 0);
    return () => setDirty?.(false);
  }, [emailsText, setDirty]);

  // Live email parsing. Splits the textarea on whitespace, commas, and
  // semicolons (mirroring the BulkInviteButton parser), then validates
  // each token against a standard email regex. Distinguishing valid vs
  // invalid lets us show feedback inline — green chips for valid, amber
  // chips with a hint for things that look like emails but don't quite
  // parse (e.g. missing TLD). Without this, malformed input was just
  // silently dropped at send time which left users wondering why their
  // invite list was shorter than expected.
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const parsed = useMemo(() => {
    const tokens = emailsText.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    const seen = new Set();
    const validEmails = [];
    const duplicates = [];
    const invalid = [];
    for (const t of tokens) {
      const lower = t.toLowerCase();
      if (emailRegex.test(t)) {
        if (seen.has(lower)) {
          duplicates.push(t);
        } else {
          seen.add(lower);
          validEmails.push(lower);
        }
      } else {
        invalid.push(t);
      }
    }
    return { validEmails, duplicates, invalid };
  }, [emailsText]);

  const send = async () => {
    if (parsed.validEmails.length === 0) {
      setError('Add at least one valid email address.');
      return;
    }
    setSending(true);
    setError('');
    setResult(null);
    const { data, error: err } = await supabase.rpc('bulk_invite_users_to_practice', {
      target_practice_id: practiceId,
      invitees: parsed.validEmails.map(email => ({ email, role: 'user' })),
    });
    setSending(false);
    if (err) {
      setError(err.message || 'Could not send invites.');
      return;
    }
    setResult(data);
    if (data?.created > 0) setHasInvites(true);
    setEmailsText('');
    setDirty?.(false);
  };

  const sendDisabled = sending || parsed.validEmails.length === 0;

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

      {/* Inline parsing feedback — only render when there's something
          to show. Distinguishes between valid (green chips), already-
          seen duplicates (subdued chips), and invalid-format tokens
          (amber chips with a tooltip suggesting what's wrong). */}
      {(parsed.validEmails.length > 0 || parsed.invalid.length > 0 || parsed.duplicates.length > 0) && (
        <div style={{
          padding: 12,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 'var(--r-md)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {parsed.validEmails.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
                ✓ {parsed.validEmails.length} VALID EMAIL{parsed.validEmails.length === 1 ? '' : 'S'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {parsed.validEmails.map(e => (
                  <span key={e} style={{
                    padding: '3px 10px',
                    borderRadius: 'var(--r-pill)',
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    color: '#6ee7b7',
                    fontSize: 12,
                  }}>{e}</span>
                ))}
              </div>
            </div>
          )}
          {parsed.duplicates.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
                {parsed.duplicates.length} DUPLICATE{parsed.duplicates.length === 1 ? '' : 'S'} (will skip)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {parsed.duplicates.map((e, i) => (
                  <span key={`${e}-${i}`} style={{
                    padding: '3px 10px',
                    borderRadius: 'var(--r-pill)',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#94a3b8',
                    fontSize: 12,
                    textDecoration: 'line-through',
                  }}>{e}</span>
                ))}
              </div>
            </div>
          )}
          {parsed.invalid.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
                ⚠ {parsed.invalid.length} NOT RECOGNISED — CHECK FORMAT
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {parsed.invalid.map((e, i) => (
                  <span
                    key={`${e}-${i}`}
                    title={e.includes('@') ? "Missing TLD (e.g. '.com')?" : "Missing @?"}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 'var(--r-pill)',
                      background: 'rgba(251,191,36,0.1)',
                      border: '1px solid rgba(251,191,36,0.3)',
                      color: '#fbbf24',
                      fontSize: 12,
                      cursor: 'help',
                    }}
                  >{e}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={send}
        disabled={sendDisabled}
        style={{
          ...btnPrimary,
          alignSelf: 'flex-start',
          opacity: sendDisabled ? 0.4 : 1,
          cursor: sendDisabled ? 'not-allowed' : 'pointer',
        }}
        title={parsed.validEmails.length === 0 && emailsText.trim().length > 0
          ? 'No valid emails detected — check formatting above'
          : ''}
      >
        {sending
          ? 'Sending…'
          : parsed.validEmails.length > 0
            ? `Send ${parsed.validEmails.length} invite${parsed.validEmails.length === 1 ? '' : 's'}`
            : 'Send invites'}
      </button>

      {result && (
        <div style={{
          padding: 14,
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 'var(--r-md)',
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

// Feature-unlock row for the demand step. Shows a small green/grey
// pill indicating whether the feature is active, with a hint string
// explaining what to do to unlock it (or what it means once active).
function FeatureRow({ on, label, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{
        flexShrink: 0,
        width: 16, height: 16, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: on ? '#10b981' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${on ? '#10b981' : 'rgba(255,255,255,0.12)'}`,
        marginTop: 2,
      }}>
        {on ? (
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: on ? '#e2e8f0' : '#94a3b8', fontWeight: 500 }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontSize: 11, color: on ? '#94a3b8' : '#64748b', marginTop: 1 }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

// Compact stat cell for the EMIS upload summary. Shows a big number
// plus a small caption. Used in a CSS grid that auto-fits across the
// available width.
// ─── Step 8: Public buddy cover link (optional) ────────────────────────
// Lets the practice opt in to a public-no-auth /buddy/<slug> page so the
// EMIS clipboard report can include a clickable URL. Default off; flip
// here or in Buddy Cover settings later.
//
// What flows where:
// - The persisted state lives on practices.buddy_cover_public (added in
//   migration 20260525120044). Toggle writes there directly via the
//   client supabase. wizard-side state is mirrored from server props +
//   updated optimistically on toggle.
// - The same toggle appears at the top of Buddy Cover settings — both
//   surfaces share the same DB column, so flipping it in one place is
//   reflected in the other.
function PublicBuddyStep({ practiceId, practiceSlug, buddyCoverPublic, setBuddyCoverPublic }) {
  const supabase = createClient();
  const trackSave = useTrackedSave();
  const [error, setError] = useState('');

  const toggle = async (next) => {
    setBuddyCoverPublic(next); // optimistic
    setError('');
    const promise = supabase
      .from('practices')
      .update({ buddy_cover_public: next })
      .eq('id', practiceId);
    const { error: err } = await trackSave(promise);
    if (err) {
      setBuddyCoverPublic(!next); // revert
      setError(`Couldn't save: ${err.message}`);
    }
  };

  const publicUrl = typeof window !== 'undefined' && practiceSlug
    ? `${window.location.origin}/buddy/${practiceSlug}`
    : (practiceSlug ? `/buddy/${practiceSlug}` : '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={fieldHelp}>
        EMIS staff can&apos;t see your dashboard, but if you turn this on
        we&apos;ll give you a public URL you can paste into your EMIS
        Buddy Cover template. One click and your team sees today&apos;s
        allocations — no login.
      </p>

      <div style={{
        padding: '14px 16px',
        background: 'rgba(20,184,166,0.10)',
        border: '1px solid rgba(20,184,166,0.25)',
        borderRadius: 'var(--r-md)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>
              {buddyCoverPublic ? 'Public access enabled' : 'Public access disabled'}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
              {buddyCoverPublic
                ? 'Anyone with the URL below can view your buddy allocations.'
                : 'Only signed-in members of this practice can view buddy allocations.'}
            </div>
          </div>
          <button
            onClick={() => toggle(!buddyCoverPublic)}
            style={{
              width: 56,
              height: 30,
              borderRadius: 'var(--r-pill)',
              border: 'none',
              background: buddyCoverPublic ? '#14b8a6' : 'rgba(255,255,255,0.12)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            aria-pressed={buddyCoverPublic}
            aria-label="Toggle public buddy cover access"
          >
            <span style={{
              position: 'absolute',
              top: 3,
              left: buddyCoverPublic ? 29 : 3,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'white',
              transition: 'left 0.15s',
            }} />
          </button>
        </div>

        {buddyCoverPublic && publicUrl && (
          <div style={{
            marginTop: 14,
            padding: '10px 14px',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(20,184,166,0.20)',
            borderRadius: 'var(--r-md)',
          }}>
            <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
              Your public URL
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#67e8f9',
                textDecoration: 'underline',
                wordBreak: 'break-all',
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 13,
              }}
            >
              {publicUrl}
            </a>
          </div>
        )}
      </div>

      <div style={{
        padding: '12px 16px',
        background: 'rgba(251,191,36,0.08)',
        border: '1px solid rgba(251,191,36,0.22)',
        borderRadius: 'var(--r-md)',
        fontSize: 13,
        color: '#fde68a',
        lineHeight: 1.65,
      }}>
        <strong style={{ color: '#fcd34d' }}>What becomes visible when enabled:</strong>{' '}
        Your clinicians&apos; names, initials, roles, who is present/absent today,
        and the cover allocations. No patient data is ever shown. You can switch
        this off at any time — the URL will immediately return &quot;not found.&quot;
      </div>

      <div style={{
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 'var(--r-md)',
        fontSize: 13,
        color: '#cbd5e1',
        lineHeight: 1.65,
      }}>
        <strong style={{ color: '#e2e8f0' }}>Why turn this on?</strong>{' '}
        It&apos;s the simplest way to give your reception/admin team buddy cover
        access from EMIS. When enabled, the &quot;Copy week&quot; and &quot;Copy day&quot;
        buttons in your dashboard include this URL in the clipboard — paste once
        into your EMIS template and it&apos;s done.
      </div>

      {error && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.10)',
          border: '1px solid rgba(239,68,68,0.30)',
          color: '#fca5a5',
          borderRadius: 'var(--r-md)',
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <p style={{ ...fieldHelp, fontSize: 13, color: '#64748b' }}>
        You can change this any time from Practice settings → Buddy cover.
      </p>
    </div>
  );
}


function SummaryStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#6ee7b7', fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, letterSpacing: 0.3 }}>
        {label}
      </div>
    </div>
  );
}
const fieldHelp = { fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, margin: 0 };
const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 'var(--r-md)',
  fontSize: 14,
  color: '#e2e8f0',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};
const errorText = { marginTop: 8, fontSize: 12, color: '#fca5a5' };
