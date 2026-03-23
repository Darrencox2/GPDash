'use client';
import { initSlotOverrides } from '@/lib/huddle';

export default function SlotFilter({ overrides, setOverrides, show, setShow, huddleSettings }) {
  return (
    <div className="flex-shrink-0 relative">
      <button onClick={() => { if (!show && !overrides) setOverrides(initSlotOverrides(huddleSettings)); setShow(!show); }}
        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${show ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
        🔧 Slot Filter {show ? '▾' : '›'}
      </button>
      {show && overrides && (
        <div className="absolute right-0 top-full mt-1 z-20 card p-4 w-64 max-h-72 overflow-y-auto shadow-lg">
          <div className="text-xs font-medium text-slate-700 mb-2">Include in count:</div>
          <div className="space-y-1">
            {(huddleSettings?.knownSlotTypes || []).sort().map(slot => (
              <label key={slot} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                <input type="checkbox" checked={!!overrides[slot]} onChange={e => setOverrides({ ...overrides, [slot]: e.target.checked })} className="rounded border-slate-300" />
                <span className="truncate" title={slot}>{slot.length > 28 ? slot.slice(0, 28) + '...' : slot}</span>
              </label>
            ))}
          </div>
          <button onClick={() => setOverrides(null)} className="mt-2 text-xs text-slate-500 hover:underline">Reset to defaults</button>
        </div>
      )}
    </div>
  );
}
