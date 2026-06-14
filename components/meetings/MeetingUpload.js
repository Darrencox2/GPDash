'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

const MEETING_TYPES = [
  { id: 'partners', label: 'Partners' },
  { id: 'practice', label: 'Practice' },
  { id: 'clinical_governance', label: 'Clinical governance' },
  { id: 'plt', label: 'PLT / learning time' },
  { id: 'other', label: 'Other' },
];

const inputStyle = {
  width: '100%', padding: '8px 11px', borderRadius: 'var(--r-md)', fontSize: 14,
  background: 'var(--g-field)', border: '1px solid var(--g-border)', color: 'var(--g-text-hi)',
};


// Status per file: pending | extracting | review | filing | done | error
export default function MeetingUpload({ data, onFiled }) {
  const supabase = createClient();
  const practiceId = data?._v4?.practiceId || null;
  const userId = data?._v4?.userId || null;
  const fileRef = useRef(null);
  const [rows, setRows] = useState([]); // { id, file, status, result, error }
  const [globalError, setGlobalError] = useState('');

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const next = files.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      file,
      name: file.name,
      status: 'pending',
      result: null,
      error: '',
    }));
    setRows((r) => [...r, ...next]);
    next.forEach((row) => extractOne(row));
    if (fileRef.current) fileRef.current.value = '';
  };

  const patchRow = (id, patch) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const extractOne = async (row) => {
    patchRow(row.id, { status: 'extracting', error: '' });
    try {
      const form = new FormData();
      form.append('practice_id', practiceId);
      form.append('file', row.file);

      // Use the supabase client's functions.invoke — it handles the function
      // URL, the auth header, and CORS/preflight correctly (raw fetch can trip
      // the JWT gate on the OPTIONS preflight and fail before reaching the fn).
      const { data: payload, error: invokeErr } = await supabase.functions.invoke('extract-meeting-doc', {
        body: form,
      });
      if (invokeErr) {
        // invoke surfaces non-2xx as an error; try to read the function's JSON message.
        let msg = invokeErr.message || 'Extraction failed';
        try {
          const ctx = invokeErr.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* keep msg */ }
        throw new Error(msg);
      }
      if (payload?.error) throw new Error(payload.error);

      const s = payload?.structured || {};
      patchRow(row.id, {
        status: 'review',
        result: {
          meeting_date: s.meeting_date || '',
          meeting_type: s.meeting_type || 'partners',
          title: s.title || row.name.replace(/\.(docx|pdf)$/i, ''),
          confidence: s.confidence || 'low',
          agenda_items: Array.isArray(s.agenda_items) ? s.agenda_items : [],
          actions: Array.isArray(s.actions) ? s.actions : [],
        },
      });
    } catch (e) {
      patchRow(row.id, { status: 'error', error: e?.message || 'Could not process this file' });
    }
  };

  // File a reviewed row: create the meeting, its agenda items, and actions.
  const fileOne = async (row) => {
    const r = row.result;
    if (!r?.meeting_date) { patchRow(row.id, { error: 'Set a date before filing' }); return; }
    patchRow(row.id, { status: 'filing', error: '' });
    try {
      const { data: meeting, error: mErr } = await supabase
        .from('meetings')
        .insert({
          practice_id: practiceId,
          title: r.title?.trim() || 'Imported meeting',
          meeting_type: r.meeting_type,
          meeting_date: r.meeting_date,
          status: 'minuted',
          created_by: userId,
        })
        .select('id')
        .single();
      if (mErr) throw mErr;

      if (r.agenda_items.length) {
        const items = r.agenda_items.map((it, idx) => ({
          meeting_id: meeting.id,
          practice_id: practiceId,
          position: idx,
          title: (it.title || `Item ${idx + 1}`).slice(0, 300),
          minute_note: it.minute_note || null,
          outcome: ['decision', 'noted', 'deferred', 'action'].includes(it.outcome) ? it.outcome : null,
        }));
        const { error: iErr } = await supabase.from('agenda_items').insert(items);
        if (iErr) throw iErr;
      }

      if (r.actions.length) {
        const acts = r.actions.map((a) => ({
          practice_id: practiceId,
          meeting_id: meeting.id,
          description: (a.description || '').slice(0, 2000),
          assignee_name: a.assignee_name || null,
          created_by: userId,
        })).filter((a) => a.description);
        if (acts.length) {
          const { error: aErr } = await supabase.from('meeting_actions').insert(acts);
          if (aErr) throw aErr;
        }
      }

      patchRow(row.id, { status: 'done' });
      if (onFiled) onFiled();
    } catch (e) {
      patchRow(row.id, { status: 'review', error: e?.message || 'Could not file this meeting' });
    }
  };

  const updateResult = (id, patch) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, result: { ...row.result, ...patch } } : row)));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--g-text-mid)', margin: 0, maxWidth: 560 }}>
          Upload past agendas or minutes (.docx or .pdf). Each is read automatically — check the date and details, then file it. Nothing is saved until you confirm.
        </p>
        <button onClick={() => fileRef.current?.click()} style={primaryBtn}>Choose files</button>
        <input ref={fileRef} type="file" accept=".docx,.pdf" multiple onChange={onPick} style={{ display: 'none' }} />
      </div>

      {globalError && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 13 }}>{globalError}</div>
      )}

      {rows.length === 0 && (
        <div style={{ padding: 28, borderRadius: 'var(--r-lg)', background: 'var(--g-tile)', border: '1px dashed var(--g-border)', textAlign: 'center', color: 'var(--g-text-mid)', fontSize: 13 }}>
          No files yet. Choose .docx or .pdf agendas and minutes to import.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((row) => (
          <UploadRow
            key={row.id}
            row={row}
            onFile={() => fileOne(row)}
            onRetry={() => extractOne(row)}
            onChange={(patch) => updateResult(row.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function UploadRow({ row, onFile, onRetry, onChange }) {
  const { status, result, error, name } = row;

  return (
    <div style={{ borderRadius: 'var(--r-lg)', background: 'var(--g-card)', border: '1px solid var(--g-border)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--g-text-mid)', marginTop: 2 }}>
            {status === 'extracting' && 'Reading document…'}
            {status === 'review' && result && (
              <span>Detected · confidence {result.confidence}</span>
            )}
            {status === 'filing' && 'Filing…'}
            {status === 'done' && <span style={{ color: '#6ee7b7' }}>Filed ✓</span>}
            {status === 'error' && <span style={{ color: '#fca5a5' }}>{error}</span>}
          </div>
        </div>
        {status === 'error' && <button onClick={onRetry} style={ghostBtn}>Retry</button>}
        {status === 'review' && <button onClick={onFile} style={primaryBtn}>File meeting</button>}
      </div>

      {status === 'review' && result && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--g-border)' }}>
          {error && <div style={{ margin: '10px 0', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: 12.5 }}>{error}</div>}
          {result.confidence === 'low' && (
            <div style={{ margin: '12px 0 0', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#fcd34d', fontSize: 12.5 }}>
              Low confidence on the date — please check it carefully before filing.
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            <div style={{ flex: '1 1 150px' }}>
              <label style={miniLabel}>Date</label>
              <input style={inputStyle} type="date" value={result.meeting_date} onChange={(e) => onChange({ meeting_date: e.target.value })} />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label style={miniLabel}>Type</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={result.meeting_type} onChange={(e) => onChange({ meeting_type: e.target.value })}>
                {MEETING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ flex: '2 1 220px' }}>
              <label style={miniLabel}>Title</label>
              <input style={inputStyle} value={result.title} onChange={(e) => onChange({ title: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--g-text-mid)' }}>
            {result.agenda_items.length} agenda item{result.agenda_items.length === 1 ? '' : 's'}
            {result.actions.length > 0 && ` · ${result.actions.length} action${result.actions.length === 1 ? '' : 's'}`} detected.
            They will be filed with the meeting.
          </div>
        </div>
      )}
    </div>
  );
}

const primaryBtn = {
  flexShrink: 0, padding: '8px 14px', borderRadius: 'var(--r-md)', border: 'none',
  background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
};
const ghostBtn = {
  flexShrink: 0, padding: '7px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--g-border)',
  background: 'transparent', color: 'var(--g-text-mid)', fontSize: 13, cursor: 'pointer',
};
const miniLabel = { fontSize: 12, fontWeight: 600, color: 'var(--g-text-mid)', marginBottom: 5, display: 'block' };
