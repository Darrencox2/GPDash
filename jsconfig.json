'use client';
import { DAYS } from '@/lib/data';

export default function TeamRota({ data, saveData, helpers }) {
  const { ensureArray, toggleRotaDay } = helpers;

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-bold text-slate-900">Clinician Rota</h1><p className="text-sm text-slate-500 mt-1">Standard weekly working pattern — click to toggle</p></div>
      <div className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-200"><th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Clinician</th>{DAYS.map(d => <th key={d} className="text-center py-2.5 px-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-20">{d.slice(0, 3)}</th>)}</tr></thead>
            <tbody>
              {ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative').map(c => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 px-4"><div className="flex items-center gap-2.5"><div className="initials-badge neutral">{c.initials}</div><div><div className="text-sm font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.role}</div></div></div></td>
                  {DAYS.map(d => { const w = ensureArray(data.weeklyRota[d]).includes(c.id); return <td key={d} className="text-center py-3 px-3"><button onClick={() => toggleRotaDay(c.id, d)} className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors mx-auto text-sm ${w ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{w ? '✓' : '—'}</button></td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex gap-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100"></span>Working</span><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100"></span>Day off</span></div>
      </div>
    </div>
  );
}
