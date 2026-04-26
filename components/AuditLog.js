'use client';
import { useState, useMemo } from 'react';

const TYPE_META = {
  csv: { label: 'CSV', colour: '#34d399', bg: 'rgba(16,185,129,0.15)', icon: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12' },
  allocation: { label: 'Allocation', colour: '#60a5fa', bg: 'rgba(59,130,246,0.15)', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  settings: { label: 'Settings', colour: '#a78bfa', bg: 'rgba(167,139,250,0.15)', icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z' },
  staff: { label: 'Staff', colour: '#fbbf24', bg: 'rgba(245,158,11,0.15)', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 22a8 8 0 0116 0' },
  rooms: { label: 'Rooms', colour: '#f87171', bg: 'rgba(239,68,68,0.15)', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
  auth: { label: 'Auth', colour: '#94a3b8', bg: 'rgba(148,163,184,0.15)', icon: 'M12 15v2m0 0v3m0-3h3m-3 0H9m3-12a9 9 0 11-9 9 9 9 0 019-9z' },
  system: { label: 'System', colour: '#94a3b8', bg: 'rgba(148,163,184,0.15)', icon: 'M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z' },
};

function formatRelativeTime(isoString) {
  const then = new Date(isoString);
  const now = new Date();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AuditLog({ data, saveData }) {
  const [filterType, setFilterType] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const log = Array.isArray(data?.auditLog) ? data.auditLog : [];

  const types = useMemo(() => {
    const counts = {};
    log.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
    return counts;
  }, [log]);

  const filtered = log.filter(e => filterType === 'all' || e.type === filterType);
  const visible = showAll ? filtered : filtered.slice(0, 30);

  const handleClear = () => {
    if (!confirm('Clear audit log? This cannot be undone.')) return;
    saveData({ ...data, auditLog: [] });
  };

  if (log.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center" style={{background:'rgba(15,23,42,0.5)',border:'1px solid rgba(255,255,255,0.06)'}}>
        <div className="text-2xl mb-2">📋</div>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">No audit events yet</h3>
        <p className="text-xs text-slate-500">Events will appear here as you upload CSVs, generate allocations, and change settings.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{background:'rgba(15,23,42,0.7)',border:'1px solid rgba(255,255,255,0.06)'}}>
      <div className="px-4 py-3 flex items-center justify-between" style={{background:'rgba(15,23,42,0.85)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
        <div>
          <div className="font-heading text-base font-medium text-slate-200">Audit log</div>
          <div className="text-[11px] text-slate-600">{log.length} event{log.length !== 1 ? 's' : ''} · last {Math.min(log.length, 500)} kept</div>
        </div>
        <button onClick={handleClear} className="text-[11px] text-red-400 hover:text-red-300 transition-colors">Clear log</button>
      </div>

      {/* Type filters */}
      <div className="px-4 py-2 flex gap-1.5 flex-wrap" style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
        <button onClick={() => setFilterType('all')} className="text-[11px] px-2.5 py-1 rounded-full transition-colors" style={{
          background: filterType === 'all' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
          color: filterType === 'all' ? '#e2e8f0' : '#64748b',
        }}>All ({log.length})</button>
        {Object.entries(types).map(([type, count]) => {
          const meta = TYPE_META[type] || TYPE_META.system;
          const isActive = filterType === type;
          return (
            <button key={type} onClick={() => setFilterType(type)} className="text-[11px] px-2.5 py-1 rounded-full transition-colors" style={{
              background: isActive ? meta.bg : 'rgba(255,255,255,0.04)',
              color: isActive ? meta.colour : '#64748b',
            }}>{meta.label} ({count})</button>
          );
        })}
      </div>

      {/* Event list */}
      <div className="divide-y" style={{'--tw-divide-opacity':1, borderColor:'rgba(255,255,255,0.04)'}}>
        {visible.map(entry => {
          const meta = TYPE_META[entry.type] || TYPE_META.system;
          return (
            <div key={entry.id} className="px-4 py-2.5 flex items-start gap-3" style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{background:meta.bg}}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={meta.colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={meta.icon}/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-300 leading-snug">{entry.description}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">{formatRelativeTime(entry.timestamp)} · {new Date(entry.timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          );
        })}
        {filtered.length > 30 && !showAll && (
          <div className="px-4 py-3 text-center">
            <button onClick={() => setShowAll(true)} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">Show all {filtered.length}</button>
          </div>
        )}
      </div>
    </div>
  );
}
