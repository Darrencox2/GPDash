export const CHANGELOG = [
  {
    version: '4.5.44',
    date: '2026-05-04',
    title: 'Smoother create-practice: NHS name search + duplicate detection',
    changes: [
      { type: 'feature', text: 'Replaced the minimal name + ODS + region form on /v4/onboarding/create-practice with a proper "what\'s your practice?" search. Two ways in: type to search by name (live results from NHS Digital via OpenPrescribing), or paste an ODS code for a direct lookup. On selection we auto-fill name, ODS code, and list size — region field dropped (not used for any product feature, the setup wizard can fill it later if needed)' },
      { type: 'feature', text: 'Duplicate detection: when a user picks a practice that\'s already on GPDash, they see "This practice is already on GPDash. Ask whoever set it up to invite you" instead of a Create button. Stops two users from setting up the same practice in parallel and ending up with split data' },
      { type: 'feature', text: 'New check_practice_exists_by_ods RPC bypasses RLS deliberately — without it, a non-member trying to create a duplicate would just see "no match" because RLS hides existing practices from non-members. We need them to learn it exists' },
      { type: 'fix', text: 'create_practice_with_owner extended to accept postcode, list_size, and online_consult_tool. Defence-in-depth duplicate check at the RPC level too (raises unique_violation if ODS already exists), so a direct RPC call can\'t bypass the UI check. setup_completed_at is auto-marked when ODS + postcode + list_size are all provided at create time, otherwise the existing "Finish practice setup" banner kicks in to nudge the user' },
    ]
  },
  {
    version: '4.5.43',
    date: '2026-05-04',
    title: 'Forename / surname split + "is this you?" auto-suggest',
    changes: [
      { type: 'feature', text: 'Sign-up form now asks for forename and surname separately. Surname is required (used for the auto-suggest below); forename is optional to accommodate mononyms (single-name people in some cultures). The combined display name is built from the parts and stored on profiles.name as before, so all existing display code continues to work' },
      { type: 'feature', text: 'New "is this you?" banner appears at the top of the practice dashboard for users whose account is not yet linked to a clinician record. Matches the user\'s surname against active clinicians in the practice (handling EMIS comma format "Smith, Jane", manual entry "Jane Smith", and titled forms "Dr Jane Smith" / "Smith, Jane (GP Partner)"). One click claims the link via the existing claim_clinician_as_self RPC. Removes the friction of "go to Account → pick yourself from a long dropdown"' },
      { type: 'feature', text: 'Platform-admin user editor shows separate Forename / Surname fields plus the computed Display name. The admin_update_user_profile RPC now accepts new_first_name + new_last_name and recomputes the display name from the parts when either is changed' },
      { type: 'fix', text: 'Migration 026 backfills first_name + last_name for existing profiles by splitting on the first space — works for "Jane Smith", produces "Jane" + "Smith". For "Dr Jane Smith" it produces "Dr" + "Jane Smith" which is wrong, but users can edit their own profile in Account. Re-running the migration is idempotent: only fills rows where first_name + last_name are both null' },
      { type: 'fix', text: 'handle_new_user trigger updated to read first_name + last_name out of auth metadata at signup. Falls back to the legacy single-name path so older clients still passing { name: "..." } during a partial deploy don\'t break' },
    ]
  },
  {
    version: '4.5.42',
    date: '2026-05-04',
    title: 'Preview deployment: anonymous "/" now lands on v4 (not v3)',
    changes: [
      { type: 'fix', text: 'Visiting preview.gpdash.net/ as an anonymous user was showing the v3 password-gated LoginScreen, with no sign-up option. Middleware now redirects "/" to "/v4" on preview deployments (or whenever NEXT_PUBLIC_DEFAULT_TO_V4 is set), so testers reach the v4 sign-in / sign-up flow as expected. Production gpdash.net is unchanged — it still serves v3 to live Winscombe until we explicitly flip it. Logged-in v4 Supabase users continue to bounce through /dashboard as before' },
    ]
  },
  {
    version: '4.5.41',
    date: '2026-05-04',
    title: 'Fix: /v4 returned 404 — now redirects to dashboard or login',
    changes: [
      { type: 'fix', text: 'Visiting /v4 directly hit Next.js\'s 404 page because the folder had child routes (/v4/login, /v4/dashboard, etc.) but no index page. Added a small server page that redirects to /v4/dashboard if signed in, /v4/login otherwise. Standard pattern for an app shell\'s root route' },
    ]
  },
  {
    version: '4.5.40',
    date: '2026-05-04',
    title: 'Platform admin: practice detail page (manage members + delete without leaving admin)',
    changes: [
      { type: 'feature', text: 'New /v4/admin/practices/[id] page — full platform-admin practice management. Stays inside the admin shell (AdminNav at the top) instead of dropping into the practice\'s own DashboardShell, so you don\'t lose the admin context just to add a member or delete a practice. Replaces the old "Manage" link from the practices list which sent you into the practice\'s own website' },
      { type: 'feature', text: 'Practice members card: search-as-you-type to add an existing user (skips users already in this practice — that\'d just be a role change), inline role <select> for current members, Remove button per row, "Open" link to jump to that user\'s admin page. Mirror of the Add-to-Practice flow already on the user detail page — same admin RPCs, just the inverse entry point' },
      { type: 'feature', text: 'Quick links to deeper settings (Details / Buddy cover / Demand / Resources / Activity) on the existing /v4/practice/[slug] tabs, plus a primary "Open dashboard →" button to jump into the practice\'s main app. Means you can drill into config without losing your place in the admin nav, but we don\'t duplicate the 800-line setup form here' },
      { type: 'feature', text: 'Inline danger zone: delete the practice with typed-confirmation (type the slug to enable). Same UX pattern as the user-delete and consistent with the existing /v4/practice/[slug]?tab=danger version' },
      { type: 'feature', text: 'New admin_get_practice_detail SQL RPC bundles practice identity + every member with email/name/role/last sign-in into one round trip. Mirror of admin_get_user, same security-definer + platform-admin guard pattern' },
    ]
  },
  {
    version: '4.5.39',
    date: '2026-05-04',
    title: 'Platform admin: full user management (delete, assign, change role, edit profile)',
    changes: [
      { type: 'feature', text: 'Platform admin → user detail page now lets you do every common user-management task without going into the practice itself: edit name, toggle platform-admin flag, add/remove practice memberships, change role within each practice, and delete users entirely. All gated by the existing is_platform_admin() RLS guard at the database level — UI is just the friendly surface' },
      { type: 'feature', text: 'New admin RPCs: admin_delete_user, admin_set_user_membership (UPSERT — adds OR updates role), admin_remove_user_membership, admin_update_user_profile. Each follows the same pattern as the existing admin_* family with a security definer + platform-admin guard, returning JSON so the UI can confirm what happened' },
      { type: 'fix', text: 'Lockout protection: the new RPCs refuse to delete the last platform admin, refuse to demote the last platform admin from the role, refuse to delete the calling user themselves, and refuse to remove a practice\'s last owner. Database-level safety nets so a slip in the UI can\'t lock you out' },
      { type: 'feature', text: 'Delete user uses a typed-confirmation pattern: type the email\'s local-part to enable the red Delete button. Same idea as the existing practice-delete flow' },
    ]
  },
  {
    version: '4.5.38',
    date: '2026-05-04',
    title: 'Auth pages: dark theme + password rules + confirm field',
    changes: [
      { type: 'fix', text: 'V4 auth pages (login, signup, reset-password) were rendering on the legacy slate-100 body background, leaving the dark glass card floating on a light grey page. Set a proper dark gradient background on the V4 layout wrapper so every /v4/* page gets the same dark theme as the dashboard' },
      { type: 'feature', text: 'Sign-up now requires a password confirmation field (re-enter your password) and shows a live requirements checklist as you type: at least 8 characters, includes a letter, includes a digit. Mismatched passwords flag with a subtle red ring on the confirm field, but only after the user has typed something there — avoids screaming about a mismatch on every keystroke' },
      { type: 'feature', text: 'Same checklist + confirmation behaviour applied to the reset-password update page so the experience is consistent across both flows where users set a password' },
      { type: 'feature', text: 'New isPasswordValid + PasswordChecklist helpers in app/v4/_lib/auth-ui.js so any future password-setting page (e.g. invite-accept flow) can reuse the same rules. Beta-grade policy: length is the only thing that genuinely matters for brute-force resistance, letter+digit minima just catch obvious mistakes without forcing security theatre' },
    ]
  },
  {
    version: '4.5.37',
    date: '2026-05-04',
    title: 'My Rota: open on your linked clinician by default',
    changes: [
      { type: 'fix', text: 'My Rota was opening on whoever sorted first alphabetically rather than the clinician your account is linked to. Auto-select now picks: (1) the URL hash if you arrived via a deep-link, otherwise (2) the clinician linked to your user account via data._v4.linkedClinicianId, otherwise (3) the alphabetical fallback. The URL hash continues to update as you navigate so deep-links keep working as before' },
    ]
  },
  {
    version: '4.5.36',
    date: '2026-05-04',
    title: 'Fix: huddle board crash + cogs moved to capacity planning page header',
    changes: [
      { type: 'fix', text: 'Pressing the huddle board button threw "Cannot access \'sites\' before initialization" in production. Latent bug introduced in v4.5.18 — sites was declared at line 382 inside the component body but referenced inside a useMemo (and its dependency array) at line ~286. Worked in dev because closures resolve at call time, but production minification surfaced the temporal dead zone. Moved the const sites and siteCol helper declarations up so they sit before any useMemo that depends on them' },
      { type: 'feature', text: 'Capacity planning urgent / routine slot-filter cogs moved out of the day-detail collapsable panel and into the page-level header. They\'re now discoverable when no day is selected, sit alongside the page title rather than being buried, and the day-detail panel header is back to just title + close. Both cogs continue to share data.huddleSettings.savedSlotFilters with the Today page so edits on either screen reflect everywhere' },
      { type: 'fix', text: 'Added a sweep across the huddle components for the same dependency-array TDZ pattern (deps array references a const declared later in the function body) — the sites bug was the only remaining instance' },
    ]
  },
  {
    version: '4.5.35',
    date: '2026-05-04',
    title: 'Capacity planning: prediction summary on day detail + inline filter editing + Buddy Cover quick link',
    changes: [
      { type: 'feature', text: 'Buddy Cover header now has a "Weekly grid" link that opens the standing weekly rota view. The sidebar entry for that view was retired during a tidy-up but the screen itself remained useful when an admin needs to inspect or tweak a clinician\'s working pattern from inside Buddy Cover. Surfacing it here puts it where it\'s most likely to be needed' },
      { type: 'feature', text: 'Capacity planning day-detail panel (both desktop and mobile) now opens with a prediction summary band: predicted demand number, demand band (Low / Normal / High / V.High), urgent-slots-needed conversion, confidence range, and the top three driver factors with their effects (e.g. "Tuesday +12, school holiday +8, post-rain rebound −3"). Replaces the previous cramped one-line "Predicted demand: 87" text. Hidden on bank holidays and days with no prediction' },
      { type: 'feature', text: 'Slot-filter cogs added to the desktop day-detail header — one for "Urgent", one for "Routine". Editors can now adjust which slot types count as urgent vs routine without leaving the capacity planning screen. Both cogs share the practice\'s savedSlotFilters with the Today page so a change here also reflects there — deliberately not separate filters per screen, since the routine/urgent definitions are practice-wide' },
    ]
  },
  {
    version: '4.5.34',
    date: '2026-05-04',
    title: 'Cog parity + back arrow on drilled-into clinician panel',
    changes: [
      { type: 'fix', text: 'Who\'s In settings cog was visibly smaller than the slot-filter cog (14px icon in 7px button vs 16px icon in 8px button) which made it look like a different style of cog. Now matches: 16px icon in 8px button, same .glass-cog dim/teal-on-hover treatment' },
      { type: 'feature', text: 'Clinician panel drilled into from a capacity card or the 28-day chart now has a back arrow in the header so the user can step back to the day\'s clinician list without losing the day-panel context. The X close button still dismisses the entire stack so users can fully close in one click. Back arrow only renders when a panel was reached via drill-down — direct entries (urgent click, Who\'s In click) don\'t show it because there\'s nowhere to go back to' },
    ]
  },
  {
    version: '4.5.33',
    date: '2026-05-04',
    title: 'Clinician panel: drop fake time column, sort by status',
    changes: [
      { type: 'fix', text: 'EMIS\'s "Appointment huddle dashboard" report only emits "Before 12:59" or "After 13:00" in the time column — never specific appointment times. The panel was showing those bucket labels in a fake "time" column which implied a precision that didn\'t exist. Removed the time column entirely. Each row is now slot type · count (when >1) · status pill, grouped under proper Morning / Afternoon headers' },
      { type: 'feature', text: 'Within each session, rows now sort by status priority (Available → Embargoed → Booked → Blocked) and then alphabetically by slot type. More useful for triage than the old time-based sort: admins scanning the panel see what\'s bookable first, then what\'s coming free, then what\'s already taken' },
      { type: 'feature', text: 'Count pill upgraded — "×4" now appears on a small pill background rather than as bare text, so it visually balances against the status pill on the right and is easier to scan' },
    ]
  },
  {
    version: '4.5.32',
    date: '2026-05-04',
    title: 'Fix: cogs were always teal because of !important override',
    changes: [
      { type: 'fix', text: 'The slot filter cog was rendering teal full-time instead of dim/etched-and-teal-on-hover as intended. Root cause: the v4.5.28 className had a Tailwind `!text-cyan-400` override that fired whenever the cog had any active filter (which is most of the time on capacity cards) — and the !important flag stomped over the .glass-cog dim default. Removed the override entirely. The little count badge already signals that a filter is active, so two competing visual cues weren\'t needed' },
    ]
  },
  {
    version: '4.5.31',
    date: '2026-05-04',
    title: 'Phase 2: per-slot times in clinician panel + routine drill-down',
    changes: [
      { type: 'feature', text: 'CSV parser now captures per-row time strings, slot types, statuses, and locations into a new slotRows store. Adds roughly 10% to parsed-data size; merges cleanly with the existing 3-day lock + 4-month prune rules. Older parsed data without slotRows continues to render via a Phase-1-style fallback' },
      { type: 'feature', text: 'New getSlotRowsForClinicianDate(parsedData, dateStr, csvName) helper returns a clinician\'s slots for a date sorted by start time. "Before noon" / "After noon" rows sort to the head/middle of their session, parseable HH:MM strings sort precisely, anything unparseable goes last' },
      { type: 'feature', text: 'ClinicianDayPanel now renders a time-ordered list of slots with each row tagged Available / Embargoed / Booked / Blocked. Grouped by Morning / Afternoon based on the same session-derivation rules the parser uses. Each row shows time, slot type, count (when >1), and a small status pill in the panel\'s accent colour' },
      { type: 'feature', text: 'Slot-type filter (the override map passed to the panel) now filters the visible rows. Clicking a clinician inside the urgent on the day card shows only urgent slot types; clicking from a capacity card shows only that card\'s slot types' },
      { type: 'feature', text: 'Capacity day-click panel rows are now clickable — drilling into the per-clinician slot list. Click a day → see clinicians for that day → click a clinician → see their slot-by-slot breakdown. Closing the inner panel returns to the day panel rather than collapsing both' },
      { type: 'fix', text: 'Existing data in production keeps working — practices that haven\'t re-uploaded their CSV since the parser change still see the AM/PM tile summary in the clinician panel. A small italic note tells them per-slot times will appear after the next CSV upload' },
    ]
  },
  {
    version: '4.5.30',
    date: '2026-05-04',
    title: 'Side panels: portal-mount so they escape glass-card stacking contexts',
    changes: [
      { type: 'fix', text: 'Side panels (clinician click, day click, slot filter cog) were sliding in inside whichever card hosted the trigger rather than at the viewport edge. Root cause: the .glass card classes use backdrop-filter, which creates a new CSS stacking context — and once an ancestor has a stacking context, position: fixed becomes positioned relative to that ancestor, not the viewport. Industry-standard fix: render panels via React portal into document.body so they escape the React tree position they were called from. Now slides in cleanly from the right edge of the page regardless of which card was clicked' },
      { type: 'fix', text: 'Same portal fix applied to SlotFilterPanel — every cog click panel is now portal-mounted' },
    ]
  },
  {
    version: '4.5.29',
    date: '2026-05-04',
    title: 'Unified side-panel framework + clickable clinicians (Phase 1)',
    changes: [
      { type: 'feature', text: 'New SidePanel component — single source of truth for all right-side popouts on the dashboard. Dark glass theme matches the rest of the dashboard, slides in from the right with a clean animation, click-outside or ESC closes it, body scroll locks while open. Replaces the previous light-themed panel that didn\'t match the rest of the UI' },
      { type: 'feature', text: 'Clicking a clinician in the urgent on the day list (or the duty doctor card) now opens their slot breakdown in a side panel — total slots for the day, AM/PM session split, available/embargoed/booked counts. Phase 2 will add individual slot times' },
      { type: 'feature', text: 'Same panel wired up for Who\'s In: clicking any present person opens their slot breakdown for the viewed date. Absent and day-off cards aren\'t clickable since there\'s no CSV data for them' },
      { type: 'fix', text: 'Capacity card day-bar click panel rebuilt: was light-themed (jarring against dark dashboard), now uses the unified SidePanel with the card\'s accent colour as a visual link back to where you clicked. Per-clinician rows show role + title now (consistent with the rest of the urgent breakdown)' },
      { type: 'feature', text: 'Drag-and-drop on Who\'s In removed entirely. Was used to manually move people between Present / Absent / Day Off — that classification is now driven solely by the rota + CSV. Removed handleDragStart, moveToColumn, the DropZone wrapper, and the dailyOverrides save flow that drag-drop wrote to. Click-to-open-panel replaces it' },
      { type: 'fix', text: 'Who\'s In settings panel migrated to the unified SidePanel pattern (was previously a hand-rolled fixed slide-out with a light-mode header that broke dark glass consistency)' },
      { type: 'feature', text: '"View next 28 days" expand button on the routine capacity card is now much more prominent: bigger text, emerald chevron that rotates on open, hover background, "EXPAND" hint label. Was a 10px arrow next to "28-day chart" that read as decorative — now obviously a primary action' },
    ]
  },
  {
    version: '4.5.28',
    date: '2026-05-04',
    title: 'Capacity cards: full editing in cog, full-width option, drag to reorder',
    changes: [
      { type: 'feature', text: 'Capacity card cog now hosts ALL card-level settings: title, accent colour, period (7/14/21/28 days), full-width toggle, slot filter, and remove. The previously-visible inline duration select has moved into the cog so the card chrome is uncluttered. The visible "✕ delete" button is gone — deletion lives in the cog with a confirmation' },
      { type: 'feature', text: 'Cards can now be set to full-width (span the entire row) via a toggle in the cog. Mixed layouts work cleanly — half-width cards continue to pair up while full-width cards take the full row, achieved via grid-column span 2' },
      { type: 'feature', text: 'Drag-and-drop reorder. Hovering a card shows a dotted-grid drag handle next to the title; grab and drop on another card to swap positions. Drop indicator highlights the target with the card\'s own accent colour. Order persists in capacityCards array and survives reload' },
      { type: 'feature', text: 'Settings cogs across the app now look etched/dim by default (slate-500 at 55% opacity) and turn teal on hover — was previously a high-contrast slate that competed with primary content. New .glass-cog and .glass-cog-active utility classes in globals.css apply consistently to SlotFilter and Who\'s In settings cogs' },
      { type: 'fix', text: 'Card title and accent colour are now editable in place — previously the only way to change either was to delete and re-create the card. Both update immediately on save with no reload required' },
    ]
  },
  {
    version: '4.5.27',
    date: '2026-05-04',
    title: 'Capacity cards: per-card period, accent colour applied, empty-state how-to',
    changes: [
      { type: 'feature', text: 'Each capacity card now has its own period — selectable 7, 14, 21, or 28 days via a small picker in the header (editors only). Previously every card was hardcoded to 14 days regardless of the card\'s purpose. A "Travel clinic" card might want 28 days of forward visibility; a "Same-day urgent" card might want 7. Saved per-card so different cards can show different windows side by side' },
      { type: 'feature', text: 'The card\'s accent colour now actually drives visuals. Bars, the title-side dot indicator, the top stripe, the hover outlines, and the legend all use the chosen colour. Two side-by-side cards (e.g. violet "Diabetes" and amber "Travel clinic") now stay visually distinct rather than both rendering identical emerald bars. The colour pre-existed in the data but wasn\'t being used for anything visible' },
      { type: 'feature', text: 'New empty-state "how to" card replaces the bare "+" button when a practice has zero capacity cards. Explains what the cards are for with concrete examples ("Diabetes review", "Travel clinic", "Antenatal first trimester") and offers a single "Create your first card" button. Better onboarding than the previous orphan plus icon' },
      { type: 'fix', text: 'DEFAULT_CAPACITY_CARDS no longer ships with Winscombe-flavoured "Minor Illness" + "Physiotherapy" examples. New practices start clean — appropriate cards get created via the empty-state flow' },
      { type: 'fix', text: 'Added a totals row above the bars on each card showing total available across the selected period — saves users mental-summing the columns. For 21+ day periods the per-bar count labels are now hidden and the day-of-week strip shows only Monday anchors, so the chart stays readable when zoomed out' },
      { type: 'fix', text: 'Latent bug: HuddleToday referenced the DEFAULT_CAPACITY_CARDS constant without ever declaring or importing it. The page never crashed because hs?.capacityCards happened to be set on Winscombe — but a fresh practice with no settings would have hit a ReferenceError. Now declared explicitly, defaults to []' },
    ]
  },
  {
    version: '4.5.26',
    date: '2026-05-04',
    title: 'Glass Option B + vertical spacing between data sections on Today',
    changes: [
      { type: 'feature', text: 'Glass cards reworked to Option B: stronger radial highlight at the top-left corner (mimicking light catching one side of a pane), brighter top border edge (rgba 0.2 vs 0.1 elsewhere), larger backdrop blur (28px) with higher saturation (180%) so colours pop through the frost. Applied to .glass, .glass-inner, .glass-header, .glass-dark, .glass-panel — i.e. every card on the dashboard' },
      { type: 'feature', text: 'Radial highlight implemented via stacked CSS backgrounds (radial-gradient + linear-gradient + base color) rather than ::before pseudo-elements. Avoids forcing position:relative + overflow:hidden on every consumer, which would break tooltips and dropdowns that need to overflow' },
      { type: 'fix', text: 'Vertical spacing between data-driven sections on the Today page. The wrapper around NHS ribbon, summary gauge, urgent on the day, who\'s in, routine wait times, and routine capacity was a React Fragment (<>) which doesn\'t apply layout — sections stacked tight with no breathing room. Now wrapped in a div with space-y-4 (16px gap) so each card has consistent rhythm' },
    ]
  },
  {
    version: '4.5.25',
    date: '2026-05-04',
    title: 'Glass cards: properly glass-like (no more visible flat lines)',
    changes: [
      { type: 'feature', text: 'Glass card styles (.glass, .glass-inner, .glass-header, .glass-dark, .glass-panel) reworked to actually look like glass instead of flat dark blocks with hard 1px borders. Now combine: a vertical gradient (light catching the top edge), backdrop-filter blur so the page background bleeds through subtly, asymmetric border opacity (top edge brighter than sides), and a soft inset top-edge highlight to mimic the "shine" of glass' },
      { type: 'feature', text: 'Adds backdrop-filter: blur(14px) saturate(140%) — a hardware-accelerated frost on the page gradient behind each card. Falls back gracefully on older browsers (gets the gradient + borders, just no blur). saturate boosts colour vibrancy of bleed-through to compensate for the blur softening' },
      { type: 'fix', text: 'Removed the visible "lines" you were noticing — those were the hard 1px borders on flat fills. The new style replaces them with gradient + asymmetric border opacity, making edges feel like a property of the surface rather than a drawn line' },
    ]
  },
  {
    version: '4.5.24',
    date: '2026-05-04',
    title: 'Spring clean — predictor leakage round 2 + dead code removal',
    changes: [
      { type: 'fix', text: 'Three more spots imported the Winscombe-shaped BASELINE/DOW_EFFECTS/MONTH_EFFECTS constants directly to derive display values, bypassing the per-practice predictor refactor: typicalDayMonth on HuddleFullscreen, dowDemandColour on HuddleForward, and typicalDemand on DemandCapacityConnector. All three now read baseline + dow + month effects from the active prediction\'s own factors, so they track per-practice calibration' },
      { type: 'fix', text: 'Removed the now-unused BASELINE/DOW_EFFECTS/MONTH_EFFECTS imports from those three components — no caller outside lib/demandPredictor.js touches the constants directly anymore' },
      { type: 'fix', text: 'Updated stale code comments referencing "Winscombe defaults" — defaults are now list-size-scaled and flagged via usingFallback' },
      { type: 'feature', text: 'Removed dead exports: DEFAULT_CLINICIANS (lib/data.js), addSchoolHolidayRanges (lib/demandPredictor.js — replaced by per-call schoolHolidayRanges option), DOW_NAMES (only used internally). Demoted normalizeName, classifyDemand, and getStaffingRecommendation from exported to internal — used inside their own module but never imported elsewhere' },
      { type: 'feature', text: 'test-*.js and test-*.cjs now in .gitignore so local verification scripts stop cluttering git status. They were never committed but appeared as untracked every time' },
    ]
  },
  {
    version: '4.5.23',
    date: '2026-05-04',
    title: 'Consistent titles in urgent on the day breakdown',
    changes: [
      { type: 'fix', text: 'Titles (Dr, Mrs, Mr etc.) were being shown for the duty doctor in the urgent on the day card but not for the other clinicians listed below. Now consistently rendered for everyone in the breakdown — duty doctor, remainder list, and the fullscreen huddle equivalent. Title comes from the clinicians page (already rendered correctly in the Who\'s In card)' },
    ]
  },
  {
    version: '4.5.22',
    date: '2026-05-04',
    title: 'Fallback predictions scaled by list size + warning banner',
    changes: [
      { type: 'feature', text: 'Predicted demand fallback for practices with no demand_settings now scales the generic baseline proportionally to the practice\'s list size. The hardcoded constants were calibrated against an 11,000-patient practice — a 5,500-patient practice now sees half the prediction, an 18,000-patient practice sees ~1.6×. Tested: 5500/11000=0.5x → predicted 76, 18000/11000=1.6x → predicted 215, baseline at 11k → predicted 137' },
      { type: 'feature', text: 'New amber warning banner on the Today page predicted-demand block when the fallback path is in use. Reads "Demand prediction is an estimate" and links to Practice → Demand model where the user can upload an AskMyGP CSV to get a tailored prediction. Also adds a small "est" tag inside the Predicted demand tile itself' },
      { type: 'feature', text: 'predictDemand now returns usingFallback and fallbackScale flags on the result object so any caller can detect estimation status. predictDemand options now accept listSize for the scaling. All four caller components (HuddleToday, HuddleForward, HuddleFullscreen, DemandCapacityConnector) pass it through' },
      { type: 'fix', text: 'Buddy cover workload weights save indicator never showed because the field key passed to the saving state didn\'t match the Card\'s status field — fixed by using a single \'weights\' group key for both sliders' },
      { type: 'fix', text: 'QOF tracker sidebar badge changed from "New" to "Coming soon" — the page is still a stub, the old label was misleading' },
      { type: 'feature', text: 'Dashboard data API endpoint now surfaces practiceSlug, practiceListSize, practiceLatitude/Longitude, practiceAdminDistrict, demandSettings on _v4 — needed by the warning banner link and by the predictor\'s practice-aware path. Was previously only available on the /p/[id] shell route' },
    ]
  },
  {
    version: '4.5.21',
    date: '2026-05-04',
    title: 'Auto-generate working pattern: handle initials collisions properly',
    changes: [
      { type: 'fix', text: 'Auto-generate from CSV could match the wrong clinician when two people share their derived 2-letter initials (e.g. Justin Grandison and Jane Gomm both produce "JG"). The fallback initials match silently picked whichever CSV row appeared first, so one of them inherited the other\'s pattern and the other got "data incomplete". Even setting Jane to "JAG" on the clinicians page didn\'t help because the fallback only ever generated 2-letter initials' },
      { type: 'fix', text: 'csvNameInitials replaced with csvNameInitialsAll which produces every plausible variant for a CSV name: 2-letter (JG), surname-prefix (JGo, JGom), first-name-prefix + surname-initial (JaG), and surname only (GOMM). So a clinician registered as JAG will now match a CSV row "Gomm, Jane" via the JAG variant' },
      { type: 'feature', text: 'Ambiguity detection: before running the fallback, the auto-generator builds a map of which initials appear for multiple distinct CSV names. Any clinician whose registered initials are ambiguous gets skipped from the fallback entirely (rather than silently mismatched) and surfaced in a new amber warning box on the report' },
      { type: 'feature', text: 'The warning lists each ambiguous clinician, the colliding CSV names, and a hint to set unique initials or add an alias on the clinicians page' },
    ]
  },
  {
    version: '4.5.20',
    date: '2026-05-04',
    title: 'Noticeboard: actually persist messages',
    changes: [
      { type: 'fix', text: 'Noticeboard messages were being silently discarded on save — the v4 API endpoint never read or wrote the huddleMessages field, so notices only existed in memory until you refreshed the page. Confirmed by inspecting the wire payload (sent) vs the database (no row). Messages are now stored in practice_settings.extras.huddleMessages and rehydrated on every page load' },
      { type: 'fix', text: 'The dashboard\'s data-load path was extracting huddleCsvData into its own state but ignoring huddleMessages. Both the SSR hydration path and the client-side fetch path now populate the message state, so notices stay visible across reloads' },
      { type: 'note', text: 'Notices saved before this fix are gone (they never made it to the database). New posts from now on will persist correctly' },
    ]
  },
  {
    version: '4.5.19',
    date: '2026-05-04',
    title: 'Site colour palette: curated for dark glass + remap of existing data',
    changes: [
      { type: 'feature', text: 'SITE_COLOUR_PRESETS rewritten as a coherent 10-colour palette designed for the dark glass UI: violet, cyan, orange, pink, lime, blue, teal, purple, yellow, slate. Ordered for good adjacent contrast — a typical 1–3 site practice gets visually distinct markers without effort' },
      { type: 'feature', text: 'Palette deliberately avoids the colours used by the capacity status bands (red for Short, amber for Tight, emerald for Good) so site indicators don\'t accidentally read as health states' },
      { type: 'fix', text: 'Migration 013 walks every existing practice\'s stored site colours and remaps preset values to the closest equivalent in the new palette: #8c64c3 → #8b5cf6, #46ac64 → #84cc16, #eb8232 → #f97316, #6366f1 → #3b82f6, etc. Custom (off-palette) hex codes are preserved untouched so any practice that\'s manually picked their own brand colour keeps it' },
    ]
  },
  {
    version: '4.5.18',
    date: '2026-05-04',
    title: 'Locations: fully site-driven (no more hardcoded Winscombe/Banwell/Locking)',
    changes: [
      { type: 'fix', text: 'Three places had hardcoded { Winscombe, Banwell, Locking } site names with bespoke colours that ignored the practice\'s configured Room Settings: the slot-type stacked bars on Today, the Who\'s In legend at the bottom of the Today page, and the Who\'s In sort order in the fullscreen huddle. All three now read from data.roomAllocation.sites — the practice\'s own list with its own colours and ordering' },
      { type: 'feature', text: 'Site order in sorts now follows the order admins set in Room Settings rather than a hardcoded preference. Drag a site in Room Settings and Who\'s In + the slot-type bars will reflect that order' },
      { type: 'feature', text: 'CSV-observed locations that aren\'t yet configured in Room Settings still appear, sorted alphabetically at the end with a neutral grey colour. Means new sites show up immediately rather than disappearing until they\'re configured' },
      { type: 'feature', text: 'Who\'s In legend at the bottom of the Today page is now hidden entirely if the practice has no configured sites yet — avoids a confusing empty space during onboarding' },
    ]
  },
  {
    version: '4.5.17',
    date: '2026-05-04',
    title: 'Drop duty support card; sort remainder by available urgent slots',
    changes: [
      { type: 'fix', text: 'Removed the "duty support" highlighted clinician card from the urgent on-the-day session breakdown. The Winscombe-specific exclusion (the hardcoded "balson" filter) is gone, and so is the heuristic that picked the second clinician based on a 5+ slots / 2-slot-margin rule. Other practices don\'t use this concept and the rule was both opaque and brittle' },
      { type: 'feature', text: 'Remaining clinicians are now sorted by available urgent slots (descending). Tie-break on total slots so a busier clinician ranks above a less-loaded one with the same availability. Most-available-first puts the people who can take new requests at the top of the visible list, which is the question staff are actually asking when they look at this section' },
      { type: 'fix', text: 'Removed the LOCATION_SORT constant that hardcoded Winscombe → Banwell → Locking ordering. Now sorts purely by capacity rather than site' },
      { type: 'fix', text: 'Same simplification applied to HuddleFullscreen so the dual-screen huddle view matches the Today page' },
    ]
  },
  {
    version: '4.5.16',
    date: '2026-05-04',
    title: 'Slot filter panel: full dark-mode redesign',
    changes: [
      { type: 'fix', text: 'The slot filter panel (gear icon in the urgent on-the-day section) had light-mode styling residue: text-amber-900 on a dark glass background, light hover backgrounds, and light-themed checkbox borders. The text was effectively unreadable. Fully redesigned with proper dark glass styling consistent with the rest of GPDash' },
      { type: 'feature', text: 'Panel widened from 320px to 384px for better breathing room. Subtle gradient background, clearer section borders, larger comfortable hit targets' },
      { type: 'feature', text: 'Header now shows a count chip — e.g. "3 of 12 selected" — with quick "All" and "None" shortcut buttons for fast bulk toggling' },
      { type: 'feature', text: 'Selected slots are visibly highlighted with a cyan-tinted background, not just a checked checkbox. Easier to see what\'s active at a glance' },
      { type: 'feature', text: 'Search box appears automatically when there are more than 8 slot types — useful when EMIS has dozens of slot configurations' },
      { type: 'feature', text: 'Gear icon in the parent UI now shows a count badge when filters are active, so it\'s obvious from the section header that filtering is in effect' },
      { type: 'feature', text: 'Footer has both a "Reset to defaults" link and a primary "Done" button instead of just an underlined link' },
    ]
  },
  {
    version: '4.5.15',
    date: '2026-05-04',
    title: 'Today: drop redundant date banner, fix demand CSV upload',
    changes: [
      { type: 'fix', text: 'Demand history CSV upload was failing with "new row violates row-level security policy for table practice_settings". Caused by upsert needing INSERT permission even when only updating an existing row — the migration 007 RLS policy only allowed UPDATE for admins. Added an INSERT policy for practice admins (constrained by is_practice_admin() and protected from duplicates by the primary key on practice_id)' },
      { type: 'feature', text: 'Removed the "Viewing X" date banner that appeared when browsing a non-today date — the date is already prominent in the navigator above. Kept the "no CSV data available for this date" warning since that\'s genuinely useful information' },
    ]
  },
  {
    version: '4.5.14',
    date: '2026-05-04',
    title: 'Noticeboard redesign — message-thread style',
    changes: [
      { type: 'feature', text: 'Noticeboard on the Today page redesigned to a message-thread style. Each notice shows avatar + name + time on one line with the message below — no more random rotating colours per message' },
      { type: 'feature', text: 'Author is now picked up automatically from the logged-in user (linked clinician name → profile name → email local part). The "Name" field on the compose form has been removed' },
      { type: 'feature', text: 'Avatar colour is hashed from the author name so the same person always shows in the same tint. Five muted accent colours rotate based on author identity, not position in the list' },
      { type: 'feature', text: 'Compose form simplified — single full-width text field with a "Post" button. Empty state now shows a helpful prompt rather than just "No messages yet"' },
      { type: 'feature', text: 'Notice list scrolls internally if it grows past 420px instead of stretching the column. Hover state highlights the row and reveals the delete button' },
    ]
  },
  {
    version: '4.5.13',
    date: '2026-05-04',
    title: 'Backfill: fix the actual root cause (wrong endpoint)',
    changes: [
      { type: 'fix', text: 'Backfill was hitting OpenPrescribing\'s /api/1.0/org_code/ endpoint, which is a name/code lookup that never includes list size. Every fetch succeeded but the field was undefined → "0 updated · 300 skipped · 0 errors". Fixed by switching to /api/1.0/org_details/?org_type=practice&keys=total_list_size which actually returns list sizes by month. We pick the most recent non-null value' },
    ]
  },
  {
    version: '4.5.12',
    date: '2026-05-04',
    title: 'NHS list-size backfill: parallelised + timeout-safe',
    changes: [
      { type: 'fix', text: 'Backfill was crashing with "Unexpected token A is not valid JSON" — the endpoint exceeded Vercel\'s 60s function timeout and the HTML error page failed to parse. Now uses 5 concurrent requests + a hard 50s time budget that exits cleanly with valid JSON, so the auto-loop can keep going from where it left off' },
      { type: 'feature', text: 'Backfill batch size reduced from 500 to 300 to fit comfortably within the time budget. Each batch now reports elapsed time and shows when it stopped early because of the budget' },
      { type: 'fix', text: 'Client-side error handler now reports timeouts and non-JSON responses with a useful message instead of "Unexpected token..."' },
    ]
  },
  {
    version: '4.5.11',
    date: '2026-05-04',
    title: 'Demand-driven Today gauge + benchmark fallback',
    changes: [
      { type: 'feature', text: 'Today page urgent gauge target is now calculated from predicted demand × conversion ratio rather than the static expected capacity table. Restores the v3 behaviour where the gauge adapts to busy/quiet days. Falls back to the static table when no prediction is available' },
      { type: 'feature', text: 'New "Today gauge target (demand-driven)" card in Practice → Demand model with a slider to control the demand → urgent conversion ratio (0.05–0.60, default 0.25). Shows a worked example so you can see what the slider produces' },
      { type: 'feature', text: 'Static capacity targets card renamed to "Static capacity targets (capacity planning)" to make its role clear — it\'s the fallback when no prediction exists, and what the Capacity Planning weekly view uses for colour bands' },
      { type: 'fix', text: 'NHS benchmark ribbon was showing only "You: X/1k" with PCN/national missing when the list-size backfill hadn\'t reached enough practices in your group. It now estimates per-1000 averages using the UK average list size (~9,665) when calibrated data is unavailable, marked with a "~est" indicator. Refining via the backfill improves accuracy but you\'re no longer stuck with no comparison' },
    ]
  },
  {
    version: '4.5.10',
    date: '2026-05-04',
    title: 'Demand predictor truly multi-tenant — no more Winscombe leakage',
    changes: [
      { type: 'fix', text: 'The "Predicted demand" gauge on Today, Capacity Planning, the Huddle board, and DemandCapacityConnector were all using Winscombe-calibrated baseline / day-of-week / month constants for every practice. Now uses each practice\'s own demand_settings (populated by NHS auto-seed or AskMyGP CSV upload) when available, falling back to defaults only when no calibration exists' },
      { type: 'fix', text: 'School holiday suppression and "first week back" surge were keyed off North Somerset for everyone. Now uses the practice\'s LEA from postcodes.io admin_district lookup' },
      { type: 'fix', text: 'Weather forecast was hardcoded to Winscombe coordinates (51.32, -2.84). A London practice was getting Somerset weather. Now uses each practice\'s lat/lon stored at setup' },
      { type: 'feature', text: 'Migration adds latitude, longitude, admin_district columns to the practices table. PracticeSetupForm.savePostcode now persists these from the postcodes.io result alongside the postcode itself' },
      { type: 'feature', text: 'predictDemand(date, weather, options) signature gains an options object accepting demandSettings, schoolHolidayRanges, and baselineAdjustment. Backward-compatible — calling with just (date, weather) gives identical results to before' },
      { type: 'feature', text: 'getWeatherForecast(days, lat, lon) accepts coordinates. Defaults to Winscombe when not supplied — no breakage for legacy callers' },
      { type: 'note', text: 'For practices set up BEFORE this change, you need to re-trigger the postcode lookup once to populate lat/lon/admin_district. Easiest: click the postcode field on the setup form and tab out. Or run UPDATE practices SET ... manually' },
    ]
  },
  {
    version: '4.5.9',
    date: '2026-05-04',
    title: 'NHS benchmarks normalised per 1,000 patients + repositioned',
    changes: [
      { type: 'feature', text: 'NHS demand ribbon now compares submissions per 1,000 patients per reporting weekday — fair across practices of any size. A 20K-patient practice and a 5K-patient one are directly comparable now' },
      { type: 'improvement', text: 'Ribbon moved from top of Today to just above the urgent on-the-day gauge — closer to the metrics it provides context for' },
      { type: 'feature', text: 'New nhs_oc_baseline.list_size column + updated PCN and national summary views to compute avg_per_1000_per_day. Practices without list size data are excluded from per-1000 averages but still appear in raw counts' },
      { type: 'feature', text: 'Admin tool: list size backfill on /v4/admin/nhs-data fetches list sizes from OpenPrescribing for any practice in nhs_oc_baseline that doesn\'t have one. Idempotent, runs in batches of 500, with optional auto-loop until done (~10 min for the full ~6,000 practices). Coverage % shown in the ribbon footer until backfill completes' },
      { type: 'improvement', text: 'Ribbon footer now discloses your practice list size and PCN coverage % when partial — so you know whether the comparison is fully or partially representative' },
    ]
  },
  {
    version: '4.5.8',
    date: '2026-05-04',
    title: 'TeamNet sync working, NHS benchmarks on Today, capacity targets migrated, audit log',
    changes: [
      { type: 'feature', text: 'TeamNet "Sync now" button on Practice → Resources actually works now. Endpoint enhanced with a server-side full-sync mode: reads URL + clinicians from DB, fetches calendar, parses, replaces existing teamnet-tagged absences in the absences table, updates last sync time. Reports import + replace counts back to UI' },
      { type: 'fix', text: 'TeamNet reason mapper: "Maternity Leave" was being stored as annual_leave because the generic \'leave\' check ran before the specific parental check. Reordered so specific reasons (parental, compassionate, study, training, sick) are checked before the generic \'leave\' fallback' },
      { type: 'feature', text: 'Urgent Expected Capacity + Routine Weekly Target migrated out of the legacy Settings page into Practice → Demand model. Same table layout (5 weekdays × AM/PM) for expected urgent slots. Saves directly to practice_settings.huddle_settings on change' },
      { type: 'feature', text: 'NHS demand benchmarks ribbon added to the top of the Today page. Compact strip showing your demand per day vs your PCN average vs national average for the latest NHS England month. Stays quiet (no UI) if your practice ODS isn\'t in the NHS data yet' },
      { type: 'feature', text: 'Audit log proper v4 implementation. New "Activity" tab on the Practice page (admin-only) shows the most recent 50 events from the audit_events table. Filter chips by category (Users / Clinicians / Absences / CSV / Buddy / Settings / All). Each row has expandable JSON details. The legacy AuditLog component reading from the v3 in-memory blob is no longer used in v4' },
    ]
  },
  {
    version: '4.5.7',
    date: '2026-05-04',
    title: 'Practice URL inside Your practice card + cross-page nav fix',
    changes: [
      { type: 'fix', text: 'Cross-page sidebar navigation: clicking "My account" (or any sidebar item) from the Practice page used to land you on Today first, requiring a second click. The dashboard\'s activeSection wasn\'t reading the ?section URL param after hydration. Now it picks it up correctly via a mount effect — single click works' },
      { type: 'improvement', text: 'Practice URL editor moved into the Your practice card itself rather than a separate card below — keeps all identity-level info in one place' },
    ]
  },
  {
    version: '4.5.6',
    date: '2026-05-04',
    title: 'Buddy settings broken up + Practice tabs polished',
    changes: [
      { type: 'feature', text: 'Buddy cover tab now properly populated — workload weight controls (absent multiplier, day-off multiplier) plus the algorithm explanation. Saves directly to practice_settings.buddy_settings on edit. No more linking out to the dashboard' },
      { type: 'feature', text: 'TeamNet calendar URL + Sync Now moved into the Resources tab — it feeds Today, Capacity Planning AND Buddy cover, so it doesn\'t belong inside any one of them' },
      { type: 'feature', text: 'Data cleanup buttons (clear room history, clear huddle CSV, clear buddy allocation history) moved into Danger zone where destructive actions live' },
      { type: 'improvement', text: 'Practice URL editor moved from Resources → Details (it\'s identity, not a resource)' },
      { type: 'improvement', text: 'Removed "Your clinician record" from the Users tab — it\'s already on the My account page where it belongs' },
      { type: 'improvement', text: 'Renamed "Integrations" tab → "Resources"' },
      { type: 'note', text: 'Urgent Expected Capacity + Routine Weekly Target are NOT yet migrated — they belong on the Capacity Planning page settings (separate task, coming next round). For now they remain accessible via /v4/dashboard?section=settings if needed' },
    ]
  },
  {
    version: '4.5.5',
    date: '2026-05-04',
    title: 'Sidebar restructure + tabbed Practice page',
    changes: [
      { type: 'feature', text: 'Sidebar simplified: "Team" → "Clinicians" (clearer — these are the people you schedule, not user accounts), "Account" → "My account", "Practice settings" → "Practice", and the redundant "Settings" item is gone (its content is now reachable from inside Practice)' },
      { type: 'feature', text: 'Practice page is now tabbed instead of one long scroll: Details / Users / Buddy cover / Demand model / Integrations / Danger zone. Tab state lives in the URL (?tab=…) so refresh and bookmarks work' },
      { type: 'improvement', text: 'Practice setup form (was at /v4/practice/[id]/setup) is now the Details tab on the Practice page. Old /setup URLs redirect there automatically so existing bookmarks still work' },
      { type: 'improvement', text: 'Demand-model uploads, EMIS report, practice URL editor, member invites, and clinician self-linking are reorganised into the relevant tabs — same functionality, much less scrolling' },
      { type: 'note', text: 'Buddy cover settings still live in the dashboard view for now; the Buddy cover tab links across to them. A proper inline migration is on the list (BuddySettings is heavily entangled with the dashboard data flow — needs a careful refactor)' },
    ]
  },
  {
    version: '4.5.4',
    date: '2026-05-04',
    title: 'Dark dropdown menus',
    changes: [
      { type: 'fix', text: 'Select dropdowns (Online consultation tool etc.) opened with white-on-light-grey OS-styled menus that were unreadable. Added color-scheme: dark globally on selects + per-option dark backgrounds so dropdown items match the rest of the dark theme' },
    ]
  },
  {
    version: '4.5.3',
    date: '2026-05-04',
    title: 'Setup form: bigger text, OC supplier removed, edit moved to button column',
    changes: [
      { type: 'improvement', text: 'Removed OC supplier line from the NHS organisational context (it was implied by the Online consultation tool dropdown anyway)' },
      { type: 'improvement', text: 'Moved "Edit details" button up to the right-hand button column alongside "Change practice" and "Clear details" — the bottom underlined link is gone' },
      { type: 'improvement', text: 'Bumped font sizes throughout the setup form: practice name 18→22, big stats 18→22, body text 12→14, hints 11→13, captions 10→12. Card titles 13→15, buttons 12→14. Inputs 14→15. Should be much more readable' },
    ]
  },
  {
    version: '4.5.2',
    date: '2026-05-04',
    title: 'Rich "Your practice" card consolidating all details',
    changes: [
      { type: 'feature', text: '"Your practice" card redesigned to show everything at once instead of scattering info across separate boxes. Layout: practice name as heading, then a 3-column stats row (ODS code · Patient list · Postcode in big readable type), followed by location context (LEA, region, holiday calendar from postcodes.io) and NHS organisational context (PCN, ICB, OC supplier, monthly submission count from nhs_oc_baseline)' },
      { type: 'feature', text: '"Edit postcode or list size manually" toggle inside the card — flips the postcode and list-size values to editable inputs without leaving the card. Saves on blur. Useful when auto-fill gets it slightly wrong' },
      { type: 'improvement', text: 'Removed the standalone Postcode and Patient list size cards when a practice is selected (their info now lives in the rich card). Still shown as fallback when no practice is picked' },
      { type: 'improvement', text: 'Form fetches nhs_oc_baseline by ODS when one is set, surfacing PCN / ICB / supplier / submission count alongside the basic details' },
    ]
  },
  {
    version: '4.5.1',
    date: '2026-05-04',
    title: 'Postcode auto-fill on practice select',
    changes: [
      { type: 'feature', text: 'Postcode now auto-fills when you pick a practice. Pipeline: ODS code → OpenPrescribing org_location for lat/lng → postcodes.io reverse geocode → nearest postcode. Best-effort — if either step fails, the field stays empty for manual entry. Setup form\'s onPostcode useEffect then kicks in normally to fetch LEA/region for the school-holiday calendar' },
      { type: 'feature', text: 'New API endpoint /api/v4/lookup-practice-postcode tested with 6 mock cases: invalid ODS, happy path, empty location response, postcodes.io failure, HTML response (Django REST default), bad input chars. All pass' },
      { type: 'improvement', text: 'Postcode card hint updated: "Auto-filled from your selected practice when possible. Edit if it\'s wrong"' },
    ]
  },
  {
    version: '4.5.0',
    date: '2026-05-04',
    title: 'Setup wizard restructure + admin NHS data upload',
    changes: [
      { type: 'feature', text: 'Setup wizard now wrapped in the same DashboardShell as the rest of v4 — sidebar, footer, navigation all consistent. Was previously a standalone page' },
      { type: 'feature', text: 'Practice search is now the first card. Once a practice is picked, it\'s replaced by a "Your practice" card showing name, ODS code, and list size with two buttons: "Change practice" (re-opens search keeping current selection) and "Clear details" (wipes name/ODS/list size + any NHS-seeded demand model, with confirmation). Postcode and other fields come below' },
      { type: 'feature', text: 'New /v4/admin/nhs-data page (platform admin only): see all months currently in the database, upload new monthly CSVs, and a freshness reminder banner that highlights when a new month is likely available from NHS England (~6 weeks after each month-end)' },
      { type: 'feature', text: 'API endpoint /api/admin/upload-nhs-oc-baseline accepts multipart form-data with the month and one-or-both region CSVs. Streaming parser handles ~1.1M-row uploads without OOM, chunked upserts to Supabase 500-at-a-time' },
      { type: 'improvement', text: 'Postcode field stays for now — auto-fill from selected practice will arrive when we add EPRACCUR data ingestion (the postcode source NHS publishes alongside the OC submissions). For now the field carries an inline note saying "auto-fill coming"' },
    ]
  },
  {
    version: '4.4.11',
    date: '2026-05-04',
    title: 'NHS demand baseline — auto-seed predictions on practice select',
    changes: [
      { type: 'feature', text: 'Pre-seeds the demand prediction model from NHS England\'s Online Consultation Submissions data when a practice picks their record in the setup wizard. Means new practices get useful demand predictions on day one instead of having to wait until they upload their AskMyGP history' },
      { type: 'feature', text: 'New `nhs_oc_baseline` table holds per-practice monthly aggregates: total submissions, days with data, weekday breakdown, hour breakdown, PCN/ICB/region. Keyed by (ods_code, month) so future months stack' },
      { type: 'feature', text: 'March 2026 data seeded directly via migration (~6,025 practices, all of England). Future months will be added by the upcoming auto-refresh cron' },
      { type: 'feature', text: 'When a practice is picked, server fires /api/v4/seed-demand-from-nhs which looks up the practice\'s ODS code in the baseline table and computes demand_settings (baseline submissions per weekday + day-of-week effects + hour pattern). Won\'t overwrite settings derived from the practice\'s own AskMyGP upload — only seeds when nothing\'s there yet' },
      { type: 'feature', text: 'Setup form shows a sparkly cyan banner when seeding completes: "Demand predictions pre-seeded from NHS data — your practice\'s March 2026 submission patterns have been used to bootstrap your demand model"' },
      { type: 'improvement', text: 'Tested end-to-end: 6 verification checks against Winscombe\'s real numbers (total=2998, days=23, Mon=989, Tue=560, Wed=531, 8am=659) plus 3 sanity checks on the seeding output (Monday is peak weekday, baseline in plausible range, source flag set). Parser handles 1.1M CSV rows in ~4s using streaming aggregation' },
    ]
  },
  {
    version: '4.4.10',
    date: '2026-05-04',
    title: 'Practice search FIXED: format=json was missing',
    changes: [
      { type: 'fix', text: 'OpenPrescribing\'s API is built on Django REST framework, which serves the browsable HTML page by default — JSON only when ?format=json is in the URL, regardless of Accept header. Added &format=json to all 3 URL variants. The debug expander on the failed v4.4.9 deploy showed exactly this: status 200, content-type text/html, body starting with <!DOCTYPE html>' },
    ]
  },
  {
    version: '4.4.9',
    date: '2026-05-04',
    title: 'Practice search: try multiple URL variants + rich debug',
    changes: [
      { type: 'improvement', text: 'The practice name search now tries 3 URL variants in sequence: simplest (just q=), with exact=false, and with org_type=practice — stops at the first one that returns matches. OpenPrescribing\'s org_code endpoint is documented inconsistently and behaviour can vary by query, so this is the safest approach' },
      { type: 'improvement', text: 'When no matches are found, a "Show what was searched (debug)" expander now shows each URL tried, the HTTP status, content-type, response body preview (first 300 chars), and any parse errors. Makes diagnosing OpenPrescribing oddities much easier' },
      { type: 'improvement', text: 'Verified end-to-end: the route logic now has a 5-test harness (test-practice-lookup.js) covering query-too-short, happy path, fallback variant succeeds, all variants empty, and non-JSON response. Full Next.js build also passes cleanly' },
    ]
  },
  {
    version: '4.4.8',
    date: '2026-05-04',
    title: 'Pivot: practice name search instead of postcode',
    changes: [
      { type: 'feature', text: 'New "Find your practice" card in the setup wizard. Type a partial practice name (e.g. "Winscombe") and see live results from NHS Digital with ODS code and list size. Click to apply name, ODS code, and list size in one go' },
      { type: 'fix', text: 'Postcode-based lookup is unworkable with available free APIs — NHS Spine ORD returns 406, NHS FHIR returns 403, and OpenPrescribing\'s GeoJSON endpoint returns empty without a query parameter. Pivoted to name search via OpenPrescribing\'s org_code endpoint, which is the one combination that\'s reliably free, public, and works' },
      { type: 'improvement', text: 'Postcode entry still happens — used for region/local authority detection (which feeds the school holiday calendar). Just no longer drives practice search' },
    ]
  },
  {
    version: '4.4.7',
    date: '2026-05-04',
    title: 'Practice lookup: drop format=json, parse defensively',
    changes: [
      { type: 'fix', text: 'OpenPrescribing\'s /org_location/ endpoint defaults to GeoJSON; passing format=json returned an empty/different shape. Removed that parameter so we get the actual GeoJSON' },
      { type: 'improvement', text: 'Parsing now tries multiple response shapes (FeatureCollection, flat array, results array) and surfaces the raw response in the debug output if none of them match — easier to diagnose if the API changes shape again' },
    ]
  },
  {
    version: '4.4.6',
    date: '2026-05-04',
    title: 'Geographic practice lookup (NHS APIs blocked, replacing approach)',
    changes: [
      { type: 'feature', text: 'Postcode → practice lookup completely rewritten. The new approach: geocode the postcode via postcodes.io, fetch all UK GP practice locations from OpenPrescribing\'s /org_location/ GeoJSON endpoint (~7,000 entries, cached for 24h after first call), compute haversine distance from the input point to each practice, return the 5 nearest. Works for any UK postcode regardless of whether a practice happens to be at that exact code' },
      { type: 'feature', text: 'Each result now shows distance in km from the entered postcode — useful when there are several similar-sized practices in the area' },
      { type: 'fix', text: 'Both NHS Spine ORD (HTTP 406) and NHS FHIR Organization (HTTP 403) endpoints rejected our requests regardless of headers. Removed both — the geographic approach via OpenPrescribing avoids the dependency entirely' },
      { type: 'improvement', text: 'First lookup of the day takes ~1-3 seconds (downloading the all-practices GeoJSON, ~500KB). Subsequent lookups are instant — the cache lasts 24h per serverless function instance' },
    ]
  },
  {
    version: '4.4.5',
    date: '2026-05-04',
    title: 'Switch to NHS FHIR Organization endpoint',
    changes: [
      { type: 'fix', text: 'NHS Digital\'s old REST API at directory.spineservices.nhs.uk/ORD/2-0-0/ has been returning HTTP 406 regardless of headers — the endpoint appears deprecated. Switched to the FHIR R3 Organization endpoint at /STU3/Organization which is what NHS Digital are pushing newer integrations toward' },
      { type: 'improvement', text: 'FHIR responses come as Bundle resources with embedded Organization entries — the route normalises them back to the simpler ODS-code shape the rest of the code uses, so the change is transparent to the UI' },
    ]
  },
  {
    version: '4.4.4',
    date: '2026-05-04',
    title: 'Postcode lookup: User-Agent + dynamic',
    changes: [
      { type: 'fix', text: 'Both NHS ORD (406) and OpenPrescribing (403) were rejecting requests because Node\'s default fetch() doesn\'t set User-Agent or comprehensive Accept headers. Added a proper User-Agent string and Accept: application/json, text/plain, */* on both calls' },
      { type: 'fix', text: 'API route is now force-dynamic so responses aren\'t cached (was previously caching null results)' },
    ]
  },
  {
    version: '4.4.3',
    date: '2026-05-04',
    title: 'Fix postcode lookup (round 2): drop Accept header + add OpenPrescribing fallback',
    changes: [
      { type: 'fix', text: 'NHS Spine Directory was returning HTTP 406 (Not Acceptable) because of the explicit Accept: application/json header — they want no Accept header at all and serve JSON by default. Removed the header' },
      { type: 'feature', text: 'Added a parallel fallback: if NHS ORD returns no results for any postcode variant, the API now tries OpenPrescribing\'s org_code search instead. OpenPrescribing supports partial code/name/postcode matching and is more lenient about formats. Less authoritative for ODS codes (only includes practices that have published prescribing data) but a useful safety net' },
    ]
  },
  {
    version: '4.4.2',
    date: '2026-05-04',
    title: 'Fix postcode practice lookup',
    changes: [
      { type: 'fix', text: 'Practice lookup was returning "no GP practice found" for valid UK postcodes. Forced the API route to use the Node runtime (the default edge runtime sometimes behaves oddly with external APIs), added an explicit Accept: application/json header, and now tries up to 5 postcode variants in sequence: original input, standard "AA9A 9AA" formatting, no-space, outward code with trailing space, outward code only. Stops at the first one that returns practices' },
      { type: 'feature', text: 'When no practices are found, a "Show what was searched" expander appears below the empty state — useful when troubleshooting NHS data quirks. Shows each variant tried and how many results it returned' },
      { type: 'improvement', text: 'Status filter is now applied client-side after the request — NHS ORD sometimes omits the Status field on valid practices, so filtering server-side via query string was excluding them' },
    ]
  },
  {
    version: '4.4.1',
    date: '2026-05-04',
    title: 'Sidebar layout for practice management + relaxed postcode lookup',
    changes: [
      { type: 'feature', text: 'Practice management page (/v4/practice/[slug]) now uses the same sidebar + footer chrome as the rest of the app. New "Practice settings" entry under ADMIN in the sidebar, highlighted when you\'re on this page' },
      { type: 'improvement', text: 'Sidebar now supports navigational mode — clicking sidebar items from a non-dashboard page navigates to the dashboard with that section pre-selected (via ?section= URL param)' },
      { type: 'improvement', text: 'Postcode lookup is more forgiving: if the exact postcode finds no GP practices, falls back to searching by outward code (the part before the space, e.g. BS25). Returns up to 5 candidates' },
      { type: 'improvement', text: 'Practices already claimed by another GPDash account are now shown with an "Already on GPDash" amber tag, disabled. One practice site = one GPDash record. The user\'s own practice (if re-running setup) is excluded from this filter so they can still re-pick themselves' },
    ]
  },
  {
    version: '4.4.0',
    date: '2026-05-04',
    title: 'Demand history upload + recalibration + delete practice',
    changes: [
      { type: 'feature', text: 'New "Demand history" card on the practice management page. Drop an AskMyGP "Crosstab — Demand data" CSV onto it and we parse it (UTF-16 BOM detection, week-start + weekday → actual date reconstruction), upsert into demand_history, and recalibrate the model — all in one go' },
      { type: 'feature', text: 'Recalibration engine fits a per-practice model: linear regression for growth slope, then DOW effects on detrended residuals (so a growing practice doesn\'t get fake "Friday is busier" patterns purely from list growth). Month effects only fit when ≥9 months of data are available — otherwise the system keeps Winscombe\'s shape until enough seasonal data accumulates' },
      { type: 'feature', text: 'Multi-source ready — the demand_history table stores per-source rows. When you switch from AskMyGP to Anima later, both sources combine on date during recalibration' },
      { type: 'feature', text: 'Site owner only: new "Danger zone" card on the practice management page with a Delete practice button. Typed-confirmation modal (you must type the practice name to enable the delete button). Backed by a SECURITY DEFINER RPC that gates on is_platform_admin() and cascades through every dependent table safely' },
      { type: 'fix', text: 'Setup banner at top of dashboard was rendering tightly — increased padding, added explicit line-height, and made the button flex-shrink-0 so it doesn\'t squeeze the text on narrow viewports' },
    ]
  },
  {
    version: '4.3.4',
    date: '2026-05-04',
    title: 'Practice selection from postcode + EMIS instruction fixes',
    changes: [
      { type: 'feature', text: 'Setup wizard now lists ALL GP practices found at a postcode (not just the first one with list size). Click your practice to apply name, ODS code, and list size in one go. Multiple practices at one postcode (health centres) are now handled cleanly' },
      { type: 'feature', text: 'New "Practice name" section in the setup wizard. Defaults to whatever you signed up with. If you select a practice from the NHS list and they have different names, a "Use NHS official name" link appears so you can standardise (or keep your preferred display name)' },
      { type: 'feature', text: 'ODS code is now stored when a practice is selected from NHS Digital. Surfaces under the practice name and links your record to the official NHS organisation directory entry' },
      { type: 'fix', text: 'EMIS instructions corrected: it\'s "Appointment Reporting", not "Population Reporting"' },
      { type: 'feature', text: 'EMIS instructions now include a tip on scheduling the report to run every morning automatically. Right-click → Properties → Schedule. Saves you a step each day' },
    ]
  },
  {
    version: '4.3.3',
    date: '2026-05-04',
    title: 'Auto-estimate list size from postcode',
    changes: [
      { type: 'feature', text: 'New /api/practice-lookup endpoint chains two free public sources: NHS Spine Directory (postcode → ODS code) and OpenPrescribing (ODS code → list size with as-of date)' },
      { type: 'feature', text: 'Setup wizard now auto-fills the practice list size when you enter a postcode. Shows the practice name, ODS code, and the date the figure was published — e.g. "11,432 (NHS Digital, March 2025)". One-click "Use this →" button to accept, or just type your own value to override' },
      { type: 'feature', text: 'Handles edge cases gracefully: postcode with no GP practice ("residential — enter manually"), practice found but no list size data ("no published figure yet"), API unavailable, etc' },
      { type: 'improvement', text: 'Practice management page now shows "Re-run setup" as a solid button (was a lighter outlined link). Last-updated date displayed when setup is complete, so you can see when the config was last touched' },
    ]
  },
  {
    version: '4.3.2',
    date: '2026-05-04',
    title: 'EMIS report download + setup instructions',
    changes: [
      { type: 'feature', text: 'Practice setup wizard now includes a download button for the EMIS appointment data report (XML enquiry definition). One click to grab it' },
      { type: 'feature', text: 'Below the download is a collapsible "How to import and run this in EMIS" panel — step-by-step instructions for the one-time import and the daily run-and-export workflow' },
      { type: 'feature', text: 'Same card mirrored on the practice management page so admins can grab the XML again later (e.g. setting up a second device, onboarding a new admin)' },
    ]
  },
  {
    version: '4.3.1',
    date: '2026-05-04',
    title: 'Practice setup wizard',
    changes: [
      { type: 'feature', text: 'New setup page at /v4/practice/[slug]/setup with three sections: postcode, list size, online consultation tool. Postcode triggers a live lookup against postcodes.io that shows detected local authority and region. Each field auto-saves on blur' },
      { type: 'feature', text: 'Practice management page now shows a "Practice setup" card — green tick when complete, amber prompt when not. Quick-edit link on the right' },
      { type: 'feature', text: 'Cyan banner appears at the top of the dashboard if setup isn\'t complete (admins/owners only). Skippable but persistent — until you click "Mark setup complete"' },
    ]
  },
  {
    version: '4.3.0',
    date: '2026-05-04',
    title: 'Foundation: practice-specific demand model',
    changes: [
      { type: 'feature', text: 'New columns on practices: postcode, list_size, online_consult_tool, setup_completed_at. Used by the new practice setup wizard (UI coming next slice)' },
      { type: 'feature', text: 'New demand_settings column on practice_settings (JSONB) holds each practice\'s calibrated baseline, day-of-week effects, month effects, and school holiday calendar' },
      { type: 'feature', text: 'New demand_history table — stores per-day request counts uploaded from the practice\'s online-consultation tool. Multi-source ready (combines AskMyGP + Anima + future tools by date), with RLS so members can read but only admins can write' },
      { type: 'feature', text: 'Postcode lookup helper using free postcodes.io API. Returns admin_district + region + lat/lng for a UK postcode' },
      { type: 'feature', text: 'School holiday calendar dataset keyed by LEA name. Currently covers North Somerset; others added as practices join. Falls back to an England-average calendar for unknown LEAs' },
    ]
  },
  {
    version: '4.2.2',
    date: '2026-05-04',
    title: 'Fix: dashboard 500 error after v4.2.1',
    changes: [
      { type: 'fix', text: 'v4.2.1 added user.id filters to two queries inside a Promise.all, but user wasn\'t destructured until that Promise.all resolved — so user.id was undefined when the queries were being constructed. Server crashed with a 500. Pulled the auth check out to run first, then the rest of the queries fire in parallel as before' },
      { type: 'fix', text: 'Practice memberships query also now filters by user_id, so the practice picker dropdown shows only YOUR memberships rather than every member of every practice you can see' },
    ]
  },
  {
    version: '4.2.1',
    date: '2026-05-04',
    title: 'Fix: owner treated as user once a second member joins',
    changes: [
      { type: 'fix', text: 'Dashboard query for the user\'s own role and platform admin flag was missing the user_id filter. Worked fine when the practice had only one member, but broke as soon as a second one joined: as owner you can see all membership rows via RLS, so .maybeSingle() got two rows and silently returned null + an error. That meant myRole was null, canEditPracticeData() returned false, and the entire UI gated as if you were a guest' },
      { type: 'fix', text: 'Same pattern fixed on the profiles query — owners/admins can see other members\' profiles too via RLS, so the filter is required' },
    ]
  },
  {
    version: '4.2.0',
    date: '2026-05-04',
    title: 'Phase D — Platform admin UI',
    changes: [
      { type: 'feature', text: 'New /v4/admin section for the site owner. List of every practice on the platform with member and clinician counts. Click into any practice to manage it (Open dashboard or Manage members)' },
      { type: 'feature', text: '/v4/admin/users — searchable list of every user on the platform. Filter by email or name. Shows membership count and last sign-in for each' },
      { type: 'feature', text: '/v4/admin/users/[id] — user detail page showing practice memberships, role per practice, and a "Send password reset email" button. Reset email uses the same Supabase recovery flow as the public reset page' },
      { type: 'feature', text: 'Platform admin link added to the dashboard footer (cyan) — only visible if profiles.is_platform_admin = true. Hidden from everyone else' },
      { type: 'security', text: 'New SECURITY DEFINER RPCs (admin_list_practices, admin_list_users, admin_get_user) that check is_platform_admin() at the top and raise if the caller isn\'t one. Anyone else calling them gets an exception, not data' },
    ]
  },
  {
    version: '4.1.4',
    date: '2026-05-04',
    title: 'Sand off loose ends',
    changes: [
      { type: 'improvement', text: 'Huddle Today: noticeboard message input is now hidden for non-admins, and the per-message delete X is hidden for them too. Add capacity card form is also hidden' },
      { type: 'improvement', text: 'Slot filter checkboxes use a new readOnly mode for non-admins — clicks no-op cleanly without the visual confusion of a checkbox that won\'t toggle' },
      { type: 'improvement', text: 'Manage practice URL now uses the slug (/v4/practice/winscombe) instead of the UUID. Old UUID links still work — they redirect to the slug form, same pattern as /p/[id]' },
      { type: 'improvement', text: 'Footer "Manage practice" link and Account Settings link both use the slug form now' },
    ]
  },
  {
    version: '4.1.3',
    date: '2026-05-04',
    title: 'Lock down practice management for users',
    changes: [
      { type: 'fix', text: 'Account Settings had a "Manage practice" link that practice users could click to see the full member list. Hidden for non-admins now' },
      { type: 'security', text: 'Practice management page itself (/v4/practice/[id]) now redirects non-admin users back to the dashboard. Even if a user types the URL directly or has the page bookmarked, they bounce away. Defence in depth on top of the existing RLS' },
      { type: 'improvement', text: 'Platform admin can now manage any practice even without a membership row — useful for support and migrations. Renders with a "platform admin" badge when not a member of the practice being managed' },
    ]
  },
  {
    version: '4.1.2',
    date: '2026-05-04',
    title: 'Phase C — edit gating across every section',
    changes: [
      { type: 'security', text: 'Practice users (non-admin) now see view-only versions of every section. The buttons and controls that mutate data are either hidden or no-op for them. Defence in depth — RLS in the database is the actual security boundary, but the UI gating prevents confusing "save failed" experiences' },
      { type: 'improvement', text: 'Removed the view-only banner. UI gating is enough — no need to remind users on every page' },
      { type: 'improvement', text: 'Buddy Cover hides Copy Week, Generate 4 Weeks, Copy Day, Generate, Mark closed/open, and disables presence toggles for non-admins' },
      { type: 'improvement', text: 'Huddle Today hides the CSV upload button (with a friendlier "ask an admin" empty-state message), gates the drag-drop CSV handler, and gates capacity-card edits, slot-filter changes, duty-doctor slot setting, and huddle messages' },
      { type: 'improvement', text: 'Who\'s In/Out is read-only for non-admins — drag-and-drop between in/absent columns and hide-person actions are gated' },
      { type: 'improvement', text: 'Room dashboard hides Edit / Reset all buttons and gates the drag-and-drop entry point so non-admins can\'t reassign clinicians to rooms' },
      { type: 'improvement', text: 'Capacity planning page hides the "edit weekly target" link for non-admins' },
      { type: 'feature', text: 'My Rota — users can edit rota notes for their OWN clinician (the one linked to their account) but see a read-only view when looking at anyone else\'s rota notes. Per the role policy: self-edit only' },
    ]
  },
  {
    version: '4.1.1',
    date: '2026-05-04',
    title: 'Phase B — UI gating for non-admin users',
    changes: [
      { type: 'fix', text: 'Phase A migration had a bug — tried to add "user" via a check constraint but practice_role is an enum. New migration adds "user" properly via ALTER TYPE and re-applies all Phase A operations idempotently in case the previous migration rolled back' },
      { type: 'feature', text: 'Sidebar hides Team and Settings entries for users without admin/owner role. Empty section dividers collapse cleanly when nothing is left to show' },
      { type: 'feature', text: 'View-only banner appears at the top of the dashboard for non-admin users — small status bar telling them they\'re in view-only mode and to ask an admin for changes' },
      { type: 'feature', text: 'Account page now shows your role with a colour-coded badge (cyan = platform admin, emerald = owner, amber = admin, slate = user)' },
      { type: 'improvement', text: 'Footer "Manage practice" link hidden for non-admin users (they have nothing to manage there)' },
      { type: 'improvement', text: 'Invite form updated — new invites use the "user" role by default. Three role options now: User, Admin, Owner (only owners can invite as Owner). Each option shows a one-line description of what they can do' },
    ]
  },
  {
    version: '4.1.0',
    date: '2026-05-04',
    title: 'Roles foundation — Phase A (schema + RLS, no UI changes yet)',
    changes: [
      { type: 'feature', text: 'Added a new "user" role for practice members. Users can view dashboard data but cannot edit practice settings. They can edit their own rota notes — useful for clinicians to add personal context like "training AM"' },
      { type: 'feature', text: 'Added platform admin flag (profiles.is_platform_admin) for the site owner. Platform admin can read every practice and acts as owner for write operations — used for support and debugging' },
      { type: 'security', text: 'Tightened practice_users and profiles SELECT policies so users with the "user" role can only see their own membership and profile, not other practice members. Owners and admins still see everyone in their practice' },
      { type: 'security', text: 'Tightened practices UPDATE to owner-only (was admin+owner). Renaming the practice or changing the slug is an owner-only action' },
      { type: 'security', text: 'Added a database trigger preventing removal or demotion of the last owner of a practice. A practice must always have at least one owner' },
      { type: 'security', text: 'is_practice_admin() database helper now returns true for platform admins, so every existing _admin write policy automatically grants platform admin access (no per-table policy changes needed)' },
      { type: 'improvement', text: 'Server-side dashboard loader now exposes data._v4.myRole and data._v4.isPlatformAdmin to the client, ready for Phase B (UI gating)' },
      { type: 'improvement', text: 'New lib/permissions.js helper module — single source of truth for role-based UI gating. Components use canEditPracticeData(data), canManagePractice(data), etc. rather than checking roles inline' },
    ]
  },
  {
    version: '4.0.17',
    date: '2026-05-04',
    title: 'Team page: stable layout, tags as circles',
    changes: [
      { type: 'improvement', text: 'Buddy and Who\'s In tags are now small circles (B / W) to clearly distinguish them from the rectangular working-day pills' },
      { type: 'improvement', text: 'Tags are always rendered — active state has a coloured fill, inactive state has a light outlined circle. Hovering shows a tooltip explaining what each tag does' },
      { type: 'improvement', text: 'Working days now sit at a fixed distance from the right of the card — previously cards with fewer tags caused the pill row to drift right' },
      { type: 'improvement', text: 'Added a clear gap between the working-day pills and the status tags so they read as two distinct groups' },
    ]
  },
  {
    version: '4.0.16',
    date: '2026-05-04',
    title: 'Tidy up: pills to the right, sidebar slimmer',
    changes: [
      { type: 'improvement', text: 'Day pills moved out from under the name to the right side of the card. Names are predominant again, pills are slightly bigger (28px) and easier to tap' },
      { type: 'improvement', text: 'Removed Working patterns from the sidebar. Still accessible via the "Weekly grid →" button on the Team page' },
      { type: 'improvement', text: 'Removed the Buddy cover button from the Team page (was redundant with the sidebar entry)' },
      { type: 'improvement', text: 'Card row wraps on narrow screens so pills land on a new line rather than overflowing' },
    ]
  },
  {
    version: '4.0.15',
    date: '2026-05-04',
    title: 'Inline working patterns on the team page',
    changes: [
      { type: 'feature', text: 'Each active team member now shows a row of M/T/W/T/F day pills under their role on the Team page. Click a pill to toggle whether they work that day — same data as the Working Patterns grid, just inline per person' },
      { type: 'feature', text: 'New "Weekly grid →" button on the Team page jumps to the full working-patterns grid (useful for seeing the whole team at once or running auto-generate)' },
      { type: 'feature', text: 'New "Buddy cover →" button on the Team page jumps straight to buddy cover so you can see how the patterns translate into daily allocations' },
      { type: 'improvement', text: 'Pills are hidden for administrative and left staff (where working pattern is not meaningful). Visible for active and LTA staff' },
    ]
  },
  {
    version: '4.0.14',
    date: '2026-05-04',
    title: 'Fix silent slug-save failure',
    changes: [
      { type: 'fix', text: 'The practices table had no UPDATE RLS policy, so the slug editor silently failed (Postgres RLS blocks the write but does not raise an error — the API returned success despite changing zero rows). Added an UPDATE policy that lets owners and admins edit their practice' },
      { type: 'fix', text: 'Slug editor now uses .select() after the update to verify a row actually changed. If the update is blocked by RLS or returns no rows, it shows an explicit error instead of pretending success' },
      { type: 'fix', text: 'Removed the misleading "Redirecting…" message — router.refresh() does not redirect, just refreshes the current page. Now says "Saved" only after a verified successful update' },
    ]
  },
  {
    version: '4.0.13',
    date: '2026-05-04',
    title: 'Pretty practice URLs — /p/winscombe instead of /dashboard?practice=UUID',
    changes: [
      { type: 'feature', text: 'New canonical route /p/[id] where [id] can be a slug, ODS code, or UUID. Resolver looks up in that order — pretty URLs by default, real-world identifiers and old bookmarks all keep working' },
      { type: 'feature', text: 'Practices now have a slug column, auto-generated from the practice name on migration. Editable on the practice management page (owners and admins only). Unique across the whole platform' },
      { type: 'improvement', text: 'Old /dashboard?practice=UUID URLs redirect to the new /p/[slug] form so existing bookmarks and shared links keep working' },
      { type: 'improvement', text: 'Practice picker, switch-practice dropdown, and back-to-dashboard links all use the slug URL now. New users land on /p/[slug] from the moment they create or pick a practice' },
      { type: 'improvement', text: 'Came-in-by-UUID? The page redirects to the slug version automatically. So shared URLs always end up looking clean' },
    ]
  },
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
