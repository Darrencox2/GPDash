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
  let verdict, verdictColour, verdictBg, verdictBorder, verdictIcon;
  if (coverage >= greenPct) {
    verdict = 'Comfortable'; verdictColour = '#065f46'; verdictBg = '#f0fdf4'; verdictBorder = '#10b981';
    verdictIcon = <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />;
  } else if (coverage >= amberPct) {
    verdict = 'Tight day'; verdictColour = '#92400e'; verdictBg = '#fffbeb'; verdictBorder = '#f59e0b';
    verdictIcon = <><path d="M12 9v4M12 17h.01" /><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></>;
  } else {
    verdict = 'Stretched'; verdictColour = '#991b1b'; verdictBg = '#fef2f2'; verdictBorder = '#ef4444';
    verdictIcon = <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />;
  }

  const demandDelta = typicalDemand ? predicted - typicalDemand : null;
  const capDelta = typicalCapacity !== null ? urgentTotal - typicalCapacity : null;
  const shortfall = needed > urgentTotal ? needed - urgentTotal : 0;

  return (
    <div className="card overflow-hidden">
      {/* Verdict banner */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: verdictBg, borderBottom: `3px solid ${verdictBorder}` }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${verdictBorder}20` }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={verdictBorder} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{verdictIcon}</svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold" style={{ color: verdictColour }}>{verdict}</div>
          <div className="text-sm" style={{ color: verdictColour, opacity: 0.8 }}>
            {shortfall > 0 ? `${shortfall} urgent slots short of estimated need` : `${urgentTotal - needed} slots above estimated need`}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-3xl font-extrabold" style={{ color: verdictBorder }}>{coverage}%</div>
          <div className="text-xs" style={{ color: verdictColour }}>coverage</div>
        </div>
      </div>

      {/* Three metrics row */}
      <div className="flex divide-x divide-slate-100 border-b border-slate-100">
        <div className="flex-1 px-5 py-3">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Demand</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-sky-500">{predicted}</span>
            <span className="text-xs text-slate-400">requests</span>
          </div>
        </div>
        <div className="flex-1 px-5 py-3">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Capacity</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-emerald-500">{urgentTotal}</span>
            <span className="text-xs text-slate-400">slots</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{amSlots} AM · {pmSlots} PM</div>
        </div>
        <div className="flex-1 px-5 py-3">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Est. needed</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-violet-500">{needed}</span>
            <span className="text-xs text-slate-400">appts</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{predicted} × {convRate}</div>
        </div>
      </div>

      {/* vs Typical + settings row */}
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-slate-400">vs typical {['Mon','Tue','Wed','Thu','Fri'][((targetDate.getDay() + 6) % 7)] || 'day'}:</span>
        {demandDelta !== null && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${demandDelta > 0 ? 'text-red-600 bg-red-50' : demandDelta < 0 ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 bg-slate-50'}`}>
            demand {demandDelta > 0 ? '+' : ''}{demandDelta}
          </span>
        )}
        {capDelta !== null && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${capDelta >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
            capacity {capDelta > 0 ? '+' : ''}{capDelta}
          </span>
        )}
        {typicalCapacity === null && <span className="text-[11px] text-slate-300 italic">capacity history needs more data</span>}
        <span className="flex-1" />
        <button onClick={() => setShowSettings(!showSettings)}
          className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06c.5.5 1.21.71 1.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
          Settings
        </button>
      </div>

      {/* Collapsible settings */}
      {showSettings && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Conversion rate (requests → appointments)</label>
            <div className="flex items-center gap-3">
              <input type="range" min="0.05" max="0.60" step="0.01" value={convRate}
                onChange={e => updateSetting('conversionRate', parseFloat(e.target.value))}
                className="flex-1" />
              <span className="text-sm font-bold text-slate-700 bg-white px-3 py-1 rounded border border-slate-200 min-w-[52px] text-center">{convRate.toFixed(2)}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">1 request = {convRate.toFixed(2)} appointments → {predicted} requests × {convRate.toFixed(2)} = {needed} appointments</div>
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
