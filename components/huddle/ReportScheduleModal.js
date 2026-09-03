'use client';
// Scheduled report setup.
//
// Opened from an open report via "Email on a schedule". Left half is a
// live preview; right half is the controls. The preview is not a mockup:
// it calls the same renderReportEmail() the server calls, on the same
// result object the chart on screen was drawn from, and drops the output
// into an iframe. What you see here is the bytes that get sent.
//
// A schedule points at SAVED reports, not at config snapshots, so this
// only opens once the report has been saved. That is the deliberate
// bargain: perfect the report, save it, and every future send follows
// your edits instead of freezing an old version.
//
// One email can carry several reports, so a practice gets one Monday
// digest instead of four separate emails. The report the modal was opened
// from starts selected; any other saved report can be added, and they can
// be reordered. Existing schedules are all listed, so the natural move —
// "add this report to the Monday email I already have" — is one click.

import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { renderReportEmail } from '@/lib/report-email';
import {
  CADENCE_OPTIONS, MINUTE_OPTIONS, DEFAULT_LAYOUT, normaliseLayout,
  nextSends, describeReportSchedule, formatSendTime,
} from '@/lib/report-schedules';
import { DOW_LABELS, NTH_LABELS } from '@/lib/meeting-schedules';
import { isEmail } from '@/lib/parse-emails';
import { onKeyActivate } from '@/lib/a11y';

const ACCENT = '#0891b2';

function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`flex items-start gap-2.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={!!checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="accent-cyan-500 mt-0.5" style={{ width: 15, height: 15, flexShrink: 0 }} />
      <span className="min-w-0">
        <span className="block text-xs font-medium" style={{ color: 'var(--g-text-hi)' }}>{label}</span>
        {hint && <span className="block text-[11px] leading-snug mt-0.5" style={{ color: 'var(--g-text-faint)' }}>{hint}</span>}
      </span>
    </label>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap" style={{ background: 'var(--g-field)', borderRadius: 'var(--r-sm)', padding: 2, gap: 2 }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)}
            className="text-xs font-medium px-2.5 py-1 rounded"
            style={{ background: active ? ACCENT : 'transparent', color: active ? '#fff' : 'var(--g-text-mid)', border: 'none', cursor: 'pointer' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Group({ n, title, children }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center text-[11px] font-bold rounded-full"
          style={{ width: 17, height: 17, background: 'rgba(8,145,178,0.25)', color: 'var(--c-cyan)' }}>{n}</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--g-text-hi)' }}>{title}</span>
      </div>
      <div className="pl-[25px] space-y-2.5">{children}</div>
    </div>
  );
}

export default function ReportScheduleModal({
  open, onClose, practiceId, userId, practiceName,
  savedReportId, reportName, result, config, canEdit, toast,
  savedReports = [], runFor,
}) {
  const supabase = useMemo(() => createClient(), []);

  const [schedules, setSchedules] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);   // null = composing a new one
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastLog, setLastLog] = useState([]);

  // ─── Draft state ───────────────────────────────────────────────────────
  const [cadence, setCadence] = useState('weekly');
  const [dow, setDow] = useState(1);
  const [dom, setDom] = useState(1);
  const [wom, setWom] = useState(1);
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [recipients, setRecipients] = useState([]);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [subject, setSubject] = useState('');
  const [intro, setIntro] = useState('');
  const [active, setActive] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  // Ordered ids of the reports this email carries.
  const [reportIds, setReportIds] = useState([]);
  // Addresses that opted out of every report email from this practice.
  // Re-adding one has to be blocked, or the setup screen quietly undoes
  // somebody's unsubscribe.
  const [optedOut, setOptedOut] = useState(() => new Set());
  const [previewWide, setPreviewWide] = useState(true);

  const memberEmails = useMemo(
    () => new Set(members.map(m => (m.email || '').toLowerCase()).filter(Boolean)),
    [members],
  );

  const resetDraft = () => {
    setEditingId(null);
    setReportIds(savedReportId ? [savedReportId] : []);
    setCadence('weekly'); setDow(1); setDom(1); setWom(1); setHour(8); setMinute(0);
    setRecipients([]); setLayout(DEFAULT_LAYOUT); setSubject(''); setIntro(''); setActive(true);
  };

  // ─── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !practiceId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Every schedule for the practice, not just ones already carrying
      // this report — adding this report to an existing Monday email is
      // the whole point of bundling.
      const [sch, mem, outs] = await Promise.all([
        supabase.from('report_schedules')
          .select('*, report_schedule_items(saved_report_id, position)')
          .eq('practice_id', practiceId).order('created_at'),
        supabase.rpc('list_practice_members', { target_practice_id: practiceId }),
        supabase.from('report_email_optouts').select('email').eq('practice_id', practiceId),
      ]);
      if (cancelled) return;
      setSchedules(sch.data || []);
      setMembers((mem.data || []).filter(m => m.email));
      setOptedOut(new Set((outs.data || []).map(o => String(o.email).toLowerCase())));
      setReportIds(savedReportId ? [savedReportId] : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, practiceId, savedReportId, supabase]);

  // Delivery history for the schedules on this report — "did Monday's go?"
  useEffect(() => {
    if (!open || !practiceId || schedules.length === 0) { setLastLog([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('report_send_log')
        .select('schedule_id, sent_at, status, error, recipient_count, kind')
        .in('schedule_id', schedules.map(s => s.id))
        .order('sent_at', { ascending: false })
        .limit(30);
      if (!cancelled) setLastLog(data || []);
    })();
    return () => { cancelled = true; };
  }, [open, practiceId, schedules, supabase]);

  const itemIdsOf = (s) => (s.report_schedule_items || [])
    .slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(i => i.saved_report_id);

  const loadInto = (s) => {
    setEditingId(s.id);
    setReportIds(itemIdsOf(s));
    setCadence(s.cadence); setDow(s.day_of_week ?? 1); setDom(s.day_of_month ?? 1);
    setWom(s.week_of_month ?? 1); setHour(s.send_hour ?? 8); setMinute(s.send_minute ?? 0);
    setRecipients(Array.isArray(s.recipients) ? s.recipients : []);
    setLayout(normaliseLayout(s.layout)); setSubject(s.subject || ''); setIntro(s.intro || '');
    setActive(s.active !== false);
  };

  // ─── Derived ───────────────────────────────────────────────────────────
  const draft = useMemo(() => ({
    cadence,
    day_of_week: ['weekly', 'fortnightly', 'monthly_nth'].includes(cadence) ? dow : null,
    day_of_month: cadence === 'monthly' ? dom : null,
    week_of_month: cadence === 'monthly_nth' ? wom : null,
    send_hour: hour, send_minute: minute,
  }), [cadence, dow, dom, wom, hour, minute]);

  const upcoming = useMemo(() => nextSends(draft, 3), [draft]);

  // The reports this email carries, in order, each with its figures.
  // The one the modal was opened from reuses the result already on
  // screen; the others are run through the same engine via runFor, which
  // the builder hands down along with the facts it already has.
  const bundle = useMemo(() => {
    return reportIds.map(id => {
      if (id === savedReportId && result) return { reportName, result, config };
      const rep = savedReports.find(r => r.id === id);
      if (!rep || !runFor) return null;
      try {
        return { reportName: rep.name, config: rep.config, result: runFor(rep.config) };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }, [reportIds, savedReportId, result, reportName, config, savedReports, runFor]);

  // The preview. Pure render, no network — the same call the server makes.
  const preview = useMemo(() => {
    if (bundle.length === 0) return null;
    try {
      return renderReportEmail({
        reports: bundle, practiceName, layout, intro, subject,
        siteUrl: typeof window !== 'undefined' ? window.location.origin : 'https://gpdash.net',
        scheduleLabel: describeReportSchedule(draft),
      });
    } catch {
      return null;
    }
  }, [bundle, practiceName, layout, intro, subject, draft]);

  const externalCount = recipients
    .filter(r => !r.unsubscribedAt)
    .filter(r => !memberEmails.has((r.email || '').toLowerCase())).length;

  // ─── Recipients ────────────────────────────────────────────────────────
  const addRecipient = (email, name) => {
    const clean = (email || '').trim().toLowerCase();
    if (!isEmail(clean)) { toast?.('That does not look like an email address', 'error'); return; }
    if (recipients.some(r => (r.email || '').toLowerCase() === clean)) return;
    if (optedOut.has(clean)) {
      toast?.('That person asked to stop receiving report emails from this practice. They need to ask to be put back on.', 'error');
      return;
    }
    setRecipients(rs => [...rs, { email: clean, name: name || '', external: !memberEmails.has(clean) }]);
  };
  const activeCount = recipients.filter(r => !r.unsubscribedAt).length;

  const moveReport = (i, delta) => setReportIds(ids => {
    const j = i + delta;
    if (j < 0 || j >= ids.length) return ids;
    const next = ids.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const removeRecipient = (email) =>
    setRecipients(rs => rs.filter(r => (r.email || '').toLowerCase() !== (email || '').toLowerCase()));

  // ─── Persist ───────────────────────────────────────────────────────────
  const save = async () => {
    if (!canEdit || activeCount === 0 || reportIds.length === 0) return;
    setSaving(true);
    try {
      const next = nextSends(draft, 1)[0];
      const row = {
        practice_id: practiceId,
        ...draft,
        // Fortnightly parity is anchored on the first send, so "every
        // other Tuesday" keeps landing on the Tuesdays you chose rather
        // than drifting to the alternate week on the next edit.
        anchor_date: cadence === 'fortnightly' && next
          ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(next)
          : null,
        // token and unsubscribedAt are carried through untouched: an edit
        // must never resubscribe someone who opted out, and must never
        // invalidate the link in an email already sitting in their inbox.
        recipients: recipients.map(r => ({
          email: r.email, name: r.name || '',
          external: !memberEmails.has((r.email || '').toLowerCase()),
          ...(r.token ? { token: r.token } : {}),
          ...(r.unsubscribedAt ? { unsubscribedAt: r.unsubscribedAt, unsubscribedScope: r.unsubscribedScope } : {}),
        })),
        layout: normaliseLayout(layout),
        subject: subject.trim() || null,
        intro: intro.trim() || null,
        active,
        next_send_at: active && next ? next.toISOString() : null,
        updated_by: userId,
      };
      let saved;
      if (editingId) {
        const { data, error } = await supabase.from('report_schedules').update(row).eq('id', editingId).select().single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase.from('report_schedules')
          .insert({ ...row, created_by: userId }).select().single();
        if (error) throw error;
        saved = data;
      }

      // Replace the contents wholesale. Simpler than diffing, and the set
      // is a handful of rows; position is the array index so the email
      // sections come out in the order shown here.
      const { error: delErr } = await supabase.from('report_schedule_items').delete().eq('schedule_id', saved.id);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from('report_schedule_items')
        .insert(reportIds.map((id, i) => ({ schedule_id: saved.id, saved_report_id: id, position: i })));
      if (insErr) throw insErr;

      const withItems = { ...saved, report_schedule_items: reportIds.map((id, i) => ({ saved_report_id: id, position: i })) };
      setSchedules(prev => prev.some(x => x.id === withItems.id)
        ? prev.map(x => (x.id === withItems.id ? withItems : x))
        : [...prev, withItems]);
      setEditingId(saved.id);
      const n = reportIds.length;
      toast?.(active
        ? `${n} report${n === 1 ? '' : 's'} scheduled — ${describeReportSchedule(saved).toLowerCase()}`
        : 'Saved, but paused', 'success');
    } catch (err) {
      toast?.(err?.message || 'Could not save the schedule', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async (s) => {
    const nowActive = !s.active;
    const next = nowActive ? nextSends(s, 1)[0] : null;
    const { data, error } = await supabase.from('report_schedules')
      .update({ active: nowActive, next_send_at: next ? next.toISOString() : null, updated_by: userId })
      .eq('id', s.id).select().single();
    if (error) { toast?.('Could not change that schedule', 'error'); return; }
    setSchedules(prev => prev.map(x => (x.id === data.id ? data : x)));
    if (editingId === data.id) setActive(nowActive);
    toast?.(nowActive ? 'Schedule resumed' : 'Schedule paused', 'success');
  };

  const remove = async (s) => {
    const { error } = await supabase.from('report_schedules').delete().eq('id', s.id);
    if (error) { toast?.('Could not delete that schedule', 'error'); return; }
    setSchedules(prev => prev.filter(x => x.id !== s.id));
    if (editingId === s.id) resetDraft();
    toast?.('Schedule deleted', 'success');
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/v4/report-schedules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: editingId || undefined,
          practiceId, reportIds,
          ...draft, layout: normaliseLayout(layout),
          subject: subject.trim(), intro: intro.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) toast?.(`Test sent to ${json.sentTo}`, 'success');
      else toast?.(json.error || 'The test email could not be sent', 'error');
    } catch {
      toast?.('The test email could not be sent', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  const unaddedMembers = members.filter(m => !recipients.some(r => (r.email || '').toLowerCase() === (m.email || '').toLowerCase()));
  const logFor = (id) => lastLog.find(l => l.schedule_id === id && l.kind === 'scheduled');

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(2,6,23,0.72)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-6xl rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--g-panel)', border: '1px solid var(--g-border)', maxHeight: '94vh' }}>

        {/* Header */}
        <div className="px-5 py-3.5 flex items-center justify-between gap-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--g-border)', background: 'linear-gradient(180deg, rgba(8,145,178,0.12), transparent)' }}>
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate" style={{ color: 'var(--g-text-hi)' }}>Email this report on a schedule</h2>
            <p className="text-xs truncate" style={{ color: 'var(--g-text-faint)' }}>{reportName}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none px-2 flex-shrink-0"
            style={{ background: 'none', border: 'none', color: 'var(--g-text-mid)', cursor: 'pointer' }} aria-label="Close">×</button>
        </div>

        <div className="flex flex-col lg:flex-row min-h-0 flex-1">

          {/* ─── PREVIEW ─────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ background: 'var(--g-panel-2)', borderRight: '1px solid var(--g-border)' }}>
            <div className="px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--g-border)' }}>
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--g-text-faint)' }}>
                Live preview — this is the email
              </span>
              <Seg options={[{ id: 'wide', label: 'Desktop' }, { id: 'narrow', label: 'Phone' }]}
                value={previewWide ? 'wide' : 'narrow'} onChange={(v) => setPreviewWide(v === 'wide')} />
            </div>
            <div className="flex-1 overflow-auto p-3" style={{ minHeight: 320 }}>
              {preview ? (
                <iframe
                  title="Email preview"
                  srcDoc={preview.html}
                  sandbox=""
                  style={{
                    width: previewWide ? '100%' : 400, minWidth: previewWide ? 0 : 400,
                    height: '100%', minHeight: 560, border: '1px solid var(--g-border)',
                    borderRadius: 10, background: '#f8fafc', margin: previewWide ? 0 : '0 auto', display: 'block',
                  }}
                />
              ) : (
                <p className="text-sm text-center py-16" style={{ color: 'var(--g-text-faint)' }}>
                  Pick at least one report and the email will appear here.
                </p>
              )}
            </div>
            <div className="px-4 py-2 text-[11px] flex-shrink-0" style={{ borderTop: '1px solid var(--g-border)', color: 'var(--g-text-faint)' }}>
              Subject: <span style={{ color: 'var(--g-text-mid)' }}>{preview?.subject || '—'}</span>
              {layout.csv && preview?.attachments?.length > 0 && <> · attaches <span style={{ color: 'var(--g-text-mid)' }}>{preview.attachments.map(a => a.filename).join(', ')}</span></>}
            </div>
          </div>

          {/* ─── CONTROLS ────────────────────────────────────────────── */}
          <div className="w-full lg:w-[380px] lg:flex-shrink-0 overflow-y-auto p-4 space-y-5">

            {/* Existing schedules */}
            {!loading && schedules.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--g-text-faint)' }}>
                  Scheduled emails
                </div>
                {schedules.map(s => {
                  const log = logFor(s.id);
                  const isOpen = editingId === s.id;
                  return (
                    <div key={s.id} role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={() => loadInto(s)}
                      className="rounded-lg px-3 py-2 cursor-pointer"
                      style={{ background: isOpen ? 'rgba(8,145,178,0.12)' : 'var(--g-tile)', border: `1px solid ${isOpen ? 'rgba(8,145,178,0.5)' : 'var(--g-border-2)'}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate" style={{ color: 'var(--g-text-hi)' }}>
                          {describeReportSchedule(s)}
                        </span>
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          {!s.active && <span className="text-[10px] px-1.5 py-0.5 rounded" title={s.pause_reason || 'Paused'} style={{ background: 'var(--g-field)', color: 'var(--g-text-faint)' }}>Paused</span>}
                          <button onClick={(e) => { e.stopPropagation(); togglePause(s); }} title={s.active ? 'Pause' : 'Resume'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--g-text-mid)', fontSize: 12 }}>{s.active ? '⏸' : '▶'}</button>
                          <button onClick={(e) => { e.stopPropagation(); remove(s); }} title="Delete"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-red-2)', fontSize: 12 }}>✕</button>
                        </span>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--g-text-faint)' }}>
                        {itemIdsOf(s).length} report{itemIdsOf(s).length === 1 ? '' : 's'}
                        {' · '}{(s.recipients?.length || 0)} recipient{(s.recipients?.length || 0) === 1 ? '' : 's'}
                        {s.active && s.next_send_at && <> · next {formatSendTime(s.next_send_at)}</>}
                      </div>
                      {/* The reason to bundle: add the open report to an
                          email that already goes out, in one click. */}
                      {!itemIdsOf(s).includes(savedReportId) && (
                        <div className="text-[11px] mt-1" style={{ color: 'var(--c-cyan)' }}>
                          Does not include this report — open it to add it
                        </div>
                      )}
                      {s.pause_reason && (
                        <div className="text-[11px] mt-1" style={{ color: 'var(--c-amber)' }}>{s.pause_reason}</div>
                      )}
                      {/* Delivery truth. A send that silently failed must not look like one that arrived. */}
                      {log && (
                        <div className="text-[11px] mt-1" style={{ color: log.status === 'sent' ? 'var(--c-mint)' : log.status === 'skipped' ? 'var(--c-amber)' : 'var(--c-red)' }}
                          title={log.error || ''}>
                          {log.status === 'sent' ? '✓ Sent' : log.status === 'skipped' ? '⚠ Skipped' : '✕ Failed'} {formatSendTime(log.sent_at)}
                          {log.error ? ` — ${log.error}` : ''}
                        </div>
                      )}
                    </div>
                  );
                })}
                {editingId && (
                  <button onClick={resetDraft} className="text-[11px] px-2 py-1 rounded"
                    style={{ background: 'var(--g-tile)', border: '1px solid var(--g-line)', color: 'var(--g-text-mid)', cursor: 'pointer' }}>
                    + Add another schedule
                  </button>
                )}
              </div>
            )}

            {/* 1. Which reports */}
            <Group n="1" title="Reports in this email">
              {reportIds.length > 0 && (
                <div className="space-y-1">
                  {reportIds.map((id, i) => {
                    const rep = savedReports.find(r => r.id === id);
                    const label = rep ? rep.name : (id === savedReportId ? reportName : 'Report');
                    return (
                      <div key={id} className="flex items-center gap-1.5 rounded-md px-2 py-1.5"
                        style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)' }}>
                        <span className="text-[10px] font-bold flex-shrink-0" style={{ color: 'var(--g-text-faint)', width: 12 }}>{i + 1}</span>
                        <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--g-text-hi)' }} title={label}>{label}</span>
                        <button type="button" onClick={() => moveReport(i, -1)} disabled={i === 0}
                          aria-label="Move up" title="Move up"
                          style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: 'var(--g-text-faint)', opacity: i === 0 ? 0.3 : 1, fontSize: 11 }}>&#9650;</button>
                        <button type="button" onClick={() => moveReport(i, 1)} disabled={i === reportIds.length - 1}
                          aria-label="Move down" title="Move down"
                          style={{ background: 'none', border: 'none', cursor: i === reportIds.length - 1 ? 'default' : 'pointer', color: 'var(--g-text-faint)', opacity: i === reportIds.length - 1 ? 0.3 : 1, fontSize: 11 }}>&#9660;</button>
                        <button type="button" onClick={() => setReportIds(ids => ids.filter(x => x !== id))}
                          aria-label={`Remove ${label}`} title="Remove from this email"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--g-text-faint)' }}>&times;</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {reportIds.length === 0 && (
                <p className="text-[11px]" style={{ color: 'var(--c-amber)' }}>Pick at least one report to send.</p>
              )}

              {savedReports.filter(r => !reportIds.includes(r.id)).length > 0 && (
                <div>
                  <div className="text-[11px] mb-1" style={{ color: 'var(--g-text-faint)' }}>Add another saved report</div>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                    {savedReports.filter(r => !reportIds.includes(r.id)).map(r => (
                      <button key={r.id} type="button" onClick={() => setReportIds(ids => [...ids, r.id])}
                        className="text-[11px] px-2 py-1 rounded-md"
                        style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-mid)', cursor: 'pointer' }}>
                        + {r.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {reportIds.length > 1 && (
                <p className="text-[11px]" style={{ color: 'var(--g-text-faint)' }}>
                  All {reportIds.length} arrive in one email, in this order, each with its own chart.
                </p>
              )}
            </Group>

            {/* 2. When */}
            <Group n="2" title="How often">
              <Seg options={CADENCE_OPTIONS} value={cadence} onChange={setCadence} />

              {['weekly', 'fortnightly', 'monthly_nth'].includes(cadence) && (
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <button key={i} type="button" onClick={() => setDow(i)}
                      className="text-xs px-2 py-1 rounded-md"
                      style={{ background: dow === i ? 'rgba(8,145,178,0.25)' : 'var(--g-tile)', border: `1px solid ${dow === i ? 'rgba(8,145,178,0.55)' : 'var(--g-border-2)'}`, color: dow === i ? 'var(--c-cyan)' : 'var(--g-text-mid)', cursor: 'pointer' }}>
                      {DOW_LABELS[i].slice(0, 3)}
                    </button>
                  ))}
                </div>
              )}

              {cadence === 'monthly_nth' && (
                <Seg options={[1, 2, 3, 4, 5].map(n => ({ id: n, label: NTH_LABELS[n] }))} value={wom} onChange={setWom} />
              )}

              {cadence === 'monthly' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--g-text-mid)' }}>Day</span>
                  <select value={dom} onChange={e => setDom(Number(e.target.value))}
                    className="text-xs rounded px-2 py-1.5"
                    style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)' }}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="text-[11px]" style={{ color: 'var(--g-text-faint)' }}>Capped at 28 so every month has one</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--g-text-mid)' }}>At</span>
                <select value={hour} onChange={e => setHour(Number(e.target.value))}
                  className="text-xs rounded px-2 py-1.5"
                  style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)' }}>
                  {Array.from({ length: 24 }, (_, i) => i).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}</option>)}
                </select>
                <span style={{ color: 'var(--g-text-faint)' }}>:</span>
                <select value={minute} onChange={e => setMinute(Number(e.target.value))}
                  className="text-xs rounded px-2 py-1.5"
                  style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)' }}>
                  {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                </select>
                <span className="text-[11px]" style={{ color: 'var(--g-text-faint)' }}>UK time, all year</span>
              </div>

              {upcoming.length > 0 && (
                <div className="text-[11px] rounded-md px-2.5 py-2" style={{ background: 'var(--g-tile)', color: 'var(--g-text-mid)' }}>
                  Next sends: {upcoming.map(d => formatSendTime(d)).join(' · ')}
                </div>
              )}
            </Group>

            {/* 2. Who */}
            <Group n="3" title="Who gets it">
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {recipients.map(r => {
                    const ext = !memberEmails.has((r.email || '').toLowerCase());
                    const off = !!r.unsubscribedAt;
                    return (
                      <span key={r.email} className="text-[11px] px-2 py-1 rounded-md flex items-center gap-1.5"
                        style={{
                          background: off ? 'var(--g-field)' : ext ? 'rgba(245,158,11,0.15)' : 'var(--g-tile)',
                          border: `1px solid ${off ? 'var(--g-line)' : ext ? 'rgba(245,158,11,0.45)' : 'var(--g-border-2)'}`,
                          color: off ? 'var(--g-text-faint)' : 'var(--g-text-hi)',
                          textDecoration: off ? 'line-through' : 'none',
                        }}
                        title={off ? `Unsubscribed ${formatSendTime(r.unsubscribedAt)}${r.unsubscribedScope === 'practice' ? ' from all report emails' : ''}` : undefined}>
                        {off ? <span title="Unsubscribed">⊘</span> : ext ? <span title="Not a member of this practice">⚠</span> : null}
                        {r.name ? `${r.name} · ${r.email}` : r.email}
                        <button onClick={() => removeRecipient(r.email)} aria-label={`Remove ${r.email}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--g-text-faint)' }}>×</button>
                      </span>
                    );
                  })}
                </div>
              )}

              {recipients.some(r => r.unsubscribedAt) && (
                <div className="text-[11px] rounded-md px-2.5 py-2 leading-snug"
                  style={{ background: 'var(--g-tile)', border: '1px solid var(--g-line)', color: 'var(--g-text-mid)' }}>
                  Struck-through people asked to stop receiving this. They are kept on the list so you can see who left and when.
                  Only they can put themselves back on, from the link in an email they already have.
                </div>
              )}

              {externalCount > 0 && (
                <div className="text-[11px] rounded-md px-2.5 py-2 leading-snug"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: 'var(--c-amber)' }}>
                  {externalCount} recipient{externalCount === 1 ? ' is' : 's are'} not {externalCount === 1 ? 'a member' : 'members'} of {practiceName}.
                  They will receive practice appointment data, including named clinicians, on this schedule. Every send is recorded in the audit log.
                </div>
              )}

              {unaddedMembers.length > 0 && (
                <div>
                  <div className="text-[11px] mb-1" style={{ color: 'var(--g-text-faint)' }}>Add from your practice</div>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                    {unaddedMembers.map(m => (
                      <button key={m.email} type="button" onClick={() => addRecipient(m.email, m.name)}
                        className="text-[11px] px-2 py-1 rounded-md"
                        style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-mid)', cursor: 'pointer' }}>
                        + {m.name || m.email}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(newEmail); setNewEmail(''); } }}
                  placeholder="Or type any email address…"
                  className="flex-1 min-w-0 text-xs rounded px-2 py-1.5"
                  style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }} />
                <button type="button" onClick={() => { addRecipient(newEmail); setNewEmail(''); }}
                  disabled={!newEmail.trim()}
                  className="text-xs px-2.5 py-1.5 rounded"
                  style={{ background: 'var(--g-tile)', border: '1px solid var(--g-line)', color: 'var(--g-text-mid)', cursor: newEmail.trim() ? 'pointer' : 'default', opacity: newEmail.trim() ? 1 : 0.5 }}>Add</button>
              </div>
            </Group>

            {/* 3. What it says */}
            <Group n="4" title="What it says">
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder={`${reportName} — ${practiceName}`}
                className="w-full text-xs rounded px-2 py-1.5"
                style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }} />
              <textarea value={intro} onChange={e => setIntro(e.target.value)} rows={2}
                placeholder="Optional note at the top of the email…"
                className="w-full text-xs rounded px-2 py-1.5 resize-y"
                style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }} />

              <div className="space-y-2 pt-1">
                <Toggle label="Chart" hint="Always included — it is the point of the email" checked disabled onChange={() => {}} />
                <Toggle label="Headline number" hint="The single overall figure, above the chart"
                  checked={layout.headline} onChange={v => setLayout(l => ({ ...l, headline: v }))} />
                <Toggle label="What stands out" hint="One sentence naming the outlier, when there is one"
                  checked={layout.insight} onChange={v => setLayout(l => ({ ...l, insight: v }))} />
                <Toggle label="Full table in the email" hint="Off by default — the CSV carries the detail"
                  checked={layout.table} onChange={v => setLayout(l => ({ ...l, table: v }))} />
                <Toggle label="Attach the CSV" hint="Every row, including any the chart trims"
                  checked={layout.csv} onChange={v => setLayout(l => ({ ...l, csv: v }))} />
                <Toggle label="Warn when the data is stale" hint="Flags it if no CSV has been uploaded for 3+ days"
                  checked={layout.freshness} onChange={v => setLayout(l => ({ ...l, freshness: v }))} />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--g-text-mid)' }}>Rows in the chart</span>
                <select value={layout.topN} onChange={e => setLayout(l => ({ ...l, topN: Number(e.target.value) }))}
                  className="text-xs rounded px-2 py-1.5"
                  style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)' }}>
                  {[8, 10, 12, 15, 20, 30].map(n => <option key={n} value={n}>Top {n}</option>)}
                  <option value={0}>All rows</option>
                </select>
              </div>
            </Group>

            {/* 4. Actions */}
            <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--g-border)', paddingTop: 14 }}>
              <Toggle label="Send on this schedule" hint={active ? describeReportSchedule(draft) : 'Paused — nothing will be sent'}
                checked={active} onChange={setActive} />
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={save} disabled={!canEdit || saving || activeCount === 0 || reportIds.length === 0}
                  className="text-xs font-semibold px-3 py-1.5 rounded"
                  style={{ background: ACCENT, color: '#fff', border: 'none', cursor: (canEdit && activeCount && reportIds.length) ? 'pointer' : 'default', opacity: (!canEdit || saving || !activeCount || !reportIds.length) ? 0.5 : 1 }}>
                  {saving ? '…' : editingId ? 'Save changes' : 'Create schedule'}
                </button>
                <button onClick={sendTest} disabled={testing}
                  className="text-xs px-3 py-1.5 rounded"
                  style={{ background: 'var(--g-tile)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', cursor: 'pointer', opacity: testing ? 0.6 : 1 }}>
                  {testing ? 'Sending…' : 'Send test to me'}
                </button>
              </div>
              {activeCount === 0 && (
                <p className="text-[11px]" style={{ color: 'var(--g-text-faint)' }}>Add at least one recipient who has not unsubscribed. A test can be sent to yourself at any time.</p>
              )}
              {!canEdit && (
                <p className="text-[11px]" style={{ color: 'var(--c-amber)' }}>Only a practice administrator can create or change schedules.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
