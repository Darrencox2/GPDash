'use client';
import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Button, Card, SectionHeading } from '@/components/ui';
import { getHuddleCapacity, getTodayDateStr, parseHuddleCSV, getNDayAvailability } from '@/lib/huddle';
import SlotFilter from './SlotFilter';
import WhosInOut from './WhosInOut';

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

  // Over-target: a second ring animates past 360° with a pulsing glow
  const overExtra = overTarget ? Math.min(rawPct - 100, 30) : 0;
  const overDashOffset = circumference - (circumference * (overExtra / 100));

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
              filter: `drop-shadow(0 0 ${overTarget ? '6' : '3'}px ${colour}${overTarget ? '80' : '40'})`,
              transition: `stroke-dashoffset ${overTarget ? '1.2s' : '0.8s'} cubic-bezier(0.4, 0, 0.2, 1)`,
            }} />
        )}
        {/* Over-target: second glow ring that goes past full */}
        {overTarget && (
          <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke={colour} strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * (r + 2)}
            strokeDashoffset={inView ? (2 * Math.PI * (r + 2)) - (2 * Math.PI * (r + 2) * overExtra / 100) : 2 * Math.PI * (r + 2)}
            transform={`rotate(-90 ${cx} ${cy})`}
            opacity={0.35}
            style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.4s' }} />
        )}
        {/* Over-target pulsing glow dot at the leading edge */}
        {overTarget && inView && (
          <circle cx={cx} cy={cy - r} r={3} fill={colour} opacity={0.6}
            transform={`rotate(${(displayPct / 100) * 360 - 90 + (overExtra / 100) * 360} ${cx} ${cy})`}>
            <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
          </circle>
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full animate-slide-in-right">
        <div className="px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-white">{dateStr}</div>
            <div className="text-[10px] text-white/70">
              {cap.am.total + cap.pm.total + (cap.am.embargoed||0) + (cap.pm.embargoed||0)} available · {(cap.am.booked||0) + (cap.pm.booked||0)} booked
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {[{ label: 'Morning', sub: '08:00 – 13:00', data: cap.am, colour: 'text-amber-600', accent: 'bg-amber-50' },
            { label: 'Afternoon', sub: '13:00 – 18:30', data: cap.pm, colour: 'text-blue-600', accent: 'bg-blue-50' }].map(s => (
            <div key={s.label} className="border-b border-slate-100">
              <div className={`px-5 py-2.5 ${s.accent} flex items-center justify-between`}>
                <div>
                  <div className={`text-sm font-bold ${s.colour}`}>{s.label}</div>
                  <div className="text-[10px] text-slate-400">{s.sub}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${s.colour}`}>{s.data.total + (s.data.embargoed||0)}</span>
                  {(s.data.booked||0) > 0 && <span className="text-xs text-slate-400">({s.data.booked} bkd)</span>}
                </div>
              </div>
              <div className="px-5 py-3 space-y-1.5">
                {s.data.byClinician.length > 0 ? s.data.byClinician.map((c, i) => {
                  const matched = (teamClinicians || []).find(tc => {
                    const csvClean = cleanName(c.name);
                    const tcClean = cleanName(tc.name);
                    if (csvClean === tcClean || csvClean.includes(tcClean) || tcClean.includes(csvClean)) return true;
                    const csvWords = csvClean.split(/\s+/).filter(w => w.length > 1);
                    const tcWords = tcClean.split(/\s+/).filter(w => w.length > 1);
                    return csvWords.some(w => w === (tcWords[tcWords.length-1]||''));
                  });
                  const displayName = matched?.name || c.name;
                  const role = matched?.role || '';
                  return (
                    <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="min-w-0 mr-2">
                        <div className="text-xs font-semibold text-slate-800 truncate">{displayName}</div>
                        {role && <div className="text-[10px] text-slate-500">{role}</div>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 tabular-nums">
                        <span className={`text-sm font-bold ${s.colour}`}>{c.available}</span>
                        {(c.embargoed||0) > 0 && <span className="text-xs text-amber-500">+{c.embargoed}</span>}
                        {(c.booked||0) > 0 && <span className="text-xs text-slate-400">({c.booked})</span>}
                      </div>
                    </div>
                  );
                }) : <div className="text-center text-slate-400 text-xs py-3">No clinicians</div>}
              </div>
            </div>
          ))}
          {/* Slot type breakdown */}
          {cap.bySlotType.length > 0 && (
            <div className="px-5 py-3">
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
  console.log('[Buddy] No initials match for CSV name:', JSON.stringify(csvName), '→ cleaned:', JSON.stringify(csvClean), '→ words:', csvWords, '| Team:', clinicians.map(c => c.name + '=' + c.initials));
  return alpha.length >= 2 ? alpha.slice(0, 2).toUpperCase() : '??';
}


// ── 7-day compact bar chart strip with available/embargoed/booked ──
function SevenDayStrip({ huddleData, huddleSettings, overrides, accent = 'teal', teamClinicians }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 7, overrides), [huddleData, huddleSettings, overrides]);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const maxVal = Math.max(...days.map(d => (d.available || 0) + (d.embargoed || 0) + (d.booked || 0)), 1);
  const accentColours = {
    teal: { bar: 'bg-teal-400', emb: 'bg-teal-200', book: 'bg-slate-300', text: 'text-teal-600', glow: 'ring-teal-400/50 shadow-teal-400/20' },
    violet: { bar: 'bg-violet-400', emb: 'bg-violet-200', book: 'bg-slate-300', text: 'text-violet-600', glow: 'ring-violet-400/50 shadow-violet-400/20' },
    sky: { bar: 'bg-sky-400', emb: 'bg-sky-200', book: 'bg-slate-300', text: 'text-sky-600', glow: 'ring-sky-400/50 shadow-sky-400/20' },
    rose: { bar: 'bg-rose-400', emb: 'bg-rose-200', book: 'bg-slate-300', text: 'text-rose-600', glow: 'ring-rose-400/50 shadow-rose-400/20' },
    indigo: { bar: 'bg-indigo-400', emb: 'bg-indigo-200', book: 'bg-slate-300', text: 'text-indigo-600', glow: 'ring-indigo-400/50 shadow-indigo-400/20' },
    amber: { bar: 'bg-amber-400', emb: 'bg-amber-200', book: 'bg-slate-300', text: 'text-amber-600', glow: 'ring-amber-400/50 shadow-amber-400/20' },
    lime: { bar: 'bg-lime-400', emb: 'bg-lime-200', book: 'bg-slate-300', text: 'text-lime-600', glow: 'ring-lime-400/50 shadow-lime-400/20' },
    fuchsia: { bar: 'bg-fuchsia-400', emb: 'bg-fuchsia-200', book: 'bg-slate-300', text: 'text-fuchsia-600', glow: 'ring-fuchsia-400/50 shadow-fuchsia-400/20' },
    cyan: { bar: 'bg-cyan-400', emb: 'bg-cyan-200', book: 'bg-slate-300', text: 'text-cyan-600', glow: 'ring-cyan-400/50 shadow-cyan-400/20' },
    emerald: { bar: 'bg-emerald-400', emb: 'bg-emerald-200', book: 'bg-slate-300', text: 'text-emerald-600', glow: 'ring-emerald-400/50 shadow-emerald-400/20' },
  };
  const ac = accentColours[accent] || accentColours.teal;

  return (
    <div className="p-4">
      <div className="flex items-end gap-1.5 relative" style={{ height: 100 }}>
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null;
          const avail = d.available || 0;
          const emb = d.embargoed || 0;
          const book = d.booked || 0;
          const total = avail + emb + book;
          const totalPct = hasData && total > 0 ? Math.max(12, (total / maxVal) * 100) : 0;
          const isHovered = hoveredIdx === i;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5 relative"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => hasData && total > 0 && setSelectedDay(d.date)}>
              {hasData && total > 0 && (
                <div className={`text-[10px] font-bold transition-all duration-150 ${isToday ? 'text-slate-800' : isHovered ? ac.text + ' scale-110' : ac.text}`}>
                  {avail}{emb > 0 && <span className="text-slate-400">+{emb}</span>}
                </div>
              )}
              <div className={`w-full rounded-t-md overflow-hidden cursor-pointer transition-all duration-200 ${isToday ? 'ring-2 ring-slate-900 z-10' : ''} ${isHovered ? `ring-2 ${ac.glow} shadow-lg scale-x-110 z-10` : ''}`}
                style={{ height: hasData ? `${totalPct}%` : '8%', minHeight: 3 }}>
                {hasData && total > 0 ? (
                  <div className={`w-full h-full flex flex-col justify-end transition-all duration-200 ${isHovered ? 'brightness-110' : ''}`}>
                    {avail > 0 && <div className={`${ac.bar} opacity-80`} style={{ height: `${(avail / total) * 100}%` }} />}
                    {emb > 0 && <div className={ac.emb} style={{ height: `${(emb / total) * 100}%` }} />}
                    {book > 0 && <div className={ac.book} style={{ height: `${(book / total) * 100}%` }} />}
                  </div>
                ) : (
                  <div className="w-full h-full bg-slate-200" />
                )}
              </div>
              <div className={`text-[9px] font-medium mt-0.5 ${isToday ? 'text-slate-900 font-bold' : 'text-slate-400'}`}>{d.dayName}</div>
              {/* Hover tooltip */}
              {isHovered && hasData && total > 0 && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 bg-slate-900 text-white rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap pointer-events-none animate-fade-in" style={{ minWidth: '100px' }}>
                  <div className="text-[11px] font-bold mb-0.5">{d.dayName}</div>
                  <div className="space-y-0.5 text-[10px]">
                    <div className="flex justify-between gap-3"><span>Available</span><span className="font-semibold">{avail}</span></div>
                    {emb > 0 && <div className="flex justify-between gap-3"><span>Embargoed</span><span className="font-semibold">{emb}</span></div>}
                    {book > 0 && <div className="flex justify-between gap-3"><span>Booked</span><span className="font-semibold">{book}</span></div>}
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1"><div className={`w-2 h-2 rounded-sm ${ac.bar}`} /><span className="text-[10px] text-slate-500">Available</span></div>
        <div className="flex items-center gap-1"><div className={`w-2 h-2 rounded-sm ${ac.emb}`} /><span className="text-[10px] text-slate-500">Embargoed</span></div>
        <div className="flex items-center gap-1"><div className={`w-2 h-2 rounded-sm ${ac.book}`} /><span className="text-[10px] text-slate-500">Booked</span></div>
      </div>
      {selectedDay && <CapacityDayPanel dateStr={selectedDay} huddleData={huddleData} huddleSettings={huddleSettings} overrides={overrides} teamClinicians={teamClinicians} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}

// ── 28-day graphical routine capacity with hover glow + tooltip ──
function TwentyEightDayChart({ huddleData, huddleSettings, overrides, teamClinicians }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 28, overrides), [huddleData, huddleSettings, overrides]);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const maxVal = Math.max(...days.map(d => (d.available || 0) + (d.embargoed || 0) + (d.booked || 0)), 1);
  const totalAvail = days.reduce((sum, d) => sum + (d.available || 0), 0);
  const totalEmb = days.reduce((sum, d) => sum + (d.embargoed || 0), 0);
  const totalBooked = days.reduce((sum, d) => sum + (d.booked || 0), 0);

  const weeks = [];
  for (let i = 0; i < days.length; i += 5) weeks.push(days.slice(i, i + 5));

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500">Next 28 weekdays</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-emerald-700">{totalAvail} avail</span>
          {totalEmb > 0 && <span className="font-semibold text-amber-600">{totalEmb} emb</span>}
          {totalBooked > 0 && <span className="font-semibold text-slate-500">{totalBooked} booked</span>}
        </div>
      </div>
      <div className="flex items-end gap-px relative" style={{ height: 130 }}>
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null;
          const avail = d.available || 0;
          const emb = d.embargoed || 0;
          const book = d.booked || 0;
          const total = avail + emb + book;
          const pct = hasData && total > 0 ? Math.max(6, (total / maxVal) * 100) : 0;
          const isMonday = d.dayName === 'Mon';
          const isHovered = hoveredIdx === i;
          return (
            <div key={i}
              className={`flex-1 flex flex-col items-center justify-end h-full relative ${isMonday && i > 0 ? 'ml-1.5 pl-1.5 border-l border-slate-200' : ''}`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => hasData && total > 0 && setSelectedDay(d.date)}>
              {/* Number above bar */}
              {hasData && total > 0 && (
                <div className={`text-[10px] font-bold transition-all duration-150 ${isToday ? 'text-slate-800' : isHovered ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {avail}{emb > 0 && <span className="text-amber-500">+{emb}</span>}
                </div>
              )}
              {/* Bar */}
              <div className={`w-full rounded-t overflow-hidden cursor-pointer transition-all duration-200 ${isToday ? 'ring-2 ring-slate-900 z-10' : ''} ${isHovered ? 'ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-400/20 scale-x-110 z-10' : ''}`}
                style={{ height: hasData ? `${pct}%` : '4%', minHeight: 2 }}>
                {!hasData ? (
                  <div className="w-full h-full bg-slate-100" />
                ) : total === 0 ? (
                  <div className="w-full h-full bg-red-200" />
                ) : (
                  <div className={`w-full h-full flex flex-col justify-end transition-all duration-200 ${isHovered ? 'brightness-110' : ''}`}>
                    {avail > 0 && <div className="bg-emerald-400" style={{ height: `${(avail / total) * 100}%` }} />}
                    {emb > 0 && <div className="bg-amber-300" style={{ height: `${(emb / total) * 100}%` }} />}
                    {book > 0 && <div className="bg-slate-300" style={{ height: `${(book / total) * 100}%` }} />}
                  </div>
                )}
              </div>
              {/* Hover tooltip */}
              {isHovered && hasData && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 bg-slate-900 text-white rounded-lg px-3 py-2 shadow-xl whitespace-nowrap pointer-events-none animate-fade-in" style={{ minWidth: '120px' }}>
                  <div className="text-[11px] font-bold mb-1">{d.dayName} {d.dayNum} {d.monthShort}</div>
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between gap-3 text-[10px]">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Available</span>
                      <span className="font-semibold">{avail}</span>
                    </div>
                    {emb > 0 && (
                      <div className="flex items-center justify-between gap-3 text-[10px]">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-300" />Embargoed</span>
                        <span className="font-semibold">{emb}</span>
                      </div>
                    )}
                    {book > 0 && (
                      <div className="flex items-center justify-between gap-3 text-[10px]">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Booked</span>
                        <span className="font-semibold">{book}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 text-[10px] pt-0.5 border-t border-white/20">
                      <span>Total</span>
                      <span className="font-bold">{total}</span>
                    </div>
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Week labels */}
      <div className="flex gap-px mt-1">
        {weeks.map((week, wi) => (
          <div key={wi} className={`flex gap-px ${wi > 0 ? 'ml-1.5 pl-1.5 border-l border-slate-200' : ''}`} style={{ flex: week.length }}>
            {week.map((d, di) => (
              <div key={di} className="flex-1 text-center">
                <div className={`text-[8px] ${di === 0 ? 'text-slate-500 font-medium' : 'text-slate-300'}`}>
                  {di === 0 ? `${d.dayNum}` : ''}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Week range labels */}
      <div className="flex gap-px mt-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className={`text-center ${wi > 0 ? 'ml-1.5 pl-1.5' : ''}`} style={{ flex: week.length }}>
            <div className="text-[9px] text-slate-400 font-medium">
              {wi === 0 ? '0–7 days' : wi === 1 ? '8–14 days' : wi === 2 ? '15–21 days' : wi === 3 ? '22–28 days' : ''}
            </div>
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-400" /><span className="text-[10px] text-slate-500">Available</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber-300" /><span className="text-[10px] text-slate-500">Embargoed</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-slate-300" /><span className="text-[10px] text-slate-500">Booked</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-slate-100" /><span className="text-[10px] text-slate-500">No data</span></div>
      </div>
      {selectedDay && <CapacityDayPanel dateStr={selectedDay} huddleData={huddleData} huddleSettings={huddleSettings} overrides={overrides} teamClinicians={teamClinicians} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function HuddleToday({ data, saveData, toast, huddleData, setHuddleData, huddleMessages, setHuddleMessages }) {
  const [newMsg, setNewMsg] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
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
      saveData({ ...data, huddleCsvData: parsed, huddleCsvUploadedAt: uploadTime, huddleSettings: newHs }, false);
      toast('Report uploaded successfully', 'success');
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

  const isUploadedToday = data?.huddleCsvUploadedAt ? new Date(data.huddleCsvUploadedAt).toDateString() === new Date().toDateString() : false;
  const todayStr = getTodayDateStr();
  const displayDate = huddleData?.dates?.includes(todayStr) ? todayStr : huddleData?.dates?.[0];
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs, urgentOverrides) : null;

  // Build initial overrides for urgent filter from the urgent slot categories
  const urgentInitialOverrides = useMemo(() => {
    const urgentSlots = hs?.slotCategories?.urgent || [];
    if (urgentSlots.length === 0) return null; // no urgent config, fall back to all-true default
    const o = {};
    (knownSlotTypes || []).forEach(s => { o[s] = urgentSlots.includes(s); });
    // Also include any live slot types
    if (huddleData?.allSlotTypes) huddleData.allSlotTypes.forEach(s => { if (o[s] === undefined) o[s] = urgentSlots.includes(s); });
    return o;
  }, [hs?.slotCategories?.urgent, knownSlotTypes, huddleData?.allSlotTypes]);

  return (
    <div className="space-y-6 animate-in" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragging(true); } }} onDragLeave={e => { e.preventDefault(); setIsDragging(false); }} onDrop={e => { if (e.dataTransfer.types.includes('Files')) { onDrop(e); } }}>
      {isDragging && (
        <div className="fixed inset-0 z-40 bg-teal-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center border-2 border-dashed border-teal-400">
            <div className="text-4xl mb-2">📊</div>
            <div className="text-lg font-semibold text-slate-900">Drop CSV here</div>
          </div>
        </div>
      )}

      {/* Today header — Style C */}
      <div className="card overflow-hidden">
        <div className="flex">
          <div className="bg-emerald-500 px-5 py-4 flex flex-col items-center justify-center min-w-[90px]">
            <div className="text-3xl font-extrabold text-white leading-none">{new Date().getDate()}</div>
            <div className="text-xs font-semibold text-white/80 uppercase mt-0.5">{new Date().toLocaleDateString('en-GB', { month: 'short' })}</div>
          </div>
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex-1 px-5 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Today</h1>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-sm text-slate-300">{new Date().toLocaleDateString('en-GB', { weekday: 'long' })}</span>
                {data?.huddleCsvUploadedAt && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-500" />
                    <span className="text-xs text-slate-400">Report uploaded {new Date(data.huddleCsvUploadedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  </>
                )}
              </div>
            </div>
            <div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
              <Button variant={isUploadedToday ? 'upload_fresh' : 'upload_stale'} onClick={() => fileRef.current?.click()}>
                {isUploadedToday ? '✓ Upload Report' : '⚠ Upload Report'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {error && <Card className="p-4 bg-red-50 border-red-200 text-red-700 text-sm">{error}</Card>}

      {/* NOTICEBOARD */}
      <div className="card overflow-hidden border-red-200">
        <div className="bg-red-50 px-5 py-3 border-b border-red-200">
          <div className="text-sm font-semibold text-red-800">📌 Noticeboard</div>
        </div>
        <div className="p-4 space-y-3">
          {huddleMessages.length === 0 && <p className="text-sm text-slate-400 text-center py-2">No messages yet.</p>}
          {huddleMessages.map((msg, i) => (
            <div key={msg.id || i} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800">{msg.text}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {msg.author && <span className="font-medium text-slate-500">{msg.author}</span>}
                  {msg.author && msg.addedAt && ' · '}
                  {msg.addedAt && new Date(msg.addedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => removeMessage(i)} className="text-xs text-slate-400 hover:text-red-500 p-1">✕</button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input type="text" value={newAuthor} onChange={e => setNewAuthor(e.target.value)} placeholder="Your name" className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addMessage(); }} placeholder="Add a message..." className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <Button onClick={addMessage} size="sm">Add</Button>
          </div>
        </div>
      </div>

      {/* WHO'S IN / OUT */}
      <WhosInOut data={data} saveData={saveData} huddleData={huddleData} />

      {/* ═══ DATA-DRIVEN SECTIONS ═══ */}
      {!huddleData ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Upload Appointment Report</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload or drag-and-drop your EMIS CSV to see urgent capacity.</p>
          <Button onClick={() => fileRef.current?.click()}>Select CSV File</Button>
        </div>
      ) : capacity && (
        <>
          {/* ─── URGENT ON THE DAY ─── */}
          {(() => {
            // For urgent on-the-day, embargoed slots release during the day so count as available
            const urgentAm = capacity.am.total + (capacity.am.embargoed || 0);
            const urgentPm = capacity.pm.total + (capacity.pm.embargoed || 0);
            const bookedAm = capacity.am.booked || 0;
            const bookedPm = capacity.pm.booked || 0;
            const urgentTotal = urgentAm + urgentPm;
            const bookedTotal = bookedAm + bookedPm;
            const grandTotal = urgentTotal + bookedTotal;

            // Get expected target for today from settings
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const todayDayName = dayNames[new Date().getDay()];
            const expectedAm = hs.expectedCapacity?.[todayDayName]?.am || 0;
            const expectedPm = hs.expectedCapacity?.[todayDayName]?.pm || 0;
            const expectedTotal = expectedAm + expectedPm;
            const hasTarget = expectedTotal > 0;

            // Raw percentages (can exceed 100)
            const rawPctTotal = hasTarget ? (urgentTotal / expectedTotal) * 100 : (grandTotal > 0 ? (urgentTotal / grandTotal) * 100 : 0);
            const rawPctAm = expectedAm > 0 ? (urgentAm / expectedAm) * 100 : (urgentAm + bookedAm > 0 ? (urgentAm / (urgentAm + bookedAm)) * 100 : 0);
            const rawPctPm = expectedPm > 0 ? (urgentPm / expectedPm) * 100 : (urgentPm + bookedPm > 0 ? (urgentPm / (urgentPm + bookedPm)) * 100 : 0);

            const pctColour = (p) => p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444';

            return (
              <div className="card overflow-hidden">
                <div className="bg-gradient-to-r from-red-600 to-rose-600 px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">Urgent on the Day</div>
                      <div className="text-[11px] text-white/70">Available urgent capacity{displayDate !== todayStr ? ` (${displayDate})` : ''}</div>
                    </div>
                    <SlotFilter overrides={urgentOverrides} setOverrides={setUrgentOverrides} knownSlotTypes={knownSlotTypes} title="Urgent Slot Filter" initialOverrides={urgentInitialOverrides} />
                  </div>
                </div>

                {displayDate !== todayStr && (
                  <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm flex items-center gap-2">⚠️ Today not found in report. Showing {displayDate}.</div>
                )}

                {/* Main gauge row: AM + Total + PM */}
                <div className="flex items-center justify-center gap-6 md:gap-10 py-6 px-4 border-b border-slate-100">
                  {/* AM gauge */}
                  <MiniGauge value={urgentAm} max={expectedAm || (urgentAm + bookedAm)} size={100} strokeWidth={8} colour={pctColour(rawPctAm)}>
                    <text x="50" y="44" textAnchor="middle" fill="#1e293b" style={{ fontSize: '24px', fontWeight: 700 }}>{urgentAm}</text>
                    <text x="50" y="58" textAnchor="middle" fill="#94a3b8" style={{ fontSize: '10px' }}>Morning</text>
                    {hasTarget && expectedAm > 0 && <text x="50" y="70" textAnchor="middle" fill={pctColour(rawPctAm)} style={{ fontSize: '9px', fontWeight: 600 }}>{Math.round(rawPctAm)}%</text>}
                  </MiniGauge>

                  {/* Total gauge (larger) */}
                  <MiniGauge value={urgentTotal} max={expectedTotal || grandTotal} size={170} strokeWidth={14} colour={pctColour(rawPctTotal)}>
                    <text x="85" y="72" textAnchor="middle" fill="#1e293b" style={{ fontSize: '46px', fontWeight: 700 }}>{urgentTotal}</text>
                    <text x="85" y="92" textAnchor="middle" fill="#94a3b8" style={{ fontSize: '12px' }}>available</text>
                    {hasTarget && <text x="85" y="106" textAnchor="middle" fill={pctColour(rawPctTotal)} style={{ fontSize: '11px', fontWeight: 600 }}>{Math.round(rawPctTotal)}% of {expectedTotal}</text>}
                    {bookedTotal > 0 && <text x="85" y={hasTarget ? 120 : 106} textAnchor="middle" fill="#94a3b8" style={{ fontSize: '10px' }}>{bookedTotal} booked</text>}
                  </MiniGauge>

                  {/* PM gauge */}
                  <MiniGauge value={urgentPm} max={expectedPm || (urgentPm + bookedPm)} size={100} strokeWidth={8} colour={pctColour(rawPctPm)}>
                    <text x="50" y="44" textAnchor="middle" fill="#1e293b" style={{ fontSize: '24px', fontWeight: 700 }}>{urgentPm}</text>
                    <text x="50" y="58" textAnchor="middle" fill="#94a3b8" style={{ fontSize: '10px' }}>Afternoon</text>
                    {hasTarget && expectedPm > 0 && <text x="50" y="70" textAnchor="middle" fill={pctColour(rawPctPm)} style={{ fontSize: '9px', fontWeight: 600 }}>{Math.round(rawPctPm)}%</text>}
                  </MiniGauge>
                </div>

                {/* AM / PM clinician breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  {[{ label: 'Morning', data: capacity.am, colour: 'text-amber-600' },
                    { label: 'Afternoon', data: capacity.pm, colour: 'text-blue-600' }].map(s => {
                    const sessionTotal = s.data.total + (s.data.embargoed || 0);
                    return (
                      <div key={s.label} className="p-5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-bold text-slate-900">{s.label}</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${s.colour}`}>{sessionTotal}</span>
                            {(s.data.booked || 0) > 0 && <span className="text-xs text-slate-400">({s.data.booked} bkd)</span>}
                          </div>
                        </div>
                        {s.data.byClinician.length > 0 ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            {s.data.byClinician.map((c, i) => {
                              const matched = teamClinicians.find(tc => {
                                const csvClean = cleanName(c.name);
                                const tcClean = cleanName(tc.name);
                                if (csvClean === tcClean || csvClean.includes(tcClean) || tcClean.includes(csvClean)) return true;
                                const csvWords = csvClean.split(/\s+/).filter(w => w.length > 1);
                                const tcWords = tcClean.split(/\s+/).filter(w => w.length > 1);
                                const tcSurname = tcWords[tcWords.length - 1] || '';
                                return csvWords.some(w => w === tcSurname);
                              });
                              const displayName = matched?.name || c.name;
                              const role = matched?.role || '';
                              const roleColour = ROLE_COLOURS[role] || 'bg-slate-50 border-slate-200';
                              const clinicianTotal = c.available + (c.embargoed || 0);
                              return (
                                <div key={i} className={`flex items-center justify-between py-2 px-3 rounded-lg border ${roleColour}`} title={c.name}>
                                  <div className="min-w-0 mr-2">
                                    <div className="text-xs font-semibold text-slate-800 truncate">{displayName}</div>
                                    {role && <div className="text-[10px] text-slate-500 truncate">{role}</div>}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className={`text-sm font-bold tabular-nums ${s.colour}`}>{clinicianTotal}</span>
                                    {(c.booked || 0) > 0 && <span className="text-[10px] text-slate-400 tabular-nums">({c.booked})</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : <div className="text-center text-slate-400 text-sm py-3">No capacity</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Slot type breakdown (integrated) */}
                {capacity.bySlotType.length > 0 && (
                  <div className="border-t border-slate-200">
                    <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-100"><div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">By Slot Type</div></div>
                    <div className="px-5 py-3">
                      <table className="w-full text-sm">
                        <thead><tr className="text-xs text-slate-400 uppercase">
                          <th className="text-left py-1 font-medium">Slot Type</th>
                          <th className="text-right py-1 font-medium w-20">AM</th>
                          <th className="text-right py-1 font-medium w-20">PM</th>
                          <th className="text-right py-1 font-medium w-20">Total</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-50">
                          {capacity.bySlotType.map((s, i) => {
                            const amAvail = (s.am || 0) + (s.amEmb || 0);
                            const pmAvail = (s.pm || 0) + (s.pmEmb || 0);
                            const totalAvail = amAvail + pmAvail;
                            return (
                              <tr key={i}>
                                <td className="py-1.5 text-slate-600 text-xs">{s.name}</td>
                                <td className="py-1.5 text-right"><span className="text-amber-600 font-medium text-xs">{amAvail || '–'}</span>{(s.amBook || 0) > 0 && <span className="text-slate-400 text-[10px] ml-1">({s.amBook})</span>}</td>
                                <td className="py-1.5 text-right"><span className="text-blue-600 font-medium text-xs">{pmAvail || '–'}</span>{(s.pmBook || 0) > 0 && <span className="text-slate-400 text-[10px] ml-1">({s.pmBook})</span>}</td>
                                <td className="py-1.5 text-right"><span className="font-semibold text-slate-800 text-xs">{totalAvail}</span>{((s.totalBook || 0)) > 0 && <span className="text-slate-400 text-[10px] ml-1">({s.totalBook})</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ─── ROUTINE CAPACITY (28 days) ─── */}
          {(() => {
            const routineDays = getNDayAvailability(huddleData, hs, 28, effectiveRoutineOverrides);
            const ranges = [
              { label: '0–7 days', start: 0, end: 7 },
              { label: '8–14 days', start: 7, end: 14 },
              { label: '15–21 days', start: 14, end: 21 },
              { label: '22–28 days', start: 21, end: 28 },
            ];
            const periodGauges = ranges.map(({ label, start, end }) => {
              const slice = routineDays.slice(start, end).filter(d => d.available !== null);
              const avail = slice.reduce((s, d) => s + (d.available || 0) + (d.embargoed || 0), 0);
              const booked = slice.reduce((s, d) => s + (d.booked || 0), 0);
              const total = avail + booked;
              const pct = total > 0 ? (avail / total) * 100 : 0;
              const colour = pct > 50 ? '#10b981' : pct >= 20 ? '#f59e0b' : '#ef4444';
              return { label, avail, booked, total, pct, colour };
            });

            return (
              <div className="card overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">Routine Capacity</div>
                      <div className="text-[11px] text-white/70">28-day availability overview</div>
                    </div>
                    <SlotFilter overrides={routineOverrides} setOverrides={setRoutineOverrides} knownSlotTypes={knownSlotTypes} title="Routine Slot Filter" />
                  </div>
                </div>

                {/* Booking gauges — non-overlapping weekly ranges */}
                <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                  {periodGauges.map(g => (
                    <div key={g.label} className="flex flex-col items-center py-4 px-2">
                      <MiniGauge value={g.avail} max={g.total} size={80} strokeWidth={7} colour={g.colour}>
                        <text x="40" y="35" textAnchor="middle" fill="#1e293b" style={{ fontSize: '18px', fontWeight: 700 }}>{Math.round(g.pct)}%</text>
                        <text x="40" y="48" textAnchor="middle" fill="#94a3b8" style={{ fontSize: '9px' }}>available</text>
                      </MiniGauge>
                      <div className="text-[11px] font-semibold text-slate-700 mt-1">{g.label}</div>
                      <div className="text-[9px] text-slate-400">{g.avail} avail · {g.booked} bkd</div>
                    </div>
                  ))}
                </div>

                <TwentyEightDayChart huddleData={huddleData} huddleSettings={hs} overrides={effectiveRoutineOverrides} teamClinicians={teamClinicians} />
              </div>
            );
          })()}

          {/* ─── CUSTOM CAPACITY CARDS (7 days each) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {capacityCards.map(card => {
              const gradient = GRADIENT_MAP[card.colour] || GRADIENT_MAP.violet;
              const overrides = cardOverrides[card.id] || null;
              const effective = overrides || allSlotsOverrides;
              return (
                <div key={card.id} className="card overflow-hidden group relative">
                  <div className={`bg-gradient-to-r ${gradient} px-4 py-2.5`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white">{card.title}</div>
                        <div className="text-[10px] text-white/70">Next 7 days</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <SlotFilter overrides={overrides} setOverrides={(v) => setCardOverride(card.id, v)} knownSlotTypes={knownSlotTypes} title={`${card.title} Slots`} />
                        <button onClick={() => { if (confirm(`Remove "${card.title}" card?`)) removeCapacityCard(card.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 text-xs">✕</button>
                      </div>
                    </div>
                  </div>
                  <SevenDayStrip huddleData={huddleData} huddleSettings={hs} overrides={effective} accent={card.colour} teamClinicians={teamClinicians} />
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

          {!hs?.slotCategories?.urgent?.length && (
            <Card className="p-4 bg-amber-50 border-amber-200">
              <div className="flex items-start gap-3"><span className="text-lg">⚠️</span><div><div className="text-sm font-medium text-amber-800">Configure Urgent Slot Types</div><p className="text-xs text-amber-700 mt-1">Go to Huddle → Settings to define which slot types count as urgent capacity.</p></div></div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
