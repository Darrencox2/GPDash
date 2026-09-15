// Keyboard activation for elements that behave as buttons but are not
// <button> — cards, grid cells, chips, table rows.
//
// A real <button> is always better. These exist where one would break the
// layout, and this gives them what a keyboard user expects: reachable by
// Tab, activated by Enter or Space, announced as a button.
//
// It deliberately does NOT take the handler as an argument. It synthesises a
// click on the element itself, so the existing onClick stays the single
// definition of what the control does — no duplicated expression to drift.
//
// Usage:
//   <div role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={…}>
export function onKeyActivate(e) {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  // If a real control inside this element has focus, let it handle its own
  // key — otherwise Enter on a nested button would fire both.
  if (e.target !== e.currentTarget && e.target?.closest?.('button, a[href], input, select, textarea')) return;
  // Space scrolls the page by default, which is the opposite of a button press.
  e.preventDefault();
  e.currentTarget.click();
}


// Readable ink for a coloured badge, and a fill that can carry it.
//
// The site badges shipped as white on the brand hues and measured 1.98:1 on
// Banwell lime, 2.15:1 on amber and 2.80:1 on Locking orange at 12px/700,
// against a 4.5:1 floor. These 22x13 chips are how the board says which
// building a colleague is in, and two clinicians here share initials.
//
// The hue is the identity. The ink was never decided, only defaulted to
// white, so that is what moves first: whichever of white or --g-ink has more
// contrast on the fill wins, which clears AA on every hue in the palette bar
// one. Winscombe violet sits exactly on the crossover and tops out at 4.23:1
// either way, so for that case alone the fill is darkened - hue and
// saturation held, value lowered - until white clears the floor.
const INK_DARK = '#0f172a';
const INK_LIGHT = '#ffffff';

const CHANNEL = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb) => '#' + rgb.map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

export function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * CHANNEL(rgb[0]) + 0.7152 * CHANNEL(rgb[1]) + 0.0722 * CHANNEL(rgb[2]);
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// { background, color } for a badge. `background` comes back unchanged unless
// no ink could clear `floor` on it.
export function badgeColors(background, floor = 4.5) {
  const rgb = parseHex(background);
  if (!rgb) return { background, color: INK_LIGHT };
  const onDark = contrastRatio(INK_DARK, background);
  const onLight = contrastRatio(INK_LIGHT, background);
  if (onDark >= onLight) return { background, color: INK_DARK };
  if (onLight >= floor) return { background, color: INK_LIGHT };
  let fill = rgb;
  for (let i = 0; i < 24 && contrastRatio(INK_LIGHT, toHex(fill)) < floor; i++) fill = fill.map(c => c * 0.94);
  return { background: toHex(fill), color: INK_LIGHT };
}

// Ink only, for the callers that draw the fill themselves.
export function badgeInk(background, floor = 4.5) {
  return badgeColors(background, floor).color;
}
