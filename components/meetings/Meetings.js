'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { isLeadership } from '@/lib/permissions';
import MeetingDetail from './MeetingDetail';

const MEETING_TYPES = [
  { id: 'partners', label: 'Partners' },
  { id: 'practice', label: 'Practice' },
  { id: 'clinical_governance', label: 'Clinical governance' },
  { id: 'plt', label: 'PLT / learning time' },
  { id: 'other', label: 'Other' },
];

const STATUS_META = {
  scheduled: { label: 'Scheduled', bg: 'rgba(96,165,250,0.15)', tx: '#93c5fd' },
  in_progress: { label: 'In progress', bg: 'rgba(251,191,36,0.15)', tx: '#fcd34d' },
  minuted: { label: 'Minuted', bg: 'rgba(16,185,129,0.15)', tx: '#6ee7b7' },
  cancelled: { label: 'Cancelled', bg: 'rgba(148,163,184,0.15)', tx: 'var(--g-text-mid)' },
};

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

export default function Meetings({ data }) {
  const supabase = createClient();
  const practiceId = data?._v4?.practiceId || null;
  const allowed = isLeadership(data);

  const [meetings, setMeetings] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);     // viewing a single meeting
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!practiceId) return;
    setError('');
    try {
      const { data: rows, error: err } = await supabase
        .from('meetings')
        .select('*')
        .eq('practice_id', practiceId)
        .order('meeting_date', { ascending: false });
      if (err) throw err;
      setMeetings(rows || []);
    } catch (e) {
      setError(e?.message || 'Could not load meetings');
      setMeetings([]);
    }
  }, [practiceId, supabase]);

  useEffect(() => { load(); }, [load]);

  // Guard: should never render for non-leadership (nav hides it + RLS blocks
  // data), but fail safe with a clear message rather than an empty screen.
  if (!allowed) {
    return (
      <div style={{ padding: 24, maxWidth: 560 }}>
        <div style={{
          padding: 16, borderRadius: 'var(--r-lg)', background: 'var(--g-tile)',
          border: '1px solid var(--g-border)', color: 'var(--g-text-mid)', fontSize: 14,
        }}>
          Meetings are available to partners and practice managers only.
        </div>
      </div>
    );
  }

  if (openId) {
    return (
      <MeetingDetail
        meetingId={openId}
        data={data}
        onBack={() => { setOpenId(null); load(); }}
      />
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 600, color: 'var(--g-text-hi)', margin: 0 }}>
            Meetings
          </h1>
          <p style={{ fontSize: 13, color: 'var(--g-text-mid)', marginTop: 4 }}>
            Agendas, minutes and a running action log. Confidential to the leadership team.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{
            flexShrink: 0, padding: '9px 16px', borderRadius: 'var(--r-md)', border: 'none',
            background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          New meeting
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {creating && (
        <NewMeetingForm
          practiceId={practiceId}
          userId={data?._v4?.userId}
          onCancel={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); load(); setOpenId(id); }}
        />
      )}

      <div style={{ marginTop: 20 }}>
        {meetings === null && (
          <div style={{ color: 'var(--g-text-mid)', fontSize: 14, padding: 20 }}>Loading meetings…</div>
        )}
        {meetings && meetings.length === 0 && !creating && (
          <div style={{
            padding: 32, borderRadius: 'var(--r-lg)', background: 'var(--g-tile)',
            border: '1px dashed var(--g-border)', textAlign: 'center', color: 'var(--g-text-mid)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-text-hi)', marginBottom: 6 }}>No meetings yet</div>
            <div style={{ fontSize: 13 }}>Create your first meeting to start building an agenda.</div>
          </div>
        )}
        {meetings && meetings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {meetings.map((m) => {
              const st = STATUS_META[m.status] || STATUS_META.scheduled;
              const typeLabel = MEETING_TYPES.find(t => t.id === m.meeting_type)?.label || m.meeting_type;
              return (
                <button
                  key={m.id}
                  onClick={() => setOpenId(m.id)}
                  style={{
                    textAlign: 'left', padding: '14px 16px', borderRadius: 'var(--r-lg)',
                    background: 'var(--g-card)', border: '1px solid var(--g-border)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--g-text-mid)', marginTop: 3 }}>
                      {typeLabel} · {fmtDate(m.meeting_date)}
                    </div>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-pill)', background: st.bg, color: st.tx }}>
                    {st.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NewMeetingForm({ practiceId, userId, onCancel, onCreated }) {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('partners');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!title.trim()) { setErr('Give the meeting a title'); return; }
    setBusy(true); setErr('');
    try {
      const { data: row, error } = await supabase
        .from('meetings')
        .insert({
          practice_id: practiceId,
          title: title.trim(),
          meeting_type: type,
          meeting_date: date,
          created_by: userId || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      onCreated(row.id);
    } catch (e) {
      setErr(e?.message || 'Could not create the meeting');
      setBusy(false);
    }
  };

  const input = {
    width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', fontSize: 14,
    background: 'var(--g-field)', border: '1px solid var(--g-border)', color: 'var(--g-text-hi)',
  };
  const label = { fontSize: 12.5, fontWeight: 600, color: 'var(--g-text-mid)', marginBottom: 5, display: 'block' };

  return (
    <div style={{ marginTop: 16, padding: 18, borderRadius: 'var(--r-lg)', background: 'var(--g-card)', border: '1px solid var(--g-border)' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-text-hi)', marginBottom: 14 }}>New meeting</div>
      {err && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={label}>Title</label>
          <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly partners meeting" autoFocus />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={label}>Type</label>
            <select style={{ ...input, cursor: 'pointer' }} value={type} onChange={(e) => setType(e.target.value)}>
              {MEETING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={label}>Date</label>
            <input style={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={busy} style={{ padding: '8px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--g-border)', background: 'transparent', color: 'var(--g-text-mid)', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
        <button onClick={submit} disabled={busy} style={{ padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Creating…' : 'Create meeting'}
        </button>
      </div>
    </div>
  );
}
