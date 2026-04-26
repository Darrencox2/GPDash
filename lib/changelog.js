export const CHANGELOG = [
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
