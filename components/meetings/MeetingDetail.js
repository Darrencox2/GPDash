'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import AgendaDocument from './AgendaDocument';

const OUTCOME_META = {
  decision: { label: 'Decision', bg: 'rgba(16,185,129,0.15)', tx: '#6ee7b7' },
  noted: { label: 'Noted', bg: 'rgba(148,163,184,0.15)', tx: 'var(--g-text-mid)' },
  deferred: { label: 'Deferred', bg: 'rgba(251,191,36,0.15)', tx: '#fcd34d' },
  action: { label: 'Action', bg: 'rgba(96,165,250,0.15)', tx: '#93c5fd' },
};

const STATUSES = ['scheduled', 'in_progress', 'minuted', 'cancelled'];
const STATUS_LABEL = { scheduled: 'Scheduled', in_progress: 'In progress', minuted: 'Minuted', cancelled: 'Cancelled' };

const ACTION_STATUS_META = {
  open: { label: 'Open', bg: 'rgba(96,165,250,0.15)', tx: '#93c5fd' },
  in_progress: { label: 'In progress', bg: 'rgba(251,191,36,0.15)', tx: '#fcd34d' },
  done: { label: 'Done', bg: 'rgba(16,185,129,0.15)', tx: '#6ee7b7' },
  cancelled: { label: 'Cancelled', bg: 'rgba(148,163,184,0.15)', tx: 'var(--g-text-mid)' },
};

const inputStyle = {
  width: '100%', padding: '8px 11px', borderRadius: 'var(--r-md)', fontSize: 14,
  background: 'var(--g-field)', border: '1px solid var(--g-border)', color: 'var(--g-text-hi)',
};

export default function MeetingDetail({ meetingId, data, onBack }) {
  const supabase = createClient();
  const practiceId = data?._v4?.practiceId || null;
  const userId = data?._v4?.userId || null;

  const [meeting, setMeeting] = useState(null);
  const [items, setItems] = useState([]);
  const [actions, setActions] = useState([]);
  const [error, setError] = useState('');
  const [newItem, setNewItem] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [mRes, iRes, aRes] = await Promise.all([
        supabase.from('meetings').select('*').eq('id', meetingId).single(),
        supabase.from('agenda_items').select('*').eq('meeting_id', meetingId).order('position', { ascending: true }),
        supabase.from('meeting_actions').select('*').eq('meeting_id', meetingId).order('created_at', { ascending: true }),
      ]);
      if (mRes.error) throw mRes.error;
      setMeeting(mRes.data);
      setItems(iRes.data || []);
      setActions(aRes.data || []);
    } catch (e) {
      setError(e?.message || 'Could not load this meeting');
    }
  }, [meetingId, supabase]);

  useEffect(() => { load(); }, [load]);

  const updateMeeting = async (patch) => {
    setMeeting((m) => ({ ...m, ...patch }));
    try {
      const { error } = await supabase.from('meetings').update({ ...patch, updated_by: userId }).eq('id', meetingId);
      if (error) throw error;
    } catch (e) { setError(e?.message || 'Could not save'); load(); }
  };

  const addItem = async (itemStatus = 'confirmed') => {
    if (!newItem.trim()) return;
    const title = newItem.trim();
    setNewItem('');
    try {
      const { error } = await supabase.from('agenda_items').insert({
        meeting_id: meetingId,
        practice_id: practiceId,
        position: items.length,
        title,
        item_status: itemStatus,
        added_by_user_id: userId || null,
        added_by_name: data?._v4?.userName || data?._v4?.userEmail || null,
      });
      if (error) throw error;
      load();
    } catch (e) { setError(e?.message || 'Could not add item'); }
  };

  const updateItem = async (id, patch) => {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    try {
      const { error } = await supabase.from('agenda_items').update(patch).eq('id', id);
      if (error) throw error;
    } catch (e) { setError(e?.message || 'Could not save item'); load(); }
  };

  const deleteItem = async (id) => {
    setItems((arr) => arr.filter((it) => it.id !== id));
    try {
      await supabase.from('agenda_items').delete().eq('id', id);
    } catch (e) { setError(e?.message || 'Could not delete item'); load(); }
  };

  const addAction = async (agendaItemId, description) => {
    if (!description.trim()) return;
    try {
      const { error } = await supabase.from('meeting_actions').insert({
        practice_id: practiceId,
        meeting_id: meetingId,
        agenda_item_id: agendaItemId || null,
        description: description.trim(),
        created_by: userId,
      });
      if (error) throw error;
      load();
    } catch (e) { setError(e?.message || 'Could not add action'); }
  };

  const updateAction = async (id, patch) => {
    setActions((arr) => arr.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    try {
      const finalPatch = { ...patch };
      if (patch.status === 'done') finalPatch.completed_at = new Date().toISOString();
      if (patch.status && patch.status !== 'done') finalPatch.completed_at = null;
      const { error } = await supabase.from('meeting_actions').update(finalPatch).eq('id', id);
      if (error) throw error;
    } catch (e) { setError(e?.message || 'Could not save action'); load(); }
  };

  if (!meeting) {
    return (
      <div style={{ padding: 24 }}>
        <button onClick={onBack} style={backBtn}>← Back to meetings</button>
        <div style={{ marginTop: 20, color: 'var(--g-text-mid)' }}>{error || 'Loading…'}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
      <button onClick={onBack} style={backBtn}>← Back to meetings</button>

      {error && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Header / meeting meta */}
      <div style={{ marginTop: 14, padding: 18, borderRadius: 'var(--r-lg)', background: 'var(--g-card)', border: '1px solid var(--g-border)' }}>
        <input
          style={{ ...inputStyle, fontSize: 19, fontWeight: 600, border: '1px solid transparent', background: 'transparent', padding: '4px 6px' }}
          value={meeting.title}
          onChange={(e) => setMeeting((m) => ({ ...m, title: e.target.value }))}
          onBlur={(e) => updateMeeting({ title: e.target.value.trim() || 'Untitled meeting' })}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, width: 'auto' }}
            type="date"
            value={meeting.meeting_date || ''}
            onChange={(e) => updateMeeting({ meeting_date: e.target.value })}
          />
          <select
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}
            value={meeting.status}
            onChange={(e) => updateMeeting({ status: e.target.value })}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      {/* Agenda / minutes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '24px 0 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--g-text-mid)' }}>
          Agenda &amp; minutes
        </div>
        <AgendaDocument
          meeting={meeting}
          items={items}
          actions={actions}
          practiceName={data?._v4?.practiceName}
          mode={meeting.status === 'minuted' ? 'minutes' : 'agenda'}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, idx) => (
          <AgendaItem
            key={it.id}
            item={it}
            index={items.slice(0, idx + 1).filter((x) => x.item_status !== 'proposed').length}
            actions={actions.filter((a) => a.agenda_item_id === it.id)}
            onUpdate={(patch) => updateItem(it.id, patch)}
            onDelete={() => deleteItem(it.id)}
            onAddAction={(desc) => addAction(it.id, desc)}
            onUpdateAction={updateAction}
          />
        ))}
        {items.length === 0 && (
          <div style={{ color: 'var(--g-text-mid)', fontSize: 13.5, padding: '8px 2px' }}>
            No agenda items yet. Add the first item below.
          </div>
        )}
      </div>

      {/* Add agenda item */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          style={inputStyle}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem('confirmed'); }}
          placeholder="Add an agenda item, or propose a point for discussion"
        />
        <button onClick={() => addItem('proposed')} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--g-border)', background: 'transparent', color: 'var(--g-text-mid)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Propose</button>
        <button onClick={() => addItem('confirmed')} style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Add</button>
      </div>

      {/* All actions from this meeting */}
      <SectionTitle>Action log</SectionTitle>
      {actions.length === 0 ? (
        <div style={{ color: 'var(--g-text-mid)', fontSize: 13.5 }}>
          No actions yet. Add actions against an agenda item above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actions.map((a) => (
            <ActionRow key={a.id} action={a} onUpdate={(patch) => updateAction(a.id, patch)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--g-text-mid)', margin: '24px 0 12px' }}>
      {children}
    </div>
  );
}

function AgendaItem({ item, index, actions, onUpdate, onDelete, onAddAction, onUpdateAction }) {
  const [expanded, setExpanded] = useState(false);
  const [actionText, setActionText] = useState('');
  const outcome = item.outcome ? OUTCOME_META[item.outcome] : null;
  const proposed = item.item_status === 'proposed';

  return (
    <div style={{ borderRadius: 'var(--r-lg)', background: 'var(--g-card)', border: `1px solid ${proposed ? 'rgba(251,191,36,0.4)' : 'var(--g-border)'}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 'var(--r-sm)', background: 'var(--g-tile)', color: 'var(--g-text-mid)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{proposed ? '·' : index}</span>
        <input
          style={{ flex: 1, fontSize: 14.5, fontWeight: 600, background: 'transparent', border: 'none', color: 'var(--g-text-hi)', padding: '2px 0', outline: 'none' }}
          value={item.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          onBlur={(e) => onUpdate({ title: e.target.value.trim() || 'Untitled item' })}
        />
        {proposed && (
          <>
            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: 'rgba(251,191,36,0.15)', color: '#fcd34d' }}>
              Proposed{item.added_by_name ? ` · ${item.added_by_name.split('@')[0]}` : ''}
            </span>
            <button onClick={() => onUpdate({ item_status: 'confirmed' })} style={{ ...miniBtn, color: '#6ee7b7', borderColor: 'rgba(16,185,129,0.3)' }}>Add to agenda</button>
          </>
        )}
        {!proposed && outcome && (
          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: outcome.bg, color: outcome.tx }}>{outcome.label}</span>
        )}
        <button onClick={() => setExpanded((v) => !v)} style={miniBtn}>{expanded ? 'Close' : 'Minute'}</button>
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--g-border)' }}>
          <div style={{ marginTop: 12 }}>
            <label style={miniLabel}>Discussion / minute</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
              defaultValue={item.minute_note || ''}
              onBlur={(e) => onUpdate({ minute_note: e.target.value })}
              placeholder="What was discussed and agreed…"
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={miniLabel}>Outcome</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(OUTCOME_META).map((key) => {
                const active = item.outcome === key;
                const meta = OUTCOME_META[key];
                return (
                  <button
                    key={key}
                    onClick={() => onUpdate({ outcome: active ? null : key })}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                      background: active ? meta.bg : 'transparent',
                      color: active ? meta.tx : 'var(--g-text-mid)',
                      border: `1px solid ${active ? 'transparent' : 'var(--g-border)'}`,
                    }}
                  >{meta.label}</button>
                );
              })}
            </div>
          </div>

          {/* Actions for this item */}
          <div style={{ marginTop: 14 }}>
            <label style={miniLabel}>Actions from this item</label>
            {actions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {actions.map((a) => (
                  <ActionRow key={a.id} action={a} compact onUpdate={(patch) => onUpdateAction(a.id, patch)} />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={inputStyle}
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { onAddAction(actionText); setActionText(''); } }}
                placeholder="Add an action and press Enter"
              />
            </div>
          </div>

          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button onClick={onDelete} style={{ ...miniBtn, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}>Delete item</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionRow({ action, onUpdate, compact }) {
  const st = ACTION_STATUS_META[action.status] || ACTION_STATUS_META.open;
  const nextStatus = { open: 'in_progress', in_progress: 'done', done: 'open' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: compact ? '8px 10px' : '10px 14px', borderRadius: 'var(--r-md)', background: compact ? 'var(--g-tile)' : 'var(--g-card)', border: '1px solid var(--g-border)' }}>
      <button
        onClick={() => onUpdate({ status: nextStatus[action.status] || 'open' })}
        title="Cycle status"
        style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 'var(--r-pill)', background: st.bg, color: st.tx, border: 'none', cursor: 'pointer' }}
      >{st.label}</button>
      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--g-text-hi)', textDecoration: action.status === 'done' ? 'line-through' : 'none', opacity: action.status === 'done' ? 0.6 : 1 }}>
        {action.description}
      </span>
      <input
        style={{ flexShrink: 0, width: 130, fontSize: 12.5, padding: '4px 8px', borderRadius: 'var(--r-sm)', background: 'var(--g-field)', border: '1px solid var(--g-border)', color: 'var(--g-text-hi)' }}
        value={action.assignee_name || ''}
        onChange={(e) => onUpdate({ assignee_name: e.target.value })}
        placeholder="Assign to…"
      />
    </div>
  );
}

const backBtn = {
  fontSize: 13, color: 'var(--g-text-mid)', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
};
const miniBtn = {
  flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--r-md)',
  background: 'transparent', border: '1px solid var(--g-border)', color: 'var(--g-text-mid)', cursor: 'pointer',
};
const miniLabel = { fontSize: 12, fontWeight: 600, color: 'var(--g-text-mid)', marginBottom: 5, display: 'block' };
