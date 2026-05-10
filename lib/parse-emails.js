// lib/parse-emails.js
//
// Extract email addresses from messy text input. Designed to handle
// real-world copy-paste from Outlook, Gmail, contact lists, spreadsheets,
// etc. — not just clean comma-separated lists.
//
// Examples we want to handle:
//
//   "John Smith <john@example.com>"               → john@example.com
//   "john@example.com, jane@example.com"          → both
//   "John Smith <john@example.com>; Jane <j@e.co>" → both
//   '"John Smith" <john@example.com>'             → john@example.com (drop quotes)
//   "Email me at john@example.com please"         → john@example.com
//   Multi-line:
//     john@example.com
//     jane@example.com
//   Whitespace, tabs, mixed delimiters — all OK
//
// Output: a deduplicated array of { email, displayName? } objects in
// the order they first appeared in the input. The displayName is
// captured when we can confidently associate a name with an email
// (e.g. Outlook's "Name <email>" form). Used by the bulk-invite UI
// to show "John Smith — john@example.com" so the user sees who they
// recognised.

// Email regex: pragmatic, not RFC-compliant. We let the server do
// strict validation. This regex captures things that LOOK email-shaped:
// non-whitespace, an @, more non-whitespace, a dot, more non-whitespace.
// Stops at common punctuation that isn't valid in emails (>,;<>"').
const EMAIL_RE = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;

// "Name <email>" capture — looks for an email inside angle brackets,
// possibly preceded by quoted or unquoted name text.
// Examples it matches:
//   '"John Smith" <john@example.com>'
//   'John Smith <john@example.com>'
//   '<john@example.com>'
const NAMED_RE = /(?:"([^"]+)"|'([^']+)'|([^<,;]+?))?\s*<\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\s*>/g;

export function parseEmails(input) {
  if (!input || typeof input !== 'string') return [];
  const seen = new Set();
  const results = [];

  // First pass — find named entries and capture their display names.
  // This consumes "John Smith <john@example.com>" patterns first so
  // the broader EMAIL_RE on the second pass doesn't lose the name.
  const consumed = new Set();
  let match;
  // We need to be careful about regex state — reset lastIndex each pass
  // and use exec() in a loop.
  NAMED_RE.lastIndex = 0;
  while ((match = NAMED_RE.exec(input)) !== null) {
    const [, quoted1, quoted2, unquoted, email] = match;
    const name = (quoted1 || quoted2 || unquoted || '').trim();
    const lowerEmail = email.toLowerCase();
    if (seen.has(lowerEmail)) continue;
    seen.add(lowerEmail);
    consumed.add(lowerEmail);
    results.push({
      email: lowerEmail,
      displayName: name || undefined,
    });
  }

  // Second pass — find any remaining bare emails not already captured
  // by the named-entry pass.
  EMAIL_RE.lastIndex = 0;
  while ((match = EMAIL_RE.exec(input)) !== null) {
    const lowerEmail = match[1].toLowerCase();
    if (seen.has(lowerEmail)) continue;
    seen.add(lowerEmail);
    results.push({ email: lowerEmail });
  }

  return results;
}
