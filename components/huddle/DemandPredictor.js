'use client';
import { useState, useEffect, useRef } from 'react';
import { getForecast, predictDemand, getWeatherForecast } from '@/lib/demandPredictor';

const DEMAND_COLOURS = {
  low: { bg: '#10b98122', text: '#34d399', label: 'LOW DEMAND' },
  normal: { bg: '#3b82f622', text: '#60a5fa', label: 'NORMAL' },
  high: { bg: '#f59e0b22', text: '#fbbf24', label: 'HIGH DEMAND' },
  'very-high': { bg: '#ef444422', text: '#f87171', label: 'VERY HIGH' },
  closed: { bg: '#64748b22', text: '#94a3b8', label: 'CLOSED' },
};

export default function DemandPredictor() {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    async function loadForecast() {
      try {
        setLoading(true);
        // Get weather for the full range
        const weather = await getWeatherForecast(16);

        // Build 7 past weekdays + today + 6 future weekdays
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = [];

        // Past 14 calendar days to get ~7 working days
        for (let i = 14; i >= 1; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dk = d.toISOString().split('T')[0];
          const dayWeather = weather?.[dk] || null;
          const pred = predictDemand(d, dayWeather);
          days.push({
            date: d,
            dateKey: dk,
            dayOfWeek: d.getDay(),
            dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
            dayNum: d.getDate(),
            isPast: true,
            isToday: false,
            isWeekend: d.getDay() === 0 || d.getDay() === 6,
            ...pred,
          });
        }

        // Today
        const todayDk = today.toISOString().split('T')[0];
        const todayWeather = weather?.[todayDk] || null;
        const todayPred = predictDemand(today, todayWeather);
        days.push({
          date: today,
          dateKey: todayDk,
          dayOfWeek: today.getDay(),
          dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][today.getDay()],
          dayNum: today.getDate(),
          isPast: false,
          isToday: true,
          isWeekend: today.getDay() === 0 || today.getDay() === 6,
          weather: todayWeather,
          ...todayPred,
        });

        // Future 14 calendar days to get ~7 working days
        for (let i = 1; i <= 14; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          const dk = d.toISOString().split('T')[0];
          const dayWeather = weather?.[dk] || null;
          const pred = predictDemand(d, dayWeather);
          days.push({
            date: d,
            dateKey: dk,
            dayOfWeek: d.getDay(),
            dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
            dayNum: d.getDate(),
            isPast: false,
            isToday: false,
            isWeekend: d.getDay() === 0 || d.getDay() === 6,
            ...pred,
          });
        }

        setForecast({ days, today: days.find(d => d.isToday), todayWeather });
      } catch (err) {
        console.error('Demand forecast error:', err);
        setError(err.message);
      }
      setLoading(false);
    }
    loadForecast();
  }, []);

  // Render chart
  useEffect(() => {
    if (!forecast || !chartRef.current) return;

    const loadChart = async () => {
      if (!window.Chart) {
        await new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
          s.onload = resolve;
          document.head.appendChild(s);
        });
      }

      if (chartInstance.current) chartInstance.current.destroy();

      const days = forecast.days;
      const todayIdx = days.findIndex(d => d.isToday);
      const labels = days.map(d => d.isWeekend ? d.dayName : `${d.dayName} ${d.dayNum}`);
      const values = days.map(d => d.isWeekend ? null : d.predicted);
      const lows = days.map(d => d.isWeekend ? null : d.confidence.low);
      const highs = days.map(d => d.isWeekend ? null : d.confidence.high);
      const isWknd = days.map(d => d.isWeekend);

      const weekendPlugin = {
        id: 'weekendShade',
        beforeDraw(chart) {
          const ctx = chart.ctx;
          const xScale = chart.scales.x;
          const yScale = chart.scales.y;
          const barW = (xScale.getPixelForValue(1) - xScale.getPixelForValue(0)) * 0.5;
          ctx.save();
          ctx.fillStyle = '#1e293b';
          for (let i = 0; i < isWknd.length; i++) {
            if (isWknd[i]) {
              ctx.fillRect(xScale.getPixelForValue(i) - barW, yScale.top, barW * 2, yScale.bottom - yScale.top);
            }
          }
          ctx.restore();
        }
      };

      const todayLinePlugin = {
        id: 'todayLine',
        afterDraw(chart) {
          const ctx = chart.ctx;
          const x = chart.scales.x.getPixelForValue(todayIdx);
          const y = chart.scales.y;
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = '#f59e0b44';
          ctx.lineWidth = 1;
          ctx.moveTo(x, y.top);
          ctx.lineTo(x, y.bottom);
          ctx.stroke();
          ctx.restore();
        }
      };

      chartInstance.current = new window.Chart(chartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { data: highs, fill: '+1', backgroundColor: 'rgba(56,189,248,0.07)', borderWidth: 0, pointRadius: 0, tension: 0.3, spanGaps: true },
            { data: lows, fill: false, borderWidth: 0, pointRadius: 0, tension: 0.3, spanGaps: true },
            {
              data: values, borderWidth: 2.5, tension: 0.3, spanGaps: false,
              borderColor: '#38bdf8',
              pointRadius: (ctx) => {
                if (values[ctx.dataIndex] === null) return 0;
                return ctx.dataIndex === todayIdx ? 8 : 2.5;
              },
              pointBackgroundColor: (ctx) => {
                if (ctx.dataIndex === todayIdx) return '#f59e0b';
                return ctx.dataIndex < todayIdx ? '#94a3b8' : '#38bdf8';
              },
              pointBorderColor: (ctx) => ctx.dataIndex === todayIdx ? '#fbbf24' : 'transparent',
              pointBorderWidth: (ctx) => ctx.dataIndex === todayIdx ? 4 : 0,
              segment: {
                borderColor: (ctx) => ctx.p0DataIndex < todayIdx ? '#94a3b8' : '#38bdf8',
                borderDash: (ctx) => ctx.p0DataIndex >= todayIdx ? [5, 4] : undefined,
              },
            },
          ],
        },
        plugins: [weekendPlugin, todayLinePlugin],
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: {
              ticks: {
                font: { size: 9 },
                color: (ctx) => {
                  if (isWknd[ctx.index]) return '#334155';
                  if (ctx.index === todayIdx) return '#f59e0b';
                  return '#64748b';
                },
                maxRotation: 0,
              },
              grid: { display: false },
            },
            y: {
              position: 'right', min: 40, max: 220,
              ticks: { font: { size: 9 }, color: '#475569', stepSize: 40 },
              grid: { color: '#1e293b', lineWidth: 0.5 },
              border: { display: false },
            },
          },
        },
      });
    };

    loadChart();
    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [forecast]);

  if (loading) {
    return (
      <div className="rounded-xl bg-slate-900 p-6 flex items-center justify-center gap-3">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-400 rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Loading demand forecast...</span>
      </div>
    );
  }

  if (error || !forecast?.today) return null;

  const t = forecast.today;
  const dc = DEMAND_COLOURS[t.demandLevel] || DEMAND_COLOURS.normal;
  const rangePct = t.confidence.high > t.confidence.low
    ? ((t.predicted - t.confidence.low) / (t.confidence.high - t.confidence.low)) * 100
    : 50;

  // Get top 5 factors by absolute effect
  const topFactors = [];
  const f = t.factors || {};
  if (f.dayOfWeek) topFactors.push({ label: f.dayOfWeek.day, effect: f.dayOfWeek.effect, desc: 'day of week' });
  if (f.month) topFactors.push({ label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][f.month.month - 1], effect: f.month.effect, desc: 'seasonal' });
  if (f.trend) topFactors.push({ label: 'Trend', effect: f.trend.effect, desc: 'monthly growth' });
  if (f.firstDayBack) topFactors.push({ label: '1st back', effect: f.firstDayBack, desc: 'after bank hol' });
  if (f.secondDayBack) topFactors.push({ label: '2nd back', effect: f.secondDayBack, desc: 'after break' });
  if (f.schoolHoliday) topFactors.push({ label: 'School hol', effect: f.schoolHoliday, desc: 'holidays' });
  if (f.firstWeekBack) topFactors.push({ label: 'Term starts', effect: f.firstWeekBack, desc: 'first week back' });
  if (f.weather) topFactors.push({ label: `${Math.round(f.weather.actualTemp)}°C`, effect: f.weather.tempEffect, desc: 'temperature' });
  if (f.heavyRain) topFactors.push({ label: `${f.heavyRain.precipMm}mm`, effect: f.heavyRain.effect, desc: 'heavy rain' });
  if (f.nearBankHoliday) topFactors.push({ label: 'Near BH', effect: f.nearBankHoliday.effect, desc: `${f.nearBankHoliday.daysAway}d away` });
  if (f.christmasPeriod) topFactors.push({ label: 'Xmas', effect: f.christmasPeriod, desc: 'Christmas period' });
  if (f.endOfMonth) topFactors.push({ label: `${t.date.getDate()}th`, effect: f.endOfMonth, desc: 'end of month' });
  if (f.shortWeek) topFactors.push({ label: `${f.shortWeek.workingDays}d week`, effect: f.shortWeek.effect, desc: 'short week' });

  topFactors.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const top5 = topFactors.slice(0, 5);
  while (top5.length < 5) top5.push({ label: '—', effect: 0, desc: '' });

  // Weather for today
  const tw = forecast.todayWeather;

  return (
    <div className="rounded-xl bg-slate-900 overflow-hidden">
      {/* Header bar */}
      <div className="px-5 py-2.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <span className="text-[13px] font-medium text-slate-200">Demand predictor</span>
        </div>
        <div className="flex items-center gap-3">
          {tw && (
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/><circle cx="12" cy="12" r="4"/></svg>
              {Math.round(tw.temp)}°C · Feels {Math.round(tw.feelsLike)}°C
              {tw.precipMm > 0 && ` · ${Math.round(tw.precipMm)}mm rain`}
            </span>
          )}
          <span className="text-[10px] text-slate-600">Model v2.0</span>
        </div>
      </div>

      <div className="flex items-stretch">
        {/* Left: Hero number + range */}
        <div className="px-6 py-5 flex flex-col justify-center border-r border-slate-800 min-w-[155px]">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Today's forecast</div>
          <div className="text-[52px] font-extrabold leading-none mt-1" style={{ color: dc.text }}>{t.predicted}</div>
          <div className="text-xs text-slate-400 mt-1">patient requests</div>
          <div className="mt-1.5">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: dc.bg, color: dc.text }}>{dc.label}</span>
          </div>
          {/* Range bar */}
          <div className="flex items-center gap-2 mt-3 p-2 bg-slate-800 rounded-lg">
            <div className="text-center">
              <div className="text-lg font-bold text-slate-400">{t.confidence.low}</div>
              <div className="text-[8px] text-slate-600 uppercase">Low</div>
            </div>
            <div className="flex-1 h-1 rounded-full bg-slate-700 relative">
              <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${rangePct}%`, background: 'linear-gradient(90deg, #10b981, #f59e0b)' }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-slate-900" style={{ left: `${rangePct}%`, marginLeft: '-5px' }} />
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-slate-400">{t.confidence.high}</div>
              <div className="text-[8px] text-slate-600 uppercase">High</div>
            </div>
          </div>
        </div>

        {/* Right: Chart */}
        <div className="flex-1 px-4 py-3 flex flex-col">
          <div className="flex-1 relative" style={{ minHeight: '165px' }}>
            <canvas ref={chartRef} />
          </div>
          <div className="flex justify-center gap-4 mt-1 text-[9px] text-slate-600">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-slate-400" />Past</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-sky-400 border-t border-dashed border-sky-400" />Forecast</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded-sm" style={{ background: 'rgba(56,189,248,0.12)' }} />Range</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded-sm bg-slate-800" />Weekend</span>
          </div>
        </div>
      </div>

      {/* Bottom: Top 5 factors */}
      <div className="grid grid-cols-5 divide-x divide-slate-800 border-t border-slate-800">
        {top5.map((f, i) => (
          <div key={i} className="py-2.5 px-3 text-center">
            <div className="text-[9px] text-slate-500 uppercase truncate">{f.label}</div>
            <div className={`text-lg font-bold mt-0.5 ${f.effect >= 0 ? 'text-blue-400' : 'text-emerald-400'}`}>
              {f.effect > 0 ? '+' : ''}{Math.round(f.effect)}
            </div>
            <div className="text-[9px] text-slate-600 truncate">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
