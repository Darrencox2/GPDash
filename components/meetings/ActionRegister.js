'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast, Skeleton } from '@/components/ui';

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
    try {
      const finalPatch = { ...patch };
      if (patch.status === 'done') finalPatch.completed_at = new Date().toISOString();
      if (patch.status && patch.status !== 'done') finalPatch.completed_at = null;
      const { error } = await supabase.from('meeting_actions').update(finalPatch).eq('id', id);
      if (error) throw error;
      if (patch.status === 'done') toast('Action completed', 'success');
    } catch (e) { setError(e?.message || 'Could not save'); load(); }
  };

  const filtered = useMemo(() => {
    if (!actions) return [];
    let list = actions;
    if (filter === 'active') list = actions.filter((a) => a.status === 'open' || a.status === 'in_progress');
    else if (filter === 'done') list = actions.filter((a) => a.status === 'done');
    else if (filter === 'mine') list = actions.filter((a) => a.assignee_user_id === myUserId && (a.status === 'open' || a.status === 'in_progress'));
    // Overdue first, then by due date (nulls last), then created.
    return [...list].sort((a, b) => {
      const ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });
  }, [actions, filter, myUserId]);

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
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#fca5a5', padding: '3px 10px', borderRadius: 'var(--r-pill)', background: 'rgba(239,68,68,0.12)' }}>
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
          const st = STATUS_META[a.status] || STATUS_META.open;
          const overdue = isOverdue(a);
          const mtg = a.meeting_id ? meetings[a.meeting_id] : null;
          return (
            <div key={a.id} style={{ padding: '12px 14px', borderRadius: 'var(--r-lg)', background: 'var(--g-card)', border: `1px solid ${overdue ? 'rgba(239,68,68,0.35)' : 'var(--g-border)'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <button
                  onClick={() => updateAction(a.id, { status: NEXT_STATUS[a.status] || 'open' })}
                  title="Cycle status"
                  style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-pill)', background: st.bg, color: st.tx, border: 'none', cursor: 'pointer', marginTop: 1 }}
                >{st.label}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--g-text-hi)', textDecoration: a.status === 'done' ? 'line-through' : 'none', opacity: a.status === 'done' ? 0.6 : 1 }}>
                    {a.description}
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, alignItems: 'center', fontSize: 12 }}>
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
                    {/* Source meeting */}
                    {mtg && (
                      <span style={{ color: 'var(--g-text-mid)' }}>
                        from {mtg.title}{mtg.date ? ` · ${fmtDate(mtg.date)}` : ''}
                      </span>
                    )}
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
  fontSize: 12, padding: '3px 7px', borderRadius: 'var(--r-sm)', background: 'var(--g-field)',
  border: '1px solid var(--g-border)', color: 'var(--g-text-mid)', cursor: 'pointer', maxWidth: 180,
};
