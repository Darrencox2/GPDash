'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui';
import { generateOccurrences, missingOccurrences, describeSchedule, DOW_LABELS, NTH_LABELS } from '@/lib/meeting-schedules';

const MEETING_TYPES = [
  { id: 'partners', label: 'Partners' },
  { id: 'practice', label: 'Practice' },
  { id: 'clinical_governance', label: 'Clinical governance' },
  { id: 'plt', label: 'PLT / learning time' },
  { id: 'other', label: 'Other' },
];

const inputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', fontSize: 14,
  background: 'var(--g-field)', border: '1px solid var(--g-border)', color: 'var(--g-text-hi)',
};
const labelStyle = { fontSize: 13, fontWeight: 600, color: 'var(--g-text-mid)', marginBottom: 5, display: 'block' };

export default function MeetingSchedules({ data, onChanged }) {
  const supabase = createClient();
  const toast = useToast();
  const practiceId = data?._v4?.practiceId || null;
  const userId = data?._v4?.userId || null;

  const [schedules, setSchedules] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!practiceId) return;
    try {
      const { data: rows, error: err } = await supabase
        .from('meeting_schedules')
        .select('*')
        .eq('practice_id', practiceId)
        .order('created_at', { ascending: true });
      if (err) throw err;
      setSchedules(rows || []);
    } catch (e) {
      setError(e?.message || 'Could not load schedules');
      setSchedules([]);
    }
  }, [practiceId, supabase]);

  useEffect(() => { load(); }, [load]);

  // Generate the next N occurrences for a schedule, skipping dates that already
  // exist (idempotent). Inserts empty scheduled meetings ready for agendas.
  const generate = async (schedule, count = 12) => {
    setBusyId(schedule.id); setError('');
    try {
      const { data: existing, error: exErr } = await supabase
        .from('meetings')
        .select('meeting_date')
        .eq('practice_id', practiceId)
        .eq('schedule_id', schedule.id);
      if (exErr) throw exErr;
      const have = (existing || []).map((r) => r.meeting_date);
      const toCreate = missingOccurrences(schedule, have, count);
      if (toCreate.length === 0) {
        setError('All upcoming dates for this schedule already exist.');
        setBusyId(null);
        return;
      }
      const rows = toCreate.map((iso) => ({
        practice_id: practiceId,
        schedule_id: schedule.id,
        title: schedule.title,
        meeting_type: schedule.meeting_type,
        meeting_date: iso,
        start_time: schedule.start_time || null,
        location: schedule.location || null,
        created_by: userId || null,
      }));
      const { error: insErr } = await supabase.from('meetings').insert(rows);
      if (insErr) throw insErr;
      setBusyId(null);
      toast(`${rows.length} meeting${rows.length === 1 ? '' : 's'} added to the calendar`, 'success');
      if (onChanged) onChanged();
    } catch (e) {
      setError(e?.message || 'Could not generate meetings');
      setBusyId(null);
    }
  };

  const removeSchedule = async (id) => {
    setBusyId(id);
    try {
      // Deleting a schedule keeps its past meetings (schedule_id -> null).
      const { error } = await supabase.from('meeting_schedules').delete().eq('id', id);
      if (error) throw error;
      load();
      setBusyId(null);
    } catch (e) { setError(e?.message || 'Could not delete schedule'); setBusyId(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p style={{ fontSize: 13, color: 'var(--g-text-mid)', margin: 0 }}>
          Define a recurring meeting once and generate its dates ahead of time.
        </p>
        {!creating && (
          <button onClick={() => setCreating(true)} style={primaryBtn}>New schedule</button>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--c-red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {creating && (
        <ScheduleForm
          practiceId={practiceId}
          userId={userId}
          onCancel={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}

      <div className="flex flex-col gap-2.5 mt-3">
        {schedules === null && <div className="text-mid text-body">Loading…</div>}
        {schedules && schedules.length === 0 && !creating && (
          <div style={{ padding: 24, borderRadius: 'var(--r-lg)', background: 'var(--g-tile)', border: '1px dashed var(--g-border)', textAlign: 'center', color: 'var(--g-text-mid)', fontSize: 13 }}>
            No recurring schedules yet. Create one to auto-generate meeting dates.
          </div>
        )}
        {schedules && schedules.map((s) => {
          const next = generateOccurrences(s, 1)[0];
          const typeLabel = MEETING_TYPES.find(t => t.id === s.meeting_type)?.label || s.meeting_type;
          return (
            <div key={s.id} style={{ padding: '14px 16px', borderRadius: 'var(--r-lg)', background: 'var(--g-card)', border: '1px solid var(--g-border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-text-hi)' }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--g-text-mid)', marginTop: 3 }}>
                    {typeLabel} · {describeSchedule(s)}{next ? ` · next ${new Date(next + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => generate(s, 12)} disabled={busyId === s.id} style={primaryBtn}>
                    {busyId === s.id ? 'Working…' : 'Generate dates'}
                  </button>
                  <button onClick={() => removeSchedule(s.id)} disabled={busyId === s.id} style={{ ...ghostBtn, color: 'var(--c-red)', borderColor: 'rgba(239,68,68,0.3)' }}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleForm({ practiceId, userId, onCancel, onCreated }) {
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('partners');
  const [cadence, setCadence] = useState('weekly');
  const [dow, setDow] = useState(2); // Tuesday default
  const [dom, setDom] = useState(1);
  const [week, setWeek] = useState(2); // for monthly_nth: 2nd by default
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!title.trim()) { setErr('Give the schedule a title'); return; }
    setBusy(true); setErr('');
    try {
      const row = {
        practice_id: practiceId,
        title: title.trim(),
        meeting_type: type,
        cadence,
        start_time: time || null,
        anchor_date: new Date().toISOString().slice(0, 10),
        created_by: userId || null,
      };
      if (cadence === 'monthly') row.day_of_month = dom;
      else if (cadence === 'monthly_nth') { row.day_of_week = dow; row.week_of_month = week; }
      else row.day_of_week = dow;
      const { error } = await supabase.from('meeting_schedules').insert(row);
      if (error) throw error;
      onCreated();
    } catch (e) { setErr(e?.message || 'Could not create schedule'); setBusy(false); }
  };

  return (
    <div style={{ padding: 18, borderRadius: 'var(--r-lg)', background: 'var(--g-card)', border: '1px solid var(--g-border)', marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-text-hi)', marginBottom: 14 }}>New recurring schedule</div>
      {err && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', color: 'var(--c-red)', fontSize: 13 }}>{err}</div>}
      <div className="flex flex-col gap-3">
        <div>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly partners meeting" autoFocus />
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-[1_1_160px]">
            <label style={labelStyle}>Type</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={type} onChange={(e) => setType(e.target.value)}>
              {MEETING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex-[1_1_160px]">
            <label style={labelStyle}>Cadence</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={cadence} onChange={(e) => setCadence(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly (date)</option>
              <option value="monthly_nth">Monthly (e.g. 2nd Wednesday)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {cadence === 'monthly' ? (
            <div className="flex-[1_1_160px]">
              <label style={labelStyle}>Day of month</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={dom} onChange={(e) => setDom(Number(e.target.value))}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          ) : cadence === 'monthly_nth' ? (
            <>
              <div style={{ flex: '1 1 130px' }}>
                <label style={labelStyle}>Which week</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={week} onChange={(e) => setWeek(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{NTH_LABELS[n].charAt(0).toUpperCase() + NTH_LABELS[n].slice(1)}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 130px' }}>
                <label style={labelStyle}>Day of week</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={dow} onChange={(e) => setDow(Number(e.target.value))}>
                  {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            </>
          ) : (
            <div className="flex-[1_1_160px]">
              <label style={labelStyle}>Day of week</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={dow} onChange={(e) => setDow(Number(e.target.value))}>
                {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          <div className="flex-[1_1_160px]">
            <label style={labelStyle}>Start time (optional)</label>
            <input style={inputStyle} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="flex gap-2.5 mt-4 justify-end">
        <button onClick={onCancel} disabled={busy} style={ghostBtn}>Cancel</button>
        <button onClick={submit} disabled={busy} style={primaryBtn}>{busy ? 'Creating…' : 'Create schedule'}</button>
      </div>
    </div>
  );
}

const primaryBtn = {
  flexShrink: 0, padding: '8px 14px', borderRadius: 'var(--r-md)', border: 'none',
  background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const ghostBtn = {
  flexShrink: 0, padding: '8px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--g-border)',
  background: 'transparent', color: 'var(--g-text-mid)', fontSize: 14, cursor: 'pointer',
};
