'use client';
import { useState } from 'react';

// ── Slot Filter Button ──────────────────────────────────────────
export function SlotFilterButton({ overrides, setOverrides, knownSlotTypes, show, setShow, variant = 'dark', initialOverrides }) {
  const selectedCount = overrides ? Object.values(overrides).filter(Boolean).length : 0;
  return (
    <button onClick={() => {
      if (!show && !overrides) {
        if (initialOverrides) {
          setOverrides(initialOverrides);
        } else {
          const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = false; }); setOverrides(o);
        }
      }
      setShow(!show);
    }} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${show ? 'bg-white/20 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
      title={`Filter slots${selectedCount > 0 ? ` (${selectedCount} selected)` : ''}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/></svg>
    </button>
  );
}

// ── Right-side Slot Filter Panel ────────────────────────────────
export function SlotFilterPanel({ overrides, setOverrides, knownSlotTypes, show, setShow, title, dutyDoctorSlot, setDutyDoctorSlot }) {
  if (!show || !overrides) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/20" onClick={() => setShow(false)} />
      <div className="w-80 shadow-2xl flex flex-col h-full animate-slide-in-right" style={{background:'#0f172a',borderLeft:'1px solid rgba(255,255,255,0.08)'}}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="text-sm font-semibold text-slate-200">{title || 'Slot Filter'}</div>
          <button onClick={() => setShow(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-colors">✕</button>
        </div>

        {/* Duty doctor slot selector */}
        {setDutyDoctorSlot && (
          <div className="px-4 py-3" style={{borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(245,158,11,0.08)'}}>
            <label className="block text-xs font-semibold text-amber-400 mb-1.5">Duty doctor slot(s)</label>
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {(knownSlotTypes || []).sort().map(s => {
                const selected = Array.isArray(dutyDoctorSlot) ? dutyDoctorSlot.includes(s) : dutyDoctorSlot === s;
                return (
                  <label key={s} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-amber-100/50 rounded px-1.5 py-1">
                    <input type="checkbox" checked={selected} onChange={e => {
                      const current = Array.isArray(dutyDoctorSlot) ? dutyDoctorSlot : dutyDoctorSlot ? [dutyDoctorSlot] : [];
                      setDutyDoctorSlot(e.target.checked ? [...current, s] : current.filter(x => x !== s));
                    }} className="rounded border-amber-300 flex-shrink-0 w-3.5 h-3.5" />
                    <span className="truncate text-amber-900" title={s}>{s}</span>
                  </label>
                );
              })}
            </div>
            <div className="text-[10px] text-amber-600 mt-1">Select slot type(s) that identify the duty doctor</div>
          </div>
        )}

        {/* Actions at top */}
        <div className="px-4 py-2 flex items-center gap-3 flex-shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <button onClick={() => { const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = false; }); setOverrides(o); }}
            className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors">Deselect all</button>
          <span className="text-slate-700">|</span>
          <button onClick={() => { const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = true; }); setOverrides(o); }}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">Select all</button>
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
        <div className="px-4 py-3 flex-shrink-0" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
          <button onClick={() => { setOverrides(null); setShow(false); }}
            className="text-xs text-slate-500 hover:text-slate-300 hover:underline transition-colors">Reset to defaults</button>
        </div>
      </div>
    </div>
  );
}

// ── Combined component (convenience) ─────────────────────────────
export default function SlotFilter({ overrides, setOverrides, knownSlotTypes, title, variant = 'dark', initialOverrides, dutyDoctorSlot, setDutyDoctorSlot }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <SlotFilterButton overrides={overrides} setOverrides={setOverrides} knownSlotTypes={knownSlotTypes} show={show} setShow={setShow} variant={variant} initialOverrides={initialOverrides} />
      <SlotFilterPanel overrides={overrides} setOverrides={setOverrides} knownSlotTypes={knownSlotTypes} show={show} setShow={setShow} title={title} dutyDoctorSlot={dutyDoctorSlot} setDutyDoctorSlot={setDutyDoctorSlot} />
    </>
  );
}
