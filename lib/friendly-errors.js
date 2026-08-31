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
  {
    // Supabase spells this out as a list of character sets, which reads
    // like a regex and tells the user nothing about what to type.
    match: /password should contain|weak.?password|password should be at least/i,
    text: 'That password does not meet the requirements. It needs at least 8 characters, a lower-case and an upper-case letter, a number, and a symbol such as ! or ?',
  },
  {
    // GoTrue returns a 500 with this when the mail provider refuses the
    // recipient - almost always a typo in the address, or a domain the
    // provider will not deliver to. Nothing is created when this happens.
    match: /error sending (confirmation|recovery|magic link)?\s*email|could not send email/i,
    text: 'We could not send an email to that address, so your account was not created. Check the address for typos and try again. If it looks right, ask your practice administrator to send you an invite instead.',
  },
  {
    match: /already confirmed|email link is invalid/i,
    text: 'That email address is already confirmed. Sign in with your password, or use Forgot password to set a new one.',
  },
  {
    match: /user already registered|already been registered/i,
    text: 'An account already exists for that email address. Sign in instead, or use Forgot password if you cannot remember it.',
  },
];

export function mapAuthError(message) {
  const m = String(message || '');
  for (const rule of RULES) {
    if (rule.match.test(m)) return rule.text;
  }
  return m || 'Something went wrong. Try again, and if it keeps happening let your administrator know.';
}
