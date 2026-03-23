'use client';
import { useRef, useEffect } from 'react';
import { initSlotOverrides } from '@/lib/huddle';

export default function SlotFilter({ overrides, setOverrides, show, setShow, huddleSettings }) {
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const knownSlotTypes = huddleSettings?.knownSlotTypes || [];

  // Close on click outside
  useEffect(() => {
    if (!show) return;
    const handler = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);

  const getPos = () => {
    if (!btnRef.current) return {};
    const r = btnRef.current.getBoundingClientRect();
    return { top: r.bottom + 4, right: window.innerWidth - r.right };
  };

  return (
    <div className="flex-shrink-0">
      <button ref={btnRef} onClick={() => { if (!show && !overrides) setOverrides(initSlotOverrides(huddleSettings)); setShow(!show); }}
        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${show ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
        🔧 Slot Filter {show ? '▾' : '›'}
      </button>
      {show && overrides && (
        <div ref={panelRef} className="fixed z-50 bg-white rounded-xl border border-slate-200 shadow-xl w-72" style={getPos()}>
          <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex items-center justify-between">
            <div className="text-xs font-medium text-slate-700">Include in count:</div>
            <div className="flex gap-2">
              <button onClick={() => { const o = {}; knownSlotTypes.forEach(s => { o[s] = true; }); setOverrides(o); }} className="text-[10px] text-blue-600 hover:underline font-medium">Select all</button>
              <button onClick={() => { const o = {}; knownSlotTypes.forEach(s => { o[s] = false; }); setOverrides(o); }} className="text-[10px] text-red-500 hover:underline font-medium">Deselect all</button>
            </div>
          </div>
          <div className="overflow-y-auto p-3 space-y-0.5" style={{ maxHeight: 'min(50vh, 320px)' }}>
            {knownSlotTypes.sort().map(slot => (
              <label key={slot} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded px-1 py-1">
                <input type="checkbox" checked={!!overrides[slot]} onChange={e => setOverrides({ ...overrides, [slot]: e.target.checked })} className="rounded border-slate-300 flex-shrink-0" />
                <span className="truncate" title={slot}>{slot}</span>
              </label>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-slate-100">
            <button onClick={() => { setOverrides(null); setShow(false); }} className="text-[10px] text-slate-500 hover:underline">Reset to defaults</button>
          </div>
        </div>
      )}
    </div>
  );
}
