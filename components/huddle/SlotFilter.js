'use client';
import { useState } from 'react';

// ── Slot Filter Button ──────────────────────────────────────────
export function SlotFilterButton({ overrides, setOverrides, knownSlotTypes, show, setShow, variant = 'dark' }) {
  const selectedCount = overrides ? Object.values(overrides).filter(Boolean).length : 0;
  const btnClass = variant === 'light'
    ? `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${show ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`
    : `px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${show ? 'bg-slate-900 text-white' : 'bg-white/20 text-white/90 hover:bg-white/30'}`;
  return (
    <button onClick={() => {
      if (!show && !overrides) {
        const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = true; }); setOverrides(o);
      }
      setShow(!show);
    }} className={btnClass}>
      ⚙ Slots{selectedCount > 0 ? ` (${selectedCount})` : ''}
    </button>
  );
}

// ── Right-side Slot Filter Panel ────────────────────────────────
export function SlotFilterPanel({ overrides, setOverrides, knownSlotTypes, show, setShow, title }) {
  if (!show || !overrides) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/20" onClick={() => setShow(false)} />
      <div className="w-80 bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full animate-slide-in-right">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="text-sm font-semibold text-slate-900">{title || 'Slot Filter'}</div>
          <button onClick={() => setShow(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">✕</button>
        </div>

        {/* Actions at top */}
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => { const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = false; }); setOverrides(o); }}
            className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">Deselect all</button>
          <span className="text-slate-200">|</span>
          <button onClick={() => { const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = true; }); setOverrides(o); }}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">Select all</button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {(knownSlotTypes || []).sort().map(slot => (
            <label key={slot} className="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-2 transition-colors">
              <input type="checkbox" checked={!!overrides[slot]}
                onChange={e => setOverrides({ ...overrides, [slot]: e.target.checked })}
                className="rounded border-slate-300 flex-shrink-0 w-4 h-4" />
              <span className="truncate" title={slot}>{slot}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 flex-shrink-0">
          <button onClick={() => { setOverrides(null); setShow(false); }}
            className="text-xs text-slate-500 hover:text-slate-700 hover:underline transition-colors">Reset to defaults</button>
        </div>
      </div>
    </div>
  );
}

// ── Combined component (convenience) ─────────────────────────────
export default function SlotFilter({ overrides, setOverrides, knownSlotTypes, title, variant = 'dark' }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <SlotFilterButton overrides={overrides} setOverrides={setOverrides} knownSlotTypes={knownSlotTypes} show={show} setShow={setShow} variant={variant} />
      <SlotFilterPanel overrides={overrides} setOverrides={setOverrides} knownSlotTypes={knownSlotTypes} show={show} setShow={setShow} title={title} />
    </>
  );
}
