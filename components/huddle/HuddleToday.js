'use client';
import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Button, Card, SectionHeading } from '@/components/ui';
import { getHuddleCapacity, getTodayDateStr, parseHuddleCSV, getNDayAvailability, LOCATION_COLOURS, getDutyDoctor, getBand } from '@/lib/huddle';
import SlotFilter from './SlotFilter';
import WhosInOut from './WhosInOut';
import DemandCapacityConnector from './DemandCapacityConnector';
import HuddleFullscreen from './HuddleFullscreen';
import { guessGroupFromRole, normalizeName, matchesStaffMember, toLocalIso } from '@/lib/data';

// ── Colour palette for capacity cards ─────────────────────────────
const CARD_COLOURS = [
  { key: 'violet', label: 'Violet', gradient: 'from-violet-500 to-purple-600' },
  { key: 'sky', label: 'Sky', gradient: 'from-sky-500 to-cyan-600' },
  { key: 'rose', label: 'Rose', gradient: 'from-rose-500 to-pink-600' },
  { key: 'indigo', label: 'Indigo', gradient: 'from-indigo-500 to-blue-600' },
  { key: 'amber', label: 'Amber', gradient: 'from-amber-500 to-orange-600' },
  { key: 'lime', label: 'Lime', gradient: 'from-lime-500 to-green-600' },
  { key: 'fuchsia', label: 'Fuchsia', gradient: 'from-fuchsia-500 to-pink-600' },
  { key: 'cyan', label: 'Cyan', gradient: 'from-cyan-500 to-teal-600' },
  { key: 'emerald', label: 'Emerald', gradient: 'from-emerald-500 to-teal-600' },
  { key: 'teal', label: 'Teal', gradient: 'from-teal-500 to-emerald-600' },
];
const GRADIENT_MAP = Object.fromEntries(CARD_COLOURS.map(c => [c.key, c.gradient]));

const ROLE_COLOURS = {
  'GP Partner': 'bg-blue-50 border-blue-200',
  'Associate Partner': 'bg-blue-50 border-blue-200',
  'Salaried GP': 'bg-indigo-50 border-indigo-200',
  'Locum': 'bg-purple-50 border-purple-200',
  'ANP': 'bg-emerald-50 border-emerald-200',
  'Paramedic Practitioner': 'bg-amber-50 border-amber-200',
  'GP Registrar': 'bg-rose-50 border-rose-200',
  'Pharmacist': 'bg-cyan-50 border-cyan-200',
  'Practice Nurse': 'bg-teal-50 border-teal-200',
  'HCA': 'bg-lime-50 border-lime-200',
};
const DEFAULT_CAPACITY_CARDS = [
  { id: 'minorIllness', title: 'Minor Illness', colour: 'violet' },
  { id: 'physio', title: 'Physiotherapy', colour: 'sky' },
];

// ── Reusable radial gauge (SVG) with scroll-triggered animation ──
function MiniGauge({ value, max, size = 80, strokeWidth = 8, colour = '#10b981', trackColour = '#e2e8f0', label, sublabel, children }) {
  const rawPct = max > 0 ? (value / max) * 100 : 0;
  const overTarget = rawPct > 100;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;

  // For over-target: animate to full circle then keep going a bit (up to 1.2x)
  const displayPct = overTarget ? 100 : Math.min(rawPct, 100);
  const dashOffset = circumference - (circumference * displayPct / 100);

  // Intersection Observer for scroll-triggered animation
  const gaugeRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = gaugeRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col items-center" ref={gaugeRef}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track circle */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColour} strokeWidth={strokeWidth} />
        {/* Filled arc — animates on scroll */}
        {displayPct > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={colour} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={inView ? dashOffset : circumference}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: `stroke-dashoffset ${overTarget ? '1.2s' : '0.8s'} cubic-bezier(0.4, 0, 0.2, 1)`,
            }} />
        )}
        {children}
      </svg>
      {label && <div className="text-[10px] text-slate-500 font-medium mt-0.5">{label}</div>}
      {sublabel && <div className="text-[9px] text-slate-400">{sublabel}</div>}
    </div>
  );
}


// ── Capacity Day Detail Panel (right slide-out) ──────────────────
function CapacityDayPanel({ dateStr, huddleData, huddleSettings, overrides, teamClinicians, onClose }) {
  if (!dateStr || !huddleData) return null;
  const cap = getHuddleCapacity(huddleData, dateStr, huddleSettings, overrides);

  // Merge AM+PM clinician data into unified list
  const mergedClinicians = {};
  [...cap.am.byClinician, ...cap.pm.byClinician].forEach(c => {
    if (!mergedClinicians[c.name]) mergedClinicians[c.name] = { name: c.name, available: 0, embargoed: 0, booked: 0 };
    mergedClinicians[c.name].available += c.available || 0;
    mergedClinicians[c.name].embargoed += c.embargoed || 0;
    mergedClinicians[c.name].booked += c.booked || 0;
  });
  const allClinicians = Object.values(mergedClinicians).sort((a, b) => (b.available + b.embargoed + b.booked) - (a.available + a.embargoed + a.booked));

  const totalAvail = allClinicians.reduce((s, c) => s + c.available, 0);
  const totalEmb = allClinicians.reduce((s, c) => s + c.embargoed, 0);
  const totalBooked = allClinicians.reduce((s, c) => s + c.booked, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full animate-slide-in-right">
        <div className="px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-white">{dateStr}</div>
            <div className="text-[10px] text-white/70">
              {totalAvail + totalEmb} available · {totalBooked} booked
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10">✕</button>
        </div>

        {/* Summary pills */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
          <div className="flex flex-col items-center py-3">
            <div className="flex items-center gap-1 mb-0.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[10px] text-slate-500">Available</span></div>
            <span className="text-xl font-bold text-emerald-600">{totalAvail}</span>
          </div>
          <div className="flex flex-col items-center py-3">
            <div className="flex items-center gap-1 mb-0.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-[10px] text-slate-500">Embargoed</span></div>
            <span className="text-xl font-bold text-amber-600">{totalEmb}</span>
          </div>
          <div className="flex flex-col items-center py-3">
            <div className="flex items-center gap-1 mb-0.5"><div className="w-2 h-2 rounded-full bg-slate-400" /><span className="text-[10px] text-slate-500">Booked</span></div>
            <span className="text-xl font-bold text-slate-600">{totalBooked}</span>
          </div>
        </div>

        {/* Column headers */}
        <div className="px-5 py-2 border-b border-slate-100 flex items-center">
          <div className="flex-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Clinician</div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="w-10 text-center text-[9px] font-semibold text-emerald-600 uppercase">Avail</span>
            <span className="w-10 text-center text-[9px] font-semibold text-amber-600 uppercase">Emb</span>
            <span className="w-10 text-center text-[9px] font-semibold text-slate-500 uppercase">Bkd</span>
          </div>
        </div>

        {/* Clinician list */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 space-y-1.5">
            {allClinicians.length > 0 ? allClinicians.map((c, i) => {
              const matched = (teamClinicians || []).find(tc => matchesStaffMember(c.name, tc));
              const displayName = matched?.name || c.name;
              const role = matched?.role || '';
              const roleColour = ROLE_COLOURS[role] || 'bg-slate-50 border-slate-200';
              return (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${roleColour}`}>
                  <svg className="w-5 h-5 opacity-50 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{displayName}</div>
                    <div className="text-[10px] opacity-60 truncate">{role || 'Staff'}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="w-10 text-center text-sm font-bold tabular-nums text-emerald-600 bg-emerald-50 rounded py-0.5">{c.available}</span>
                    <span className="w-10 text-center text-sm font-bold tabular-nums text-amber-600 bg-amber-50 rounded py-0.5">{c.embargoed}</span>
                    <span className="w-10 text-center text-sm font-bold tabular-nums text-slate-600 bg-slate-100 rounded py-0.5">{c.booked}</span>
                  </div>
                </div>
              );
            }) : <div className="text-center text-slate-400 text-xs py-3">No clinicians</div>}
          </div>

          {/* Slot type breakdown */}
          {cap.bySlotType.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">By Slot Type</div>
              <div className="space-y-1">
                {cap.bySlotType.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1 text-xs">
                    <span className="text-slate-600 truncate mr-2">{s.name}</span>
                    <div className="flex items-center gap-2 tabular-nums flex-shrink-0">
                      <span className="text-emerald-600 font-medium">{s.total + (s.totalEmb||0)}</span>
                      {(s.totalBook||0) > 0 && <span className="text-slate-400">({s.totalBook})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Match CSV clinician name to team member initials ──────────────
function cleanName(name) {
  if (!name) return '';
  return name
    .replace(/\(.*?\)/g, '')           // strip (anything in parens)
    .replace(/\[.*?\]/g, '')           // strip [anything in brackets]
    .replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|miss)\s*/i, '')  // strip titles
    .replace(/[^a-zA-Z\s'-]/g, '')     // strip non-alpha except spaces/hyphens/apostrophes
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');             // normalise whitespace
}

function getInitials(csvName, clinicians) {
  if (!csvName || !clinicians || clinicians.length === 0) return '??';

  const csvClean = cleanName(csvName);
  const csvWords = csvClean.split(/\s+/).filter(w => w.length > 1); // skip single chars

  // Build cleaned team data once
  const team = clinicians.map(c => {
    const clean = cleanName(c.name);
    const words = clean.split(/\s+/).filter(w => w.length > 1);
    return { initials: c.initials, clean, words, surname: words[words.length - 1] || '', firstName: words[0] || '' };
  });

  // 1. Exact cleaned-name match
  for (const t of team) {
    if (csvClean === t.clean) return t.initials;
  }

  // 2. One contains the other
  for (const t of team) {
    if (csvClean.includes(t.clean) || t.clean.includes(csvClean)) return t.initials;
  }

  // 3. Surname match (last meaningful word)
  const csvSurname = csvWords[csvWords.length - 1] || '';
  if (csvSurname) {
    for (const t of team) {
      if (t.surname && t.surname === csvSurname) return t.initials;
    }
  }

  // 4. Any word in CSV matches surname of team member
  for (const word of csvWords) {
    for (const t of team) {
      if (t.surname && t.surname === word) return t.initials;
    }
  }

  // 5. First name match
  const csvFirst = csvWords[0] || '';
  if (csvFirst) {
    for (const t of team) {
      if (t.firstName && t.firstName === csvFirst) return t.initials;
    }
  }

  // 6. Any word in CSV matches any word in team member name
  for (const word of csvWords) {
    if (word.length < 3) continue; // skip short words to avoid false matches
    for (const t of team) {
      if (t.words.includes(word)) return t.initials;
    }
  }

  // 7. Match team initials letters against CSV name word starts
  for (const t of team) {
    if (t.initials && t.initials.length >= 2 && csvWords.length >= 2) {
      const ini = t.initials.toLowerCase();
      if (csvWords[0][0] === ini[0] && csvWords[csvWords.length - 1][0] === ini[ini.length - 1]) return t.initials;
    }
  }

  // Fallback: build initials from cleaned CSV words
  if (csvWords.length >= 2) return (csvWords[0][0] + csvWords[csvWords.length - 1][0]).toUpperCase();
  if (csvWords.length === 1) return csvWords[0].slice(0, 2).toUpperCase();
  // Last resort — first 2 alpha chars from raw name
  const alpha = csvName.replace(/[^a-zA-Z]/g, '');

  return alpha.length >= 2 ? alpha.slice(0, 2).toUpperCase() : '??';
}


// ── 7-day compact bar chart strip with available/embargoed/booked ──
function SevenDayStrip({ huddleData, huddleSettings, overrides, accent = 'teal', teamClinicians, hasFilter = true }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 14, overrides), [huddleData, huddleSettings, overrides]);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  if (!hasFilter) return (
    <div className="py-8 px-6 text-center" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'}}>
      <div className="text-slate-600 mb-2" style={{fontSize:28}}>↑</div>
      <h3 className="text-sm font-semibold text-slate-400 mb-1">No slots selected</h3>
      <p className="text-xs text-slate-600">Open the filter to configure.</p>
    </div>
  );
  const maxVal = Math.max(...days.map(d => (d.available || 0) + (d.embargoed || 0) + (d.booked || 0)), 1);

  return (
    <div className="p-4" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'}}>
      <div className="flex items-end gap-1.5 relative" style={{ height: 100 }}>
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null;
          const avail = (d.available || 0) + (d.embargoed || 0);
          const book = d.booked || 0;
          const total = avail + book;
          const totalPct = hasData && total > 0 ? Math.max(12, (total / maxVal) * 100) : 0;
          const isHovered = hoveredIdx === i;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5 relative"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => hasData && total > 0 && setSelectedDay(d.date)}>
              {hasData && total > 0 && (
                <div className="text-[10px] font-bold transition-all duration-150" style={{color: isToday ? '#e2e8f0' : isHovered ? '#34d399' : '#64748b'}}>
                  {avail}{book > 0 && <span style={{color:'#fbbf24'}}>+{book}</span>}
                </div>
              )}
              <div className="w-full rounded-t-md overflow-hidden cursor-pointer transition-all duration-200"
                style={{ height: hasData ? `${totalPct}%` : '8%', minHeight: 3,
                  outline: isToday ? '2px solid #e2e8f0' : isHovered ? '2px solid #34d399' : 'none', outlineOffset: -1,
                  boxShadow: isHovered ? '0 0 12px rgba(52,211,153,0.3)' : 'none',
                  transform: isHovered ? 'scaleX(1.1)' : 'none', zIndex: isHovered || isToday ? 10 : 1 }}>
                {hasData && total > 0 ? (
                  <div className="w-full h-full flex flex-col justify-end">
                    {avail > 0 && <div style={{height:`${(avail/total)*100}%`,background:'#10b981'}} />}
                    {book > 0 && <div style={{height:`${(book/total)*100}%`,background:'#fbbf24'}} />}
                  </div>
                ) : <div className="w-full h-full" style={{background:'#334155'}} />}
              </div>
              <div className="mt-0.5 text-center">
                <div className="text-[9px] leading-tight" style={{color:isToday?'#e2e8f0':'#475569',fontWeight:isToday?700:400}}>{d.dayName?.charAt(0)}</div>
                <div className="text-[8px] leading-tight" style={{color:isToday?'#94a3b8':'#334155'}}>{d.dayNum}</div>
              </div>
              {isHovered && hasData && total > 0 && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap pointer-events-none" style={{background:'#0f172a',border:'1px solid #334155',minWidth:'100px'}}>
                  <div className="text-xs font-bold mb-0.5 text-slate-200">{d.dayName} {d.dayNum}</div>
                  <div className="space-y-0.5 text-[11px]">
                    <div className="flex justify-between gap-3"><span className="text-slate-400">Available</span><span className="font-semibold text-emerald-400">{avail}</span></div>
                    {book > 0 && <div className="flex justify-between gap-3"><span className="text-slate-400">Booked</span><span className="font-semibold text-amber-400">{book}</span></div>}
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderTop:'4px solid #334155'}} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2" style={{borderTop:'1px solid #334155'}}>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}} /><span className="text-xs text-slate-500">Available</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#fbbf24'}} /><span className="text-xs text-slate-500">Booked</span></div>
      </div>
      {selectedDay && <CapacityDayPanel dateStr={selectedDay} huddleData={huddleData} huddleSettings={huddleSettings} overrides={overrides} teamClinicians={teamClinicians} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}

// ── 28-day graphical routine capacity with hover glow + tooltip ──
function TwentyEightDayChart({ huddleData, huddleSettings, overrides, teamClinicians }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 30, overrides), [huddleData, huddleSettings, overrides]);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const maxVal = Math.max(...days.map(d => (d.available || 0) + (d.embargoed || 0) + (d.booked || 0)), 1);
  const totalAvail = days.reduce((sum, d) => sum + (d.available || 0), 0);
  const totalEmb = days.reduce((sum, d) => sum + (d.embargoed || 0), 0);
  const totalBooked = days.reduce((sum, d) => sum + (d.booked || 0), 0);
  const THRESHOLDS = [3, 7, 14, 21];
  const HATCH = 'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-slate-400">Next 30 days</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-emerald-400">{totalAvail} avail</span>
          {totalEmb > 0 && <span className="font-semibold text-amber-400">{totalEmb} emb</span>}
          {totalBooked > 0 && <span className="font-semibold text-red-400">{totalBooked} booked</span>}
        </div>
      </div>
      <div className="flex items-end gap-px relative" style={{ height: 140 }}>
        {(() => {
          let calDay = 0;
          const calDays = days.map(() => calDay++);
          const totalFlex = days.reduce((s, d) => s + (d.isWeekend ? 0.3 : 1), 0);
          return <>
            {THRESHOLDS.map((t, ti) => {
              const idx = calDays.findIndex(cd => cd >= t);
              if (idx < 0) return null;
              const flexBefore = days.slice(0, idx).reduce((s, d) => s + (d.isWeekend ? 0.3 : 1), 0);
              const pct = (flexBefore / totalFlex) * 100;
              return <div key={`t${ti}`} className="absolute top-0 bottom-0 z-[1] pointer-events-none" style={{ left: `${pct}%` }}>
                <div className="absolute top-0 bottom-0 w-px" style={{ background: '#475569', opacity: 0.6 }} />
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-semibold text-slate-500 whitespace-nowrap" style={{background:'#1e293b',border:'1px solid #334155'}}>{t}d</div>
              </div>;
            })}
          </>;
        })()}
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null && !d.isWeekend;
          const avail = d.available || 0;
          const emb = d.embargoed || 0;
          const book = d.booked || 0;
          const total = avail + emb + book;
          const pct = hasData && total > 0 ? Math.max(6, (total / maxVal) * 100) : 0;
          const isHovered = hoveredIdx === i;
          if (d.isWeekend) return <div key={i} className="flex-[0.3] h-full" />;
          return (
            <div key={i}
              className={`flex-1 flex flex-col items-center justify-end h-full relative ${d.isMonday && i > 0 ? 'ml-1 pl-1' : ''}`}
              style={{borderLeft: d.isMonday && i > 0 ? '1px solid #334155' : 'none'}}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => hasData && total > 0 && setSelectedDay(d.date)}>
              {hasData && total > 0 && (
                <div className="text-[10px] font-bold transition-all duration-150" style={{color: isToday ? '#e2e8f0' : isHovered ? '#34d399' : '#64748b'}}>
                  {avail}{emb > 0 && <span style={{color:'#fbbf24'}}>+{emb}</span>}
                </div>
              )}
              <div className="w-full rounded-t overflow-hidden cursor-pointer transition-all duration-200"
                style={{ height: hasData ? `${pct}%` : '4%', minHeight: 2,
                  outline: isToday ? '2px solid #e2e8f0' : isHovered ? '2px solid #34d399' : 'none',
                  outlineOffset: -1,
                  boxShadow: isHovered ? '0 0 12px rgba(52,211,153,0.3)' : 'none',
                  transform: isHovered ? 'scaleX(1.15)' : 'none', zIndex: isHovered || isToday ? 10 : 1 }}>
                {!hasData ? <div className="w-full h-full" style={{background:'#1e293b'}} /> : total === 0 ? <div className="w-full h-full" style={{background:'#334155'}} /> : (
                  <div className="w-full h-full flex flex-col justify-end">
                    {avail > 0 && <div style={{height:`${(avail/total)*100}%`,background:'#10b981'}} />}
                    {emb > 0 && <div style={{height:`${(emb/total)*100}%`,background:'#f59e0b'}} />}
                    {book > 0 && <div style={{height:`${(book/total)*100}%`,background:HATCH}} />}
                  </div>
                )}
              </div>
              {isHovered && hasData && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap pointer-events-none" style={{background:'#0f172a',border:'1px solid #334155',minWidth:'120px'}}>
                  <div className="text-xs font-bold mb-1 text-slate-200">{d.dayName} {d.dayNum} {d.monthShort}</div>
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between gap-3 text-[11px]"><span className="flex items-center gap-1 text-slate-400"><span className="w-1.5 h-1.5 rounded-full" style={{background:'#10b981'}} />Available</span><span className="font-semibold text-emerald-400">{avail}</span></div>
                    {emb > 0 && <div className="flex items-center justify-between gap-3 text-[11px]"><span className="flex items-center gap-1 text-slate-400"><span className="w-1.5 h-1.5 rounded-full" style={{background:'#f59e0b'}} />Embargoed</span><span className="font-semibold text-amber-400">{emb}</span></div>}
                    {book > 0 && <div className="flex items-center justify-between gap-3 text-[11px]"><span className="flex items-center gap-1 text-slate-400"><span className="w-1.5 h-1.5 rounded-full" style={{background:'#ef4444'}} />Booked</span><span className="font-semibold text-red-400">{book}</span></div>}
                    <div className="flex items-center justify-between gap-3 text-[11px] pt-0.5" style={{borderTop:'1px solid #334155'}}><span className="text-slate-400">Total</span><span className="font-bold text-white">{total}</span></div>
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderTop:'4px solid #334155'}} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-px mt-1.5">
        {days.map((d, i) => {
          if (d.isWeekend) return <div key={i} className="flex-[0.3]" />;
          const isToday = i === 0;
          return <div key={i} className={`flex-1 text-center ${d.isMonday && i > 0 ? 'ml-1 pl-1' : ''}`}>
            <div className="text-[9px] leading-tight" style={{color:isToday?'#e2e8f0':'#475569',fontWeight:isToday?700:400}}>{d.dayName?.charAt(0)}</div>
            <div className="text-[8px] leading-tight" style={{color:isToday?'#94a3b8':'#334155'}}>{d.dayNum}</div>
          </div>;
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3" style={{borderTop:'1px solid #334155'}}>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}} /><span className="text-xs text-slate-500">Available</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}} /><span className="text-xs text-slate-500">Embargoed</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:HATCH,backgroundSize:'5px 5px'}} /><span className="text-xs text-slate-500">Booked</span></div>
      </div>
      {selectedDay && <CapacityDayPanel dateStr={selectedDay} huddleData={huddleData} huddleSettings={huddleSettings} overrides={overrides} teamClinicians={teamClinicians} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function HuddleToday({ data, saveData, toast, huddleData, setHuddleData, huddleMessages, setHuddleMessages, setActiveSection }) {
  const [newMsg, setNewMsg] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [viewingDate, setViewingDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [showCalendar, setShowCalendar] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileRef = useRef(null);
  const hs = data?.huddleSettings || {};
  const knownSlotTypes = hs?.knownSlotTypes || [];
  const saved = hs?.savedSlotFilters || {};

  // Initialise overrides from persisted settings
  const [urgentOverrides, setUrgentOverridesLocal] = useState(() => saved.urgent || null);
  const [routineOverrides, setRoutineOverridesLocal] = useState(() => saved.routine || null);
  const [cardOverrides, setCardOverrides] = useState(() => {
    // Load saved overrides for each capacity card
    const cards = hs?.capacityCards || DEFAULT_CAPACITY_CARDS;
    const o = {};
    cards.forEach(c => { o[c.id] = saved[c.id] || null; });
    return o;
  });
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardColour, setNewCardColour] = useState('rose');

  // Date navigation helpers
  const realToday = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const isViewingToday = viewingDate.getTime() === realToday.getTime();
  const maxDate = useMemo(() => { const d = new Date(realToday); d.setDate(d.getDate() + 30); return d; }, [realToday]);
  const minDate = useMemo(() => { const d = new Date(realToday); d.setDate(d.getDate() - 30); return d; }, [realToday]);

  const navigateDay = (direction) => {
    const d = new Date(viewingDate);
    do { d.setDate(d.getDate() + direction); } while (d.getDay() === 0 || d.getDay() === 6);
    if (d >= minDate && d <= maxDate) setViewingDate(new Date(d));
  };
  const goToToday = () => setViewingDate(new Date(realToday));
  const goToDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    if (d >= minDate && d <= maxDate) { setViewingDate(d); setShowCalendar(false); }
  };

  // For non-urgent cards, null overrides should mean ALL slots, not fall through to urgent filter
  const allSlotsOverrides = useMemo(() => {
    const o = {};
    knownSlotTypes.forEach(s => { o[s] = true; });
    // Also include any slot types from the live CSV data that might not be in knownSlotTypes yet
    if (huddleData?.allSlotTypes) huddleData.allSlotTypes.forEach(s => { o[s] = true; });
    return o;
  }, [knownSlotTypes, huddleData?.allSlotTypes]);
  const effectiveRoutineOverrides = routineOverrides || allSlotsOverrides;

  // Wrapper setters that persist to Redis
  const persistFilter = (key, value) => {
    const newSaved = { ...data.huddleSettings?.savedSlotFilters, [key]: value };
    saveData({ ...data, huddleSettings: { ...hs, savedSlotFilters: newSaved } }, false);
  };
  const setUrgentOverrides = (v) => { setUrgentOverridesLocal(v); persistFilter('urgent', v); };
  const setRoutineOverrides = (v) => { setRoutineOverridesLocal(v); persistFilter('routine', v); };
  const dutyDoctorSlot = hs?.dutyDoctorSlot || null;
  const hasDutySlot = dutyDoctorSlot && (!Array.isArray(dutyDoctorSlot) || dutyDoctorSlot.length > 0);
  const setDutyDoctorSlot = (v) => { saveData({ ...data, huddleSettings: { ...hs, dutyDoctorSlot: v && v.length > 0 ? v : null } }, false); };
  const setCardOverride = (cardId, v) => {
    setCardOverrides(prev => ({ ...prev, [cardId]: v }));
    persistFilter(cardId, v);
  };

  const capacityCards = hs?.capacityCards || DEFAULT_CAPACITY_CARDS;

  const addCapacityCard = () => {
    if (!newCardTitle.trim()) return;
    const id = 'card_' + Date.now();
    const newCard = { id, title: newCardTitle.trim(), colour: newCardColour };
    const updatedCards = [...capacityCards, newCard];
    saveData({ ...data, huddleSettings: { ...hs, capacityCards: updatedCards } });
    setCardOverrides(prev => ({ ...prev, [id]: null }));
    setNewCardTitle('');
    setShowAddCard(false);
  };

  const removeCapacityCard = (cardId) => {
    const updatedCards = capacityCards.filter(c => c.id !== cardId);
    const newSaved = { ...hs?.savedSlotFilters };
    delete newSaved[cardId];
    saveData({ ...data, huddleSettings: { ...hs, capacityCards: updatedCards, savedSlotFilters: newSaved } });
    setCardOverrides(prev => { const n = { ...prev }; delete n[cardId]; return n; });
  };

  const teamClinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    return Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
  }, [data?.clinicians]);

  const processCSV = (csvText) => {
    try {
      const parsed = parseHuddleCSV(csvText);
      setHuddleData(parsed);
      const uploadTime = new Date().toISOString();
      const newHs = { ...hs, knownClinicians: [...new Set([...(hs.knownClinicians||[]), ...parsed.clinicians])], knownSlotTypes: [...new Set([...(hs.knownSlotTypes||[]), ...parsed.allSlotTypes])], lastUploadDate: uploadTime };

      // Auto-discover unmatched CSV clinicians
      let updatedClinicians = [...teamClinicians];
      let newCount = 0;
      (parsed.clinicians || []).forEach(csvName => {
        const matched = updatedClinicians.some(c => matchesStaffMember(csvName, c));
        if (!matched) {
          const roleMatch = csvName.match(/\(([^)]+)\)/);
          const role = roleMatch ? roleMatch[1] : 'Staff';
          const rawName = csvName.replace(/\(.*?\)/g, '').trim();
          // Flip "SURNAME, First" to "First Surname"
          let name = rawName;
          if (rawName.includes(',')) {
            const parts = rawName.split(',').map(s => s.trim());
            if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
              name = parts[1] + ' ' + parts[0];
            }
          }
          // Title-case: lowercase first, then capitalise first letter of each word
          name = name.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
          // Skip generic/empty names
          if (name.length < 3 || name.toLowerCase().includes('generic') || name.toLowerCase().includes('session holder')) return;
          const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
          const newId = Math.max(0, ...updatedClinicians.map(c => c.id)) + 1;
          updatedClinicians.push({
            id: newId, name, initials, role, group: guessGroupFromRole(role),
            sessions: 0, primaryBuddy: null, secondaryBuddy: null,
            status: 'active', longTermAbsent: false, canProvideCover: false,
            buddyCover: false, showWhosIn: true, source: 'csv', confirmed: false, aliases: [csvName],
          });
          newCount++;
        }
      });

      saveData({ ...data, clinicians: updatedClinicians, huddleCsvData: parsed, huddleCsvUploadedAt: uploadTime, huddleSettings: newHs }, false);
      const msg = newCount > 0 ? `Report uploaded — ${newCount} new staff discovered` : 'Report uploaded successfully';
      toast(msg, newCount > 0 ? 'warning' : 'success');
      setError('');
    } catch (err) { setError('Failed to parse CSV: ' + err.message); toast('Failed to parse CSV', 'error'); }
  };

  const onFileChange = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => processCSV(ev.target.result); r.readAsText(f); e.target.value = ''; };
  const onDrop = (e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (!f || !f.name.endsWith('.csv')) { toast('Please drop a CSV file', 'warning'); return; } const r = new FileReader(); r.onload = (ev) => processCSV(ev.target.result); r.readAsText(f); };

  const addMessage = () => {
    if (!newMsg.trim()) return;
    const updated = [...huddleMessages, { id: Date.now(), text: newMsg.trim(), author: newAuthor.trim() || null, addedAt: new Date().toISOString() }];
    setHuddleMessages(updated);
    saveData({ ...data, huddleMessages: updated }, false);
    setNewMsg('');
  };
  const removeMessage = (i) => { const updated = huddleMessages.filter((_, idx) => idx !== i); setHuddleMessages(updated); saveData({ ...data, huddleMessages: updated }, false); };

  const isUploadedToday = data?.huddleCsvUploadedAt ? new Date(data.huddleCsvUploadedAt).toDateString() === realToday.toDateString() : false;
  const viewingDateStr = `${String(viewingDate.getDate()).padStart(2,'0')}-${viewingDate.toLocaleString('en-GB',{month:'short'})}-${viewingDate.getFullYear()}`;
  const displayDate = huddleData?.dates?.includes(viewingDateStr) ? viewingDateStr : null;
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs, urgentOverrides) : null;
  const hasDataForDate = !!displayDate;
  // Check ALL slots (unfiltered) to determine if practice is open
  const allCapacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, {}) : null;
  const hasSlots = allCapacity && ((allCapacity.am.total||0) + (allCapacity.pm.total||0) + (allCapacity.am.embargoed||0) + (allCapacity.pm.embargoed||0) + (allCapacity.am.booked||0) + (allCapacity.pm.booked||0)) > 0;

  const hasUrgentFilter = !!urgentOverrides;
  const hasRoutineFilter = !!routineOverrides;

  // 8AM prediction snapshot — save today's capacity once per day
  useEffect(() => {
    if (!isViewingToday || !capacity || !displayDate) return;
    const now = new Date();
    if (now.getHours() < 8) return;
    const todayKey = toLocalIso(realToday);
    const existing = data.predictionHistory?.[todayKey];
    if (existing) return;
    const snapshot = {
      savedAt: now.toISOString(),
      urgentAm: (capacity.am.total || 0) + (capacity.am.embargoed || 0) + (capacity.am.booked || 0),
      urgentPm: (capacity.pm.total || 0) + (capacity.pm.embargoed || 0) + (capacity.pm.booked || 0),
      urgentTotal: (capacity.am.total || 0) + (capacity.am.embargoed || 0) + (capacity.am.booked || 0) + (capacity.pm.total || 0) + (capacity.pm.embargoed || 0) + (capacity.pm.booked || 0),
      availAm: (capacity.am.total || 0) + (capacity.am.embargoed || 0),
      availPm: (capacity.pm.total || 0) + (capacity.pm.embargoed || 0),
      bookedAm: capacity.am.booked || 0,
      bookedPm: capacity.pm.booked || 0,
    };
    saveData({ ...data, predictionHistory: { ...(data.predictionHistory || {}), [todayKey]: snapshot } }, false);
  }, [isViewingToday, capacity, displayDate]);

  // Smooth fade transition when changing dates
  const [contentOpacity, setContentOpacity] = useState(1);
  const prevDateRef = useRef(viewingDate);
  useEffect(() => {
    if (prevDateRef.current.getTime() !== viewingDate.getTime()) {
      setContentOpacity(0);
      const t = setTimeout(() => setContentOpacity(1), 50);
      prevDateRef.current = viewingDate;
      return () => clearTimeout(t);
    }
  }, [viewingDate]);

  return (
    <div className="space-y-6 animate-in" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragging(true); } }} onDragLeave={e => { e.preventDefault(); setIsDragging(false); }} onDrop={e => { if (e.dataTransfer.types.includes('Files')) { onDrop(e); } }}>
      {isFullscreen && <HuddleFullscreen data={data} huddleData={huddleData} viewingDate={viewingDate} onExit={() => setIsFullscreen(false)} onNavigateDay={navigateDay} />}
      {isDragging && (
        <div className="fixed inset-0 z-40 bg-teal-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center border-2 border-dashed border-teal-400">
            <div className="text-4xl mb-2">📊</div>
            <div className="text-lg font-semibold text-slate-900">Drop CSV here</div>
          </div>
        </div>
      )}

      {/* Date header with navigation */}
      <div className="card overflow-visible relative z-10">
        <div className="flex">
          <div className={`${isViewingToday ? 'bg-emerald-500' : 'bg-slate-600'} px-4 py-3 flex flex-col items-center justify-center min-w-[90px] transition-colors relative`}>
            <div className="text-3xl font-extrabold text-white leading-none">{viewingDate.getDate()}</div>
            <div className="text-xs font-semibold text-white/80 uppercase mt-0.5">{viewingDate.toLocaleDateString('en-GB', { month: 'short' })}</div>
            <div className="flex items-center gap-1 mt-1.5">
              <button onClick={() => setShowCalendar(!showCalendar)} className="w-6 h-6 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </button>
              {!isViewingToday && <button onClick={goToToday} className="px-2 py-0.5 rounded bg-white/20 text-white text-[10px] font-semibold hover:bg-white/30 transition-colors">Today</button>}
            </div>
            {showCalendar && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 p-3">
                <input type="date"
                  value={toLocalIso(viewingDate)}
                  min={toLocalIso(minDate)}
                  max={toLocalIso(maxDate)}
                  onChange={(e) => goToDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
            )}
          </div>
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex-1 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigateDay(-1)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div style={{ width: '200px' }}>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">
                  {isViewingToday ? 'Today' : viewingDate.toLocaleDateString('en-GB', { weekday: 'long' })}
                </h1>
                <span className="text-sm text-slate-300">
                  {isViewingToday
                    ? viewingDate.toLocaleDateString('en-GB', { weekday: 'long' })
                    : viewingDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <button onClick={() => navigateDay(1)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsFullscreen(true)} className="h-9 px-3 rounded-lg flex items-center gap-2 text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="Fullscreen huddle board">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
                <span className="text-xs font-medium">Huddle board</span>
              </button>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
              <div className="flex flex-col items-end">
                <Button variant={isUploadedToday ? 'upload_fresh' : 'upload_stale'} onClick={() => fileRef.current?.click()}>
                  {isUploadedToday ? '✓ Upload Report' : '⚠ Upload Report'}
                </Button>
                {data?.huddleCsvUploadedAt && (
                  <span className="text-[10px] text-slate-400 mt-1">Uploaded {new Date(data.huddleCsvUploadedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Not-today banner */}
      {!isViewingToday && (
        <div className="card p-3 bg-slate-50 border-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span className="text-xs text-slate-500">
            Viewing {viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {!hasDataForDate && huddleData && ' — no CSV data available for this date'}
          </span>
          <button onClick={goToToday} className="ml-auto text-xs font-medium text-emerald-600 hover:text-emerald-800 underline">Back to today</button>
        </div>
      )}

      {error && <Card className="p-4 bg-red-50 border-red-200 text-red-700 text-sm">{error}</Card>}

      <div style={{ opacity: contentOpacity, transition: 'opacity 0.15s ease-in-out' }}>
      {/* NOTICEBOARD */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span className="text-sm font-semibold text-amber-400">Noticeboard</span>
          {huddleMessages.length > 0 && <span className="text-xs text-white/40 ml-auto">{huddleMessages.length} message{huddleMessages.length !== 1 ? 's' : ''}</span>}
        </div>
        <div className="p-3 space-y-1">
          {huddleMessages.length === 0 && <p className="text-sm text-slate-400 text-center py-3">No messages yet.</p>}
          {huddleMessages.map((msg, i) => {
            const colours = [
              { border: '#f59e0b', bg: 'rgba(245,158,11,0.06)', badge: '#fef3c7', badgeText: '#92400e', init: '#fde68a' },
              { border: '#3b82f6', bg: 'rgba(59,130,246,0.06)', badge: '#dbeafe', badgeText: '#1e40af', init: '#bfdbfe' },
              { border: '#ec4899', bg: 'rgba(236,72,153,0.06)', badge: '#fce7f3', badgeText: '#9d174d', init: '#fbcfe8' },
              { border: '#10b981', bg: 'rgba(16,185,129,0.06)', badge: '#d1fae5', badgeText: '#065f46', init: '#a7f3d0' },
              { border: '#8b5cf6', bg: 'rgba(139,92,246,0.06)', badge: '#ede9fe', badgeText: '#5b21b6', init: '#ddd6fe' },
            ];
            const c = colours[i % colours.length];
            const initials = msg.author ? msg.author.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';
            const time = msg.addedAt ? new Date(msg.addedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <div key={msg.id || i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg group" style={{ borderLeft: `3px solid ${c.border}`, background: c.bg }}>
                <div className="relative flex-shrink-0">
                  <div className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 cursor-default" style={{ background: c.badge }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: c.init, color: c.badgeText }}>{initials}</div>
                  </div>
                  {msg.author && (
                    <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-20 bg-slate-800 text-white text-xs px-2.5 py-1 rounded-lg whitespace-nowrap shadow-lg">{msg.author}</div>
                  )}
                </div>
                <span className="text-sm text-slate-800 flex-1">{msg.text}</span>
                {time && <span className="text-xs text-slate-400 flex-shrink-0">{time}</span>}
                <button onClick={() => removeMessage(i)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-xs">✕</button>
              </div>
            );
          })}
          <div className="flex gap-2 pt-2">
            <input type="text" value={newAuthor} onChange={e => setNewAuthor(e.target.value)} placeholder="Your name" className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addMessage(); }} placeholder="Add a message..." className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <Button onClick={addMessage} size="sm">Add</Button>
          </div>
        </div>
      </div>

      {/* DEMAND vs CAPACITY CONNECTOR — only when we have data for this date */}
      {hasSlots && <DemandCapacityConnector viewingDate={viewingDate} huddleData={huddleData} capacity={capacity} hs={hs} data={data} saveData={saveData} urgentOverrides={urgentOverrides} />}

      {/* WHO'S IN / OUT — only when we have data for this date */}
      {hasSlots && <WhosInOut data={data} saveData={saveData} huddleData={huddleData} onNavigate={setActiveSection} viewingDate={viewingDate} />}

      {/* ═══ DATA-DRIVEN SECTIONS ═══ */}
      {!huddleData ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Upload Appointment Report</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload or drag-and-drop your EMIS CSV to see urgent capacity.</p>
          <Button onClick={() => fileRef.current?.click()}>Select CSV File</Button>
        </div>
      ) : !hasSlots ? (
        <div className="card overflow-hidden">
          <div className="py-12 px-6 text-center">
            <div className="mx-auto mb-4" style={{ width: 64, height: 64, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <path d="M9 22V12h6v10" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-700 mb-1">Practice closed</h2>
            <p className="text-sm text-slate-400">No appointment data for {viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
      ) : (
        <>
          {/* ─── URGENT ON THE DAY ─── */}
          {(() => {
            const urgentAm = capacity.am.total + (capacity.am.embargoed || 0) + (capacity.am.booked || 0);
            const availAm = (capacity.am.total || 0) + (capacity.am.embargoed || 0);
            const bookedAm = capacity.am.booked || 0;
            const urgentPm = capacity.pm.total + (capacity.pm.embargoed || 0) + (capacity.pm.booked || 0);
            const availPm = (capacity.pm.total || 0) + (capacity.pm.embargoed || 0);
            const bookedPm = capacity.pm.booked || 0;

            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const todayDayName = dayNames[viewingDate.getDay()];
            const expectedAm = hs.expectedCapacity?.[todayDayName]?.am || 0;
            const expectedPm = hs.expectedCapacity?.[todayDayName]?.pm || 0;
            const hasTarget = (expectedAm + expectedPm) > 0;

            const amBand = getBand(urgentAm, expectedAm);
            const pmBand = getBand(urgentPm, expectedPm);

            // 8AM snapshot for overflow detection
            const snapshotKey = toLocalIso(viewingDate);
            const snapshot = data.predictionHistory?.[snapshotKey];
            const addedAm = snapshot ? urgentAm - snapshot.urgentAm : 0;
            const addedPm = snapshot ? urgentPm - snapshot.urgentPm : 0;

            // Bar scale = max(actual, target)
            const barPct = (slots, target) => {
              const scale = Math.max(slots, target, 1);
              return { fillPct: (slots / scale) * 100, markerPct: (target / scale) * 100 };
            };

            // Session panel renderer
            const SessionPanel = ({ label, slots, avail, booked, added, target, band, isShort, sessionData, dutyDoc }) => {
              const bar = barPct(slots, target);
              const availPct = slots > 0 ? (avail / slots) * 100 : 0;
              const bookedPct = slots > 0 ? (booked / slots) * 100 : 0;
              const LOCATION_SORT = { 'Winscombe': 0, 'Banwell': 1, 'Locking': 2 };
              const allClinicians = (sessionData?.byClinician || [])
                .map(c => {
                  const matched = teamClinicians.find(tc => matchesStaffMember(c.name, tc));
                  return { ...c, displayName: matched?.name || c.name, role: matched?.role || '', initials: matched?.initials || (c.name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2), total: c.available + (c.embargoed || 0) + (c.booked || 0) };
                })
                .filter(c => c.total > 0)
                .sort((a, b) => (LOCATION_SORT[a.location] ?? 9) - (LOCATION_SORT[b.location] ?? 9) || b.total - a.total);

              // Resolve duty doctor and remove from clinician list
              const dutyDocDisplay = dutyDoc ? (() => {
                const matched = teamClinicians.find(tc => matchesStaffMember(dutyDoc.name, tc));
                const dutyInList = allClinicians.find(c => matchesStaffMember(c.name, matched || { name: dutyDoc.name }));
                return { name: matched?.name || dutyDoc.name, initials: matched?.initials || (dutyDoc.name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2), title: matched?.title, location: dutyDoc.location, total: dutyInList?.total || 0, csvName: dutyDoc.name, booked: dutyInList?.booked || 0, avail: (dutyInList?.available || 0) + (dutyInList?.embargoed || 0) };
              })() : null;

              // Filter duty doctor out of the list
              const clinicians = dutyDocDisplay
                ? allClinicians.filter(c => !matchesStaffMember(c.name, { name: dutyDocDisplay.name, aliases: [] }))
                : allClinicians;

              const dutyLocCol = dutyDocDisplay?.location ? LOCATION_COLOURS[dutyDocDisplay.location] : null;
              const dutyLocLetter = dutyDocDisplay?.location ? dutyDocDisplay.location.charAt(0) : '';

              return (
                <div className="flex-1 p-5" style={{ background: band.tint || 'transparent', borderLeft: isShort ? `3px solid ${band.colour}` : undefined }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold uppercase tracking-wider" style={{ color: band.colour }}>{label}</div>
                    {target > 0 && <span className="text-xs font-semibold px-2.5 py-1 rounded" style={{ background: band.colour, color: 'white' }}>target {target}</span>}
                  </div>
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-5xl font-extrabold leading-none" style={{ color: band.colour }}>{slots}</span>
                    <div className="flex-1">
                      <div className="h-5 rounded-lg relative overflow-hidden" style={{ background: band.border }}>
                        <div className="absolute left-0 top-0 bottom-0" style={{ width: `${Math.min(bar.fillPct, 100)}%`, display:'flex', borderRadius: bar.fillPct >= 100 ? '8px' : '8px 0 0 8px' }}>
                          {avail > 0 && <div style={{flex: avail, background: band.colour}} />}
                          {booked > 0 && <div style={{flex: booked, background: '#f59e0b'}} />}
                        </div>
                        {target > 0 && <div className="absolute z-[2]" style={{ left: `${Math.min(bar.markerPct, 100)}%`, top: '-8px', bottom: '-8px', width: '3px', background: band.textCol, borderRadius: '2px', marginLeft: '-1.5px' }} />}
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-xs font-semibold" style={{ color: band.colour }}>{avail} available{booked > 0 ? <span style={{color:'#f59e0b'}}> · {booked} booked</span> : ''}{added > 0 ? <span style={{color:'#818cf8'}}> · {added} added</span> : ''}</span>
                        {target > 0 && <span className="text-xs font-semibold" style={{ color: band.textCol }}>{band.label} · {Math.round(band.pct)}%</span>}
                      </div>
                    </div>
                  </div>
                  {dutyDocDisplay && (
                    <div className="flex items-stretch rounded-lg overflow-hidden mb-3" style={{ border: '2px solid #dc2626' }}>
                      <div className="flex items-center gap-2.5 px-3 py-2 flex-1 min-w-0" style={{ background: '#dc2626' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none" className="flex-shrink-0"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.7)' }}>Duty doctor</div>
                          <div className="text-sm font-bold text-white truncate">{dutyDocDisplay.title ? `${dutyDocDisplay.title} ` : ''}{dutyDocDisplay.name}</div>
                        </div>
                        {dutyDocDisplay.total > 0 && (
                          <div className="flex items-center gap-0.5 flex-shrink-0 flex-wrap" style={{maxWidth:80}}>
                            {Array.from({length: dutyDocDisplay.avail}).map((_,i) => <span key={`a${i}`} className="w-2 h-2 rounded-full" style={{background:'#4ade80'}} />)}
                            {Array.from({length: dutyDocDisplay.booked}).map((_,i) => <span key={`b${i}`} className="w-2 h-2 rounded-full" style={{background:'#fbbf24'}} />)}
                          </div>
                        )}
                      </div>
                      {dutyLocLetter && <div className="w-[22px] flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)', color: '#fecaca' }}>{dutyLocLetter}</div>}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {clinicians.map((c, i) => {
                      const roleColour = ROLE_COLOURS[c.role] || 'bg-slate-50 border-slate-200';
                      const gc = c.role?.includes('Nurse') || c.role === 'HCA' || c.role === 'Nurse Associate' ? { bg: '#d1fae5', text: '#047857' } : c.role === 'ANP' || c.role?.includes('Paramedic') || c.role?.includes('Pharma') || c.role?.includes('Physio') ? { bg: '#ede9fe', text: '#6d28d9' } : { bg: '#dbeafe', text: '#1d4ed8' };
                      const locCol = c.location ? LOCATION_COLOURS[c.location] : null;
                      const locLetter = c.location ? c.location.charAt(0) : '';
                      return (
                        <div key={i} className={`flex items-stretch rounded-lg border overflow-hidden ${roleColour}`}>
                          <div className="flex items-center gap-2.5 px-3 py-2 flex-1 min-w-0">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: gc.bg, color: gc.text }}>{c.initials}</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-900 truncate">{c.displayName}</div>
                              <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
                                {Array.from({length: c.available + (c.embargoed || 0)}).map((_,j) => <span key={`a${j}`} className="w-2 h-2 rounded-full" style={{background: band.colour}} />)}
                                {Array.from({length: c.booked || 0}).map((_,j) => <span key={`b${j}`} className="w-2 h-2 rounded-full" style={{background:'#fbbf24'}} />)}
                              </div>
                            </div>
                            <span className="text-lg font-extrabold min-w-[24px] text-right flex-shrink-0" style={{ color: band.colour }}>{c.total}</span>
                          </div>
                          {locCol && <div className="w-[22px] flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ background: locCol.bg, color: locCol.text }}>{locLetter}</div>}
                        </div>
                      );
                    })}
                    {clinicians.length === 0 && <div className="text-center text-slate-400 text-sm py-3">No capacity</div>}
                  </div>
                </div>
              );
            };

            return (
              <div className="card overflow-hidden">
                <div className="bg-gradient-to-r from-red-600 to-rose-600 px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">Urgent on the Day</div>
                      <div className="text-[11px] text-white/70">Available urgent capacity{displayDate && displayDate !== viewingDateStr ? ` (${displayDate})` : ''}</div>
                    </div>
                    <SlotFilter overrides={urgentOverrides} setOverrides={setUrgentOverrides} knownSlotTypes={knownSlotTypes} title="Urgent Slot Filter" dutyDoctorSlot={dutyDoctorSlot} setDutyDoctorSlot={setDutyDoctorSlot} />
                  </div>
                </div>
                {displayDate && displayDate !== viewingDateStr && (
                  <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm flex items-center gap-2">Date not found in report. Showing {displayDate}.</div>
                )}
                {urgentOverrides && Object.values(urgentOverrides).every(v => !v) ? (
                  <div className="py-12 px-6 text-center">
                    <div className="text-slate-300 mb-2" style={{fontSize:32}}>↑</div>
                    <h3 className="text-base font-semibold text-slate-700 mb-1">No slots selected</h3>
                    <p className="text-sm text-slate-400 max-w-sm mx-auto">Open the filter above to choose which slot types to include as urgent on the day.</p>
                  </div>
                ) : (<>
                <div className="flex flex-col md:flex-row md:divide-x divide-slate-200">
                  <SessionPanel label="Morning" slots={urgentAm} avail={availAm} booked={bookedAm} added={addedAm} target={expectedAm} band={amBand} isShort={false} sessionData={capacity.am} dutyDoc={hasDutySlot ? getDutyDoctor(huddleData, displayDate, 'am', dutyDoctorSlot) : null} />
                  <SessionPanel label="Afternoon" slots={urgentPm} avail={availPm} booked={bookedPm} added={addedPm} target={expectedPm} band={pmBand} isShort={pmBand.colour === '#ef4444' || pmBand.colour === '#f59e0b'} sessionData={capacity.pm} dutyDoc={hasDutySlot ? getDutyDoctor(huddleData, displayDate, 'pm', dutyDoctorSlot) : null} />
                </div>

                {/* Slot type breakdown */}
                {capacity.bySlotType.length > 0 && (
                  <div className="border-t border-slate-200">
                    <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-100 flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">By Slot Type</div>
                      <div className="flex items-center gap-3">
                        {['Winscombe','Banwell','Locking'].map(loc => {
                          const lc = LOCATION_COLOURS[loc];
                          return lc ? <div key={loc} className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:lc.bg}}/><span className="text-[10px] text-slate-400">{loc}</span></div> : null;
                        })}
                      </div>
                    </div>
                    <div className="px-5 py-3 space-y-2">
                      {capacity.bySlotType.map((s, i) => {
                        const allAvail = (s.total || 0) + (s.totalEmb || 0);
                        const allBooked = s.totalBook || 0;
                        const slotTotal = allAvail + allBooked;
                        if (slotTotal === 0) return null;
                        const locs = s.byLocation || {};
                        const locEntries = ['Winscombe','Banwell','Locking'].map(loc => ({ loc, count: locs[loc] || 0 })).filter(l => l.count > 0);
                        const locTotal = locEntries.reduce((sum, l) => sum + l.count, 0) || 1;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className="text-xs text-slate-600 font-medium truncate" style={{width:160,textAlign:'right',flexShrink:0}} title={s.name}>{s.name}</div>
                            <div style={{flex:1,height:14,borderRadius:4,overflow:'hidden',background:'#f1f5f9',display:'flex',flexDirection:'row'}}>
                              {locEntries.map((l,j) => {
                                const lc = LOCATION_COLOURS[l.loc];
                                const pct = (l.count / locTotal) * 100;
                                return <div key={j} style={{width:pct+'%',height:14,backgroundColor:lc?.bg||'#94a3b8',minWidth:2,display:'block'}} title={`${l.loc}: ${l.count}`} />;
                              })}
                            </div>
                            <span className="text-xs font-bold text-slate-700" style={{minWidth:24,textAlign:'right'}}>{slotTotal}{allBooked > 0 && <span className="text-[10px] font-medium text-amber-500 ml-1">({allBooked})</span>}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </>)}
              </div>
            );
          })()}

          {/* ─── ROUTINE CAPACITY (30 days) ─── */}
          {(() => {
            const routineDays = getNDayAvailability(huddleData, hs, 30, effectiveRoutineOverrides);
            const ranges = [
              { label: '0–7 days', start: 0, end: 7 },
              { label: '8–14 days', start: 7, end: 14 },
              { label: '15–21 days', start: 14, end: 21 },
              { label: '22–28 days', start: 21, end: 28 },
            ];
            const periodGauges = ranges.map(({ label, start, end }) => {
              const slice = routineDays.slice(start, end).filter(d => d.available !== null && !d.isWeekend);
              const avail = slice.reduce((s, d) => s + (d.available || 0) + (d.embargoed || 0), 0);
              const booked = slice.reduce((s, d) => s + (d.booked || 0), 0);
              const total = avail + booked;
              const pct = total > 0 ? (avail / total) * 100 : 0;
              const colour = pct > 50 ? '#10b981' : pct >= 20 ? '#f59e0b' : '#ef4444';
              return { label, avail, booked, total, pct, colour };
            });

            return (
              <div className="rounded-xl overflow-hidden" style={{border:'1px solid #334155'}}>
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">Routine Capacity</div>
                      <div className="text-[11px] text-white/70">30-day availability overview</div>
                    </div>
                    <SlotFilter overrides={routineOverrides} setOverrides={setRoutineOverrides} knownSlotTypes={knownSlotTypes} title="Routine Slot Filter" />
                  </div>
                </div>

                {routineOverrides && Object.values(routineOverrides).every(v => !v) ? (
                  <div className="py-12 px-6 text-center">
                    <div className="text-slate-600 mb-2" style={{fontSize:32}}>↑</div>
                    <h3 className="text-base font-semibold text-slate-400 mb-1">No slots selected</h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">Open the filter above to choose which slot types to include as routine capacity.</p>
                  </div>
                ) : (<>
                {/* Booking gauges — non-overlapping weekly ranges */}
                <div className="grid grid-cols-4 divide-x divide-white/10 border-b border-white/10">
                  {periodGauges.map(g => (
                    <div key={g.label} className="flex flex-col items-center py-4 px-2">
                      <MiniGauge value={g.avail} max={g.total} size={80} strokeWidth={7} colour={g.colour}>
                        <text x="40" y="35" textAnchor="middle" fill="#e2e8f0" style={{ fontSize: '18px', fontWeight: 700 }}>{Math.round(g.pct)}%</text>
                        <text x="40" y="48" textAnchor="middle" fill="#64748b" style={{ fontSize: '9px' }}>available</text>
                      </MiniGauge>
                      <div className="text-[11px] font-semibold text-slate-300 mt-1">{g.label}</div>
                      <div className="text-[9px] text-slate-500">{g.avail} avail · {g.booked} bkd</div>
                    </div>
                  ))}
                </div>

                <TwentyEightDayChart huddleData={huddleData} huddleSettings={hs} overrides={effectiveRoutineOverrides} teamClinicians={teamClinicians} />
                </>)}
              </div>
            );
          })()}

          {/* ─── CUSTOM CAPACITY CARDS (14 days each) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {capacityCards.map(card => {
              const gradient = GRADIENT_MAP[card.colour] || GRADIENT_MAP.violet;
              const overrides = cardOverrides[card.id] || null;
              const effective = overrides || allSlotsOverrides;
              return (
                <div key={card.id} className="rounded-xl overflow-hidden group relative" style={{border:'1px solid #334155'}}>
                  <div className={`bg-gradient-to-r ${gradient} px-4 py-2.5`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white">{card.title}</div>
                        <div className="text-[10px] text-white/70">Next 14 days</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <SlotFilter overrides={overrides} setOverrides={(v) => setCardOverride(card.id, v)} knownSlotTypes={knownSlotTypes} title={`${card.title} Slots`} />
                        <button onClick={() => { if (confirm(`Remove "${card.title}" card?`)) removeCapacityCard(card.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 text-xs">✕</button>
                      </div>
                    </div>
                  </div>
                  <SevenDayStrip huddleData={huddleData} huddleSettings={hs} overrides={effective} accent={card.colour} teamClinicians={teamClinicians} hasFilter={!!overrides} />
                </div>
              );
            })}

            {/* Add card button */}
            {!showAddCard ? (
              <button onClick={() => setShowAddCard(true)}
                className="card border-2 border-dashed border-slate-300 hover:border-slate-400 flex items-center justify-center min-h-[160px] text-slate-400 hover:text-slate-600 transition-colors rounded-xl">
                <div className="text-center">
                  <div className="text-2xl mb-1">+</div>
                  <div className="text-sm font-medium">Add Capacity Card</div>
                </div>
              </button>
            ) : (
              <div className="card overflow-hidden">
                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                  <div className="text-sm font-semibold text-slate-700">New Capacity Card</div>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                    <input type="text" value={newCardTitle} onChange={e => setNewCardTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCapacityCard(); }}
                      placeholder="e.g. Mental Health, Diabetes..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" autoFocus />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Colour</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_COLOURS.map(c => (
                        <button key={c.key} onClick={() => setNewCardColour(c.key)} title={c.label}
                          className={`w-7 h-7 rounded-lg bg-gradient-to-r ${c.gradient} transition-all ${newCardColour === c.key ? 'ring-2 ring-slate-900 ring-offset-1 scale-110' : 'hover:scale-105 opacity-70 hover:opacity-100'}`} />
                      ))}
                    </div>
                  </div>
                  {/* Preview */}
                  {newCardTitle.trim() && (
                    <div className={`rounded-lg bg-gradient-to-r ${GRADIENT_MAP[newCardColour]} px-3 py-2`}>
                      <div className="text-sm font-semibold text-white">{newCardTitle.trim()}</div>
                      <div className="text-[10px] text-white/70">Next 7 days</div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button onClick={addCapacityCard} size="sm" disabled={!newCardTitle.trim()}>Add</Button>
                    <button onClick={() => { setShowAddCard(false); setNewCardTitle(''); }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>

        </>
      )}
      </div>
    </div>
  );
}
