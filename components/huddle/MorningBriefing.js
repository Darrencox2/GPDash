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

      {/* Who's in */}
      <div style={S.card} className="mb-3">
        <div style={S.h2} className="mb-2">Today&rsquo;s team <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--meta)' }}>— {b.present.length} in · {b.absent.length} absent · {b.dayOff.length} day off</span></div>
        <div className="text-sm leading-relaxed" style={{ color: 'var(--g-text-hi)' }}>
          {b.present.map(c => c.initials || c.name).join(' · ') || '—'}
        </div>
        {(b.absent.length > 0 || b.dayOff.length > 0) && (
          <div className="text-xs mt-2 print-rule" style={{ color: 'var(--meta)' }}>
            {b.absent.length > 0 && <>Absent: {b.absent.map(c => c.name).join(', ')}. </>}
            {b.dayOff.length > 0 && <>Day off: {b.dayOff.map(c => c.name).join(', ')}.</>}
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
            <div key={i} className="text-center rounded-md py-1.5" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--g-text-hi)' }}>{o.dayName.slice(0, 3)} {o.date.getDate()}</div>
              {o.isBankHoliday
                ? <div className="text-[11px]" style={{ color: 'var(--meta)' }}>closed</div>
                : <>
                    <div className="text-sm font-bold font-mono-data" style={{ color: 'var(--g-text-hi)' }}>{o.predicted ?? '—'}</div>
                    <div className="text-[11px]" style={{ color: 'var(--meta)' }}>{o.urgentSlots != null ? `${o.urgentSlots} urgent` : 'requests'}</div>
                  </>}
            </div>
          ))}
        </div>
        <div className="text-[11px] mt-1.5" style={{ color: 'var(--meta)' }}>Predicted requests per day · urgent slots currently on EMIS</div>
      </div>
    </div>
  );
}
