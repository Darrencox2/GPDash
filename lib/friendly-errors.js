// lib/friendly-errors.js
//
// Translate raw Supabase auth errors into plain English with a next step.
// Born 2026-06-18 after a user was shown "AAL2 session is required to update
// email or password when MFA is enabled" — technically accurate, humanly
// useless. Rules for entries here: say what happened in normal words, then
// say what to do next. No acronyms, no protocol names.
//
// Usage: setError(mapAuthError(err.message))
// Unrecognised messages pass through unchanged (better an odd message than
// a wrong translation).

const RULES = [
  {
    match: /AAL2|assurance level/i,
    text: 'Your account is protected by two-factor authentication, so for security you need to enter the 6-digit code from your authenticator app before changing your password. Enter the code in the field above and try again.',
  },
  {
    match: /invalid login credentials/i,
    text: 'That email and password combination does not match. Check both carefully and try again — or use the Forgot password link below to set a new one.',
  },
  {
    match: /email not confirmed/i,
    text: 'Your email address has not been confirmed yet. Look for the confirmation email in your inbox (check junk too) and follow it, then sign in again.',
  },
  {
    match: /rate limit|too many requests/i,
    text: 'Too many attempts in a short time. Wait a couple of minutes, then try again.',
  },
  {
    match: /(same|different).*(password)|password.*(same|different from)/i,
    text: 'Your new password must be different from the one you are using now. Choose a password you have not used here before.',
  },
  {
    match: /token (has )?expired|otp.*expired/i,
    text: 'That code or link has expired. Request a fresh one and use the newest email.',
  },
  {
    match: /invalid (otp|token|code)/i,
    text: 'That code is not right. Codes change every 30 seconds — check your authenticator app or newest email and enter the current one.',
  },
  {
    match: /user not found/i,
    text: 'No account exists for that email address. Check the spelling, or create an account instead.',
  },
];

export function mapAuthError(message) {
  const m = String(message || '');
  for (const rule of RULES) {
    if (rule.match.test(m)) return rule.text;
  }
  return m || 'Something went wrong. Try again, and if it keeps happening let your administrator know.';
}
