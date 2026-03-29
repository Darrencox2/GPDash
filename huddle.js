'use client';
import { useState } from 'react';
import { SectionHeading, Button } from '@/components/ui';
import { calculateHistoricalTargets } from '@/lib/huddle';

export default function HuddleSettings({ data, saveData, setActiveSection, huddleData }) {
  const [newFilterName, setNewFilterName] = useState('');
  const hs = data?.huddleSettings || {};

  const hasData = hs?.knownClinicians?.length > 0 || hs?.knownSlotTypes?.length > 0;

  if (!hasData) {
    return (
      <div className="space-y-6 animate-in">
        <SectionHeading title="Huddle Settings" subtitle="Configure clinicians, slot filters, and capacity targets" />
        <div className="card p-12 text-center"><div className="text-5xl mb-4">⚙️</div><h2 className="text-lg font-semibold text-slate-900 mb-2">Upload a Report First</h2><p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload an EMIS report on the Today page.</p><button onClick={() => setActiveSection('huddle-today')} className="btn-primary">Go to Today</button></div>
      </div>
    );
  }

  const updateHs = (newHs) => saveData({ ...data, huddleSettings: newHs });
  const dropSlotToCategory = (slot, targetCat) => {
    const newHs = { ...hs }; const cats = { ...newHs.slotCategories };
    Object.keys(cats).forEach(c => { cats[c] = (cats[c] || []).filter(x => x !== slot); });
    const cf = { ...newHs.customFilters || {} };
    Object.keys(cf).forEach(f => { cf[f] = cf[f].filter(x => x !== slot); });
    if (targetCat === 'urgent' || targetCat === 'excluded') { cats[targetCat] = [...(cats[targetCat] || []), slot]; }
    else { cf[targetCat] = [...(cf[targetCat] || []), slot]; }
    updateHs({ ...newHs, slotCategories: cats, customFilters: cf });
  };

  const dropClinician = (name, group) => {
    const g = { ...hs.clinicianGroups }; ['clinician','nursing','other'].forEach(c => { g[c] = (g[c]||[]).filter(x => x !== name); }); g[group] = [...(g[group]||[]), name];
    updateHs({ ...hs, clinicianGroups: g });
  };

  const toggleClinician = (name) => {
    const inc = hs.includedClinicians || [];
    updateHs({ ...hs, includedClinicians: inc.includes(name) ? inc.filter(c => c !== name) : [...inc, name] });
  };

  const allCategorised = [...(hs.slotCategories?.urgent||[]), ...(hs.slotCategories?.excluded||[]), ...Object.values(hs.customFilters||{}).flat()];
  const uncategorised = (hs.knownSlotTypes || []).filter(s => !allCategorised.includes(s));
  const ungrouped = (hs.knownClinicians || []).filter(c => !['clinician','nursing','other'].some(g => (hs.clinicianGroups?.[g]||[]).includes(c)));

  const DZ = ({ onDrop: handler, colour, children }) => (
    <div className={`min-h-[36px] p-2 rounded-lg border-2 border-dashed ${colour}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const s = e.dataTransfer.getData('slot'); const c = e.dataTransfer.getData('clinician'); if (s) handler(s); if (c) handler(c); }}>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in">
      <SectionHeading title="Huddle Settings" subtitle="Configure clinicians, slot filters, and capacity targets" />

      {/* Clinician Groups */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-2">Clinicians to Include</h2>
        <p className="text-xs text-slate-500 mb-3">Click to toggle. Drag to assign to groups.</p>
        {['clinician','nursing','other'].map(group => {
          const labels = { clinician: '👨‍⚕️ Clinician Team', nursing: '👩‍⚕️ Nursing Team', other: '📋 Other' };
          const members = hs.clinicianGroups?.[group] || [];
          return (
            <div key={group} className="mb-3">
              <div className="text-xs font-medium text-slate-600 mb-1">{labels[group]}</div>
              <DZ onDrop={n => dropClinician(n, group)} colour="border-slate-200 bg-white">
                {members.map(name => {
                  const inc = (hs.includedClinicians||[]).includes(name);
                  return <div key={name} draggable onDragStart={e => e.dataTransfer.setData('clinician', name)} onClick={() => toggleClinician(name)} className={`px-2 py-1 rounded-md text-xs cursor-pointer transition-colors ${inc ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{name}</div>;
                })}
                {members.length === 0 && <span className="text-xs text-slate-400 italic">Drag here</span>}
              </DZ>
            </div>
          );
        })}
        {ungrouped.length > 0 && <div className="mt-2"><div className="text-xs text-slate-500 mb-1">Ungrouped:</div><div className="flex flex-wrap gap-1">{ungrouped.map(n => <div key={n} draggable onDragStart={e => e.dataTransfer.setData('clinician', n)} className="px-2 py-1 rounded-md text-xs bg-amber-50 text-amber-700 border border-amber-200 cursor-move">{n}</div>)}</div></div>}
      </div>

      {/* Slot Type Filters */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-2">Slot Type Filters</h2>
        <p className="text-xs text-slate-500 mb-4">Create named filters by dragging slot types.</p>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1"><span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-md">🔴 Urgent</span></div>
          <DZ onDrop={s => dropSlotToCategory(s, 'urgent')} colour="border-red-200 bg-red-50/50">
            {(hs.slotCategories?.urgent||[]).map(s => <div key={s} draggable onDragStart={e => e.dataTransfer.setData('slot', s)} className="px-2 py-0.5 rounded-md text-xs cursor-move bg-red-100 text-red-800 truncate max-w-[200px]" title={s}>{s}</div>)}
            {!(hs.slotCategories?.urgent||[]).length && <span className="text-xs text-slate-400 italic">Drag slot types here</span>}
          </DZ>
        </div>

        {Object.entries(hs.customFilters || {}).map(([name, slots]) => (
          <div key={name} className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">🔵 {name}</span>
              <button onClick={() => { const cf = { ...hs.customFilters }; delete cf[name]; updateHs({ ...hs, customFilters: cf }); }} className="text-[10px] text-red-400 hover:text-red-600">Remove</button>
            </div>
            <DZ onDrop={s => dropSlotToCategory(s, name)} colour="border-blue-200 bg-blue-50/30">
              {slots.map(s => <div key={s} draggable onDragStart={e => e.dataTransfer.setData('slot', s)} className="px-2 py-0.5 rounded-md text-xs cursor-move bg-blue-100 text-blue-800 truncate max-w-[200px]" title={s}>{s}</div>)}
              {slots.length === 0 && <span className="text-xs text-slate-400 italic">Drag slot types here</span>}
            </DZ>
          </div>
        ))}

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1"><span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">⚪ Excluded</span></div>
          <DZ onDrop={s => dropSlotToCategory(s, 'excluded')} colour="border-slate-200 bg-slate-50">
            {(hs.slotCategories?.excluded||[]).map(s => <div key={s} draggable onDragStart={e => e.dataTransfer.setData('slot', s)} className="px-2 py-0.5 rounded-md text-xs cursor-move bg-white text-slate-500 border border-slate-200 truncate max-w-[200px]" title={s}>{s}</div>)}
            {!(hs.slotCategories?.excluded||[]).length && <span className="text-xs text-slate-400 italic">Drag here</span>}
          </DZ>
        </div>

        <div className="flex gap-2 items-center pt-2 border-t border-slate-200">
          <input type="text" value={newFilterName} onChange={e => setNewFilterName(e.target.value)} placeholder="New filter name..." className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900" onKeyDown={e => { if (e.key === 'Enter' && newFilterName.trim()) { updateHs({ ...hs, customFilters: { ...hs.customFilters, [newFilterName.trim()]: [] } }); setNewFilterName(''); }}} />
          <button onClick={() => { if (!newFilterName.trim()) return; updateHs({ ...hs, customFilters: { ...hs.customFilters, [newFilterName.trim()]: [] } }); setNewFilterName(''); }} className="btn-primary text-xs">+ Add Filter</button>
        </div>

        {uncategorised.length > 0 && <div className="mt-4 pt-3 border-t border-slate-200"><div className="text-xs text-slate-500 mb-2">Uncategorised ({uncategorised.length}):</div><div className="max-h-32 overflow-y-auto"><div className="flex flex-wrap gap-1">{uncategorised.sort().map(s => <div key={s} draggable onDragStart={e => e.dataTransfer.setData('slot', s)} className="px-2 py-0.5 rounded-md text-xs bg-amber-50 text-amber-700 border border-amber-200 cursor-move truncate max-w-[200px]" title={s}>{s}</div>)}</div></div></div>}
      </div>

      {/* Expected Capacity Targets */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-slate-900">Expected Capacity Targets</h2>
          {huddleData && (
            <Button size="sm" variant="secondary" onClick={() => {
              const calculated = calculateHistoricalTargets(huddleData, hs);
              if (Object.keys(calculated).length === 0) return;
              updateHs({ ...hs, expectedCapacity: { ...hs.expectedCapacity, ...calculated } });
            }}>
              📊 Auto-fill from history
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">Set expected urgent slots per session. Auto-fill calculates averages from your uploaded data. You can override any value. Capacity Planning colour-codes: green (≥100%), amber (80–99%), red (&lt;80%).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 uppercase"><th className="text-left py-2 font-medium w-24"></th>{['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => <th key={d} className="text-center py-2 font-medium px-2">{d.slice(0,3)}</th>)}</tr></thead>
            <tbody>
              {['am','pm'].map(session => (
                <tr key={session} className="border-t border-slate-100">
                  <td className={`py-2 text-xs font-medium ${session === 'am' ? 'text-amber-600' : 'text-blue-600'}`}>{session === 'am' ? 'Morning' : 'Afternoon'}</td>
                  {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => (
                    <td key={d} className="text-center px-1 py-2">
                      <input type="number" min="0" max="999" value={hs.expectedCapacity?.[d]?.[session] || ''} onChange={e => {
                        const newHs = { ...hs }; if (!newHs.expectedCapacity) newHs.expectedCapacity = {}; if (!newHs.expectedCapacity[d]) newHs.expectedCapacity[d] = {};
                        newHs.expectedCapacity[d][session] = parseInt(e.target.value) || 0; updateHs(newHs);
                      }} placeholder="–" className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-center text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
