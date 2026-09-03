'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui';

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
  const toast = useToast();
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
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error('Not signed in');

      const form = new FormData();
      form.append('practice_id', practiceId);
      form.append('file', row.file);

      // Direct fetch (the function now runs verify_jwt=false + handles its own
      // OPTIONS, so there is no preflight gate). We read the body as TEXT first
      // and parse defensively — supabase.functions.invoke throws an opaque
      // "Unexpected end of JSON input" if the body is ever empty.
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const res = await fetch(`${base}/functions/v1/extract-meeting-doc`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        },
        body: form,
      });

      const raw = await res.text();
      let payload = null;
      if (raw) {
        try { payload = JSON.parse(raw); } catch { /* non-JSON body */ }
      }
      if (!res.ok) {
        throw new Error(payload?.error || `Extraction failed (${res.status})${raw ? ': ' + raw.slice(0, 160) : ''}`);
      }
      if (!payload) throw new Error('The server returned an empty response');
      if (payload.error) throw new Error(payload.error);

      const s = payload.structured || {};
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
      toast('Meeting filed', 'success');
      if (onFiled) onFiled();
    } catch (e) {
      patchRow(row.id, { status: 'review', error: e?.message || 'Could not file this meeting' });
    }
  };

  const updateResult = (id, patch) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, result: { ...row.result, ...patch } } : row)));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p style={{ fontSize: 13, color: 'var(--g-text-mid)', margin: 0, maxWidth: 560 }}>
          Upload past agendas or minutes (.docx or .pdf). Each is read automatically — check the date and details, then file it. Nothing is saved until you confirm.
        </p>
        <button onClick={() => fileRef.current?.click()} style={primaryBtn}>Choose files</button>
        <input ref={fileRef} type="file" accept=".docx,.pdf" multiple onChange={onPick} className="hidden" />
      </div>

      {globalError && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--c-red)', fontSize: 13 }}>{globalError}</div>
      )}

      {rows.length === 0 && (
        <div style={{ padding: 28, borderRadius: 'var(--r-lg)', background: 'var(--g-tile)', border: '1px dashed var(--g-border)', textAlign: 'center', color: 'var(--g-text-mid)', fontSize: 13 }}>
          No files yet. Choose .docx or .pdf agendas and minutes to import.
        </div>
      )}

      <div className="flex flex-col gap-3">
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
      <div className="flex items-center justify-between gap-2.5 px-3.5 py-3">
        <div className="min-w-0">
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div className="text-meta text-mid mt-0.5">
            {status === 'extracting' && 'Reading document…'}
            {status === 'review' && result && (
              <span>Detected · confidence {result.confidence}</span>
            )}
            {status === 'filing' && 'Filing…'}
            {status === 'done' && <span className="text-emerald-300">Filed ✓</span>}
            {status === 'error' && <span className="text-red-300">{error}</span>}
          </div>
        </div>
        {status === 'error' && <button onClick={onRetry} style={ghostBtn}>Retry</button>}
        {status === 'review' && <button onClick={onFile} style={primaryBtn}>File meeting</button>}
      </div>

      {status === 'review' && result && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--g-border)' }}>
          {error && <div style={{ margin: '10px 0', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', color: 'var(--c-red)', fontSize: 13 }}>{error}</div>}
          {result.confidence === 'low' && (
            <div style={{ margin: '12px 0 0', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: 'var(--c-amber)', fontSize: 13 }}>
              Low confidence on the date — please check it carefully before filing.
            </div>
          )}
          <div className="flex gap-3 flex-wrap mt-3">
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
          <div className="mt-3 text-body-sm text-mid">
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
  background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const ghostBtn = {
  flexShrink: 0, padding: '7px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--g-border)',
  background: 'transparent', color: 'var(--g-text-mid)', fontSize: 13, cursor: 'pointer',
};
const miniLabel = { fontSize: 12, fontWeight: 600, color: 'var(--g-text-mid)', marginBottom: 5, display: 'block' };
