'use client';
import { useState, useEffect, useMemo } from 'react';
import { predictDemand, getWeatherForecast, BASELINE, DOW_EFFECTS, MONTH_EFFECTS } from '@/lib/demandPredictor';
import { getHuddleCapacity, parseHuddleDateStr, getDutyDoctor, LOCATION_COLOURS } from '@/lib/huddle';
import { matchesStaffMember } from '@/lib/data';

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

  // Team clinicians for duty doctor resolution (must be above early return)
  const teamClinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    return Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
  }, [data?.clinicians]);

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

  // Duty doctor for AM/PM
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const viewDateStr = `${String(targetDate.getDate()).padStart(2,'0')}-${targetDate.toLocaleString('en-GB',{month:'short'})}-${targetDate.getFullYear()}`;
  const displayDateStr = huddleData?.dates?.includes(viewDateStr) ? viewDateStr : null;
  const resolveDuty = (session) => {
    if (!hasDuty || !displayDateStr) return null;
    const doc = getDutyDoctor(huddleData, displayDateStr, session, dutySlots);
    if (!doc) return null;
    const matched = teamClinicians.find(tc => matchesStaffMember(doc.name, tc));
    return { name: matched?.name || doc.name, title: matched?.title, location: doc.location };
  };
  const dutyAm = resolveDuty('am');
  const dutyPm = resolveDuty('pm');

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
      {/* Header: summary label + verdict + arc */}
      <div className="flex items-center gap-4" style={{ padding: '16px 24px', borderBottom: '1px solid #1e293b' }}>
        <div className="flex-1">
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>Today's summary</div>
          <div className="font-extrabold" style={{ fontSize: 24, color: verdictText }}>{verdict}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            {shortfall > 0 ? `${shortfall} urgent slots short of estimated need` : `${urgentTotal - needed} slots above estimated need`}
          </div>
        </div>
        <div className="flex-shrink-0 text-center">
          <svg viewBox="0 0 90 55" width="90" height="55">
            <path d="M 8 50 A 38 38 0 0 1 82 50" fill="none" stroke="#1e293b" strokeWidth="7" strokeLinecap="round"/>
            <path d="M 8 50 A 38 38 0 0 1 82 50" fill="none" stroke={arcColour} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${arcPct * 116} 116`}/>
            <text x="45" y="44" textAnchor="middle" fill={verdictText} style={{ fontSize: 18, fontWeight: 800 }}>{coverage}%</text>
          </svg>
        </div>
      </div>

      {/* Two-column demand vs capacity in raised cards */}
      <div className="flex gap-2.5" style={{ padding: '14px 24px' }}>
        <div className="flex-1 rounded-lg" style={{ background: '#1e293b', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Demand</div>
          <div className="flex items-baseline gap-1.5" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: '#38bdf8' }}>{predicted}</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>requests</span>
          </div>
          <div className="flex items-center gap-1" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>× {convRate} →</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#a78bfa' }}>{needed}</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>needed</span>
          </div>
          {demandDelta !== null && <span style={{ fontSize: 11, fontWeight: 600, color: demandDelta > 0 ? '#fb7185' : '#34d399', background: demandDelta > 0 ? 'rgba(251,113,133,0.1)' : 'rgba(52,211,153,0.1)', padding: '2px 8px', borderRadius: 4 }}>{demandDelta > 0 ? '+' : ''}{demandDelta} vs typical {dayLabel}</span>}
        </div>
        <div className="flex-1 rounded-lg" style={{ background: '#1e293b', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Capacity</div>
          <div className="flex items-baseline gap-1.5" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: '#34d399' }}>{urgentTotal}</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>urgent slots</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{amSlots} AM · {pmSlots} PM</div>
          {capDelta !== null && <span style={{ fontSize: 11, fontWeight: 600, color: capDelta >= 0 ? '#34d399' : '#fb7185', background: capDelta >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(251,113,133,0.1)', padding: '2px 8px', borderRadius: 4 }}>{capDelta > 0 ? '+' : ''}{capDelta} vs typical {dayLabel}</span>}
          {capDelta === null && <span style={{ fontSize: 11, color: '#334155', fontStyle: 'italic' }}>typical capacity needs more data</span>}
        </div>
      </div>

      {/* Duty doctor row */}
      {(dutyAm || dutyPm) && (
        <div className="flex gap-2.5" style={{ padding: '0 24px' }}>
          {['am', 'pm'].map(sess => {
            const doc = sess === 'am' ? dutyAm : dutyPm;
            if (!doc) return <div key={sess} className="flex-1" />;
            const locLetter = doc.location ? doc.location.charAt(0) : '';
            return (
              <div key={sess} className="flex-1 flex items-stretch rounded-lg overflow-hidden" style={{ background: '#dc2626' }}>
                <div className="flex items-center gap-2 px-3 py-1.5 flex-1 min-w-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none" className="flex-shrink-0"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Duty {sess === 'am' ? 'AM' : 'PM'}</div>
                    <div className="font-bold text-white truncate" style={{ fontSize: 12 }}>{doc.title ? `${doc.title} ` : ''}{doc.name}</div>
                  </div>
                </div>
                {locLetter && <div className="flex items-center justify-center flex-shrink-0" style={{ width: 18, background: 'rgba(255,255,255,0.15)', color: '#fecaca', fontSize: 11, fontWeight: 700 }}>{locLetter}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Settings link */}
      <div className="flex justify-end" style={{ padding: '0 24px 12px' }}>
        <button onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1 transition-colors" style={{ fontSize: 11, color: '#475569' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06c.5.5 1.21.71 1.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          Settings
        </button>
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
