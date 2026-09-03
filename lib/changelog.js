// The last 30 releases. Everything older lives in lib/changelog-archive.js,
// which the app loads only when someone asks to see it, so the release
// history is not shipped to every browser on every visit. Prepend new
// entries here as before; when this list grows past about 40, move the
// oldest into the archive (newest first there too).
export const CHANGELOG = [
  {
    version: '4.165.1',
    date: '2026-09-04',
    title: 'The email signature card is hosted here now',
    changes: [
      { type: 'feature', text: 'The signature card is served from www.gpdash.net/signature.png, so an email signature can link to it rather than attach a copy to every message that goes out' },
      { type: 'improvement', text: 'That single file is the only thing on the site permitted to load cross origin. Every response we send carries a resource policy of same origin, which is exactly what a browser based mail client would use to refuse to render the image, so this one path opts out and everything else keeps the strict setting. The header is emitted once rather than twice, because the site wide rule now excludes this path instead of relying on override order. It is also cached for a year, the URL being fixed' },
    ]
  },
  {
    version: '4.165.0',
    date: '2026-09-04',
    title: 'Two people can edit at once without one of them losing the work',
    changes: [
      { type: 'feature', text: 'Saving a structural change now takes an optimistic lock. Every practice carries a version number; the browser holds the one it loaded and hands it back when it saves, and a save whose version has moved on is refused with an explanation rather than applied. Until now the second of two people editing the same practice silently overwrote the first, with no error and nothing on screen to say a change had just been undone' },
      { type: 'improvement', text: 'The lock covers structural saves only, which is the rota, the clinician list, absences, settings and closed days. In and Out toggles, rota notes and buddy allocations still take the fast path, because those write one key at a time and last-write-wins is the behaviour you actually want on a shared board. A refused save keeps your edits on screen and adopts the other version, so repeating the action deliberately goes through' },
      { type: 'fix', text: 'Forty seven database functions could be called without signing in, including the ones that delete a user and delete a practice. Every migration locked its functions down by revoking from PUBLIC, but Supabase grants execute directly to the anonymous role, which a revoke from PUBLIC does not touch, so the lockdown line had never done anything. Nothing was exploitable, because each function checks the caller itself and those checks are what has been holding the line, but there was no second layer behind them. There is now' },
      { type: 'fix', text: 'The demand history summary view ran as its owner and so ignored row level security. It groups by practice with no filter of its own, so any signed in user who dropped the practice filter the app happens to send could read row counts, date ranges and upload times for every practice on the platform. It now honours the same policy as the table underneath it' },
      { type: 'fix', text: 'Recurring meeting dates were generated one day early through British Summer Time. A weekly Wednesday schedule produced Tuesdays from late March to late October and then corrected itself at the October clock change, because the date was formatted by converting local midnight to UTC first. This is why a series could appear to move mid run' },
      { type: 'fix', text: 'A practice user who was not linked to any clinician could edit a rota note that had no clinician attached, because two undefined values compared as equal. Both sides must now actually exist' },
      { type: 'improvement', text: 'Six trigger functions now pin their search path, and the linter finally reports on our own code. It was returning ninety eight errors from the build output directory because nothing was ignored, which buried the real warnings so thoroughly that nobody read them. Those warnings are now all resolved: seventeen were memo dependencies rebuilt on every render, which meant the memo below never memoised anything, and the rest are either fixed or carry a written reason for staying as they are' },
      { type: 'improvement', text: 'Roughly a hundred and twenty new unit tests over the parts that had none: role permissions, retention policy, the huddle CSV retention window, the calendar feed, recurring meeting dates, rate limit buckets, setup completion and the shared API input guards. Two of the bugs above were found by writing them. There is also a new SQL script in supabase tests that proves the anonymous role cannot reach the privileged functions, to be run after any migration that adds a function or a view' },
    ]
  },
  {
    version: '4.164.0',
    date: '2026-09-03',
    title: 'Light mode rebuilt: the dark theme measured onto a light ground',
    changes: [
      { type: 'feature', text: 'Light mode is now Clear, and it is the dark theme translated rather than inverted. The page is a cool grey blue, cards are white, and depth runs the same direction it does in dark: whatever is in front is lighter. Paper is gone. Dark remains the default and is unchanged' },
      { type: 'feature', text: 'The sidebar stays dark in light mode. It reads from its own set of colours that do not flip with the theme, so the half of the screen you navigate by never glares and the app still looks like itself. That is the thing that makes this a translation rather than a flip' },
      { type: 'fix', text: 'The four capacity state chips on capacity planning were unreadable in light. Their colours were hardcoded to the dark palette, pale text on a fifth of a tint, with no light values and no theme branch, so chips that run at 7.5 to 1 on the dark page were sitting at 1.4 to 1 on a cream card. They now carry a value per theme and clear 5.5 to 1' },
      { type: 'fix', text: 'About 880 colours across 145 files were written as literal hex codes chosen for a dark page, which is why light mode kept producing pale text on pale backgrounds. Every one that is drawn as text now reads a token that has a value in both themes. The dark value behind each token is exactly the hex it replaced, so dark renders unchanged' },
      { type: 'fix', text: 'Tailwind palette classes had the same problem as the slate ones fixed in v4.153.0. Amber, red, emerald, cyan, purple, indigo, violet, blue and sky at their 200 to 400 weights are tints picked against a dark page and had no light value at all, so amber 300 sat at 1.3 to 1 on a white card. The 600 weights were barely better at 3.2 to 1' },
      { type: 'fix', text: 'White was being used as an ink as well as a fill. On a saturated chip that is correct in either theme, but as a heading colour it was white on a white card. Headings now use a token that is white in dark and near black in light, and white on coloured fills is untouched' },
      { type: 'improvement', text: 'The colour fingerprint on panel headers is calmer. A light header carried its hue at 52 per cent plus two radial gradients plus a coloured glow, against 18 per cent fading to nothing in dark, so the two themes did not read as one design. It is now a flat 12 per cent band with a hairline beneath it' },
      { type: 'improvement', text: 'The quiet end of the text ramp exists again. Faint and mute were both the same grey in light, so the quietest tier had nothing below it to be quieter than. There are three distinct steps now and every one clears the readability floor on every surface in the theme, including the deepest inset' },
      { type: 'fix', text: 'Pages using the shared shell, which is practice settings, the setup wizard and the whole platform admin area, had the dark page colour written into them directly, so in light mode they stayed dark with light mode text on top' },
      { type: 'fix', text: 'The GP in the logo vanished in light mode, because it read the ink that flips while sitting on a sidebar that does not' },
      { type: 'note', text: 'Verified against real practice data on every dashboard screen in both themes: no text on any screen now falls below the 4.5 to 1 contrast floor in light mode. Auth pages, the public buddy board and the loading screens keep their own dark colours on purpose and were left alone' },
    ]
  },
  {
    version: '4.163.0',
    date: '2026-09-02',
    title: 'Buddy cover on a phone, and the app keeps working when the wifi drops',
    changes: [
      { type: 'feature', text: 'On a phone, Buddy cover shows one day at a time: a row of day chips, then that day at full width, instead of five columns squeezed into a sideways scroll with Wednesday cut in half. The week ahead on the morning briefing wraps to two columns on a narrow screen' },
      { type: 'feature', text: 'If the surgery wifi drops, the app still opens and shows the last copy it saw, with an amber line saying when that copy was saved and that changes will not save until the connection is back. It always asks the live server first, so a new release is never hidden behind an old copy; the saved copy is used only when the live request fails' },
      { type: 'note', text: 'A change made while offline is refused with a clear message rather than quietly lost' },
    ]
  },
  {
    version: '4.162.0',
    date: '2026-09-02',
    title: 'Reporting opens on last week',
    changes: [
      { type: 'feature', text: 'The reporting page now opens on the numbers that matter for the most recent finished week, against the week before: fill rate, urgent slots offered, routine slots offered, how evenly duty was shared, and the busiest day. Each is signed, up or down, coloured by whether that is good news, and each tile opens the report behind it with everything already set. The catalogue of reports sits underneath as before' },
      { type: 'note', text: 'The digest is built from the same facts every report uses, so a tile and the chart behind it cannot disagree. It picks the most recent week that has actually finished, so the future weeks the export covers do not make the fill rate look empty' },
    ]
  },
  {
    version: '4.161.0',
    date: '2026-09-02',
    title: 'The locum review queue is one row per person per week',
    changes: [
      { type: 'improvement', text: 'The review queue used to list every session outside a pattern on its own line, each ending in the same sentence, twenty seven of them on a busy month. It now shows one row per clinician per week: how many sessions were outside their pattern, the week total against their usual, and whether that reads as paid extras or swaps. Decide the whole week with one click, or open the row to decide session by session. Every decision is still recorded and undone individually' },
      { type: 'tweak', text: 'The rule the queue applies is stated once in the header rather than under every row' },
    ]
  },
  {
    version: '4.160.0',
    date: '2026-09-02',
    title: 'Every screen is rendered in the test suite before it ships',
    changes: [
      { type: 'improvement', text: 'The test suite now draws every dashboard section, fourteen of them, with an invented practice of ten clinicians across three sites, and fails the build if any screen throws or comes out without the words it should carry. The bugs that have bitten this app were wiring bugs, a helper that no longer existed, a prop that changed shape, which a test over the maths alone can never see. This catches them in three seconds, with no browser and no database' },
    ]
  },
  {
    version: '4.159.0',
    date: '2026-09-02',
    title: 'Jump anywhere with the keyboard, and a lighter changelog',
    changes: [
      { type: 'feature', text: 'Press Cmd K, or Ctrl K on Windows, and type where you want to be: a section, a clinician for their rota, a date for the Today page such as next tuesday or 14 sep, or week 3 for the weekly capacity view. Arrow keys move, Enter goes, Escape closes' },
      { type: 'feature', text: 'The square brackets step through time. On Today, [ and ] move a day back and forward; on Buddy cover they move a week. Neither fires while you are typing in a box. Press ? anywhere for the list of shortcuts' },
      { type: 'improvement', text: 'When the app has changed since you last opened it, one line at the bottom says what is new. The full changelog is still under the sidebar menu' },
      { type: 'improvement', text: 'The changelog no longer ships every release ever to every browser. The last thirty travel with the app; the other four hundred load only when someone asks to see them. Half a megabyte less on every visit' },
    ]
  },
  {
    version: '4.158.0',
    date: '2026-09-02',
    title: 'No more browser pop-ups',
    changes: [
      { type: 'improvement', text: 'Every remaining browser prompt, alert and confirm box is gone. The weekly routine target, a new room type and a wind-down end date are set in a proper dialog with a labelled field, validation that says what is wrong, and Escape to cancel. Marking swaps as not extras, filling sessions from EMIS history and undoing a wind-down ask in the same dialog the rest of the app uses' },
      { type: 'tweak', text: 'Copying a buddy week that still has days without cover now says so in a toast rather than a browser alert' },
    ]
  },
  {
    version: '4.157.1',
    date: '2026-09-02',
    title: 'Unsubscribe links worked everywhere except when clicked',
    changes: [
      { type: 'fix', text: 'Every unsubscribe link said it was no longer valid, whatever the token. The lookup that finds which scheduled email a token belongs to was handing the database a list where it needed text, which the column rejected outright, and the rejection came back looking exactly like no match found. So a perfectly good link reported itself as expired. Caught by clicking one on the live site rather than by any test, because the fault was in how the query was phrased rather than in any of the logic around it' },
      { type: 'note', text: 'The phrasing now lives in one named, tested place, so it cannot be tidied back into a list by someone who reasonably assumes a list is the natural thing to pass' },
    ]
  },
  {
    version: '4.157.0',
    date: '2026-09-02',
    title: 'Stop sending this to me',
    changes: [
      { type: 'feature', text: 'Every scheduled report email now ends with a Stop sending this to me link. It works without a GPDash login, which matters because the people most likely to use it are the ones who have no account, such as a PCN or ICB contact on a practice report' },
      { type: 'feature', text: 'The link opens a page that names what they are about to stop, who sends it and how often, and changes nothing until a button is pressed. Two choices: stop this particular email, or stop every report email from that practice. Stopping everything is remembered permanently rather than just removing them from todays schedules, so adding the address to a new schedule next month does not quietly start it up again' },
      { type: 'feature', text: 'Whoever created the schedule gets an email saying who opted out, which report they left, whether it was this one email or all of them, and whether the schedule has stopped as a result. It says no action is needed. The point is that the recipient list cannot change without the person who built it knowing' },
      { type: 'feature', text: 'A schedule whose last recipient leaves switches itself off and records why, and the setup screen shows that reason. An active schedule that can never send anything is a lie, and the alternative was one that woke every fifteen minutes to do nothing' },
      { type: 'feature', text: 'People who have opted out stay on the list in the setup screen, struck through, with the date they left. Watching a recipient list silently shrink tells an admin nothing. They cannot be re-added by an admin either, because that would let the practice undo somebody elses unsubscribe' },
      { type: 'feature', text: 'Misclicked in a footer? The confirmation page keeps an Undo on screen afterwards, which puts them back and restarts a schedule that had switched itself off. Without it the only way back is emailing the practice and asking, which most people would not do' },
      { type: 'improvement', text: 'Gmail and Outlook now show their own Unsubscribe button at the top of the message, using the standard mail headers for it. That is better for the reader than hunting for a footer link, and it is what mail providers look for when deciding whether a sender is legitimate' },
      { type: 'improvement', text: 'Report emails now go out as one message per person rather than one message addressed to everybody. That is what makes each unsubscribe link belong to a single recipient, and it also means people on a schedule can no longer see each other addresses in the To line' },
      { type: 'improvement', text: 'A send that reaches some recipients but not others is now reported as failed with the count, rather than as a success. Four out of five delivered is not a healthy Monday' },
      { type: 'note', text: 'The unsubscribe link acts only on a button press, never on being opened. Mail scanners and corporate link checkers follow links in emails on their own, and a link that acted on being fetched would let a scanner silently unsubscribe people who never clicked anything' },
      { type: 'note', text: 'No email address ever appears in an unsubscribe link. The link carries a single opaque token, so nobody personal details end up in server logs, proxies or browser history, and a token can only ever remove the one person it was issued to' },
      { type: 'fix', text: 'A report comparing one person against the group quoted a different benchmark in the sentence above the chart than the one the chart itself drew. The chart marks fair share, which is the pooled figure across everyone, while the sentence used the plain average of the individual percentages. Both were correct arithmetic for different questions, but they sat inches apart with nothing to tell them apart, so a report could say 20.4% overall and 18.1% average in the same breath and look broken. The sentence now uses the same fair share the chart draws' },
      { type: 'note', text: 'The two figures diverge whenever people work different amounts. Three duty sessions out of ten and eleven out of thirty two are each one row, but only one of them is a tenth of the practice workload, so averaging the row percentages counts a part time week the same as a full one. Fair share is the honest benchmark for whether work is evenly spread: if it were shared in proportion to sessions worked, everyone would sit exactly on it' },
      { type: 'note', text: '17 new tests, 303 total' },
    ]
  },
  {
    version: '4.156.0',
    date: '2026-09-02',
    title: 'A calmer look: solid surfaces, colour that means something, and a quieter sidebar',
    changes: [
      { type: 'improvement', text: 'Dark mode is built from solid surfaces now rather than white at a few percent over navy. A card is lighter than the page and an inset is lighter than the card, so depth does the work that faint hairlines were failing to do and panels have a front and a back' },
      { type: 'improvement', text: 'Colour is reserved for meaning. Sidebar icons are one ink, lit only on the row you are on, and the active row is the accent. The big numbers on Today are ink unless they carry a state, and the demand gauge is one colour, the state at the needle, instead of a rainbow. The four capacity states, short, tight, on target and over, are now the only colours that speak' },
      { type: 'improvement', text: 'Quantities are set in DM Sans with tabular figures, so columns still line up and size and weight carry hierarchy again. Space Mono is kept for codes: initials, versions, absence codes and clock times. Small structural labels like AM, PM and the month headers moved out of mono into small caps' },
      { type: 'improvement', text: 'The week ahead on the morning briefing draws urgent slots against expected requests as a bar in the state colour, the same mark the week view uses. The gap is the empty part of the bar. Capacity planning keeps its tiles, whose colours are useful at that scale' },
      { type: 'improvement', text: 'Weeks with no export collapse into one sentence that says how far the export reaches, which weeks are missing and what fixes it, instead of fifteen boxes saying No data. My rota stops writing No data in every future cell, and Buddy cover says nothing allocated yet in words rather than with a clipboard' },
      { type: 'improvement', text: 'Dark mode gets the light theme fingerprint: each panel header carries its own hue at low strength, fading across the band, so the two themes read as one design at two lightnesses. Amber and pink are held lower because those hues also mean warning and danger elsewhere' },
      { type: 'improvement', text: 'The sidebar is narrower and quieter. Section names are small caps without rules either side, and the footer is one row: practice, your role, and a menu that holds theme, text size, My account, the changelog with its version number, and collapse. Those are set once a year, not once a day' },
      { type: 'improvement', text: 'Light mode is now Paper: a warm off white page, cream cards, near black ink and the same four states one step darker. It suits a bright room at eight in the morning. Dark stays for the huddle screen' },
    ]
  },
  {
    version: '4.155.0',
    date: '2026-09-02',
    title: 'Monthly and weekly are places in the sidebar now',
    changes: [
      { type: 'feature', text: 'Capacity planning has Monthly and Weekly beneath it in the sidebar. Which view you want is a place you go to, not a setting on the page, and the sidebar is where the app says where you are' },
      { type: 'tweak', text: 'The 6 weeks and Week detail buttons in the page header are gone, since the sidebar now does that job' },
      { type: 'tweak', text: 'Clicking a week in the monthly grid still jumps straight to that week, and it now moves the sidebar with it so the nav never disagrees with the page. Switching between the two views no longer reloads the page, so it remembers which week you were looking at' },
    ]
  },
  {
    version: '4.154.0',
    date: '2026-09-02',
    title: 'Send reports to people every week without opening GPDash',
    changes: [
      { type: 'feature', text: 'Saved reports can now be emailed on a schedule. Open a saved report, click Email on a schedule, and pick how often, at what time and who gets it. Daily, weekly, every two weeks, a date each month, or a weekday each month such as the second Wednesday. The schedule follows the saved report rather than freezing a copy, so when you improve the report the people it goes to get the better version without anyone re-doing the setup' },
      { type: 'feature', text: 'One email can carry several reports. Add as many saved reports as you like to a single schedule and drag them into the order you want, and they arrive as one digest with a contents list at the top and a titled section with its own chart for each. So a practice gets one Monday email rather than four landing at once. Every schedule for the practice is listed when you open the dialog, and any that does not yet include the report you are looking at says so, which makes adding this report to the Monday email you already have a single click' },
      { type: 'feature', text: 'The setup screen shows the real email next to the controls, not a mockup. It is rendered by the same code the server sends, from the same figures the charts on screen were drawn from, and it redraws as you change the settings, including as you add reports or reorder them. There is a Desktop and Phone width so you can see what lands on a phone at eight in the morning' },
      { type: 'feature', text: 'The chart leads the email. It is drawn as coloured table cells rather than a picture, because Gmail strips vector graphics and both Gmail and Outlook block remote images until the reader asks for them, which would leave the main thing invisible when the email is first opened. Bars, stacked bars and the colour scale all match what the report shows on screen, including reports where a high number is the bad one and the scale is inverted' },
      { type: 'feature', text: 'The full figures ride along as CSV attachments, one per report, named after it. The chart trims to a chosen number of rows and says so when it does. The CSVs are produced by the same code as the CSV button in the report builder, so the file you download and the file that arrives cannot disagree' },
      { type: 'feature', text: 'Recipients can be picked from your practice in one click, or typed in for anyone else. Anyone who is not a member of your practice is marked amber with a plain warning that they will receive practice appointment data including named clinicians, and that every send is recorded. That covers emailing a PCN or ICB contact without pretending it carries no risk' },
      { type: 'feature', text: 'Send test to me runs the whole real path, bundle and all, and delivers only to you. It does not use up the next scheduled run and does not touch the delivery history. If the test arrives and looks right, the Monday send will too' },
      { type: 'feature', text: 'Every schedule reports whether it actually sent. Each one shows Sent, Skipped or Failed against its last run with the reason, the same way pending invites started reporting delivery in v4.139.0. A send that quietly failed must never look like one that arrived' },
      { type: 'improvement', text: 'Reports with no data, or a practice whose appointment CSV has not been uploaded for a while, are handled honestly. A report that matches nothing explains why in its own section rather than blanking it or quietly dropping it from the email, the reports either side of it still render, and data more than three days old carries a note saying how old it is, so a stalled upload gets noticed rather than quietly producing confident wrong numbers' },
      { type: 'note', text: 'Deleting a saved report removes it from every scheduled email that carried it, rather than leaving a schedule pointing at something that is no longer there. A schedule whose reports have all been deleted is skipped with that recorded as the reason' },
      { type: 'note', text: 'The timing runs on UK wall clock all year. Eight in the morning stays eight in the morning through the March and October clock changes, which is two different times in UTC, and the awkward hours that either do not exist or happen twice on those two Sundays are both covered by tests' },
      { type: 'note', text: 'The schedule clock runs inside the database rather than on Vercel, because the Vercel plan only allows two scheduled jobs a day and one is already taken by the nightly data cleanup, which cannot express a Monday morning. The wake-up checks whether anything is due before doing anything else, so almost every one of them costs nothing' },
      { type: 'note', text: 'The report chart colours, the CSV rows and the what stands out sentence now come from one place shared by the screen and the email, replacing three copies that had been kept in step by hand. 41 new tests, 287 total' },
    ]
  },
  {
    version: '4.153.1',
    date: '2026-09-01',
    title: 'The staff filter remembers where you left it',
    changes: [
      { type: 'fix', text: 'The staff filter on the capacity week view forgot your choice the moment you left the page, so it reset to the configured groups every visit. It now saves, and each screen keeps its own choice: the roles you want on the week view are not the roles you want on staff changes' },
      { type: 'tweak', text: 'Both filters now share one piece of code for remembering, so they cannot drift apart again. A saved role that has since been renamed or retired is dropped rather than filtering everyone out, because a stale preference should never look like nobody works here' },
    ]
  },
  {
    version: '4.153.0',
    date: '2026-09-01',
    title: 'Light mode you can actually read, and names on one line',
    changes: [
      { type: 'fix', text: 'Three colour tokens had never been given light values, so they kept their dark ones on a near white page. The worst was the one small print uses everywhere: 209 places across 45 files were drawing captions at 2.2 to 1 against the background, which is roughly half the readable minimum. Links on the signed out pages were worse still at 1.7 to 1. Both now clear the accessibility floor, which lifts every page in light mode, not just the ones listed below' },
      { type: 'fix', text: 'The capacity planning week view was close to unusable in light mode. Names, site labels, session headers and the duty badge were all drawn in pale colours meant for a dark page, so they were white on white. Everything in it now reads from the theme and flips properly' },
      { type: 'fix', text: 'Staff changes had the same problem in a milder form: the initials column was pure white and therefore invisible, and the chart drew its joins, leavers, absences and session changes in pale tints that washed out. The event colours are now one shared vocabulary that darkens for light mode and is unchanged in dark' },
      { type: 'tweak', text: 'Names in the week view fit on one line again. Ten session columns leave about 110 pixels, and no readable font size fits a long double barrelled name in that, so the long ones now give up their forename and show as B Okonkwo rather than wrapping. Short names are untouched and the detail strip always shows the name in full' },
      { type: 'tweak', text: 'The week grid gave up a little padding and a narrower label column so every column gained about eight pixels of name' },
    ]
  },
  {
    version: '4.152.0',
    date: '2026-09-01',
    title: 'The grid shows the change, and the week fits the page',
    changes: [
      { type: 'fix', text: 'A sessions change in the staff changes grid shows the change again, not the new total. A GP going up by two now reads +2 rather than 6, which was being read as the whole of that persons week. A join still names the level it starts at, because starting on six is a fact about the person rather than a move' },
      { type: 'tweak', text: 'The week view no longer scrolls sideways. The clinician detail has moved from a column on the right to a strip just above the grid, which hands the ten session columns back the 250px they were losing, so Friday PM is on screen at any width' },
      { type: 'tweak', text: 'The detail strip reads across rather than down: day, session and site, then the person, then their slot types as counted chips, then what is bookable. Same information, none of the height' },
    ]
  },
  {
    version: '4.151.0',
    date: '2026-09-01',
    title: 'Week view: a detail panel that is always there, and names you can read',
    changes: [
      { type: 'feature', text: 'The clinician detail now has its own column to the right of the week, always present. Point at any name and it fills with the actual slot types that person is running that session, named and counted, coloured by whether each type is on your urgent list, your routine list, or neither. It keeps the last person you pointed at rather than emptying the moment the pointer drifts, which is what made the floating version feel unreliable' },
      { type: 'fix', text: 'The duty doctor is back at the top of the session. Sorting by who is offering had pushed them down among everyone else, and duty is the first thing anyone looks for' },
      { type: 'tweak', text: 'Names are bigger and wrap rather than being cut off, so Alice Blackwell keeps her surname. The taller rows had the space for it' },
      { type: 'tweak', text: 'Each site is marked by a full height strip of its own colour down the left rather than a small dot, which was doing almost nothing to tie a row to its site' },
      { type: 'fix', text: 'Removed a line that claimed the staff filter was counting beyond the roles the minimums were set for. It was guessing: the stored setting is a group, not a list of roles, so it could not know' },
    ]
  },
  {
    version: '4.150.0',
    date: '2026-09-01',
    title: 'One staff filter for the whole site, and a week view that uses its space',
    changes: [
      { type: 'feature', text: 'There is now one staff filter, and it works the same way everywhere. Three screens had grown three different answers to show me only some of the team: staff changes filtered by job title, the week view by four coarse groups, and the report builder carried its own private copy of the dropdown. Every role on the register is selectable in all of them, so GP Registrar but not Medical Student is now something you can actually ask for, which the four groups could never express. The groups survive as one click presets, which is what they were good at' },
      { type: 'tweak', text: 'The week grid was a thin strip across the top of a tall page. Rows now claim a real height, which also gives the name lists room to breathe' },
      { type: 'improvement', text: 'Clinicians with no bookable slots now sit at the bottom of their session, under a divider, rather than mixed in among the people who are working. They are also properly faint and struck through: the old dimming was a shade of grey away from normal text and easy to miss entirely' },
      { type: 'feature', text: 'Hovering a name gives a proper panel beside the column showing exactly what they are doing, urgent, routine and everything else. Somebody who is here but offering nothing bookable says so, and says that their slots are types the urgent and routine lists do not cover, which is usually the real explanation' },
    ]
  },
  {
    version: '4.149.0',
    date: '2026-09-01',
    title: 'Week detail reads session by session, and stops shouting',
    changes: [
      { type: 'feature', text: 'The week now reads left to right the way it is worked: Monday morning, Monday afternoon, Tuesday morning and on across. Sessions used to be stacked inside a day, which made a day a variable height block and buried the session, and the session is the thing that is actually staffed, covered and short' },
      { type: 'feature', text: 'A staff filter. It starts on whoever site staffing is configured to count, so the view opens agreeing with the minimums, and widening it to include nursing or HCAs says so, since the minimums were set for the original group' },
      { type: 'feature', text: 'The duty doctor is marked with a purple box rather than a star, matching the accent the rest of the site uses' },
      { type: 'improvement', text: 'Site minimums are shown against each site in the grid. They were only reachable by turning on the site staffing layer, which the week view is already showing you, and the button to edit them was hidden behind that same toggle. It is available directly in this view now' },
      { type: 'fix', text: 'The header said 6-week forward view while you were looking at a single week. It names the view you are actually in' },
      { type: 'tweak', text: 'The week view is a lot calmer. The red banner listing every session below minimum is gone, because each short session already carries a red bar and its shortfall in the grid and the banner was the same alarm a second time, louder. The five insight cards and the per clinician capacity breakdown underneath are hidden here too: they answer a six week question, and shown alongside the week the page read as a wall' },
      { type: 'tweak', text: 'A closed day is one statement across its sessions rather than the same dash repeated in every column, and evening columns only appear in weeks that actually use them' },
    ]
  },
  {
    version: '4.148.0',
    date: '2026-09-01',
    title: 'The capacity chart gets a proper axis, and its hover box stops sitting on the line',
    changes: [
      { type: 'fix', text: 'Hovering a month no longer covers the graph. The detail box used to float over the plot, hiding the very line it was describing. It now appears in the panel to the left of the chart, which is the charts own reading space, so nothing is obscured. The month you are pointing at is tinted so you can still see which one you are reading' },
      { type: 'improvement', text: 'The left axis is now a real axis. It sits outside the plot rather than being painted over it, and it marks every two sessions instead of every five, so a change of one or two can actually be measured against it. Three gridlines on a thirteen session year was not enough to read anything off' },
      { type: 'improvement', text: 'The axis says what it is counting. Sessions a week, or per 1,000 patients, is now stated above the staff group split rather than appearing only on the label at the end of the line' },
      { type: 'tweak', text: 'The hover detail lists the date of each change within the month, so two people moving a week apart read as two dated entries rather than one lump' },
    ]
  },
  {
    version: '4.147.0',
    date: '2026-09-01',
    title: 'Third sweep: the wind down buttons stop crashing, and removals get surgical',
    changes: [
      { type: 'fix', text: 'The buddy boards wind down buttons have thrown an error on every use since v4.111. They called a helper that was described in that versions notes but never actually written, so applying, undoing or adjusting a wind down saved its data and then crashed, leaving the dialog stuck open and an error on screen. The live error log led straight to it. The calls are gone; saving is, and always was, what persisted the change' },
      { type: 'fix', text: 'Removing a leave or long absence now removes exactly the cover it created. Removal matched on the start date alone, at both ends, so a holiday booked from the same day as someones wind down would have been deleted along with it. Every absence write now also matches the end date, and the removal checks the row actually looks like wind down cover' },
      { type: 'fix', text: 'A leaver still being covered no longer vanishes from Active now. The leave row aged out on their last working day even though the results cover runs about eight weeks longer, so the person the board was actively covering hid in the Past fold. The row now stays active for as long as the cover does' },
      { type: 'fix', text: 'Removing an accepted wind down suggestion now clears its marker. The match compared against a date the suggestion never carried, so the marker survived and the sweep would later have marked the person as left even though the leave had been deleted' },
      { type: 'fix', text: 'Someone linked to the register keeps their capacity from today. Linking means they are on EMIS with bookable sessions now, so a join date still in the future is pulled back to today rather than counting them as zero until a day that has effectively already happened' },
      { type: 'fix', text: 'After a TeamNet sync the screen now fetches the fresh absence list straight back, so the board, briefing and cover generation see the sync at once rather than after the next full reload' },
      { type: 'fix', text: 'Paging the chart to a year that does not contain today no longer pretends it does. The vs today view is disabled with a note, since its zero line would have been the window edge wearing todays name' },
      { type: 'tweak', text: 'The chart and grid now share one definition of their column layout, and the chart and the per 1,000 chips share one rule for which list size applies to a date, so neither pair can quietly drift apart' },
      { type: 'note', text: 'Two more findings from the live error log: the past weeks crash was already fixed in an earlier release, and rate limiting is switched off because Redis is not configured on the server, which is a settings matter rather than a code one. 2 new tests (234 total)' },
    ]
  },
  {
    version: '4.146.0',
    date: '2026-09-01',
    title: 'Second sweep: admin actions demand MFA, and refetches stop losing fields',
    changes: [
      { type: 'fix', text: 'The admin API routes that impersonate users, mint sign in links and suspend accounts checked only that the caller was a platform admin, never that the session had passed MFA. The admin pages themselves enforce MFA precisely because those powers with a stolen password alone would be total compromise, but calling the routes directly skipped the gate. They now demand the same MFA verified session the pages do' },
      { type: 'fix', text: 'Reloading data mid session was silently dropping wind down markers and buddy preferences. The initial page load fetched both, but the refresh endpoint asked the database for neither column, so the copy that replaced your data was missing them and the features they drive looked like they had forgotten everything' },
      { type: 'fix', text: 'The TeamNet sync now insists on a public http or https address before the server will fetch it, and requires a management role. Previously any signed in member could hand the server any URL, including internal ones, and have it fetched from inside' },
      { type: 'fix', text: 'A day worked only as a half day or only in the evening no longer risks being rewritten as a full day. The rota comparison read halves as off and ignored evenings entirely, so such days looked newly added on every save and were reset to a full day, losing the half and the evening. Nobody currently has such a day, which is why it had not bitten' },
      { type: 'fix', text: 'Editing sessions no longer overwrites archived working pattern history. The update matched every pattern row for the clinician rather than only the live one. No archived rows exist yet, so nothing was lost' },
      { type: 'fix', text: 'A save that simply did not mention the TeamNet URL no longer erases it. The setup wizard posts only its new clinicians, and that save was nulling the stored calendar address as a side effect' },
      { type: 'fix', text: 'Practice managers and partners can now fetch calendar feed links, matching every other management action; only owners and admins could before. A clinician without a token gets a plain explanation instead of a link ending in the word null, and a server missing its configuration says so instead of a bare error' },
      { type: 'tweak', text: 'The two TeamNet sync error logs had swapped labels, each one blaming the other mode, sending whoever read the logs to the wrong code path' },
    ]
  },
  {
    version: '4.145.1',
    date: '2026-09-01',
    title: 'The duplicate clean up actually runs',
    changes: [
      { type: 'fix', text: 'The clean up migration compared the absence reason against an empty string, and the database holds reasons as a fixed list of values that an empty string is not one of, so the migration failed before deleting anything. It compares them as plain text now. Checked against the live data first: it removes exactly the 183 identical copies and nothing else' },
    ]
  },
  {
    version: '4.145.0',
    date: '2026-09-01',
    title: 'A full sweep of the system: the TeamNet sync stops duplicating, the deletion bug is defused, and running changes gets shelves',
    changes: [
      { type: 'fix', text: 'The TeamNet sync was duplicating the whole calendar on every run. The sync recognises its own rows by a marker it writes on them, and a separate save path was rewriting that field from a stale copy and stripping the marker, so each sync could not find its own rows to replace and imported everything again. Nearly half the absence table was duplicate rows. The marker is now protected, the sync stamps its rows twice over, it refuses to insert a row identical to one already there, and the duplicates already created are cleaned up' },
      { type: 'fix', text: 'A background sync path could have deleted every absence in the practice. It expected the sync to hand back the rows it imported, which stopped happening long ago, so it was saving an empty list as the practices entire set of absences, and the save endpoint reads a full list as the truth to delete against. It only ever survived by failing silently. It now saves nothing but the time of the sync, and the save endpoint no longer lets any ordinary save touch rows the sync owns' },
      { type: 'fix', text: 'The public buddy page was being sent the reason for every absence, including long term sickness and maternity, against named staff, on an address anyone could guess. The page never even showed them. It now receives dates and half days only' },
      { type: 'fix', text: 'Half day absences no longer lose their half day. A save whose copy of an absence predated the half day flag was clearing it, the same disease the wind down markers had, one field over' },
      { type: 'fix', text: 'Recording that someone is leaving now books the full eight weeks of results cover. The last working day was being passed as the end of cover, which the transition rejected and shrank to one week, so three people were down for seven days of wind down instead of eight weeks. Removing a leave also properly clears its marker now, which it never did' },
      { type: 'feature', text: 'Running changes is split into shelves: what is active now is on show, with upcoming and past folded away behind a count. The one live absence no longer hides among twenty past joins' },
      { type: 'fix', text: 'Accepting an already on the buddy board suggestion now ties the new event to the absence it describes, so the list shows one row for it rather than two, and the suggestion carries its exact dates so the chart steps on the right day' },
      { type: 'fix', text: 'Linking a planned person now lets the real rota have the final word on their sessions. The plans guessed number used to override the rota forever' },
      { type: 'fix', text: 'The capacity chart no longer draws nonsense when per 1,000 is on and no list size is known, and no longer prints fifteen digit decimals in the vs today view. Names in running changes fall back to the register, so someone who has left shows as a name rather than a database identifier. Day off chips on the printed briefing are readable in the light theme' },
      { type: 'improvement', text: 'An Associate Partner now counts as a GP. The role never matched the GP pattern, so a partner track GP was falling out of every GP only count on the site' },
      { type: 'note', text: '5 new tests (232 total). The duplicate clean up keeps the earliest copy of each identical row and touches nothing else' },
    ]
  },
  {
    version: '4.144.0',
    date: '2026-09-01',
    title: 'Long-term absences stop going missing, and there is now one place to see them',
    changes: [
      { type: 'fix', text: 'Wind down markers were being written and then wiped seconds later, so the database held none at all: no clinician carried one and not a single absence carried the note saying which system created it, across fourteen wind downs. A save that simply did not mention the marker was clearing it, and once cleared it stayed cleared, because the next load had nothing to send back. Only a save that actually knows about a marker can change it now' },
      { type: 'fix', text: 'That is why the buddy board would not let you touch these. Undo, adjust the end date, the sweep that marks somebody back when EMIS shows their sessions again, and the already on the buddy board prompt in staff changes all look for that marker, and it was never there. They work again' },
      { type: 'fix', text: 'Removing a leave or a long absence in staff changes now actually takes the cover off the board. It was remembering the absence by an identity made in the browser, which the database throws away and replaces on save, so after a reload the two no longer matched and the cover stayed. It remembers the span instead, and one person cannot have two long absences starting the same day' },
      { type: 'feature', text: 'Running changes now also lists long absences that live on the buddy board with no matching entry here, marked as coming from the board, each removable. Eight active ones were invisible on the one screen that claims to list every change, including two overlapping ones for the same person' },
      { type: 'improvement', text: 'Undoing a wind down finds its absence by the dates it covers as well as by its identity, so the ones already recorded without a marker can be cleared rather than being stuck' },
      { type: 'note', text: 'Nothing was changed in the existing records. Duplicate and overlapping long absences are now visible in running changes and can be removed there' },
      { type: 'note', text: '5 new tests cover the marker rules (227 total)' },
    ]
  },
  {
    version: '4.143.0',
    date: '2026-09-01',
    title: 'Planned people can be edited, and retired into the real person',
    changes: [
      { type: 'feature', text: 'A planned person can be edited after they are added. Their name and role were fixed at the moment you typed them, so a typo meant deleting them and starting again, which threw away their join event with them. Click the name to change either' },
      { type: 'feature', text: 'A locum no longer looks the same as a new salaried GP. The role was already being stored and simply never shown, so every planned row read as an anonymous placeholder. Each now carries its role as a short tag, amber for temporary cover and green for a permanent appointment, with the full role on hover' },
      { type: 'fix', text: 'When a planned person actually starts they appear in the register with their own sessions, and until now nothing connected the two: the plan kept counting them as well, so one person was counted twice from the day they arrived. The planned row now offers this person is now, which hands their planned changes to the real clinician and retires the placeholder' },
      { type: 'fix', text: 'A recorded join now means the person was not here before it, for real clinicians as well as planned ones. Someone who started in September was previously drawn as having worked the whole year, because their current rota was applied to every month behind them' },
      { type: 'fix', text: 'The morning briefing called the leaving wind down working notice, which is not what it is. The person has left; cover continues only so that the results and letters still arriving in their name get reviewed by somebody. It now reads left, results wind down, in both places the briefing said it' },
      { type: 'tweak', text: 'That wind down now defaults to eight weeks rather than nine, which is the usual run before results stop arriving. The dialog still takes an exact date, so the default is only a starting point' },
      { type: 'tweak', text: 'Buddy cover on the morning briefing now reads like the buddy board: initials, the word covers, then a chip per person, absent solid and day off outlined, with a key. The sheet strips every colour when printed, so a day off chip says so in words as well rather than relying on the outline' },
      { type: 'fix', text: 'The planned changes figure no longer claims to be a rate. It is a count of recorded changes and was being labelled per week alongside the session numbers' },
      { type: 'note', text: '3 new tests cover the join rule that makes linking safe (222 total)' },
    ]
  },
  {
    version: '4.142.0',
    date: '2026-09-01',
    title: 'The capacity line now says who moved it, and when',
    changes: [
      { type: 'feature', text: 'The chart on Staff changes has moved down onto the grid itself and now shares its month columns, so a step in the line sits directly above the square that caused it. Look down from a dip and you land on the person. The two scroll together as one' },
      { type: 'feature', text: 'A folded away strip under the chart names every change on the day it lands: who, what kind, and how many sessions it moves. It opens with one click and stays shut otherwise, so the chart is quiet until you ask it a question' },
      { type: 'fix', text: 'A session change now reads as the change. Going from five sessions to six shows as plus one rather than as a six, which is the number a planner actually wants: the old label made you work out the difference yourself' },
      { type: 'feature', text: 'The line steps on the real date rather than the first of the month. Maternity leave starting on the twenty eighth of August now holds the line up until the twenty eighth, instead of dropping it four weeks early. Anything recorded before exact dates existed still steps at the month boundary, so nothing historical has moved' },
      { type: 'feature', text: 'A second view, vs today, plots the same year as the distance above or below where the practice sits today. Zero is a fact rather than a choice of scale, so it answers how far down am I in November in one glance. One button, next to the sessions view' },
      { type: 'tweak', text: 'Absences are labelled MAT and SICK rather than spelled out, because a chart label has room for three letters and not for a sentence. Returns from leave are marked too, which they never were: coming back was previously an unexplained bend in the line' },
      { type: 'fix', text: 'The chart has a scale with numbers on it. It had reserved the space for one since it was built and never drawn it, so no value on it could be read. The gradient fill that anchored the line to an invented baseline is gone as well, which had made a four session dip fill half the panel' },
      { type: 'fix', text: 'Month labels no longer shrink with the panel. They were drawn inside the picture and scaled with it, so they were about ten pixels on a monitor and roughly three on a phone. The line now uses the grid month headings underneath it' },
      { type: 'improvement', text: 'Hovering a month gives its level, what it started the month at if that differs, and every change inside it with the date. The panel beside the chart carries the split by staff group, which is what tells you a dip is GPs rather than the practice as a whole' },
      { type: 'note', text: '9 new tests cover the day level walk, including mid month steps, signed changes and the returns (219 total)' },
    ]
  },
  {
    version: '4.141.1',
    date: '2026-08-31',
    title: 'Already on GPDash now actually says so',
    changes: [
      { type: 'fix', text: 'Practice search never marked a practice as already being on GPDash, so the Already on GPDash note never appeared while signing up, and in the setup wizard a practice someone else had already claimed still looked selectable. The check ran as the person doing the searching, and during sign-up there is no account yet, so it always came back empty and every practice looked brand new. It is now checked the same way the patient numbers are' },
      { type: 'note', text: 'Nobody could actually take a practice that was already claimed. The check that gates creation is a separate one that always worked, so this was a missing warning rather than a wrong outcome' },
    ]
  },
  {
    version: '4.141.0',
    date: '2026-08-31',
    title: 'Practice lookup no longer depends on one website staying up',
    changes: [
      { type: 'fix', text: 'Signing up a new practice could not find any practice at all. OpenPrescribing, the only source practice search had, moved behind a bot challenge and started refusing every request from the server, so searching by name or by ODS code returned nothing and the only way through was Enter manually. Lookup now falls back to the NHS Organisation Data Service, which is the service that issues those codes in the first place' },
      { type: 'feature', text: 'The fallback covers both ways in. A name search finds active GP practices by any part of the name, and an ODS code is resolved directly. Only real GP practices come back: a search for a practice name that a school or a care home also uses no longer offers the school' },
      { type: 'feature', text: 'Postcode auto-fill works again too, and is now more accurate than it ever was. The old route took the practices map position and asked which postcode was nearest, which can land on the building next door. The Organisation Data Service holds the practices own registered postcode, so it is the exact one rather than the closest one. That makes it the primary source now, with the old nearest-postcode method kept behind it, so the postcode is more accurate than before rather than merely working again' },
      { type: 'improvement', text: 'The Organisation Data Service publishes no patient numbers, so list sizes in fallback mode come from the NHS baseline figures GPDash already stores. Every practice on the list has one, so a practice found through the fallback still shows its patient count and the month it is from' },
      { type: 'fix', text: 'Practice search now shows the PCN, ICB and region again. Those had been silently blank for everyone signing up, because sign-up happens before there is an account and the table holding them only answers to signed-in users. That is what tells two practices with the same name apart' },
      { type: 'improvement', text: 'OpenPrescribing is still tried first, so nothing changes on the day it comes back. When it is unreachable the per-practice list size calls to it are now skipped rather than waited on, which takes a dead-upstream search from about five seconds to under one' },
      { type: 'note', text: '16 new tests cover the new lookup, including the role filter that keeps schools and care homes out of practice results (210 total)' },
    ]
  },
  {
    version: '4.140.0',
    date: '2026-08-31',
    title: 'The working week reads along a row',
    changes: [
      { type: 'tweak', text: 'Capacity planning week detail is now laid out as one row per site across five day columns, rather than five day columns each stacking their own sites. Sites used to start at whatever height the sites above them needed, so Banwell sat lower on a busy day than a quiet one. Every site now owns a horizontal band, so is Banwell fine all week is a single glance along a line rather than five separate readings' },
      { type: 'feature', text: 'Each session carries a capacity bar under it showing staffing against that sites minimum. A full green bar means the minimum is met, a short red bar means it is not, and the length says how far off. The number is no longer the only signal, so the week can be scanned without reading digits' },
      { type: 'tweak', text: 'The bar is deliberately two states rather than three. An amber for exactly on the minimum was tried first and rejected on real data: with minimums of one and two, being exactly on the minimum is the ordinary state here, so amber fired on nearly every session and the three genuine shortfalls stopped standing out' },
      { type: 'tweak', text: 'A site with nobody in it keeps its place in the row and says so, and a closed day shows a single dash per site with the reason named once in the day header, rather than repeating that nobody is in' },
    ]
  },
  {
    version: '4.139.0',
    date: '2026-08-31',
    title: 'Ask to join a practice, and know whether an invite email actually went',
    changes: [
      { type: 'feature', text: 'Someone signing up whose practice is already on GPDash is no longer stuck. The screen now names who runs it and offers an Ask to join button, with an optional line about who they are. The request lands on that practices Users page where an owner, admin or practice manager approves or declines it. Approving always adds them on the lowest role, because saying this person works here is a different decision from this person runs the place' },
      { type: 'fix', text: 'The same screen tried to name the practice owner but the lookup never returned one, so every visitor got the vaguer wording instead. It returns the owner now, and the practice id, which is what makes asking to join possible at all' },
      { type: 'feature', text: 'Invite emails now report back. The pending invites list shows Emailed, Sending or Email failed against each person, with the providers reason on hover and a plain instruction to copy the link and send it by hand when a send fails. Until now the card announced that an email was on its way the moment the row was written, so a rejected address looked exactly like a delivered one and nobody found out' },
      { type: 'note', text: 'Invites that were already accepted are marked as emailed, since the person clearly got their link. Older unaccepted ones stay as sending rather than claiming a delivery nobody recorded' },
    ]
  },
  {
    version: '4.138.0',
    date: '2026-08-31',
    title: 'Staff changes keeps its grid, keeps its dates, and shows its working',
    changes: [
      { type: 'fix', text: 'Rows with a wide chip in them, a maternity span for instance, pulled every other column on that row out of line. The month columns were sized so that content could stretch them, so one long word shifted a whole row sideways. They are now fixed width and content is clipped instead, so the grid stays a grid' },
      { type: 'fix', text: 'Adding a person looked like it did nothing. Two reasons. Pressing Enter after typing a name did nothing at all because the fields were not in a form, and the new person joins the bottom of a list of twenty seven, well below the fold, so even a successful add was invisible. Enter now works, and the page scrolls to the new row and highlights it for a moment. If a role filter is on that would have hidden them, the filter widens to include them' },
      { type: 'feature', text: 'Leave, sickness and maternity now take exact dates rather than whole months, because the buddy board arranges cover day by day and October is not enough to know who covers the third. Start and end dates are pushed straight to the buddy board. The grid still places the square by month' },
      { type: 'feature', text: 'A running changes list under the grid. Every change on one line, newest first, with what it is, who recorded it, whether it is upcoming, active or past, and whether it has reached the buddy board. Removing one here also takes back the absence it created and clears the wind down marker it set, so deleting leave in staff changes no longer leaves the buddy board covering somebody who is not away' },
      { type: 'feature', text: 'Every addition and removal is written to the audit trail with the name, the dates and who did it, so staff changes are as accountable as everything else' },
      { type: 'tweak', text: 'Capacity planning week detail: every site now appears in every day, in the practices own order, with a quiet Nobody here where a site is unstaffed. Sites used to be dropped from a day entirely when empty, so they moved between columns and the week could not be read across' },
      { type: 'tweak', text: 'The week detail colours are calmer. Sessions that meet their minimum are left plain, a session one short is tinted red and one at the edge carries an amber edge, so colour now means something rather than filling the screen. Site identity moved to a single dot and name at the top of each block instead of a stripe on every tile, and clinicians are listed by full name rather than initials. A closed day says bank holiday once rather than repeating that nobody is in' },
    ]
  },
  {
    version: '4.137.0',
    date: '2026-08-31',
    title: 'Sign-up actually works now: three ways a new user could be left waiting forever',
    changes: [
      { type: 'fix', text: 'The password rules on screen did not match the rules the server enforces. The checklist asked for 8 characters, a letter and a digit, and turned green. The server also demands an upper case letter and a symbol. So a new user ticked every box, pressed Create account, and was refused. No account was made and no email was ever sent, which is exactly why people reported never receiving a verification code. The checklist now lists all four requirements and the form will not submit until they are genuinely met. Verified against the live API: Winscombe1 is refused, Winscombe1 with a symbol is accepted' },
      { type: 'fix', text: 'Signing up with an email address that already had an account sent the user to the enter your code screen to wait for a code that was never coming. This is deliberate behaviour on the authentication side, which hides whether an address is registered by returning a success shaped response and sending nothing. We now detect it and show a proper screen instead: you already have an account, with buttons to sign in, reset the password, send a fresh confirmation email if it was never confirmed, or use a different address' },
      { type: 'fix', text: 'The set up your practice wizard returned a server error for every new practice owner. A change in the framework made the cookie accessor asynchronous, and this page and the setup in progress page were the only two that had not been updated, so both crashed before rendering. Every new owner hit this immediately after creating their practice' },
      { type: 'fix', text: 'Expired and already used email links dumped people on a blank login form with no explanation. The failure reason was being passed in the address bar and nothing read it. Both the login and the reset password pages now explain what happened, including that mail scanners often open the link first and use it up, and offer the next step rather than leaving people to guess' },
      { type: 'feature', text: 'A new send me a new confirmation email button on the login page. Being told your email is not confirmed used to be a dead end that pointed at an email which, in every case we have seen, never arrived. Now there is a way out from the page itself' },
      { type: 'tweak', text: 'Sign-up errors are translated like the rest of the site. The worst offender listed every acceptable character as raw character sets, which read like a regular expression. Undeliverable addresses now say plainly that the account was not created, so a typo can be corrected rather than waited on' },
      { type: 'note', text: 'Sixteen new tests pin the password rules to the servers actual verdicts, case by case, so the two can never drift apart silently again, and check that no error message shows raw text' },
    ]
  },
  {
    version: '4.136.0',
    date: '2026-08-31',
    title: 'Who is where, why they are away, and arrows that stay still',
    changes: [
      { type: 'feature', text: 'Todays team on the morning briefing is now grouped by site, each with its own colour dot and a head count, in the practices own site order. A clinician working two sites in one day is listed once under their morning site with the split spelled out, so the huddle can see at a glance that four are at Winscombe and two at Banwell rather than reading one long line of initials' },
      { type: 'feature', text: 'Everyone absent now says why. Holiday, off sick, training, study leave, parental leave, long term sick or working notice, taken from the absence record itself, with the wind down marker filling in when no absence covers the day. Day off stays day off. Stored values that were never meant to be read aloud, annual_leave and the like, are turned into English, and acronyms survive the trip so Training/CPD is not rendered as Training/Cpd' },
      { type: 'feature', text: 'The week ahead now shows routine slots beside urgent ones, and each day carries a colour stripe for its urgent capacity against that weekdays own target. The bands are the same four the rest of the site uses, so a colour means the same thing here as it does on Today, with a small key underneath' },
      { type: 'tweak', text: 'Buddy cover lost the purple Generate 4 Weeks button and the per day Regenerate button. Cover already regenerates itself whenever anything it depends on moves, and the window is now filled on load as well, which closes the one real gap: on a quiet week nothing changes but the far edge of the rolling four weeks advances with the calendar. A quiet Generate now appears only if a day somehow has nothing' },
      { type: 'fix', text: 'The week arrows on the buddy board no longer move. The This week link appearing and the date text changing width shifted the whole row sideways, so a second click landed somewhere else and skipping three weeks with three clicks was impossible. Both now hold fixed widths and the link keeps its space when hidden' },
      { type: 'feature', text: 'Staff changes filters by real role now, not four coarse groups. A tick box dropdown of the practices actual job titles, each showing how many people and how many weekly sessions it carries, so GP Partner plus Salaried GP plus ANP is three ticks. Presets for GPs and GPs plus nursing, a search box, and the choice is remembered for next time' },
      { type: 'fix', text: 'The 28 day availability helper threw when handed data with no date list rather than returning empty. Nothing in production hit it, but the briefing is built to never throw at five to eight, so it now guards properly' },
      { type: 'note', text: 'The tick box dropdown moved into shared components so other sections can use the same control. Seven new tests cover site grouping, split sites, the absence reason vocabulary and the outlook shape' },
    ]
  },
  {
    version: '4.135.0',
    date: '2026-08-31',
    title: 'Staff changes, the shape of the team across the year',
    changes: [
      { type: 'feature', text: 'A new staff changes section in planning. Every clinician who provides sessions is listed with their weekly session count, months run along the bottom anchored to the April financial year, and you page whole years back and forward with a snap back to this year. Click any square to record a join, a leave, a temporary leave for maternity or sickness with an until month, or a session change, and the totals walk forward through every event' },
      { type: 'feature', text: 'A summary graph across the top shows total weekly clinical sessions stepping through every planned change, with a today marker, dots on the months where something happens, and chips for now, end of view, the low point and the number of planned changes. Role filter chips narrow the whole view to GPs, nursing, HCAs or others' },
      { type: 'feature', text: 'A per 1,000 patients toggle divides the line by the practice list size, using the NHS published monthly list sizes where known so the trend reflects real list growth, and the registered size otherwise' },
      { type: 'feature', text: 'Add a planned person for a locum or a hoped for hire. They appear italic with no sessions until you give them a join event, and can be removed along with their events' },
      { type: 'feature', text: 'The whole site now knows. Marking a real clinician as leaving or temporarily away here routes through the same wind down machinery as the buddy board, so their absence, cover status and audit trail all update together. Anyone already marked on the buddy board is offered as a one click suggestion here so the two never disagree' },
      { type: 'tweak', text: 'The buddy board wind down dialog now asks for a date instead of a number of weeks, with the rough week count shown alongside. Existing weeks based behaviour survives as the default' },
      { type: 'note', text: 'Everyone can see the plan, editing needs admin. Eighteen new tests cover the month walking, the April anchoring, leap year month ends, the per 1,000 carry forward and the buddy board bridge in both directions' },
    ]
  },
  {
    version: '4.134.0',
    date: '2026-08-31',
    title: 'Morning briefing, the 8am huddle on one page',
    changes: [
      { type: 'feature', text: 'A new morning briefing section, right under Today, gathers everything the huddle reads out onto one page. Who is on duty morning and afternoon and where, urgent capacity against target with the expected demand, who is in, who is absent and who is covering them, the current routine wait, todays notices and a five day outlook of predicted requests against the urgent slots already on EMIS' },
      { type: 'feature', text: 'One button prints it as a clean black on white A4 sheet for handing round the huddle. The screen version follows the app theme, the paper version deliberately does not' },
      { type: 'feature', text: 'On a closed day it automatically briefs the next open day instead of showing an empty page, with a note saying so. A bank holiday evening glance gives you tomorrows sheet' },
      { type: 'note', text: 'Six new tests cover the assembly, including that it never throws with missing data, respects practice declared closed days, and resolves cover pairs to real names' },
    ]
  },
  {
    version: '4.133.0',
    date: '2026-08-31',
    title: 'The workforce planner judges the week like a GP rota',
    changes: [
      { type: 'feature', text: 'Activities now have a type, routine surgery, duty and triage, home visits, special clinic, teaching, admin, meetings, CPD. Each type carries a clinical yield, because nine people in the building is not nine appointment books open. Duty closes a book, a special clinic halves one, admin is fully non clinical. Existing activities keep working and anything named duty or triage is recognised automatically' },
      { type: 'feature', text: 'A design check panel now sits under the planner grid. It converts the weekly template into planned appointments per day using the activity types and a configurable appointments per clinical session, and draws it against your practices own demand shape, day by day, with the surplus or shortfall on each' },
      { type: 'feature', text: 'The template is checked against the rules a partner applies by eye. Duty cover must exist and be assigned every session, and to someone marked duty capable. Capacity below expected demand is flagged with the numbers. The busiest day holding less capacity than a quieter one is called out. A clinician on six or more sessions with no admin or CPD time is noted. A duty holder also booked for a full surgery in the same session is a clash. Findings arrive most severe first with a single score out of 100 at the top' },
      { type: 'note', text: 'Nineteen new tests cover the yield arithmetic, the demand comparison and every rule, including that unassigned work still consumes capacity, because the work exists whether or not it has a name on it yet' },
    ]
  },
  {
    version: '4.132.0',
    date: '2026-08-31',
    title: 'One design language across the whole site',
    changes: [
      { type: 'tweak', text: 'A closed day now looks the same everywhere. The public buddy page, the rooms screen and the week view had their own dialects, an emoji house, amber warning text, a grey card. All of them now use the same quiet house icon treatment as the rest of the app' },
      { type: 'tweak', text: 'Empty state icons are now drawn line icons in the house style instead of coloured emoji. Five screens were showing chart and magnifier emoji in an interface that uses line icons everywhere else' },
      { type: 'fix', text: 'The diagonal stripe on short capacity tiles is gone. The same texture means booked on the today charts, so one pattern had opposite meanings a click apart, and it confused the person who uses it most. Short tiles are plain red and now print how many slots below target they are, which says more than a stripe ever did and still works without colour vision' },
      { type: 'tweak', text: 'Every heading and monospace number across 52 files now uses the shared font tokens rather than repeating the font name inline, so a future typeface change is one line instead of eighty' },
      { type: 'tweak', text: 'Copy Day on the buddy allocations panel is now a quiet outline, matching Copy Week above it, so Generate clearly leads in both places' },
      { type: 'tweak', text: 'The workforce planner, locum spend and meetings screens now announce proper headings to screen readers, matching every other section' },
    ]
  },
  {
    version: '4.131.1',
    date: '2026-08-31',
    title: 'The booking horizon guess is gone, replaced by a real rule',
    changes: [
      { type: 'fix', text: 'Yesterday the far weeks of the capacity grid were softened to dashed outlines past a three week booking horizon. That horizon was an invented cutoff, and on real data it was hiding genuine shortfalls, nineteen sessions that are truly under target five and six weeks out were being shown as not yet judged. The rule is now the one Darren set, a session is only shown as unjudged when EMIS has no urgent slots for it at all, meaning it has not been templated yet. Everything with any slots gets the usual colours at any distance' },
      { type: 'tweak', text: 'An untemplated session shows a dash rather than a zero, a neutral dashed outline rather than a red one, and the hover says no urgent sessions on EMIS yet. The key entry matches' },
    ]
  },
];
