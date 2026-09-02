// Server-side delivery of a scheduled report email.
//
// Shared by the pg_cron dispatcher (/api/cron/scheduled-reports) and the
// "Send test to me now" button (/api/v4/report-schedules/test), so a test
// send exercises the real path rather than a lookalike. If the test
// arrives, the schedule works.
//
// The whole point of doing this in Node rather than in the Edge Function
// that sends invite emails: this module imports lib/workload-report.js —
// the same engine the dashboard renders from. The emailed numbers are
// computed by the same code as the on-screen ones, from the same stored
// CSV, so they cannot drift.
//
// NEVER import this from client code: it reads the service-role client.

import { createAdminClient } from '@/utils/supabase/admin';
import { buildFacts, buildSessionFacts, runReport } from '@/lib/workload-report';
import { renderReportEmail } from '@/lib/report-email';
import { nextSendAt, describeReportSchedule, activeRecipients } from '@/lib/report-schedules';
import { randomUUID } from 'node:crypto';
import { isEmail } from '@/lib/api-helpers';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// ─── Data ────────────────────────────────────────────────────────────────

// Everything a report needs, read as the system. Mirrors what the
// dashboard hands WorkloadReportBuilder: the clinician list, the practice
// huddle settings (which define urgent/routine and the duty slots), and
// the parsed CSV blob.
export async function loadReportContext(admin, practiceId) {
  const [{ data: practice }, { data: clinicianRows }, { data: settings }, { data: csv }] = await Promise.all([
    admin.from('practices').select('id, name').eq('id', practiceId).maybeSingle(),
    admin.from('clinicians').select('id, name, role, status').eq('practice_id', practiceId),
    admin.from('practice_settings').select('huddle_settings').eq('practice_id', practiceId).maybeSingle(),
    admin.from('huddle_csv_data').select('data, updated_at').eq('practice_id', practiceId).maybeSingle(),
  ]);

  return {
    practiceName: practice?.name || 'Your practice',
    // Same filter the builder applies — people who have left do not
    // silently reappear in a report just because it runs unattended.
    clinicians: (clinicianRows || [])
      .filter(c => c.status !== 'left')
      .map(c => ({ id: c.id, name: c.name, role: c.role || 'Unspecified' })),
    huddleSettings: settings?.huddle_settings || {},
    huddleData: csv?.data || null,
    huddleUpdatedAt: csv?.updated_at || null,
  };
}

// Run the report engine over that context. Returns null when there is no
// CSV at all — the caller decides whether that is a skip or a send.
export function runSavedReport(ctx, config) {
  if (!ctx?.huddleData) return null;
  const slotData = buildFacts(ctx.huddleData, ctx.clinicians, ctx.huddleSettings);
  // Both builders return a wrapper ({ facts, ... }); runReport wants the
  // array inside it. Same two lines the on-screen builder runs.
  const facts = config?.grain === 'sessions'
    ? buildSessionFacts(slotData.facts, ctx.huddleSettings?.dutyDoctorSlot).facts
    : slotData.facts;
  return runReport(facts || [], config);
}

// ─── Sending ─────────────────────────────────────────────────────────────

// One Resend call per send. Recipients go in `to` — everyone on a
// schedule is a deliberate, named recipient of the same practice report,
// so BCC would only hide from each of them who else is getting the
// practice's data.
export async function sendViaResend({ to, subject, html, text, attachments, headers, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'Email sending is not configured for this deployment (RESEND_API_KEY is unset).' };

  const from = process.env.REPORT_FROM_EMAIL || process.env.FROM_EMAIL || 'noreply@gpdash.net';
  const fromName = process.env.FROM_NAME || 'GPDash';

  const payload = {
    from: `${fromName} <${from}>`,
    to,
    subject,
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(headers ? { headers } : {}),
    ...((attachments && attachments.length) ? {
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'utf8').toString('base64'),
      })),
    } : {}),
  };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.message || body?.error?.message || `Resend returned ${res.status}` };
    }
    return { ok: true, providerId: body?.id || null };
  } catch (err) {
    return { ok: false, error: err?.message || 'Network error calling Resend' };
  }
}

// ─── Orchestration ───────────────────────────────────────────────────────

function validRecipients(recipients) {
  const seen = new Set();
  return (Array.isArray(recipients) ? recipients : [])
    .map(r => (typeof r === 'string' ? { email: r } : r))
    .filter(r => r && isEmail(r.email))
    .filter(r => {
      const k = r.email.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

// Every recipient needs an unsubscribe token, and the server mints them
// rather than the browser: it keeps token generation in one place, and it
// back-fills schedules saved before unsubscribe links existed. Persisted
// only when something was actually added, so a normal send does no extra
// write.
async function ensureTokens(admin, schedule) {
  const recipients = Array.isArray(schedule.recipients) ? schedule.recipients : [];
  let changed = false;
  const withTokens = recipients.map(r => {
    if (r && r.email && !r.token) { changed = true; return { ...r, token: randomUUID() }; }
    return r;
  });
  if (changed && schedule.id) {
    await admin.from('report_schedules').update({ recipients: withTokens }).eq('id', schedule.id);
  }
  return withTokens;
}

// Addresses that have opted out of every report email from this practice.
async function suppressedFor(admin, practiceId) {
  const { data } = await admin
    .from('report_email_optouts').select('email').eq('practice_id', practiceId);
  return new Set((data || []).map(r => String(r.email).toLowerCase()));
}

// Build and send one schedule. Writes a report_send_log row whatever
// happens, then advances next_send_at.
//
// `kind` is 'scheduled' or 'test'. A test send goes only to `overrideTo`
// and never touches next_send_at or last_status — testing a schedule must
// not consume its next run or rewrite its delivery history.
export async function deliverSchedule(admin, schedule, { kind = 'scheduled', overrideTo = null, siteUrl, now = new Date() } = {}) {
  const log = {
    schedule_id: schedule.id,
    practice_id: schedule.practice_id,
    kind,
    status: 'failed',
    recipient_count: 0,
    external_count: 0,
    report_names: null,
    error: null,
    provider_id: null,
    recipients: null,
    triggered_by: schedule._triggeredBy || null,
  };

  try {
    // Which reports this email carries, in the order the practice set.
    // schedule._reportIds lets an unsaved draft be tested before it has
    // any rows in report_schedule_items.
    let reportIds = schedule._reportIds;
    if (!reportIds) {
      const { data: items } = await admin
        .from('report_schedule_items')
        .select('saved_report_id, position')
        .eq('schedule_id', schedule.id)
        .order('position', { ascending: true });
      reportIds = (items || []).map(i => i.saved_report_id);
    }

    if (reportIds.length === 0) {
      log.error = 'This schedule has no reports in it.';
      log.status = 'skipped';
      return await finish(admin, schedule, log, kind, now);
    }

    const { data: rows } = await admin
      .from('saved_reports')
      .select('id, name, config')
      .in('id', reportIds);

    // Preserve the practice's chosen order, and drop any report deleted
    // since. The cascade should make that unreachable for saved
    // schedules, but a draft can carry a stale id from an open tab.
    const byId = new Map((rows || []).map(r => [r.id, r]));
    const reportRows = reportIds.map(id => byId.get(id)).filter(Boolean);

    if (reportRows.length === 0) {
      log.error = 'Every report this schedule pointed at has been deleted.';
      log.status = 'skipped';
      return await finish(admin, schedule, log, kind, now);
    }
    log.report_names = reportRows.map(r => r.name);

    let recipients;
    if (overrideTo) {
      // A test goes to the requester regardless of any opt-out: they asked
      // for it just now, in the app, so it is not an unsolicited send.
      recipients = validRecipients([{ email: overrideTo, name: '', external: false }]);
    } else {
      const withTokens = await ensureTokens(admin, schedule);
      const suppressed = await suppressedFor(admin, schedule.practice_id);
      recipients = activeRecipients(validRecipients(withTokens), suppressed);
    }

    if (recipients.length === 0) {
      log.error = overrideTo
        ? 'No valid address to send the test to.'
        : 'Nobody is left on this schedule — every recipient has unsubscribed or been removed.';
      log.status = 'skipped';
      return await finish(admin, schedule, log, kind, now);
    }
    log.recipient_count = recipients.length;
    log.external_count = recipients.filter(r => r.external).length;
    log.recipients = recipients.map(r => ({ email: r.email, external: !!r.external }));

    const ctx = await loadReportContext(admin, schedule.practice_id);
    if (!ctx.huddleData) {
      // No CSV at all. Skipping is right: an email of empty charts, for a
      // reason invisible from the email itself, is worse than no email.
      // The log row records why.
      log.error = 'No appointment CSV has been uploaded for this practice, so there is nothing to report on.';
      log.status = 'skipped';
      return await finish(admin, schedule, log, kind, now);
    }

    // A report that yields nothing still gets its section, saying so —
    // silently dropping it would leave the recipient unaware it was meant
    // to be there.
    const reports = reportRows.map(r => ({
      reportName: r.name,
      config: r.config,
      result: runSavedReport(ctx, r.config),
    })).filter(r => r.result);

    if (reports.length === 0) {
      log.error = 'None of the reports in this schedule could be built from the current data.';
      log.status = 'skipped';
      return await finish(admin, schedule, log, kind, now);
    }

    // One message per recipient, because each carries its own unsubscribe
    // token and a shared link would let anyone remove anyone. It also stops
    // recipients seeing each other's addresses in the To: header, which a
    // single multi-recipient send always did.
    const results = [];
    for (const r of recipients) {
      const rendered = renderReportEmail({
        reports,
        practiceName: ctx.practiceName,
        layout: schedule.layout,
        intro: schedule.intro || '',
        subject: schedule.subject || '',
        siteUrl,
        scheduleLabel: describeReportSchedule(schedule),
        dataUpdatedAt: ctx.huddleUpdatedAt,
        now,
        unsubscribeToken: kind === 'test' ? null : r.token || null,
      });
      results.push(await sendViaResend({
        to: [r.email],
        subject: kind === 'test' ? `[Test] ${rendered.subject}` : rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments: rendered.attachments,
        headers: rendered.headers,
      }));
    }

    const okCount = results.filter(x => x.ok).length;
    const failed = results.filter(x => !x.ok);
    // Partial delivery is reported as failed with the reason, rather than
    // as success, so a schedule that reaches four people out of five does
    // not read as healthy.
    log.status = okCount === 0 ? 'failed' : failed.length ? 'failed' : 'sent';
    log.provider_id = results.find(x => x.ok)?.providerId || null;
    log.error = failed.length
      ? `${okCount} of ${results.length} delivered. ${failed[0].error}`
      : null;
    return await finish(admin, schedule, log, kind, now);
  } catch (err) {
    log.status = 'failed';
    log.error = err?.message || 'Unexpected error while building the report.';
    return await finish(admin, schedule, log, kind, now);
  }
}

// Write the log row and move the schedule on. Always advances
// next_send_at, even after a failure: a bad address must not wedge the
// queue so that this schedule is re-attempted every 15 minutes forever,
// and must not block other practices behind it.
async function finish(admin, schedule, log, kind, now) {
  try {
    await admin.from('report_send_log').insert(log);
  } catch { /* the update below matters more than the audit row */ }

  if (kind !== 'test') {
    const next = nextSendAt(schedule, now);
    try {
      await admin.from('report_schedules').update({
        last_sent_at: now.toISOString(),
        last_status: log.status,
        last_error: log.error,
        next_send_at: next ? next.toISOString() : null,
      }).eq('id', schedule.id);
    } catch { /* reported via the log row */ }
  }

  return { id: schedule.id, status: log.status, error: log.error, recipients: log.recipient_count };
}

export { createAdminClient };
