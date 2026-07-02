'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast, Skeleton, confirmDialog } from '@/components/ui';

const STATUS_META = {
  open: { label: 'Open', bg: 'rgba(96,165,250,0.15)', tx: '#93c5fd' },
  in_progress: { label: 'In progress', bg: 'rgba(251,191,36,0.15)', tx: '#fcd34d' },
  done: { label: 'Done', bg: 'rgba(16,185,129,0.15)', tx: '#6ee7b7' },
  cancelled: { label: 'Cancelled', bg: 'rgba(148,163,184,0.15)', tx: 'var(--g-text-mid)' },
};
const PRIORITY_META = {
  high: { label: 'High', tx: '#fca5a5' },
  normal: { label: 'Normal', tx: 'var(--g-text-mid)' },
  low: { label: 'Low', tx: 'var(--g-text-mid)' },
};
const NEXT_STATUS = { open: 'in_progress', in_progress: 'done', done: 'open', cancelled: 'open' };

function fmtDate(iso) {
  if (!iso) return null;
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}
function isOverdue(a) {
  if (!a.due_date || a.status === 'done' || a.status === 'cancelled') return false;
  return a.due_date < new Date().toISOString().slice(0, 10);
}

export default function ActionRegister({ data }) {
  const supabase = createClient();
  const toast = useToast();
  const practiceId = data?._v4?.practiceId || null;

  const [actions, setActions] = useState(null);
  const [meetings, setMeetings] = useState({}); // id -> {title, date}
  const [members, setMembers] = useState([]);   // {user_id, name}
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('active'); // active | all | mine | done
  const [justCompleted, setJustCompleted] = useState(new Set()); // completed this session — stay visible
  const myUserId = data?._v4?.userId || null;

  const load = useCallback(async () => {
    if (!practiceId) return;
    setError('');
    try {
      const [aRes, mRes, pRes] = await Promise.all([
        supabase.from('meeting_actions').select('*').eq('practice_id', practiceId).order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('meetings').select('id, title, meeting_date').eq('practice_id', practiceId),
        supabase.rpc('list_practice_members', { target_practice_id: practiceId }),
      ]);
      if (aRes.error) throw aRes.error;
      setActions(aRes.data || []);
      const mMap = {};
      (mRes.data || []).forEach((m) => { mMap[m.id] = { title: m.title, date: m.meeting_date }; });
      setMeetings(mMap);
      setMembers((pRes.data || []).map((r) => ({
        user_id: r.user_id,
        name: r.name || r.email || 'Member',
      })));
    } catch (e) {
      setError(e?.message || 'Could not load the action register');
      setActions([]);
    }
  }, [practiceId, supabase]);

  useEffect(() => { load(); }, [load]);

  const updateAction = async (id, patch) => {
    setActions((arr) => arr.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    // Remember actions completed this session so they stay visible (greyed)
    // in the Active view until the next load, instead of vanishing instantly.
    if (patch.status === 'done') setJustCompleted((s) => new Set(s).add(id));
    if (patch.status && patch.status !== 'done') setJustCompleted((s) => { const n = new Set(s); n.delete(id); return n; });
    try {
      const finalPatch = { ...patch };
      if (patch.status === 'done') finalPatch.completed_at = new Date().toISOString();
      if (patch.status && patch.status !== 'done') finalPatch.completed_at = null;
      const { error } = await supabase.from('meeting_actions').update(finalPatch).eq('id', id);
      if (error) throw error;
      if (patch.status === 'done') toast('Action completed', 'success');
      else if (patch.status === 'open') toast('Action reopened', 'success');
    } catch (e) { setError(e?.message || 'Could not save'); load(); }
  };

  const deleteAction = async (id, description) => {
    const ok = await confirmDialog({
      title: 'Delete this action?',
      message: `"${(description || 'This action').slice(0, 80)}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setActions((arr) => arr.filter((a) => a.id !== id));
    try {
      const { error } = await supabase.from('meeting_actions').delete().eq('id', id);
      if (error) throw error;
      toast('Action deleted', 'success');
    } catch (e) { setError(e?.message || 'Could not delete'); load(); }
  };
  const filtered = useMemo(() => {
    if (!actions) return [];
    let list = actions;
    // Active/mine keep items that are open/in-progress OR were completed this
    // session (so a tick greys the row in place rather than vanishing).
    if (filter === 'active') list = actions.filter((a) => a.status === 'open' || a.status === 'in_progress' || justCompleted.has(a.id));
    else if (filter === 'done') list = actions.filter((a) => a.status === 'done');
    else if (filter === 'mine') list = actions.filter((a) => a.assignee_user_id === myUserId && (a.status === 'open' || a.status === 'in_progress' || justCompleted.has(a.id)));
    // Done sinks to the bottom; then overdue first; then by due date.
    return [...list].sort((a, b) => {
      const ad = a.status === 'done' ? 1 : 0, bd = b.status === 'done' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      const ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });
  }, [actions, filter, myUserId, justCompleted]);

  const counts = useMemo(() => {
    if (!actions) return { active: 0, mine: 0, done: 0, overdue: 0 };
    return {
      active: actions.filter((a) => a.status === 'open' || a.status === 'in_progress').length,
      mine: actions.filter((a) => a.assignee_user_id === myUserId && (a.status === 'open' || a.status === 'in_progress')).length,
      done: actions.filter((a) => a.status === 'done').length,
      overdue: actions.filter(isOverdue).length,
    };
  }, [actions, myUserId]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: 'var(--g-text-mid)', margin: 0 }}>
          Every action across all meetings, in one place. Click a status to cycle it.
        </p>
        {counts.overdue > 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fca5a5', padding: '3px 10px', borderRadius: 'var(--r-pill)', background: 'rgba(239,68,68,0.12)' }}>
            {counts.overdue} overdue
          </span>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['active', `Active (${counts.active})`], ['mine', `My actions (${counts.mine})`], ['done', `Done (${counts.done})`], ['all', 'All']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            style={{
              fontSize: 13, fontWeight: 600, padding: '5px 12px', borderRadius: 'var(--r-pill)', cursor: 'pointer',
              background: filter === id ? 'var(--accent, #6366f1)' : 'transparent',
              color: filter === id ? '#fff' : 'var(--g-text-mid)',
              border: `1px solid ${filter === id ? 'transparent' : 'var(--g-border)'}`,
            }}
          >{label}</button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 13 }}>{error}</div>
      )}

      {actions === null && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[0,1,2,3].map((i) => <Skeleton key={i} variant="card" style={{ height: 54 }} />)}</div>}
      {actions && filtered.length === 0 && (
        <div style={{ padding: 28, borderRadius: 'var(--r-lg)', background: 'var(--g-tile)', border: '1px dashed var(--g-border)', textAlign: 'center', color: 'var(--g-text-mid)', fontSize: 13 }}>
          {filter === 'mine' ? 'No actions assigned to you.' : filter === 'done' ? 'No completed actions yet.' : 'No actions yet. Raise actions against agenda items in a meeting.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((a) => {
          const overdue = isOverdue(a);
          const mtg = a.meeting_id ? meetings[a.meeting_id] : null;
          const done = a.status === 'done';
          const inProgress = a.status === 'in_progress';
          return (
            <div key={a.id} style={{ padding: '12px 14px', borderRadius: 'var(--r-lg)', background: done ? 'var(--g-tile)' : 'var(--g-card)', border: `1px solid ${overdue ? 'rgba(239,68,68,0.35)' : 'var(--g-border)'}`, opacity: done ? 0.62 : 1, transition: 'opacity 0.2s, background 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Complete checkbox */}
                <button
                  onClick={() => updateAction(a.id, { status: done ? 'open' : 'done' })}
                  title={done ? 'Mark as not done' : 'Mark as done'}
                  aria-label={done ? 'Mark as not done' : 'Mark as done'}
                  style={{
                    flexShrink: 0, width: 28, height: 28, marginTop: 1, borderRadius: 'var(--r-md)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? '#10b981' : 'transparent',
                    border: `2px solid ${done ? '#10b981' : 'var(--g-border-strong, #94a3b8)'}`,
                  }}
                >
                  {done && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  )}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--g-text-hi)', textDecoration: done ? 'line-through' : 'none' }}>
                    {a.description}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, alignItems: 'center', fontSize: 13 }}>
                    {done ? (
                      <button onClick={() => updateAction(a.id, { status: 'open' })} style={{ ...miniSelect, cursor: 'pointer', color: 'var(--accent, #6366f1)', fontWeight: 600 }}>
                        Undo completion
                      </button>
                    ) : (
                      <>
                        {/* In-progress toggle */}
                        <button
                          onClick={() => updateAction(a.id, { status: inProgress ? 'open' : 'in_progress' })}
                          style={{ ...miniSelect, cursor: 'pointer', fontWeight: 600, background: inProgress ? 'rgba(251,191,36,0.15)' : 'var(--g-field)', color: inProgress ? '#fcd34d' : 'var(--g-text-mid)', border: `1px solid ${inProgress ? 'rgba(251,191,36,0.35)' : 'var(--g-border)'}` }}
                        >
                          {inProgress ? 'In progress' : 'Mark in progress'}
                        </button>
                        {/* Assignee */}
                        <select
                          value={a.assignee_user_id || ''}
                          onChange={(e) => {
                            const uid = e.target.value || null;
                            const m = members.find((x) => x.user_id === uid);
                            updateAction(a.id, { assignee_user_id: uid, assignee_name: m ? m.name : a.assignee_name });
                          }}
                          style={miniSelect}
                        >
                          <option value="">{a.assignee_name || 'Unassigned'}</option>
                          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                        </select>
                        {/* Due date */}
                        <input
                          type="date"
                          value={a.due_date || ''}
                          onChange={(e) => updateAction(a.id, { due_date: e.target.value || null })}
                          style={{ ...miniSelect, color: overdue ? '#fca5a5' : 'var(--g-text-mid)' }}
                        />
                        {overdue && <span style={{ color: '#fca5a5', fontWeight: 600 }}>Overdue</span>}
                        {/* Priority */}
                        <select value={a.priority || 'normal'} onChange={(e) => updateAction(a.id, { priority: e.target.value })} style={miniSelect}>
                          <option value="low">Low priority</option>
                          <option value="normal">Normal priority</option>
                          <option value="high">High priority</option>
                        </select>
                      </>
                    )}
                    {/* Source meeting (always shown) */}
                    {mtg && (
                      <span style={{ color: 'var(--g-text-mid)' }}>
                        from {mtg.title}{mtg.date ? ` · ${fmtDate(mtg.date)}` : ''}
                      </span>
                    )}
                    <button
                      onClick={() => deleteAction(a.id, a.description)}
                      title="Delete action"
                      aria-label="Delete action"
                      style={{ color: 'var(--g-text-mid)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '7px 8px', minHeight: 36 }}
                    >Delete</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const miniSelect = {
  fontSize: 13, padding: '7px 10px', borderRadius: 'var(--r-md)', background: 'var(--g-field)',
  border: '1px solid var(--g-border)', color: 'var(--g-text-mid)', cursor: 'pointer', maxWidth: 200, minHeight: 36,
};
