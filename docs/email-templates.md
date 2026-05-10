# GPDash email templates

Templated HTML for the Supabase auth emails, designed to match GPDash's
visual language (dark logo, green accent, Space Mono for codes/monospace,
Outfit-feel headings). Email-safe: tables for layout, inline styles,
system fonts.

## How to apply

In Supabase: **Authentication → Email Templates** → click each template
in the left panel → paste the corresponding HTML below into the body
→ Save.

The subject lines are also given. Update those too, or leave defaults.

## Variables available

Supabase exposes these inside templates (Go-template syntax):
- `{{ .Token }}` — the 6-digit OTP code (8-digit if your project sets it)
- `{{ .ConfirmationURL }}` — the magic-link URL (used as fallback)
- `{{ .SiteURL }}` — your configured site URL
- `{{ .Email }}` — the recipient's email

## Design notes

- **System fonts only.** No `@font-face`, no Google Fonts. Email clients
  ignore those. Stack: `system-ui, -apple-system, "Segoe UI", Roboto,
  Helvetica, Arial, sans-serif` for body; monospace stack for the code
  boxes.
- **Tables for layout.** Outlook desktop (Word renderer) doesn't support
  flexbox/grid. Single-column centered table is the safest pattern.
- **Inline styles.** Some clients strip `<style>` blocks.
- **SVG logo inline.** Works in Gmail web, Apple Mail, Outlook 365, iOS
  Mail, Android Mail. Outlook desktop won't render it but the wordmark
  text below the missing logo still works — graceful fallback.
- **Light theme for email.** GPDash app is dark, but a dark email panel
  in the middle of someone's normal inbox feels promotional/spammy.
  Light card with branded accents is the right register for transactional
  email. Healthcare-adjacent SaaS especially benefits from looking
  understated and clinical.

---

## 1. Confirm signup

**Subject**: `Your GPDash verification code`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Verify your GPDash email</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-font-smoothing:antialiased;">
  <!-- Hidden preheader: the bit of text most clients show next to the subject -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f8fafc;opacity:0;">
    Use the 6-digit code below to verify your GPDash account.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Centered card, capped at 560px wide -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">

          <!-- Header: logo + wordmark -->
          <tr>
            <td style="padding:28px 32px 24px;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <!-- Logo SVG (modern clients) — 3x3 capacity-tile grid -->
                    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                      <rect width="36" height="36" rx="7.6" fill="#1e293b"/>
                      <rect x="4.5" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981"/>
                      <rect x="13.87" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="23.23" y="4.5" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="13.87" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="13.87" y="13.87" width="8.27" height="8.27" rx="3" fill="#f59e0b"/>
                      <rect x="23.23" y="13.87" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="23.23" width="8.27" height="8.27" rx="3" fill="#ef4444"/>
                      <rect x="13.87" y="23.23" width="8.27" height="8.27" rx="3" fill="#f59e0b" opacity="0.5"/>
                      <rect x="23.23" y="23.23" width="8.27" height="8.27" rx="3" fill="#334155"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                    <span style="color:#10b981;font-weight:400;opacity:0.5;">[</span>GP<span style="color:#10b981;font-weight:400;opacity:0.5;">]</span><span style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:300;color:#10b981;letter-spacing:0.18em;margin-left:2px;">DASH</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:22px;font-weight:600;color:#0f172a;line-height:1.3;">
                Verify your email
              </h1>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
                Use this code to finish setting up your GPDash account.
              </p>

              <!-- Code box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:18px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;">
                    <div style="font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:30px;font-weight:600;color:#0f172a;letter-spacing:0.3em;">
                      {{ .Token }}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                Enter this code on the GPDash signup screen. The code expires
                in 1&nbsp;hour.
              </p>

              <!-- Divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td style="border-top:1px solid #f1f5f9;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <p style="margin:24px 0 12px;font-size:13px;color:#64748b;">
                Or click the link below to verify automatically:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:8px;background:#0891b2;">
                    <a href="{{ .ConfirmationURL }}"
                       style="display:inline-block;padding:11px 22px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Verify in browser
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.5;">
              Didn't try to sign up to GPDash? Ignore this email and no
              account will be created.
            </td>
          </tr>
        </table>

        <!-- Below-card footer -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin-top:18px;">
          <tr>
            <td align="center" style="font-size:11px;color:#94a3b8;">
              GPDash · GP practice management
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 2. Reset Password

**Subject**: `Reset your GPDash password`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>Reset your GPDash password</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f8fafc;opacity:0;">
    A request was made to reset your GPDash password.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">

          <tr>
            <td style="padding:28px 32px 24px;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                      <rect width="36" height="36" rx="7.6" fill="#1e293b"/>
                      <rect x="4.5" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981"/>
                      <rect x="13.87" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="23.23" y="4.5" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="13.87" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="13.87" y="13.87" width="8.27" height="8.27" rx="3" fill="#f59e0b"/>
                      <rect x="23.23" y="13.87" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="23.23" width="8.27" height="8.27" rx="3" fill="#ef4444"/>
                      <rect x="13.87" y="23.23" width="8.27" height="8.27" rx="3" fill="#f59e0b" opacity="0.5"/>
                      <rect x="23.23" y="23.23" width="8.27" height="8.27" rx="3" fill="#334155"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                    <span style="color:#10b981;font-weight:400;opacity:0.5;">[</span>GP<span style="color:#10b981;font-weight:400;opacity:0.5;">]</span><span style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:300;color:#10b981;letter-spacing:0.18em;margin-left:2px;">DASH</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:22px;font-weight:600;color:#0f172a;line-height:1.3;">
                Reset your password
              </h1>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
                Click the button below to choose a new password for your
                GPDash account.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:8px;background:#0891b2;">
                    <a href="{{ .ConfirmationURL }}"
                       style="display:inline-block;padding:12px 24px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
                Or use this 6-digit code on the reset screen:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
                <tr>
                  <td style="padding:10px 16px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:600;color:#0f172a;letter-spacing:0.2em;">
                    {{ .Token }}
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">
                The link and code expire in 1&nbsp;hour.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.5;">
              Didn't request a password reset? You can safely ignore this email
              — your password won't change unless you click the link above.
            </td>
          </tr>
        </table>
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin-top:18px;">
          <tr>
            <td align="center" style="font-size:11px;color:#94a3b8;">GPDash · GP practice management</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 3. Magic Link

**Subject**: `Sign in to GPDash`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f8fafc;opacity:0;">
    Sign in to GPDash with this code or link.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">

          <tr>
            <td style="padding:28px 32px 24px;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                      <rect width="36" height="36" rx="7.6" fill="#1e293b"/>
                      <rect x="4.5" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981"/>
                      <rect x="13.87" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="23.23" y="4.5" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="13.87" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="13.87" y="13.87" width="8.27" height="8.27" rx="3" fill="#f59e0b"/>
                      <rect x="23.23" y="13.87" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="23.23" width="8.27" height="8.27" rx="3" fill="#ef4444"/>
                      <rect x="13.87" y="23.23" width="8.27" height="8.27" rx="3" fill="#f59e0b" opacity="0.5"/>
                      <rect x="23.23" y="23.23" width="8.27" height="8.27" rx="3" fill="#334155"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                    <span style="color:#10b981;font-weight:400;opacity:0.5;">[</span>GP<span style="color:#10b981;font-weight:400;opacity:0.5;">]</span><span style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:300;color:#10b981;letter-spacing:0.18em;margin-left:2px;">DASH</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:22px;font-weight:600;color:#0f172a;line-height:1.3;">
                Sign in to GPDash
              </h1>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
                Use this code to sign in to your account.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:18px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;">
                    <div style="font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:30px;font-weight:600;color:#0f172a;letter-spacing:0.3em;">
                      {{ .Token }}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                Or click here to sign in:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
                <tr>
                  <td style="border-radius:8px;background:#0891b2;">
                    <a href="{{ .ConfirmationURL }}"
                       style="display:inline-block;padding:11px 22px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Sign in to GPDash
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">
                The code and link expire in 1&nbsp;hour.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.5;">
              Didn't try to sign in? Ignore this email — nobody can use the
              code without your inbox.
            </td>
          </tr>
        </table>
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin-top:18px;">
          <tr>
            <td align="center" style="font-size:11px;color:#94a3b8;">GPDash · GP practice management</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 4. Change Email Address

**Subject**: `Confirm your new email address`

Sent to the NEW address when a user changes their email. Same shape as
the others; just change the heading + copy.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f8fafc;opacity:0;">
    Confirm your new email address for GPDash.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">

          <tr>
            <td style="padding:28px 32px 24px;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                      <rect width="36" height="36" rx="7.6" fill="#1e293b"/>
                      <rect x="4.5" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981"/>
                      <rect x="13.87" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="23.23" y="4.5" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="13.87" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="13.87" y="13.87" width="8.27" height="8.27" rx="3" fill="#f59e0b"/>
                      <rect x="23.23" y="13.87" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="23.23" width="8.27" height="8.27" rx="3" fill="#ef4444"/>
                      <rect x="13.87" y="23.23" width="8.27" height="8.27" rx="3" fill="#f59e0b" opacity="0.5"/>
                      <rect x="23.23" y="23.23" width="8.27" height="8.27" rx="3" fill="#334155"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                    <span style="color:#10b981;font-weight:400;opacity:0.5;">[</span>GP<span style="color:#10b981;font-weight:400;opacity:0.5;">]</span><span style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:300;color:#10b981;letter-spacing:0.18em;margin-left:2px;">DASH</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:22px;font-weight:600;color:#0f172a;line-height:1.3;">
                Confirm your new email
              </h1>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
                You asked to change the email address on your GPDash
                account to this one. Confirm the change with the code below.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:18px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;">
                    <div style="font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:30px;font-weight:600;color:#0f172a;letter-spacing:0.3em;">
                      {{ .Token }}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                Or click here to confirm:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
                <tr>
                  <td style="border-radius:8px;background:#0891b2;">
                    <a href="{{ .ConfirmationURL }}"
                       style="display:inline-block;padding:11px 22px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Confirm new email
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.5;">
              Didn't ask to change your email? Sign in to GPDash and check your
              account security — somebody else may have access.
            </td>
          </tr>
        </table>
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin-top:18px;">
          <tr>
            <td align="center" style="font-size:11px;color:#94a3b8;">GPDash · GP practice management</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 5. (Reserved) Invite User

We don't currently use Supabase's invite_user template — GPDash invites
have their own flow with a custom UUID landing page (`/v4/invite/[id]`).
If we ever switch to auto-emailed invites via Resend's API directly,
the design will be re-used here.

---

## Sender configuration (Supabase → SMTP)

For these templates to actually send, the SMTP settings must be configured
correctly:

- **Sender email**: `noreply@gpdash.net` (or `hello@gpdash.net`)
- **Sender name**: `GPDash`
- **Host**: `smtp.resend.com`
- **Port**: `465`
- **Username**: `resend`
- **Password**: your Resend API key
- **Domain verification**: `gpdash.net` must show "Verified" in
  resend.com/domains (3 DNS records — MX, SPF TXT, DKIM TXT —
  added at your DNS provider)

If sends fail with "550 The gpdash.net domain is not verified", the DNS
records haven't propagated or aren't correct. Check Resend's domain page
for which one is failing.
