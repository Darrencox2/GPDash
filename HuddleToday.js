'use client';
import { SectionHeading, EmptyState, Card, CardHeader } from '@/components/ui';
import { getHuddleCapacity, getHuddleWeeks } from '@/lib/huddle';

export default function HuddleHistory({ data, huddleData, setActiveSection }) {
  const hs = data?.huddleSettings || {};

  if (!huddleData) {
    return (
      <div className="space-y-6 animate-in">
        <SectionHeading title="Capacity History" subtitle="Trends across recent weeks" />
        <EmptyState icon="📈" title="No Data Yet" description="Upload a report on the Today page to start tracking." action="Go to Today" onAction={() => setActiveSection('huddle-today')} />
      </div>
    );
  }

  const weeks = getHuddleWeeks(huddleData);
  const dayNames = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };
  const dayTotals = {}; ['Mon','Tue','Wed','Thu','Fri'].forEach(d => { dayTotals[d] = { am: 0, pm: 0, count: 0 }; });

  weeks.forEach(week => {
    ['Mon','Tue','Wed','Thu','Fri'].forEach(d => {
      const dateStr = week.dates[d]; if (!dateStr) return;
      const cap = getHuddleCapacity(huddleData, dateStr, hs);
      dayTotals[d].am += cap.am.total; dayTotals[d].pm += cap.pm.total; dayTotals[d].count++;
    });
  });

  const maxAvg = Math.max(...Object.values(dayTotals).map(d => d.count > 0 ? (d.am + d.pm) / d.count : 0), 1);

  return (
    <div className="space-y-6 animate-in">
      <SectionHeading title="Capacity History" subtitle="Trends across recent weeks" />

      {/* Weekly totals */}
      <Card padding={false} className="overflow-hidden">
        <CardHeader accent="slate"><div className="text-sm font-semibold text-slate-900">Weekly Urgent Capacity Totals</div></CardHeader>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500"><th className="text-left py-2 font-medium">Week Commencing</th><th className="text-right py-2 font-medium">AM</th><th className="text-right py-2 font-medium">PM</th><th className="text-right py-2 font-medium">Combined</th><th className="text-right py-2 font-medium">Daily Avg</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {weeks.map((week, wi) => {
                let wAm = 0, wPm = 0, dc = 0;
                ['Mon','Tue','Wed','Thu','Fri'].forEach(d => { const ds = week.dates[d]; if (!ds) return; const cap = getHuddleCapacity(huddleData, ds, hs); wAm += cap.am.total; wPm += cap.pm.total; dc++; });
                const total = wAm + wPm, avg = dc > 0 ? Math.round(total / dc) : 0;
                return (
                  <tr key={wi}><td className="py-2 font-medium text-slate-700">{week.monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td><td className="py-2 text-right text-amber-600 font-medium">{wAm}</td><td className="py-2 text-right text-blue-600 font-medium">{wPm}</td><td className="py-2 text-right font-bold text-slate-900">{total}</td><td className="py-2 text-right text-slate-500">{avg}/day</td></tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Day-of-week averages */}
      <Card padding={false} className="overflow-hidden">
        <CardHeader accent="slate"><div className="text-sm font-semibold text-slate-900">Average by Day of Week</div></CardHeader>
        <div className="p-4">
          <div className="flex items-end gap-3" style={{ height: '140px' }}>
            {['Mon','Tue','Wed','Thu','Fri'].map(d => {
              const t = dayTotals[d], avg = t.count > 0 ? (t.am + t.pm) / t.count : 0;
              const amAvg = t.count > 0 ? t.am / t.count : 0;
              const pct = (avg / maxAvg) * 100, amPct = avg > 0 ? (amAvg / avg) * 100 : 0;
              return (
                <div key={d} className="flex-1 flex flex-col items-center">
                  <div className="text-xs font-semibold text-slate-700 mb-1">{Math.round(avg)}</div>
                  <div className="w-full relative" style={{ height: '100px' }}>
                    <div className="absolute bottom-0 w-full rounded-t-md overflow-hidden" style={{ height: `${pct}%` }}>
                      <div className="w-full bg-gradient-to-t from-blue-400 to-blue-300" style={{ height: `${100 - amPct}%` }} />
                      <div className="w-full bg-gradient-to-t from-amber-400 to-amber-300" style={{ height: `${amPct}%` }} />
                    </div>
                  </div>
                  <div className="text-xs font-medium text-slate-500 mt-2">{d}</div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300" /> AM</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-300" /> PM</span>
            <span className="ml-auto">{weeks.length} week{weeks.length !== 1 ? 's' : ''} of data</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
