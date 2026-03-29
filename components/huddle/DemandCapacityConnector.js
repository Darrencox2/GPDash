'use client';
import { useState, useEffect, useMemo } from 'react';
import { predictDemand, getWeatherForecast, BASELINE, DOW_EFFECTS, MONTH_EFFECTS } from '@/lib/demandPredictor';
import { getHuddleCapacity, parseHuddleDateStr } from '@/lib/huddle';

const DEFAULTS = { conversionRate: 0.25, greenPct: 100, amberPct: 80 };

export default function DemandCapacityConnector({ viewingDate, huddleData, capacity, hs, data, saveData, urgentOverrides }) {
  const [showSettings, setShowSettings] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);

  const dc = hs?.demandCapacity || {};
  const convRate = dc.conversionRate ?? DEFAULTS.conversionRate;
  const greenPct = dc.greenPct ?? DEFAULTS.greenPct;
  const amberPct = dc.amberPct ?? DEFAULTS.amberPct;

  const updateSetting = (key, val) => {
    const updated = { ...dc, [key]: val };
    saveData({ ...data, huddleSettings: { ...hs, demandCapacity: updated } }, false);
  };

  const targetDate = useMemo(() => {
    if (!viewingDate) return new Date();
    const d = new Date(viewingDate); d.setHours(0, 0, 0, 0); return d;
  }, [viewingDate]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const weather = await getWeatherForecast(16);
        const dk = targetDate.toISOString().split('T')[0];
        const dayWeather = weather?.[dk] || null;
        const pred = predictDemand(targetDate, dayWeather);
        setPrediction(pred);
      } catch (err) { console.error('Connector forecast error:', err); }
      setLoading(false);
    }
    load();
  }, [targetDate]);

  // Typical demand for this day of week + month (no special factors)
  const typicalDemand = useMemo(() => {
    const dow = (targetDate.getDay() + 6) % 7; // 0=Mon
    if (dow >= 5) return null;
    const month = targetDate.getMonth();
    return Math.round(BASELINE + DOW_EFFECTS[dow] + MONTH_EFFECTS[month]);
  }, [targetDate]);

  // Typical capacity: average urgent capacity for same day-of-week across CSV history
  const typicalCapacity = useMemo(() => {
    if (!huddleData?.dates || !urgentOverrides) return null;
    const targetDow = targetDate.getDay();
    let total = 0, count = 0;
    const viewingDateStr = `${String(targetDate.getDate()).padStart(2, '0')}-${targetDate.toLocaleString('en-GB', { month: 'short' })}-${targetDate.getFullYear()}`;
    huddleData.dates.forEach(dateStr => {
      if (dateStr === viewingDateStr) return; // exclude today
      const d = parseHuddleDateStr(dateStr);
      if (d.getDay() !== targetDow) return;
      const cap = getHuddleCapacity(huddleData, dateStr, hs, urgentOverrides);
      const dayTotal = (cap.am.total || 0) + (cap.pm.total || 0) + (cap.am.embargoed || 0) + (cap.pm.embargoed || 0);
      if (dayTotal > 0) { total += dayTotal; count++; }
    });
    return count > 0 ? Math.round(total / count) : null;
  }, [huddleData, targetDate, hs, urgentOverrides]);

  if (loading || !prediction) {
    return (
      <div className="card overflow-hidden animate-pulse">
        <div className="h-24 bg-slate-100" />
      </div>
    );
  }

  const predicted = Math.round(prediction.predicted);
  const urgentTotal = capacity ? (capacity.am.total || 0) + (capacity.pm.total || 0) + (capacity.am.embargoed || 0) + (capacity.pm.embargoed || 0) : 0;
  const amSlots = capacity ? (capacity.am.total || 0) + (capacity.am.embargoed || 0) : 0;
  const pmSlots = capacity ? (capacity.pm.total || 0) + (capacity.pm.embargoed || 0) : 0;
  const needed = Math.round(predicted * convRate);
  const coverage = needed > 0 ? Math.round((urgentTotal / needed) * 100) : 100;

  // Verdict
  let verdict;
  if (coverage >= greenPct) {
    verdict = 'Comfortable';
  } else if (coverage >= amberPct) {
    verdict = 'Tight day';
  } else {
    verdict = 'Stretched';
  }

  const demandDelta = typicalDemand ? predicted - typicalDemand : null;
  const capDelta = typicalCapacity !== null ? urgentTotal - typicalCapacity : null;
  const shortfall = needed > urgentTotal ? needed - urgentTotal : 0;

  // Verdict colours for dark card
  let verdictText, arcColour;
  if (coverage >= greenPct) {
    verdictText = '#34d399'; arcColour = '#10b981';
  } else if (coverage >= amberPct) {
    verdictText = '#fbbf24'; arcColour = '#f59e0b';
  } else {
    verdictText = '#f87171'; arcColour = '#ef4444';
  }
  const arcPct = Math.min(coverage, 120) / 120;
  const dayLabel = ['Mon','Tue','Wed','Thu','Fri'][((targetDate.getDay() + 6) % 7)] || 'day';

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#0f172a' }}>
      <div style={{ padding: '20px 24px' }}>
        {/* Header: verdict + gauge */}
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div>
            <div className="font-extrabold" style={{ fontSize: 24, color: verdictText }}>{verdict}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
              {shortfall > 0 ? `${shortfall} urgent slots short of estimated need` : `${urgentTotal - needed} slots above estimated need`}
            </div>
          </div>
          <div className="flex-shrink-0 text-center">
            <svg viewBox="0 0 80 50" width="80" height="50">
              <path d="M 6 45 A 34 34 0 0 1 74 45" fill="none" stroke="#1e293b" strokeWidth="7" strokeLinecap="round"/>
              <path d="M 6 45 A 34 34 0 0 1 74 45" fill="none" stroke={arcColour} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={`${arcPct * 107} 107`}/>
              <text x="40" y="40" textAnchor="middle" fill={verdictText} style={{ fontSize: 16, fontWeight: 800 }}>{coverage}%</text>
            </svg>
          </div>
        </div>

        {/* Three metric cards */}
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg" style={{ background: '#1e293b', padding: '10px 14px' }}>
            <div className="flex items-baseline justify-between">
              <span style={{ fontSize: 11, color: '#64748b' }}>Demand</span>
              {demandDelta !== null && <span style={{ fontSize: 11, fontWeight: 600, color: demandDelta > 0 ? '#fb7185' : '#34d399' }}>{demandDelta > 0 ? '+' : ''}{demandDelta}</span>}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>{predicted}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>requests predicted</div>
          </div>
          <div className="flex-1 rounded-lg" style={{ background: '#1e293b', padding: '10px 14px' }}>
            <div className="flex items-baseline justify-between">
              <span style={{ fontSize: 11, color: '#64748b' }}>Est. needed</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#a78bfa', marginTop: 2 }}>{needed}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>{predicted} × {convRate} appts</div>
          </div>
          <div className="flex-1 rounded-lg" style={{ background: '#1e293b', padding: '10px 14px' }}>
            <div className="flex items-baseline justify-between">
              <span style={{ fontSize: 11, color: '#64748b' }}>Capacity</span>
              {capDelta !== null && <span style={{ fontSize: 11, fontWeight: 600, color: capDelta >= 0 ? '#34d399' : '#fb7185' }}>{capDelta > 0 ? '+' : ''}{capDelta}</span>}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 2 }}>{urgentTotal}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>{amSlots} AM · {pmSlots} PM</div>
          </div>
        </div>

        {/* Settings link */}
        <div className="flex justify-end" style={{ marginTop: 10 }}>
          <button onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 transition-colors" style={{ fontSize: 11, color: '#475569' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06c.5.5 1.21.71 1.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            Settings
          </button>
        </div>
      </div>

      {/* Collapsible settings */}
      {showSettings && (
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Conversion rate (requests → appointments)</label>
            <div className="flex items-center gap-3">
              <input type="range" min="0.05" max="0.60" step="0.01" value={convRate}
                onChange={e => updateSetting('conversionRate', parseFloat(e.target.value))}
                className="flex-1" />
              <span className="text-sm font-bold text-slate-700 bg-white px-3 py-1 rounded border border-slate-200 min-w-[52px] text-center">{convRate.toFixed(2)}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">1 request = {convRate.toFixed(2)} appointments → {predicted} × {convRate.toFixed(2)} = {needed} est. appointments</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Green threshold (%)</label>
              <input type="number" value={greenPct} onChange={e => updateSetting('greenPct', parseInt(e.target.value) || 100)}
                className="w-full px-3 py-1.5 rounded border border-slate-200 text-sm" />
              <div className="text-[10px] text-slate-400 mt-1">Comfortable at ≥{greenPct}% coverage</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Amber threshold (%)</label>
              <input type="number" value={amberPct} onChange={e => updateSetting('amberPct', parseInt(e.target.value) || 80)}
                className="w-full px-3 py-1.5 rounded border border-slate-200 text-sm" />
              <div className="text-[10px] text-slate-400 mt-1">Tight at ≥{amberPct}%, Stretched below</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
