'use client';
// The 8am sheet. Everything the huddle reads aloud, on one screen — and on
// one sheet of A4 via the Print button. On screen it follows the app theme;
// in print it deliberately flips to ink-on-paper.
import { useMemo } from 'react';
import { assembleBriefing } from '@/lib/briefing';
import { ClosedDayCard } from '@/components/ui/ClosedDay';

const S = {
  h2: { fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--g-text-hi)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  card: { background: 'var(--g-tile-2)', border: '1px solid var(--g-border)', borderRadius: 'var(--r-lg)', padding: '14px 16px' },
};

export default function MorningBriefing({ data, huddleData, huddleMessages }) {
  // On a closed day the useful briefing is the NEXT open day — a bank
  // holiday evening glance wants tomorrow's sheet, not an empty card.
  const { b, skippedFrom } = useMemo(() => {
    let cursor = new Date();
    let first = assembleBriefing({ data, huddleData, huddleMessages, date: cursor });
    if (!first.closed) return { b: first, skippedFrom: null };
    const from = first;
    for (let i = 0; i < 7; i++) {
      cursor = new Date(cursor); cursor.setDate(cursor.getDate() + 1);
      const next = assembleBriefing({ data, huddleData, huddleMessages, date: cursor });
      if (!next.closed) return { b: next, skippedFrom: from };
    }
    return { b: first, skippedFrom: null };
  }, [data, huddleData, huddleMessages]);

  if (b.closed) {
    return (
      <div className="max-w-3xl mx-auto">
        <ClosedDayCard reason={b.closedReason || undefined} />
      </div>
    );
  }

  const person = (c) => c ? `${c.title ? c.title + ' ' : ''}${c.name}` : '—';

  return (
    <div className="max-w-3xl mx-auto briefing-sheet">
      {/* print isolation + paper styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .briefing-sheet, .briefing-sheet * { visibility: visible !important; }
          .briefing-sheet { position: absolute; inset: 0; margin: 0 !important; max-width: none !important;
            background: #fff !important; color: #111 !important; padding: 10mm !important; }
          .briefing-sheet * { background: transparent !important; color: #111 !important;
            border-color: #bbb !important; box-shadow: none !important; }
          .briefing-sheet .no-print { display: none !important; }
          .briefing-sheet .print-rule { border-bottom: 1px solid #999 !important; }
          @page { size: A4; margin: 8mm; }
        }
      `}</style>

      {skippedFrom && (
        <div className="no-print mb-3 rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={{ border: '1px solid var(--g-border-2)', background: 'var(--g-tile-2)', color: 'var(--meta)' }}>
          Today is closed{skippedFrom.closedReason ? ` (${skippedFrom.closedReason.toLowerCase()})` : ''} — briefing the next open day.
        </div>
      )}
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 600, color: 'var(--g-text-hi)', margin: 0 }}>Morning briefing</h1>
        <span className="text-sm" style={{ color: 'var(--meta)' }}>{b.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <button onClick={() => window.print()} className="no-print ml-auto px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.45)', color: '#a5b4fc' }}>
          Print for the huddle
        </button>
      </div>

      {!b.hasCsv && (
        <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.07)', color: '#fcd34d' }}>
          No appointment CSV loaded — duty, capacity and wait figures will fill in once today&rsquo;s report is uploaded.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {/* Duty */}
        <div style={S.card}>
          <div style={S.h2} className="mb-2">Duty doctor</div>
          {['am', 'pm'].map(s => (
            <div key={s} className="flex items-baseline gap-2 py-0.5">
              <span className="text-xs font-bold w-8" style={{ color: 'var(--meta)', fontFamily: 'var(--font-mono)' }}>{s.toUpperCase()}</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--g-text-hi)' }}>{person(b.duty[s] ? { name: b.duty[s].name } : null)}</span>
              {b.duty[s]?.location && <span className="text-xs" style={{ color: 'var(--meta)' }}>· {b.duty[s].location}</span>}
            </div>
          ))}
        </div>
        {/* Urgent capacity */}
        <div style={S.card}>
          <div style={S.h2} className="mb-2">Urgent capacity</div>
          {['am', 'pm'].map(s => {
            const u = b.urgent[s];
            return (
              <div key={s} className="flex items-baseline gap-2 py-0.5">
                <span className="text-xs font-bold w-8" style={{ color: 'var(--meta)', fontFamily: 'var(--font-mono)' }}>{s.toUpperCase()}</span>
                <span className="text-sm font-bold font-mono-data" style={{ color: 'var(--g-text-hi)' }}>{u.slots}</span>
                {u.target > 0 && <span className="text-xs" style={{ color: 'var(--meta)' }}>/ {u.target} target</span>}
                {u.target > 0 && u.band.label && <span className="text-xs font-semibold" style={{ color: u.band.colour }}>{u.band.label}</span>}
              </div>
            );
          })}
          {b.predicted != null && <div className="text-xs mt-1.5" style={{ color: 'var(--meta)' }}>~{b.predicted} requests expected today</div>}
        </div>
      </div>

      {/* Who's in, and where */}
      <div style={S.card} className="mb-3">
        <div style={S.h2} className="mb-2">Today&rsquo;s team <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--meta)' }}>— {b.present.length} in · {b.absent.length} absent · {b.dayOff.length} day off</span></div>
        {b.teamBySite.length === 0 && <div className="text-sm" style={{ color: 'var(--meta)' }}>—</div>}
        {b.teamBySite.map((grp, gi) => (
          <div key={gi} className="flex items-baseline gap-2.5 py-1" style={gi ? { borderTop: '1px solid var(--g-border)' } : undefined}>
            <span className="flex items-center gap-1.5 shrink-0" style={{ minWidth: 108 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: grp.colour, display: 'inline-block' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--g-text-hi)' }}>{grp.site || 'Site not set'}</span>
              <span className="text-[11px]" style={{ color: 'var(--meta)', fontFamily: 'var(--font-mono)' }}>{grp.members.length}</span>
            </span>
            <span className="text-sm leading-relaxed" style={{ color: 'var(--g-text-hi)' }}>
              {grp.members.map((c, i) => (
                <span key={c.id || i}>
                  {i > 0 && <span style={{ color: 'var(--meta)' }}> · </span>}
                  {c.name}
                  {c.split && <span className="text-[11px]" style={{ color: 'var(--meta)' }}> (am {c.siteAm} / pm {c.sitePm})</span>}
                </span>
              ))}
            </span>
          </div>
        ))}
        {(b.absent.length > 0 || b.dayOff.length > 0) && (
          <div className="mt-2 pt-2 print-rule" style={{ borderTop: '1px solid var(--g-border)' }}>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {b.absent.map((c, i) => (
                <span key={`a${i}`} className="text-xs" style={{ color: 'var(--g-text-hi)' }}>
                  {c.name} <span style={{ color: '#fca5a5' }}>· {c.reason}</span>
                </span>
              ))}
              {b.dayOff.map((c, i) => (
                <span key={`d${i}`} className="text-xs" style={{ color: 'var(--g-text-hi)' }}>
                  {c.name} <span style={{ color: 'var(--meta)' }}>· Day off</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cover */}
      {b.coverPairs.length > 0 && (
        <div style={S.card} className="mb-3">
          <div style={S.h2} className="mb-2">Buddy cover</div>
          {b.coverPairs.map((p, i) => (
            <div key={i} className="text-sm py-0.5" style={{ color: 'var(--g-text-hi)' }}>
              <span className="font-semibold">{p.coverer.name}</span>
              <span style={{ color: 'var(--meta)' }}> covers </span>
              {[...p.absent.map(c => c.name), ...p.dayOff.map(c => `${c.name} (day off)`)].join(', ')}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {/* Routine wait */}
        <div style={S.card}>
          <div style={S.h2} className="mb-2">Routine wait</div>
          {b.routineWait ? (
            <div className="text-sm" style={{ color: 'var(--g-text-hi)' }}>
              Next routine GP appointment: <span className="font-bold font-mono-data">{b.routineWait.days === 0 ? 'today' : `${b.routineWait.days} day${b.routineWait.days === 1 ? '' : 's'}`}</span>
              <span style={{ color: 'var(--meta)' }}> · {b.routineWait.available} available that day</span>
            </div>
          ) : <div className="text-sm" style={{ color: 'var(--meta)' }}>No routine availability in the next 28 days.</div>}
        </div>
        {/* Notices */}
        <div style={S.card}>
          <div style={S.h2} className="mb-2">Notices</div>
          {b.notices.length === 0
            ? <div className="text-sm" style={{ color: 'var(--meta)' }}>No notices today.</div>
            : b.notices.slice(0, 4).map((n, i) => (
                <div key={i} className="text-sm py-0.5" style={{ color: 'var(--g-text-hi)' }}>&bull; {n.text}{n.author && <span style={{ color: 'var(--meta)' }}> — {n.author}</span>}</div>
              ))}
        </div>
      </div>

      {/* Outlook */}
      <div style={S.card}>
        <div style={S.h2} className="mb-2">The week ahead</div>
        <div className="grid grid-cols-5 gap-2">
          {b.outlook.map((o, i) => (
            <div key={i} className="rounded-md overflow-hidden" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border)' }}>
              {/* The stripe is the day's urgent capacity against its own
                  target — the same bands used on Today, so the colour
                  carries the same meaning here. */}
              <div style={{ height: 3, background: o.band ? o.band.colour : 'var(--g-border)' }} />
              <div className="text-center py-1.5 px-1">
                <div className="text-xs font-semibold" style={{ color: 'var(--g-text-hi)' }}>{o.dayName.slice(0, 3)} {o.date.getDate()}</div>
                {o.isBankHoliday ? (
                  <div className="text-[11px] py-1.5" style={{ color: 'var(--meta)' }}>closed</div>
                ) : (
                  <>
                    <div className="text-sm font-bold font-mono-data" style={{ color: 'var(--g-text-hi)' }}>{o.predicted ?? '—'}</div>
                    <div className="text-[11px] leading-tight" style={{ color: 'var(--meta)' }}>expected</div>
                    <div className="mt-1 pt-1 flex justify-center gap-2" style={{ borderTop: '1px solid var(--g-border)' }}>
                      <span className="text-[11px] font-mono-data" title="Urgent slots on EMIS" style={{ color: o.band ? o.band.colour : 'var(--g-text-hi)' }}>
                        {o.urgentSlots != null ? o.urgentSlots : '—'}<span style={{ color: 'var(--meta)' }}>u</span>
                      </span>
                      <span className="text-[11px] font-mono-data" title="Routine slots on EMIS" style={{ color: 'var(--g-text-hi)' }}>
                        {o.routineSlots != null ? o.routineSlots : '—'}<span style={{ color: 'var(--meta)' }}>r</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="text-[11px] mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: 'var(--meta)' }}>
          <span>Expected requests · <strong style={{ color: 'var(--g-text-hi)' }}>u</strong> urgent and <strong style={{ color: 'var(--g-text-hi)' }}>r</strong> routine slots on EMIS</span>
          <span className="flex items-center gap-2">
            {[['Short', '#ef4444'], ['Tight', '#f59e0b'], ['Good', '#10b981'], ['Over', '#3b82f6']].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1"><span style={{ width: 12, height: 3, background: c, display: 'inline-block', borderRadius: 2 }} />{l}</span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
