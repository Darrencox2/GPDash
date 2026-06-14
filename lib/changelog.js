export const CHANGELOG = [
  {
    version: '4.77.1',
    date: '2026-06-14',
    title: 'Meeting import reliability',
    changes: [
      { type: 'fix', text: 'Fixed an error when importing meeting documents that could show Unexpected end of JSON input. The import now reads the server response safely and always shows a clear message if something goes wrong' },
    ]
  },
  {
    version: '4.77.0',
    date: '2026-06-13',
    title: 'More flexible meeting schedules',
    changes: [
      { type: 'feature', text: 'Recurring meeting schedules now support patterns like the second Wednesday of every month, or the last Friday. Choose the week (first to fourth, or last) and the day, and the dates generate correctly each month including months where that fifth weekday does not exist' },
    ]
  },
  {
    version: '4.76.1',
    date: '2026-06-13',
    title: 'Fix meeting document import connection',
    changes: [
      { type: 'fix', text: 'The import feature could fail to connect when reading a document. It now uses the proper Supabase function call which handles authentication and cross origin requests correctly' },
    ]
  },
  {
    version: '4.76.0',
    date: '2026-06-13',
    title: 'Agenda contributions and printable agendas',
    changes: [
      { type: 'feature', text: 'You can now propose a point for discussion on a meeting rather than adding it straight to the agenda. Proposed points show in amber with who suggested them, and the chair can add them to the agenda with one tap. Confirmed items are numbered, proposed ones are not, so the running order stays clean' },
      { type: 'feature', text: 'Generate a tidy agenda or minutes document from any meeting. Print or save as PDF, or copy a plain text version straight into an email. The agenda uses the confirmed items in order, and the minutes include the discussion, outcomes and the list of actions' },
    ]
  },
  {
    version: '4.75.0',
    date: '2026-06-13',
    title: 'Cross meeting action register',
    changes: [
      { type: 'feature', text: 'New Action register tab that brings every action from every meeting into one place. Filter by active, your own actions, or done, assign each action to a practice member, set a due date and priority, and cycle the status. Overdue actions are highlighted and sorted to the top, and each action shows which meeting it came from' },
      { type: 'tech', text: 'Actions can now be linked to a real practice member as well as a free text name, and agenda items track who proposed them and whether they are proposed or confirmed, laying the groundwork for staff agenda contributions and generated agenda documents' },
    ]
  },
  {
    version: '4.74.0',
    date: '2026-06-13',
    title: 'Import past agendas and minutes',
    changes: [
      { type: 'feature', text: 'You can now bulk import historical meeting documents. Upload your past agendas and minutes as Word or PDF files and each one is read automatically to pull out the meeting date, the agenda items, the discussion and any actions. You review what was found, correct anything if needed, then file it. Nothing is saved until you confirm, and it is all confidential to the leadership team' },
      { type: 'note', text: 'Importing reads the document with AI. If you see a message that document AI is not configured, an administrator needs to add the API key in settings' },
    ]
  },
  {
    version: '4.73.0',
    date: '2026-06-13',
    title: 'Recurring meeting schedules',
    changes: [
      { type: 'feature', text: 'You can now set up a recurring meeting, for example a weekly partners meeting on Tuesdays, and generate its dates ahead of time. Each generated date appears in the meetings list ready for its agenda and minutes. Generating again tops up future dates without ever duplicating one' },
    ]
  },
  {
    version: '4.72.0',
    date: '2026-06-13',
    title: 'Meetings module',
    changes: [
      { type: 'feature', text: 'Introduced a Meetings area for the leadership team. Create meetings, build an agenda, and turn each agenda item into minutes inline with an outcome of decision, noted, deferred or action. Actions can be raised against any item with an assignee and a status you can cycle through open, in progress and done' },
      { type: 'feature', text: 'Meetings are confidential to the leadership tier, partners, practice managers and the owner. Operational admins and all other staff cannot see them. This is enforced at the database with row level security, so partner business such as pay, HR and complaints stays private' },
      { type: 'note', text: 'This is the first stage. Carry forward of open actions across meetings, and printable agendas and minutes, are coming next' },
    ]
  },
  {
    version: '4.71.0',
    date: '2026-06-13',
    title: 'Partner and practice manager roles',
    changes: [
      { type: 'feature', text: 'Added two senior roles, Partner and Practice manager, that sit above Admin. These form a confidential leadership tier alongside the Owner. Admins remain operational staff, for example a reception manager, who run the practice day to day but do not get access to confidential leadership areas' },
      { type: 'feature', text: 'Partners and practice managers have full management access, the same as each other at this stage. They can edit practice data and manage members, but only the leadership tier can assign or change leadership roles, and only an owner can create another owner' },
      { type: 'tech', text: 'New database tier helpers is_practice_admin now covers the whole management tier and is_practice_leadership covers the confidential tier, ready to gate confidential modules' },
    ]
  },
  {
    version: '4.70.6',
    date: '2026-06-13',
    title: 'Accessibility improvements',
    changes: [
      { type: 'tweak', text: 'Added a clear keyboard focus outline across the whole app so people navigating by keyboard can always see where they are. It only appears for keyboard users, not mouse clicks' },
      { type: 'fix', text: 'The theme toggle button now has a proper label for screen readers when the sidebar is collapsed' },
    ]
  },
  {
    version: '4.70.5',
    date: '2026-06-13',
    title: 'Clearer navigate to today control',
    changes: [
      { type: 'fix', text: 'When viewing a day that is not today, the small green today text next to the date looked like a label claiming that day was today. It is now a clearly labelled Navigate to today button with an arrow, sitting under the date' },
    ]
  },
  {
    version: '4.70.4',
    date: '2026-06-13',
    title: 'Duty fairness report uses the real duty doctor',
    changes: [
      { type: 'fix', text: 'Corrected the Duty sessions report to use the actual duty doctor, defined by the duty slots set on the Today page, rather than whoever ran the most urgent slots. Added Duty doctor as a measure option in the report builder too, so you can build your own duty reports. If duty slots are not set the report explains how to set them' },
    ]
  },
  {
    version: '4.70.3',
    date: '2026-06-13',
    title: 'Restored duty fairness report',
    changes: [
      { type: 'feature', text: 'Brought back the Duty sessions as a share of own sessions report in Workload and fairness. For each clinician it shows the sessions where they ran the most urgent slots, the de-facto duty doctor, divided by the total sessions they worked, so you can see how the duty load is shared across the team' },
    ]
  },
  {
    version: '4.70.2',
    date: '2026-06-13',
    title: 'Narrower sidebar and larger logo',
    changes: [
      { type: 'tweak', text: 'The sidebar is now about 30 percent narrower, giving more room to the main content. The logo is 20 percent larger to balance the slimmer sidebar' },
    ]
  },
  {
    version: '4.70.1',
    date: '2026-06-13',
    title: 'Light mode fixes on practice settings',
    changes: [
      { type: 'fix', text: 'A few fields on the practice settings pages still had dark backgrounds that were hard to read in light mode: the quick setup table control, the excluded row shading in bulk invite, and the demand upload drop area. All now follow the theme. Modal overlays and drop shadows are left dark by design' },
    ]
  },
  {
    version: '4.70.0',
    date: '2026-06-13',
    title: 'Larger interface and logo fix',
    changes: [
      { type: 'tweak', text: 'The whole interface is now 25 percent larger for easier reading, scaling text, spacing and icons together so every layout stays in proportion' },
      { type: 'fix', text: 'The GP in the logo was invisible in light mode because it was hard coded white. It now follows the theme so it shows correctly in both light and dark' },
    ]
  },
  {
    version: '4.69.4',
    date: '2026-06-13',
    title: 'Password reset links finally fixed',
    changes: [
      { type: 'fix', text: 'Reset links were being opened and invalidated by NHS mail security scanners before you could use them, which made every link appear instantly expired. The auth logs confirmed a scanner consuming the single use token. Switched the reset flow to the more secure PKCE method, where the link is useless to anything except the browser that requested the reset, so scanners can no longer burn it' },
      { type: 'tweak', text: 'The sign in callback now handles password recovery links directly and sends failures back to the reset page so a new link can be requested in one tap' },
    ]
  },
  {
    version: '4.69.2',
    date: '2026-06-11',
    title: 'Fix reset links showing invalid immediately',
    changes: [
      { type: 'fix', text: 'Password reset links opened straight from the email were rejected as invalid or expired even when brand new. The reset page was only checking for an existing session and never completing the secure exchange that the link requires. It now handles all of the link formats Supabase can send and signs you in before asking for a new password. The link token is also cleared from the address bar afterwards so a reload or an email security scanner cannot trip it' },
    ]
  },
  {
    version: '4.69.1',
    date: '2026-06-11',
    title: 'Tidy duplicate reset link buttons',
    changes: [
      { type: 'fix', text: 'Two parallel builds of the email free reset link landed at once, leaving two buttons doing the same job on the admin user page and duplicate changelog entries. Consolidated on the audited version that records every use in the auth log' },
    ]
  },
  {
    version: '4.69.0',
    date: '2026-06-11',
    title: 'Password recovery without email',
    changes: [
      { type: 'feature', text: 'Platform admins can now generate a password recovery link directly from the admin user page, without sending an email. Copy the link and pass it to the user through any channel. The link works once and expires after an hour. Built because NHS mail can delay or quarantine automated emails, and a reset should never be blocked by a mail filter' },
      { type: 'note', text: 'Link generation is restricted to platform admins and every use is recorded in the auth audit log' },
    ]
  },
  {
    version: '4.68.3',
    date: '2026-06-11',
    title: 'Fix password reset confirmation never appearing',
    changes: [
      { type: 'fix', text: 'Requesting a password reset crashed silently just after the email was requested, so the confirmation screen never appeared even though the request had gone through. The cause was the audit logging call using a promise method the Supabase query builder does not provide. The same risky pattern was fixed in 14 places across sign in, sign up, MFA verification, sign out, security and account settings, where it could have been silently breaking event logging' },
    ]
  },
  {
    version: '4.68.2',
    date: '2026-06-11',
    title: 'Password reset failures are now visible',
    changes: [
      { type: 'fix', text: 'If a password reset request fails, the page now always shows what went wrong. Previously certain failures could leave the page showing nothing at all, with no confirmation and no error' },
    ]
  },
  {
    version: '4.68.1',
    date: '2026-06-11',
    title: 'Public changelog page',
    changes: [
      { type: 'feature', text: 'The full version history is now available at gpdash.net/changelog as a public page, with every release back to the start of v4 grouped by version with New, Fix and Improved badges' },
    ]
  },
  {
    version: '4.68.0',
    date: '2026-06-11',
    title: 'Change history with revert',
    changes: [
      { type: 'feature', text: 'New History panel on the buddy cover page showing every attendance change and weekly rota edit: who made it, when, and what changed. Editors can revert any entry with one tap. Reverts go through the normal edit paths and are themselves recorded, so the trail is never rewritten' },
      { type: 'note', text: 'History starts recording from this version onwards. Buddy reassignment overrides will be added to the trail in a future update' },
    ]
  },
  {
    version: '4.67.0',
    date: '2026-06-11',
    title: 'Install GPDash as an app',
    changes: [
      { type: 'feature', text: 'GPDash can now be installed to your home screen as an app. On Android or desktop Chrome use Install app from the browser menu. On iPhone use Share then Add to Home Screen. It opens full screen with the GPDash icon, without the browser bar' },
      { type: 'note', text: 'The groundwork for push notifications is included, ready for when proactive alerts are added. No caching is used, so the installed app always runs the latest version' },
    ]
  },
  {
    version: '4.66.7',
    date: '2026-06-11',
    title: 'Loading skeleton for the forecast',
    changes: [
      { type: 'tweak', text: 'The demand forecast on Today now shows a shaped loading skeleton instead of a spinner, so the page does not jump when the chart arrives. Also removed a leftover empty style block' },
    ]
  },
  {
    version: '4.66.6',
    date: '2026-06-11',
    title: 'Better experience on phones',
    changes: [
      { type: 'fix', text: 'On phones the navigation drawer no longer opens over the page on every load. It now starts closed on small screens and opens from the menu button' },
      { type: 'fix', text: 'Page titles no longer sit underneath the floating menu button on phones. Content now clears it on every page, replacing the one off workarounds that only Today and Buddy Cover had' },
      { type: 'tweak', text: 'The Buddy Cover action buttons wrap neatly on narrow screens instead of overflowing' },
      { type: 'tweak', text: 'Full height layouts now track the real visible height on mobile browsers, so the bottom of the navigation no longer hides behind the browser bar' },
    ]
  },
  {
    version: '4.66.5',
    date: '2026-06-10',
    title: 'One shape scale and one colour vocabulary',
    changes: [
      { type: 'tweak', text: 'Corner rounding across the whole app now uses a single four step scale instead of ten different ad hoc values. 433 spots were standardised, so controls, buttons, cards and pills all share consistent shapes' },
      { type: 'tweak', text: 'The older text colour tokens used by the Workforce Planner are now aliases of the main theme palette, so every neutral colour in the app comes from one set and cannot drift between pages' },
    ]
  },
  {
    version: '4.66.4',
    date: '2026-06-10',
    title: 'Charts follow the theme',
    changes: [
      { type: 'fix', text: 'The demand forecast chart on Today and the fullscreen huddle chart now follow the theme properly. Chart colours are read from the theme when the chart is drawn and the chart redraws when you switch themes, so gridlines, axis labels and weekend shading are no longer stuck dark on light' },
      { type: 'fix', text: 'Fixed a regression where some chart lines and axis labels could render black in both themes because the chart engine cannot read theme variables directly' },
    ]
  },
  {
    version: '4.66.3',
    date: '2026-06-10',
    title: 'Consistent empty states and save indicator',
    changes: [
      { type: 'tweak', text: 'Empty states across Today, Capacity Planning, Reporting, Clinician Capacity and the Whos In panel now share one design: icon, clear title, short hint and a single action where relevant. The Today page upload prompt keeps its Select CSV button' },
      { type: 'tweak', text: 'The Workforce Planner save indicator now uses the shared component, which will appear anywhere else autosave is added' },
    ]
  },
  {
    version: '4.66.2',
    date: '2026-06-10',
    title: 'Consistent page headers',
    changes: [
      { type: 'tweak', text: 'Reporting, Clinician Rota, Settings and the Workforce Planner now share one page header style: same title size and weight, same muted subtitle, actions aligned on the right. Previously each page had its own invention, from extra bold white titles to four different sizes' },
      { type: 'fix', text: 'The Buddy Cover title is now readable in light mode. It was fixed white text on a band that becomes pale in the light theme' },
    ]
  },
  {
    version: '4.66.1',
    date: '2026-06-10',
    title: 'In app confirmations everywhere',
    changes: [
      { type: 'tweak', text: 'All 36 confirmation prompts across the app now use the new in app dialog instead of the browser default popup, including deleting and clearing data, removing members and clinicians, leaving a practice, suspending users and revoking invites. Destructive actions show a clear warning style, and Enter or Escape confirm or cancel' },
    ]
  },
  {
    version: '4.66.0',
    date: '2026-06-10',
    title: 'Design system foundation',
    changes: [
      { type: 'feature', text: 'Introduced a single design system for the whole app: one set of buttons, cards, page headers, badges, inputs, empty states, loading skeletons and save indicators, all built on the theme so they work in light and dark. New screens and updates will use these so the product looks and behaves consistently' },
      { type: 'feature', text: 'New in app confirmation dialog that matches the product design, replacing the browser default popup. It supports keyboard confirm and cancel and a clear danger style for destructive actions' },
      { type: 'tweak', text: 'Added a consistent shape scale so corner rounding is uniform across the app' },
    ]
  },
  {
    version: '4.65.25',
    date: '2026-06-07',
    title: 'Workforce planner light theme',
    changes: [
      { type: 'tweak', text: 'The workforce planner now fully follows the theme in light mode. It already used theme variables for most of its surface, so the remaining work was the week toggle background and the role dropdown options that were still dark' },
    ]
  },
  {
    version: '4.65.24',
    date: '2026-06-07',
    title: 'Fix buddy cover status not changing at weekends',
    changes: [
      { type: 'fix', text: 'On Saturdays and Sundays the buddy cover opened on the Monday of the current week, which had already passed and is read only, so clinician statuses could not be changed. The buddy cover, rota and huddle now default to the upcoming working week at weekends, so today is always editable. This was the underlying cause of the click problem rather than the clickable area' },
    ]
  },
  {
    version: '4.65.23',
    date: '2026-06-02',
    title: 'Practice settings follow the theme',
    changes: [
      { type: 'tweak', text: 'The practice settings pages now follow the theme in light mode, including the members and clinicians tabs, capacity targets, demand upload and comparison, audit log, working days, invites and the danger zone. Input fields are light and readable, and headings no longer disappear on light backgrounds' },
      { type: 'note', text: 'The first time practice setup wizard stays dark for now, since new practices do not yet have the theme toggle available' },
    ]
  },
  {
    version: '4.65.22',
    date: '2026-06-02',
    title: 'Clinician capacity sorting and theme',
    changes: [
      { type: 'tweak', text: 'Capacity planning: the clinician search list in the Clinician capacity section is now sorted alphabetically. The comparison bars remain ranked by routine availability' },
      { type: 'tweak', text: 'The Clinician capacity section now follows the theme in light mode (it had been missed in the earlier Capacity conversion)' },
    ]
  },
  {
    version: '4.65.21',
    date: '2026-06-02',
    title: 'Buddy cover page follows the theme',
    changes: [
      { type: 'tweak', text: 'The buddy cover page now follows the theme in light mode, including the daily allocation cards, the hover tooltip, the override markers and the EMIS report card with its preview. Status tints and the copy button keep their colours' },
    ]
  },
  {
    version: '4.65.20',
    date: '2026-06-02',
    title: 'Light theme readability and less grey',
    changes: [
      { type: 'fix', text: 'Light mode: input and dropdown fields were showing as dark grey boxes with dark text, which made them unreadable on the workload report builder and elsewhere. Fields are now white in light mode with readable text' },
      { type: 'tweak', text: 'Made light mode less grey overall: panels are whiter, secondary text is darker and easier to read, and the My Rota background is lighter' },
    ]
  },
  {
    version: '4.65.19',
    date: '2026-06-02',
    title: 'Rota and connector theming + Who is In fix',
    changes: [
      { type: 'fix', text: 'Whos In: the Off today and hide controls no longer overlap the location badge on the right. The location badge now fades out while those controls are showing on hover' },
      { type: 'tweak', text: 'My Rota and the Demand to Capacity connector now follow the theme in light mode. Added solid surface variables so dark card fills flip to light without going transparent. Duty and support highlight colours and the demand and capacity chart lines are unchanged' },
    ]
  },
  {
    version: '4.65.18',
    date: '2026-06-02',
    title: 'Capacity (forward look) follows the theme',
    changes: [
      { type: 'tweak', text: 'The forward-look Capacity page now follows the theme in light mode, including its gauges, trend bars, headers and panels. Coloured status badges keep their white text as before' },
    ]
  },
  {
    version: '4.65.17',
    date: '2026-06-02',
    title: 'Account pop-out panels follow the theme',
    changes: [
      { type: 'tweak', text: 'The clinician details panel, the transfer-ownership dialog and the buddy-cover settings panel now follow the theme in light mode, including their headers, dialogs and body text' },
    ]
  },
  {
    version: '4.65.16',
    date: '2026-06-02',
    title: 'Workload report builder follows the theme',
    changes: [
      { type: 'tweak', text: 'The workload report builder pop-out now follows the theme in light mode, including the trend chart, axis labels, reference line, dropdowns and footer. This was the heaviest remaining pop-out' },
    ]
  },
  {
    version: '4.65.15',
    date: '2026-06-02',
    title: 'Today-page widgets follow the theme',
    changes: [
      { type: 'tweak', text: 'The shared Today-page widgets now follow the theme in light mode: the speedometer and mini gauges, the seven-day and twenty-eight-day strips and chart, and the day detail panels. Introduced a reusable set of theme variables for widget surfaces so the rest of the light-mode conversion can reuse them' },
    ]
  },
  {
    version: '4.65.14',
    date: '2026-06-02',
    title: 'Huddle waiting-room board follows the theme',
    changes: [
      { type: 'feature', text: 'The fullscreen Huddle waiting-room board now has both a dark and a light version and flips with the theme toggle. It reads the theme live, so both the main screen and the popped-out second screen stay in sync. The board was previously dark only' },
    ]
  },
  {
    version: '4.65.13',
    date: '2026-06-02',
    title: 'Buddy click fix + first pop-outs themed',
    changes: [
      { type: 'fix', text: 'Buddy cover: the whole clinician row is clickable again to toggle present, day off or absent. The hover feature had left only the small status pill clickable. Clicking the pill no longer double-toggles' },
      { type: 'tweak', text: 'Started converting pop-outs to light mode: the Huddle side panel drawer and the buddy reassign-cover dialog now follow the theme. Text-slate-50 and 100 now darken in light mode so light-coloured headings stay readable' },
    ]
  },
  {
    version: '4.65.12',
    date: '2026-06-02',
    title: 'Sidebar, buttons and hero colour',
    changes: [
      { type: 'tweak', text: 'Widened the sidebar by half again, enlarged the practice name and avatar at the bottom, made the version number visible in dark mode, and made the theme toggle button larger' },
      { type: 'tweak', text: 'Made the Upload CSV and Huddle board buttons more vibrant, and added colour-glass to the gauge and hero cards at the top of the Today page' },
    ]
  },
  {
    version: '4.65.11',
    date: '2026-06-02',
    title: 'Lit colour-glass panes',
    changes: [
      { type: 'tweak', text: 'Reworked the colour panes so they look like lit glass rather than a flat block of colour. Each pane now has a light highlight in one corner, a deeper pool of its colour in the opposite corner, a soft sheen on the header band, and a gentle glow in its own colour. Light theme only; dark unchanged' },
    ]
  },
  {
    version: '4.65.10',
    date: '2026-06-02',
    title: 'Whole-card colour-glass panes',
    changes: [
      { type: 'tweak', text: 'Each panel is now a full pane of colour glass rather than a white card with a coloured strip. The hue washes softly across the whole card with a matching coloured edge and a vivid header band of the same colour, so the page reads as a set of translucent colour panes like the inspiration. Light theme only; dark unchanged' },
    ]
  },
  {
    version: '4.65.9',
    date: '2026-06-02',
    title: 'Vibrant panes and a more unified page',
    changes: [
      { type: 'tweak', text: 'Made the coloured header windows much more vibrant, like saturated panes of colour glass. Also unified the page: the gauge and session panels were flat bordered boxes while everything else floated, so they now use the same card style with the same soft shadow, so the whole page reads as one set of consistent floating panels rather than a mix. Light theme only' },
    ]
  },
  {
    version: '4.65.8',
    date: '2026-06-02',
    title: 'Coloured header windows',
    changes: [
      { type: 'tweak', text: 'Replaced the header gradients with flat single-colour transparent windows that vary by panel, taking the cue from the translucent coloured panes in the inspiration. On the Today page Who is in is violet, Routine wait times blue, the morning and afternoon panels amber and teal, and the others cyan, green and pink, all on clean white cards. Light theme only; dark unchanged' },
    ]
  },
  {
    version: '4.65.7',
    date: '2026-06-02',
    title: 'Vibrant colour-glass headers',
    changes: [
      { type: 'tweak', text: 'Pushed the light theme colour much harder. The canvas is now clean near-white and panel headers are vibrant translucent colour glass (a purple to magenta to blue spread) so the colour reads as the hero on a clean white field, taking the cue from the saturated translucent shapes in the inspiration. Dark theme unchanged' },
    ]
  },
  {
    version: '4.65.6',
    date: '2026-06-02',
    title: 'Colour-glass headers',
    changes: [
      { type: 'tweak', text: 'Removed the faint background colour washes. Instead, panel headers in light mode are now translucent colour windows (a soft indigo to violet to magenta tint) sitting on clean white cards, taking the cue from the translucent coloured panes in the inspiration image. Done through one shared token so every panel header matches. Dark theme unchanged' },
    ]
  },
  {
    version: '4.65.5',
    date: '2026-06-02',
    title: 'Colourful light canvas',
    changes: [
      { type: 'tweak', text: 'The light theme canvas now has soft translucent colour washes in the corners (purple, pink, sky and teal) fading to a clean centre, giving the page an airy, vibrant feel while white cards stay clean and readable on top. Kept deliberately subtle; intensity is easy to tune. Dark theme unchanged' },
    ]
  },
  {
    version: '4.65.4',
    date: '2026-06-02',
    title: 'Cleaner light theme',
    changes: [
      { type: 'tweak', text: 'Reworked the light theme so it feels airy and modern rather than a flat white-out. The page canvas is now a soft cool tone so white cards read as distinct panels, cards have a gentle soft shadow so they lift off the page, borders are lighter hairlines now that depth does the separating, and the accent colour is a touch more present. Dark theme is unchanged' },
    ]
  },
  {
    version: '4.65.3',
    date: '2026-06-02',
    title: 'Light theme: Who is in and Routine wait times',
    changes: [
      { type: 'fix', text: 'The Who is in list and the Routine GP wait times panel had dark navy backgrounds baked in that showed as grey blocks in light mode. These now use the theme surfaces, with their text and the mark-off dialog converted to theme colours so everything is readable in both themes' },
    ]
  },
  {
    version: '4.65.2',
    date: '2026-06-02',
    title: 'Today page readability in light mode',
    changes: [
      { type: 'fix', text: 'Fixed text that was unreadable on the light theme. Secondary grey text and coloured status text (the role pills, the est and Bank Holiday badges, the duty-doctor diagnostic, gauge labels and the goto-date input) were light shades chosen for the dark page and disappeared on the light background. Colour text now darkens in light mode and stays light in dark mode, so it is readable on its background either way' },
    ]
  },
  {
    version: '4.65.1',
    date: '2026-06-02',
    title: 'Today page light theme',
    changes: [
      { type: 'fix', text: 'The Today page now follows the light theme properly. Its page background, panels, inputs and headings were hard-coded to dark values and stayed dark in light mode; these now use the shared theme colours. Text that sat on the dark page is now readable on the light background, while white text on coloured items (duty card, clinician initials, action buttons) is unchanged' },
    ]
  },
  {
    version: '4.65.0',
    date: '2026-06-02',
    title: 'Light theme and dark/light toggle',
    changes: [
      { type: 'feature', text: 'Added a light theme inspired by a clean near-white look, plus a dark or light toggle in the sidebar footer. Your choice is remembered between visits and applied before the page paints so there is no flash on load' },
      { type: 'feature', text: 'The sidebar, page background, cards and the whole Workforce planner are fully themed in both modes. Dark mode looks exactly as before' },
      { type: 'tweak', text: 'Some Huddle pages (Capacity planning, Today, Reporting) still have hardcoded dark areas inline and may show dark patches in light mode. These will be converted page by page next' },
    ]
  },
  {
    version: '4.64.3',
    date: '2026-06-02',
    title: 'Password reset link fix',
    changes: [
      { type: 'fix', text: 'Password reset and invite emails could contain a link to a temporary deployment address that stops working after later updates, giving a 404. Links now fall back to the stable preview address so they keep working' },
    ]
  },
  {
    version: '4.64.2',
    date: '2026-06-02',
    title: 'Consistent numbers across the site',
    changes: [
      { type: 'tweak', text: 'All numeric and data text now uses the same Space Mono font everywhere. Previously some pages fell back to the system monospace while others used Space Mono, so figures looked different page to page' },
    ]
  },
  {
    version: '4.64.1',
    date: '2026-06-02',
    title: 'Flatter cards',
    changes: [
      { type: 'tweak', text: 'Card and panel backgrounds are now flat — the frosted glass effect (blur, sheen and inset highlights) has been removed and replaced with a plain fill in the same dark tone, so the glass pages match the already-flat ones. No colours, fonts or layout were changed' },
    ]
  },
  {
    version: '4.64.0',
    date: '2026-06-02',
    title: 'Reset to working patterns restores everyone',
    changes: [
      { type: 'tweak', text: 'The top reset button is now Reset to working patterns. It puts every current clinician back into their real EMIS-contracted sessions and clears any contract edits, so people you had taken out of sessions come back. Staff you have added stay, and anyone marked as leaving stays removed — restore them with undo in the Clinicians popout' },
    ]
  },
  {
    version: '4.63.2',
    date: '2026-06-02',
    title: 'Newly added staff always show',
    changes: [
      { type: 'fix', text: 'Adding a clinician whose role was not part of an active role filter no longer hides them — their role is now kept visible so they appear in the list and on the grid' },
    ]
  },
  {
    version: '4.63.1',
    date: '2026-06-02',
    title: 'Popout no longer resizes the grid',
    changes: [
      { type: 'fix', text: 'Opening a popout no longer shrinks the main section or adds a horizontal scroll bar — the popout simply sits over the space to the right at the current width' },
    ]
  },
  {
    version: '4.63.0',
    date: '2026-06-02',
    title: 'Audit trail and centred layout',
    changes: [
      { type: 'feature', text: 'A new Audit popout lists every change made to reach the scenario you are viewing — moves, contract edits, staff added or removed, activities, resets and so on — starting from its origin (your working patterns for Current, or the scenario it was branched from). Each scenario keeps its own history' },
      { type: 'fix', text: 'The planner is centred again rather than stuck to the left' },
    ]
  },
  {
    version: '4.62.0',
    date: '2026-06-02',
    title: 'Total sessions headline',
    changes: [
      { type: 'feature', text: 'A headline box at the top now shows the total clinician-sessions on the grid for the week, counting everyone including those on activities (a full-day activity counts as both AM and PM)' },
      { type: 'feature', text: 'When you are editing a what-if scenario it compares the total against Current and shows the difference — for example minus 6 versus Current — so you can see at a glance how many sessions a change adds or loses, which is the gap to recruit to' },
    ]
  },
  {
    version: '4.61.2',
    date: '2026-06-02',
    title: 'Width tweak and holiday duty cover',
    changes: [
      { type: 'tweak', text: 'The planner is no longer full width — it sits between its old size and full, and when a popout is open the grid makes room so the popout has clear space on the right rather than covering the last day' },
      { type: 'fix', text: 'Holiday cover now also reduces the duty count by your allowance, in line with working and general' },
    ]
  },
  {
    version: '4.61.1',
    date: '2026-06-02',
    title: 'Contract edits move people, fuller role list',
    changes: [
      { type: 'tweak', text: 'Editing a clinicians contract now moves them in step with the change — unticking a session takes them out of it entirely (and off that sessions counts) instead of flagging them red, and ticking one on rosters them there' },
      { type: 'fix', text: 'Adding a person now offers a full list of practice roles to choose from (GP, Partner, Nurse, Pharmacist, Paramedic and more) rather than only ANP' },
    ]
  },
  {
    version: '4.61.0',
    date: '2026-06-02',
    title: 'Duty-doctor cover, wider layout and brighter cells',
    changes: [
      { type: 'feature', text: 'Mark any clinician as duty-capable with the D toggle in the Clinicians popout. Capable people get a subtle red ring around their circle, and each session gains a duty metric box counting how many duty-capable clinicians are free — anyone tied up on another activity is not counted' },
      { type: 'tweak', text: 'The planner now uses the full page width for more breathing space' },
      { type: 'tweak', text: 'The session metric boxes are more vibrant, and filled activities now sit on a blue background instead of green so they stand out from a good demand-ratio cell' },
    ]
  },
  {
    version: '4.60.0',
    date: '2026-06-02',
    title: 'Holiday cover view',
    changes: [
      { type: 'feature', text: 'A new Holiday cover toggle on the grid models your busiest leave day. Turn it on and every sessions working and general count drops by your allowance, with the demand ratio recalculated, so you can see how capacity holds up when the maximum number of staff are off' },
      { type: 'feature', text: 'Set how many staff are allowed off per day in Settings (defaults to 2) — fully editable and saved with the scenario' },
    ]
  },
  {
    version: '4.59.0',
    date: '2026-06-02',
    title: 'Workforce planner: a Current plan you can branch from',
    changes: [
      { type: 'feature', text: 'There is now a pinned Current scenario that loads automatically every time you open the planner — your live, rolling plan. It is built from your working patterns and you simply pick up where you left off' },
      { type: 'feature', text: 'Save the current plan as a named scenario (for example If Dr X leaves) to explore a what-if. Saving makes a copy and switches you to editing it, so Current stays exactly as it was. Switch back to Current, or between any saved scenarios, whenever you like — each keeps its own staff, contracts and activities' },
      { type: 'feature', text: 'New scenarios inherit the activities and their assigned clinicians from whatever you had, so you are not rebuilding the duty and visit rosters each time' },
      { type: 'tweak', text: 'Added a note making clear the base contract is pulled from your live working patterns, with a link to edit them under Manage practice, since changes in the planner are only a planning overlay' },
    ]
  },
  {
    version: '4.58.1',
    date: '2026-06-01',
    title: 'Fix full-day activity anomalies',
    changes: [
      { type: 'fix', text: 'A clinician on a full-day activity is now correctly counted as working both the AM and PM session, so they no longer show a false contracted-but-not-allocated or sessions-not-matching anomaly. Existing plans are healed automatically on load' },
      { type: 'tweak', text: 'Clarified that the Week A / B toggle only alternates activities — staff work the same each week' },
    ]
  },
  {
    version: '4.58.0',
    date: '2026-06-01',
    title: 'Highlight a clinician and save scenarios',
    changes: [
      { type: 'feature', text: 'Click a clinician in the Clinicians popout to highlight them across the whole grid — their sessions light up and everyone else dims, so you can see one persons week at a glance. A little Highlighting bar lets you clear it' },
      { type: 'feature', text: 'Scenarios let you save the whole plan under a name (School holidays, Full staff, Winter pressures) and load any of them back later to compare options, without losing your main plan' },
    ]
  },
  {
    version: '4.57.1',
    date: '2026-06-01',
    title: 'Quarter-session activities',
    changes: [
      { type: 'feature', text: 'Activities can now last a quarter of a session as well as a half, one session or a full day, so short tasks consume only 0.25 of a clinicians time' },
    ]
  },
  {
    version: '4.57.0',
    date: '2026-06-01',
    title: 'Editable contracts in the Workforce planner',
    changes: [
      { type: 'feature', text: 'Click a clinician in the Clinicians popout to edit their contracted sessions directly — tick AM and PM boxes under their name. Edits are a planner-only overlay and never change the live EMIS working pattern, and an edited contract is flagged' },
      { type: 'feature', text: 'Use allocation sets a persons contract to wherever they are currently placed on the grid, and Accept whole plan as contract does this for everyone at once — handy for adopting a reshaped rota as the new baseline' },
      { type: 'feature', text: 'Reset to EMIS reverts a single clinician (or all of them) to their live working pattern, undoing any contract edits' },
      { type: 'tweak', text: 'The divergence banner now also counts edited contracts, and the top-bar button is relabelled Reset plan to contract to distinguish it from resetting contracts to EMIS' },
    ]
  },
  {
    version: '4.56.1',
    date: '2026-06-01',
    title: 'Workforce planner fixes',
    changes: [
      { type: 'fix', text: 'Fixed a crash that could occur on activities saved before the duration and week options existed' },
      { type: 'tweak', text: 'Clinician name tags are now a uniform full-width and stack neatly, with room for long names shown in full' },
    ]
  },
  {
    version: '4.56.0',
    date: '2026-06-01',
    title: 'Workforce planner: staff editing, durations, alternate weeks',
    changes: [
      { type: 'feature', text: 'The Clinicians popout is now a full staff hub. Drag a name onto the grid to roster someone or drag a chip back to bench them, see each persons total sessions, click a name to view their contracted working days, and add or remove staff. Added people and leavers live only in the planner as an overlay that never changes the live records, with a banner noting how the planner roster differs from whats current' },
      { type: 'feature', text: 'Add a person with a quick tick-grid for their AM and PM days, or leave it blank for an ad-hoc locum who is purely additive and never flags as off-contract' },
      { type: 'feature', text: 'Activities are redesigned as cleaner cards. Click one to set its name, a duration of half a session, one session or a full day (a full day spans both AM and PM), and whether it repeats every week or on alternate weeks' },
      { type: 'feature', text: 'A Week A / Week B toggle switches the grid between alternating weeks, so activities tagged to one week only appear in that week' },
      { type: 'feature', text: 'Each session now shows three metric cards — working, general and demand — shaded red to green across the week so the thinnest sessions stand out, with a ratio-coloured footer underneath' },
      { type: 'feature', text: 'Ratio thresholds are now editable in Settings (defaults overstaffed below 12, tight above 20, short above 28), and there is a totals strip under the grid' },
      { type: 'tweak', text: 'Dragging now works on touchscreens as well as with a mouse' },
    ]
  },
  {
    version: '4.55.0',
    date: '2026-06-01',
    title: 'Workforce planner: auto-save, popouts, live session ratios',
    changes: [
      { type: 'feature', text: 'The planner now auto-saves. Selected roles, the planned allocation and activities are all remembered without needing to press a button, with a live Saving / Saved status' },
      { type: 'feature', text: 'Each session now shows a live summary below it — clinicians working, how many are left for general work, the expected demand for that day split across the two sessions, and the resulting ratio — and the session header is colour-coded by that ratio (blue overstaffed, green good, amber tight, red short), updating as you drag people around' },
      { type: 'tweak', text: 'Activities now sit at the top of each session, above the general-work clinicians' },
      { type: 'tweak', text: 'The role filter, the sessions-worked tracker and the anomaly list are now floating popouts opened from the top bar, giving the grid much more room' },
    ]
  },
  {
    version: '4.54.1',
    date: '2026-06-01',
    title: 'Bigger Workforce planner',
    changes: [
      { type: 'tweak', text: 'Scaled up the whole Workforce planner page — larger grid cells, clinician chips, activity boxes, role filter, session tracker and headings — so it is easier to read and drag on' },
    ]
  },
  {
    version: '4.55.0',
    date: '2026-06-01',
    title: 'Demand overlay on the Workforce planner',
    changes: [
      { type: 'feature', text: 'A demand overlay sits on the planner grid so you can contract capacity to the shape of demand. Each day header shows that day predicted requests (from your calibrated demand model) and the requests-per-contracted-session ratio, colour-coded green to red so the day where cover is thinnest relative to demand stands out at a glance' },
      { type: 'feature', text: 'As you drag clinicians around, the ratios update live, and a caption calls out where demand peaks and where cover is thinnest against it. The overlay can be toggled off, and the setting is remembered' },
    ]
  },
  {
    version: '4.54.0',
    date: '2026-06-01',
    title: 'Workforce planner is now an interactive allocator',
    changes: [
      { type: 'feature', text: 'The Workforce planner is now a drag-and-drop session allocator. Each weekday AM and PM cell shows a draggable chip for every clinician working it, and you can move people around the week to plan sessions' },
      { type: 'feature', text: 'Add an activity to any session with the plus button, give it a label (duty doctor, visits, triage), and drag a clinician onto it to assign them — the box turns from amber to green' },
      { type: 'feature', text: 'A role filter lets you choose which roles appear in the grid, so anyone outside the selected roles drops out' },
      { type: 'feature', text: 'A live session tracker down the side counts how many sessions each clinician is allocated against their contracted total, turning red on a mismatch' },
      { type: 'feature', text: 'Anomaly flag compares your planned allocation against the live contracted working pattern and flags drift — someone allocated off contract, contracted but not allocated, an activity left unassigned, or a total that does not match. Anomalies show as a banner, a per-cell badge, and a side list' },
      { type: 'tweak', text: 'Removed the weekly-demand slider and the capacity heat metrics in favour of the allocation view' },
    ]
  },
  {
    version: '4.53.0',
    date: '2026-06-01',
    title: 'New Workforce planner',
    changes: [
      { type: 'feature', text: 'New Workforce planner under Planning. It maps real clinical capacity for every weekday AM and PM session — rostered clinicians from your working patterns, minus non-clinical other activities, minus a holiday allowance — and sets it against your own demand model to show where supply and demand diverge. A unified heat map switches between Net clinical, Sessions worked, Duty cover and Demand ratio, and each tile also shows that day requests-per-session inline. Click any tile to see who is rostered, who is duty-eligible, which activities hit that session and the full capacity maths' },
      { type: 'feature', text: 'Other activities (teaching, admin, branch visits) are editable per clinician, per day, per session, and each one removes that clinician from the chosen block so net clinical capacity reflects reality' },
      { type: 'feature', text: 'Duty-doctor eligibility is now set per clinician and drives the duty-cover view, which traffic-lights how many duty-eligible clinicians are present each session' },
      { type: 'feature', text: 'Holiday allowance is a configurable max clinicians off per session (defaults to 2) rather than a fixed number, so each practice sets its own cap, with a toggle to include or exclude it. A weekly-demand slider stress-tests against busier weeks' },
    ]
  },
  {
    version: '4.52.5',
    date: '2026-05-31',
    title: 'Remove the placeholder QOF tracker',
    changes: [
      { type: 'tweak', text: 'Removed the Coming soon QOF tracker entry from the Planning menu while a proper capacity-and-demand planning tool is built in its place' },
    ]
  },
  {
    version: '4.52.4',
    date: '2026-05-31',
    title: 'Setup ends with a proper review page',
    changes: [
      { type: 'fix', text: 'Setup now finishes on a dedicated Review and finish page that summarises every step as done, needs attention, or skipped, each with a jump-straight-there button. Previously the skipped-steps reminder appeared on the last actual step and wrongly listed that step itself as skipped before you had reached it' },
    ]
  },
  {
    version: '4.52.3',
    date: '2026-05-31',
    title: 'Quick role setup: already-allocated people recede further',
    changes: [
      { type: 'tweak', text: 'In quick role setup, people already given a role now fade back more strongly — lower overall opacity and noticeably dimmer name and role text — so the clinicians still needing a role stand out clearly' },
    ]
  },
  {
    version: '4.52.2',
    date: '2026-05-31',
    title: 'Quick role setup: make the assigned-clinician fade reliable',
    changes: [
      { type: 'fix', text: 'Reworked the fade so the people you assign now reliably fade and lift out when you confirm a step. The previous version swapped a CSS animation which did not always re-trigger, so it often looked static. It now uses a CSS transition instead, which fires consistently' },
    ]
  },
  {
    version: '4.52.1',
    date: '2026-05-31',
    title: 'Quick role setup: assigned clinicians visibly fade out again',
    changes: [
      { type: 'fix', text: 'When you confirm a step in quick role setup, the people you just assigned now visibly fade and lift out, giving clear feedback that they have been allocated. They then appear greyed on the later steps. The recent review-style redesign had removed that fade, so it looked like nothing happened even though the role was being set' },
    ]
  },
  {
    version: '4.52.0',
    date: '2026-05-31',
    title: 'Create a practice manually if the NHS lookup is unavailable',
    changes: [
      { type: 'feature', text: 'Added an Enter manually option to the create-practice screen, so you are never blocked if the NHS practice lookup cannot find you or is having an outage. Type your practice name (required) plus an optional ODS code and list size, and carry on into setup. If you add an ODS code we still check for duplicates and try to find your postcode automatically' },
      { type: 'tweak', text: 'When a name search returns no matches there is now a direct link to switch to manual entry, pre-filled with what you typed' },
    ]
  },
  {
    version: '4.51.1',
    date: '2026-05-31',
    title: 'Practice lookup no longer hangs on "Searching NHS Digital"',
    changes: [
      { type: 'fix', text: 'The practice name and ODS code lookups now give up after 12 seconds and show a clear retry message if the NHS practice service is slow or unavailable, instead of spinning on Searching NHS Digital forever. The lookup uses the public OpenPrescribing service, which can occasionally be slow, and previously a stalled response left the search stuck with no way forward' },
    ]
  },
  {
    version: '4.51.0',
    date: '2026-05-31',
    title: 'Quick role setup starts by clearing out the non-clinicians',
    changes: [
      { type: 'feature', text: 'Quick role setup now opens with a non-clinicians step. Tick the telephone triage, care navigator and system or slot-holder entries that are not real clinicians, and they are marked administrative with the Administrator role and taken out of buddy cover. They then sit greyed out on the clinical role steps that follow, so the people who still need a clinical role stand out. Moving someone back onto a clinical role later re-activates them automatically' },
    ]
  },
  {
    version: '4.50.1',
    date: '2026-05-31',
    title: 'Setup: TeamNet after your team is loaded, tidier quick role grid',
    changes: [
      { type: 'fix', text: 'The TeamNet calendar step now comes after your clinicians are imported, rather than near the start. TeamNet matches absences against your team, so running it first imported zero — it now has the team to match against' },
      { type: 'tweak', text: 'Quick role setup now lays the names out in a tidy uniform grid instead of pills of every different width. Anyone already on another role is greyed out with their role shown under their name, so the people still needing a role stand out. You can still select the greyed ones if you want to move them' },
    ]
  },
  {
    version: '4.50.0',
    date: '2026-05-31',
    title: 'Buddy cover: hover a clinician to see why they are Present, Absent or Day off',
    changes: [
      { type: 'feature', text: 'Hovering over a clinician on the buddy cover day view now shows a clear tooltip explaining how the status was reached — for example works Mondays with no leave recorded, on planned leave today, does not work this weekday so it is a normal day off, or normally off but flagged for cover because an adjacent working day is on leave. It also flags any manual override and any mismatch with the latest EMIS upload' },
    ]
  },
  {
    version: '4.49.2',
    date: '2026-05-31',
    title: 'Quick role setup now shows everyone, pre-ticked',
    changes: [
      { type: 'tweak', text: 'Running quick role setup again now shows your whole team on every step with the people already on that role pre-ticked, so you can review and adjust rather than starting from scratch. Ticking someone adds them to the role, unticking someone who had it removes it, and anyone already on a different role is shown with that role in grey so you do not change them by accident' },
    ]
  },
  {
    version: '4.49.1',
    date: '2026-05-31',
    title: 'Fixes: routine slot filter, TeamNet sync diagnostics, clearer animation backdrops',
    changes: [
      { type: 'fix', text: 'The routine slot filter on Today showed an empty list (24 of 0 selected) for practices set up through the wizard. The picker now builds its slot list from every source — the saved filters, the live CSV and the stored list — so your slots always appear' },
      { type: 'fix', text: 'TeamNet sync now matches absences against all current staff rather than only those marked active, and when a sync imports zero it now tells you why — whether the feed returned no events, no clinicians were loaded, or events were found but no names matched. Run Sync now on the TeamNet panel to see the new diagnostic message' },
      { type: 'tweak', text: 'The animated overlays (setup welcome and celebration, quick role setup) now blur the page behind them much more strongly, so the text on top is easier to read' },
    ]
  },
  {
    version: '4.49.0',
    date: '2026-05-31',
    title: 'Guided clinician setup, wider quick role wizard, simpler duty slots',
    changes: [
      { type: 'feature', text: 'New owners now get a gentle guided walkthrough the first time they open the clinicians screen. It highlights each step in turn — run quick role setup, sort anyone left in the grid, check the working days grid, then confirm the in-buddy-system toggle for clinicians who receive lab results. It never blocks the page and can be skipped at any time' },
      { type: 'tweak', text: 'The quick role setup wizard now floats properly over the whole page (it no longer opened part way down), is much wider so more names fit, and has a search box so you can jump straight to a name you are looking for' },
      { type: 'tweak', text: 'On the duty doctor step, slot suggestions have been removed — you now just pick your duty slot or slots yourself from the dropdown, which is more reliable' },
    ]
  },
  {
    version: '4.48.0',
    date: '2026-05-31',
    title: 'Quick role setup — sort your whole team in a few taps',
    changes: [
      { type: 'feature', text: 'A new Quick role setup button on the clinicians screen opens a floating wizard that goes role by role rather than person by person. For each common GP role it shows everyone still needing a role as tappable chips — tap the ones who fit, hit Assign, and they fly out as they are sorted. Assigning a role also sets that role buddy-cover defaults automatically' },
      { type: 'feature', text: 'Doctor and title hints (Dr, Mrs and so on) are shown on each name to help you spot who is who, pulled from the original EMIS name' },
      { type: 'tweak', text: 'Anyone you do not pick during the pass simply stays in the grid afterwards for you to finish off individually, so nobody gets lost' },
    ]
  },
  {
    version: '4.47.1',
    date: '2026-05-31',
    title: 'Clearer setup completeness, alerts that do not get cut off, sorted roles',
    changes: [
      { type: 'fix', text: 'The setup completeness strip now uses three states instead of two. Green means done, amber means it needs attention, and a new neutral grey means optional and not set up yet. Optional sections you have not done no longer show as green looks-good or as amber to-do, and the heading now counts only the things that actually need finishing' },
      { type: 'fix', text: 'Pop-up alerts (toasts) are now drawn on top of everything via the page body, so they can no longer be cut off by a panel edge or a blurred background' },
      { type: 'tweak', text: 'The role dropdown is now ordered by how common each role is in general practice — GP Partner, Salaried GP, GP Registrar and Practice Nurse first, with the additional and support roles after — so the everyday choices are right at the top' },
    ]
  },
  {
    version: '4.47.0',
    date: '2026-05-31',
    title: 'Setup: dedicated urgent-capacity step + cleaner slot types',
    changes: [
      { type: 'feature', text: 'Expected urgent capacity is now its own setup step (just after slot types) rather than tucked at the bottom of the slot list. Same options as before: autofill from your appointment data, enter by hand, or skip' },
      { type: 'tweak', text: 'Duty doctor slots are now chosen in a single box at the top of the slot types step, using a dropdown (with removable chips), since it is usually only one or two slots. The per-row duty toggle has been removed from every slot type, which gives the Routine, Urgent and Other buttons much more room' },
    ]
  },
  {
    version: '4.46.1',
    date: '2026-05-31',
    title: 'New roles now show in setup, and cleaner role import',
    changes: [
      { type: 'fix', text: 'The roles added recently (Social Prescriber, Mental Health Nurse, GP Assistant, Physician Associate and the rest) now appear in the clinician role dropdown during setup. The dropdown and the importer now share one list, so adding a role in one place shows it everywhere' },
      { type: 'fix', text: 'Roles read from your appointment export are now tidied on import. A title in brackets like Dr or Mrs is treated as no role, spacing variants are matched to the proper role (so PracticeNurse becomes Practice Nurse), and truncated junk like Unknow no longer shows as a custom role. This is what was making a couple of entries appear with odd custom roles during setup' },
    ]
  },
  {
    version: '4.46.0',
    date: '2026-05-31',
    title: 'Setup wizard fixes: crash on finish, start point, TeamNet link, clinicians complete',
    changes: [
      { type: 'fix', text: 'Fixed a crash (client-side exception) that could appear when skipping past the team invite step near the end of setup. A step was calling a save helper by the wrong name' },
      { type: 'tweak', text: 'Setup now always starts at step one so you confirm the practice details and see the optional steps (like the TeamNet calendar) in order, rather than jumping ahead to the first technically-incomplete step and skipping past them' },
      { type: 'fix', text: 'The TeamNet calendar link now saves the moment you click away from the field, so it is reliably there when you return to that step later rather than being lost if you moved on quickly' },
      { type: 'fix', text: 'The clinicians step now recognises when it is done as you work, and bases this on every active clinician having a role assigned (the actual task of the step) rather than requiring a full working pattern for everyone. Previously it only re-checked when you left and came back, and the bar was so strict it rarely showed as complete' },
    ]
  },
  {
    version: '4.45.2',
    date: '2026-05-31',
    title: 'Past days are now fully read-only in Buddy cover',
    changes: [
      { type: 'fix', text: 'You could still reassign who covered whom on a day that had already happened, which quietly rewrote the historical record. Reassigning cover is now disabled on past days, matching how Generate and presence already behave, so past allocations stay as they were' },
    ]
  },
  {
    version: '4.45.1',
    date: '2026-05-31',
    title: 'Capacity Planning typography polish',
    changes: [
      { type: 'tweak', text: 'Brought Capacity Planning in line with the rest of the app typography. Headings now use the display font, and all the figures (the calendar morning and afternoon slot counts, day numbers, predicted-demand badges, week labels, the summary insight counts and the routine offered counts) now use the monospaced data font so columns of numbers line up and read consistently' },
    ]
  },
  {
    version: '4.45.0',
    date: '2026-05-31',
    title: 'Set your expected urgent capacity during setup',
    changes: [
      { type: 'feature', text: 'The slot types step now has an optional section for expected urgent capacity — how many urgent slots you aim to offer each morning and afternoon. You can autofill a starting point straight from your appointment data (it works out the average urgent slots per weekday and session from the slot types you marked as urgent), enter the numbers by hand, or skip it for now. These targets feed Capacity Planning and act as a fallback for the Today gauge, and can be changed any time from Practice settings, Demand' },
    ]
  },
  {
    version: '4.44.3',
    date: '2026-05-31',
    title: 'Clinician setup: assigning a role now sets the right buddy-cover defaults',
    changes: [
      { type: 'fix', text: 'On the clinician setup grid everyone could start switched off when the imported appointment data carried no role information, so there was nothing to base the defaults on. Now, assigning a role applies that roles buddy-cover defaults straight away: GP partners, associate partners and salaried GPs switch on and able to cover; registrars and ANPs switch on but not expected to cover; nurses, allied and admin stay off. This works for single rows and for bulk role assignment, and you can still override any toggle afterwards' },
    ]
  },
  {
    version: '4.44.2',
    date: '2026-05-31',
    title: 'Buddy cover: prompt to set up clinicians when the pool is empty',
    changes: [
      { type: 'tweak', text: 'Opening Buddy cover before anyone has been added to the buddy-cover pool used to show an empty schedule with no explanation. It now shows a clear prompt explaining that you first need to choose which clinicians take part, with a button straight to clinician setup' },
    ]
  },
  {
    version: '4.44.1',
    date: '2026-05-31',
    title: 'Clearer demand-history setup step',
    changes: [
      { type: 'tweak', text: 'After you upload demand history during setup, the step now gives you a clear choice rather than leaving you unsure whether to continue: Add more history (opens the uploader again right there) or Looks good — continue. It also explains plainly how much more history unlocks the remaining model features (90+ days for the growth trend, 270+ for full-year seasonality), so one upload no longer feels like a dead end' },
    ]
  },
  {
    version: '4.44.0',
    date: '2026-05-31',
    title: 'Onboarding: more roles, robust cover defaults, clearer slot step, bigger toggles',
    changes: [
      { type: 'feature', text: 'Added more frontline general-practice roles: Social Prescriber, Mental Health Nurse, GP Assistant, Physician Associate, Pharmacy Technician, First Contact Physiotherapist, Care Coordinator, Health and Wellbeing Coach, Mental Health Practitioner, Phlebotomist and Care Navigator. As a result, roles like social prescriber that previously showed as a custom role are now recognised properly' },
      { type: 'fix', text: 'The buddy-cover defaults now apply reliably. They previously only matched exact role names, so a clinician imported as Registrar, Advanced Nurse Practitioner or GPST3 (rather than the exact GP Registrar or ANP) missed the rule and defaulted wrongly. Matching is now tolerant of how roles actually appear: partners and salaried GPs default in and able to cover, registrars and ANPs default in but not expected to cover, and locums, students and everyone else default out of the pool' },
      { type: 'tweak', text: 'Slot types step: Triage slots no longer auto-categorise as urgent — they are usually triage contacts rather than bookable urgent appointments, so they default to Other and you can opt them in if needed. The Routine marker is now green, the step explains more clearly that this is about routine and urgent GP consultation slots (not nursing, procedures or admin), and the table has more room' },
      { type: 'tweak', text: 'Made the toggles and tick boxes on the clinicians setup step noticeably bigger, so they are much easier to tap' },
    ]
  },
  {
    version: '4.43.1',
    date: '2026-05-31',
    title: 'Fix NHS data upload for large files',
    changes: [
      { type: 'fix', text: 'Uploading the monthly NHS data on the admin page failed with a JSON error on larger files. The raw CSV was being sent whole and exceeded the server upload limit, which returned a plain-text error the page could not read. The files are now parsed in your browser and only the compact summary is sent, so large files upload fine, and any genuine server error now shows a clear message rather than a cryptic one' },
    ]
  },
  {
    version: '4.43.0',
    date: '2026-05-31',
    title: 'Favourite reports, pinned to the top',
    changes: [
      { type: 'feature', text: 'You can now star any report — a preset or one of your saved reports — using the star in the top corner of its card. Your favourites gather into a Favourites row pinned at the very top of the gallery, so the reports you use most are always one click away. Favourites are personal to you, so each colleague curates their own. A favourited report shows only in the Favourites row rather than appearing twice' },
    ]
  },
  {
    version: '4.42.0',
    date: '2026-05-31',
    title: 'Reporting: generic session measures and slot types first',
    changes: [
      { type: 'feature', text: 'The session measure is now practice-agnostic. Instead of the Winscombe-specific Worked, Duty and Support options, you choose how to count a session: Worked (any session a clinician worked), Includes slot types (sessions that contain one or more slot types you pick — so any practice can single out its on-call, minor-ops or clinic sessions), or Most urgent slots (the session each day with the most urgent slots, the de-facto on-call). Existing duty and support reports map automatically to the Most urgent slots measure' },
      { type: 'feature', text: 'When counting slots, the slot-type picker is now the first control under Measure rather than being tucked away in Refine, since it is usually the first thing you want to narrow' },
      { type: 'tweak', text: 'Removed the Duty sessions by week preset — with a duty doctor on every open day it told you nothing useful' },
      { type: 'tweak', text: 'Renamed the workload-and-fairness load preset to Most-urgent session load by clinician, which now works for any practice. Winscombe can reproduce its exact duty-doctor view by choosing Includes slot types and picking the duty slot, then saving it for the practice' },
    ]
  },
  {
    version: '4.41.1',
    date: '2026-05-31',
    title: 'Fix two-factor authentication QR code',
    changes: [
      { type: 'fix', text: 'The QR code on the platform admin Security page was rendered incorrectly — it overflowed its box, showed a stray data URI label, and physically covered the Verify and enrol button so it could not be clicked. It is now rendered as a properly sized image, so the code scans cleanly and enrolment can be completed. If you could not scan before, the manual secret shown beside it also works' },
    ]
  },
  {
    version: '4.41.0',
    date: '2026-05-30',
    title: 'Custom date ranges and save-your-own-preset for Reporting',
    changes: [
      { type: 'feature', text: 'Reports now offer a Custom date range alongside the fixed options. Choose Weeks from today and dial in any window — for example 2 weeks back to 4 weeks ahead — or switch to Specific dates and pick exact from and to dates. The resolved window is shown as you set it, and the header summary reflects whatever range is active' },
      { type: 'feature', text: 'You can now make a preset your own. Open any preset, adjust it (for example exclude some clinicians or change the range) and click Save for my practice — it saves under the preset name for your whole practice, with no need to invent a new name. Your saved version then replaces the built-in card in the gallery, so there is no duplicate. Save as new is still there if you would rather keep a separately named copy' },
      { type: 'tweak', text: 'Saving a preset no longer always forces the name box. The name box now only appears for Save as new or when saving a brand-new report built from scratch' },
    ]
  },
  {
    version: '4.40.2',
    date: '2026-05-30',
    title: 'Colour comes to the Reporting gallery',
    changes: [
      { type: 'tweak', text: 'The Reporting gallery now uses a colour accent per group — a coloured bar down the left edge of each card and a matching coloured heading, so Workload and fairness, Capacity and fill, Demand patterns and Appointment mix each have their own identity and are easy to pick out at a glance. Cards stay dark and calm otherwise, lift gently on hover and pick up a coloured ring in their group colour. Your saved reports carry a green accent of their own' },
      { type: 'tweak', text: 'Tidied the Build from scratch card into a clearer action button with a plus marker' },
    ]
  },
  {
    version: '4.40.1',
    date: '2026-05-30',
    title: 'Reporting: edit-in-place saving, reset, and tidier gallery',
    changes: [
      { type: 'feature', text: 'When you open a saved report, tweak it (for example excluding some clinicians) and hit Save changes, it now updates that report in place rather than forcing a new one. A separate Save as new button is there when you do want a fresh copy, and an unsaved-changes hint appears while you have edits pending' },
      { type: 'feature', text: 'New Reset button returns a report to the state it was opened in — handy after experimenting with filters or settings. It appears whenever you have unsaved changes' },
      { type: 'tweak', text: 'Removed the Support doctor presets from the gallery, since support doctor is specific to some practices. Support is still fully available as a custom report: open Build from scratch (or any session report), set Count to Sessions, tick the Support chip, and choose how to show it' },
      { type: 'tweak', text: 'Removed the per-card icons from the gallery, which did not always suit the underlying data' },
    ]
  },
  {
    version: '4.40.0',
    date: '2026-05-30',
    title: 'Reporting redesign: preset gallery, bolder header, bar colour options, polished charts',
    changes: [
      { type: 'feature', text: 'Reporting now opens on a gallery of preset report cards grouped by what you are trying to answer — Workload and fairness, Capacity and fill, Demand patterns, and Appointment mix — each with a short description and an icon. Pick one to open it in the builder, or choose Build from scratch. Your saved reports appear as their own cards at the top and can be deleted from there. A clear All reports link returns you to the gallery' },
      { type: 'feature', text: 'The duty and support balance analysis and the report builder are now a single tool. The old two-mode toggle is gone; the duty and support charts live as presets in the Workload and fairness group, so there is one coherent place to build and view every report' },
      { type: 'feature', text: 'Bar colour is now an option: Multi (a different colour per bar), Single (one consistent colour), or Conditional. Conditional colours each bar green, amber or red — either automatically around the reference line, or against low and high thresholds you type in yourself — with an Invert toggle for measures where less is better (duty and support load come pre-set this way, so a heavy load reads as red)' },
      { type: 'feature', text: 'Each report now has a bold, prominent title (the preset or saved name), with the plain-English description, the date range and any active filters beneath it, and the overall figure shown large alongside. Save, Copy and CSV sit in the header' },
      { type: 'tweak', text: 'The control panel is reorganised into four tighter steps — Measure, Break down, View, Refine — with filters and the sort, limit and reference options tucked into collapsible sections, so it stays fully functional without overwhelming. Charts were polished throughout: taller rounded bars with hover highlight, a gradient-filled smoother trend line with larger points, and cleaner tables' },
    ]
  },
  {
    version: '4.39.3',
    date: '2026-05-30',
    title: 'Workload Audit renamed to Reporting',
    changes: [
      { type: 'tweak', text: 'The Workload Audit tab is now called Reporting in the sidebar, better reflecting what it has become — a general report builder rather than a single fixed audit. Any old links using the previous section name still resolve to the new one' },
    ]
  },
  {
    version: '4.39.2',
    date: '2026-05-30',
    title: 'Text bumped up further on the data pages',
    changes: [
      { type: 'tweak', text: 'Following the first pass, raised the text on the data pages by two more steps so body text now sits around 14px, labels around 12px and headers around 16px — noticeably more comfortable to read. Applied to the Workload Audit and report builder, My Rota, Clinician Capacity, Slot Filter, Who is In, Routine Wait Time and the shared huddle views. The Capacity Planning calendar still awaits its own careful pass' },
    ]
  },
  {
    version: '4.39.1',
    date: '2026-05-30',
    title: 'Larger, more readable text across the data pages',
    changes: [
      { type: 'tweak', text: 'The Today page reads comfortably because it is built on 12 to 14px text, but several other pages leaned on a lot of hardcoded 8 to 11px sizes that felt cramped by comparison. Raised the small-text floor by one step across the Workload Audit and report builder, My Rota, Clinician Capacity, Slot Filter, Who is In, Routine Wait Time and the shared huddle views, so labels and values now sit in the same comfortable 11 to 12px range as Today. Genuinely tiny chart-axis and badge labels were nudged up modestly rather than enlarged' },
      { type: 'tweak', text: 'The Capacity Planning calendar was deliberately left unchanged in this pass — its six-week grid cells are space-constrained and need a more careful touch, which can follow once the new sizing is confirmed elsewhere' },
    ]
  },
  {
    version: '4.39.0',
    date: '2026-05-30',
    title: 'Report builder: flexible denominator and a clearer, guided layout',
    changes: [
      { type: 'feature', text: 'New Show as control replaces the old percentage checkbox and gives four clear ways to express a measure: a raw Count; a percentage of each group total (the natural rate — booked divided by all that group slots is fill rate, duty divided by all sessions is duty load); a percentage of the overall total, so each group shows its share and the shares add up to 100%; or a percentage of a custom subset you define yourself. The common rates no longer need you to re-tick status and category boxes for the denominator' },
      { type: 'feature', text: 'The control panel is reorganised into a guided four-step flow — 1 Measure, 2 Break down, 3 Filter, 4 View — with numbered markers. Filters and the less-used options (sort, top N, exclude system rows, reference line) are tucked into collapsible sections with a badge showing how many filters are active, so the panel is far less dense at a glance' },
      { type: 'feature', text: 'The chart now leads with a plain-English summary of exactly what you are looking at — for example duty sessions as percent of all sessions in each group, by clinician, last 8 plus next 8 weeks, 2 filters applied — with the overall figure and the export buttons alongside it' },
      { type: 'tech', text: 'Engine reworked around a denominator mode (none / group / total / custom) rather than only a custom denominator filter. group and total modes accumulate the in-scope total per group and overall so rates and shares are exact. Fully back-compatible: saved reports and presets that stored an explicit denominator filter are read as custom mode and produce identical numbers, verified against the live export' },
    ]
  },
  {
    version: '4.38.0',
    date: '2026-05-30',
    title: 'Report builder: saved named reports and click-to-drill-down',
    changes: [
      { type: 'feature', text: 'Save any report you build with a name, and it persists for your practice — appearing in a My saved reports row alongside the built-in presets, available next session and to your colleagues. Click a saved report to load it; admins can delete with the small cross. Saving and deleting is admin-only; everyone can load and view' },
      { type: 'feature', text: 'Click any bar, stacked segment, trend point or table row to drill down into the underlying records. A panel opens listing every contributing slot or session grouped by day — for slots: clinician, slot type and status; for sessions: clinician plus duty or support flags. This recovers the date-level detail in a way that works for any measure you have built' },
      { type: 'tech', text: 'New saved_reports table (practice_id, name, config JSONB, with member-read / admin-write row-level security matching day_annotations) stores the full builder configuration. New collectGroupFacts engine helper re-applies the report filters to return the raw facts behind a single group and series for the drill-down view' },
    ]
  },
  {
    version: '4.37.0',
    date: '2026-05-30',
    title: 'Report builder: global filters, multi-series, stacked bars, reference lines, export',
    changes: [
      { type: 'feature', text: 'Global filters scope the whole report independently of the measure. Narrow to specific clinicians (searchable list), roles, sites, slot types, or AM versus PM — so you can ask things like fill rate by week for Banwell only, or duty load for GP partners only' },
      { type: 'feature', text: 'Compare by adds a second dimension that splits each group into series. Put urgent versus routine on one trend line, AM versus PM side by side, or available versus embargoed versus booked. Works on bars, trend and table' },
      { type: 'feature', text: 'New chart type: stacked bars, showing composition per group (for example available, embargoed and booked stacked per clinician or per week). Trend now draws one line per series when comparing' },
      { type: 'feature', text: 'Reference line on every chart: fair share for percentages (the overall rate, so you can see who sits above or below their proportional share of duty), average for counts, or a custom target value you type in' },
      { type: 'feature', text: 'Quick wins: Copy and CSV export buttons; a toggle to exclude system rows (TRIAGE, CCAS and unmatched pseudo-clinicians, on by default); Top 5 / Top 10 / All limiter; and Value versus A to Z sorting' },
      { type: 'feature', text: 'An automatic one-line insight appears above the chart when something stands out — for example a clinician carrying well above the average share, or a single group dominating the total' },
      { type: 'tech', text: 'Engine gained a global-filter pass, an optional second grouping dimension producing a series matrix, system-row flagging on both slot and session facts, and sort plus top-N controls. Verified against the live EMIS export across multi-series, role filtering, sorting and limiting' },
    ]
  },
  {
    version: '4.36.0',
    date: '2026-05-30',
    title: 'Report builder gains session measures and a right-hand control panel',
    changes: [
      { type: 'feature', text: 'The Workload Audit report builder can now count SESSIONS as well as slots. A session is one clinician working an AM or PM. Pick the session type — worked, duty, or support — optionally restrict to AM or PM, and optionally divide by another session type to get a rate. Duty load is duty sessions divided by sessions worked, grouped by clinician — exactly the duty and support balance charts, now fully customisable and groupable by clinician, role, session, day of week or week' },
      { type: 'feature', text: 'Quick reports are now grouped into Duty and support, Slots, and Trends. The Duty and support group recreates the classic charts in one click: duty load by clinician, support load by clinician, sessions worked by clinician, duty sessions by week' },
      { type: 'feature', text: 'All controls moved to a right-hand panel so the chart gets the full main area. The panel stacks below the chart on narrow screens. Layout: presets, count grain toggle, measure, percentage toggle, group by, date range and chart type, top to bottom' },
      { type: 'tech', text: 'Engine extended with buildSessionFacts — one fact per date, session and clinician who worked, flagged for duty and support using the same duty-doctor detection and top-urgent-provider heuristic as the classic analysis. runReport is now grain aware and dispatches the right filter matcher. Group-by options are filtered to those valid for the chosen grain. Smoke-tested against the live EMIS export: ~10.7k session facts, duty load percentages verified per clinician' },
    ]
  },
  {
    version: '4.35.0',
    date: '2026-05-30',
    title: 'Workload Audit becomes a customisable report builder',
    changes: [
      { type: 'feature', text: 'The Workload Audit tab is now a flexible reporting tool. Build your own measure: pick a numerator (count slots that are available / embargoed / booked, in any combination, optionally filtered to urgent / routine / other), then optionally divide by a denominator to express it as a percentage (fill rate, urgent share, etc). Group the result by clinician, site, slot type, category, role, session (AM/PM), day of week, or week — and view it as ranked bars, a trend line over time, or a data table. Date range selectable (last 8 weeks / next 8 / both / all data)' },
      { type: 'feature', text: 'Eight one-click quick reports to start from: slots offered by clinician, fill rate by clinician, urgent slots by week, fill rate by week, booked by day of week, slots by site, urgent share by clinician, routine slots by week. Each loads a full configuration into the builder that you can then tweak' },
      { type: 'feature', text: 'The original duty-doctor and support-doctor balance analysis is preserved — toggle to "Duty & support balance" at the top of the tab. The new "Report builder" is the default view' },
      { type: 'tech', text: 'New engine in lib/workload-report.js flattens the parsed huddle CSV (slotRows) into a fact table — one fact per date/session/clinician/slot-type/status/location bucket — then runs filtered numerator-over-denominator aggregations grouped by any dimension. Pure functions, no charting library (bars/trend/table all hand-rolled SVG + CSS). Smoke-tested against the live EMIS export: ~19k facts from a single CSV, aggregates verified' },
    ]
  },
  {
    version: '4.34.1',
    date: '2026-05-30',
    title: 'Fix routine bullet — offered vs target is the primary metric again',
    changes: [
      { type: 'tweak', text: 'The layered routine bullet introduced in v4.32.0 made BOOKED the headline number and coloured the whole bullet by booked-vs-target. That broke the forward view: future weeks have almost no bookings yet, so every future week showed a tiny number against the target and went red, looking broken. Restored OFFERED vs target as the primary metric (the actual capacity-planning question — are we putting enough routine slots out there?), which is stable across past, current and future weeks. Bookings are still shown — as a darker fill inside the offered bar plus a "X booked · Y% fill" line — but they no longer drive the colour or the headline' },
    ]
  },
  {
    version: '4.34.0',
    date: '2026-05-30',
    title: 'Day annotations — sticky notes on the capacity calendar',
    changes: [
      { type: 'feature', text: 'Practice admins can now attach a note to any day in the Capacity Planning view — locum cover, training afternoons, expected surges, anything that lives in your head or in WhatsApp. Days with a note show a small notepad icon in the cell (hover to read it). The full note lives at the top of the day-detail drawer, where admins get an edit/add/delete control and everyone else sees it read-only' },
      { type: 'feature', text: 'New day_annotations table (one note per practice per date, 1000 char max) with row-level security: any practice member can read, only practice admins can write or delete — matching the permission model used for clinicians and demand history. Notes persist across sessions and are scoped per practice in the multi-tenant model' },
      { type: 'tech', text: 'Loaded once on mount via the browser Supabase client and cached in component state keyed by ISO date; saves use upsert on the (practice_id, date) unique constraint. Fails silently if the table is not present yet so older database snapshots do not break the page' },
    ]
  },
  {
    version: '4.33.0',
    date: '2026-05-30',
    title: 'Automated pattern detection — eight rules looking for capacity insights',
    changes: [
      { type: 'feature', text: 'New "Patterns" insight button on the Capacity Planning page (fifth in the insight strip). Runs eight detection rules over the 6-week view + huddle data to surface recurring patterns that are easy to miss looking at a single day. Each pattern shows a severity badge (HIGH / MEDIUM / INFO), a plain-language explanation, structured evidence, and a recommended action. Click "See day" on any pattern to jump straight to the most affected day in the drawer' },
      { type: 'feature', text: 'Rules implemented: weekday recurring urgent shortage (e.g. "Wednesdays consistently below target"); routine target streaks (3+ consecutive weeks below or above target); mismatched-capacity weeks (routine over target while urgent runs short — rebalance opportunity); single-clinician concentration (over 40% of one weekday urgent capacity from a single person — bus-factor risk); AM/PM imbalance per weekday (one half consistently runs hot, the other cold); worst upcoming day (high predicted demand + low cover); bank-holiday rebound risk (predicted spike days adjacent to BHs); embargoed slot overload (over 30% of routine slots embargoed in a week)' },
      { type: 'tech', text: 'Pattern detection lives in lib/capacity-patterns.js — pure functions, no React, takes the same `weeks` array used by the calendar. Thresholds chosen conservatively to avoid noise; the detector returns nothing rather than crying wolf when no pattern is strong enough. Easy to add new rules by writing another function and adding it to the detectPatterns aggregator' },
    ]
  },
  {
    version: '4.32.0',
    date: '2026-05-30',
    title: 'Layered routine bullet — booked + offered visible at once',
    changes: [
      { type: 'feature', text: 'Weekly routine bullet chart now shows two bars layered: a faint outer bar for slots OFFERED (capacity) and a solid inner bar for slots BOOKED (fill). At a glance the eye answers both "is there enough capacity?" (outer bar reaches the comfort band around the target tick) and "how full is it?" (inner bar reaches the outer bar). The bigger headline number now represents bookings — that is the metric that actually evolves through the week as patients book in' },
      { type: 'tweak', text: 'Bullet now displays "booked / target" as the headline (e.g. 163 / 200) with the slots offered shown as a smaller secondary number ("of 218") and a "% fill" indicator on the right. Hover the whole bullet for the full tooltip — booked count, offered count, fill percentage, target' },
      { type: 'tweak', text: 'Colour band of both bars driven by booked vs target (same vBand red/amber/green/blue used everywhere else on the page), so a tight week reads visually consistent with a tight day' },
    ]
  },
  {
    version: '4.31.0',
    date: '2026-05-30',
    title: 'Capacity Planning polish — drawer + cell behaviour',
    changes: [
      { type: 'feature', text: 'Press ESC to close the day-detail drawer; or click anywhere outside the calendar and drawer (an insight, the page background) to dismiss it. The drawer keyboard-listener is only attached while the drawer is open so it does not pollute the global keydown stream' },
      { type: 'feature', text: 'Drawer and an expanded insight can now be open at the same time. Clicking a day inside a flagged-days list opens the drawer but keeps the insight expanded — no more losing your place when drilling from a list into a single days detail' },
      { type: 'feature', text: 'AM and PM cells now show a quick tooltip on hover with the duty doctor name and supplied/target counts. Demand pill on hover shows the top three predicted-demand drivers (day of week, school holiday, weather, etc) — same data that lives inside the drawer but available at a glance without opening it' },
      { type: 'tweak', text: 'Today indicator upgraded: instead of a green left border alone, the date number is replaced with a TODAY pill in white-on-emerald so the current day is unmistakable at a glance' },
      { type: 'tech', text: 'pickDay / pickMarker no longer clear each other; added closeDay / closeMarker / toggleDay / toggleMarker helpers. Added drawerRef and calendarRef for the click-outside handler' },
    ]
  },
  {
    version: '4.30.2',
    date: '2026-05-30',
    title: 'Capacity Planning width cap at 1500px — wider than the original but with room for the drawer',
    changes: [
      { type: 'tweak', text: 'Capacity Planning was edge-to-edge full viewport in v4.30.1, which felt too wide on big monitors and meant the day-detail drawer always overlapped calendar content. Capped at max-w-[1500px] (about 30% wider than the original max-w-6xl). On 2K+ monitors the drawer now sits to the right of the calendar with no overlap; on common 1920px screens it overlaps roughly the rightmost 200px of the calendar when open, which can be dismissed with the close button' },
    ]
  },
  {
    version: '4.30.1',
    date: '2026-05-30',
    title: 'Capacity Planning layout fix — full-width calendar, insights at bottom, drawer overlay',
    changes: [
      { type: 'tweak', text: 'Capacity Planning calendar now uses the full desktop width. The dashboards default max-w-6xl cap is dropped specifically for this section so the calendar can stretch edge-to-edge — important on wide monitors where the 1280px cap was leaving huge empty margins on either side' },
      { type: 'tweak', text: 'Insights moved back to the bottom of the page (below the calendar), arranged as four tab-style buttons in a row. Click one to expand its list below the buttons; click the active one again to collapse. Same four-up grid layout as the mobile tab strip, just at desktop scale' },
      { type: 'tweak', text: 'Day detail is now a fixed-position drawer that slides in from the right when a day is clicked. It overlays the rightmost portion of the screen rather than pushing the calendar narrower — calendar behind it stays at full width and reappears when the drawer is closed. Drawer scrolls internally if its content is taller than the viewport' },
    ]
  },
  {
    version: '4.30.0',
    date: '2026-05-30',
    title: 'Capacity Planning redesign — pop-out day detail + collapsible insight buttons',
    changes: [
      { type: 'feature', text: 'Capacity Planning calendar is now a two-column desktop layout: the 6-week grid sits on the left and a side panel pops out on the right. Clicking any day shows its full breakdown (AM urgent / PM urgent / Routine, with duty doctor pills, predicted-demand drivers, and per-clinician slot counts) in the side panel — no more scrolling down past the calendar to see who is working. The whole page widens out to use the full screen on desktop, matching the visual language of the Today and Buddy pages' },
      { type: 'feature', text: 'The four "insights" that used to sit as static cards below the calendar — Urgent capacity below target, Highest demand days, Routine by week, Week-on-week — are now buttons in the side panel. Click one to expand it in place, click again or the back-arrow to collapse and return to the button list. One insight at a time means the eye is never split across four lists. Days in any list are clickable too, so going from a flagged day to the rota for that day is a single tap' },
      { type: 'feature', text: 'Day cells in the calendar redesigned cleaner: large AM and PM urgent numbers as side-by-side coloured boxes (colour bands by vs-target — over / on / tight / short), with the predicted-demand pill top-right. The old routine-progress bar at the bottom of each cell is removed — routine is now a weekly-level metric only, with its own column on the right of each row' },
      { type: 'feature', text: 'New per-week routine bullet chart (rightmost column of each row): solid bar of slots offered, faint green dashed-edge comfort band (target ±10%), purple tick at exact target, "+/− N vs target" delta below. Same vBand colour language as the day cells so a "tight" week reads the same as a "tight" day. If no weekly target is set, falls back to just showing the slot count' },
      { type: 'tweak', text: 'Sticky side panel — scrolls with the page but stays pinned at the top while you compare across weeks, with internal scrolling inside the panel when its content is taller than the viewport' },
      { type: 'tweak', text: 'Mobile layout left untouched — the existing horizontally-scrollable strip + tab-based insights already worked well on small screens. Both layouts now sit inside the same dark-gradient page wrapper' },
    ]
  },
  {
    version: '4.29.1',
    date: '2026-05-28',
    title: 'Persistent recent-accuracy card on the Demand tab',
    changes: [
      { type: 'feature', text: 'Adds a "Recent accuracy" card to practice settings → Demand, showing how the current model has been tracking against your actual demand over the last 60 days on file (filtered to weekdays in the chart). Same MAE + bias + day-of-week breakdown + outlier list as the post-upload comparison, but persistent — you can come back and check it any time without re-uploading. Fetches the data client-side from demand_history so it doesn\'t bloat the page load. Hides itself silently if there\'s no prior calibration yet (the predictor would fall back to the global Winscombe baseline and the numbers would be misleading)' },
      { type: 'tech', text: 'Refactored DemandComparisonPanel to be generic — takes a `settings` prop (replacing the old preUploadSettings) plus an optional title and firstTimeMode (\'message\' vs \'hide\'). The old preUploadSettings prop still works as a back-compat alias so the upload-time caller didn\'t need to change' },
    ]
  },
  {
    version: '4.29.0',
    date: '2026-05-28',
    title: 'Demand model comparison · quick "off today" · manual buddy override with reason',
    changes: [
      { type: 'feature', text: 'Demand upload now shows a predict-vs-actual comparison panel after a successful CSV upload. Runs the PRE-upload demand model over each date in the new batch and compares to the actuals just imported, so the comparison answers the honest question "how well did your existing model predict this new data?" rather than the incestuous post-recalibration version. Shows headline accuracy stats (MAE + MAPE), an SVG line chart of predicted vs actual, day-of-week bias breakdown, and the top 5 outliers with their factor breakdown (baseline, day-of-week effect, school holiday, weather, trend etc) so you can see which factor drove the miss. On first-ever upload the panel skips itself and explains why ("calibrating from scratch — next upload will show accuracy")' },
      { type: 'feature', text: 'Who\'s In widget: hover any present clinician for a new "Off today" quick action that opens a small modal. Pick a reason from the controlled list (Unwell / Annual leave / Training / Study leave / Parental / Compassionate / Other) and optionally add a note, and it inserts a single-day absence into the database. After save the page reloads so buddy cover regenerates with the new absence factored in. Removes the friction of "Sarah just called in sick" → open practice settings → find clinicians page → working days grid → add absence' },
      { type: 'feature', text: 'Buddy cover allocations can now be manually reassigned with a required reason. Click any badge (red absent or amber day-off) in the daily cover table and a modal opens showing who\'s currently covering, with a dropdown of other eligible coverers (present today, can-provide-cover, in buddy system) and a required reason field. On save the allocation entry is updated in buddy_allocations and an audit_events row is written for the permanent trail. Overridden badges show a dashed border + small purple dot so you can see at a glance which assignments are manual, with the reason on hover. Helps the algorithm not be silently undermined and builds a record we can mine later for systematic adjustments' },
      { type: 'tweak', text: 'Practice-settings page now passes practice.list_size through to the demand tab so the predictor\'s fallback scaling can use it when no calibration is set yet' },
    ]
  },
  {
    version: '4.28.9',
    date: '2026-05-28',
    title: 'Practice settings: uniform tab widths + surface the actual public-buddy error',
    changes: [
      { type: 'tweak', text: 'All practice-settings tabs now use the same 1200px max width as the clinicians tab. Previously every other tab was wrapped in a narrow 800px column, which looked inconsistent next to the wide clinicians data table. The narrow() helper is now an identity wrapper so callers don\'t need to change' },
      { type: 'fix', text: 'Public buddy page error display: instead of a bare "Unable to load — try refreshing the page" message, the actual error from the server (or network failure reason) is now shown underneath in small print. Lets the user see whether it\'s a 503 (service not configured — typically SUPABASE_SERVICE_ROLE_KEY missing in this environment), 429 (rate limited), 500 (something failed server-side), or a network error' },
      { type: 'fix', text: 'Public buddy API route: explicitly return 503 with a friendly error if createAdminClient returns null (SUPABASE_SERVICE_ROLE_KEY env var not set). Previously this would throw a TypeError inside the try block and return a bare 500' },
    ]
  },
  {
    version: '4.28.8',
    date: '2026-05-28',
    title: 'Fix Who\'s In widget: read fresh show_whos_in from DB on mount',
    changes: [
      { type: 'fix', text: 'v4.28.7 confirmed saves persist to the DB, but the dashboard\'s Who\'s In widget still showed clinicians the user had just toggled off — because the dashboard\'s data.clinicians is loaded once from server SSR and doesn\'t refresh when the user comes back from the practice page. WhosInOut now fetches a fresh {id → show_whos_in} map straight from the clinicians table on mount and uses it to override the (possibly stale) showWhosIn values from the dashboard\'s in-memory state. Optimistic updates on the hide/show buttons keep the map in sync immediately' },
      { type: 'fix', text: 'Added .select() to QuickSetupTable\'s direct clinicians UPDATE writes so silent RLS rejections (which return no error but affect 0 rows) surface as save errors rather than fake "Saved" feedback. The Save indicator will now show "write affected 0 rows (RLS or wrong id?)" if the user doesn\'t actually have permission to update the row' },
    ]
  },
  {
    version: '4.28.7',
    date: '2026-05-28',
    title: 'Fix Who\'s In toggle data loss: disable bulk-endpoint clinician UPDATEs entirely',
    changes: [
      { type: 'fix', text: 'v4.28.6 made QuickSetupTable write clinicians directly to the DB, but the toggles still got overwritten — because the dashboard\'s HuddleToday widget has a useEffect that fires saveData({ ...data, predictionHistory: ... }) when the user lands on it, and that saveData spreads the dashboard\'s in-memory clinicians array (which may not reflect just-edited rows from the practice page) into the POST body. The /api/v4/data endpoint\'s mutation 6 then diffs the stale incoming clinicians against the fresh DB and "fixes" the DB to match the stale incoming data, undoing the user\'s edits' },
      { type: 'fix', text: 'Mutation 6 in /api/v4/data POST now ONLY handles INSERTs (e.g. new clinicians from CSV upload). UPDATEs and DELETEs are disabled. Any clinician field edit must go through a direct supabase client write — same pattern QuickSetupTable and BuddyCoverSettings already use. This structurally eliminates the surface area where stale state on any other page could write through to the clinicians table' },
      { type: 'fix', text: 'Migrated the dashboard\'s Who\'s In widget hide/show buttons to direct supabase writes for the show_whos_in column. They previously relied on the bulk endpoint to persist the change. Other clinician-touching saveData paths (removeClinician, updateClinicianField) will fail silently until similarly migrated — flagged as a follow-up to investigate which ones the user actually exercises' },
    ]
  },
  {
    version: '4.28.6',
    date: '2026-05-28',
    title: 'Fix: Who\'s In toggle data loss — bypass bulk save, write directly to Supabase',
    changes: [
      { type: 'fix', text: 'Replaces the QuickSetupTable bulk-POST save (which sent the full 40-clinician array to /api/v4/data and let the server diff against current DB) with field-level direct writes to the clinicians table via the authenticated supabase client. Only the columns that actually changed for the specific rows that changed are touched. Same pattern BuddyCoverSettings already uses for its toggle — proven reliable. This isolates the table\'s edits from any other component (dashboard auto-save, TeamNet sync, side panel) that might fire saves with stale clinicians data via the bulk endpoint and overwrite the user\'s toggles' },
      { type: 'fix', text: 'Removes all the diagnostic logging that v4.28.1 through v4.28.5 added (toggle clicks, updateField calls, state changes, mount/unmount tracking, server-side render counts, POST body logging). With the underlying issue fixed by the architectural change, the diagnostics aren\'t needed and just add console noise' },
      { type: 'fix', text: 'Removes the sessionStorage-based remount-recovery workaround from v4.28.4. It was a defensive patch for the symptom; with the bulk-save bypassed, the workaround is no longer necessary' },
    ]
  },
  {
    version: '4.28.5',
    date: '2026-05-28',
    title: 'Diagnostic: log every POST to /api/v4/data with body keys + referer',
    changes: [
      { type: 'tech', text: 'v4.28.4 partially fixed the symptom (using sessionStorage to survive remounts) but the underlying data loss is still happening: every time the user navigates away from the clinicians page and back, the Who\'s In toggles they just saved get overwritten. Between session 1 (saved 4 false) and session 2 (mount shows 0 false), something wrote 4 trues to the DB. Adds [/api/v4/data POST] body received log on every POST showing user ID, referer (which page triggered it), body keys, and a summary of the clinicians array (count + how many are showWhosIn=false). Will reveal which page is firing the overwriting save' },
    ]
  },
  {
    version: '4.28.4',
    date: '2026-05-28',
    title: 'Fix: Who\'s In toggle data loss caused by component remount with stale data',
    changes: [
      { type: 'fix', text: 'Diagnostic in v4.28.3 revealed the root cause: QuickSetupTable mounts → unmounts → remounts on initial page load, and mount 2 receives DIFFERENT initialClinicians than mount 1. Mount 1 had 7 clinicians with showWhosIn=false (matching the DB); mount 2 had 0 (all true). The user\'s click would update state, but the state baseline was already wrong — so when the save fired, it sent 39 true + the 1 just-toggled = false, overwriting all 7 previously-saved off-toggles in the DB. The mechanism for the double-mount is still being investigated (likely Next.js Router Cache or RSC streaming), but the symptom is fixable independently' },
      { type: 'fix', text: 'Workaround: persist QuickSetupTable\'s clinicians state to sessionStorage on every change. On mount, if sessionStorage has data less than 2 seconds old for this practice, use it instead of initialClinicians. This catches the remount-with-stale-data race: mount 1 persists fresh data, mount 2 reads it from storage instead of being clobbered by stale props. After successful save, sessionStorage is cleared so a genuine page revisit gets fresh DB data as normal' },
      { type: 'tech', text: 'Added [CliniciansTab server render] log to help diagnose whether the double-mount is caused by the server rendering twice with different data (the actual root cause). Once we have that data, the underlying cause can be properly fixed and these diagnostic logs removed' },
    ]
  },
  {
    version: '4.28.3',
    date: '2026-05-28',
    title: 'Diagnostic build (continued) — mount/unmount + state-change logging',
    changes: [
      { type: 'tech', text: 'v4.28.2 revealed the smoking gun: clicking Social Prescriber off, then Direct Booking off, then re-clicking Social Prescriber shows currentShowWhosIn=TRUE on the second click — meaning state was reverted between the first and third click. The "after" log shows the setClinicians callback DID flip Social Prescriber to false, but by the next click it was true again. Adds two more diagnostic effects: [QuickSetupTable mount/unmount] logs (proves whether the component is being re-mounted with fresh initialClinicians — which would explain everything), and [clinicians state change] log (shows the count of showWhosIn=false clinicians on every state update — should monotonically grow as you click toggles off; if it drops back to zero, state is being reset)' },
    ]
  },
  {
    version: '4.28.2',
    date: '2026-05-28',
    title: 'Diagnostic build (continued) — click-level logging for Who\'s In toggle',
    changes: [
      { type: 'tech', text: 'v4.28.1 confirmed the save fires correctly and reaches the API, but the snapshot showed all clinicians with showWhosIn=true — meaning the React state itself isn\'t holding the toggled-off value by the time the debounced save runs (800ms after click). This build adds click-level logging at three more points: inside the Who\'s In toggle\'s onClick (proves the click reaches the handler), inside updateField (proves the field update is called with the right value), and inside the setClinicians callback (proves state actually changes). Look for [WhosIn toggle click], [updateField showWhosIn], and [updateField showWhosIn → setClinicians] in the browser console. If all three fire but the doSave snapshot still shows true, something is reverting the state in the 800ms before save' },
    ]
  },
  {
    version: '4.28.1',
    date: '2026-05-28',
    title: 'Diagnostic build for the Who\'s In toggle bug',
    changes: [
      { type: 'tech', text: 'Adds console.log instrumentation at three points in the Who\'s In toggle save path: client-side at doSave (logs what showWhosIn values are being POSTed and what the server responded), and server-side at mutation 6 (logs what showWhosIn values the API received vs what was in the DB, and whether the diff detected a change). Lets us see in the browser console and Vercel function logs exactly where the round-trip is breaking. Will be removed in the next PATCH once root cause is identified and fixed' },
      { type: 'fix', text: 'Reverted router.refresh() in QuickSetupTable.doSave that was added in v4.27.1. It was supposed to fix a Next.js route-cache issue showing stale dashboard data, but the user reports the toggle isn\'t saving at all (different bug). Suspicious that the refresh could be interfering somehow — removing to isolate. If the original stale-dashboard issue resurfaces, a more targeted fix is needed' },
    ]
  },
  {
    version: '4.28.0',
    date: '2026-05-28',
    title: 'Public buddy cover page (opt-in, per-practice) — EMIS clipboard URL now multi-tenant',
    changes: [
      { type: 'feat', text: 'Each practice can now opt in to a public no-auth buddy cover page at /buddy/<slug>. When enabled, anyone with the URL can view today\'s buddy allocations without signing in — the use case is EMIS clipboard templates where reception/admin staff need one-click access. When disabled (the default), the URL returns 404 and "Copy day" / "Copy week" buttons omit the URL line so nobody clicks a dead link from EMIS' },
      { type: 'feat', text: 'New "Public buddy cover page" Card at the top of Practice settings → Buddy cover. Toggle to opt in/out, with the live URL shown when enabled (environment-aware — preview.gpdash.net during preview, gpdash.net after cutover), plus an amber callout listing exactly what becomes visible (clinicians\' names, initials, roles, presence status, cover allocations — never patient data)' },
      { type: 'feat', text: 'New step in the 8-step setup wizard ("Buddy cover EMIS link"), positioned last. Optional, default off, with clear explanation of why a practice might want to turn it on. The toggle here writes to the same practices.buddy_cover_public column so the wizard and the settings page stay in sync' },
      { type: 'feat', text: 'Copy day / Copy week buttons in the Buddy Cover dashboard now generate environment-aware practice-specific URLs (https://{host}/buddy/{slug}) instead of the hardcoded v3-era "www.gpdash.net/buddy". URL is included in the clipboard report only when public access is enabled — practices that don\'t opt in get a clean clipboard report with no broken link' },
      { type: 'tech', text: 'Migration 20260525120044 adds practices.buddy_cover_public boolean column, default FALSE — including for Winscombe and any existing practices. Winscombe will need to flip the flag in Buddy Cover settings (or the new wizard step) once on v4 production to keep its current public URL working from EMIS templates' },
      { type: 'tech', text: 'Public API endpoint /api/v4/public/buddy/[slug] — admin-client read gated by the public flag, rate-limited 120/min/IP. Returns minimal v3-shape data (clinicians, working patterns, planned absences, daily overrides, allocation history) — no huddle CSV, demand history, audit data, or anything else the buddy view doesn\'t strictly need. Returns 404 regardless of which fails (missing practice or flag off) so slugs can\'t be enumerated' },
      { type: 'tech', text: 'New public route /buddy/[slug]/page.js + PublicBuddyView.js. Server component does the existence + flag check with the admin client before rendering anything; client component then polls the public API every 2 minutes for live updates (matches the v3 page\'s refresh cadence Winscombe staff are used to). Old single-tenant /buddy URL now returns 404 — to be replaced with a redirect to the appropriate practice slug at v3→v4 cutover time' },
      { type: 'tech', text: 'DPA Schedule 4 (Permitted Controller Instructions) gains a 9th item explicitly covering the public buddy page — the controller\'s opt-in is the documented instruction; the displayed data is scoped to staff names/initials/roles/presence/allocations with no patient data. Privacy notice gains a matching section so staff signing up know what becomes visible if their practice owner enables the option' },
    ]
  },
  {
    version: '4.27.2',
    date: '2026-05-25',
    title: 'Dark glass theme across /legal and /privacy — visual consistency with the rest of GPDash',
    changes: [
      { type: 'tweak', text: 'Restyled all four public legal pages — /privacy, /privacy/processors, /legal, /legal/dpa, /legal/dspt — from the previous light slate theme to the dark glass theme used everywhere else in GPDash. Same gradient background, rgba-on-white cards, cyan-300 accents, Outfit headings. Navigating from the admin section to any of these pages now feels continuous rather than shocking the eye with a bright white surface' },
      { type: 'tweak', text: 'Markdown rendered docs (DPA template, DSPT pack) get a fully redesigned scoped CSS palette: slate-200 body text, slate-100 headings, cyan-300 links, monospace code on a dark tinted background, tables with subtle row striping. The "DRAFT — requires legal review" blockquote at the top of the DPA renders as an amber callout block (rgba(251,191,36) at low opacity) that stays prominent on the dark background' },
      { type: 'tweak', text: 'DRAFT badge on the DPA tile (legal landing) restyled to match — amber-on-dark with a thin amber border. Same flag (LEGAL_META.privacyReviewedByLegal) gates both this badge and the privacy notice draft banner. Flipping it after lawyer review hides both in one go' },
    ]
  },
  {
    version: '4.27.1',
    date: '2026-05-25',
    title: 'Fix: Who\'s In toggle changes didn\'t reflect on the dashboard until a hard refresh',
    changes: [
      { type: 'fix', text: 'Toggling Who\'s In off for a clinician in Quick Setup saved correctly to the database, but navigating to the dashboard still showed the clinician in the Who\'s In widget. Root cause was Next.js App Router\'s route cache: the dashboard\'s server render had been cached from when the toggle was on, so soft navigation back to it served the pre-save HTML. Added router.refresh() to the Quick Setup save success path — invalidates the route cache so the next dashboard visit re-fetches from the DB. Affects every field on the Quick Setup table (not just Who\'s In), but Who\'s In is the one where the discrepancy was most visible' },
    ]
  },
  {
    version: '4.27.0',
    date: '2026-05-25',
    title: 'Public legal pages (DPA + DSPT) for due-diligence sharing — unlisted',
    changes: [
      { type: 'feat', text: 'New public /legal landing page renders the practice-facing subset of legal docs as readable web pages — DPA template at /legal/dpa, DSPT evidence pack at /legal/dspt, plus links to the already-public privacy notice and sub-processors page. For sharing with a practice\'s IG officer during due diligence — paste the URL into an email, they read it without needing an account' },
      { type: 'feat', text: 'Pages are deliberately UNLISTED — no link from the public navigation, login, signup, or footer. Discoverable only via a new "Public legal pages" card on the platform admin landing page (/v4/admin). Plus noindex/nofollow metadata so they don\'t end up in search results. Internal docs (breach procedure, SAR procedure, security policy, RoPA, DPIA template) stay repo-only and are not exposed' },
      { type: 'tech', text: 'Markdown rendered server-side at module load (not per-request) via the new marked dependency. fs.readFileSync with a literal path on /docs/legal/<file>.md — Next.js NFT picks the files up automatically and includes them in the Vercel build trace. No per-request file I/O; pages are effectively static after first render' },
      { type: 'tech', text: 'Shared DocShell component at /app/legal/_lib/DocShell.js handles the layout + scoped CSS for rendered markdown (headings, tables, blockquotes-as-callouts, code, lists). Styled to match the existing /privacy page so the whole legal surface feels consistent. The DPA\'s "DRAFT — requires legal review" header renders as a prominent amber warning block via the blockquote styling' },
      { type: 'note', text: 'Legal landing card surfaces the DRAFT badge on the DPA tile while LEGAL_META.privacyReviewedByLegal is false — same flag that gates the privacy notice draft banner. Flipping the flag after lawyer review removes both warning surfaces in one go' },
    ]
  },
  {
    version: '4.26.3',
    date: '2026-05-25',
    title: 'GDPR Phase 4: contractual + operational drafts (DPA, DPIA, SAR, breach, security policy, DSPT)',
    changes: [
      { type: 'note', text: 'Docs-only push — no app behaviour change. Seven new compliance artefacts in /docs/legal/ that close the contractual + operational scope of GDPR work. Phase 1-3 built the technical machinery (export, deletion, retention, audit); Phase 4 documents the policies and contracts that practices\' IG officers will ask for during due diligence' },
      { type: 'feat', text: 'DPA template (/docs/legal/dpa-template.md) — full Article 28-compliant data processing agreement, 521 lines, ready for a lawyer to review and refine. Practice signs this with us; we are processor for their patient-derived operational data. Includes all four schedules: description of processing, technical and organisational measures, sub-processor list, permitted controller instructions. Carries explicit "draft pending legal review" header — do not send unsigned to practices in current form' },
      { type: 'feat', text: 'DSPT evidence pack (/docs/legal/dspt-evidence.md) — maps GPDash technical and organisational controls against all 10 NHS DSPT standards, with evidence pointers for each. Lets practices conducting due diligence get a concrete answer to "how does GPDash handle X?" instead of "we\'ll get back to you". Annex C answers the IG questions practices most commonly ask. Annex B is the transparent gap list (Cyber Essentials not yet held, sole-operator continuity, etc.) — better surfaced than discovered' },
      { type: 'feat', text: 'Breach notification procedure (/docs/legal/breach-notification.md) — the playbook for responding to a suspected or confirmed Personal Data Breach. Roles, statutory clock (72h to ICO, 48h to controllers), the four-step Contain → Assess → Notify → Remediate flow, controller notification template, ICO decision tree. Required by DSPT and our own DPA template' },
      { type: 'feat', text: 'SAR handling procedure (/docs/legal/sar-handling.md) — internal procedure for the data subject rights requests that can\'t be handled by the self-service built in Phase 1 (account locked, third-party representative, deceased user\'s estate, requests for rights other than access/erasure/portability). Statutory timeline, identity verification, third-party data redaction, response format' },
      { type: 'feat', text: 'Information security policy (/docs/legal/security-policy.md) — headline policy document cross-referencing every technical and operational control already implemented. Eight principles (defence in depth, least privilege, data minimisation, etc.) + concrete technical and operational controls. Required by DSPT and expected by NHS-adjacent buyers' },
      { type: 'feat', text: 'DPIA template (/docs/legal/dpia-template.md) — blank ICO-format worksheet to fill in if/when scope changes trigger a DPIA (new category of personal data, patient-level data, automated decisions with significant effect, etc.). Seven-step ICO structure; not needed for current scope but ready when needed' },
      { type: 'feat', text: 'Index page (/docs/legal/README.md) — overview of all legal docs, the controller-vs-processor split, and a pre-launch checklist that combines the placeholders flagged across all the Phase 1-3 work (legal entity name, controller address, privacy@gpdash.net mailbox, CRON_SECRET env var, lawyer review of privacy notice + DPA, first signed DPA filing structure)' },
      { type: 'note', text: 'Status: GDPR phases 1-4 technically complete. Everything between here and "ready to onboard a second practice" is non-code work — finalise legal entity, get a lawyer review on the privacy notice + DPA template, register for and submit a DSPT, optionally get Cyber Essentials. The compliance machinery in code + docs is in place to support all of that. Each document carries a clear "draft pending legal review" banner where applicable' },
    ]
  },
  {
    version: '4.26.2',
    date: '2026-05-25',
    title: 'GDPR Phase 3: retention policy + scheduled cleanup',
    changes: [
      { type: 'feat', text: 'New /api/cron/retention-cleanup endpoint runs daily at 03:00 UTC via Vercel Cron. Walks every table covered by the retention policy and deletes rows past their retention window. Per-table hard cap of 5000 deletions per run as a safety net against runaway. Two-phase delete (SELECT IDs → DELETE BY IN) so the cap is respected atomically and the per-table count returned is accurate' },
      { type: 'feat', text: 'New /v4/admin/retention page surfaces the policy as a table plus the last cron run summary. Two manual controls: "Dry run — count only" (safe; shows what would be deleted) and "Run cleanup now…" (typed RUN confirmation required). Both go through the same endpoint as the cron; the route accepts either the Vercel CRON_SECRET header or a platform-admin session' },
      { type: 'feat', text: 'New /lib/retention-policy.js is the single source of truth for retention windows. Currently: auth_events 1 year, audit_events / platform_audit_events / impersonation_sessions 7 years (NHS records-management standard), practice_invites 90 days (only revoked or expired entries). When the policy is updated here, the privacy notice + RoPA need a matching edit — comments at the top of the file list the touchpoints' },
      { type: 'tech', text: 'Every retention run — including dry runs — is logged to platform_audit_events with the full per-table result set as details (rows examined, rows deleted, cutoff date, any errors). GDPR Art 5(2) accountability: the audit trail itself documents the data-minimisation activity, so any later review can verify the policy is actually enforced' },
      { type: 'tech', text: 'vercel.json gains a "crons" entry — daily at 03:00 UTC against /api/cron/retention-cleanup. Authentication via Bearer ${CRON_SECRET} (Vercel auto-injects this header on cron-triggered requests when the env var is set). Falls back to platform-admin session auth for manual triggers from the admin UI' },
      { type: 'note', text: 'Setup before launch: set CRON_SECRET env var in Vercel project settings (random 32+ char string) so the cron path authenticates. Without it set, the cron-injected header is rejected but manual platform-admin triggers still work — production cron just won\'t run' },
      { type: 'note', text: 'Phase 4 (parallel, lawyer-led, not code): DPA template practices sign when they sign up (controller = practice for patient data, processor = us), DPIA if scope changes, signed sub-processor agreements with Supabase / Vercel / Upstash, DSPT preparation. This closes the technical scope of GDPR compliance work — remaining is legal review of the privacy notice draft and the contractual agreements with sub-processors and practices' },
    ]
  },
  {
    version: '4.26.1',
    date: '2026-05-19',
    title: 'GDPR Phase 2: public privacy notice + sub-processors page + RoPA',
    changes: [
      { type: 'feat', text: 'New public privacy notice at /privacy. Covers controller-vs-processor scope, all 10 processing activities documented in the internal RoPA, lawful basis per activity, where data is stored, retention periods, the full set of UK GDPR rights with built-in-vs-contact-us markers, security overview pointing at security.txt, children, supervisory authority (ICO), and contact via privacy@gpdash.net. Carries a visible "Draft — pending legal review" banner that disappears once lib/legal-meta.js privacyReviewedByLegal flag is flipped to true' },
      { type: 'feat', text: 'New sub-processors page at /privacy/processors listing all five third-party services in the production data flow (Supabase, Vercel, Upstash, Bunny Fonts, Open-Meteo) with role, data handled, hosting region, agreement reference, and notes per entry. Explicitly clarifies that GitHub + Claude are dev tools, not production sub-processors' },
      { type: 'feat', text: 'Privacy notice link added to both /v4/login and /v4/signup. Signup wording is the consent surface: "By creating an account you agree to GPDash\'s Privacy Notice"' },
      { type: 'tech', text: 'New /docs/legal/ropa.md — internal Article 30 Record of Processing Activities. Documents each of the 10 processing activities GPDash performs as controller (account management, auth events, practice membership, in-practice audit, platform audit, impersonation, MFA, rate limiting, CSP reports, subject-access handling) with purpose, data subjects, categories of personal data, recipients, lawful basis, retention, source, transfers, security, and erasure handling. Sub-processor table mirrors the public page. Marked for annual review' },
      { type: 'tech', text: 'New lib/legal-meta.js centralises legal-page metadata (controller name, contact email, last-updated dates, review status). Placeholder fields clearly noted — controllerName and controllerAddress need finalising once the legal entity is decided; privacyReviewedByLegal flag flipped after the lawyer signs off' },
      { type: 'note', text: 'Phase 3 (v4.26.2) is retention policies + scheduled cleanup + audit log retention enforcement. Phase 4 (lawyer-led, parallel) is the DPA template practices sign when they sign up, DPIA, signed sub-processor agreements, and DSPT preparation' },
    ]
  },
  {
    version: '4.26.0',
    date: '2026-05-19',
    title: 'GDPR Phase 1: data export + right to erasure + FK cascade fix',
    changes: [
      { type: 'feat', text: 'Account Settings now has a "Data & privacy" section with two operations. Export my data downloads a JSON archive of everything GPDash holds about you (profile, practice memberships, MFA factor metadata, auth events, in-practice audit events as actor, platform audit events as actor or target, impersonation sessions as admin or target). Practice-scoped data is intentionally excluded — the practice is the controller for that. MFA TOTP secrets are intentionally excluded for security. GDPR Article 15 compliant' },
      { type: 'feat', text: 'Delete my account permanently removes profile, MFA factors, and practice memberships. Audit log entries you appeared in are anonymised (user_id set to null) rather than deleted — preserving the practice\'s audit integrity for IG / DSPT compliance while removing your personal identifier. GDPR Article 17 compliant' },
      { type: 'feat', text: 'Deletion is gated by a pre-flight check that refuses if you are the sole owner of a practice (must promote another owner first) or the sole platform admin. Modal surfaces blockers with specific, actionable next steps. Typed-email confirmation prevents accidental clicks' },
      { type: 'feat', text: 'New /v4/goodbye landing page after successful deletion — confirms the action, explains what happened to audit data, and offers a route back to creating a new account if needed' },
      { type: 'tech', text: 'Migration 043: changed FK ON DELETE behaviour on every reference to auth.users(id). Previously a mix of CASCADE (impersonation_sessions, which destroyed audit trail) and the default NO ACTION (audit_events / auth_events / platform_audit_events / 8+ tracking columns, which blocked deletion entirely). Now uniformly SET NULL for audit + tracking columns, CASCADE only for the account-defining tables (profiles, practice_users). The migration iterates information_schema to catch every created_by / updated_by / invited_by / generated_by / uploaded_by / revoked_by column without listing them individually' },
      { type: 'tech', text: 'Three new API routes: GET /api/v4/account/export (5/min rate-limited per user, logs each export to platform_audit_events for our own subject-access records), GET /api/v4/account/delete-check (pre-flight blockers), POST /api/v4/account/delete (the destructive action — re-runs blocker checks server-side, nulls denormalised emails in auth_events.email and platform_audit_events.target_email, ends active impersonation sessions, logs the deletion with the deleted user\'s email preserved for traceability, then calls supabase.auth.admin.deleteUser to fire the cascade)' },
      { type: 'note', text: 'Next phase (4.26.1, requires lawyer review): public privacy notice at /privacy, sub-processors list at /privacy/processors, footer links. Phase 3 (4.26.2): retention policies + scheduled cleanup. Phase 4 (parallel): DPA template for practices, DPIA, signed sub-processor agreements, DSPT preparation' },
    ]
  },
  {
    version: '4.25.3',
    date: '2026-05-19',
    title: 'Diag: inline duty doctor diagnostic when detection fails',
    changes: [
      { type: 'feat', text: 'When duty doctor is configured but no real GP is detected, the Urgent Today panels now show an inline red diagnostic block instead of just hiding the duty badge. Tells the user exactly what the function saw: the slot type names being searched, every candidate clinician with their slot count, and whether each candidate matched a staff register entry. Removes the silent failure mode' },
      { type: 'feat', text: 'New lib/huddle.js export getDutyDoctorDiagnostic() — same selection logic as getDutyDoctor but returns full intermediate state (slots searched, all candidates with their slot counts and staff match status, why the result is null). Wired into HuddleToday\'s SessionPanel for both AM and PM' },
      { type: 'note', text: 'Diagnostic shows three failure shapes clearly: (a) no slot data found for these slot types on this date — likely a misspelling or whitespace issue; (b) candidates exist but all filtered as dummies — duty slots being recorded against a system entry like TRIAGE TELEPHONE, fix by adding aliases on the clinician record; (c) candidates exist and one matches — would only render if the upstream getDutyDoctor logic disagreed, which it shouldn\'t' },
      { type: 'tech', text: 'getDutyDoctor itself remains unchanged — this push is observability only. Once we see what the diagnostic actually says on preview.gpdash.net, we\'ll know whether the next step is a code change or a staff-register edit (alias). No regression risk: diagnostic only renders when dutyDoc is null AND a duty slot is configured, so existing flows are byte-for-byte identical' },
    ]
  },
  {
    version: '4.25.2',
    date: '2026-05-19',
    title: 'Fix: duty doctor "stale slot type" detection — surfaces why detection silently fails',
    changes: [
      { type: 'fix', text: 'Diagnosing why duty doctor stopped being detected across Urgent today, My rota, and the Workload audit. Root cause: hs.knownSlotTypes is a permanent UNION of every slot type ever uploaded — once a name lands there it stays forever. The Slot Filter UI reads from that union, so it can keep showing a slot type as "selected" even after EMIS has renamed it. The actual slot data is then stored under the new name; the saved dutyDoctorSlot still references the old name; getDutyDoctor finds nothing and returns null. No errors, no warnings — just silent emptiness in three views at once' },
      { type: 'feat', text: 'New lib/huddle.js export getActiveSlotTypes(huddleData) — returns a Set of slot type names that actually appear in any current slot count data (vs the historical union). Walks all four stores (Available / Booked / Embargoed / Blocked) across all dates and collects every slot type that has count > 0 somewhere' },
      { type: 'feat', text: 'Slot Filter side panel now distinguishes live slot types from stale ones: stale entries (in knownSlotTypes but with no count data in the current CSV) are greyed out, strikethrough, and tagged with a "stale" badge in the duty doctor section. Selecting a stale entry no longer fails silently — the user can see exactly which entries do nothing' },
      { type: 'feat', text: 'Loud red warning banner at the top of the duty doctor section when ANY selected slot type is stale: "Selected slot type isn\'t in your current data — duty doctor won\'t be detected. Pick one without the stale badge." Shows the exact stale name(s) in monospace so the user can verify against EMIS' },
      { type: 'tech', text: 'activeSlotTypes computed via useMemo from huddleData and threaded through all three SlotFilter mount points in HuddleToday.js (urgent, routine, per-card settings). No changes to getDutyDoctor itself — the function works correctly, the issue is upstream in how slot types are presented to the user' },
    ]
  },
  {
    version: '4.25.1',
    date: '2026-05-19',
    title: 'Security: audit log coverage — auth flow + admin actions + platform_audit_events',
    changes: [
      { type: 'feat', text: 'Auth flow now produces a full audit trail. login logs login on success and failed_login on failure (anon execute already granted on log_auth_event for the failure case). signup logs signup once the OTP verification completes the account. password reset request logs password_reset_requested, password change via the reset link logs password_changed. All four sign-out call sites (SignOutButton on v4 dashboard, DashboardShell, AccountSettings, mfa-verify lockout path) now log logout BEFORE calling auth.signOut so auth.uid() resolves inside the RPC' },
      { type: 'feat', text: 'New platform_audit_events table + log_platform_audit_event() RPC for platform-wide admin actions that don\'t belong to any single practice. Parallels the existing impersonation_sessions pattern: dedicated table (since Postgres can\'t ALTER TYPE inside a transaction, we can\'t add enum values to audit_event_type), service-role writes only via the helper RPC, platform-admin-only reads, append-only (no UPDATE/DELETE policies). Captures actor_user_id (from auth.uid), action, target_user_id + target_email (denormalised for searchability post-deletion), description, details, ip_address, user_agent' },
      { type: 'feat', text: 'platform_audit_action enum covers user_suspended / user_unsuspended / platform_admin_added / platform_admin_removed / admin_link_generated / nhs_baseline_uploaded / list_sizes_backfilled / other. New admin_list_platform_audit_events() RPC for the future admin UI to browse the log, filterable by action / actor / target, capped at 200 rows per call' },
      { type: 'feat', text: 'Four admin routes now log to platform_audit_events: suspend-user (POST → user_suspended, DELETE → user_unsuspended), generate-link (admin_link_generated — logs link type + target email but NOT the link itself, since the action URL contains a replayable one-shot token), upload-nhs-oc-baseline (nhs_baseline_uploaded with month + practices upserted + parse time), backfill-nhs-list-sizes (list_sizes_backfilled only when done:true to avoid logging every batch). All logs are best-effort with console.warn on failure — won\'t fail the operation if the audit write breaks' },
      { type: 'feat', text: 'seed-demand-from-nhs now writes a settings_changed entry to the existing audit_events (practice-scoped) recording that the demand model was reseeded from NHS baseline + source month + ods_code + baseline total. v4-import already had coverage via direct insert into audit_events at the end of the run — left as-is since it works' },
      { type: 'tech', text: 'Audit log coverage now in place for: practice creation/update + role changes + membership mutations (existing SQL triggers in migrations 028/029); impersonation start/end (impersonation_sessions table, migration 035); MFA enrol/challenge/fail (auth_events via log_auth_event, wired in v4.25.0); all sign-in / sign-out / signup / password / failed-login events (wired in this push); all platform admin actions (platform_audit_events table, this push); demand model seeding (audit_events via log_audit_event, this push); v3→v4 data import (audit_events direct insert, existing). Gaps remaining: data export (no feature yet — will pair with item 11 GDPR work)' },
    ]
  },
  {
    version: '4.25.0',
    date: '2026-05-19',
    title: 'Security: MFA enforcement for platform admins',
    changes: [
      { type: 'feat', text: 'Platform admin accounts now require two-factor authentication (TOTP). On the next admin page visit, anyone with profiles.is_platform_admin=true gets redirected to /v4/security to enrol an authenticator before continuing. NHS data context makes this table stakes — a compromised admin password without MFA is platform-wide compromise via the is_platform_admin() RLS override + impersonation' },
      { type: 'feat', text: 'New /v4/security page for enrolling and managing TOTP authenticators. Works with Google Authenticator, 1Password, Authy, and any standards-compliant TOTP app. Shows QR code + manual entry secret, takes a 6-digit verification code to complete enrolment. Successful enrolment logs an mfa_enrolled event to the auth_events timeline; failures log mfa_failed. Multiple authenticators per user supported (add a backup device by clicking "Add another authenticator")' },
      { type: 'feat', text: 'New /v4/mfa-verify page — the challenge step shown to anyone with MFA enrolled who has signed in with just password (AAL1). Eager challenge issued on mount so the verify call is single-step on code submission. Failed attempts auto-reissue a fresh challenge and log to mfa_failed. Sign-out link for the "lost my authenticator" case' },
      { type: 'feat', text: 'New lib/admin-guard.js with requireAdmin(supabase, { returnTo }) — single point of enforcement for the four-step gate (signed in → platform admin → MFA enrolled → AAL2). Replaces the duplicated inline auth+admin check across five admin pages. Wired into /v4/admin, /v4/admin/nhs-data, /v4/admin/users, /v4/admin/users/[id], /v4/admin/practices/[id]. Centralisation closes the "guards added to four pages but the fifth was missed" risk' },
      { type: 'feat', text: 'Login flow now checks AAL after a successful password sign-in. If the user has MFA enrolled but hasn\'t challenged this session (currentLevel=aal1, nextLevel=aal2), they\'re redirected to /v4/mfa-verify with the original ?next= preserved. Avoids the flash-of-destination-page that pure server-side enforcement would produce' },
      { type: 'tech', text: 'Uses Supabase\'s built-in MFA API (auth.mfa.enroll / challenge / verify / unenroll / listFactors / getAuthenticatorAssuranceLevel). No new database tables — Supabase manages auth.mfa_factors internally. Audit events reuse the existing log_auth_event RPC with mfa_enrolled / mfa_challenged / mfa_failed enum values already in the auth_event_type enum from the audit_events migration' },
    ]
  },
  {
    version: '4.24.1',
    date: '2026-05-19',
    title: 'Security: vulnerability disclosure + CSP reporting + privacy-friendly fonts',
    changes: [
      { type: 'feat', text: 'Published /.well-known/security.txt (RFC 9116) with vulnerability disclosure contact, expiry, and scope. Tells security researchers exactly how to report issues — closes the "no contact for security reports" gap that any external audit would flag, and signals that we take this seriously' },
      { type: 'feat', text: 'CSP violation reporting endpoint at /api/csp-report. Browsers now POST any blocked-resource violations to a structured-logged endpoint. Surfaces both legitimate misconfigurations (a new resource we forgot to allowlist) and real attack attempts. Filters out chrome-extension / moz-extension / safari-extension violations so the logs aren\'t polluted by installed browser extensions injecting scripts. Rate-limited at 30/min/IP since the endpoint is necessarily unauthenticated. Returns 204 No Content so misbehaving browsers don\'t retry-loop' },
      { type: 'feat', text: 'Both legacy report-uri (in CSP) and modern Report-To headers (separate response header with 24h max_age) configured so all browsers know where to send violations' },
      { type: 'feat', text: 'Switched Google Fonts → Bunny Fonts (https://fonts.bunny.net) — a privacy-respecting drop-in replacement. Same font catalogue (DM Sans, Space Mono, Outfit), GDPR-compliant (no tracking, no IP logging, EU-hosted). Removes Google from the trust chain entirely. CSP tightened to drop fonts.googleapis.com / fonts.gstatic.com and allow only fonts.bunny.net. Eliminates the "every page load tells Google your IP" privacy leak that mattered most for our NHS-data context' },
      { type: 'note', text: 'Long-term plan for fonts: self-host via next/font/google for zero external dependencies. Requires touching ~115 inline fontFamily references across 45 files to use CSS variables — substantive enough to defer to a focused session. Bunny Fonts gets us the security + privacy wins now without the code churn' },
    ]
  },
  {
    version: '4.24.0',
    date: '2026-05-19',
    title: 'Framework: Next.js 14 → 15 + React 18 → 19 migration',
    changes: [
      { type: 'feat', text: 'Upgraded Next.js from 14.2.35 to 15.5.18 and React from 18.x to 19.2. Closes the remaining App Router CVEs that couldn\'t be patched on the 14.x line — cache poisoning in RSC responses (GHSA-wfc6-r584-vfw7), RSC cache-busting collisions (GHSA-vfv6-92ff-j949), Server Components DoS (three separate advisories), and the middleware/proxy cache poisoning issue. Production dependency audit now shows 2 moderate (down from 23 critical/high before the v4.23.x epic, then 14 high before this push). The 2 remaining are postcss <8.5.10 transitives only exploitable if user input flows into postcss stringification, which never happens in our pipeline (Tailwind only processes our own source files)' },
      { type: 'tech', text: 'cookies() is async in Next 15 — every call site bulk-updated from "const cookieStore = cookies()" to "const cookieStore = await cookies()". 27 sites across API routes, server components, and the supabase server utility. All were already in async functions so the change is mechanical' },
      { type: 'tech', text: 'Dynamic-route page params are async in Next 15 — every page that reads params.id now does "const { id } = await params". 8 pages updated (admin/users/[id], admin/practices/[id], onboarding/setup/[id], practice/[id], practice/[id]/setup, invite/[id], p/[id], p/[id]/setup-in-progress). Same change for searchParams in server-component props (dashboard redirect, admin/users)' },
      { type: 'fix', text: 'Wrapped login and signup pages in <Suspense> boundaries around useSearchParams(). Was a warning in Next 14, an error in Next 15 — would have broken the build at deploy. Inner components renamed to LoginPageInner / SignupPageInner; outer default exports provide the Suspense fallback' },
      { type: 'note', text: 'React 19 ships with Next 15. Existing component code unchanged — forwardRef still works, refs still work, hooks behave the same. No useFormState→useActionState rename needed (we don\'t use either). No hydration mismatch warnings surfaced during build. Fetch default-caching behaviour change reviewed across all 34 call sites: every one of ours either targets force-dynamic API routes or external services where we want fresh data, so no behavioural impact from the change' },
    ]
  },
  {
    version: '4.23.3',
    date: '2026-05-19',
    title: 'Security: input shape validation + safe error responses',
    changes: [
      { type: 'feat', text: 'New lib/api-helpers.js with isUuid / isEmail format checks plus requireUuid(value, fieldName) — a one-line helper that returns a clean 400 if the input fails. Wired into every API route that takes a practiceId/practice query param or target_user_id body field (data, sync-teamnet, seed-demand-from-nhs, v4-import, impersonate). Previously a malformed UUID would flow straight through to Supabase and produce a Postgres error like \'invalid input syntax for type uuid: "abc"\' — both ugly for the user and a small schema-info leak. Now bad input fails fast with a structured message' },
      { type: 'feat', text: 'serverError(safeMessage, err, options) helper for catch-all error paths. Generates a short request ID, logs the full error (name + message + stack + context) server-side via structured console.error so Vercel log search can find it by ID, and returns a sanitized response to the client with the request ID. Replaces the previous "echo err.message verbatim" pattern in the sync-teamnet calendar-fetch/parse paths, v4-import Redis read, and generate-link Supabase admin error — three spots that were leaking internal-implementation detail. Users who hit a server error now see "Something went wrong. ID: a1b2c3d4..." instead, which they can quote in a support message for log lookup' },
      { type: 'feat', text: 'generate-link now validates the email format up-front via isEmail() before passing to Supabase\'s admin client. Stops obvious garbage hitting the auth service and prevents leakage of "user not found" / "user already confirmed" detail when the input was malformed' },
      { type: 'tech', text: 'Intentionally left alone: the structured error arrays in v4-import\'s report.errors and the admin backfill route\'s errorSamples — those go in JSON reports shown only to platform admins running migrations, and the verbatim Supabase error message is genuinely useful diagnostic info there. Audit-tradeoff: information disclosure is fine when the only audience is the operator debugging their own import' },
    ]
  },
  {
    version: '4.23.2',
    date: '2026-05-19',
    title: 'Security: per-endpoint rate limiting',
    changes: [
      { type: 'feat', text: 'Per-IP / per-user / per-practice rate limiting now applied to seven sensitive API routes, backed by Upstash Redis with a sliding-window algorithm. Sized for legitimate use × 2-3× headroom; anything past that is almost certainly script abuse. Returns HTTP 429 with X-RateLimit-Limit/Remaining/Reset + Retry-After headers so well-behaved clients can back off politely. New lib/rate-limit.js exports checkRateLimit() plus a RATE_LIMITS registry of named limit categories' },
      { type: 'feat', text: 'Bucket sizes per category: import (3/min/user — heavy DB writes, legitimate use is once-per-practice-ever), practiceSync (10/min/practice — TeamNet sync, manual + daily cron), practiceCompute (20/min/practice — demand seeding from NHS baseline), publicLookup (60/min/IP — anonymous OpenPrescribing + postcodes.io proxies; stops external API abuse on our behalf), adminSensitive (10/min/admin — impersonation; stops target-enumeration), adminFrequent (30/min/admin — link generation; allows batch invites without throttling)' },
      { type: 'tech', text: 'Rate limit checks fire AFTER auth/membership checks (so an unauthenticated attacker can\'t exhaust a legitimate user\'s bucket by spamming with arbitrary practice IDs), and BEFORE any expensive work. Fails OPEN (allow + console.warn) if Redis is unavailable rather than locking everyone out during a Redis blip. Limiters are cached per (prefix, limit, window) tuple so we don\'t reconstruct the @upstash/ratelimit sliding-window helper per request' },
    ]
  },
  {
    version: '4.23.1',
    date: '2026-05-19',
    title: 'Security: dependency patches (Next.js 14.2.15 → 14.2.35)',
    changes: [
      { type: 'fix', text: 'Bumped Next.js from 14.2.15 to 14.2.35, closing 20+ known CVEs that accumulated against the older patch. Covered: middleware authorization bypass (GHSA-f82v-jwr5-mffw, critical), several DoS vulnerabilities, SSRF via Image Optimization API, content injection in Image Optimization, race condition cache poisoning, and the now-fixed Server Action DoS. No breaking changes — 14.2.35 is the latest 14.2.x patch line so existing app code is unchanged' },
      { type: 'fix', text: 'Bumped ws transitive dependency (used by @supabase/realtime) to patch an uninitialized-memory-disclosure issue. Auto-applied via npm audit fix; no code changes' },
      { type: 'tech', text: 'Added @upstash/ratelimit as a new dependency in preparation for per-IP rate limiting on expensive API endpoints (next patch, v4.23.2). No code uses it yet — this commit just records the dependency' },
      { type: 'note', text: 'Two known CVEs remain after this bump, both requiring a Next 15+ upgrade to fully address: a postcss XSS in unescaped </style> tags (CVE only exposable if user input flows into postcss stringification, which never happens in our pipeline — Tailwind processes only our own source files) and a cluster of App Router cache poisoning / RSC DoS advisories that need Next 15. Migration tracked as a separate planned project — it requires async cookies(), async params, and React 19, so it\'s a substantive rewrite rather than a patch bump' },
    ]
  },
  {
    version: '4.23.0',
    date: '2026-05-19',
    title: 'Security: HTTP headers — CSP, HSTS, frame-ancestors, full set',
    changes: [
      { type: 'feat', text: 'Every response from the app now ships with a full set of HTTP security headers. Closes the biggest gap from the security audit — previously next.config.js was empty so we shipped nothing. Headers added: Strict-Transport-Security (2 years, includeSubDomains, preload-eligible), X-Content-Type-Options (nosniff), X-Frame-Options (DENY) + CSP frame-ancestors none for clickjacking, Referrer-Policy (strict-origin-when-cross-origin so practice slugs/tokens don\'t leak to external sites users click through to), Permissions-Policy disabling 12 browser APIs we don\'t use (camera, mic, geolocation, payment, USB, etc.), Cross-Origin-Opener-Policy + Cross-Origin-Resource-Policy (same-origin)' },
      { type: 'feat', text: 'Content Security Policy locks down what the browser is allowed to load. Scripts: only same-origin (with unsafe-inline for the Next.js hydration bootstrap — can be tightened to nonces later if needed). Styles: same-origin + fonts.googleapis.com. Fonts: gstatic.com + data: URIs. Connect: same-origin + *.supabase.co + api.postcodes.io (the only external host the browser ever fetches from directly, used for postcode lookup in the practice details step). Everything else (frames, objects, embeds) is blocked. Any new external host added later needs the CSP updated or the browser will refuse — fail-loud rather than fail-open' },
      { type: 'tech', text: 'Headers configured in next.config.js via the headers() function, applied to every route via source: \'/(.*)\'. CSP-related headers are no-ops on JSON API responses but the rest (HSTS, X-Content-Type-Options) still apply usefully. Deployed first to preview.gpdash.net (v4-rebuild branch) — if CSP needs widening for any unexpected resource, console violations will surface it before this hits production main' },
    ]
  },
  {
    version: '4.22.3',
    date: '2026-05-19',
    title: 'Wizard: slot type auto-suggest with confidence badges',
    changes: [
      { type: 'feat', text: 'Slot types step now auto-categorises every slot on first mount using the existing name-pattern heuristic, then shows a confidence badge on each row so you can see at a glance which guesses are confident vs which need a closer look. Green ✓ AUTO means a confident match (slot names like "Same Day", "Urgent", "Routine", "Pre-Book", "Duty Doctor" — these have very low false-positive rates). Amber ~ CHECK means an educated guess based on weaker keywords like "Book" or "Appt" that almost always mean routine but could conceivably be a same-day slot at some practices. Clicking the picker confirms or overrides — once you interact with a row, the badge disappears so you can scan for slots you haven\'t yet reviewed' },
      { type: 'feat', text: 'Auto-apply only fires when nothing\'s been categorised yet — returning users who\'ve previously reviewed this step never get their saved decisions clobbered. The "Apply suggestions" buttons at the top of the step still work for any unclassified slots that weren\'t high enough confidence to auto-apply' },
      { type: 'tech', text: 'New suggestSlotCategoryWithConfidence helper returns { category, confidence: "high" | "medium" }. The existing suggestSlotCategory now delegates to it for the .category. Confidence boundaries: HIGH = distinct keywords ("urgent", "same day", "acute", "emergency", "triage", "callback", "routine", "pre-book"); MEDIUM = ambiguous keywords ("book", "appt", "f2f"). userTouched Set tracks explicit user interactions so the AUTO badge only shows on slots that match the suggestion AND haven\'t been clicked yet' },
    ]
  },
  {
    version: '4.22.2',
    date: '2026-05-19',
    title: 'Wizard: unified global save indicator',
    changes: [
      { type: 'feat', text: 'New global save pill in the wizard header strip, sat next to the "Step X of 8" counter. Shows "Saving…" with a pulsing dot whenever any save is in flight, a brief green "✓ Saved" for 4s after the last save settles, and a red "Save error" pill (with the exact message in the tooltip) if anything fails. Replaces the patchwork of per-step indicators that varied in wording and placement between DetailsStep, TeamNetStep, SlotTypesStep, and SitesStep — though those inline indicators are still there too for the step-specific context ("Saving postcode…"). The header pill gives you an at-a-glance read of whether it\'s safe to navigate away regardless of which step you\'re on' },
      { type: 'tech', text: 'Save tracking implemented via a SaveContext that exposes a trackSave(promise) wrapper. Each save call is wrapped, which lets the wizard maintain an in-flight counter (handles concurrent saves correctly — pill stays "Saving…" until ALL of them settle, not just the most recent). Steps wired: DetailsStep, TeamNetStep, SlotTypesStep, SitesStep. EmisStep deliberately not wired — its single big upload action has its own structured summary panel and doesn\'t need a redundant "Saving…" pill alongside' },
    ]
  },
  {
    version: '4.22.1',
    date: '2026-05-19',
    title: 'Wizard: TeamNet URL live test + demand history feature-unlock preview',
    changes: [
      { type: 'feat', text: 'TeamNet URL field now validates format inline as you type and auto-fires a sync test after the URL saves. Three states shown beneath the input: "✓ Format looks right" / "⚠ Doesn\'t look like a TeamNet URL — double check?" / "✗ URL should start with https://". After the debounced save settles, the sync runs automatically and the result appears in the existing sync-status panel — so you find out in ~2 seconds whether the URL actually works, no need to click Sync now manually. Input border tints red/amber/green to match. The Sync now button still works for re-running on demand' },
      { type: 'feat', text: 'Demand step now shows a feature-unlock checklist when data is uploaded, instead of the previous generic "Demand data uploaded" line. Shows the row count + total span ("2,161 rows · 287 days of history") plus four checkboxes telling you what the model has learned: Baseline ✓ · Day-of-week effects ✓ (needs 20+ rows) · Long-term growth trend ✓ (needs 90+ days) · Monthly seasonality ✗ (needs 270+ days). Each row shows current vs required so you know exactly how much more history would unlock the next feature. Date range of the uploaded data is shown so you can see what window the model is calibrated to' },
    ]
  },
  {
    version: '4.22.0',
    date: '2026-05-19',
    title: 'Wizard: welcome screen + step icons',
    changes: [
      { type: 'feat', text: 'Welcome overlay shown on first arrival to the wizard for fresh practices (no postcode, no list size, no clinicians yet). Sets expectations before the form hits — explains the wizard is ~10 minutes, that everything saves as you go, and lists the required vs optional steps side-by-side so the user knows what\'s truly needed. Single "Let\'s go" button dismisses. Returning users (anyone with data) skip the welcome entirely' },
      { type: 'feat', text: 'Step icons on the progress dots. Each of the 8 steps now has a distinct Lucide-style icon — building for details, calendar for TeamNet, upload arrow for EMIS, clock for slot types, people for clinicians, map pin for sites, chart line for demand, mail for invites. Replaces the bare step number so the dots are visually distinguishable from a glance rather than needing tooltip-by-tooltip hover. Done steps still show the green checkmark' },
    ]
  },
  {
    version: '4.21.2',
    date: '2026-05-19',
    title: 'Wizard polish: completion celebration + unsaved-input warning',
    changes: [
      { type: 'feat', text: 'Brief celebration overlay when you click "Go to dashboard" at the end of the wizard. Green checkmark pops in, "You\'re all set up!" lifts up, then we navigate after ~1.8s. Replaces the silent route-change with a moment to acknowledge that setup is done — minor touch but the wizard ends with more closure than a button click that immediately disappears' },
      { type: 'feat', text: 'beforeunload warning if you try to close the tab with unsaved input. The InvitesStep textarea is the only field on the wizard without auto-save (emails persist only after Send is clicked), so closing or refreshing with a half-typed invite list used to lose it silently. Now triggers the browser\'s standard "Changes you made may not be saved" prompt. Wizard\'s own navigation (Go to dashboard, progress dots, Back/Continue) bypasses the warning since router.push doesn\'t fire beforeunload. The dirty-tracking is wired wizard-wide via a setDirty callback, so adding the warning to other steps is a one-liner if needed later' },
    ]
  },
  {
    version: '4.21.1',
    date: '2026-05-19',
    title: 'Wizard: EMIS post-upload summary + inline email validation',
    changes: [
      { type: 'feat', text: 'EMIS step shows a structured summary panel after upload instead of the loose one-liner success message. Three stat cells side-by-side — clinicians imported, sites detected, dates covered — plus a line about working patterns ("Generated for 38 of 41 (3 already had one)") and a heads-up about multiple sites if the CSV has more than one location. Tells you in one glance what the next steps need to do' },
      { type: 'feat', text: 'Inline email validation on the Invites step. Tokens get parsed as you type and rendered as chips below the textarea: green for valid emails, struck-through for duplicates ("will skip"), amber for things that almost-but-not-quite look like emails (with a tooltip hint about whether the @ or TLD is missing). Send button now says "Send 3 invites" so the count is unambiguous before you click. Previously, malformed input was silently dropped at send time which left users wondering why their invite list was shorter than expected' },
    ]
  },
  {
    version: '4.21.0',
    date: '2026-05-19',
    title: 'Wizard navigation + orientation polish',
    changes: [
      { type: 'feat', text: 'Smarter resume hint when re-entering the wizard. Previous logic only checked 3 fields before defaulting to the final invites step — so a user who\'d done everything except sites would land on invites, which is confusing. Now walks the full stepDone-like state on mount and lands on the first incomplete step: required steps win first (so if details isn\'t set, you start there no matter what), then the first incomplete optional step. If everything\'s done, you still land on the last step so the dashboard button is visible' },
      { type: 'feat', text: 'Skipped-step reminder on the final step. The invites step now shows a panel listing every optional step you skipped, with quick-jump buttons. No more scrolling back through eight progress dots to find what you missed — and it makes it obvious that the skipped bits aren\'t blockers, just things you can come back to' },
      { type: 'feat', text: 'Live step subtitles. Instead of the static "Optional · sync absences" wording, completed steps now show what\'s actually been set: "BS25 1AF · 11,000 patients · South West", "✓ Calendar URL saved", "3 slot types categorised · duty doctor set", "2 sites configured", and so on. Useful when scrolling back through the wizard — at a glance you can see what each step is holding without opening it' },
      { type: 'feat', text: '"You can leave anytime" banner. Once setup auto-completes (the minimum required data is in place), a small banner now appears at the top of every step explaining "Setup saved — you can leave to the dashboard anytime, optional steps below are nice-to-haves you can come back to". Includes its own Go to dashboard button so they don\'t have to scroll to step 8 to find it' },
      { type: 'feat', text: 'Tooltips on progress dots. Hovering each numbered dot now shows the step name + optional/required tag + done state ("Practice sites (optional) · ✓ Done"). Useful given the 8-step layout where dot 5 and dot 6 aren\'t always distinguishable from a glance' },
    ]
  },
  {
    version: '4.20.2',
    date: '2026-05-19',
    title: 'Wizard step 5: full QuickSetupTable instead of cut-down version',
    changes: [
      { type: 'feat', text: 'The wizard\'s "Your clinicians" step (introduced in v4.20.0) now embeds the full QuickSetupTable from Practice → Clinicians instead of a simplified inline list. You get every feature the standalone tab has: role-based section dividers, bulk-action toolbar (set role / status / buddy cover across selected rows), inline editing of every field with auto-save, "needs attention" amber highlights for missing initials or placeholder roles, working days grid modal, clinician details side panel, search, and the show-left toggle. Same view as Practice → Clinicians — same code path — so anything that works there works in the wizard too' },
      { type: 'info', text: 'The "Generate patterns from CSV" button I added in v4.20.0 is gone; QuickSetupTable\'s built-in working days grid handles auto-generation via the CSV that\'s already stored in huddle_csv_data after the EMIS step. One generation entry point instead of two, with the rest of the grid\'s editing surface alongside it' },
    ]
  },
  {
    version: '4.20.1',
    date: '2026-05-19',
    title: 'Buddy cover top/bottom consistency + upgrade-reason tooltip',
    changes: [
      { type: 'fix', text: 'Top mini grid and bottom allocations table can drift out of sync when computeDayStatus upgrades a day-off person to absent (because their next or previous working day is on planned leave — the "block of leave incidentally spans their day off" case). The top grid uses live status and turns them red; the bottom table was reading from the saved allocation which captured them as dayOff at generation time. Bottom table now reclassifies each pill using current live status — top and bottom always agree. People who were assigned but are now present (e.g. leave got cancelled) drop out of both columns entirely' },
      { type: 'feat', text: 'Top mini grid tooltip now explains the upgrade. If a clinician shows as red but isn\'t scheduled today AND has no planned absence today, the tooltip adds "⚠ Flagged for cover (day off adjacent to leave)". This is the case where a regular day-off person sits next to a multi-day leave block — they get treated as absent for buddy-cover purposes so the workload counts properly. The tooltip explains the why so it doesn\'t look like a bug (which it isn\'t)' },
    ]
  },
  {
    version: '4.20.0',
    date: '2026-05-19',
    title: 'Buddy cover bottom list filter + new Clinicians wizard step + TeamNet URL persistence',
    changes: [
      { type: 'fix', text: 'Buddy cover "Buddy Allocations" table at the bottom was including people who shouldn\'t be there — registrars, ANPs, anyone with buddy_cover=false — even though the top mini grid correctly hid them. The top grid filters via cliniciansList (buddyCover && !left && !administrative), but the bottom table was iterating presentIds directly. Bottom table now filters through cliniciansList for both the "Covering" rows and the inner absent/dayOff pill lists, so phantom people from when an allocation was generated (before someone got toggled off buddy cover) also disappear' },
      { type: 'feat', text: 'New "Your clinicians" step in the setup wizard (step 5 of 8, after slot types). Shows the team that came in from the EMIS upload with an inline role dropdown for each person — picking a role auto-applies sensible buddy cover defaults via buddyDefaultsForRole. Stats strip shows how many have roles + working patterns. "Generate patterns from CSV" button runs inferAmPmPatterns over the parsed appointment data and inserts working_patterns rows for anyone without one. "View weekly grid →" opens the existing WorkingDaysGrid modal so you can review and tweak the inferred patterns before moving on' },
      { type: 'fix', text: 'TeamNet calendar URL field in the wizard was appearing blank when revisiting the wizard after saving the URL elsewhere (e.g. via Practice → Resources). The initial prop is captured at server-render so it could be stale by the time the user returned. The TeamNetStep now refetches the saved URL on mount — same self-heal pattern as v4.18.0\'s WorkingDaysGrid refresh-on-open fix. Guarded against clobbering: only updates state when the current value is empty, so it can\'t wipe what the user just typed' },
    ]
  },
  {
    version: '4.19.0',
    date: '2026-05-19',
    title: 'Page load speedup: consolidate sequential database queries',
    changes: [
      { type: 'perf', text: 'Practice settings page (/v4/practice/<slug>) was doing 5-7 sequential database round trips before render: myMembership, myProfile, fullPractice, members, invites, then a Promise.all for settings+history, then another for clinicians+counts. Each Supabase round trip from Vercel is ~50-150ms, compounding to 400-700ms of unnecessary serial waiting on every navigation. Now all queries that depend only on user.id and practiceId run in a single 10-way Promise.all — saves roughly half a second on cold loads, more on slow connections' },
      { type: 'perf', text: 'CliniciansTab (the active server component for Practice → Clinicians) was doing 3 sequential queries: clinicians → working_patterns → settings. Working patterns now uses an inner-join filter on practice_id rather than waiting for the clinician id list, so all three queries run in parallel. Tab navigation is noticeably snappier' },
      { type: 'perf', text: 'Main dashboard (/p/<slug>) had two parallel batches when one would do: the section-status head counts (demand_history, practice_users) were waiting for the main 10-query batch to resolve before running, even though they don\'t depend on anything in it. Folded into the first batch — one fewer round trip per dashboard load' },
      { type: 'info', text: 'No behaviour change — same data, same UI, same shape passed to the client. Pure plumbing fix. If a page still feels slow, the bottleneck is likely the huddle CSV blob (can be several MB) or hydration; ping if you want me to look there next' },
    ]
  },
  {
    version: '4.18.3',
    date: '2026-05-19',
    title: 'Buddy cover: stop attributing absences to the wrong clinician',
    changes: [
      { type: 'fix', text: 'TeamNet absences were being attributed to the wrong clinician when two people shared a first name (e.g. Katie Ellison\'s CPD showing on Katie Parkhouse). Two compounding bugs: (1) extractNames treated "Ellison, Katie" as firstName="Ellison," surname="Katie", so both Katies ended up with surname="Katie" — every event mentioning "Katie" matched one or both. (2) The matcher accepted surname-only matches if the surname was 4+ characters, which combined with #1 meant any "Katie" event matched the first Katie in the loop iteration order' },
      { type: 'fix', text: 'extractNames in lib/teamnet.js now detects "Surname, Firstname" comma format (the shape EMIS CSVs use) and inverts it before tokenising — Katie Ellison and Katie Parkhouse now correctly resolve to firstName="katie" surname="ellison" vs surname="parkhouse". Also strips trailing role parentheses if they slipped through' },
      { type: 'fix', text: 'Matcher rewritten to use score-based candidate selection with an ambiguity guard. Scoring: initials standalone word = 3, firstname AND surname both present in summary = 3, surname-only word-boundary match with surname ≥5 chars = 1, anything weaker = 0. If two candidates tie at the top score, the event is REFUSED rather than guessed — it\'s safer to miss an absence than to put it on the wrong person' },
      { type: 'fix', text: 'Word-boundary matching everywhere — no more "Ellis" matching inside "Ellison". The matcher now tokenises the event summary into words and checks set membership rather than substring includes, so partial matches don\'t silently succeed' },
      { type: 'feat', text: 'Wizard CSV import now normalises name format on insert: "ELLISON, Katie (Salaried GP)" → "Katie Ellison" (with title-case applied to all-caps surnames). New imports go in clean. The teamnet matcher still handles legacy comma-format names from earlier imports correctly, so your existing data isn\'t affected — the normalisation just makes the database tidier going forward' },
    ]
  },
  {
    version: '4.18.2',
    date: '2026-05-19',
    title: 'Working days grid: stop the API mutation from destroying AM/PM data',
    changes: [
      { type: 'fix', text: 'Root cause of "working days grid blank after navigating away" was bigger than the previous v4.18.0 refetch-on-open fix. /api/v4/data mutation 1 — which converts v3-shape weeklyRota back to working_patterns — was using LONG day names (Monday/Tuesday/...) when the rest of the code uses SHORT keys (mon/tue/...). It also compared old vs new patterns by JSON-stringifying, which always reports differences because of the key shape mismatch. So EVERY saveData call from the client (the Today page, Buddy cover, Room dashboard, etc.) was overwriting the working_patterns row with long-key shape and wiping the AM/PM granularity' },
      { type: 'fix', text: 'Mutation 1 rewritten: now uses short keys when writing. Compares day-SETS (which weekdays a clinician is in) instead of stringified patterns. Preserves existing AM/PM granularity for days that were already in the set — your "Tuesday morning only" pattern survives any future save that includes weeklyRota. Adds days as whole-day in by default; removes days by omitting them' },
      { type: 'fix', text: 'New `normalizeWorkingPattern` helper in lib/v4-data.js — accepts patterns in either short or long key shape and returns the canonical short-key form. Used in the adapter (so existing malformed rows render correctly) and in WorkingDaysGrid (so the modal can read legacy long-key data). Eventually-consistent self-heal: any subsequent save through mutation 1 rewrites the row as short-key' },
      { type: 'info', text: 'For your current state: open the Working days grid and click "Regenerate all" to overwrite the (now-corrupted) long-key patterns with fresh AM/PM ones inferred from your CSV. From v4.18.2 onwards, mutation 1 won\'t touch them again unless a day genuinely changed' },
    ]
  },
  {
    version: '4.18.1',
    date: '2026-05-19',
    title: 'Demand predictor: fix wild long-term trend from short-history calibrations',
    changes: [
      { type: 'fix', text: 'The long-term trend factor was producing massive overestimates (e.g. +70 on top of a ~100-baseline) when calibrated from short demand histories. Linear regression on 20-30 data points was catching transient effects — a busy fortnight or slow week — as "growth" and extrapolating them forward as a long-term trend' },
      { type: 'fix', text: 'Calibration now requires at least 90 days of demand history before computing a growth slope. Below that, growthPerDay is set to 0 (no trend term) — the model still uses baseline + day-of-week + month effects, just doesn\'t extrapolate. Once a practice has uploaded 3+ months of demand data, the trend kicks in normally' },
      { type: 'fix', text: 'Safety clamp in the predictor: trend effect is now capped at ±25% of baseline regardless of what the calibration produced. Protects existing practices whose demand_settings was stored before the min-span check landed. The clamp is silent in the UI but the factors.trend object now includes a `clamped: true` flag for debugging' },
      { type: 'info', text: 'For your current state: the clamp takes effect immediately. To get a fully accurate trend, re-upload your demand CSV once you have ≥90 days of history (Anima or AskMyGP). Until then the predictor uses baseline + DOW + month effects without an extrapolation term' },
    ]
  },
  {
    version: '4.18.0',
    date: '2026-05-19',
    title: 'Working grid refresh-on-open + Buddy cover deep-link + Workload audit time picker',
    changes: [
      { type: 'fix', text: 'Working days grid was losing edits visually on close-and-reopen within the same session. Edits WERE saving to the database — but the modal\'s initial state came from a server-side prop captured at page load, so reopening within the same session showed stale data. Now the grid re-fetches working_patterns from the database every time it mounts, so it always reflects what\'s actually saved. Page refresh no longer required to see your edits' },
      { type: 'feat', text: 'The "Weekly grid" button on the Buddy cover page is now "Working days grid" and links straight into the new modal at Practice → Clinicians. Uses ?grid=open as a deep-link query param — the destination page sees it and auto-opens the modal, then strips the param from the URL so the back button doesn\'t loop. One click from Buddy cover to editing the standing pattern' },
      { type: 'feat', text: 'Workload audit gains a time range picker: Last 8 weeks · Last 8 + Next 8 (default, matches the previous fixed view) · Next 8 weeks · All data. Audit recalculates instantly when the range changes, with the resolved date span shown next to the picker. When you\'re viewing a non-historical range the "+8wk" trajectory column is hidden (it\'d be redundant — the chosen range already includes the future), keeping the table compact. When you pick "Last 8 weeks" the trajectory column comes back so you can see where you\'re heading' },
    ]
  },
  {
    version: '4.17.0',
    date: '2026-05-19',
    title: 'Sidebar practice tile + buddy defaults by role + fix buddy cover all-off bug',
    changes: [
      { type: 'fix', text: 'Buddy cover page was showing everyone as "day off" regardless of working pattern. The v4-data adapter was reading pattern["Monday"]?.am but the working_patterns table stores short lowercase keys ({ mon: {am, pm}, tue: ..., ... }) — pattern.Monday was always undefined so nobody got added to the weeklyRota arrays. Fixed by mapping mon→Monday, tue→Tuesday, etc. when building the v3-shape rota. Buddy cover allocations should now reflect each clinician\'s actual AM/PM working pattern' },
      { type: 'feat', text: 'Sidebar practice tile — bottom of the sidebar above the version number, an "identity anchor" showing a small avatar tile (cyan gradient) with auto-generated initials plus the full practice name and your role. For "Winscombe & Banwell Family Practice" the avatar shows "WB" — the initials helper strips stop-words ("the", "and", "&") and practice-name suffixes ("Family", "Practice", "Surgery", "Centre", "Clinic") so initials reflect the distinctive part. When the sidebar is collapsed, only the avatar shows, centred. Sets up the slot for a future multi-practice switcher' },
      { type: 'feat', text: 'Buddy-system defaults are now role-aware on every CSV import path (wizard EMIS step + dashboard daily upload). New helper buddyDefaultsForRole in lib/data.js: GP Partner / Associate Partner / Salaried GP → in buddy system AND can cover; GP Registrar / ANP → in buddy system, can\'t cover (they get cover when off, aren\'t expected to provide it); Locum / everyone else → not in buddy system. Practices no longer start with everyone toggled off and have to opt people in one by one — the GP team is in by default with correct cover flags' },
    ]
  },
  {
    version: '4.16.0',
    date: '2026-05-19',
    title: 'Auto-generate working patterns from CSV (AM/PM)',
    changes: [
      { type: 'feat', text: 'New inference function `inferAmPmPatterns` in lib/auto-rota.js — same matching logic as the existing day-level inferWeeklyRota (name match first, initials fallback with ambiguity guard) but tracks AM and PM appearances independently so it can produce half-day patterns ("Tue AM only" — common for part-time staff). Threshold: a clinician appears in ≥50% of leave-adjusted weeks for that (weekday, session) → "in". Conservative — when in doubt, leaves the session off and lets the user pick' },
      { type: 'feat', text: 'Wizard EMIS step now auto-generates working patterns immediately after inserting new clinicians from a CSV. Fetches the just-inserted clinicians back (to get their UUIDs), runs the inference, INSERTs working_patterns rows for those without one already. Success toast now reads "Found N clinicians… Working patterns generated for M" so the user knows it happened' },
      { type: 'feat', text: 'New "Generate from CSV" panel in the Working Days Grid for one-click regeneration. "Generate for missing" only fills patterns for clinicians who don\'t have one yet (safe — never overwrites). "Regenerate all" overwrites every pattern with a fresh inference (with a confirm prompt). Both surface a summary: "Generated N · M skipped (no CSV activity)". Particularly useful if the wizard\'s auto-gen was missed (e.g. CSV uploaded before v4.16.0)' },
      { type: 'feat', text: 'Skips writes for clinicians who already have an active working_patterns row — explicit overwrite required. Manual grid edits never get clobbered by accident. Same skip logic in both the wizard auto-gen and the Working Days Grid\'s default "Generate for missing" mode' },
    ]
  },
  {
    version: '4.15.0',
    date: '2026-05-19',
    title: 'Clinician details side panel + metadata storage',
    changes: [
      { type: 'feat', text: 'Click any clinician row in Practice → Clinicians to open a slide-out details panel. Holds the per-clinician detail that didn\'t fit in the main table: title (Dr/Mr/Mrs), full name + initials editing, role and status, aliases (chip editor for CSV matching variants), buddy cover preferences (primary + secondary), room preferences per site, working pattern mini-summary with link to the full grid, and free-form notes. All edits save direct to Supabase with a 500ms debounce, RLS-enforced' },
      { type: 'feat', text: 'Click detection: anywhere on the row except the interactive controls (inputs, selects, toggles, checkboxes) opens the panel. Click an input to type, click a toggle to flip it, click the row whitespace to see everything. Cursor on the row signals it\'s clickable' },
      { type: 'feat', text: 'Aliases as chips: add via a small input + Enter or "Add" button, remove via the × on each chip. Hooks straight into the CSV name-matcher when daily uploads come in — if a clinician\'s CSV name varies across exports ("Dr Smith" vs "Smith, J"), add the variants here and the matcher picks them all up' },
      { type: 'feat', text: 'Buddy preferences section only renders when "In buddy system" is on for that clinician (no point asking who covers them if they\'re not in the system). Candidates are limited to other active clinicians with buddyCover=true. Primary and secondary are independent dropdowns; secondary excludes whoever\'s set as primary' },
      { type: 'feat', text: 'Room preferences: a row per configured site with two dropdowns each (preferred + secondary). Reads sites from practice_settings.room_allocation.sites and only shows rooms marked isClinical !== false. Sites with no clinical rooms render an italic "No clinical rooms configured" placeholder. Empty preferences are stripped from storage so the metadata jsonb stays tidy' },
      { type: 'feat', text: 'Working pattern mini-view: 5×2 grid of read-only AM/PM half-day indicators (filled emerald = working, hollow = off). Header shows the computed sessions/week. "Edit in working-days grid →" button closes the panel and opens the full grid for editing' },
      { type: 'feat', text: 'Schema: new migration 033 adds clinicians.metadata JSONB column. Holds primaryBuddy, secondaryBuddy, roomPreferences, and notes — v3-era extras that don\'t warrant first-class columns yet. The v4 adapter unwraps these into the v3-shape clinician objects so the buddy-cover engine and other downstream code see flat fields without changes' },
      { type: 'feat', text: 'CliniciansTab now also fetches practice_settings.room_allocation.sites and passes them through to the panel. Same source the wizard\'s Practice Sites step writes to, so adding a site there shows up immediately as a preference option in the clinician panel' },
    ]
  },
  {
    version: '4.14.0',
    date: '2026-05-19',
    title: 'Clinicians: one canonical page at Practice settings + role section dividers',
    changes: [
      { type: 'feat', text: 'Sidebar "Clinicians" entry under PERSONAL is gone — all clinician editing lives at Practice → Clinicians now. The two pages had drifted apart (the sidebar one was missing the working-days grid, the modern toggles, and the role grouping; the practice settings one was missing aliases and buddy preferences). One canonical home from now on, with both sets of features merging in over the next few pushes' },
      { type: 'feat', text: 'Soft-redirect: if anything still navigates to the retired team-members section (deep links from older URLs, third-party docs, browser bookmarks), the dashboard redirects to /v4/practice/<slug>?tab=clinicians on render. Users see "Redirecting to Clinicians…" for a beat then land on the new home. No 404s' },
      { type: 'feat', text: 'Who\'s In page\'s "Review" link (under the unconfirmed-staff banner) now points directly to Practice → Clinicians via a real anchor — full page nav rather than in-dashboard section switch, since the destination is a different route. Reads the practice slug from data._v4 so it works on any practice without per-render lookups' },
      { type: 'feat', text: 'Role section dividers in the clinicians table. Whenever the role changes from the previous row, a subtle uppercase header (e.g. "GP PARTNER", "SALARIED GP", "ANP") appears above the next set. Skipped while a search is active because the result order interleaves roles arbitrarily and a header per row would be noise. Makes the table easier to scan when you\'re looking at "all my partners" or "all my nurses" — they cluster visually rather than just by sort order' },
      { type: 'feat', text: 'Existing TeamMembers component file kept in components/buddy/ for now since v3 production (on main) still uses it. Will be deleted when v3 catches up' },
    ]
  },
  {
    version: '4.13.0',
    date: '2026-05-19',
    title: 'Working days grid — AM/PM toggle per day per clinician',
    changes: [
      { type: 'feat', text: 'New "Working days grid" button on the Clinicians tab (toolbar, between "Show left" and the save indicator). One button, modal opens with a compact grid: rows = clinicians, columns = Mon/Tue/Wed/Thu/Fri, each day split into AM and PM toggles. Half days are common in general practice so each session is independently editable — a "Tuesday morning only" pattern just turns on the Tue AM cell' },
      { type: 'feat', text: 'Sessions per week computed live in the right-most column — each AM or PM cell that\'s on adds 1. Whole day in = 2 sessions, AM only = 1. Number updates as you toggle, no save click needed' },
      { type: 'feat', text: 'Per-row "All" and "Clear" buttons for quick bulk: full-time → "All" fills every cell; on leave → "Clear" empties them. Each click triggers a debounced save to the working_patterns table' },
      { type: 'feat', text: 'Storage: one row per clinician in working_patterns with effective_to = null (the active pattern). Pattern is JSONB: { mon: { am: "in", pm: "off" }, ... }. Matches the shape the dashboard already reads at v4-data.js, so the buddy roster and Who\'s In view will pick up changes automatically' },
      { type: 'feat', text: 'Sorted the same way the clinicians table is — by ROLES array order then alphabetically by name — so GP Partners cluster, then ANPs, then nursing, etc. "Left" status hidden to keep the grid focused' },
      { type: 'feat', text: 'Saves are per-clinician with a 600ms debounce. Each row independently shows a small "Saving…" hint while in-flight, and an error message under the name if the upsert fails. No big banner that obscures other people\'s edits' },
    ]
  },
  {
    version: '4.12.0',
    date: '2026-05-19',
    title: 'Slot types redo + EMIS step daily-upload note + Demand source guides',
    changes: [
      { type: 'feat', text: 'Slot types step redesigned. Three categories now (Routine, Urgent, Other) plus a separate independent Duty doctor toggle — a slot can be marked both urgent and duty doctor (typical) without forcing one or the other. Default for every slot is now "Other (not included)" — slots only enter the routine/urgent model after the user explicitly tags them, so nursing/HCA/admin/vaccination slots stop polluting the demand totals by accident' },
      { type: 'feat', text: 'Heuristic suggestions still run on slot names but are advisory only — they show as a small "Suggested: routine" hint under the slot name rather than auto-selecting. New "Apply category suggestions" and "Apply duty suggestions" buttons commit them all in one go for users who want the quick path. Categories suggested: routine if name contains "book", "routine", "pre-book", "appt", "f2f", "face to face"; urgent if it contains "urgent", "same day", "OTD", "on the day", "acute", "emergency", "triage", "callback"; duty if it contains "duty"' },
      { type: 'feat', text: 'New explanatory panel at the top of the slot types step: "What goes here? Appointment slot types for clinicians whose work is bookable by patients — typically GP and ANP slots. Most practices set nursing, HCA, phlebotomy, vaccination, and admin slots to Other since they\'re not part of the routine-vs-urgent capacity model." Spells out what each category means and that duty doctor is independent' },
      { type: 'feat', text: 'EMIS step (Appointment data) gains a callout: "One report does it all. This is the same CSV you\'ll upload every day going forward — saved as a report definition in EMIS, it takes about 30 seconds to run and re-upload." Users were assuming the wizard upload was one-off and the daily flow used something different; it doesn\'t' },
      { type: 'feat', text: 'Demand history step now reads "Upload an export from AskMyGP or Anima". Plus two expandable "How to export from <source>" sections below the upload, each with the right step-by-step. AskMyGP: Reports → Crosstab Demand Data → date range → Export. Anima: Admin → Audit results → filter patientReviewSubmit → Export. Closed by default to keep the page tidy' },
    ]
  },
  {
    version: '4.11.1',
    date: '2026-05-19',
    title: 'Fix: Slot types wizard step crashed on practices with existing v3 settings',
    changes: [
      { type: 'fix', text: 'Clicking the new Slot types wizard step threw "TypeError: (n.urgent || []).includes is not a function" on any practice with pre-existing slot filters. Cause: I assumed savedSlotFilters.urgent and .routine were string arrays, but v3 has always stored them as objects keyed by slot name with boolean values ({ "Telephone consult": true, "Booked": false }). When Winscombe (which already has v3 settings) loaded the wizard, my array .includes() call ran against an object and exploded' },
      { type: 'fix', text: 'SlotTypesStep now reads and writes the v3 object shape, so existing data loads correctly and what the wizard saves remains readable by the dashboard\'s SlotFilter component. Mutual-exclusion behaviour is unchanged — picking "urgent" for a slot sets urgent[name]=true and routine[name]=false in one update' },
      { type: 'fix', text: 'Initial state in the wizard now normalises the loaded value defensively — if a previous wizard version wrote arrays (the buggy shape from v4.11.0), they\'re converted to the object shape on load: ["A","B"] becomes { A: true, B: true }. No data loss for anyone affected by the broken first version' },
      { type: 'fix', text: 'dutyDoctorSlot tolerates legacy single-string values too — wrapped to a single-element array on load' },
    ]
  },
  {
    version: '4.11.0',
    date: '2026-05-19',
    title: 'Wizard: Sync now button + two new steps (Slot types, Practice sites)',
    changes: [
      { type: 'feat', text: '"Sync now" button on the TeamNet step in the wizard. Hits the same /api/v4/sync-teamnet endpoint the standalone editor uses — confirms the URL works without having to wait for the daily cron. Surfaces "Synced — imported N absences" in green or "Sync failed: <reason>" in red. Disabled until the URL has been saved' },
      { type: 'feat', text: 'New Slot types step (between Appointment data and Demand history). Lists every slot type found in the uploaded CSV; each row has a 3-way toggle: Routine / Urgent / Duty doctor. Defaults are guessed from the slot name (urgent if it contains "urgent", "same day", "OTD", "acute"; duty if it contains "duty"; otherwise routine) so most practices only have to correct the misses. Saves to huddle_settings.savedSlotFilters and huddle_settings.dutyDoctorSlot. The dashboard\'s urgent/routine capacity bars and the Today huddle\'s duty-doctor highlight depend on these — without them set, the dashboard "doesn\'t look good"' },
      { type: 'feat', text: 'New Practice sites step (after Slot types). Extracts unique location names from the CSV (locationData traversal) and lists them alongside any sites already configured. Each site gets a colour picker (10-colour preset palette or a free-form colour input). Saves to practice_settings.room_allocation.sites with shape { id, name, colour, gridSize, rooms } — the wizard only configures id/name/colour; rooms get added later in v3 Room Settings. Defaults to a rotating palette assignment so first-paint already looks fine and single-site practices can skip the step' },
      { type: 'feat', text: 'EMIS step now persists the parsed CSV to huddle_csv_data (one row per practice) so the slot-types and sites steps see real data on a fresh page load instead of an "upload first" prompt. Direct Supabase upsert rather than via the API — same pattern as DashboardClient, avoids Vercel\'s 4.5MB function-body limit on large CSVs' },
      { type: 'feat', text: 'Wizard server component now pre-loads huddle_settings, room_allocation, and huddle_csv_data — the new steps render with existing state on first paint, so revisiting the wizard after setup is complete shows what\'s already configured (not a blank slate)' },
    ]
  },
  {
    version: '4.10.1',
    date: '2026-05-19',
    title: 'Buddy/cover cascade + can-cover default off + ambiguous-initials false positive fix',
    changes: [
      { type: 'feat', text: 'Turning "In buddy system" OFF for a clinician now also forces their "Can cover" flag OFF. The two are dependent — not being in the system means you can\'t cover others — and previously the underlying canProvideCover value would stay TRUE while the UI just disabled the toggle. That created stale data where buddy=off but can-cover=true; mostly harmless but confusing downstream. Now the cascade is explicit. Bulk "Buddy off" applies the same cascade across every selected row in one action' },
      { type: 'feat', text: 'New clinicians imported via CSV now default both buddyCover AND canProvideCover to OFF. Previously can-cover defaulted to ON. Most practice CSV exports include admin and reception staff alongside clinicians, and admins shouldn\'t be in the cover pool by default — owners opt people IN explicitly via the Quick Setup toggles once they know who actually participates. Less to undo on a fresh setup' },
      { type: 'fix', text: 'The "Ambiguous initials detected — auto-match skipped" warning on the Clinicians page was firing for clinicians whose name was matching the CSV directly. Symptom: "JG — Justin Grandison: matches 2 CSV names (GOMM Jane, GRANDISON Justin)". Both Jane and Justin\'s names produce "JG" as one of many possible initials variants, so "JG" landed in the global ambiguity set. The warning was telling the user to disambiguate even though the underlying auto-match worked perfectly via name matching for Justin' },
      { type: 'fix', text: 'Fix: ambiguity warnings now skip clinicians who have a name match available in the CSV. If their name matches a CSV row directly, the initials-fallback isn\'t used, the ambiguity is irrelevant, and the warning is misleading. The matching algorithm itself is unchanged — name matching always ran first and worked; only the warning emission was being too liberal' },
    ]
  },
  {
    version: '4.10.0',
    date: '2026-05-19',
    title: 'Wizard is replayable + updated TeamNet how-to',
    changes: [
      { type: 'feat', text: 'The setup wizard can now be re-entered after setup is complete. Previously the server component redirected away to the dashboard if setup_completed_at was set — that meant if you wanted to change your TeamNet URL, re-upload demand data, or add invites later, you had to find each setting individually in the practice management tabs. Now the wizard is a permanent flow you can step through any time. Each step shows existing state pre-populated; nothing resets. Skip what\'s already done, change what you want' },
      { type: 'feat', text: 'New "Replay the setup wizard" card on the practice management Details tab. One click drops you into the wizard at /v4/onboarding/setup/<id>. Visible to admin/owner only (non-admins can\'t change setup anyway)' },
      { type: 'feat', text: 'TeamNet how-to instructions updated to match the current TeamNet UI: "Navigate to TeamNet → Diary. Ensure My items only is unticked. Click Add to external calendar and copy the link." The previous instructions referenced a "Sync" button that no longer exists' },
    ]
  },
  {
    version: '4.9.3',
    date: '2026-05-19',
    title: 'Quick Setup: Can-cover toggle disabled when not in buddy system',
    changes: [
      { type: 'feat', text: 'The "Can cover" toggle is now greyed out and non-clickable for rows that aren\'t in the buddy system. The dependency was always there logically — if a clinician isn\'t a buddy-system participant, "can they cover others" has no meaning — but the UI was letting users edit the flag freely, suggesting a setting that wouldn\'t do anything. Now the toggle reads at 35% opacity with a not-allowed cursor when the parent "In buddy system" toggle is off' },
      { type: 'feat', text: 'The underlying canProvideCover value is preserved when the parent toggle is off — we just stop letting users edit it. So if you turn buddy off then back on, the previous can-cover preference comes right back. No silent data resets' },
      { type: 'feat', text: 'ToggleSwitch component picked up a `disabled` prop, ARIA-disabled attribute, and the visual treatment (opacity, cursor). Reusable for future dependent toggles' },
    ]
  },
  {
    version: '4.9.2',
    date: '2026-05-19',
    title: 'Quick Setup: restored the "Can cover others" toggle',
    changes: [
      { type: 'feat', text: 'Two distinct buddy-system flags exist on each clinician and v3 surfaced both — buddyCover (in the buddy system at all) and canProvideCover (can be allocated as cover for others). I\'d only exposed buddyCover in Quick Setup; the second one was getting silently defaulted to true via the round-trip. Adding the second toggle back means you can configure both at once: turn buddyCover ON for everyone in the rota, then turn "Can cover" OFF for the few who only receive cover but never give it (typically junior staff or those on phased return)' },
      { type: 'feat', text: 'New emerald-green "Can cover" toggle sits between Buddy and Who\'s In. Renamed "Buddy cover" header to "In buddy system" to make the distinction explicit — it\'s about membership, not coverage capacity. Three buddy-related toggles now read left-to-right: in the system (purple) → can cover others (green) → shown on Who\'s In page (teal). Same modern slider style as the existing toggles, full ARIA labelling' },
      { type: 'feat', text: 'Bulk actions: "Can cover on" / "Can cover off" buttons added to the toolbar alongside Buddy on/off and Who\'s In on/off. Tick the rows, click — same auto-deselect-after-apply behaviour from v4.9.1' },
      { type: 'feat', text: 'Table width bumped from 870 to 970 to fit the new column. Still comfortably inside the 1200px page container so no horizontal scroll' },
    ]
  },
  {
    version: '4.9.1',
    date: '2026-05-19',
    title: 'Quick Setup: bulk actions clear the selection after applying',
    changes: [
      { type: 'feat', text: 'After running a bulk action (Set role, Set status, Buddy on/off, Who\'s In on/off) the selected rows now auto-deselect. Previously the rows stayed selected — fine if you wanted to chain a second action on the same set, but easy to forget and accidentally re-target the same rows when you came back later. The new behaviour is "applied, done" — re-tick the rows if you want to chain another action. Same UX as Gmail or any modern table' },
    ]
  },
  {
    version: '4.9.0',
    date: '2026-05-19',
    title: 'Anima demand-history parser + auto-detect dispatcher',
    changes: [
      { type: 'feat', text: 'New parser for Anima\'s "ExportedAuditResults_*.csv" audit export. Each row is one patientReviewSubmit event with a JSON payload in AdditionalInfo; the parser aggregates events by review_date and produces the same {date, count} shape the existing demand-history pipeline expects. Tested against a 2,161-row export covering 20 days from Winscombe — parses cleanly, totals match the source data exactly' },
      { type: 'feat', text: 'New dispatcher at lib/demand-parsers/index.js auto-detects which tool a file came from and routes to the right parser. AskMyGP exports (UTF-16, tab-separated week grids) and Anima exports (UTF-8 CSV with JSON payloads) work through the same drop-zone now — no source selector to pick from. Header sniffing first ("Timestamp,User,Patient,ActionID" → Anima; otherwise fall through to AskMyGP), so adding a third tool later means writing a parser + adding one entry to the SOURCES array' },
      { type: 'feat', text: 'DemandUpload drop-zone now reads "Supports: Anima · AskMyGP" instead of the single-tool hint. Detected source surfaces in the success panel ("detected as Anima"). For Anima specifically, the panel breaks the total down into "N direct + M via staff" — useful for practices wanting to understand how much demand goes through receptionist phone-in vs patients submitting themselves. Total demand stays the same (both count) — the breakdown is informational' },
      { type: 'feat', text: 'Both direct patient submissions and staff-proxy submissions (receptionist/admin/manager/secretary submitting on behalf of a patient who phoned in) count toward the daily demand total. They represent the same underlying request — only the input channel differs. This matches how AskMyGP\'s "requests" count treats them' },
      { type: 'feat', text: 'Schema unchanged: demand_history\'s unique constraint stays at (practice_id, date). Re-uploads from any source overwrite previous data for the same date; the `source` column records which tool provided the winning data point. If a practice ever runs parallel pilots and wants to sum across sources, we\'d drop that constraint and sum at read-time — not today\'s problem' },
    ]
  },
  {
    version: '4.8.7',
    date: '2026-05-18',
    title: 'Quick Setup: bulk actions toolbar always visible',
    changes: [
      { type: 'feat', text: 'The bulk-edit toolbar used to only appear once you ticked a row. That meant the available actions (Set role, Set status, Buddy on/off, Who\'s In on/off) were hidden until the user discovered them by ticking — and people who hadn\'t tried tended not to know they existed. Now the toolbar is always shown above the table. When nothing is selected, controls are dimmed and the bar reads "Bulk edit — tick rows below to enable". As soon as a row is ticked, the bar activates and the count updates' },
      { type: 'feat', text: 'Visual: muted-grey track + "not-allowed" cursor on the disabled controls so the affordance is clear without being noisy. The "Clear selection" button is still hidden until something\'s selected (no point showing a clear button with nothing to clear)' },
    ]
  },
  {
    version: '4.8.6',
    date: '2026-05-18',
    title: 'Practice management: Clinicians tab uses full width so all columns fit',
    changes: [
      { type: 'fix', text: 'The whole practice management page was wrapped in maxWidth: 800. That worked fine for the form-style tabs (Details, Demand, Resources, etc) where lines wrap naturally, but the Clinicians data table needs ~870px to show all its columns (checkbox + Name + Initials + Role + Status + Buddy + Who\'s In). On a typical browser the right-most columns were cut off — Buddy cover and Who\'s In were invisible without scrolling sideways, which most users won\'t discover' },
      { type: 'fix', text: 'Fix: moved the maxWidth constraint per-tab. The outer wrapper now allows up to 1200px. Form tabs (Details, Users, Buddy cover, Demand, Resources, Activity, Danger zone) are wrapped in a 800px constraint individually — same reading width as before, lines don\'t stretch to unwieldy 100-character paragraphs. The Clinicians tab gets the full 1200px and its data table now renders fully visible on any laptop screen' },
      { type: 'fix', text: 'Also updated the table\'s minWidth to 870 (was 980, a leftover from when there were 8 columns including Group). No behavioural change — just removes the spurious 110px gap to the right of the table' },
    ]
  },
  {
    version: '4.8.5',
    date: '2026-05-18',
    title: 'Quick Setup: modern toggle switches, sort by role, drop redundant Group column',
    changes: [
      { type: 'feat', text: 'Buddy cover and Who\'s In are now iOS-style toggle switches (36×20 pill with a sliding knob) — purple track for buddy cover, teal for Who\'s In. Replaces the old "On / Off" pill button. Same hit area, more obviously a toggle, no text to read. ARIA role="switch" + aria-checked for screen readers' },
      { type: 'feat', text: 'Table now sorts by role rather than the four-bucket group. Uses the ROLES array order (GP Partner → Associate → Salaried GP → Registrar → Locum → ANP → Paramedic → Pharmacist → Physio → Practice Nurse → Nurse Associate → HCA → Medical Student → Admin) — practical seniority/specialty order rather than alphabetical. Within each role, sorted alphabetically by name. Needs-attention rows still float to the top. Effect: select all GP Partners → bulk-toggle "Buddy on" works without needing a filter, because they all cluster' },
      { type: 'feat', text: 'Removed the Group column entirely. Group (gp / nursing / allied / admin) is auto-derived from role via guessGroupFromRole and saved silently. Exposing it as a separate user-editable field let rows drift into states where role said "GP Partner" and group said "Admin" — meaningless inconsistency that confused later code. The DB column stays (used for filtering elsewhere) but the UI now treats it as derived data, not user input. Also removed "Set group" from the bulk actions toolbar for the same reason' },
    ]
  },
  {
    version: '4.8.4',
    date: '2026-05-18',
    title: 'Fix: "practice query param required" when saving in Quick Setup or wizard CSV step',
    changes: [
      { type: 'fix', text: 'QuickSetupTable and the wizard CSV step both POSTed to /api/v4/data with `?practiceId=…` but the API has expected `?practice=…` since it was built. The dashboard\'s saveData used the right param so its saves worked; these two newer callers used the wrong name. Every save returned 400 "practice query param required" — which surfaced as "Save failed" in Quick Setup and as the partial-save error in the wizard. Both now use `?practice=…` matching the API and every other caller. Side note: this is the actual underlying reason the role-assignment "doesn\'t persist on refresh" symptom kept returning across multiple rounds of guesses — the save was failing at the front door every time' },
    ]
  },
  {
    version: '4.8.3',
    date: '2026-05-18',
    title: 'Setup strip: optional sections no longer block auto-hide',
    changes: [
      { type: 'fix', text: 'The dashboard\'s completeness strip auto-hides when all sections are green, but I had it treating empty optional sections (TeamNet, demand history, team invites) as amber. That meant if a user chose not to invite colleagues or skip TeamNet sync, the strip stayed permanently amber and never went away — even though setup was effectively done from their perspective' },
      { type: 'fix', text: 'Optional sections (teamnet, demand, team) now default to complete=true with an `optional: true` flag. The hint text still suggests the value ("Optional — set sync URL to auto-import absences") for users who want to explore, but the strip no longer gates auto-hide on them. Required sections (details, clinicians) still show amber when missing data — the dashboard genuinely can\'t function without those' },
      { type: 'fix', text: 'Net effect: once your required setup is done, the dashboard\'s completeness strip disappears. The optional things remain visible as tab indicators on the practice management page if you want to revisit them later, but they don\'t nag from the main dashboard' },
    ]
  },
  {
    version: '4.8.2',
    date: '2026-05-18',
    title: 'Fix: "Save failed" toast caused by Vercel 4.5MB request size limit',
    changes: [
      { type: 'fix', text: 'The dashboard\'s save handler bundled the parsed huddle CSV data into every save POST to /api/v4/data. For practices with a substantial EMIS export (18k+ CSV lines covering multi-year date ranges), the parsed structure including slotRows and per-date breakdowns ran several megabytes. Vercel rejects serverless function request bodies over 4.5MB with FUNCTION_PAYLOAD_TOO_LARGE — the request never reached our code, the toast just said "Save failed" with no diagnostic info. This was the real cause of the "still getting save failed" reports' },
      { type: 'fix', text: 'Fix: huddleCsvData is now written directly from the browser to Supabase using the authenticated client session, bypassing Vercel entirely. RLS on huddle_csv_data ensures only practice admins can write. Audit row in csv_uploads goes via the same direct path. Vercel\'s function size limit no longer applies to this payload — Supabase\'s ceiling is 50MB for a JSONB value, well above anything a CSV could produce' },
      { type: 'fix', text: 'The save POST to /api/v4/data now ALWAYS strips huddleCsvData from its body. The server-side mutation 5 (huddle_csv_data upsert) stays in place for backward compatibility with anything else that might POST it, but the dashboard no longer routes the blob through it. Small fields (clinicians, weeklyRota, settings, etc.) continue going through the API where the server-side diff logic lives' },
      { type: 'fix', text: 'sendBeacon path (used on page unload to flush pending saves) now also strips huddleCsvData — sendBeacon hits the same 4.5MB limit and we can\'t await a direct Supabase upload during unload. If you navigate away with an unsaved CSV, it\'ll be re-sent on next dashboard load via the normal flush path' },
      { type: 'fix', text: 'Partial-save toast now shows the first error message from the response, not just the count. Helps with debugging when something goes wrong without needing to open DevTools' },
    ]
  },
  {
    version: '4.8.1',
    date: '2026-05-18',
    title: 'Fix: editing any field on a clinician nulled their initials',
    changes: [
      { type: 'fix', text: 'The safeInitials safety net introduced in v4.7.6 had a same-row collision bug: when a clinician already had initials in the database and you edited any other field on them (role, status, sessions, anything that triggered an UPDATE), the function saw the row\'s own existing initials in the "taken" set and treated them as a collision — returning null. The UPDATE then wrote initials=null, wiping them. Every edit silently stripped initials' },
      { type: 'fix', text: 'Symptom for the user: after a CSV upload that partially succeeded, clinicians appear with proper initials. Edit one\'s role — initials disappear. Edit another\'s status — initials disappear. Quick Setup\'s "needs attention" highlight then flags ever more rows, making it look like setup keeps failing while you\'re actually just losing data on every save' },
      { type: 'fix', text: 'Fix: the "taken" set now excludes ALL initials of rows in the current batch (not just rows where initials are about to change). Each row in the batch claims its initials freshly during processing. A row updating itself can\'t collide with its own past state, but cross-row collisions (two different rows wanting the same initials) still resolve correctly — first one wins, later collisions go to null' },
      { type: 'fix', text: 'Better server-side error logging: when an op fails, /api/v4/data now logs code + message + details + hint to the server console, and includes details/hint in the response error string. So if you see a "Save failed" toast, the actual Postgres reason ("duplicate key value violates unique constraint", "invalid input value for enum", etc.) comes through — no more terse one-liners that hide what really broke' },
    ]
  },
  {
    version: '4.8.0',
    date: '2026-05-18',
    title: 'Green/amber section indicators across the dashboard and practice management',
    changes: [
      { type: 'feat', text: 'New `lib/setup-status.js` — single source of truth for what "complete" means per section. `isMinimumSetupComplete()` checks postcode + list size + ≥1 clinician (the bare minimum to render a useful dashboard). `getSectionStatuses()` returns per-section state {complete, hint} for details / clinicians / teamnet / demand / team. Used by both the dashboard and the practice management page so the two views never disagree' },
      { type: 'feat', text: 'Practice management page (`/v4/practice/<slug>`): every tab now shows a small coloured dot in its label — green if that section is complete, amber if it needs attention. Each tab\'s content also has a 3px coloured stripe at the top with a hint line below ("Add a postcode", "4 clinicians need attention", etc.) so the user sees exactly what\'s missing without having to scroll' },
      { type: 'feat', text: 'Main dashboard (`/p/<slug>`): replaced the old generic "Finish practice setup" banner with a five-segment completeness strip. Each segment shows one section\'s state and is clickable — taps through to the corresponding tab on practice management. Hides itself entirely once every section is green, so it doesn\'t clutter a fully-configured dashboard' },
      { type: 'feat', text: 'Server-side auto-completion: when the dashboard loads with the minimum data present but `setup_completed_at` still null, the server marks it complete in the background (admin/owner only — read-only members don\'t trigger writes). Self-healing — a practice imported via SQL or pre-existing v3 data is auto-marked complete on first visit without any user action. Wizard\'s server component does the same, so the auto-mark fires whichever path the user takes' },
      { type: 'feat', text: 'Wizard receives an `autoCompleted` prop from the server so it doesn\'t fire a duplicate client-side write when the server has already marked things complete. Belt-and-braces: even if the prop is missed, the existing client-side latch (autoMarkedAt) ensures only one write happens per session' },
      { type: 'feat', text: 'TabStatusDot and SectionStatusStripe components live in `app/v4/_lib/SectionStatus.js` — pure SVG/divs with no hooks so they\'re safe to render from server components. Glow-shadow styling matches the existing dark glass look. ARIA labels included so screen readers announce "details complete" / "clinicians needs attention"' },
    ]
  },
  {
    version: '4.7.7',
    date: '2026-05-18',
    title: 'Wizard auto-completes when required steps are done + colour-coded step state',
    changes: [
      { type: 'feature', text: 'Setup now marks itself complete automatically. The moment all required steps have data (practice details and CSV upload), the system writes setup_completed_at = now() in the background. No explicit "Complete setup" click needed — the wizard knows when it\'s done. The user still controls when to navigate away via a "Go to dashboard" button so we don\'t auto-redirect mid-flight while they\'re still adding optional invites or demand data' },
      { type: 'feature', text: 'When auto-completion fires (from any step, not just the last one), a green confirmation banner appears: "✓ All set — you can head to your dashboard whenever you\'re ready" with an inline Go to dashboard button. Reinforces the achievement and gives the user a way out from wherever they are in the flow' },
      { type: 'feature', text: 'Each step card now has a colour-coded top border that tells you at a glance where you stand: green (4px) when the step has the data it needs, amber when the step is required but still empty, and a subtle dark line for optional steps you haven\'t touched yet. Matches the progress dots at the top but more prominent — the active step\'s state is the first thing you see' },
      { type: 'feature', text: 'Step header eyebrow ("STEP 3") now shows status badges: a green "✓ Done" pill once the step has the data it needs, or an amber "! Required" pill on required steps still missing info. Clear signals next to the existing "· optional" tag for non-essential steps' },
      { type: 'feature', text: 'The footer button on the last step is now "✓ Go to dashboard" instead of "Complete setup" — reflects what it actually does (navigation) rather than what it used to do (gate completion). Still disabled with "Complete required steps first" when required steps are outstanding' },
    ]
  },
  {
    version: '4.7.6',
    date: '2026-05-18',
    title: 'Fix: "Save failed" on CSV upload — initials collisions causing partial inserts',
    changes: [
      { type: 'fix', text: 'CSV upload in the wizard set every clinician\'s initials to a single letter — the first letter of their surname. With most practices having multiple staff sharing surname first letters (Balson/Banwell/Binding/Blackwell/Blythe all → "B"), the database\'s unique-initials-per-active-clinician index rejected most of the inserts. ~12-15 of 40 made it in; the rest got "duplicate key value violates unique constraint" errors. The API returned HTTP 207 (Multi-Status — some ops succeeded), the wizard treated that as success ("✓ Found 40 clinicians"), but the dashboard\'s save handler later surfaced the failures as "Save failed" / "Partial save: N errors". Cause and symptom were two layers apart' },
      { type: 'fix', text: 'Wizard now generates two-letter initials in the FirstSurname pattern ("Michelle Balson" → "MB", "BALSON, Michelle" → "MB" handling both "Surname, Forename" and "Forename Surname" CSV formats) and dedupes within the batch by appending a number ("MB", "MB2", "MB3") so all 40-something clinicians make it through without collisions. The user can pick more meaningful initials in Quick Setup afterwards' },
      { type: 'fix', text: 'API mutation 6 (clinicians) now has a server-side safety net: before INSERTing or UPDATEing, it scans the existing active clinicians\' initials and any pending changes in the same request. If a new row would collide with the active-uniqueness index, the request goes through with initials=null instead of failing. Quick Setup\'s "needs attention" highlight will then flag those rows for the user to fix. This catches edge cases the client-side dedup can\'t see — e.g. uploading additional CSVs later when some initials are already taken' },
      { type: 'fix', text: 'Wizard\'s CSV upload step now detects HTTP 207 properly and surfaces the actual errors (first three Postgres messages joined) rather than silently claiming success. Matches the pattern from v4.7.5 (Quick Setup save handler)' },
    ]
  },
  {
    version: '4.7.5',
    date: '2026-05-13',
    title: 'Clinicians tab: surface save errors, fix invalid status option',
    changes: [
      { type: 'fix', text: 'Quick Setup table\'s status dropdown listed "Long-term absent" as an option, but the Postgres clinician_status enum only allows active / left / administrative. Long-term-absent is modelled separately via a boolean on the clinician record (v3 had a longTermAbsent flag), not a status. Picking that value triggered a Postgres enum constraint violation on save — the row update failed silently. Removed it from the dropdown' },
      { type: 'fix', text: 'Save handler was treating HTTP 207 (Multi-Status — some ops succeeded, some failed) as success because res.ok is true for any 2xx code. The API returns 207 with an errors array whenever a partial save happens (constraint violations, FK errors, etc.) and the UI was happily showing "Saved" while the affected rows actually weren\'t. Now treats 207 as failure, surfaces the joined error messages from the response body so you can see what actually broke. Body.ok === false also triggers the error path even on a 200, in case the API ever returns that combination' },
      { type: 'fix', text: 'If you assigned a role and saw "Saved" then a refresh reverted it, this fix will surface the underlying Postgres error on the next attempt. Most likely candidates: a clinician with the bad longTermAbsent status still in the database (now refusing the round-trip), an initials-uniqueness collision, or a missing/invalid foreign key. The error text comes straight from Postgres so you\'ll see exactly which constraint fired' },
    ]
  },
  {
    version: '4.7.4',
    date: '2026-05-13',
    title: 'Fix: 500 error on practice management page after completing wizard',
    changes: [
      { type: 'fix', text: 'Clicking "Complete setup" in the wizard then landing on /v4/practice/<slug>?tab=details threw a 500 with "ReferenceError: tool is not defined". When I stripped the online consultation tool dropdown out of PracticeSetupForm in v4.7.0, I removed the useState hook for `tool` but missed two lingering references: the allRequired check (`name && postcode && listSize && tool`) and the prompt text ("Fill in name, postcode, list size and tool to mark complete"). Both now corrected — tool is no longer part of the completion gate or any user-facing text on this form. The wizard is the canonical setup flow now; this form is the manage view used after setup is done' },
    ]
  },
  {
    version: '4.7.3',
    date: '2026-05-04',
    title: 'Fix: ghost clinicians showing other people\'s appointments after CSV re-uploads',
    changes: [
      { type: 'fix', text: 'Bug: after uploading multiple CSVs over time, the dashboard could show ghost clinicians (people who\'d left the practice, or names from a previous CSV ordering) with appointment counts that actually belonged to whoever\'s now at that column position. User-visible symptom: "Dr John Jackson has appointments on 29 May" — but the CSV had no Jackson at all. The slot counts shown next to him were genuinely someone else\'s' },
      { type: 'fix', text: 'Root cause: mergeHuddleData stored per-date slot data keyed by CSV column index (e.g. dateData["29-May"]["am"][7] = {…}), but the saved clinicians array was the set union of every CSV ever uploaded — so old names stayed at their old positions. When a new CSV came in with different ordering (or with people who\'d left omitted), incoming slot data was stored at the NEW positions while the clinicians array still reflected the OLD positions. Display looked up `clinicians[7]` (got a ghost from a prior upload) and showed it next to whoever was at column 7 in the latest CSV. Position-vs-name aliasing — two parallel systems of record drifted apart silently on every merge' },
      { type: 'fix', text: 'Fix: mergeHuddleData now re-keys each source\'s per-date data from that source\'s own CSV indices to the merged-array indices using the clinician NAME as the bridge. After the merge, every stored index in dateData/bookedData/embargoedData/blockedData/locationData/splitSiteData/slotRows resolves to the correct merged clinician name. slotLocationData has no clinician idx in its path so it\'s passed through unchanged' },
      { type: 'fix', text: 'Self-heals on next CSV upload: any future-date (or within-3-days-recent) data will be correctly indexed against the new CSV. Locked old dates (>3 days in the past) that were saved with the pre-fix buggy alignment will stay misaligned — we can\'t recover the correct names because the stored indices reference a clinicians array that already had the drift baked in. But the user-actionable view (today onwards) corrects itself the moment they upload again' },
      { type: 'fix', text: 'Note: the same bug exists in v3 production (gpdash.net) — same lib/huddle.js file. If you want the fix on production for Winscombe, cherry-pick this commit (lib/huddle.js change only) onto main and bump v3 to v3.3.1' },
    ]
  },
  {
    version: '4.7.2',
    date: '2026-05-04',
    title: 'Fix: wizard redirect loop (wrong table name)',
    changes: [
      { type: 'fix', text: 'Wizard\'s membership-and-role check queried a non-existent table called practice_members. The real table is practice_users. Empty result was interpreted as "user is not a member" and redirected the owner to /v4/dashboard. From there, the dashboard\'s quality-of-life "exactly one practice + no pending invites" auto-redirect sent them to /p/<slug>, which saw setup_completed_at = null + user is owner and redirected back to the wizard. Closed three-step loop, browser bounced indefinitely. One-character fix: practice_members → practice_users' },
    ]
  },
  {
    version: '4.7.1',
    date: '2026-05-04',
    title: 'Fix: new practices were skipping the wizard',
    changes: [
      { type: 'fix', text: 'New practices created via the NHS practice picker were landing on the Today page instead of the wizard introduced in v4.7.0. Root cause: the create_practice_with_owner RPC had a leftover shortcut from before the wizard existed — if ODS + postcode + list size were all present in the create call (which they always are, since we look them up automatically), it auto-marked setup_completed_at = now() in the same INSERT. The wizard\'s server component then saw setup as complete and redirected straight through to /p/<slug>, which was exactly what the wizard was designed to prevent' },
      { type: 'fix', text: 'Migration 042 rewrites the RPC to always insert null for setup_completed_at. The wizard is now the single source of truth — only the explicit "Complete setup" click at the end of the wizard sets the timestamp' },
      { type: 'fix', text: 'For practices that already got auto-completed by the old RPC and are now stuck on the Today page: you can manually unset their setup_completed_at via Supabase SQL editor (UPDATE practices SET setup_completed_at = null WHERE id = \'…\') and they\'ll be bounced back into the wizard. Or delete the practice and start fresh' },
    ]
  },
  {
    version: '4.7.0',
    date: '2026-05-04',
    title: 'Guided practice setup wizard',
    changes: [
      { type: 'feature', text: 'New practice owners now land in a guided setup wizard at /v4/onboarding/setup/[id] instead of being dumped on the Today page with a half-empty dashboard. Walks through the five things they need to do on day one: practice details (postcode + list size, with postcodes.io region lookup), TeamNet calendar sync URL (with expandable "how to find this URL" instructions), EMIS appointment report (XML download + first CSV upload that auto-extracts the clinician list), demand history upload (optional), and team invites (optional, at the end so they can preview the product before committing). Required steps are gated for completion; optional ones have a Skip button' },
      { type: 'feature', text: 'Visual: full-screen dark gradient with subtle cyan radial glow behind the card, GPDash brand strip top-left, "Step N of 5" counter top-right. Progress indicator is connected dots — pulse animation on the current step, filled green with white checkmark when complete, slate grey when upcoming. Cards slide in from the right when you advance with a 320ms cubic-bezier ease. Step header has a small "STEP N" eyebrow in cyan caps, then a 32px Outfit title, then descriptive subtitle. Footer Back/Skip/Continue buttons. Auto-saves as you type with a "Your changes save automatically" reassurance at the bottom' },
      { type: 'feature', text: 'CSV upload in the wizard extracts clinicians client-side using the same TITLE_LIKE filter as v4.6.5 — so a CSV with names like "Smith, Jane (Mrs)" doesn\'t store "Mrs" as the role. Each clinician gets a guessed group from the role, surname-initial as a starting initial, default flags (active, can_provide_cover=true, show_whos_in=true), and the original CSV name as an alias. Success state shows "Found N clinicians" with a tick and a "Re-upload" option. Sets the EMIS step as complete; the user can review/fix roles/initials in the Clinicians tab once setup is done' },
      { type: 'feature', text: 'Setup is gated by setup_completed_at — only owners/admins can access the wizard; regular team members hitting /p/<slug> before setup is finished get a friendly "Setup in progress" holding page at /p/<slug>/setup-in-progress rather than the half-empty dashboard. Owners/admins arriving at /p/<slug> with setup_completed_at = null are bounced back to the wizard. Platform admins skip both gates (for support/debugging). Once the user clicks "Complete setup" on the final wizard screen, setup_completed_at gets timestamped and they\'re redirected to /p/<slug>' },
      { type: 'feature', text: 'Wizard resumes from where you left off — opens to the first step that\'s still incomplete according to the database. If you close the tab mid-wizard and come back, you start where you stopped. Forward navigation is always allowed so you can preview later steps; only the final "Complete setup" button is gated on required-step completion, and it lists what\'s still required with a click-to-jump shortcut' },
      { type: 'fix', text: 'Removed the online_consult_tool field from every UI surface — it wasn\'t actually used for any logic (the demand upload code always showed the AskMyGP flow regardless), and forcing it on every new practice was wasted setup friction. Stripped from PracticeSetupForm (the dropdown), admin practice detail page (the Row), /v4/practice/[id]/page.js (the prop chain), and DemandUpload (the dead conditional banner). Column is left in the database schema in case we revisit; we can drop it cleanly later once confident nothing references it' },
      { type: 'feature', text: 'DemandUpload now accepts an optional onUploadSuccess callback so the wizard can flip its "step done" indicator immediately after a successful upload without waiting for the router refresh. No-op for the practice management page which doesn\'t pass the prop' },
    ]
  },
  {
    version: '4.6.5',
    date: '2026-05-04',
    title: 'Quick Setup: bulk select, on/off buttons, no more "Mrs (custom)" roles',
    changes: [
      { type: 'fix', text: 'CSV upload was capturing titles (Mrs / Miss / Dr / etc) as roles when the CSV had names like "Smith, Jane (Mrs)". Quick Setup then showed "Mrs (custom)" in the role dropdown and required the user to fix every row by hand. New rule: parens that contain a known title-like word (mr/mrs/ms/miss/mx/dr/prof/rev/sir/dame/lord/lady) are now ignored — the role stays empty so the row flags as needs-attention and prompts a real choice from the dropdown' },
      { type: 'fix', text: 'Quick Setup dropdown no longer offers stale title-like roles as "(custom)" options for existing rows that have one stored. Showing "Mrs (custom)" was preserving bad data; now those values are treated as empty in the dropdown so the user has to pick a real role. The needs-attention banner explains why the row is flagged' },
      { type: 'feature', text: 'Buddy cover and Who\'s In are now per-row on/off toggle buttons instead of a single checkbox at the right edge. Bigger hit target, clearer state, colour-coded (purple for buddy cover matches the existing v3 visual language, teal for Who\'s In). Both columns visible at all times so you can scan team membership in both contexts at once' },
      { type: 'feature', text: 'Bulk select with checkbox at the start of every row + select-all checkbox in the header. Header checkbox respects the current filter — checking it selects only currently-visible rows, not hidden left/searched-out ones. Selected rows highlight cyan to distinguish from unselected' },
      { type: 'feature', text: 'Bulk actions toolbar appears at the top when 1+ rows selected, sticky to the top of the table area so it stays visible while scrolling: Set role / Set group / Set status dropdowns, plus Buddy on/off and Who\'s In on/off buttons. Each action applies to every selected row in one batch and auto-saves like any other edit. Action dropdowns reset to placeholder after each use so the same action can be repeated. Clear selection button on the right' },
      { type: 'feature', text: 'Removed the Title column from Quick Setup — title (Dr / Mrs / etc) is rarely useful for first-pass triage and was bloating the row. The data field still exists; Team Members on the practice dashboard remains the place to set it' },
      { type: 'feature', text: 'Removed the Sessions/wk column from Quick Setup — see context below for what it\'s used for' },
      { type: 'feature', text: 'Migration 041 adds clinicians.show_whos_in column (boolean, default true). Previously the showWhosIn flag was set on CSV upload but silently dropped on save in v4 because the column didn\'t exist. Now persisted properly. v4 → v3 adapter exposes it; mutation 6 reads/writes it; QuickSetupTable\'s Who\'s In toggle is the user-facing way to set it' },
    ]
  },
  {
    version: '4.6.4',
    date: '2026-05-04',
    title: 'Brand all v4 pages, add favicon, friendlier "token expired" message',
    changes: [
      { type: 'feature', text: 'Logo now appears on every v4 page. AuthCard (login, signup, verify, reset password, create practice) gets the inline logo + wordmark above its title. Dashboard, practice management, invite landing, and v3→v4 import pages get a new BrandHeader component near the top — clickable back to /v4 for switching context. Admin pages already had the logo via AdminNav. There is no longer any v4 page where the user could find themselves and not know they\'re in GPDash' },
      { type: 'feature', text: 'New favicon at app/icon.svg — Next.js auto-generates the browser tab icon from this SVG. Same 3×3 capacity-tile design as the wordmark logo, simplified for clarity at 16×16. Renders crisp on any DPI without needing PNG variants' },
      { type: 'feature', text: 'Browser tab title now uses a template: per-page metadata.title gets suffixed with " · GPDash" automatically (e.g. "Sign in · GPDash"). Pages without a title fall back to "GPDash — Practice Dashboard" as before' },
      { type: 'feature', text: 'New shared component app/v4/_lib/BrandHeader.js — server-component-safe, takes optional subtitle for context (e.g. "Practice management", "v3 → v4 import"). Used wherever a v4 page needs a quiet brand strip without monopolising the layout' },
      { type: 'fix', text: '"Token has expired or is invalid" error on the verify-code screen now shows a more useful message: explains that signing up multiple times or clicking Resend invalidates older codes, and only the most recent code from the inbox is valid. Previous error was technically correct but didn\'t tell the user what to do — they\'d assume the system was broken when usually they\'d just typed the wrong (older) code' },
    ]
  },
  {
    version: '4.6.3',
    date: '2026-05-04',
    title: 'Resend code button: explicit cooldown + emailRedirectTo + better errors',
    changes: [
      { type: 'fix', text: 'Resend code button on the signup verification screen wasn\'t reliably triggering a fresh email. Two issues: (1) the auth.resend call was missing options.emailRedirectTo, so Supabase fell back to the project Site URL without invite-aware ?next= context — magic link in the resent email pointed at the wrong place. (2) Supabase rate-limits resends to roughly one per 60 seconds per user; if the user clicked twice in quick succession, the second call returned a generic error and there was no UI affordance explaining why' },
      { type: 'fix', text: 'Resend now passes the same getSiteUrl()-based emailRedirectTo as the initial signup, so resent emails route through preview.gpdash.net (or production gpdash.net) instead of any transient Vercel URL' },
      { type: 'fix', text: 'Local cooldown: after a successful resend OR a rate-limit error from Supabase, the button disables for 60 seconds and the label changes to "Resend in Ns" with a live countdown. Prevents the user from rage-clicking the button three times in a panic when the email is already in flight. The countdown extracts the actual wait time from Supabase\'s error message ("you can only request this after N seconds") so it matches the server-side rule rather than guessing' },
      { type: 'fix', text: 'Error message during cooldown reads "Hold on — Supabase asks us to wait N seconds between resends" instead of the raw error string. Disambiguates "didn\'t send because we asked too fast" from "didn\'t send because something is broken"' },
    ]
  },
  {
    version: '4.6.2',
    date: '2026-05-04',
    title: 'Fix DEPLOYMENT_NOT_FOUND on email verify links — use stable site URL',
    changes: [
      { type: 'fix', text: '"Verify in browser" link in the signup verification email returned a Vercel 404 (DEPLOYMENT_NOT_FOUND) when clicked. Same issue affected password-reset emails and copy-link on Pending invites. Root cause: the signup code used window.location.origin to build the email\'s redirect URL, which on Vercel can be a transient per-deployment URL like gpdash-7xdj2-darrencox2.vercel.app. That URL stops resolving once newer deployments retire the old one — typically within minutes of each push' },
      { type: 'fix', text: 'New helper lib/site-url.js with getSiteUrl(): prefers NEXT_PUBLIC_SITE_URL env var (a stable alias like preview.gpdash.net or gpdash.net set in Vercel) and falls back to window.location.origin only when that\'s not configured. Wired into the four places that build email-bound links: signup emailRedirectTo, public reset-password page redirectTo, admin PasswordResetButton redirectTo, and PendingInvitesCard\'s copy-link URL' },
      { type: 'fix', text: 'NEXT_PUBLIC_SITE_URL needs to be set in Vercel project settings (Settings → Environment Variables) for each environment: v4-rebuild branch → https://preview.gpdash.net, main branch → https://gpdash.net (when ready). Without it set, the fallback (window.location.origin) is used and the DEPLOYMENT_NOT_FOUND issue can recur on per-deployment URLs' },
      { type: 'fix', text: 'window.location.origin retained for in-browser uses where it\'s correct: HuddleFullscreen second-screen popup (opens the same tab/origin, not an email link), navigation between routes. Only the email/copy-link bound URLs were changed' },
    ]
  },
  {
    version: '4.6.1',
    date: '2026-05-04',
    title: 'Auto-emailed invites + tick/cross confirm in bulk invite modal',
    changes: [
      { type: 'feature', text: 'Bulk-invite modal review stage now uses tick/cross indicators per parsed email instead of remove-only X buttons. Each row is clickable to toggle (whole-row hit area), unticked rows dim to 45% opacity, and the Send button shows the count of ticked rows ("Send 7 invites & emails"). "Select all / Select none" quick actions for inverting selection on long pastes. The X button still removes a row entirely from the list (separate concept: removed = gone, unticked = visible but skipped)' },
      { type: 'feature', text: 'New Supabase Edge Function send-invite-email (Deno runtime) sends a GPDash-themed email automatically whenever a practice_invites row is inserted. Triggered by a database webhook on INSERT, so it catches single invites, bulk invites, and any future invite path without further code changes. Function looks up practice name + inviter name via service-role client, composes HTML, calls Resend API directly. Decoupled from invite creation: the RPC returns instantly, the email sends moments later in the background' },
      { type: 'feature', text: 'Invite email design follows the same visual language as the auth email templates from v4.6.0: light card on slate background, GPDash 3x3 capacity-tile logo header, system fonts, cyan CTA button, table-based layout for Outlook compatibility. Includes practice name, inviter name, role label ("an Owner" / "an Admin" / "a User"), accept-invitation button, fallback URL for clients that strip buttons, and expiration line ("expires in N days"). HTML-escapes all user-controlled text to prevent injection from practice names or display names with quirky characters' },
      { type: 'feature', text: 'Done-stage copy in the bulk invite modal now reads "Invite emails are being sent in the background. If a recipient doesn\'t receive theirs, you can copy their link from the Pending invites list and forward it manually." — replaces the old "emails aren\'t sent automatically yet" stopgap. Manual copy still works as a fallback if email delivery fails' },
      { type: 'feature', text: 'Setup is one-time, documented in docs/email-automation.md: deploy the edge function via Supabase CLI (`supabase functions deploy send-invite-email --no-verify-jwt`), set RESEND_API_KEY + SITE_URL + FROM_EMAIL + FROM_NAME secrets in Edge Function settings, create a database webhook on practice_invites INSERT pointing to the function. Once that\'s done, every new invite triggers an email automatically without further intervention' },
    ]
  },
  {
    version: '4.6.0',
    date: '2026-05-04',
    title: 'Quick setup — single-row clinician table integrated into practice setup',
    changes: [
      { type: 'feature', text: 'New "Clinicians" tab on /v4/practice/[id] for fast first-pass team setup. Single row per clinician with title, initials, role, group, sessions/wk, status and buddy-cover all editable inline. No card expansion, no modal, no save button — edits update local state immediately and auto-save 800ms after the last change. Replaces the click-into-card workflow that turned 30-clinician setup into hundreds of clicks' },
      { type: 'feature', text: 'Auto-save lifecycle: edit → state updates → save indicator shows "Saving in a moment…" → 800ms debounce → "Saving…" → "All changes saved" (or error with Retry button). Single-flight: in-flight saves don\'t race; new edits queue a fresh debounce after the current save settles. Whole clinicians array is sent to /api/v4/data POST which diffs server-side and only writes changed rows' },
      { type: 'feature', text: '"Needs attention" highlighting: rows are flagged amber when essential fields are missing — empty initials, or a placeholder role like "Staff" / "Unknown" / blank. Sorts those rows to the top so the user knows where to start. Highlighting clears as soon as the row is fixed. A summary banner at the top shows the total attention-needed count' },
      { type: 'feature', text: 'Smart defaults: changing role auto-derives group via guessGroupFromRole (GP Partner → gp, Practice Nurse → nursing, Pharmacist → allied, etc.) so users don\'t have to keep them in sync. They can still override the group manually if the auto-guess is wrong for their setup' },
      { type: 'feature', text: 'New banner on /p/[slug] for admins/owners: "Review your team — N clinicians need a role and initials" with "Quick setup →" button linking straight to the new tab. Appears whenever there are clinicians needing attention; disappears as the user works through them. Most likely to fire right after a CSV upload when a fresh practice has lots of CSV-discovered names with no initials and generic roles' },
      { type: 'feature', text: 'Search box for filtering by name/role/initials. "Show left" toggle to include staff who have left the practice (hidden by default). Sticky name column on horizontal scroll so wide tables still keep context on narrow screens' },
      { type: 'feature', text: 'Read-only display of CSV-derived custom roles: if a clinician has a role outside the standard 14-option list (e.g. discovered from a parenthetical "(Specialist Nurse)" in the CSV), it\'s preserved as a "(custom)" option in the dropdown rather than being silently overwritten when the user touches the field' },
      { type: 'feature', text: 'Tab is admin-only — same permission gate as Buddy cover, Demand model, and Activity tabs. Users without admin/owner role on the practice don\'t see it. The dashboard "Quick setup" banner is also gated by canEditPracticeData' },
    ]
  },
  {
    version: '4.5.61',
    date: '2026-05-04',
    title: 'Auto-generate weekly working patterns on first CSV upload',
    changes: [
      { type: 'feature', text: 'First CSV upload to a fresh practice now automatically infers weekly working patterns for every clinician with CSV activity. Previously this required clicking "Auto-generate" on the Team → Rota page after manually toggling buddyCover=true for each person — heavy lifting before you could even see the rota. New flow: upload CSV → patterns are inferred from the last 12 weeks of appointment history → buddyCover flipped on for everyone the algorithm successfully matched → rota grid populated and visible immediately' },
      { type: 'feature', text: 'Algorithm logic extracted from components/buddy/TeamRota.js into lib/auto-rota.js as a pure function (inferWeeklyRota). Manual "Auto-generate" button still works exactly as before — same behaviour, same output. The lib accepts an includeOnlyBuddyCover flag so the manual button uses the historic filter (buddyCover=true only) and the auto-on-upload uses the permissive filter (every active, non-administrative clinician). Same matching engine in both paths: name match first, initials fallback with ambiguity guard (refuses to match if same initials map to multiple distinct CSV names)' },
      { type: 'feature', text: 'Only fires on FIRST upload — detected by checking if the existing weeklyRota has any entries. Once you have a curated rota, subsequent uploads leave it alone. If you want to reset and re-baseline, clear all rota cells and the next upload will re-infer' },
      { type: 'feature', text: 'Toast on first upload now reads "Report uploaded — X new staff discovered, working patterns inferred for Y. Review on Team → Rota." Subsequent uploads keep the existing terse toast. Audit log entry includes both newStaffCount and inferredPatterns so the activity log shows what happened' },
    ]
  },
  {
    version: '4.5.60',
    date: '2026-05-04',
    title: 'Verification code input accepts 6-10 digits',
    changes: [
      { type: 'fix', text: 'Verification code input was capped at 6 digits but Supabase sends 6-10 depending on the project\'s Auth → Providers → Email → Email OTP Length setting (default 6, often configured higher). Long codes simply couldn\'t be typed in. Input now accepts up to 10 digits, submit button enables once at least 6 are entered. Placeholder reads "6 to 10 digits" instead of "000000". verifyOtp does the actual length validation' },
    ]
  },
  {
    version: '4.5.59',
    date: '2026-05-04',
    title: 'Email verification with 6-digit code + postcode auto-fill + invite-aware redirects',
    changes: [
      { type: 'feature', text: 'Sign-up email verification switched from "click the magic link" to "enter the 6-digit code". Magic links break when the email opens in a different browser/tab/device than the one the user signed up in (very common on mobile, especially when the signup started from an invite landing page that gets lost). The code stays on the same tab — user types it back in, supabase.auth.verifyOtp confirms email + returns a session in one go' },
      { type: 'feature', text: 'Verification stage UI: large monospaced 6-digit input with auto-strip of non-digits (so paste-with-spaces works), inputMode=numeric so phones show the digit pad, autoComplete=one-time-code so iOS suggests the code straight from the SMS/email notification when available. Resend button + "Use a different email" if they typed the wrong address. Auto-focus on the code field' },
      { type: 'feature', text: 'Magic-link in the same email still works as a fallback — emailRedirectTo is set to /auth/callback?next= so users who click the link instead of typing the code also land in the right place. Both paths go through the same redirect flow' },
      { type: 'feature', text: 'Login + signup pages now read ?email= and ?next= query params. Email pre-fills the form (editable — invitee can use a different email if they want, the invite landing page handles wrong-email warnings). next= determines where to redirect after successful login / verification, defaulting to /v4/dashboard. Wired into the invite landing page so signing up from an invite link returns to the invite page to accept it, instead of dumping the user on the dashboard' },
      { type: 'feature', text: 'Cross-links between login ↔ signup preserve the query params, so bouncing between the two pages keeps the invite context. ("Already have an account? Sign in" link from signup carries email and next forward)' },
      { type: 'feature', text: 'Practice creation now auto-fills the postcode from the ODS code via the existing /api/v4/lookup-practice-postcode endpoint (OpenPrescribing → lat/lng → postcodes.io reverse-geocode). Runs in parallel with the duplicate check on practice selection. Confirm card shows "✓ Postcode: BS25 1AA" when found, "Looking up postcode…" while in flight. Result is passed to create_practice_with_owner so the new practice has its postcode set from day one — the setup wizard won\'t need to ask. Best-effort: if lookup fails, postcode stays null and setup wizard asks like before' },
      { type: 'fix', text: 'NOTE: For the verification email to actually arrive, two Supabase project settings need configuring (one-time, in Supabase dashboard). 1) Auth → Settings → SMTP: configure a real email provider (Resend recommended, free 3000/month, SPF+DKIM via DNS). Built-in email is rate-limited to 3-4/hour project-wide and aggressively spam-filtered. 2) Auth → Email Templates → "Confirm signup": template must include {{ .Token }} so the 6-digit code reaches the user. Default template only has the magic link, which the new code-based flow doesn\'t use as the primary path' },
    ]
  },
  {
    version: '4.5.58',
    date: '2026-05-04',
    title: 'Fix delete-practice trigger collision + Open/Manage as buttons',
    changes: [
      { type: 'fix', text: 'Deleting a practice from /v4/admin/practices/[id] failed with "Cannot remove or demote the last owner of a practice. Promote another member to owner first." This was the prevent_last_owner_removal trigger (migration 014) firing on every member-row delete during the cascade — including the owner\'s row, which by definition has no other owner remaining. The integrity protection is correct in normal flows (remove member, demote member, leave practice) but wrong here: the parent practice itself is being deleted, so "owner-less practice" isn\'t a state that can persist' },
      { type: 'fix', text: 'Migration 040 fixes this with a transaction-local bypass. admin_delete_practice now sets a custom GUC gpdash.bypass_last_owner_check=on at the top of its body via set_config(name, value, is_local=true). The trigger reads the GUC and skips the check when it\'s on. Scope: SET LOCAL is automatically reverted at COMMIT/ROLLBACK so the bypass cannot leak between transactions, and admin_delete_practice has its own platform-admin gate so no other code path can flip it. The trigger continues to fire normally on remove_practice_member, leave_practice, transfer_ownership, and any raw SQL — those paths get the same protection they had before' },
      { type: 'feature', text: 'Open / Manage on the platform admin practices list are now proper buttons — primary cyan-filled button for "Open →" (the more frequent action) and subtle outlined button for "Manage" (the secondary action). Same treatment for "Open →" on the users list. Replaces the bare cyan link styling that was easy to miss and felt unfinished' },
    ]
  },
  {
    version: '4.5.57',
    date: '2026-05-04',
    title: 'Platform admin UI polish: logo, bigger fonts, better contrast',
    changes: [
      { type: 'feature', text: 'AdminNav now leads with the actual GPDash logo (the gauge+bars SVG + wordmark), an "⚡ Platform admin" pill in cyan, and a 30px Outfit heading. Replaces the previous tiny eyebrow text + bare title. The section now feels like a deliberate part of the product rather than an internal-tools afterthought' },
      { type: 'feature', text: 'Subtitle paragraph added under the heading: "Platform-level oversight: every practice, every user, every NHS data import. For day-to-day work in a single practice, click Open on its row." Sets context for first-time visitors who landed here by accident' },
      { type: 'feature', text: 'Font-size sweep across all admin pages. Table headers 11→12px (uppercase 0.6 letterspacing, 600 weight). Table cells 13→14px. Stat labels 10-11→12px with 600 weight. Stat values 20-24→24-28px. Filter chips 12→13px. Tab labels 13→14px. Page headings 18→22-30px depending on level. Search input + buttons 13→14px' },
      { type: 'feature', text: 'Contrast lifted on tertiary text: many spots that were #64748b on dark gradient (very low contrast — borderline failing readability for long admin sessions) bumped to #94a3b8 or #cbd5e1 where they\'re actual content. #64748b kept only for genuinely tertiary/decorative metadata' },
      { type: 'feature', text: 'Page footer added to every admin page: hairline border, "GPDash · Platform admin" on the left, contextual link or "Only platform admins see this section" on the right. Gives the page a sense of completeness instead of just trailing off after the table' },
      { type: 'feature', text: 'Container max-width bumped 900→980 / 1100→1180 so the tables aren\'t artificially squeezed. Bottom padding bumped to 64px so footer doesn\'t sit at the viewport edge. Card padding 20→22px. Card margin-bottom 16→18px' },
      { type: 'feature', text: 'Status badges (Suspended, Platform admin, Orphan, Email unconfirmed) bumped 11→12px with 600 weight where appropriate. More legible at a glance' },
      { type: 'feature', text: '"Back to my practices" link in the top-right got a proper button look (border + background + 7×14 padding) instead of being a tiny bare link. Now actually looks tappable' },
    ]
  },
  {
    version: '4.5.56',
    date: '2026-05-04',
    title: '"I\'m not a clinician" option for non-clinical practice members',
    changes: [
      { type: 'feature', text: 'Not every member of a practice is or wants to be a clinician — practice managers, reception staff, IT support, finance all have legitimate reasons to be members. Until now they were guilt-tripped with an amber "⚠ Not linked to a clinician" warning on the Users tab and a "Is this you?" banner on the dashboard. Both now have an "I\'m not a clinician here" option that suppresses the prompts permanently' },
      { type: 'feature', text: 'New marked_non_clinical flag stored per-membership on practice_users (per-practice, not per-profile, since the same person could be clinical at one practice and non-clinical at another). Defaults to false so existing data behaves identically. Tooltip + comment in DB explain what it means' },
      { type: 'feature', text: 'Three-state status per member row on the Users tab: (a) Linked to a clinician → slate "Linked to X", (b) Marked non-clinical → slate "Non-clinical" with no warning, (c) Neither → amber "Not linked" with action button — "I\'m not a clinician" if it\'s your own row, "Mark non-clinical" if you\'re an owner/admin viewing someone else, just the warning if you\'re a regular user. Self can always toggle their own flag; owner/admin can toggle anyone else\'s' },
      { type: 'feature', text: 'Stats strip updated: "Unlinked" now only counts unlinked-and-not-marked-non-clinical (previously over-counted — non-clinical staff legitimately won\'t ever link). New "Non-clinical" stat appears alongside when applicable' },
      { type: 'feature', text: '"Is this you?" banner on /p/[slug] dashboard now has a permanent "I\'m not a clinician" button next to the "Yes, I\'m X" claim buttons. Distinct from the × dismiss which is still session-local. Once marked, the banner stays away — across sessions, devices, refreshes' },
      { type: 'feature', text: 'Account settings ("Sidebar → Account → Your clinician record") gets a third state: when marked non-clinical, shows "You\'re marked as non-clinical at this practice" with an "I am clinical" undo button. When unlinked-and-not-marked, the picker now has an "or — I\'m not a clinician here" option alongside the link button' },
      { type: 'fix', text: 'set_member_non_clinical_flag refuses to mark someone non-clinical if they have a linked clinician record on this practice. Prevents inconsistent state where someone is both linked AND marked non-clinical. Unlink first, then mark. Audited as user_role_changed with details.flag=non_clinical so the membership change timeline shows it' },
      { type: 'fix', text: 'Migration 039: adds practice_users.marked_non_clinical column, set_member_non_clinical_flag RPC, and DROP-then-CREATE list_practice_members to surface the new field (TABLE return shape changed). _v4 data layer reads markedNonClinical from the user\'s membership row so client components can branch on it' },
    ]
  },
  {
    version: '4.5.55',
    date: '2026-05-04',
    title: 'Practice Users tab Push C: leave practice + transfer ownership + audit',
    changes: [
      { type: 'feature', text: 'Leave Practice button on the YOU row. Calls leave_practice RPC, redirects to dashboard on success. Distinct from the Remove button — Remove is "remove someone else", Leave is "remove myself". Two narrow RPCs are easier to reason about than one with branching permissions' },
      { type: 'feature', text: 'Last-owner protection: if the only owner tries to leave, the button stays visible but disabled with tooltip "You are the last owner. Transfer ownership to someone else first." Server-side check enforces this regardless. The path is: Transfer ownership → demote self to admin → Leave' },
      { type: 'feature', text: 'Transfer Ownership card (owner-only, distinct from member list to stay discoverable without cluttering). Modal lists every other member, owner picks one, types "transfer" to confirm — friction proportional to irreversibility — and we atomically promote target to owner + demote caller to admin in a single RPC. Empty state if there are no other members yet ("invite someone first, then come back")' },
      { type: 'feature', text: 'Recent membership changes card at the bottom of the Users tab. Calls list_practice_membership_changes RPC, renders the last 50 audit events related to membership: invites sent, invites accepted, invites revoked, role changes, removals. Each row shows the actor name + relative time ("3h ago", "2d ago"). All members can see this — answers questions like "did I change Sarah\'s role or did someone else?" and "when did Tom join?" without diving into the full audit log on Details. Show first 8, "Show all 50" expands' },
      { type: 'fix', text: 'Migration 038 wires log_audit_event() into all the membership RPCs that were silent before: set_practice_member_role + remove_practice_member (from migration 036), revoke_practice_invite + bulk_invite_users (from migration 037), and the two new ones (leave_practice, transfer_practice_ownership). transfer emits TWO events — one for the promotion, one for the caller\'s demotion — so the timeline shows both legs of the swap. set_practice_member_role no longer pollutes the audit when the new role equals the existing one (early return)' },
      { type: 'fix', text: 'Migration 038 uses the actual audit_event_type enum values (user_invited, invite_accepted, invite_revoked, user_role_changed, user_removed) — earlier draft had member_added/member_removed which don\'t exist in the enum and would have failed at filter time' },
    ]
  },
  {
    version: '4.5.54',
    date: '2026-05-04',
    title: 'Practice Users tab Push B: invite link, revoke, bulk invite, accept page',
    changes: [
      { type: 'feature', text: 'Practice invite emails aren\'t auto-sent yet (Resend etc. not wired up), so invites previously had no working delivery mechanism — invitees had no way to know they\'d been invited unless told out-of-band. Pending invites list now has a "Copy link" button per row that generates the invite URL (https://your-domain/v4/invite/<id>) for the admin to forward via Slack, text, or whatever channel they\'re already on. Closes a critical functional gap' },
      { type: 'feature', text: 'New /v4/invite/[id] acceptance landing page. Reads the invite summary anonymously (public_get_invite_summary RPC, granted to anon — UUID is the bearer token) and renders the right state: missing → 404 message, revoked / expired / accepted → explanation, signed out → "sign in with X" prompt with sign-in/sign-up links pre-filled with the invited email and a next= redirect, signed in with WRONG email → warning, signed in with RIGHT email → "Accept" button. Calls existing accept_invite RPC' },
      { type: 'feature', text: 'Revoke button per pending invite. Calls new revoke_practice_invite RPC (sets revoked_at = now()). Confirms with browser dialog. Permission: owner/admin of the practice that issued the invite (or platform admin)' },
      { type: 'feature', text: 'Bulk invite. New "+ Bulk invite" button next to the single-invite form opens a modal: paste anything (Outlook contact list, comma-separated, line-separated, "Name <email>" pairs, mixed) → click Parse → see extracted list with a role dropdown per row (default User, can adjust each, can remove rows) → click "Send N invites" → server-side bulk_invite_users_to_practice RPC processes each row and returns a summary. Per-row outcomes: created / skipped (already a member) / skipped (already invited) / error (invalid email or role)' },
      { type: 'feature', text: 'New lib/parse-emails.js — pragmatic email extraction from messy text. Handles named entries first ("John Smith <john@example.com>" or quoted variants) capturing display names where available, then falls through to bare-email regex for anything else. Deduplicates by lower-cased email. Returns { email, displayName? } objects in first-seen order' },
      { type: 'feature', text: 'Bulk RPC capped at 100 invitees per batch — sensible upper bound that prevents pathological input from blocking the connection. Per-row failures don\'t abort the batch, they go into the result array with a status and message' },
      { type: 'fix', text: 'Migration 037: revoke_practice_invite, bulk_invite_users_to_practice, public_get_invite_summary RPCs. The summary RPC granted to anon AND authenticated since the landing page may be hit by a not-yet-signed-in user; bearer-token gated by the invite UUID (128 bits of entropy)' },
    ]
  },
  {
    version: '4.5.53',
    date: '2026-05-04',
    title: 'Practice Users tab Push A: stats, role badges, member actions',
    changes: [
      { type: 'feature', text: 'Practice Users tab redesigned. Stats strip at the top: total members, owners, admins, users, pending invites, and "Unlinked" (members who haven\'t linked themselves to a clinician record yet — their personal rota is empty until they do). Quick orientation' },
      { type: 'feature', text: 'Differentiated role badges: Owner = amber, Admin = cyan, User = slate. Previously all three were the same indigo so you couldn\'t see hierarchy at a glance' },
      { type: 'feature', text: '"YOU" badge and subtle background tint on the current user\'s row. Useful for finding yourself in long member lists' },
      { type: 'feature', text: 'Linked clinician shown per row: "Linked to Dr Smith" or amber "⚠ Not linked to a clinician" warning. Previously the data was loaded but never surfaced — now owners can see at a glance which members signed up but never finished onboarding' },
      { type: 'feature', text: 'Inline role dropdown — owners and admins can change a member\'s role in place (no edit-and-save). Saves immediately on selection. Owners can promote anyone to anything; admins can\'t touch owners and can\'t promote to owner' },
      { type: 'feature', text: 'Remove button per row, with a confirm dialog explaining "their personal data is preserved on their account, but they\'ll lose access to this practice". Same permission rules as role change. Self-row never shows actions (use Leave Practice in Push C, coming next)' },
      { type: 'feature', text: 'Last-owner protection at the DB layer: set_practice_member_role refuses to demote the last remaining owner (enforced in PG with a count + raise exception). Same for remove_practice_member as defence-in-depth even though self-remove is also blocked' },
      { type: 'fix', text: 'Migration 036 adds set_practice_member_role and remove_practice_member RPCs. Both check the caller\'s role on the practice (via new caller_practice_role helper) and apply the rules above. Platform admins bypass via existing admin_*_membership RPCs from migration 014. list_practice_members extended to include linked_clinician_id + linked_clinician_name (DROP-then-CREATE pattern since TABLE return shape changed — applying the lesson from earlier migration breakage)' },
    ]
  },
  {
    version: '4.5.52',
    date: '2026-05-04',
    title: 'Fix: migration failures from CREATE OR REPLACE return-type changes',
    changes: [
      { type: 'fix', text: 'Migrations 032 (admin_notes) and 033 (suspension) both used CREATE OR REPLACE FUNCTION on admin_list_users while changing its TABLE return shape (adding new columns). Postgres rejects this with "cannot change return type of existing function" — CREATE OR REPLACE can change the body but not the signature. The first failure rolled back its entire transaction (including the column adds), so subsequent migrations that depended on those columns also failed. Cascade halted the whole migration run' },
      { type: 'fix', text: 'Fixed both migrations in-place to DROP FUNCTION IF EXISTS before CREATE. Failed migrations aren\'t recorded in the migration tracker, so the runner re-attempts them with the new content on the next push. Migrations 022 also drops every prior variant of admin_update_user_profile explicitly to avoid PostgREST ambiguous-overload resolution when multiple signatures coexist (variant has been growing each time we add a new optional arg)' },
      { type: 'feature', text: 'Lesson: any TABLE-returning function whose columns might evolve gets DROP-then-CREATE from the start. Same for any function that gains optional args — drop the prior variant or PostgREST may pick the wrong overload silently' },
    ]
  },
  {
    version: '4.5.51',
    date: '2026-05-04',
    title: 'User management Push C: impersonation',
    changes: [
      { type: 'feature', text: '"Sign in as this user" capability for platform admins. Click on a user\'s detail page → modal asks for a reason (required) → backend records an impersonation_sessions row, generates a magic link via the Supabase admin API, sets an HttpOnly cookie containing the session ID, signs the admin out, redirects to the magic link → admin lands signed in as the target. A red "Impersonation" banner appears at the top of every page showing target email + admin email + reason, with an "End impersonation" button that signs the target session out and clears the cookie' },
      { type: 'feature', text: 'Refusal cases: cannot impersonate yourself, cannot impersonate suspended users (would bypass the suspension), cannot impersonate other platform admins (lateral privilege flow). All enforced server-side; client UI also shows the disabled reason' },
      { type: 'feature', text: 'Sessions are time-limited to 1 hour. The admin_check_impersonation RPC enforces "caller IS the target" so even a stolen cookie value can\'t be used to verify a banner on another user\'s session. Banner uses server-side cookie validation on every render — no client-side trust' },
      { type: 'feature', text: 'New admin_list_impersonation_sessions RPC for a future audit screen — returns recent sessions with admin/target emails, IP, reason, started/ended/expires timestamps. Platform-admin only' },
      { type: 'fix', text: 'Migration 035 creates impersonation_sessions table with RLS (platform admins read all; target users read their own — needed for the banner-check RPC). Indexes on (admin_user_id, started_at desc), (target_user_id, started_at desc), and (expires_at) where ended_at is null. End-after-start check constraint' },
      { type: 'fix', text: 'ImpersonationBanner is a server component placed in the root layout, so it appears on every page — v4 admin, practice app, public buddy page, anywhere the cookie is valid. Returns null silently when no impersonation is active' },
    ]
  },
  {
    version: '4.5.50',
    date: '2026-05-04',
    title: 'User management Push B: activity timeline + suspend',
    changes: [
      { type: 'feature', text: 'New "Recent activity" card on the user detail page surfaces a unified timeline of audit_events (CSV uploads, settings changes, member adds/removes, invites) AND auth_events (signups, sign-ins, password resets, failed logins) for that user across every practice they belong to. Cross-practice support view that previously required opening each practice\'s audit log separately. Limited to 100 most recent events; older entries still in the underlying tables. Each event shows icon, description, time-ago, practice (where applicable), and the raw event_type for debugging' },
      { type: 'feature', text: 'New admin_get_user_activity RPC unions audit_events + auth_events filtered by user_id, returns sorted JSON. Both source tables already have (user_id, occurred_at desc) indexes so this is fast even at scale' },
      { type: 'feature', text: 'Suspend / unsuspend on the user detail page. Suspending blocks sign-in via Supabase\'s auth.users.banned_until (set through the admin API for ~100 years; reversible at any time) AND records metadata (suspended_at, suspended_reason) on profiles for the admin UI to display the date and reason. Less drastic than delete: data is preserved, fully reversible. Useful for compliance holds, complaint investigations, or temporary cooling-off periods' },
      { type: 'feature', text: 'Suspend route refuses to suspend self or the last platform admin (lockout protection). On metadata-write failure the auth ban is rolled back so the two layers don\'t drift out of sync' },
      { type: 'feature', text: 'Suspended users get an amber "Suspended" badge in the user list, header of the detail page, and a new "Suspended" filter chip + stat tile. Suspended rows in the list are subtly dimmed and tinted amber. Suspension takes precedence over Platform-admin / Orphan badges in the role column since it\'s the more important state' },
      { type: 'feature', text: 'Migration 033 adds suspended_at + suspended_reason columns to profiles, surfaces them in admin_get_user, adds is_suspended to admin_list_users. Migration 034 adds the admin_get_user_activity RPC' },
    ]
  },
  {
    version: '4.5.49',
    date: '2026-05-04',
    title: 'User management: stats, filters, sort, copy-clipboard, sign-in links, admin notes',
    changes: [
      { type: 'feature', text: 'Platform admin user list now has a stats row at the top — total users, active in last 30 days, never signed in, email unconfirmed, platform admins, and orphans (users with no practice memberships who aren\'t platform admins, i.e. signups that didn\'t finish onboarding)' },
      { type: 'feature', text: 'Filter chips above the user table: All / Active (30d) / Dormant / Never signed in / Email unconfirmed / Platform admins / Orphans. Replaces "scan the whole list manually to find users who never finished onboarding" with one click. Server-side search (?q=) preserved as before' },
      { type: 'feature', text: 'Sortable columns on the user table — click any column header to sort. Active column shown in white with arrow indicator. Nulls always sort last regardless of direction so "never signed in" doesn\'t dominate the top when sorting by last sign-in' },
      { type: 'feature', text: 'Orphan users get an amber row tint plus a small "Orphan" badge. Quick visual cue without requiring the filter to be active. Definition: zero practice memberships AND not a platform admin' },
      { type: 'feature', text: 'Copy-to-clipboard buttons next to email and user ID on the detail page. Triple-clicking and cursing now optional. Fallback to execCommand for older browsers / insecure origins' },
      { type: 'feature', text: 'New "Sign-in & email links" card on the user detail page — generates a Supabase auth action_link (signup confirmation for unconfirmed accounts, magic link otherwise) for the platform admin to copy and forward to the user via whatever channel they\'re already on (text, Slack, etc.). Useful for users stuck on email_unconfirmed where the auto-email never arrived. Goes via /api/v4/admin/generate-link which uses the service-role admin client; route gated by platform-admin check' },
      { type: 'feature', text: 'Admin notes field on user profile — internal-only freeform text, only visible/editable by platform admins. Use it to capture context that would otherwise live in your head: "Called about ODS code", "Wants trial extension; circle back end of month", "Filed complaint — see Slack thread". Survives staff turnover and helps support continuity' },
      { type: 'fix', text: 'Migration 032 adds the admin_notes column on profiles and extends both admin_get_user (returns admin_notes) and admin_update_user_profile (accepts new_admin_notes) RPCs. admin_list_users also extended to surface email_confirmed_at (used by the Email-unconfirmed filter and the per-row badge) and a has_admin_notes boolean (cheaper than fetching the whole text for a list view)' },
    ]
  },
  {
    version: '4.5.48',
    date: '2026-05-04',
    title: 'Practice URL editor: live availability check + redirect after save',
    changes: [
      { type: 'fix', text: 'Saving a new practice URL slug landed the user on a 404. The /v4/practice/[id] route accepts both UUID and slug for [id], so when the URL was the slug-form and the slug changed, the page tried to refresh against the OLD slug — which no longer matches anything in the DB. Save now navigates to /v4/practice/<new-slug> with the existing query string preserved (router.replace, not router.refresh)' },
      { type: 'feature', text: 'Live "is this URL free?" check on the slug editor. Debounced 300ms after typing stops; shows "✓ Available", "✕ Already taken", "Checking…", or hides itself if the slug is invalid or unchanged. Save button blocked when the live check says taken — no more learning that fact only after clicking Save' },
      { type: 'feature', text: 'New check_slug_available SQL RPC. Bypasses RLS deliberately (security definer) — without it, a direct query for "is X taken?" would return false even when some other practice (one the user isn\'t a member of) has that slug. Mirror of the check_practice_exists_by_ods pattern from a few pushes back. Excludes the practice\'s own ID so saving without changing the slug doesn\'t flag itself as a conflict' },
    ]
  },
  {
    version: '4.5.47',
    date: '2026-05-04',
    title: 'Fix: create_practice_with_owner not generating slug (NOT NULL violation)',
    changes: [
      { type: 'fix', text: 'Second bug from my v4.5.44 migration — create_practice_with_owner inserted into practices without populating the slug column, but slug is NOT NULL with a unique index and a format check (lowercase a-z, 0-9, dashes; 1-50 chars). Inserts failed with "null value in column slug violates not-null constraint" once the duplicate-check ambiguity was fixed and execution reached the actual INSERT. Migration 030 adds a generate_unique_practice_slug() helper that derives a slug from the practice name (same transform as the original migration 012 backfill), truncates to 50 chars, and appends -2, -3, etc. on collision. create_practice_with_owner calls it before INSERT' },
      { type: 'feature', text: 'generate_unique_practice_slug() exposed as a standalone helper RPC so future code (e.g. admin practice rename → match slug) can reuse the same logic instead of reinventing it. Cap of 50 collision attempts before falling back to a UUID-based placeholder slug' },
    ]
  },
  {
    version: '4.5.46',
    date: '2026-05-04',
    title: 'Fix: ambiguous ods_code reference in create_practice_with_owner',
    changes: [
      { type: 'fix', text: 'Bug introduced in v4.5.44 — the duplicate-check WHERE clause inside create_practice_with_owner had "where upper(ods_code) = upper(trim(create_practice_with_owner.ods_code))". The left side\'s "ods_code" matched both the function parameter AND the column on practices, making it ambiguous. The right side was qualified, the left side wasn\'t. Function-body ambiguities aren\'t caught at CREATE time so the migration applied silently — the error only fired when an actual create-practice call hit the duplicate check. Fixed by qualifying the column reference (p.ods_code) and qualifying every parameter reference too for consistency. Migration 029 replaces the function with the corrected body, signature unchanged so existing JS callers still work' },
    ]
  },
  {
    version: '4.5.45',
    date: '2026-05-04',
    title: 'Practice search: PCN/ICB disambiguation + show owner name on duplicate',
    changes: [
      { type: 'feature', text: 'Practice search results now show the PCN (and ICB if PCN is missing) under each practice name. Disambiguates between practices that share a name — e.g. multiple "Horizon Health Centre"s across the country. Data comes from nhs_oc_baseline which we already have in the DB; the lookup API enriches each search result via a single bulk query joined with the existing list-size lookup' },
      { type: 'feature', text: 'When trying to create a practice that\'s already on GPDash, the duplicate message now names the original owner so the user knows exactly who to ask for an invite ("Ask Darren Cox to invite you" instead of "Ask whoever set it up"). The check_practice_exists_by_ods RPC was extended to join practice_users + profiles for the first owner by joined_at. Owner email is NOT exposed — display name only — so this isn\'t a meaningful new attack surface (practice owners are typically GPs whose names already appear on practice websites and CQC listings)' },
      { type: 'feature', text: 'Confirm card on the create-practice flow also shows PCN / ICB above the ODS line so the user double-checks they picked the right one before creating' },
    ]
  },
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
