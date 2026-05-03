'use client';
import { useState } from 'react';
import { calculateHistoricalTargets } from '@/lib/huddle';
import { getDefaultData } from '@/lib/data';
import { Button } from '@/components/ui';
import AuditLog from '@/components/AuditLog';

export default function BuddySettings({ data, saveData, password, syncStatus, setSyncStatus, helpers, huddleData }) {
  const { ensureArray, getTodayKey, syncTeamNet } = helpers;
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [showAbsences, setShowAbsences] = useState(false);
  const hs = data?.huddleSettings || {};

  const updateSettings = (field, value) => {
    const newSettings = { ...data.settings, [field]: parseFloat(value) || 1 };
    saveData({ ...data, settings: newSettings });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const updateHs = (newHs) => saveData({ ...data, huddleSettings: newHs }, false);

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-bold text-slate-900">Settings</h1><p className="text-sm text-slate-500 mt-1">General settings, capacity targets, and TeamNet sync</p></div>

      {/* TeamNet Calendar Sync */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-4">TeamNet Calendar Sync</h2>
        <p className="text-sm text-slate-500 mb-4">Import planned absences from your TeamNet calendar. The app syncs automatically when you open it.</p>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">TeamNet Calendar URL</label><input type="url" value={data.teamnetUrl || ''} onChange={e => saveData({ ...data, teamnetUrl: e.target.value }, false)} onBlur={() => data.teamnetUrl && saveData(data)} placeholder="https://teamnet.clarity.co.uk/Diary/Sync/..." className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" /></div>
          <div className="flex items-center gap-3"><button onClick={() => syncTeamNet()} className="btn-primary">Sync Now</button>{syncStatus && <span className={`text-sm ${syncStatus.includes('Error') || syncStatus.includes('failed') ? 'text-red-600' : 'text-emerald-600'}`}>{syncStatus}</span>}{data.lastSyncTime && <span className="text-xs text-slate-400">Last: {new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}</div>
        </div>
        {(ensureArray(data.plannedAbsences).length > 0) && (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <button onClick={() => setShowAbsences(!showAbsences)} className="flex items-center justify-between w-full text-left" style={{background:'none',border:'none',cursor:'pointer'}}>
              <h3 className="text-sm font-medium text-slate-900">Upcoming Planned Absences</h3>
              <span className="text-sm text-slate-400">{showAbsences ? '▾' : '›'} {ensureArray(data.plannedAbsences).filter(a => a.endDate >= getTodayKey()).length}</span>
            </button>
            {showAbsences && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {ensureArray(data.plannedAbsences).filter(a => a.endDate >= getTodayKey()).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 20).map((a, i) => {
                  const c = ensureArray(data.clinicians).find(c => c.id === a.clinicianId);
                  if (!c) return null;
                  const sd = new Date(a.startDate + 'T12:00:00');
                  const ed = new Date(a.endDate + 'T12:00:00');
                  const ds = a.startDate === a.endDate ? sd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : `${sd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${ed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
                  return <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm"><div><span className="font-medium">{c.initials}</span><span className="text-slate-500 ml-2">{ds}</span><span className="text-slate-400 ml-2">({a.reason})</span></div><button onClick={() => { const abs = ensureArray(data.plannedAbsences); saveData({ ...data, plannedAbsences: abs.filter((_, j) => j !== abs.indexOf(a)) }); }} className="text-xs text-red-500 hover:text-red-700">Remove</button></div>;
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Urgent Expected Capacity */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-slate-900">Urgent Expected Capacity</h2>
          {huddleData && (
            <Button size="sm" variant="secondary" onClick={() => {
              const calculated = calculateHistoricalTargets(huddleData, hs);
              if (Object.keys(calculated).length === 0) return;
              updateHs({ ...hs, expectedCapacity: { ...hs.expectedCapacity, ...calculated } });
            }}>
              Auto-fill from history
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">Set expected urgent slots per session. These targets colour-code the Today page and Capacity Planning: green (≥90%), amber (80–89%), red (&lt;80%).</p>
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

      {/* Routine Weekly Target */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-2">Routine Weekly Target</h2>
        <p className="text-xs text-slate-500 mb-3">Set a weekly target for routine appointment slots. Used in Capacity Planning to colour-code weekly routine totals.</p>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Target slots per week</label>
          <input type="number" min="0" max="9999" value={hs.routineWeeklyTarget || ''} onChange={e => updateHs({ ...hs, routineWeeklyTarget: parseInt(e.target.value) || 0 })} placeholder="e.g. 200" className="w-24 px-3 py-1.5 rounded-lg border border-slate-200 text-center text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
        </div>
      </div>

      {/* Workload Weights */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5"><h2 className="text-base font-semibold text-slate-900">Workload Weights</h2>{settingsSaved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}</div>
        <p className="text-sm text-slate-500 mb-6">Adjust how workload is calculated when balancing buddy allocations.</p>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"><div><div className="text-sm font-medium text-slate-900">Absent (File & Action)</div><div className="text-xs text-slate-500 mt-0.5">Multiplier when covering absent clinician</div></div><div className="flex items-center gap-2"><input type="number" min="0.5" max="10" step="0.5" value={data.settings?.absentWeight || 2} onChange={e => updateSettings('absentWeight', e.target.value)} className="w-20 px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /><span className="text-sm text-slate-500">× sessions</span></div></div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"><div><div className="text-sm font-medium text-slate-900">Day Off (View Only)</div><div className="text-xs text-slate-500 mt-0.5">Multiplier when viewing day-off results</div></div><div className="flex items-center gap-2"><input type="number" min="0.5" max="10" step="0.5" value={data.settings?.dayOffWeight || 1} onChange={e => updateSettings('dayOffWeight', e.target.value)} className="w-20 px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /><span className="text-sm text-slate-500">× sessions</span></div></div>
        </div>
      </div>
      <div className="card p-4 bg-slate-50 border-slate-200"><h3 className="text-xs font-medium text-slate-700 mb-1">How the algorithm works</h3><p className="text-xs text-slate-600 leading-relaxed"><strong>Round-robin first:</strong> Everyone gets 1 allocation before anyone gets 2. Primary buddy is tried first, then secondary, then any eligible clinician.<br/><br/><strong>Weighted tiebreaking:</strong> When multiple clinicians have same count, lowest weighted load wins. Load = (absent × {data.settings?.absentWeight || 2}) + (day-off × {data.settings?.dayOffWeight || 1}).</p></div>

      {/* Data Cleanup */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-2">Data Cleanup</h2>
        <p className="text-sm text-slate-500 mb-4">Clear specific data without resetting everything.</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
            <div><div className="text-sm font-medium text-slate-700">Room allocation history</div><div className="text-xs text-slate-400">Saved room assignments for past dates</div></div>
            <button onClick={() => { if (!confirm('Clear all room allocation history?')) return; const ra = { ...(data.roomAllocation || {}), allocationHistory: {}, dailyOverrides: {} }; saveData({ ...data, roomAllocation: ra }); toast('Room history cleared', 'success'); }} className="text-xs px-3 py-1.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium">Clear</button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
            <div><div className="text-sm font-medium text-slate-700">Huddle CSV data</div><div className="text-xs text-slate-400">Parsed appointment data — will need re-upload</div></div>
            <button onClick={() => { if (!confirm('Clear CSV data? You will need to re-upload.')) return; saveData({ ...data, huddleCsvData: null, huddleCsvUploadedAt: null }); toast('CSV data cleared', 'success'); }} className="text-xs px-3 py-1.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium">Clear</button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
            <div><div className="text-sm font-medium text-slate-700">Buddy allocation history</div><div className="text-xs text-slate-400">Past buddy cover assignments</div></div>
            <button onClick={() => { if (!confirm('Clear all buddy allocation history?')) return; saveData({ ...data, allocationHistory: {} }); toast('Buddy history cleared', 'success'); }} className="text-xs px-3 py-1.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium">Clear</button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <AuditLog data={data} saveData={saveData} />

      <div className="card p-5 border-red-200">
        <h2 className="text-base font-semibold text-red-700 mb-4">Danger Zone</h2>
        {data._v4 ? (
          <p className="text-sm text-slate-500">Practice-wide reset is disabled in the multi-tenant version. To clear specific data, use the Team Members or settings pages instead.</p>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-4">Reset all data to defaults. This will clear ALL clinicians, rotas, and history.</p>
            <button onClick={async () => { if (confirm('Delete ALL DATA and reset? Cannot be undone.')) { if (confirm('FINAL WARNING: Everything will be deleted. Continue?')) { const d = getDefaultData(); saveData(d); try { await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-password': password }, body: JSON.stringify(d) }); alert('Reset successful. Refreshing...'); window.location.reload(); } catch (err) { alert('Reset failed: ' + err.message); } } } }} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium">Reset All Data</button>
          </>
        )}
      </div>
    </div>
  );
}
