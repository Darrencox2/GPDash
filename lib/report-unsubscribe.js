// Acting on "stop sending this to me".
//
// The person clicking has no GPDash session — a PCN contact never will — so
// everything here runs under the service role and is authorised solely by
// possession of the token that was baked into their copy of the email. That
// makes the token the whole security boundary, which is why it is an opaque
// random UUID minted server-side, never appears in a URL alongside the
// address it belongs to, and only ever unsubscribes the one recipient it
// was issued to.
//
// Server-only: imports the admin client.

import { renderUnsubscribeNotice } from '@/lib/report-email';
import { sendViaResend } from '@/lib/report-delivery';
import { describeReportSchedule, nextSendAt, recipientTokenFilter } from '@/lib/report-schedules';

// Find the schedule and recipient a token belongs to. Returns null when the
// token is unknown — including when the schedule has since been deleted,
// which is indistinguishable from a bad token and should look the same.
export async function resolveToken(admin, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;

  const { data: rows, error } = await admin
    .from('report_schedules')
    .select('*, report_schedule_items(saved_report_id, position)')
    .contains('recipients', recipientTokenFilter(token))
    .limit(1);
  if (error || !rows?.length) return null;

  const schedule = rows[0];
  const recipient = (schedule.recipients || []).find(r => r?.token === token);
  if (!recipient) return null;

  const { data: practice } = await admin
    .from('practices').select('name').eq('id', schedule.practice_id).maybeSingle();

  // Names of the reports this email carries, for the confirmation page —
  // "stop the Monday email" means more when it says what is in it.
  const ids = (schedule.report_schedule_items || [])
    .slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(i => i.saved_report_id);
  const { data: reps } = ids.length
    ? await admin.from('saved_reports').select('id, name').in('id', ids)
    : { data: [] };
  const byId = new Map((reps || []).map(r => [r.id, r.name]));

  return {
    schedule,
    recipient,
    practiceName: practice?.name || 'your practice',
    reportNames: ids.map(id => byId.get(id)).filter(Boolean),
    alreadyOff: !!recipient.unsubscribedAt,
  };
}

// Perform the opt-out. `scope` is 'schedule' (this email) or 'practice'
// (every report email from this practice).
//
// Idempotent: clicking twice, or a mail client firing one-click at the same
// moment as the human clicks, must not produce two different outcomes or a
// second notification.
export async function applyUnsubscribe(admin, resolved, scope = 'schedule', siteUrl = '') {
  const { schedule, recipient } = resolved;
  const now = new Date().toISOString();
  const wasAlreadyOff = !!recipient.unsubscribedAt;

  const recipients = (schedule.recipients || []).map(r =>
    r?.token === recipient.token
      ? { ...r, unsubscribedAt: r.unsubscribedAt || now, unsubscribedScope: scope }
      : r,
  );

  // Anyone still due to receive this schedule after the change.
  const remaining = recipients.filter(r => r?.email && !r.unsubscribedAt);

  const update = { recipients };
  let paused = false;
  if (remaining.length === 0 && schedule.active) {
    // An active schedule that can never send is a lie. Pause it and say why.
    update.active = false;
    update.next_send_at = null;
    update.pause_reason = 'Everyone on this schedule unsubscribed.';
    paused = true;
  }
  await admin.from('report_schedules').update(update).eq('id', schedule.id);

  if (scope === 'practice') {
    // Suppression outlives the schedules, so adding the address to a new
    // schedule tomorrow does not quietly resume sending.
    await admin.from('report_email_optouts').upsert({
      practice_id: schedule.practice_id,
      email: String(recipient.email).toLowerCase(),
      source_schedule_id: schedule.id,
    }, { onConflict: 'practice_id,email' });
  }

  // Tell the organiser — but only on the transition, never on a repeat
  // click, and never about their own unsubscribe.
  let notified = null;
  if (!wasAlreadyOff) {
    notified = await notifyOrganiser(admin, { resolved, scope, paused, siteUrl });
  }

  return { paused, scope, notified, alreadyOff: wasAlreadyOff };
}

// Email whoever created the schedule. Deliberately never blocks or reverses
// the unsubscribe: the person asked to stop receiving emails, and failing to
// tell somebody else is not a reason to keep sending to them.
async function notifyOrganiser(admin, { resolved, scope, paused, siteUrl }) {
  try {
    const { schedule, practiceName, reportNames, recipient } = resolved;
    if (!schedule.created_by) return { sent: false, reason: 'no organiser recorded' };

    const { data: profile } = await admin
      .from('profiles').select('id, first_name, last_name').eq('id', schedule.created_by).maybeSingle();

    const { data: authUser } = await admin.auth.admin.getUserById(schedule.created_by);
    const to = authUser?.user?.email;
    if (!to) return { sent: false, reason: 'organiser account no longer has an email' };

    // Telling you that you unsubscribed yourself is noise.
    if (to.toLowerCase() === String(recipient.email).toLowerCase()) {
      return { sent: false, reason: 'organiser unsubscribed themselves' };
    }

    const organiserName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
    const { subject, html, text } = renderUnsubscribeNotice({
      organiserName,
      practiceName,
      recipientEmail: recipient.email,
      recipientName: recipient.name || '',
      reportNames,
      scheduleLabel: describeReportSchedule(schedule),
      scope,
      paused,
      siteUrl,
    });

    const res = await sendViaResend({ to: [to], subject, html, text });
    return { sent: res.ok, reason: res.ok ? null : res.error };
  } catch (err) {
    return { sent: false, reason: err?.message || 'notification failed' };
  }
}

// Undo, offered on the confirmation page straight after unsubscribing.
//
// A misclick in an email footer is common, and without this the only route
// back is emailing the practice and asking an admin to re-add you — which
// most people will not do. Authorised by the same token, so it can only
// ever restore the person it was issued to.
//
// The organiser is not emailed again. They were told about the opt-out; a
// second message saying it was undone seconds later is noise, and the app
// shows the current state either way.
export async function undoUnsubscribe(admin, resolved) {
  const { schedule, recipient } = resolved;

  const recipients = (schedule.recipients || []).map(r => {
    if (r?.token !== recipient.token) return r;
    const { unsubscribedAt, unsubscribedScope, ...rest } = r;
    return rest;
  });

  const update = { recipients };
  // If this schedule switched itself off because everyone had left, undoing
  // that last opt-out should put it back exactly as it was — otherwise the
  // undo silently only half works.
  let resumed = false;
  if (!schedule.active && schedule.pause_reason) {
    const next = nextSendAt(schedule, new Date());
    update.active = true;
    update.pause_reason = null;
    update.next_send_at = next ? next.toISOString() : null;
    resumed = true;
  }
  await admin.from('report_schedules').update(update).eq('id', schedule.id);

  // A practice-wide opt-out has to be lifted too, or the address stays
  // suppressed and the undo appears to work while nothing arrives.
  await admin.from('report_email_optouts')
    .delete()
    .eq('practice_id', schedule.practice_id)
    .eq('email', String(recipient.email).toLowerCase());

  return { resumed };
}
