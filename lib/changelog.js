export const CHANGELOG = [
  {
    version: '4.0.12',
    date: '2026-05-04',
    title: 'Perf debug overlay',
    changes: [
      { type: 'feature', text: 'New on-page debug overlay shows where load time goes. Add ?debug=perf to any /dashboard URL to enable. Shows server-side query timings (passed via SSR — Vercel was stripping our Server-Timing headers), TTFB, paint timings, JS hydration, transferred KB, region, and cold-start indicator' },
      { type: 'feature', text: 'Copy button bundles all metrics as plain text for sharing. Hide button collapses overlay to a small badge' },
      { type: 'improvement', text: 'Cold-start detection: tracks whether the function instance was freshly booted (Vercel reuses Node processes between requests until they idle out)' },
    ]
  },
  {
    version: '4.0.11',
    date: '2026-05-04',
    title: 'Move serverless functions to London region',
    changes: [
      { type: 'improvement', text: 'Functions were running in Vercel\'s Washington DC region (iad1) by default while Supabase is in London (eu-west-2). Every database query was crossing the Atlantic twice. Now pinned to lhr1 (London) so functions and database share a region' },
      { type: 'improvement', text: 'Expected to remove 300-500ms from every dashboard load and every save. Single biggest perf win available — bigger than the SSR / parallel query work combined, because it removes the floor those optimisations were running into' },
      { type: 'improvement', text: 'No code changes — added vercel.json with regions: ["lhr1"]. Affects all deployments from this branch onwards' },
    ]
  },
  {
    version: '4.0.10',
    date: '2026-05-03',
    title: 'Server-side rendering — first paint with data',
    changes: [
      { type: 'improvement', text: 'Dashboard is now server-rendered. The HTML arrives with all your data inlined — no client-side fetch, no loading spinner, no waiting' },
      { type: 'improvement', text: 'Eliminates a full network round-trip on cold load. The server fetches data while assembling the page, so by the time the HTML hits the browser it is already populated' },
      { type: 'improvement', text: 'Working patterns / absences / rota notes queries now use embedded foreign-key joins. Removed the serial pre-query for clinician IDs — saves another ~200ms' },
      { type: 'improvement', text: 'Dashboard does not run middleware any more (was matching everything-not-static). Direct request → handler with no auth detour' },
      { type: 'improvement', text: 'API responses include Server-Timing headers so we can see in DevTools how long each phase takes (setup, queries, shape, total)' },
    ]
  },
  {
    version: '4.0.9',
    date: '2026-05-03',
    title: 'Major load-time speedups',
    changes: [
      { type: 'improvement', text: 'Initial page load now needs only one round-trip. Previously: client did auth check → query practices → fetch data; each chained sequentially with auth latency. Now: dashboard fetches data immediately and the API returns everything at once' },
      { type: 'improvement', text: 'Server-side: every Supabase query for a page load fires in a single Promise.all batch (9 queries in parallel) — previously chained in 3 sequential rounds. Cuts API response time from ~1500ms to ~400ms' },
      { type: 'improvement', text: 'Middleware no longer runs on /api/* and /dashboard routes. Previously every request paid for an additional Supabase auth round-trip in the middleware before the actual handler — adding 150-400ms to every fetch. Now middleware only runs on / and /v4/* where it actually does something' },
      { type: 'improvement', text: 'Dashboard data response gets cache-control: private, max-age=10, stale-while-revalidate=60 — back/forward navigation and rapid reloads use the cached response' },
      { type: 'improvement', text: 'Practices list (for the picker) inlined in the data response, removing a separate query' },
    ]
  },
  {
    version: '4.0.8',
    date: '2026-05-03',
    title: 'Performance: debounced saves, fast path, lazy loading',
    changes: [
      { type: 'improvement', text: 'Saves are now debounced 250ms — rapid In/Out clicks coalesce into a single network request instead of one per click. Massive bandwidth + DB load reduction during active editing' },
      { type: 'feature', text: 'Pending saves flush automatically when navigating away (sendBeacon) or when the tab closes — no lost edits' },
      { type: 'improvement', text: 'Server fast path for delta-only saves (overrides, allocations, notes, sync time): skips the full data load + diff entirely. Most everyday saves now run in ~100ms instead of ~500ms' },
      { type: 'improvement', text: 'Section components (BuddyDaily, HuddleToday, MyRota, etc.) now lazy-loaded. Initial dashboard bundle is much smaller; sections download on first navigation' },
    ]
  },
  {
    version: '4.0.7',
    date: '2026-05-03',
    title: 'Performance: faster saves, faster loads',
    changes: [
      { type: 'improvement', text: 'Saves no longer round-trip the CSV blob (often hundreds of KB) when CSV is unchanged. Routine actions like toggling In/Out, editing notes, or generating buddy allocations now send only the data that changed' },
      { type: 'improvement', text: 'Server skips loading CSV from the database when computing save diffs unless CSV is part of the save. Halves the work for typical saves' },
      { type: 'improvement', text: 'Working patterns and absences queries now use practice-scoped IN filters, faster than relying on RLS alone' },
      { type: 'improvement', text: 'Practice members list no longer loaded on every dashboard render — only fetched on the practice management page where it is actually shown' },
      { type: 'fix', text: 'Day-status cache was resetting itself on every lookup, defeating the purpose. Now correctly accumulates across calls and evicts only when the underlying data changes. Pages with many day cells (BuddyDaily, HuddleForward) feel noticeably snappier' },
    ]
  },
  {
    version: '4.0.6',
    date: '2026-05-03',
    title: 'Working pattern auto-gen — graceful degradation',
    changes: [
      { type: 'feature', text: 'When the standard ≥50% rule finds no working days for a clinician, auto-gen now falls back to "look at the most recent 4 weeks of activity" and uses those days as their pattern. Clinicians returning from extended absence get a sensible answer instead of being marked empty' },
      { type: 'feature', text: 'Clinicians flagged DATA INCOMPLETE when neither the standard rule nor the fallback could infer any days. The row in the table is highlighted red with a "Set manually" badge so you know to edit it' },
      { type: 'feature', text: 'Auto-gen report now colour-codes each row: amber for "recent activity only" (fallback was used), red for "data incomplete", plain for normal. Counts of each shown in the explainer below' },
    ]
  },
  {
    version: '4.0.5',
    date: '2026-05-03',
    title: 'Auto TeamNet sync',
    changes: [
      { type: 'feature', text: 'TeamNet calendar now syncs automatically when you open the dashboard, if more than 6 hours have passed since the last sync. Runs in the background — no waiting' },
      { type: 'improvement', text: '"Last: …" timestamp under the Sync button on Settings reflects the most recent successful sync, including auto-syncs' },
      { type: 'improvement', text: 'Sync state (lastSyncTime) now persisted to the database so it survives reloads and is shared across users in the same practice' },
    ]
  },
  {
    version: '4.0.4',
    date: '2026-05-03',
    title: 'Auto-gen now leave-aware',
    changes: [
      { type: 'improvement', text: 'Working pattern auto-gen now considers planned absences. Weeks where a clinician was on leave are excluded from the denominator, so a 4-week holiday no longer drops them off their normal working days' },
      { type: 'improvement', text: 'Added a sparse-history fallback: if a clinician was on leave for most of the analysed window but appeared at least once on a given weekday when not on leave, that day is marked as theirs. Handles clinicians returning from extended absence' },
    ]
  },
  {
    version: '4.0.3',
    date: '2026-05-03',
    title: 'Working pattern auto-gen now actually works',
    changes: [
      { type: 'fix', text: 'Working pattern auto-gen was checking the wrong dates. CSV stores dates as "03-May-2026" but we were treating them as ISO format ("2026-05-03"), producing Invalid Date for every entry, so no weekday buckets had any dates and nothing matched' },
      { type: 'fix', text: 'CSV dates can include far-future planning entries (2033 etc). Now we filter to past-only dates and sort chronologically (using parseHuddleDateStr instead of string compare which would put 2033 dates above 2026)' },
      { type: 'improvement', text: 'Window widened to up to 84 days (~12 weeks of daily history) so we have enough samples per weekday' },
    ]
  },
  {
    version: '4.0.2',
    date: '2026-05-03',
    title: 'Working pattern auto-gen — initials fallback',
    changes: [
      { type: 'fix', text: 'Working Patterns auto-generate now finds clinicians even when CSV names format differently — falls back to initials match if name match fails' },
      { type: 'improvement', text: 'Auto-gen summary now shows what each clinician was matched against in the CSV (or flags "no CSV match" so you know which ones to edit manually)' },
    ]
  },
  {
    version: '4.0.1',
    date: '2026-05-03',
    title: 'Account settings, fixes',
    changes: [
      { type: 'feature', text: 'Account section in sidebar — sign-in details, linked clinician, password change, sign out, and a placeholder for upcoming calendar subscription' },
      { type: 'fix', text: 'Manage practice page no longer crashes — duplicate clinician card removed and missing variable reference fixed' },
      { type: 'improvement', text: 'Single unified clinician self-link UI on the practice management page (replaces the duplicate one)' },
    ]
  },
  {
    version: '4.0.0',
    date: '2026-05-03',
    title: 'Multi-tenant SaaS rebuild',
    changes: [
      { type: 'feature', text: 'Per-user accounts with proper authentication — sign up, log in, password reset, no more shared password' },
      { type: 'feature', text: 'Multi-tenant: practices are isolated, each with their own data; users can belong to one or more practices' },
      { type: 'feature', text: 'Invite team members by email — they sign up and join your practice' },
      { type: 'feature', text: 'Roles: owner / admin / member — only admins+owners can edit data, anyone can view' },
      { type: 'feature', text: 'Audit log of every change — who did what when, persisted in the database' },
      { type: 'feature', text: 'Bank holidays auto-detected from the calendar — no manual entry needed' },
      { type: 'feature', text: 'Link yourself to a clinician record for personal MyRota and notes' },
      { type: 'improvement', text: 'Backend rebuilt on Supabase Postgres with row-level security per practice' },
      { type: 'improvement', text: 'Data migration tool — one-shot import from old Redis blob to new Postgres schema' },
      { type: 'improvement', text: 'TeamNet calendar sync rewritten to use shared parser, faster and more reliable' },
      { type: 'fix', text: 'Buddy allocation display — removed parseInt() coercion that broke UUID lookups' },
      { type: 'fix', text: 'Bank holiday timezone bug — toISOString() was rolling dates back during BST' },
      { type: 'fix', text: 'Daily presence overrides now persist across reload (previously lost on refresh)' },
      { type: 'fix', text: 'Practice logo removed from sidebar — will return as a per-practice setting' },
    ]
  },
  {
    version: '3.4.0',
    date: '2026-04-26',
    title: 'Dark theme everywhere, code cleanup',
    changes: [
      { type: 'feature', text: 'Capacity Planning page fully dark-themed — glass cards, dark clinician rows, translucent coloured headers' },
      { type: 'feature', text: 'Workload Audit page fully dark-themed — dark bar charts, translucent badges, glass cards' },
      { type: 'feature', text: 'Login page redesigned with dark gradient, glass card, green gradient button' },
      { type: 'feature', text: 'Changelog page added — version history accessible from sidebar and version number link' },
      { type: 'improvement', text: 'Shared getSiteColour function — single definition in lib/huddle.js, removed 4 duplicate copies' },
      { type: 'improvement', text: 'Shared SpeedometerGauge component — extracted from inline code, fully parameterised' },
      { type: 'improvement', text: 'Calendar date picker styled for dark theme' },
      { type: 'improvement', text: "Who's In settings panel styled for dark theme" },
      { type: 'improvement', text: 'Removed unused CSS classes (glass-body, glass-light)' },
      { type: 'improvement', text: 'Dark page background now applies to all main pages' },
      { type: 'fix', text: 'Fixed crash from LocSquare referencing out-of-scope siteCol in MyRota' },
      { type: 'fix', text: 'Fixed crash from missing siteCol definition in HuddleForward' },
      { type: 'fix', text: 'Fixed PersonCard referencing renamed siteCol instead of getSiteCol prop' },
    ]
  },
  {
    version: '3.3.0',
    date: '2026-04-23',
    title: 'Mobile, public buddy page, EMIS reports, workload audit',
    changes: [
      { type: 'feature', text: 'Mobile-responsive layout across all pages' },
      { type: 'feature', text: 'Public buddy cover page at /buddy — no login required, auto-refreshes, shareable link for clinicians' },
      { type: 'feature', text: 'Combined duty burden chart on Workload Audit — stacked bars showing total on-call load per clinician' },
      { type: 'feature', text: 'EMIS-friendly clipboard report — tab-aligned columns that render correctly in EMIS proportional font' },
      { type: 'feature', text: 'Buddy Cover redesigned with dark glass design language' },
      { type: 'feature', text: 'Week strip enlarged — single column per day, bigger text, solid colour badges' },
      { type: 'fix', text: 'Duty doctor detection now filters out dummy EMIS clinicians (e.g. TRIAGE, TELEPHONE) by cross-referencing staff register' },
      { type: 'fix', text: 'Date navigation extended to ±60 calendar days (was ±30, stopped at May 8)' },
      { type: 'fix', text: 'EMIS report link changed to www.gpdash.net/buddy so EMIS renders it as clickable' },
    ]
  },
  {
    version: '3.2.0',
    date: '2026-04-06',
    title: 'Speedometer gauge, dual-screen huddle, site colours',
    changes: [
      { type: 'feature', text: 'Half-arc speedometer gauge — smooth gradient (red→amber→green→blue), 80 micro-segments, glowing dot endpoint' },
      { type: 'feature', text: 'Dual-screen huddle board — "2 Screen" button opens second window, BroadcastChannel syncs date navigation' },
      { type: 'feature', text: 'Site colours from room settings — location badges pull colours from room allocation config with fuzzy name matching' },
      { type: 'feature', text: 'Who\'s In role colours — GP blue, Nursing green, Allied purple (was all green)' },
      { type: 'feature', text: 'Band badge repositioned inline with stats under progress bar' },
      { type: 'feature', text: 'Huddle board fully restyled to match Today page dark glass aesthetic' },
      { type: 'improvement', text: 'Location badges enlarged ~150% across urgent panels and Who\'s In' },
      { type: 'improvement', text: 'Urgent slot numbers enlarged to text-6xl' },
      { type: 'improvement', text: 'Routine capacity gauges enlarged to 120px' },
      { type: 'improvement', text: 'Duty doctor star icon enlarged, duty support restored to buddy/people icon' },
      { type: 'improvement', text: 'Initials font changed from Space Mono to Outfit for better readability' },
      { type: 'improvement', text: 'Abbreviations expanded: avail→available, emb→embargoed, bkd→booked' },
      { type: 'fix', text: 'Target marker on progress bar was clipped by overflow-hidden — restructured DOM' },
      { type: 'fix', text: 'Dual-screen: screen 1 no longer exits when screen 2 opens (fullscreen API conflict)' },
      { type: 'fix', text: 'Removed strikethrough on absent clinician names' },
    ]
  },
  {
    version: '3.1.0',
    date: '2026-04-06',
    title: 'Today page dark glass redesign',
    changes: [
      { type: 'feature', text: 'Complete dark glass design language — glass, glass-header, glass-body, glass-inner CSS classes' },
      { type: 'feature', text: 'Summary gauge bar with half-arc speedometer, 4 stat squares, demand prediction card' },
      { type: 'feature', text: 'Noticeboard moved to right column in 1+3 grid layout' },
      { type: 'feature', text: 'Demand predictor insight with collapsible factor breakdown' },
      { type: 'improvement', text: 'Dark gradient background across Today page and Buddy Cover' },
      { type: 'improvement', text: 'Section reordering: Summary → Urgent AM/PM → Who\'s In → Routine → Custom cards' },
      { type: 'fix', text: 'Clinician count now uses CSV data when available instead of working patterns only' },
    ]
  },
  {
    version: '3.0.0',
    date: '2026-04-05',
    title: 'Logo, sidebar, and design system foundation',
    changes: [
      { type: 'feature', text: 'New GPDash logo — gauge+bars SVG with [GP]DASH wordmark' },
      { type: 'feature', text: 'Redesigned sidebar with colour-coded section icons and centred dividers' },
      { type: 'feature', text: 'Font system: DM Sans (body), Space Mono (data numbers), Outfit (headings/initials)' },
    ]
  },
  {
    version: '2.5.0',
    date: '2026-04-05',
    title: 'Semantic versioning, demand predictor v2.0',
    changes: [
      { type: 'feature', text: 'Switched to semantic versioning (MAJOR.MINOR.PATCH)' },
      { type: 'feature', text: 'Demand predictor v2.0 — 15 factors including weather, school holidays, bank holidays (R²=0.81)' },
      { type: 'feature', text: 'Date navigation extended to ±30 working days with calendar picker' },
      { type: 'improvement', text: 'Version displayed in sidebar footer' },
    ]
  },
  {
    version: '2.0.0',
    date: '2026-03-31',
    title: 'Buddy Cover system, fullscreen huddle board',
    changes: [
      { type: 'feature', text: 'Buddy Cover module — daily clinician cover allocations with workload balancing' },
      { type: 'feature', text: 'EMIS clipboard integration — one-click copy formatted for EMIS notepad' },
      { type: 'feature', text: 'Fullscreen huddle board — 4-quadrant layout with animated transitions' },
      { type: 'feature', text: 'Noticeboard ticker for huddle messages' },
      { type: 'feature', text: 'Workload Audit — duty doctor and support ratio tracking' },
      { type: 'feature', text: 'My Rota — personal schedule view' },
    ]
  },
  {
    version: '1.0.0',
    date: '2026-03-01',
    title: 'Initial release',
    changes: [
      { type: 'feature', text: 'CSV appointment parsing from EMIS exports' },
      { type: 'feature', text: 'Urgent on the Day — AM/PM capacity with slot filtering' },
      { type: 'feature', text: 'Who\'s In/Out — clinician attendance from working patterns and planned absences' },
      { type: 'feature', text: 'Routine capacity — 28-day forward view with weekly gauges' },
      { type: 'feature', text: 'Room Allocation — drag-and-drop room assignment across sites' },
      { type: 'feature', text: 'Staff Register — clinician management with roles and working patterns' },
      { type: 'feature', text: 'Upstash Redis persistence, Vercel deployment' },
    ]
  },
];
