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
