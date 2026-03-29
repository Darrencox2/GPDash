'use client';
import { useState } from 'react';
import { formatDate, groupAllocationsByCovering, getDefaultData } from '@/lib/data';

export default function BuddySettings({ data, saveData, password, syncStatus, setSyncStatus, helpers }) {
  const { ensureArray, getTodayKey, getClinicianById, syncTeamNet } = helpers;
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const updateSettings = (field, value) => {
    const newSettings = { ...data.settings, [field]: parseFloat(value) || 1 };
    saveData({ ...data, settings: newSettings });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-bold text-slate-900">Settings</h1><p className="text-sm text-slate-500 mt-1">Configure TeamNet sync and allocation weights</p></div>
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-4">TeamNet Calendar Sync</h2>
        <p className="text-sm text-slate-500 mb-4">Import planned absences from your TeamNet calendar. The app syncs automatically when you open it.</p>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">TeamNet Calendar URL</label><input type="url" value={data.teamnetUrl || ''} onChange={e => saveData({ ...data, teamnetUrl: e.target.value }, false)} onBlur={() => data.teamnetUrl && saveData(data)} placeholder="https://teamnet.clarity.co.uk/Diary/Sync/..." className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" /></div>
          <div className="flex items-center gap-3"><button onClick={() => syncTeamNet()} className="btn-primary">Sync Now</button>{syncStatus && <span className={`text-sm ${syncStatus.includes('Error') || syncStatus.includes('failed') ? 'text-red-600' : 'text-emerald-600'}`}>{syncStatus}</span>}{data.lastSyncTime && <span className="text-xs text-slate-400">Last: {new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}</div>
        </div>
        {(ensureArray(data.plannedAbsences).length > 0) && (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <h3 className="text-sm font-medium text-slate-900 mb-3">Upcoming Planned Absences</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {ensureArray(data.plannedAbsences).filter(a => a.endDate >= getTodayKey()).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 20).map((a, i) => {
                const c = ensureArray(data.clinicians).find(c => c.id === a.clinicianId);
                if (!c) return null;
                const sd = new Date(a.startDate + 'T12:00:00');
                const ed = new Date(a.endDate + 'T12:00:00');
                const ds = a.startDate === a.endDate ? sd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : `${sd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${ed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
                return <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm"><div><span className="font-medium">{c.initials}</span><span className="text-slate-500 ml-2">{ds}</span><span className="text-slate-400 ml-2">({a.reason})</span></div><button onClick={() => { const abs = ensureArray(data.plannedAbsences); saveData({ ...data, plannedAbsences: abs.filter((_, j) => j !== abs.indexOf(a)) }); }} className="text-xs text-red-500 hover:text-red-700">Remove</button></div>;
              })}
            </div>
          </div>
        )}
      </div>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5"><h2 className="text-base font-semibold text-slate-900">Workload Weights</h2>{settingsSaved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}</div>
        <p className="text-sm text-slate-500 mb-6">Adjust how workload is calculated when balancing buddy allocations.</p>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"><div><div className="text-sm font-medium text-slate-900">Absent (File & Action)</div><div className="text-xs text-slate-500 mt-0.5">Multiplier when covering absent clinician</div></div><div className="flex items-center gap-2"><input type="number" min="0.5" max="10" step="0.5" value={data.settings?.absentWeight || 2} onChange={e => updateSettings('absentWeight', e.target.value)} className="w-20 px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /><span className="text-sm text-slate-500">× sessions</span></div></div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"><div><div className="text-sm font-medium text-slate-900">Day Off (View Only)</div><div className="text-xs text-slate-500 mt-0.5">Multiplier when viewing day-off results</div></div><div className="flex items-center gap-2"><input type="number" min="0.5" max="10" step="0.5" value={data.settings?.dayOffWeight || 1} onChange={e => updateSettings('dayOffWeight', e.target.value)} className="w-20 px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /><span className="text-sm text-slate-500">× sessions</span></div></div>
        </div>
      </div>
      <div className="card p-4 bg-slate-50 border-slate-200"><h3 className="text-xs font-medium text-slate-700 mb-1">How the algorithm works</h3><p className="text-xs text-slate-600 leading-relaxed"><strong>Round-robin first:</strong> Everyone gets 1 allocation before anyone gets 2. Primary buddy is tried first, then secondary, then any eligible clinician.<br/><br/><strong>Weighted tiebreaking:</strong> When multiple clinicians have same count, lowest weighted load wins. Load = (absent × {data.settings?.absentWeight || 2}) + (day-off × {data.settings?.dayOffWeight || 1}).</p></div>

      <div className="card p-5 border-red-200">
        <h2 className="text-base font-semibold text-red-700 mb-4">Danger Zone</h2>
        <p className="text-sm text-slate-500 mb-4">Reset all data to defaults. This will clear ALL clinicians, rotas, and history.</p>
        <button onClick={async () => { if (confirm('Delete ALL DATA and reset? Cannot be undone.')) { if (confirm('FINAL WARNING: Everything will be deleted. Continue?')) { const d = getDefaultData(); saveData(d); try { await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-password': password }, body: JSON.stringify(d) }); alert('Reset successful. Refreshing...'); window.location.reload(); } catch (err) { alert('Reset failed: ' + err.message); } } } }} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium">Reset All Data</button>
      </div>
      <div className="card p-5">
        <button onClick={() => setShowHistory(!showHistory)} className="flex items-center justify-between w-full"><h2 className="text-base font-semibold text-slate-900">Allocation History</h2><span className="text-sm text-slate-500">{showHistory ? '▼' : '▶'}</span></button>
        {showHistory && (
          <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {Object.entries(data.allocationHistory || {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30).map(([dk, e]) => {
              const g = groupAllocationsByCovering(e.allocations || {}, e.dayOffAllocations || {}, e.presentIds || []);
              const has = Object.entries(g).some(([_, t]) => t.absent.length > 0 || t.dayOff.length > 0);
              return <div key={dk} className="p-3 bg-slate-50 rounded-lg"><div className="text-sm font-medium text-slate-900">{formatDate(dk)}</div>{has ? <div className="mt-2 text-xs text-slate-600">{Object.entries(g).map(([bid, t]) => { if (t.absent.length === 0 && t.dayOff.length === 0) return null; const b = getClinicianById(parseInt(bid)); if (!b) return null; const as = t.absent.map(i => getClinicianById(i)?.initials || '??').join(', '); const ds = t.dayOff.map(i => getClinicianById(i)?.initials || '??').join(', '); return <div key={bid}>{b.initials} → {as}{ds ? ` (view: ${ds})` : ''}</div>; })}</div> : <div className="mt-1 text-xs text-slate-400">All present</div>}</div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
