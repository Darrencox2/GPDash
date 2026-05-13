export const CHANGELOG = [
  {
    version: '3.4.1',
    date: '2026-05-13',
    title: 'Fix: ghost clinicians showing other people\'s appointments after CSV re-uploads',
    changes: [
      { type: 'fix', text: 'Bug: after uploading multiple CSVs over time, the dashboard could show ghost clinicians (people who\'d left the practice, or names from a previous CSV ordering) with appointment counts that actually belonged to whoever\'s now at that column position. Symptom: a name appears with slot counts on a date but the person isn\'t in that CSV at all — the counts shown are genuinely someone else\'s' },
      { type: 'fix', text: 'Root cause: mergeHuddleData stored per-date slot data keyed by CSV column index, but the saved clinicians array was the set union of every CSV ever uploaded — so old names stayed at their old positions even after they\'d left. When a new CSV came in with different ordering (or with people who\'d left omitted), incoming slot data was stored at the NEW positions while the clinicians array still reflected the OLD positions. Display looked up clinicians[N] and got a ghost from a prior upload, shown next to whoever was at column N in the latest CSV' },
      { type: 'fix', text: 'Fix: mergeHuddleData now re-keys each source\'s per-date data from that source\'s own CSV indices to the merged-array indices, using the clinician name as the bridge. dateData / bookedData / embargoedData / blockedData / locationData / splitSiteData all rebuilt with correct alignment on every merge' },
      { type: 'fix', text: 'Self-heals on next CSV upload: any future-date (or within-3-days-recent) data will be correctly indexed against the new CSV. Locked old dates (>3 days in the past) that were saved with the pre-fix buggy alignment stay misaligned — those will roll off via the 4-month prune' },
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
