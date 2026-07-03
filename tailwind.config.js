/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Space Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        heading: ['Outfit', 'sans-serif'],
      },
      // ── THE ONE DESIGN SYSTEM ────────────────────────────────────────────
      // These utilities consume the SAME CSS variables that inline styles use
      // (defined in app/globals.css), so `bg-card` and `var(--g-card)` are one
      // decision, not two dialects. Theme-aware automatically (dark/light).
      // New semantic names only — Tailwind's default scales (rounded-*, text-sm
      // etc.) are deliberately NOT overridden, so existing classes are untouched.
      // Radii equivalence (defaults already match the tokens exactly):
      //   rounded-md = 6px = --r-sm · rounded-lg = 8px = --r-md ·
      //   rounded-xl = 12px = --r-lg · rounded-full = --r-pill
      colors: {
        card: 'var(--g-card)',
        tile: 'var(--g-tile)',
        'tile-2': 'var(--g-tile-2)',
        panel: 'var(--g-panel)',
        surface: 'var(--g-surface)',
        field: 'var(--g-field)',
        divider: 'var(--g-divider)',
        line: 'var(--g-line)',
        ink: 'var(--g-ink)',
        hi: 'var(--g-text-hi)',
        mid: 'var(--g-text-mid)',
        mute: 'var(--g-text-mute)',
        faint: 'var(--g-text-faint)',
        accent: 'var(--accent)',
        edge: 'var(--g-border)',
        strong: 'var(--g-border-strong)',
      },

      lineHeight: {
        body: '1.6',   // long-form copy; named token because arbitrary leading-[x] proved unreliable here
      },
      fontSize: {
        // The documented type scale (globals.css) as named utilities.
        // Pure sizes (no bundled line-height) so migrating inline fontSize
        // to these classes is pixel-exact; set leading-* explicitly if needed.
        caption: '11px',
        meta: '12px',
        'body-sm': '13px',
        body: '14px',
        subhead: '16px',
        h3: '18px',
        h2: '22px',
      },
    },
  },
  plugins: [],
}
