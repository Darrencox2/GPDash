'use client';
import { useState } from 'react';

export default function TeamMembers({ data, saveData, helpers }) {
  const { ensureArray, removeClinician, updateClinicianField } = helpers;
  const [showAddClinician, setShowAddClinician] = useState(false);
  const [newClinician, setNewClinician] = useState({ name: '', role: '', initials: '', sessions: 6 });

  const addClinician = () => {
    if (!newClinician.name || !newClinician.initials) return;
    const newId = Math.max(0, ...ensureArray(data.clinicians).map(c => c.id)) + 1;
    const clinician = { id: newId, name: newClinician.name, initials: newClinician.initials.toUpperCase(), role: newClinician.role || 'GP', sessions: newClinician.sessions || 6, primaryBuddy: null, secondaryBuddy: null, longTermAbsent: false, canProvideCover: true };
    saveData({ ...data, clinicians: [...ensureArray(data.clinicians), clinician] });
    setNewClinician({ name: '', role: '', initials: '', sessions: 6 });
    setShowAddClinician(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-slate-900">Team Members</h1><p className="text-sm text-slate-500 mt-1">Manage clinicians and buddy assignments</p></div><button onClick={() => setShowAddClinician(!showAddClinician)} className="btn-primary">Add Clinician</button></div>
      {showAddClinician && (
        <div className="card p-4 bg-slate-50 flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[180px]"><label className="block text-xs font-medium text-slate-600 mb-1">Name</label><input type="text" placeholder="Dr. Jane Smith" value={newClinician.name} onChange={e => setNewClinician(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /></div>
          <div className="w-20"><label className="block text-xs font-medium text-slate-600 mb-1">Initials</label><input type="text" placeholder="JS" maxLength={4} value={newClinician.initials} onChange={e => setNewClinician(p => ({ ...p, initials: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm text-center uppercase focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /></div>
          <div className="w-20"><label className="block text-xs font-medium text-slate-600 mb-1">Sessions</label><input type="number" min="1" max="10" value={newClinician.sessions} onChange={e => setNewClinician(p => ({ ...p, sessions: parseInt(e.target.value) || 6 }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /></div>
          <div className="flex-1 min-w-[180px]"><label className="block text-xs font-medium text-slate-600 mb-1">Role</label><input type="text" placeholder="GP Partner" value={newClinician.role} onChange={e => setNewClinician(p => ({ ...p, role: e.target.value }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /></div>
          <button onClick={addClinician} className="btn-primary text-sm">Add</button>
        </div>
      )}
      <div className="space-y-2">
        {ensureArray(data.clinicians).map((c, idx) => {
          const all = ensureArray(data.clinicians);
          return (
            <div key={c.id} className={`card p-4 transition-colors ${c.longTermAbsent ? 'border-amber-200 bg-amber-50/50' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <button onClick={() => { if (idx === 0) return; const nc = [...all]; [nc[idx - 1], nc[idx]] = [nc[idx], nc[idx - 1]]; saveData({ ...data, clinicians: nc }); }} disabled={idx === 0} className={`w-6 h-6 flex items-center justify-center rounded text-xs ${idx === 0 ? 'text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>▲</button>
                  <button onClick={() => { if (idx === all.length - 1) return; const nc = [...all]; [nc[idx], nc[idx + 1]] = [nc[idx + 1], nc[idx]]; saveData({ ...data, clinicians: nc }); }} disabled={idx === all.length - 1} className={`w-6 h-6 flex items-center justify-center rounded text-xs ${idx === all.length - 1 ? 'text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>▼</button>
                </div>
                <div className="flex-1">
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className={`initials-badge ${c.longTermAbsent ? 'bg-amber-100 text-amber-700' : 'neutral'}`}>{c.initials}</div>
                    <div><div className="text-sm font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.role}</div>{c.longTermAbsent && <div className="mt-1"><span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Long-term absent</span></div>}</div>
                  </div>
                  <div className="flex gap-4 flex-wrap items-end text-sm">
                    <div><label className="block text-xs text-slate-500 mb-1">Sessions/week</label><input type="number" min="1" max="10" value={c.sessions || 6} onChange={e => updateClinicianField(c.id, 'sessions', e.target.value)} className="w-14 px-2 py-1 rounded border border-slate-200 text-center text-sm" /></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Primary buddy</label><select value={c.primaryBuddy || ''} onChange={e => updateClinicianField(c.id, 'primaryBuddy', e.target.value)} className="px-2 py-1 rounded border border-slate-200 text-sm"><option value="">None</option>{all.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.id}>{x.initials} — {x.name}</option>)}</select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Secondary buddy</label><select value={c.secondaryBuddy || ''} onChange={e => updateClinicianField(c.id, 'secondaryBuddy', e.target.value)} className="px-2 py-1 rounded border border-slate-200 text-sm"><option value="">None</option>{all.filter(x => x.id !== c.id && x.id !== c.primaryBuddy).map(x => <option key={x.id} value={x.id}>{x.initials} — {x.name}</option>)}</select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Can cover others</label><button onClick={() => updateClinicianField(c.id, 'canProvideCover', c.canProvideCover === false ? true : false)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${c.canProvideCover !== false ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c.canProvideCover !== false ? 'Yes' : 'No'}</button></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Long-term absent</label><button onClick={() => updateClinicianField(c.id, 'longTermAbsent', !c.longTermAbsent)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${c.longTermAbsent ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c.longTermAbsent ? 'Yes' : 'No'}</button></div>
                  </div>
                </div>
                <button onClick={() => removeClinician(c.id)} className="text-xs text-slate-400 hover:text-red-600 transition-colors">Remove</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="card p-5 bg-slate-50 border-slate-200"><h3 className="text-sm font-medium text-slate-700 mb-2">How allocation works</h3><p className="text-sm text-slate-600 leading-relaxed">Sessions are used to balance workload fairly. When someone is absent (AL/sick), their buddy will file and action their results. Day off clinicians only need their results viewed for safety. Primary/secondary buddies are preferred when available. Clinicians with "Can cover others" set to No (e.g. trainees) will still have their results covered but won't be assigned to cover anyone else. Long-term absent clinicians are automatically marked absent each day until the flag is removed.</p></div>
    </div>
  );
}
