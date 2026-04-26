'use client';
import { useState } from 'react';
import { CHANGELOG } from '@/lib/changelog';
import { APP_VERSION } from '@/lib/version';

const TYPE_STYLES = {
  feature: { label: 'New', bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
  improvement: { label: 'Improved', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  fix: { label: 'Fixed', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
};

export default function Changelog() {
  const [expandedVersion, setExpandedVersion] = useState(CHANGELOG[0]?.version || null);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold text-slate-900">Changelog</h1>
          <p className="text-sm text-slate-500 mt-0.5">What's new in GPDash</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">Current: {APP_VERSION}</span>
      </div>

      <div className="space-y-3">
        {CHANGELOG.map((release, ri) => {
          const isExpanded = expandedVersion === release.version;
          const isCurrent = APP_VERSION === `v${release.version}`;
          const date = new Date(release.date + 'T12:00:00');
          const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

          return (
            <div key={release.version} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <button
                onClick={() => setExpandedVersion(isExpanded ? null : release.version)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-slate-900 flex flex-col items-center justify-center">
                  <span className="text-xs text-slate-500 font-medium leading-none">v</span>
                  <span className="text-lg font-bold text-white leading-tight" style={{fontFamily:"'Space Mono',monospace"}}>{release.version}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 text-sm">{release.title}</span>
                    {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">CURRENT</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{dateStr}</div>
                  {!isExpanded && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {Object.entries(
                        release.changes.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc; }, {})
                      ).map(([type, count]) => {
                        const s = TYPE_STYLES[type] || TYPE_STYLES.feature;
                        return <span key={type} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{background: s.bg, color: s.color}}>{count} {s.label.toLowerCase()}</span>;
                      })}
                    </div>
                  )}
                </div>
                <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4 border-t border-slate-100">
                  <div className="space-y-2 mt-3">
                    {release.changes.map((change, ci) => {
                      const s = TYPE_STYLES[change.type] || TYPE_STYLES.feature;
                      return (
                        <div key={ci} className="flex items-start gap-2.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 mt-0.5" style={{background: s.bg, color: s.color}}>{s.label}</span>
                          <span className="text-sm text-slate-600 leading-snug">{change.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
