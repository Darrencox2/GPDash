'use client';

// /dashboard — the Supabase-authed clone of the v3 app shell.
//
// Visually identical to production gpdash.net (same Sidebar, same
// HuddleToday, same MyRota, etc.) but data flows through Supabase
// instead of the shared-password Redis blob.
//
// Auth flow:
// - Not signed in → redirect to /v4/login
// - Signed in but no practice selected → redirect to /v4/dashboard (practice picker)
// - Signed in with ?practice=UUID → load v3-shaped data from /api/v4/data
//
// Once data is loaded, this page is byte-for-byte the v3 shell — same
// Sidebar, same activeSection switching, same components. Components
// don't know they're talking to Postgres.

import { Suspense, lazy, Component } from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DAYS, getWeekStart, getActiveWeekStart, getCurrentDay, generateBuddyAllocations, getDefaultData, DEFAULT_SETTINGS, guessGroupFromRole, titleCaseName, toLocalIso, computeDayStatus, logEvent } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';
import { sweepWindDowns } from '@/lib/status-transitions';
import { regenerateCoverWindow, coverInputsFingerprint } from '@/lib/cover-regen';
import { ToastProvider, useToast, PageSkeleton, confirmDialog } from '@/components/ui';
import Sidebar from '@/components/Sidebar';
import LinkClinicianSuggest from '@/components/LinkClinicianSuggest';
import { canEditPracticeData, isPlatformAdmin } from '@/lib/permissions';
import { createClient } from '@/utils/supabase/client';
import { DashboardCompletenessStrip } from '@/app/v4/_lib/SectionStatus';
import { reportError } from '@/lib/report-error';
import { noteAction, getTrail, isStaleBuildError, buildErrorReport } from '@/lib/error-context';
import { APP_VERSION } from '@/lib/version';

// Shows the REAL error on screen when a section crashes, instead of
// Next.js's blank "client-side exception" page - a live diagnostic so a
// staff report can include the actual message.
class SectionErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, info: null, copied: false, stale: false }; }
  static getDerivedStateFromError(error) {
    return { error, stale: isStaleBuildError(error) };
  }
  componentDidCatch(error, info) {
    console.error('[gpdash] section crashed:', error, info?.componentStack);
    this.setState({ info });
    reportError(error, { source: 'boundary', componentStack: info?.componentStack });

    // A chunk that will not load is almost always a stale tab: the browser is
    // holding a filename from a previous build, after a deploy or a rebuild.
    // The app is not broken, it is out of date — so reload it once. The
    // sessionStorage guard means a genuinely missing chunk cannot loop.
    if (isStaleBuildError(error)) {
      try {
        const KEY = 'gpdash-stale-reload';
        if (!sessionStorage.getItem(KEY)) {
          sessionStorage.setItem(KEY, String(Date.now()));
          window.location.reload();
        }
      } catch (e) { /* reloading is best effort */ }
    }
  }
  copy = () => {
    const text = buildErrorReport({
      error: this.state.error,
      componentStack: this.state.info?.componentStack,
      section: this.props.section,
      version: APP_VERSION,
      practice: this.props.practice,
    });
    const done = () => { this.setState({ copied: true }); setTimeout(() => this.setState({ copied: false }), 2500); };
    try {
      navigator.clipboard.writeText(text).then(done, () => {
        // Clipboard can be blocked; fall back to a selectable textarea.
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } finally { ta.remove(); }
      });
    } catch (e) { /* nothing more we can do */ }
  };
  render() {
    if (this.state.error) {
      const trail = getTrail();
      if (this.state.stale) {
        return (
          <div style={{ padding: 24 }}>
            <div className="glass" style={{ padding: 20, borderRadius: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fbbf24' }}>GPDash has been updated</div>
              <div style={{ fontSize: 13, color: 'var(--meta)', marginTop: 6, maxWidth: '60ch', lineHeight: 1.6 }}>
                This tab was open while a new version went out, so part of the app it was
                trying to load no longer exists. Reloading picks up the new version — nothing
                is wrong and nothing is lost.
              </div>
              <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.5)', color: '#fcd34d', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Reload GPDash</button>
            </div>
          </div>
        );
      }
      return (
        <div style={{ padding: 24 }}>
          <div className="glass" style={{ padding: 20, borderRadius: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fca5a5' }}>This section hit an error</div>
            <div style={{ fontSize: 13, color: 'var(--meta)', marginTop: 6 }}>
              Copy the details and send them to Darren — that is more useful than a screenshot,
              because it includes what you were doing.
            </div>
            <pre style={{ fontSize: 12, color: '#e2e8f0', whiteSpace: 'pre-wrap', marginTop: 10, background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8 }}>{String(this.state.error?.message || this.state.error)}</pre>
            {trail.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--meta)' }}>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>What you did just before</div>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  {trail.slice(-4).map((t, i) => <li key={i}>{t.label}</li>)}
                </ol>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={this.copy} style={{ padding: '7px 14px', borderRadius: 8, background: this.state.copied ? 'rgba(52,211,153,0.2)' : 'rgba(52,211,153,0.14)', border: `1px solid ${this.state.copied ? 'var(--link)' : 'rgba(52,211,153,0.45)'}`, color: 'var(--link)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {this.state.copied ? 'Copied \u2713' : 'Copy error details'}
              </button>
              <button onClick={() => this.setState({ error: null, info: null })} style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc', fontSize: 13, cursor: 'pointer' }}>Try again</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy-load section components — they're each 50–200KB with heavy
// dependencies. Loading them on demand cuts initial bundle dramatically
// and means the user doesn't pay for sections they never visit.
const BuddyDaily = lazy(() => import('@/components/buddy/BuddyDaily'));
// TeamMembers retired in v4.14.0 — see Practice → Clinicians for the
// new home. Keeping the file in components/buddy/ for the moment so
// v3 production (on `main`) still has it; can be removed when that
// branch catches up.
const TeamRota = lazy(() => import('@/components/buddy/TeamRota'));
const BuddySettings = lazy(() => import('@/components/buddy/BuddySettings'));
// HuddleToday is the DEFAULT landing section, so start fetching its chunk the
// moment this module executes (parallel with hydration) instead of waiting for
// first render to trigger it. Removes a full network round-trip from the
// critical path on the daily route - most noticeable on mobile connections.
// Still code-split: other sections stay lazy and on-demand.
const huddleTodayChunk = import('@/components/huddle/HuddleToday');
const HuddleToday = lazy(() => huddleTodayChunk);
const HuddleForward = lazy(() => import('@/components/huddle/HuddleForward'));
const WorkloadAudit = lazy(() => import('@/components/huddle/WorkloadAudit'));
const WorkforcePlanner = lazy(() => import('@/components/workforce/WorkforcePlanner'));
const SpendTracker = lazy(() => import('@/components/workforce/SpendTracker'));
const MyRota = lazy(() => import('@/components/huddle/MyRota'));
const Meetings = lazy(() => import('@/components/meetings/Meetings'));
const RoomSettings = lazy(() => import('@/components/room/RoomSettings'));
const RoomDashboard = lazy(() => import('@/components/room/RoomDashboard'));
const Changelog = lazy(() => import('@/components/Changelog'));
const AccountSettings = lazy(() => import('@/components/AccountSettings'));
const PerfOverlay = lazy(() => import('@/components/PerfOverlay'));

// Soft-redirect from the retired team-members section to the new home.
// We hit useEffect on mount and then router.replace to the practice
// settings tab; the component itself just renders a brief "Redirecting…"
// note in case the user has a slow connection.
function RedirectToClinicians({ slug }) {
  const router = useRouter();
  useEffect(() => {
    if (!slug) return;
    router.replace(`/v4/practice/${slug}?tab=clinicians`);
  }, [slug, router]);
  return (
    <div className="card p-12 text-center">
      <div className="text-sm text-slate-400">Redirecting to Clinicians…</div>
    </div>
  );
}

// Static normalizer — same logic as the in-component one, but pulled to
// module scope so it can run at state-init time (before the component
// has rendered).
function normalizeDataStatic(d) {
  if (!d) return d;
  if (d.clinicians && !Array.isArray(d.clinicians)) d.clinicians = Object.values(d.clinicians);
  if (d.clinicians && Array.isArray(d.clinicians)) {
    d.clinicians = d.clinicians.map(c => ({
      ...c,
      name: titleCaseName(c.name) || c.name,
      group: c.group || guessGroupFromRole(c.role),
      status: c.longTermAbsent ? 'longTermAbsent' : (c.status || 'active'),
      longTermAbsent: c.status === 'longTermAbsent' || c.longTermAbsent || false,
      buddyCover: c.buddyCover !== undefined ? c.buddyCover : true,
      showWhosIn: c.showWhosIn !== undefined ? c.showWhosIn : true,
      source: c.source || 'manual',
      confirmed: c.confirmed !== undefined ? c.confirmed : true,
      aliases: c.aliases || [],
    }));
  }
  if (d.plannedAbsences && !Array.isArray(d.plannedAbsences)) d.plannedAbsences = Object.values(d.plannedAbsences);
  if (Array.isArray(d.plannedAbsences)) {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const cutoff = toLocalIso(yesterday);
    d.plannedAbsences = d.plannedAbsences.filter(a => a.endDate >= cutoff);
  }
  if (d.weeklyRota) {
    for (const day of Object.keys(d.weeklyRota)) {
      if (d.weeklyRota[day] && !Array.isArray(d.weeklyRota[day])) d.weeklyRota[day] = Object.values(d.weeklyRota[day]);
    }
  }
  if (d.dailyOverrides) {
    for (const key of Object.keys(d.dailyOverrides)) {
      const o = d.dailyOverrides[key];
      if (o) {
        if (o.present && !Array.isArray(o.present)) o.present = Object.values(o.present);
        if (o.scheduled && !Array.isArray(o.scheduled)) o.scheduled = Object.values(o.scheduled);
      }
    }
  }
  return d;
}

export default function DashboardRoot({ initialData = null, initialPracticeId = null, serverTimings = null, sectionStatuses = null, practiceManagementPath = null }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>Loading...</div>}>
      <ToastProvider>
        <DashboardContent
          initialData={initialData}
          initialPracticeId={initialPracticeId}
          serverTimings={serverTimings}
          sectionStatuses={sectionStatuses}
          practiceManagementPath={practiceManagementPath}
        />
      </ToastProvider>
    </Suspense>
  );
}

function DashboardContent({ initialData, initialPracticeId, serverTimings, sectionStatuses, practiceManagementPath }) {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const practiceId = searchParams.get('practice') || initialPracticeId;
  const supabase = createClient();

  // Hydrate state from server-provided initial data. This means first paint
  // shows a fully-populated dashboard with no loading spinner.
  const [authChecked, setAuthChecked] = useState(!!initialData);
  const [data, setData] = useState(() => initialData ? normalizeDataStatic(initialData) : null);
  const [allPractices, setAllPractices] = useState(() => initialData?._v4?.practices || []);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(!initialData);
  const [selectedWeek, setSelectedWeek] = useState(() => getActiveWeekStart());
  const [selectedDay, setSelectedDay] = useState(() => getCurrentDay());
  const [activeSection, setActiveSection] = useState('huddle-today');
  // Breadcrumb for crash reports: what the user navigated to, in order. Kept
  // in memory only — it exists so a pasted error says what led to it.
  useEffect(() => { noteAction(`Opened section: ${activeSection}`); }, [activeSection]);
  // Pick up `?section=X` after hydration. The previous useState initializer
  // pattern with `typeof window !== 'undefined'` doesn't work cross-page in
  // App Router — server renders with default, client hydrates with that
  // value, the useState initializer doesn't re-run. So we sync explicitly
  // here on mount when arriving from another route (e.g. Practice settings →
  // My account).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const section = new URL(window.location.href).searchParams.get('section');
    if (section === 'workload-audit') setActiveSection('reporting');
    else if (section) setActiveSection(section);

    // Remember this practice so launching the app at '/' (home-screen icon)
    // can redirect straight here in ONE hop with no network calls - see the
    // fast path in middleware.js. Uses the exact URL segment we would return
    // to; sanitised the same way middleware validates it.
    const m = window.location.pathname.match(/^\/p\/([a-zA-Z0-9-]{1,64})$/);
    if (m) {
      document.cookie = `gpdash-last-practice=${m[1]}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, []); // mount-only — subsequent in-page nav uses setActiveSection directly
  const [syncStatus, setSyncStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [huddleData, setHuddleData] = useState(() => initialData?.huddleCsvData || null);
  // The CSV blob is no longer in the page payload (see /api/v4/huddle-data) —
  // fetch it immediately after first paint. Sections that need it show a
  // skeleton until it lands.
  const [huddleLoading, setHuddleLoading] = useState(() => !!initialData && !initialData?.huddleCsvData);
  useEffect(() => {
    // Run whenever the server-rendered payload carried no CSV blob - do NOT
    // gate on the huddleCsvDeferred flag (an adapter whitelist silently
    // stripped it once, killing this whole loader; the flag is advisory only).
    if (!initialData || initialData.huddleCsvData) return;
    let cancelled = false;
    (async () => {
      // Load the deferred huddle CSV. Hardened after a report of data
      // "vanishing on refresh": one retry on failure, and if the slim
      // endpoint errors OR claims empty, cross-check against the full
      // /api/v4/data GET (the long-proven CSV source) before believing it.
      // Loud console diagnostics so any recurrence tells us which leg fired.
      // NB: returns false ONLY for a genuinely missing blob. It used to also
      // return false when `cancelled` was set — and React StrictMode mounts
      // every effect twice in dev, so the first run's completed fetch hit
      // that path, was misread as "endpoint returned empty", and fired the
      // full-data fallback plus a scary console.error on every dashboard
      // load. The endpoint was never wrong; the diagnostic was.
      const applyBlob = (blob, updatedAt) => {
        if (!blob) return false;
        if (cancelled) return true;   // handled: a cancelled run must not trigger fallbacks
        setHuddleData(blob);
        if (updatedAt) setData((d) => (d ? { ...d, huddleCsvUpdatedAt: updatedAt } : d));
        return true;
      };
      const slim = async () => {
        const res = await fetch(`/api/v4/huddle-data?practice=${encodeURIComponent(practiceId)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `huddle-data ${res.status}`);
        return json;
      };
      try {
        let json;
        try { json = await slim(); }
        catch (e1) {
          console.error('[gpdash] huddle-data attempt 1 failed, retrying:', e1?.message);
          await new Promise((r) => setTimeout(r, 1200));
          json = await slim();
        }
        if (cancelled) return;
        if (!applyBlob(json.huddleCsvData, json.huddleCsvUpdatedAt)) {
          // Endpoint GENUINELY says empty — verify against the full data GET
          // before believing it, in case the slim path is wrong somewhere.
          const full = await fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`);
          const fj = await full.json().catch(() => ({}));
          if (full.ok && fj?.huddleCsvData) {
            console.error('[gpdash] slim huddle endpoint returned empty but full data has the CSV - loaded via fallback. Please report this.');
            applyBlob(fj.huddleCsvData, fj.huddleCsvUpdatedAt);
          }
        }
      } catch (err) {
        console.error('[gpdash] huddle-data failed after retry, falling back to full data GET:', err?.message);
        try {
          const full = await fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`);
          const fj = await full.json().catch(() => ({}));
          if (full.ok) applyBlob(fj?.huddleCsvData, fj?.huddleCsvUpdatedAt);
        } catch (e2) { console.error('[gpdash] fallback also failed:', e2?.message); }
      }
      if (!cancelled) setHuddleLoading(false);
    })();
    return () => { cancelled = true; };
  }, []); // mount-only by design
  const [huddleMessages, setHuddleMessages] = useState(() =>
    Array.isArray(initialData?.huddleMessages) ? initialData.huddleMessages : []
  );
  const huddleLoadedRef = useRef(false);
  const lastSentCsvRef = useRef(initialData?.huddleCsvData || null);  // tracks the last CSV reference we sent to the server, for save-time bandwidth optimisation

  // Single load effect: fetch data immediately. The API endpoint handles
  // auth and returns 401 if not signed in; we redirect on that.
  // No client-side auth round-trip — saves ~300-500ms on cold loads.
  // SKIPPED entirely when initialData was provided by the server component.
  useEffect(() => {
    if (initialData) return;  // already hydrated from SSR
    if (!practiceId) {
      router.replace('/v4/dashboard');
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`);
        if (cancelled) return;

        if (res.status === 401) {
          router.replace('/v4/login');
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast(err.error || `Failed to load data (${res.status})`, 'error', 4000);
          setLoading(false);
          return;
        }

        const json = await res.json();
        if (cancelled) return;
        const normalised = normalizeData(json);
        setData(normalised);
        setAuthChecked(true);
        if (json._v4?.practices) {
          setAllPractices(json._v4.practices);
        }
        if (json.huddleCsvData) {
          setHuddleData(json.huddleCsvData);
          lastSentCsvRef.current = json.huddleCsvData;  // baseline for diff
        }
        // Hydrate noticeboard messages — stored server-side under
        // practice_settings.extras.huddleMessages and surfaced on the v3
        // shape by the adapter. Falls back to [] when none.
        if (Array.isArray(json.huddleMessages)) {
          setHuddleMessages(json.huddleMessages);
        }

        // If the user is linked to a clinician AND no rota hash is set, set
        // it now so MyRota will default to "me"
        if (normalised._v4?.linkedClinicianId && typeof window !== 'undefined') {
          const me = normalised.clinicians?.find(c => c.id === normalised._v4.linkedClinicianId);
          if (me?.initials && !window.location.hash.startsWith('#rota-')) {
            window.location.hash = `rota-${me.initials}`;
          }
        }

        // Background TeamNet sync — fires if a calendar URL is set and the
        // last sync was more than 6 hours ago (or never). Doesn't block the UI.
        if (normalised.teamnetUrl) {
          const last = normalised.lastSyncTime ? new Date(normalised.lastSyncTime).getTime() : 0;
          const hours = (Date.now() - last) / 3_600_000;
          if (hours > 6) {
            // Fire and forget — sync runs in the background and updates state when done
            (async () => {
              try {
                const r = await fetch(`/api/v4/sync-teamnet?practice=${encodeURIComponent(practiceId)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: normalised.teamnetUrl, clinicians: normalised.clinicians }),
                });
                const result = await r.json().catch(() => ({}));
                if (!r.ok || result.error) return;  // silent on error
                const newAbsences = result.absences || [];
                // Update state + persist new absences via saveData (writes to DB)
                setData(prev => prev ? { ...prev, plannedAbsences: [...(Array.isArray(prev.plannedAbsences) ? prev.plannedAbsences : []).filter(a => a.source !== 'teamnet'), ...newAbsences], lastSyncTime: new Date().toISOString() } : prev);
                // Persist quietly without a toast
                fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ plannedAbsences: newAbsences, lastSyncTime: new Date().toISOString() }),
                }).catch(() => {});
              } catch {
                // background sync errors are silent
              }
            })();
          }
        }
      } catch (err) {
        if (!cancelled) toast('Failed to load data', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [practiceId, router, toast, initialData]);

  // ─── Same normalization logic as v3 ──────────────────────────────
  const normalizeData = (d) => {
    if (!d) return d;
    if (d.clinicians && !Array.isArray(d.clinicians)) d.clinicians = Object.values(d.clinicians);
    if (d.clinicians && Array.isArray(d.clinicians)) {
      d.clinicians = d.clinicians.map(c => ({
        ...c,
        name: titleCaseName(c.name) || c.name,
        group: c.group || guessGroupFromRole(c.role),
        status: c.longTermAbsent ? 'longTermAbsent' : (c.status || 'active'),
        longTermAbsent: c.status === 'longTermAbsent' || c.longTermAbsent || false,
        buddyCover: c.buddyCover !== undefined ? c.buddyCover : true,
        showWhosIn: c.showWhosIn !== undefined ? c.showWhosIn : true,
        source: c.source || 'manual',
        confirmed: c.confirmed !== undefined ? c.confirmed : true,
        aliases: c.aliases || [],
      }));
    }
    if (d.plannedAbsences && !Array.isArray(d.plannedAbsences)) d.plannedAbsences = Object.values(d.plannedAbsences);
    if (Array.isArray(d.plannedAbsences)) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const cutoff = toLocalIso(yesterday);
      d.plannedAbsences = d.plannedAbsences.filter(a => a.endDate >= cutoff);
    }
    if (d.weeklyRota) {
      for (const day of Object.keys(d.weeklyRota)) {
        if (d.weeklyRota[day] && !Array.isArray(d.weeklyRota[day])) d.weeklyRota[day] = Object.values(d.weeklyRota[day]);
      }
    }
    if (d.dailyOverrides) {
      for (const key of Object.keys(d.dailyOverrides)) {
        const o = d.dailyOverrides[key];
        if (o) {
          if (o.present && !Array.isArray(o.present)) o.present = Object.values(o.present);
          if (o.scheduled && !Array.isArray(o.scheduled)) o.scheduled = Object.values(o.scheduled);
        }
      }
    }
    return d;
  };

  // ─── saveData — debounced, optimistic ──────────────────────────────
  // Rapid In/Out toggles, note edits etc. used to fire one fetch per
  // click. With network latency that meant 500ms+ per action. Now:
  //
  //   1. setData() updates UI immediately (already optimistic)
  //   2. The actual POST is debounced 250ms — multiple saves coalesce
  //   3. The "latest" data wins because we save state.dataRef.current
  //      at flush time, so we always POST the freshest data
  //
  // This means clicking In/Out 5 times rapidly = 1 network round-trip
  // instead of 5. Save still happens within ~300ms of the last click.
  const pendingSaveRef = useRef({ timer: null, latestData: null, showIndicator: false, pendingResolves: [] });

  const flushSave = useCallback(async () => {
    const pending = pendingSaveRef.current;
    if (!pending.latestData) return;
    const dataToSend = pending.latestData;
    const showIndicator = pending.showIndicator;
    const resolves = pending.pendingResolves;
    pending.latestData = null;
    pending.showIndicator = false;
    pending.pendingResolves = [];
    pending.timer = null;

    // ─── Huddle CSV data: write directly to Supabase ───────────────────
    // The parsed CSV blob can be megabytes (an EMIS export with 18k
    // lines covering multiple years produces several MB of slotRows
    // + per-date breakdowns). Vercel serverless functions reject
    // request bodies over 4.5MB with FUNCTION_PAYLOAD_TOO_LARGE, so we
    // can't route huddleCsvData through /api/v4/data. Instead we use
    // the browser's authenticated Supabase session to UPSERT it
    // directly — RLS on huddle_csv_data ensures only practice admins
    // can write. Audit row in csv_uploads via the same path.
    //
    // Once the CSV is on disk in Supabase, we strip it from the
    // /api/v4/data body so the small-payload diff stuff still goes
    // through the API as before.
    const csvChanged = dataToSend.huddleCsvData && dataToSend.huddleCsvData !== lastSentCsvRef.current;
    let csvWriteError = null;
    if (csvChanged) {
      try {
        const { data: uploadRow, error: uploadErr } = await supabase
          .from('csv_uploads')
          .insert({
            practice_id: practiceId,
            uploaded_by: (await supabase.auth.getUser()).data?.user?.id,
            uploaded_at: new Date().toISOString(),
            filename: 'browser-upload',
            notes: 'Uploaded via Today page',
          })
          .select('id')
          .single();
        if (uploadErr) throw uploadErr;
        const { error: csvErr } = await supabase
          .from('huddle_csv_data')
          .upsert({
            practice_id: practiceId,
            data: dataToSend.huddleCsvData,
            upload_id: uploadRow?.id || null,
          });
        if (csvErr) throw csvErr;
        lastSentCsvRef.current = dataToSend.huddleCsvData;
      } catch (e) {
        // Don't abort the rest of the save — small fields (clinicians,
        // weeklyRota, etc.) can still go through. But surface what
        // happened so the user knows the CSV didn't land.
        console.error('Direct CSV upload failed:', e);
        csvWriteError = e?.message || 'CSV upload failed';
      }
    }

    // Always strip huddleCsvData from the API body — it's huge and
    // doesn't need to go through Vercel even when unchanged. The
    // server's mutation 5 stays in place for compatibility with
    // anything else that might POST it (deprecated paths, scripts).
    const bodyToSend = { ...dataToSend, huddleCsvData: undefined };

    try {
      const res = await fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyToSend),
      });
      const result = await res.json().catch(() => ({}));
      if (csvWriteError) {
        toast(`CSV save failed: ${csvWriteError}`, 'error');
      } else if (!res.ok) {
        toast(result.error || 'Save failed', 'error');
      } else if (result.errors?.length) {
        toast(`Partial save: ${result.errors.length} errors — ${result.errors[0]}`, 'error');
      } else if (showIndicator) {
        toast('Saved', 'success', 1500);
      }
      resolves.forEach(r => r(result));
    } catch (err) {
      console.error('Save failed:', err);
      toast('Save failed', 'error');
      resolves.forEach(r => r({ error: err.message }));
    }
  }, [practiceId, supabase, toast]);

  const saveData = useCallback((newData, showIndicator = true) => {
    // Pre-process: assign UUIDs to any new clinicians (v3 components use Date.now())
    const isUuid = (v) => typeof v === 'string' && v.length === 36 && v.split('-').length === 5;
    const idMap = {};
    if (Array.isArray(newData.clinicians)) {
      newData.clinicians = newData.clinicians.map(c => {
        if (isUuid(c.id)) return c;
        const newId = crypto.randomUUID();
        idMap[c.id] = newId;
        return { ...c, id: newId };
      });
    }
    if (Object.keys(idMap).length > 0) {
      if (newData.weeklyRota) {
        for (const day of Object.keys(newData.weeklyRota)) {
          newData.weeklyRota[day] = (newData.weeklyRota[day] || []).map(id => idMap[id] || id);
        }
      }
      if (Array.isArray(newData.plannedAbsences)) {
        newData.plannedAbsences = newData.plannedAbsences.map(a =>
          idMap[a.clinicianId] ? { ...a, clinicianId: idMap[a.clinicianId] } : a
        );
      }
      if (newData.dailyOverrides) {
        for (const k of Object.keys(newData.dailyOverrides)) {
          const o = newData.dailyOverrides[k];
          if (o?.present) o.present = o.present.map(id => idMap[id] || id);
          if (o?.scheduled) o.scheduled = o.scheduled.map(id => idMap[id] || id);
        }
      }
    }

    // Optimistic local update
    setData(newData);
    setDataVersion(v => v + 1);

    // Schedule debounced flush
    const pending = pendingSaveRef.current;
    pending.latestData = newData;
    pending.showIndicator = pending.showIndicator || showIndicator;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => { flushSave(); }, 250);

    // Return a promise in case caller wants to await; resolves when flush completes
    return new Promise((resolve) => { pending.pendingResolves.push(resolve); });
  }, [flushSave]);

  // Flush any pending save when the user navigates away (or component unmounts)
  useEffect(() => {
    const onBeforeUnload = (e) => {
      const pending = pendingSaveRef.current;
      if (pending.timer) {
        clearTimeout(pending.timer);
        // We can't await the fetch on beforeunload reliably, so use sendBeacon
        // (fire-and-forget, browser keeps it alive after page unload).
        // Always strip huddleCsvData here — sendBeacon hits the same 4.5MB
        // Vercel limit and we can't direct-upload to Supabase during
        // unload (would need an await). Any unsaved CSV will be re-sent
        // on next dashboard load via the normal flush.
        try {
          const dataToSend = pending.latestData;
          if (dataToSend) {
            const bodyToSend = { ...dataToSend, huddleCsvData: undefined };
            const blob = new Blob([JSON.stringify(bodyToSend)], { type: 'application/json' });
            navigator.sendBeacon(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`, blob);
          }
        } catch {}
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Component unmounting — flush immediately
      const pending = pendingSaveRef.current;
      if (pending.timer) {
        clearTimeout(pending.timer);
        flushSave();
      }
    };
  }, [practiceId, flushSave]);

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };

  // All of these helpers are copied verbatim from v3 — the data shape is identical
  const getDateKey = () => { const dayIndex = DAYS.indexOf(selectedDay); const date = new Date(selectedWeek); date.setDate(date.getDate() + dayIndex); return toLocalIso(date); };
  const getDateKeyForDay = (day) => { const dayIndex = DAYS.indexOf(day); const date = new Date(selectedWeek); date.setDate(date.getDate() + dayIndex); return toLocalIso(date); };
  const getTodayKey = () => toLocalIso(new Date());
  const isPastDate = (dateKey) => dateKey < getTodayKey();
  const isToday = (dateKey) => dateKey === getTodayKey();
  const isClosedDay = (dateKey) => {
    // Manual entry in data.closedDays still wins
    if (data?.closedDays?.[dateKey] !== undefined) return true;
    // Auto-detect bank holidays from the demand predictor
    try {
      const d = new Date(dateKey + 'T12:00:00');
      const pred = predictDemand(d, null);
      if (pred?.isBankHoliday) return true;
    } catch {}
    return false;
  };
  const getClosedReason = (dateKey) => {
    if (data?.closedDays?.[dateKey] !== undefined) return data.closedDays[dateKey];
    try {
      const d = new Date(dateKey + 'T12:00:00');
      const pred = predictDemand(d, null);
      if (pred?.isBankHoliday) return 'Bank Holiday';
    } catch {}
    return '';
  };
  const toggleClosedDay = (dateKey, reason = 'Bank Holiday') => { if (isPastDate(dateKey)) return; const newClosedDays = { ...data.closedDays }; if (newClosedDays[dateKey]) delete newClosedDays[dateKey]; else newClosedDays[dateKey] = reason; saveData({ ...data, closedDays: newClosedDays }); };
  const hasPlannedAbsence = (clinicianId, dateKey) => ensureArray(data?.plannedAbsences).some(a => a.clinicianId === clinicianId && dateKey >= a.startDate && dateKey <= a.endDate);
  const getPlannedAbsenceReason = (clinicianId, dateKey) => { const absence = ensureArray(data?.plannedAbsences).find(a => a.clinicianId === clinicianId && dateKey >= a.startDate && dateKey <= a.endDate); return absence?.reason || 'Leave'; };
  const getScheduledForDay = (day) => { const dateKey = getDateKeyForDay(day); const dayKey = `${dateKey}-${day}`; if (data?.dailyOverrides?.[dayKey]?.scheduled) return ensureArray(data.dailyOverrides[dayKey].scheduled); const rota = ensureArray(data?.weeklyRota?.[day]); return rota.filter(id => { const c = data?.clinicians?.find(c => c.id === id); return c && !c.longTermAbsent; }); };
  // Cache day-status computations keyed by (dateKey, day, dataVersion).
  // The previous implementation reset the entire cache on every miss,
  // making it useless. Now we accumulate but evict stale entries (those
  // from a previous dataVersion) to bound memory.
  const dayStatusCache = useRef({ version: 0, entries: {} });
  const getCachedDayStatus = (dateKey, day) => {
    const cache = dayStatusCache.current;
    if (cache.version !== dataVersion) {
      // dataVersion bumped — drop stale entries
      cache.version = dataVersion;
      cache.entries = {};
    }
    const cacheKey = `${dateKey}-${day}`;
    if (cache.entries[cacheKey] === undefined) {
      cache.entries[cacheKey] = computeDayStatus(data, dateKey, day);
    }
    return cache.entries[cacheKey];
  };
  const getPresentClinicians = (day) => getCachedDayStatus(getDateKeyForDay(day), day).present;
  const getAbsentClinicians = (day) => getCachedDayStatus(getDateKeyForDay(day), day).absent;
  const getDayOffClinicians = (day) => getCachedDayStatus(getDateKeyForDay(day), day).dayOff;
  const getClinicianStatus = (id, day) => { const s = getCachedDayStatus(getDateKeyForDay(day), day); if (s.present.includes(id)) return 'present'; if (s.absent.includes(id)) return 'absent'; return 'dayoff'; };

  // ── Change history (cover + rota edits) ──────────────────────────
  // Every attendance/rota edit is recorded in data.changeLog (capped at
  // 300 entries, newest first) with who/when/what, and can be reverted
  // from the History panel on the buddy cover page.
  const withChange = (d, entry) => ({ ...d, changeLog: [{ ts: Date.now(), uid: data?._v4?.userId || null, who: data?._v4?.userName || data?._v4?.userEmail || 'Unknown', ...entry }, ...ensureArray(d.changeLog)].slice(0, 300) });
  const clinicianLabel = (id) => { const c = ensureArray(data.clinicians).find(c => c.id === id); return c?.name || c?.initials || 'Unknown'; };
  const revertChange = (entry) => {
    if (entry.type === 'status') {
      if (getDateKeyForDay(entry.day) !== entry.dateKey) { toast?.('That date is no longer in the editable week', 'warning'); return; }
      togglePresence(entry.clinicianId, entry.day, entry.from);
    } else if (entry.type === 'rota') {
      const inNow = ensureArray(data.weeklyRota?.[entry.day]).includes(entry.clinicianId);
      const wantIn = entry.from === 'working';
      if (inNow === wantIn) { toast?.('Already back to the previous state', 'warning'); return; }
      toggleRotaDay(entry.clinicianId, entry.day);
    }
  };

  const togglePresence = (id, day, targetStatus) => {
    const dateKey = getDateKeyForDay(day); if (isPastDate(dateKey)) return;
    const dayKey = `${dateKey}-${day}`; const scheduled = getScheduledForDay(day); const currentPresent = ensureArray(getPresentClinicians(day));
    const currentStatus = getClinicianStatus(id, day);
    const next = targetStatus || (currentStatus === 'present' ? 'dayoff' : currentStatus === 'dayoff' ? 'absent' : 'present');
    let newPresent = [...currentPresent];
    let newScheduled = [...scheduled];
    if (next === 'present') { if (!newPresent.includes(id)) newPresent.push(id); if (!newScheduled.includes(id)) newScheduled.push(id); }
    else if (next === 'absent') { newPresent = newPresent.filter(cid => cid !== id); if (!newScheduled.includes(id)) newScheduled.push(id); }
    else { newPresent = newPresent.filter(cid => cid !== id); newScheduled = newScheduled.filter(cid => cid !== id); }
    const prevDayMeta = data.dailyOverrides?.[dayKey]?.meta || {};
    const overrideMeta = { ...prevDayMeta, [id]: { at: new Date().toISOString(), by: data?._v4?.userDisplayName || data?._v4?.userEmail || null, to: next } };
    const newOverrides = { ...data.dailyOverrides, [dayKey]: { present: newPresent, scheduled: newScheduled, meta: overrideMeta } };
    const clins = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
    const absentIds = newScheduled.filter(sid => !newPresent.includes(sid));
    const dayOffIds = clins.filter(c => !newScheduled.includes(c.id) && !c.longTermAbsent).map(c => c.id);
    const { allocations, dayOffAllocations } = generateBuddyAllocations(clins, newPresent, absentIds, dayOffIds, data.settings || DEFAULT_SETTINGS);
    const plannedAbs = ensureArray(data.plannedAbsences);
    const rota = ensureArray(data.weeklyRota?.[day]);
    const naturalPresent = new Set(rota.filter(rid => { const c = clins.find(c => c.id === rid); return c && !c.longTermAbsent && !plannedAbs.some(a => a.clinicianId === rid && dateKey >= a.startDate && dateKey <= a.endDate); }));
    const overrideSet = new Set(newPresent);
    const overriddenIds = [];
    overrideSet.forEach(oid => { if (!naturalPresent.has(oid)) overriddenIds.push(oid); });
    naturalPresent.forEach(nid => { if (!overrideSet.has(nid)) overriddenIds.push(nid); });
    const newHistory = { ...data.allocationHistory, [dateKey]: { date: dateKey, day, allocations, dayOffAllocations, presentIds: newPresent, absentIds, dayOffIds, hasOverride: overriddenIds.length > 0, overriddenIds } };
    saveData(withChange({ ...data, dailyOverrides: newOverrides, allocationHistory: newHistory }, { type: 'status', day, dateKey, clinicianId: id, clinician: clinicianLabel(id), from: currentStatus, to: next }));
  };

  const getCurrentAllocations = () => data?.allocationHistory?.[getDateKey()] || null;
  const getClinicianById = (id) => ensureArray(data?.clinicians).find(c => c.id === id);

  const syncTeamNet = async (silent = false) => {
    if (!data?.teamnetUrl) {
      if (!silent) { setSyncStatus('Set TeamNet URL in Settings first'); setTimeout(() => setSyncStatus(''), 4000); }
      return;
    }
    if (!silent) setSyncStatus('Syncing...');
    try {
      const res = await fetch(`/api/v4/sync-teamnet?practice=${encodeURIComponent(practiceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: data.teamnetUrl, clinicians: ensureArray(data.clinicians) }),
      });
      const result = await res.json();
      if (result.error) {
        if (!silent) setSyncStatus(`Error: ${result.error}`);
      } else {
        const newAbsences = result.absences || [];
        // Merge — replace plannedAbsences with synced ones (matches v3 behaviour)
        saveData({ ...data, plannedAbsences: [...(Array.isArray(data.plannedAbsences) ? data.plannedAbsences : []).filter(a => a.source !== 'teamnet'), ...newAbsences], lastSyncTime: new Date().toISOString() }, false);
        if (!silent) setSyncStatus(`Synced — ${newAbsences.length} absences`);
      }
    } catch (err) {
      if (!silent) setSyncStatus('Sync failed');
    }
    if (!silent) setTimeout(() => setSyncStatus(''), 4000);
  };

  // ═══ Wind-down sweep ═══
  // Resolve clinician status transitions on load: leavers whose cover
  // period has ended become status 'left'; long-term-sick clinicians whom
  // EMIS now shows with booked sessions are marked back (their absence is
  // truncated). Runs once per load for editors, only when huddle data is
  // present so the EMIS check is meaningful.
  // ── AUTO cover regeneration ─────────────────────────────────────────
  // The user should never need the "generate next 4 weeks" button after
  // routine changes. Watch a fingerprint of every cover input (statuses,
  // wind-downs, presence overrides, absences, rota, closed days); when it
  // moves after initial load, regenerate the 4-week window - debounced,
  // silent save, manual overrides re-applied where still valid.
  // allocationHistory is excluded from the fingerprint, so regeneration
  // can never re-trigger itself.
  const coverFpRef = useRef(null);
  const coverRegenTimer = useRef(null);
  useEffect(() => {
    if (!data) return;
    const fp = coverInputsFingerprint(data);
    if (coverFpRef.current === null) { coverFpRef.current = fp; return; } // baseline on load
    if (fp === coverFpRef.current) return;
    coverFpRef.current = fp;
    if (!canEditPracticeData(data)) return;
    if (coverRegenTimer.current) clearTimeout(coverRegenTimer.current);
    coverRegenTimer.current = setTimeout(() => {
      try {
        const res = regenerateCoverWindow(data);
        if (res.changed) {
          saveData(res.data, false);
          toast('Buddy cover updated for the next 4 weeks', 'info', 3500);
        }
      } catch (e) {
        console.error('[gpdash] auto cover regen failed:', e?.message);
      }
    }, 1200);
    return () => { if (coverRegenTimer.current) clearTimeout(coverRegenTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const windDownSweepDone = useRef(false);
  useEffect(() => {
    if (windDownSweepDone.current) return;
    if (!data || !huddleData || !canEditPracticeData(data)) return;
    windDownSweepDone.current = true;
    try {
      const res = sweepWindDowns(data, huddleData, { getDateKeyForDay });
      if (res.changed) {
        // Audit every automatic change - the sweep acts on its own, so a
        // paper trail matters even more than for manual actions.
        let swept = res.data;
        res.events.forEach((msg) => { swept = logEvent(swept, 'staff', `Automatic: ${msg}`); });
        saveData(swept, false);
        // Direct clinician-row writes - the bulk route is insert-only for
        // clinicians, so status/wind_down changes must land explicitly.
        try {
          const sb = supabaseRef.current || (supabaseRef.current = createBrowserClient());
          (res.dbUpdates || []).forEach((u) => {
            sb.from('clinicians').update(u.fields).eq('id', u.clinicianId)
              .then(({ error }) => { if (error) console.error('[gpdash] sweep persist failed:', error.message); });
          });
        } catch (e) { console.error('[gpdash] sweep persist error:', e?.message); }
        res.events.forEach((msg) => toast(msg, 'info', 6000));
      }
    } catch (e) { console.error('[gpdash] wind-down sweep failed:', e?.message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, huddleData]);

  // ═══ Daily automatic TeamNet sync ═══
  // Answering "what generates the TeamNet sync": previously ONLY the manual
  // Sync buttons. Now: once per browser per day, a couple of seconds after the
  // dashboard loads, we run the same sync silently so planned absences (and
  // therefore the buddy inconsistency checks) stay current without anyone
  // remembering to press the button. localStorage-gated so multiple tabs or
  // reloads the same day do not re-sync.
  useEffect(() => {
    if (!data?.teamnetUrl || !practiceId) return;
    const key = `gpdash-teamnet-daily-${practiceId}`;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch { return; }
    const t = setTimeout(() => { syncTeamNet(true); }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.teamnetUrl, practiceId]);

  const getWeekAbsences = () => {
    const absences = ensureArray(data?.plannedAbsences);
    const weekStart = toLocalIso(selectedWeek);
    const weekEndDate = new Date(selectedWeek); weekEndDate.setDate(weekEndDate.getDate() + 4);
    const weekEnd = toLocalIso(weekEndDate);
    const weekAbsences = [];
    absences.forEach(a => { DAYS.forEach(day => { const dateKey = getDateKeyForDay(day); if (dateKey >= a.startDate && dateKey <= a.endDate && dateKey >= weekStart && dateKey <= weekEnd) { const clinician = getClinicianById(a.clinicianId); if (clinician) weekAbsences.push({ day, clinician, reason: a.reason }); } }); });
    return weekAbsences;
  };

  const toggleRotaDay = (clinicianId, day) => { const currentRota = ensureArray(data.weeklyRota[day]); const wasIn = currentRota.includes(clinicianId); const newRota = wasIn ? currentRota.filter(id => id !== clinicianId) : [...currentRota, clinicianId]; saveData(withChange({ ...data, weeklyRota: { ...data.weeklyRota, [day]: newRota } }, { type: 'rota', day, clinicianId, clinician: clinicianLabel(clinicianId), from: wasIn ? 'working' : 'off', to: wasIn ? 'off' : 'working' })); };
  const removeClinician = async (id) => { if (!(await confirmDialog({ message: 'Remove this clinician?', danger: true }))) return; const newClinicians = ensureArray(data.clinicians).filter(c => c.id !== id); const newRota = { ...data.weeklyRota }; DAYS.forEach(day => { newRota[day] = ensureArray(newRota[day]).filter(cid => cid !== id); }); saveData({ ...data, clinicians: newClinicians, weeklyRota: newRota }); };
  const updateClinicianField = (id, field, value) => { const newClinicians = ensureArray(data.clinicians).map(c => { if (c.id !== id) return c; let pv = value; if (field === 'sessions') pv = parseInt(value) || 6; if (field === 'primaryBuddy' || field === 'secondaryBuddy') pv = value ? (/^\d+$/.test(String(value)) ? parseInt(value) : value) : null; return { ...c, [field]: pv }; }); saveData({ ...data, clinicians: newClinicians }); };

  // Loading state
  if (loading && !data) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}><PageSkeleton /></div>;
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f172a', color: '#94a3b8', fontSize: 14 }}>No data loaded.</div>;
  }

  const helpers = { ensureArray, getDateKey, getDateKeyForDay, getTodayKey, isPastDate, isToday, isClosedDay, getClosedReason, toggleClosedDay, hasPlannedAbsence, getPlannedAbsenceReason, getPresentClinicians, getAbsentClinicians, getDayOffClinicians, getClinicianStatus, togglePresence, getCurrentAllocations, getClinicianById, getWeekAbsences, syncTeamNet, toggleRotaDay, removeClinician, updateClinicianField, dataVersion, setDataVersion, setData };

  // password is empty in v4 — components that look at it will get '' (BuddyDaily uses it for sync-teamnet which we've stubbed)
  const password = '';

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--app-bg)' }}>
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} data={data} />
      <main className="flex-1 min-h-screen min-w-0" style={{ background: 'var(--app-bg)' }}>
        <SectionErrorBoundary key={activeSection} section={activeSection} practice={data?._v4?.practiceName}>
        <div className={`${(activeSection === 'huddle-forward' || activeSection === 'workforce-planner') ? '' : 'max-w-6xl mx-auto '}px-4 pb-4 pt-14 lg:p-6 animate-in`}>
          {/* "Is this you?" — auto-suggest matching clinician records when
              the signed-in user has a surname but isn't yet linked. */}
          <LinkClinicianSuggest data={data} />

          {/* Practice setup — section-by-section status strip. Auto-hides
              once everything's green. Click any segment to jump to that
              tab on the practice management page. */}
          {canEditPracticeData(data) && sectionStatuses && (
            <DashboardCompletenessStrip
              statuses={sectionStatuses}
              practicePath={practiceManagementPath}
            />
          )}

          {/* "Review your team" banner — appears when there are clinicians
              needing attention (missing initials or placeholder role like
              "Staff"). Most likely to fire right after a CSV upload, when
              a fresh practice has lots of CSV-discovered names with no
              initials and generic roles. Disappears as the user works
              through them. Only visible to admins/owners (the people
              with permission to fix it). */}
          {(() => {
            if (!canEditPracticeData(data)) return null;
            const PLACEHOLDER_ROLES = new Set(['', 'Staff', 'Unknown']);
            const needCount = ensureArray(data.clinicians).filter(c =>
              c.status !== 'left' && (
                !c.initials || c.initials.trim().length === 0 ||
                PLACEHOLDER_ROLES.has((c.role || '').trim())
              )
            ).length;
            if (needCount === 0) return null;
            const slug = data._v4?.practiceSlug || practiceId;
            return (
              <div style={{
                marginBottom: 20,
                padding: '14px 16px',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 'var(--r-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                lineHeight: 1.5,
              }}>
                <div style={{ fontSize: 13, color: '#cbd5e1', flex: '1 1 280px', minWidth: 0 }}>
                  <strong className="text-amber-400">Review your team</strong>
                  {' · '}{needCount} clinician{needCount === 1 ? '' : 's'} need{needCount === 1 ? 's' : ''} a role and initials. Quick setup is one row each, saves automatically.
                </div>
                <a
                  href={`/v4/practice/${slug}?tab=clinicians`}
                  style={{
                    fontSize: 12, fontWeight: 500, color: 'white',
                    background: '#d97706',
                    padding: '8px 14px', borderRadius: 'var(--r-sm)',
                    textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >Quick setup →</a>
              </div>
            );
          })()}
          <Suspense fallback={<div className="text-sm text-slate-400 py-12 text-center">Loading…</div>}>
          {activeSection === 'buddy-cover' && <BuddyDaily data={data} saveData={saveData} password={password} toast={toast} selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} selectedDay={selectedDay} setSelectedDay={setSelectedDay} syncStatus={syncStatus} setSyncStatus={setSyncStatus} isGenerating={isGenerating} setIsGenerating={setIsGenerating} helpers={helpers} huddleData={huddleData} setActiveSection={setActiveSection} onRevertChange={revertChange} />}
          {huddleLoading && ['huddle-today','huddle-rota','huddle-forward','reporting'].includes(activeSection) && <PageSkeleton />}
          {activeSection === 'huddle-today' && !huddleLoading && <HuddleToday data={data} saveData={saveData} toast={toast} huddleData={huddleData} setHuddleData={setHuddleData} huddleMessages={huddleMessages} setHuddleMessages={setHuddleMessages} setActiveSection={setActiveSection} />}
          {activeSection === 'huddle-rota' && !huddleLoading && <MyRota data={data} saveData={saveData} huddleData={huddleData} setActiveSection={setActiveSection} />}
          {activeSection === 'meetings' && <Meetings data={data} />}
          {activeSection === 'huddle-forward' && !huddleLoading && <HuddleForward data={data} saveData={saveData} huddleData={huddleData} setActiveSection={setActiveSection} />}
          {activeSection === 'reporting' && !huddleLoading && <WorkloadAudit data={data} huddleData={huddleData} />}
          {activeSection === 'workforce-planner' && <WorkforcePlanner data={data} toast={toast} />}
          {activeSection === 'spend' && !huddleLoading && <SpendTracker data={data} saveData={saveData} huddleData={huddleData} setActiveSection={setActiveSection} />}
          {/* team-members section retired in v4.14.0 — Clinicians lives at
              Practice → Clinicians now. If something still navigates to
              this section ID (deep links from older URLs, third-party
              docs), redirect on render rather than 404. */}
          {activeSection === 'team-members' && (
            <RedirectToClinicians slug={data?._v4?.practiceSlug} />
          )}
          {activeSection === 'team-rota' && <TeamRota data={data} saveData={saveData} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'settings' && <BuddySettings data={data} saveData={saveData} password={password} syncStatus={syncStatus} setSyncStatus={setSyncStatus} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'changelog' && <Changelog />}
          {activeSection === 'account' && <AccountSettings data={data} />}
          {activeSection === 'room-settings' && <RoomSettings data={data} saveData={saveData} toast={toast} huddleData={huddleData} />}
          {activeSection === 'room-dashboard' && <RoomDashboard data={data} saveData={saveData} huddleData={huddleData} toast={toast} />}
          </Suspense>
        </div>
        <footer className="mt-8 pb-6">
          <div className="text-center text-xs text-slate-400">
            GPDash — {data._v4?.practiceName || 'Practice'} · v4 Postgres
            {canEditPracticeData(data) && (
              <>
                {' · '}
                <a href={`/v4/practice/${data._v4?.practiceSlug || practiceId}`} style={{ color: '#94a3b8', textDecoration: 'underline' }}>Manage practice</a>
              </>
            )}
            {isPlatformAdmin(data) && (
              <>
                {' · '}
                <a href="/v4/admin" style={{ color: '#22d3ee', textDecoration: 'underline' }}>Platform admin</a>
              </>
            )}
            {' · '}
            {allPractices.length > 1 ? (
              <select
                value={practiceId}
                onChange={(e) => {
                  const p = allPractices.find(x => x.id === e.target.value);
                  router.push(`/p/${p?.slug || e.target.value}`);
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(148,163,184,0.3)',
                  color: '#94a3b8',
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                }}
              >
                {allPractices.map(p => (
                  <option key={p.id} value={p.id} style={{ background: '#0f172a', color: '#e2e8f0' }}>
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>
            ) : (
              <a href="/v4/dashboard" style={{ color: '#94a3b8', textDecoration: 'underline' }}>Switch practice</a>
            )}
            {' · '}
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push('/v4/login'); }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
            >Sign out</button>
          </div>
        </footer>
      </SectionErrorBoundary>
      </main>
      {searchParams.get('debug') === 'perf' && (
        <Suspense fallback={null}>
          <PerfOverlay serverTimings={serverTimings} />
        </Suspense>
      )}
    </div>
  );
}
