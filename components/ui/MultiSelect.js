'use client';
// A tick-box dropdown, in the shape the report builder established:
// summary button with a count, a search box, Clear, and a scrolling list
// of checkboxes. Lifted into ui/ so other sections use the same control
// rather than inventing another filter idiom.
import { useState, useRef, useEffect } from 'react';

export default function MultiSelect({
  label, options, selected, onChange,
  allLabel = 'All', presets = null, searchable = true, width = 210, hintLabel = null,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);
  const sel = selected || [];

  // Click-away and Escape close it — a filter left hanging open covers
  // the thing you were filtering.
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (id) => {
    const s = new Set(sel);
    if (s.has(id)) s.delete(id); else s.add(id);
    onChange(Array.from(s));
  };
  const summary = sel.length === 0 ? allLabel
    : sel.length === 1 ? (options.find(o => o.id === sel[0])?.label || `1 selected`)
    : `${sel.length} selected`;

  return (
    <div className="relative" ref={box} style={{ width }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="listbox"
        className="w-full flex items-center justify-between gap-2 text-xs rounded-md px-2.5 py-1.5"
        style={{ background: 'var(--g-tile)', border: `1px solid ${sel.length ? 'var(--accent)' : 'var(--g-border-2)'}`, color: 'var(--g-text-hi)' }}>
        <span className="truncate"><span style={{ color: 'var(--meta)' }}>{label}: </span>{summary}</span>
        <span style={{ color: 'var(--meta)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-md p-2 space-y-1"
          style={{ background: 'var(--g-surface-2)', border: '1px solid var(--g-border-2)', boxShadow: '0 12px 28px rgba(0,0,0,0.45)' }}>
          {(searchable || sel.length > 0) && (
            <div className="flex items-center gap-1">
              {searchable && (
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                  className="flex-1 text-xs rounded px-2 py-1 min-w-0"
                  style={{ background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)', outline: 'none' }} />
              )}
              {sel.length > 0 && <button onClick={() => onChange([])} className="text-xs px-1" style={{ color: 'var(--meta)' }}>Clear</button>}
            </div>
          )}
          {presets && presets.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-1" style={{ borderBottom: '1px solid var(--g-border)' }}>
              {presets.map(p => (
                <button key={p.label} onClick={() => onChange(p.ids)} className="text-[11px] px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--link)' }}>{p.label}</button>
              ))}
            </div>
          )}
          {hintLabel && (
            <div className="flex items-center justify-end px-1 text-[10px] uppercase" style={{ color: 'var(--meta)', letterSpacing: '0.05em' }}>{hintLabel}</div>
          )}
          <div className="max-h-52 overflow-y-auto space-y-0.5" role="listbox">
            {filtered.map(o => (
              <label key={o.id} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-white/5">
                <input type="checkbox" checked={sel.includes(o.id)} onChange={() => toggle(o.id)} className="accent-indigo-500" />
                <span className="text-xs truncate flex-1" style={{ color: 'var(--g-text-hi)' }}>{o.label}</span>
                {o.hint != null && <span className="text-[11px]" style={{ color: 'var(--meta)', fontFamily: 'var(--font-mono)' }}>{o.hint}</span>}
              </label>
            ))}
            {filtered.length === 0 && <div className="text-xs px-1 py-1" style={{ color: 'var(--meta)' }}>No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
