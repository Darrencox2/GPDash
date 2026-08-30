// A breadcrumb of what the user actually did, so a crash report says more
// than "it broke".
//
// The single most useful thing missing from a bug report is the sequence
// that produced it. This keeps the last few navigations and notable actions
// in memory (never persisted, never sent anywhere on its own) so the error
// box can include them when someone copies the details.

const TRAIL = [];
const MAX = 8;

export function noteAction(label) {
  if (!label) return;
  const last = TRAIL[TRAIL.length - 1];
  if (last && last.label === label) return;      // ignore repeats
  TRAIL.push({ label, at: Date.now() });
  if (TRAIL.length > MAX) TRAIL.shift();
}

export function getTrail() {
  return TRAIL.slice();
}

// Chunk-load failures are their own category. They happen when the browser
// holds a reference to a JS chunk from a previous build — after a deploy, or
// after any rebuild while a tab is open — and the file no longer exists.
// The page is not broken; it is out of date, and a reload fixes it.
export function isStaleBuildError(error) {
  const s = `${error?.name || ''} ${error?.message || ''}`;
  return /ChunkLoadError|Loading chunk \d+ failed|Failed to load chunk|Importing a module script failed|error loading dynamically imported module/i.test(s);
}

// Human-readable report, formatted to be pasted straight into a message.
export function buildErrorReport({ error, componentStack, section, version, practice }) {
  const trail = getTrail();
  const lines = [
    'GPDash error report',
    '===================',
    `When       : ${new Date().toISOString()}`,
    `Version    : ${version || 'unknown'}`,
    `Section    : ${section || 'unknown'}`,
    `Page       : ${typeof window !== 'undefined' ? window.location.pathname : 'n/a'}`,
    practice ? `Practice   : ${practice}` : null,
    `Browser    : ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}`,
    `Screen     : ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'n/a'}`,
    '',
    'What I did just before',
    '----------------------',
    trail.length
      ? trail.map((t, i) => `${i + 1}. ${t.label}`).join('\n')
      : '(nothing recorded)',
    '',
    'Error',
    '-----',
    String(error?.message || error || 'unknown'),
    '',
    'Stack',
    '-----',
    String(error?.stack || '(none)').split('\n').slice(0, 12).join('\n'),
  ];
  if (componentStack) {
    lines.push('', 'Component stack', '---------------',
      String(componentStack).split('\n').slice(0, 10).join('\n'));
  }
  return lines.filter((l) => l !== null).join('\n');
}
