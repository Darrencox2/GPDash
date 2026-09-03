'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { EmptyState } from '@/components/ui';
import { getHuddleCapacity, getDateTotals, getDutyDoctor, getSiteColour } from '@/lib/huddle';
import { matchesStaffMember, toLocalIso, toHuddleDateStr } from '@/lib/data';
import { predictDemand, getWeatherForecast } from '@/lib/demandPredictor';
import { getSchoolHolidaysForLEA } from '@/lib/school-holidays-by-lea';
import { detectPatterns } from '@/lib/capacity-patterns';
import ClinicianCapacity from './ClinicianCapacity';
import SlotFilter from './SlotFilter';
import { canEditPracticeData } from '@/lib/permissions';
import { getSiteStaffingForDate, computeTotalEntry, STAFF_GROUP_LABELS, STATE_COLOURS } from '@/lib/site-staffing';
import CapacityWeek from './CapacityWeek';
import { createClient } from '@/utils/supabase/client';
import { onKeyActivate } from '@/lib/a11y';
import { promptDialog } from '@/components/ui';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// The first week from which every remaining week has no export data, or -1.
// Bank holidays do not count against a week: a week that is a bank holiday
// plus four unexported days is still unexported.
function trailingBlankFrom(weeks) {
  let from = -1;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const blank = weeks[i].days.every((d) => d.isBH || !d.hasData);
    if (!blank) break;
    from = i;
  }
  return from;
}
// The last day the export covers, as a Date, or null.
function lastExportedDay(weeks) {
  let last = null;
  for (const wk of weeks) for (const d of wk.days) if (d.hasData) last = d.date;
  return last;
}
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
// Tile fills. The vivid 500-weights (#3b82f6 / #10b981 / #f59e0b / #ef4444)
// put white text at 3.68, 2.54, 2.15 and 3.76:1 — all under the 4.5:1 AA
// floor, on the numbers this whole screen exists to communicate. These are
// the darkest-but-one shades that clear it: 5.17, 5.48, 5.02 and 4.83:1.
//
// `short` used to carry a diagonal stripe as a non-colour cue. It collided
// with the hatch meaning "booked" on the Today charts — same texture,
// opposite meanings, one click apart — and confused the person who reads
// this daily. The cue is now a −N deficit printed on the tile (see
// `deficit` below), which says more than any texture could.
//
// `bg`/`text` are the tile (white on a dark fill). `fg` is the SAME state
// rendered as text directly on the dark card — the pale variants, because a
// fill dark enough for white text is far too dark to read as type.
const VB = {
  over:  { bg:'#2563eb', text:'#fff', fg:'var(--c-blue)' },
  good:  { bg:'#047857', text:'#fff', fg:'var(--c-mint)' },
  tight: { bg:'#b45309', text:'#fff', fg:'var(--c-amber)' },
  short: { bg:'#dc2626', text:'#fff', fg:'var(--c-red)', deficit: true },
  none:  { bg:'var(--g-text-faint)', text:'var(--g-text-mid)', fg:'var(--meta)' },
};
function vBand(s,t) { if(t<=0)return VB.none; const p=(s/t)*100; return p>=120?VB.over:p>=90?VB.good:p>=80?VB.tight:VB.short; }

// DOW-relative demand colouring. Caller passes the per-practice dow-specific
// baseline (computed from the practice's own demand_settings if calibrated,
// or the list-size-scaled fallback if not). Earlier this used the raw
// Winscombe-shaped BASELINE + DOW_EFFECTS constants for every practice.
function dowDemandColour(predicted, dowBaseline) {
  if (!predicted || !dowBaseline || dowBaseline <= 0) return { bg: 'var(--g-text-faint)', text: '#fff', label: '–' };
  const ratio = predicted / dowBaseline;
  if (ratio <= 0.9) return { bg: '#0ea5e9', text: '#fff', label: 'Low' };
  // OPTION A: demand no longer competes with capacity for the red-amber-green
  // palette. It is a neutral chip carrying a DIRECTION, so a busy day reads as
  // "more than usual" rather than as a verdict about whether you can cope —
  // which is what the tiles are for. `mark` is the non-colour cue.
  if (ratio <= 1.1) return { bg: 'var(--g-tile)', text: 'var(--g-text-hi)', fg: 'var(--g-text-hi)', border: 'var(--g-border-2)', mark: '', label: 'Normal' };
  if (ratio <= 1.25) return { bg: 'var(--g-tile)', text: 'var(--g-text-hi)', fg: 'var(--g-text-hi)', border: 'var(--g-border-2)', mark: '\u2191', label: 'High' };
  return { bg: 'var(--g-tile)', text: 'var(--g-text-hi)', fg: 'var(--g-text-hi)', border: 'var(--g-border-2)', mark: '\u2191\u2191', label: 'V.High' };
}

// PredictionBand — sits at the top of the day-detail panel and explains
// the demand prediction for that date. Pulls from pred.factors to list
// the biggest contributors (e.g. "Mondays +12, school holiday +8") so a
// number like "Predicted 87 — HIGH" doesn't appear as a black box.
//
// Skipped entirely on bank holidays (no prediction is run) and on days
// with no prediction (pred = null, e.g. far-future weekends).
function PredictionBand({ day, convRate }) {
  if (!day || day.isBH || !day.pred?.predicted) return null;
  const pred = day.pred;
  const predicted = Math.round(pred.predicted);
  const needed = Math.round(predicted * (convRate || 0.25));
  const dc = day.dc;
  const conf = pred.confidence;
  const confLow = conf?.low ? Math.round(conf.low) : null;
  const confHigh = conf?.high ? Math.round(conf.high) : null;

  // Pull the top-3 contributing factors by absolute effect size. We skip
  // the baseline itself (always present and not "informative") and skip
  // the dayOfWeek factor when the user is already looking at e.g. a
  // Tuesday (it's tautological). Sort by |effect| descending.
  const factorEntries = [];
  const f = pred.factors || {};
  if (f.dayOfWeek?.effect) factorEntries.push({ label: f.dayOfWeek.day || 'Day of week', effect: f.dayOfWeek.effect });
  if (f.month?.effect) factorEntries.push({ label: 'Time of year', effect: f.month.effect });
  if (f.schoolHoliday) factorEntries.push({ label: 'School holiday', effect: f.schoolHoliday });
  if (f.firstWeekBack) factorEntries.push({ label: 'First week back', effect: f.firstWeekBack });
  if (f.firstDayBack) factorEntries.push({ label: 'First day back from break', effect: f.firstDayBack });
  if (f.secondDayBack) factorEntries.push({ label: 'Second day back', effect: f.secondDayBack });
  if (f.nearBankHoliday) factorEntries.push({ label: `Near bank holiday (${f.nearBankHoliday.daysAway}d)`, effect: f.nearBankHoliday.effect });
  if (f.christmasPeriod) factorEntries.push({ label: 'Christmas period', effect: f.christmasPeriod });
  if (f.endOfMonth) factorEntries.push({ label: 'End of month', effect: f.endOfMonth });
  if (f.shortWeek?.effect) factorEntries.push({ label: `Short week (${f.shortWeek.workingDays}d)`, effect: f.shortWeek.effect });
  if (f.weather?.effect) factorEntries.push({ label: f.weather.label || 'Weather', effect: f.weather.effect });
  if (f.heavyRain?.effect) factorEntries.push({ label: 'Heavy rain', effect: f.heavyRain.effect });
  if (f.postRainRebound?.effect) factorEntries.push({ label: 'Post-rain rebound', effect: f.postRainRebound.effect });
  if (f.mediaOverride?.effect) factorEntries.push({ label: f.mediaOverride.label || 'Media event', effect: f.mediaOverride.effect });
  factorEntries.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const topFactors = factorEntries.slice(0, 3);

  return (
    <div className="px-5 py-3" style={{ background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
      <div className="flex items-center gap-4 flex-wrap">
        {/* Headline number + band */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono-data text-2xl font-bold" style={{ color: dc.fg || dc.bg }}>{predicted}</span>
          <span className="text-[11px] text-slate-400 uppercase tracking-wider">predicted</span>
          <span className="text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: dc.bg, color: dc.text, border: `1px solid ${dc.border || 'transparent'}` }}>{dc.mark ? `${dc.mark} ` : ''}{dc.label}</span>
        </div>
        {/* Conversion-implied urgent need */}
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono-data text-base font-bold text-amber-400">{needed}</span>
          <span className="text-[11px] text-slate-400">urgent slots needed</span>
        </div>
        {/* Confidence band */}
        {confLow !== null && confHigh !== null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-slate-400">range</span>
            <span className="font-mono-data text-xs text-slate-400">{confLow}–{confHigh}</span>
          </div>
        )}
        {/* Fallback warning — practice hasn't calibrated its model */}
        {pred.usingFallback && (
          <span className="text-[11px] text-amber-400 italic">estimate (no calibration)</span>
        )}
      </div>
      {/* Top factors row */}
      {topFactors.length > 0 && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider">Drivers:</span>
          {topFactors.map((tf, i) => {
            const sign = tf.effect > 0 ? '+' : '';
            const colour = tf.effect > 0 ? 'var(--c-amber-2)' : 'var(--c-green-2)';
            return (
              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border)' }}>
                <span className="text-slate-400">{tf.label}</span>
                <span className="ml-1 font-mono-data font-bold" style={{ color: colour }}>{sign}{Math.round(tf.effect)}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DonutGauge({ avail, emb, booked }) {
  const total = avail + emb + booked;
  if (total === 0) return <div className="text-xs text-slate-400 text-center py-4">No routine data</div>;
  const r = 30, c = 2 * Math.PI * r;
  const aLen = (avail/total)*c, eLen = (emb/total)*c, bLen = (booked/total)*c;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 80 80" style={{width:68,height:68,flexShrink:0}}>
        <circle cx="40" cy="40" r={r} fill="none" style={{stroke:'var(--g-divider)'}} strokeWidth="8"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#10b981" strokeWidth="8" strokeDasharray={`${aLen} ${c}`} strokeDashoffset="0" transform="rotate(-90 40 40)"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#f59e0b" strokeWidth="8" strokeDasharray={`${eLen} ${c}`} strokeDashoffset={`${-aLen}`} transform="rotate(-90 40 40)"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#ef4444" strokeWidth="8" strokeDasharray={`${bLen} ${c}`} strokeDashoffset={`${-(aLen+eLen)}`} transform="rotate(-90 40 40)"/>
        <text x="40" y="38" textAnchor="middle" style={{fill:'var(--g-text-hi)',fontSize:14,fontWeight:800}}>{total}</text>
        <text x="40" y="49" textAnchor="middle" style={{fontSize:11, fill:'var(--g-text-mid)'}}>total</text>
      </svg>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}}/><span className="text-[11px] text-slate-400">Available</span><span className="text-xs font-bold text-emerald-400 ml-auto">{avail}</span></div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}}/><span className="text-[11px] text-slate-400">Embargoed</span><span className="text-xs font-bold text-amber-400 ml-auto">{emb}</span></div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'repeating-linear-gradient(55deg,transparent,transparent 1px,var(--g-label) 1px,var(--g-label) 1.8px),#ef4444'}}/><span className="text-[11px] text-slate-400">Booked</span><span className="text-xs font-bold text-red-400 ml-auto">{booked}</span></div>
      </div>
    </div>
  );
}

// WeeklyRoutineBullet — right column of each week row in the desktop
// calendar. Renders a layered bullet chart:
//   - thin track (background)
//   - comfort band (target ±10%) overlay
//   - faint outer bar = slots OFFERED for the week (capacity)
//   - solid inner bar = slots BOOKED so far (fill)
//   - purple tick at target
// The two-bar layering lets the eye answer "is there enough capacity?"
// (outer bar reaches the target band) and "how full is it?" (inner bar
// reaches the outer bar) simultaneously. Past weeks: booked = final
// WeeklyRoutineBullet — right column of each week row in the desktop
// calendar. The PRIMARY metric is slots OFFERED vs the weekly target —
// the capacity-planning question "are we putting enough routine slots
// out there?". This is stable across past, current and future weeks
// (the rota offers roughly the same capacity regardless of how far away
// the week is), so it doesn't make future weeks look alarmingly short.
//
// BOOKED is shown as supplementary info: a darker fill inside the
// offered bar, plus a small "X booked (Y% fill)" line. For past weeks
// the fill is final; for the current week it's bookings so far; for
// future weeks it's small (advance bookings only) — which reads
// naturally as "this week is filling up" rather than "this week is
// broken".
//
// Layers: track → comfort band (target ±10%) → offered bar (lighter,
// coloured by offered-vs-target) → booked fill (darker, inside) →
// purple target tick.
function WeeklyRoutineBullet({ wk, rTarget, shortWeek = false }) {
  const offered = wk.wR || 0;
  const booked = wk.wRB || 0;
  if (offered <= 0) return <div className="h-full flex items-center justify-center"><span className="text-[11px] text-slate-400">—</span></div>;
  const fillPct = offered > 0 ? Math.round((booked / offered) * 100) : 0;
  if (rTarget <= 0) {
    return (
      <div className="h-full flex flex-col justify-center px-2" title={`Routine — ${offered} slots offered, ${booked} booked (${fillPct}% fill)`}>
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-bold text-emerald-400 leading-none font-mono-data">{offered}</span>
          <span className="text-[11px] text-slate-400">offered</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1">{booked} booked · {fillPct}% fill</div>
      </div>
    );
  }
  const maxScale = rTarget * 1.3;
  const offeredPct = Math.min(100, (offered / maxScale) * 100);
  const bookedPct = Math.min(100, (booked / maxScale) * 100);
  const targetPct = (rTarget / maxScale) * 100;
  const delta = offered - rTarget;
  // #7: three marks — offered, booked, target. The comfort band and its
  // dashed edges packed five marks into a 10px strip; the ±10% detail now
  // lives in the tooltip where it can be read as words.
  return (
    <div className="h-full flex flex-col justify-center px-2.5" title={`Routine — ${offered} offered vs ${rTarget} target (comfort ±10%: ${Math.round(rTarget*0.9)}–${Math.round(rTarget*1.1)}) · ${booked} booked (${fillPct}% fill)${shortWeek ? ' · short week, target pro-rated' : ''}`}>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-base font-bold leading-none font-mono-data" style={{color: 'var(--g-text-hi)'}}>{offered}</span>
        <span className="text-[11px] text-slate-400">/ {rTarget} offered{shortWeek ? ' · short wk' : ''}</span>
      </div>
      <div className="relative" style={{height: 10}}>
        <div className="absolute inset-0 rounded-sm" style={{background: 'var(--g-border)'}}/>
        <div className="absolute left-0 rounded-sm" style={{width: `${offeredPct}%`, top: 1, bottom: 1, background: 'rgba(99,102,241,0.4)'}}/>
        <div className="absolute left-0 rounded-sm" style={{width: `${bookedPct}%`, top: 1, bottom: 1, background: '#6366f1'}}/>
        {/* Target tick */}
        <div className="absolute" style={{left: `${targetPct}%`, top: -2, bottom: -2, width: 2, background: '#a78bfa', transform: 'translateX(-1px)', borderRadius: 1}}/>
      </div>
      <div className="text-[11px] mt-1.5 flex items-center gap-2">
        {/* Sign and size carry the meaning now, not hue. */}
        <span style={{color: 'var(--g-text-hi)', fontWeight: 600, whiteSpace: 'nowrap'}}>{delta >= 0 ? '+' : ''}{delta}<span style={{color: 'var(--meta)', fontWeight: 400}}> vs target</span></span>
        <span className="text-slate-400 ml-auto">{booked} booked · {fillPct}%</span>
      </div>
    </div>
  );
}

// `view` comes from the sidebar: Capacity planning now has Monthly and
// Weekly beneath it, which is where a choice of view belongs - it is a
// place you navigate to, not a setting on the page. The in-page toggle it
// replaces is gone.
export default function HuddleForward({ data, saveData, huddleData, setActiveSection, view = 'month', requestedWeek }) {
  const canEdit = canEditPracticeData(data);
  const [selectedDay, setSelectedDay] = useState(null);
  // selectedMarker controls which "insight" (urgent below target / highest
  // demand / routine by week / week-on-week) is expanded in the desktop
  // side panel. Mutually exclusive with selectedDay — clicking a day
  // clears it, clicking a marker clears the day. Mobile uses its own
  // mobileTab state (kept separate so the two views don't fight).
  const [selectedMarker, setSelectedMarker] = useState(null);
  // pickDay / pickMarker no longer clear each other — drawer and insight
  // expansion can coexist so the user doesn't lose their place when
  // drilling from a flagged-day list into the detail of one of those days.
  const pickDay = (isoKey) => setSelectedDay(isoKey);
  const closeDay = () => setSelectedDay(null);
  const pickMarker = (id) => setSelectedMarker(id);
  const closeMarker = () => setSelectedMarker(null);
  const toggleDay = (isoKey) => setSelectedDay(prev => prev === isoKey ? null : isoKey);
  const toggleMarker = (id) => setSelectedMarker(prev => prev === id ? null : id);
  // Refs used by the click-outside-to-close handler. The drawer closes
  // when the user clicks anywhere that is NOT the drawer itself AND
  // NOT a day cell (because clicking a different cell should switch
  // to that day without first closing — the cell's own onClick handles
  // the swap).
  const drawerRef = useRef(null);
  const calendarRef = useRef(null);
  const [weather, setWeather] = useState(null);
  const [mobileTab, setMobileTab] = useState('short');
  const hs = data?.huddleSettings || {};
  const sites = data?.roomAllocation?.sites || [];
  const siteCol = (name) => getSiteColour(name, sites);

  // --- Per-site staffing layer (toggled; hidden by default so the
  // calendar looks exactly as before until the user asks for it). A
  // clinician counts for a site only if they have routine slots there
  // that day - "based but out" people appear in the hover instead.
  const [showStaffing, setShowStaffing] = useState(false);
  // Which view is showing is the sidebar's business, so it is read from the
  // prop rather than held here. setCapView still exists because the month
  // grid deep-links into a specific week; it now moves the sidebar too, so
  // the nav never disagrees with the page.
  const capView = view === 'week' ? 'week' : 'month';
  const setCapView = (v) => setActiveSection?.(v === 'week' ? 'huddle-forward-week' : 'huddle-forward');
  const [staffingPanelOpen, setStaffingPanelOpen] = useState(false);
  const [staffTip, setStaffTip] = useState(null); // { x, y, entry }
  // Stored INSIDE huddleSettings so it persists: the save route only
  // writes known fields, and a top-level capacityStaffing was silently
  // dropped on every save (the "not saving between sessions" bug).
  const capacityStaffing = hs?.capacityStaffing || data?.capacityStaffing || {};
  const saveStaffing = (next) => {
    saveData({ ...data, huddleSettings: { ...hs, capacityStaffing: next } }, false);
  };
  const staffingCacheRef = useRef({});
  useEffect(() => { staffingCacheRef.current = {}; }, [showStaffing, huddleData, data?.capacityStaffing, hs, sites]);
  const staffingFor = (isoKey) => {
    if (!showStaffing || !huddleData || sites.length === 0) return [];
    const cache = staffingCacheRef.current;
    if (!cache[isoKey]) {
      const csvStr = toHuddleDateStr(new Date(isoKey + 'T12:00:00'));
      const entries = getSiteStaffingForDate(huddleData, csvStr, {
        sites,
        huddleSettings: hs,
        capacityStaffing,
        clinicians: data?.clinicians,
      });
      cache[isoKey] = entries.length ? [computeTotalEntry(entries, capacityStaffing), ...entries] : entries;
    }
    return cache[isoKey];
  };
  const saved = hs?.savedSlotFilters || {};
  const urgOv = saved.urgent || null;
  const routOv = saved.routine || null;
  const rTarget = hs?.routineWeeklyTarget || 0;
  const convRate = hs?.demandCapacity?.conversionRate ?? 0.25;
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const teamClin = useMemo(() => {
    if (!data?.clinicians) return [];
    return (Array.isArray(data.clinicians)?data.clinicians:Object.values(data.clinicians)).filter(c=>c.status!=='left');
  }, [data?.clinicians]);
  // List of slot types seen in the parsed CSV — required by SlotFilter for
  // the picker. Memoised because the underlying data array is stable.
  const knownSlotTypes = useMemo(() => huddleData?.allSlotTypes || [], [huddleData]);
  // Persist a saved slot filter (urgent/routine) — same key/value shape as
  // the Today page uses. Editing here writes to data.huddleSettings.
  // savedSlotFilters[key], so the change applies wherever the dashboard
  // reads that filter (Today urgent breakdown, capacity gauges, etc.) —
  // we deliberately don't fork separate filters for capacity planning.
  const persistFilter = (key, value) => {
    if (!canEdit) return;
    const newSaved = { ...hs.savedSlotFilters, [key]: value };
    saveData({ ...data, huddleSettings: { ...hs, savedSlotFilters: newSaved } }, false);
  };

  useEffect(() => {
    const lat = data?._v4?.practiceLatitude;
    const lon = data?._v4?.practiceLongitude;
    getWeatherForecast(16, lat, lon).then(w=>setWeather(w)).catch(()=>{});
  }, [data?._v4?.practiceLatitude, data?._v4?.practiceLongitude]);

  // ESC key closes the day drawer. Listener is only attached while a
  // day is selected so we don't pollute the global keydown stream when
  // the drawer isn't open.
  useEffect(() => {
    if (!selectedDay) return;
    const onKey = (e) => { if (e.key === 'Escape') closeDay(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDay]);

  // Click outside the drawer closes it. We deliberately ALSO exclude
  // clicks inside the calendar so that clicking a different day cell
  // doesn't trigger close-then-reopen flicker — the cell's own click
  // handler swaps selectedDay to the new key in one render.
  useEffect(() => {
    if (!selectedDay) return;
    const onDown = (e) => {
      const inDrawer = drawerRef.current && drawerRef.current.contains(e.target);
      const inCalendar = calendarRef.current && calendarRef.current.contains(e.target);
      if (!inDrawer && !inCalendar) closeDay();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [selectedDay]);

  // ─── Day annotations ───────────────────────────────────────────────
  // Per-date sticky notes. Loaded once on mount (and on practice switch).
  // Map keyed by isoKey (YYYY-MM-DD) → { id, note, updated_at }. Admins
  // can edit via the drawer; everyone can read. Persisted in the
  // day_annotations table (migration 045).
  const practiceId = data?._v4?.practiceId || null;
  const userId = data?._v4?.userId || null;
  const [annotations, setAnnotations] = useState({});
  const [annDraft, setAnnDraft] = useState('');      // textarea contents while editing
  const [annEditing, setAnnEditing] = useState(false);
  const [annSaving, setAnnSaving] = useState(false);

  useEffect(() => {
    if (!practiceId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: rows, error } = await supabase
          .from('day_annotations')
          .select('id, date, note, updated_at')
          .eq('practice_id', practiceId);
        if (error || cancelled || !rows) return;
        const map = {};
        for (const r of rows) map[r.date] = { id: r.id, note: r.note, updated_at: r.updated_at };
        setAnnotations(map);
      } catch { /* table may not exist yet on older DBs — fail silent */ }
    })();
    return () => { cancelled = true; };
  }, [practiceId]);

  // When the selected day changes, reset the annotation editor to view mode
  // and seed the draft with whatever note exists for that day.
  useEffect(() => {
    setAnnEditing(false);
    setAnnDraft(selectedDay ? (annotations[selectedDay]?.note || '') : '');
  }, [selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAnnotation = async (isoKey) => {
    if (!practiceId || !canEdit) return;
    const note = annDraft.trim();
    setAnnSaving(true);
    try {
      const supabase = createClient();
      if (!note) {
        // Empty note = delete any existing annotation for this day.
        const existing = annotations[isoKey];
        if (existing?.id) {
          await supabase.from('day_annotations').delete().eq('id', existing.id);
        }
        setAnnotations(prev => { const n = { ...prev }; delete n[isoKey]; return n; });
      } else {
        const { data: row, error } = await supabase
          .from('day_annotations')
          .upsert({ practice_id: practiceId, date: isoKey, note, updated_by: userId },
                  { onConflict: 'practice_id,date' })
          .select('id, date, note, updated_at')
          .single();
        if (!error && row) {
          setAnnotations(prev => ({ ...prev, [isoKey]: { id: row.id, note: row.note, updated_at: row.updated_at } }));
        }
      }
      setAnnEditing(false);
    } catch { /* surface nothing — the note just won't persist */ }
    finally { setAnnSaving(false); }
  };

  const deleteAnnotation = async (isoKey) => {
    if (!practiceId || !canEdit) return;
    const existing = annotations[isoKey];
    setAnnSaving(true);
    try {
      const supabase = createClient();
      if (existing?.id) await supabase.from('day_annotations').delete().eq('id', existing.id);
      setAnnotations(prev => { const n = { ...prev }; delete n[isoKey]; return n; });
      setAnnDraft('');
      setAnnEditing(false);
    } catch { /* ignore */ }
    finally { setAnnSaving(false); }
  };

  // Per-practice prediction context (calibrated baseline + LEA holidays)
  const predictionOptions = useMemo(() => {
    const opts = {};
    if (data?._v4?.demandSettings) opts.demandSettings = data._v4.demandSettings;
    if (data?._v4?.practiceAdminDistrict) {
      const cal = getSchoolHolidaysForLEA(data._v4.practiceAdminDistrict);
      if (cal?.ranges) opts.schoolHolidayRanges = cal.ranges;
    }
    if (typeof data?._v4?.practiceListSize === 'number') {
      opts.listSize = data._v4.practiceListSize;
    }
    return opts;
  }, [data?._v4?.demandSettings, data?._v4?.practiceAdminDistrict, data?._v4?.practiceListSize]);

  const COLS = '60px repeat(5, 1fr) 56px 56px';

  const weeks = useMemo(() => {
    if (!huddleData) return [];
    const today = new Date(); today.setHours(0,0,0,0);
    const dow = today.getDay(); const off = dow===0?-6:1-dow;
    const mon = new Date(today); mon.setDate(today.getDate()+off);
    const res = [];
    for (let w=0;w<6;w++) {
      const ws = new Date(mon); ws.setDate(mon.getDate()+w*7);
      const days = []; let wU=0,wRA=0,wRE=0,wRB=0,wT=0;
      for (let d=0;d<5;d++) {
        const date = new Date(ws); date.setDate(ws.getDate()+d);
        const dateStr = toHuddleDateStr(date);
        const isoKey = toLocalIso(date);
        const dayName = DAY_NAMES[date.getDay()];
        const hasData = huddleData.dates?.includes(dateStr);
        const isToday = isoKey===toLocalIso(today);
        const pred = predictDemand(date, weather?.[isoKey]||null, predictionOptions);
        const isBH = pred?.isBankHoliday||false;
        const predicted = pred?.predicted?Math.round(pred.predicted):null;
        // dow-specific baseline = practice's own baseline + this dow's effect.
        // Read from pred.factors so it tracks per-practice calibration.
        const dowBaseline = (pred?.factors?.baseline || 0) + (pred?.factors?.dayOfWeek?.effect || 0);
        const dc = dowDemandColour(predicted, dowBaseline);
        const uCap = hasData&&!isBH?getHuddleCapacity(huddleData,dateStr,hs,urgOv):null;
        const amS=uCap?(uCap.am.total||0)+(uCap.am.embargoed||0)+(uCap.am.booked||0):0;
        const pmS=uCap?(uCap.pm.total||0)+(uCap.pm.embargoed||0)+(uCap.pm.booked||0):0;
        const amT=hs?.expectedCapacity?.[dayName]?.am||0;
        const pmT=hs?.expectedCapacity?.[dayName]?.pm||0;
        const rTots = hasData&&!isBH?getDateTotals(huddleData,dateStr,hs,routOv):null;
        const rA=rTots?.available||0,rE=rTots?.embargoed||0,rB=rTots?.booked||0;
        const isPast = date < today;
        let amDuty=null,pmDuty=null;
        if(hasDuty&&hasData&&!isBH){amDuty=getDutyDoctor(huddleData,dateStr,'am',dutySlots,teamClin);pmDuty=getDutyDoctor(huddleData,dateStr,'pm',dutySlots,teamClin);}
        if(!isBH){wU+=amS+pmS;wRA+=rA;wRE+=rE;wRB+=rB;wT+=amT+pmT;}
        days.push({date,dateStr,isoKey,dayName,dayShort:DAY_SHORT[date.getDay()],dayNum:date.getDate(),
          monthStr:date.toLocaleString('en-GB',{month:'short'}),hasData,isToday,isBH,isPast,
          amS,pmS,amT,pmT,rA,rE,rB,rTotal:rA+rE+rB,
          predicted,dc,needed:predicted?Math.round(predicted*convRate):0,
          // Full pred object (factors, confidence band, demand level) is
          // surfaced in the day-detail panel so the user can see WHY a
          // particular day is rated the way it is.
          pred,
          uCap,routCap:hasData&&!isBH?getHuddleCapacity(huddleData,dateStr,hs,routOv):null,
          amDuty,pmDuty});
      }
      // #1: a bank-holiday week must not be judged against a five-day
      // target. openDays scales it, so wk1 of a BH week aims at 200, not 250.
      const openDays = days.filter(d=>!d.isBH).length;
      const effTarget = rTarget > 0 ? Math.round(rTarget * openDays / 5) : 0;
      res.push({days,ws,label:`${ws.getDate()} ${ws.toLocaleString('en-GB',{month:'short'})}`,wU,wT,wR:wRA+wRE+wRB,wRA,wRE,wRB,openDays,effTarget});
    }
    return res;
  }, [huddleData,hs,urgOv,routOv,weather,convRate,dutySlots,hasDuty,predictionOptions,rTarget]);

  // Below-minimum day count across the whole calendar window - shown as a
  // badge on the toggle button so warnings are visible WITHOUT opening the
  // layer (an early-warning system you have to remember to open is not
  // one). Only computed when at least one minimum is set.
  const staffingWarnDays = useMemo(() => {
    const anyThreshold = capacityStaffing.totalThreshold > 0 ||
      Object.values(capacityStaffing.thresholds || {}).some((n) => n > 0);
    if (!huddleData || sites.length === 0 || !anyThreshold) return 0;
    let count = 0;
    try {
      for (const wk of weeks) {
        for (const d of wk.days) {
          if (!d.hasData || d.isBH || d.isPast) continue;
          const csvStr = toHuddleDateStr(new Date(d.isoKey + 'T12:00:00'));
          const entries = getSiteStaffingForDate(huddleData, csvStr, { sites, huddleSettings: hs, capacityStaffing, clinicians: data?.clinicians });
          if (!entries.length) continue;
          const total = computeTotalEntry(entries, capacityStaffing);
          if (total.below || entries.some((e) => e.below)) count += 1;
        }
      }
    } catch { /* badge is advisory - never crash the calendar */ }
    return count;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huddleData, sites, hs, data?.capacityStaffing, weeks]);


  const shortDays = useMemo(()=>weeks.flatMap(w=>w.days).filter(d=>d.hasData&&!d.isBH&&(d.amT+d.pmT)>0&&(d.amS+d.pmS)<(d.amT+d.pmT)*0.8).sort((a,b)=>a.date-b.date),[weeks]);
  const topDemand = useMemo(()=>weeks.flatMap(w=>w.days).filter(d=>!d.isBH&&d.predicted).sort((a,b)=>b.predicted-a.predicted).slice(0,5),[weeks]);
  // Pattern detection — runs over the same `weeks` data used by the
  // calendar. See lib/capacity-patterns.js for the rules.
  const patterns = useMemo(()=>detectPatterns(weeks, hs, teamClin, huddleData), [weeks, hs, teamClin, huddleData]);
  // #9: which week a grid-row click should land on in the detail view.
  const [weekDetailOffset, setWeekDetailOffset] = useState(0);
  // The ⌘K palette asks for "week 3": weeks are 1-based on screen.
  useEffect(() => { if (requestedWeek?.n) setWeekDetailOffset(Math.max(0, requestedWeek.n - 1)); }, [requestedWeek]);
  const blankFrom = trailingBlankFrom(weeks);
  const lastExported = lastExportedDay(weeks);

  const detailDay = selectedDay?weeks.flatMap(w=>w.days).find(d=>d.isoKey===selectedDay):null;
  const detailClin = useMemo(()=>{
    if(!detailDay) return {am:[],pm:[],rout:[]};
    const map=list=>(list||[]).filter(c=>(c.available||0)+(c.embargoed||0)+(c.booked||0)>0).map(c=>{
      const m=teamClin.find(tc=>matchesStaffMember(c.name,tc));
      return {name:m?.name||c.name,initials:m?.initials||'?',loc:c.location,slots:(c.available||0)+(c.embargoed||0),bkd:c.booked||0};
    }).sort((a,b)=>(b.slots+b.bkd)-(a.slots+a.bkd));
    const routMerge=[...(detailDay.routCap?.am?.byClinician||[]),...(detailDay.routCap?.pm?.byClinician||[])].reduce((a,c)=>{
      const e=a.find(x=>x.name===c.name);
      if(e){e.available+=c.available||0;e.embargoed+=c.embargoed||0;e.booked+=c.booked||0;e.location=e.location||c.location;}
      else a.push({...c});return a;
    },[]);
    return {am:map(detailDay.uCap?.am?.byClinician),pm:map(detailDay.uCap?.pm?.byClinician),rout:map(routMerge)};
  },[detailDay,teamClin]);

  const updateTarget=v=>saveData({...data,huddleSettings:{...hs,routineWeeklyTarget:parseInt(v)||0}},false);

  if(!huddleData)return<div className="rounded-xl" style={{background:"var(--g-panel-2)",border:"1px solid var(--g-border)"}}><EmptyState icon="📈" title="Upload appointment report" description="Upload a CSV on the Today page first." /></div>;

  const DutyPill = ({doc,colour,bgTint,borderCol}) => {
    if(!doc) return null;
    const m = teamClin.find(tc=>matchesStaffMember(doc.name,tc));
    return <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg mb-3" style={{background:`${colour}15`,border:`1px solid ${colour}30`}}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill={colour} stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
      <span className="text-[11px] font-semibold" style={{color:colour}}>{m?.name||doc.name} (duty)</span>
    </div>;
  };

  return (
    <div className="-m-4 lg:-m-6 min-h-screen" style={{background:'linear-gradient(135deg, var(--g-ink) 0%, var(--g-ink-2) 50%, var(--g-ink) 100%)'}}>
      <div className="max-w-[1500px] mx-auto px-3 py-4 sm:p-4 lg:p-6 space-y-4">

      {/* ═══ DESKTOP LAYOUT — calendar (left) + side panel (right) ═══ */}
      {/* Two-column grid. The calendar fills available width on the left;
          the side panel is a fixed-width pop-out on the right. The side
          panel shows either: a selected day's detail (when a date is
          clicked), an expanded "insight marker" (when one of the four
          marker buttons is clicked), or the default state with the four
          marker buttons. selectedDay and selectedMarker are mutually
          exclusive — picking one clears the other. */}
      <div className="hidden lg:block space-y-4">

        {/* ─── LEFT: calendar ─── */}
        <div ref={calendarRef} className="rounded-2xl overflow-hidden" style={{background:'var(--g-panel)',border:'1px solid var(--g-border)'}}>
          {/* Calendar header: title + slot filter cogs */}
          <div className="px-5 py-4 flex items-center gap-2 border-b border-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{stroke:'var(--g-text-mid)'}} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            {/* h1, not a span: this is the page heading a screen reader
                announces on arrival. Classes unchanged, so nothing moves. */}
            <h1 className="text-base font-semibold font-heading" style={{color:'var(--g-text-hi)'}}>Capacity planning</h1>
            <span className="text-xs text-slate-400 ml-2">{capView === 'week' ? 'Week detail' : '6-week forward view'}</span>
            <div className="ml-auto flex items-center gap-2 relative">
              {sites.length > 0 && capView !== 'week' && (
                <button onClick={() => setShowStaffing(v => !v)}
                  title="Show or hide per-site clinician staffing in each day"
                  className="px-2 py-1 rounded-md text-[11px] font-semibold transition-colors"
                  style={{
                    background: showStaffing ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${showStaffing ? '#6366f180' : 'rgba(255,255,255,0.12)'}`,
                    color: showStaffing ? 'var(--accent-text)' : 'var(--g-text-mid)',
                  }}>
                  Site staffing
                  {staffingWarnDays > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold"
                      style={{background:'#f59e0b30', border:'1px solid #f59e0b60', color:'var(--c-amber-2)'}}
                      title={`${staffingWarnDays} day${staffingWarnDays === 1 ? '' : 's'} in the next 6 weeks below a staffing minimum`}>
                      {staffingWarnDays} short
                    </span>
                  )}
                </button>
              )}
              {(showStaffing || capView === 'week') && canEdit && (
                <button onClick={() => setStaffingPanelOpen((v) => !v)}
                  title="Set the minimum clinician count per site"
                  className="px-2 py-1 rounded-md text-[11px] font-semibold"
                  style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color:'var(--g-text-mid)'}}>
                  Minimums
                </button>
              )}
              {staffingPanelOpen && (showStaffing || capView === 'week') && canEdit && (
                <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-xl p-4 shadow-2xl"
                  style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.14)' }}
                  onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-body-sm font-semibold text-hi">Site staffing settings</span>
                    <button onClick={() => setStaffingPanelOpen(false)} className="text-mute hover:text-hi text-body-sm">&#10005;</button>
                  </div>
                  <div className="text-caption text-mute mb-1">Minimum clinicians per day</div>
                  <div className="space-y-1.5 mb-3">
                    {[{ key: '__total', label: 'Whole practice (all sites)' }, ...sites.map((st) => ({ key: st.name, label: st.name }))].map((row) => {
                      const cur = row.key === '__total'
                        ? (capacityStaffing.totalThreshold ?? '')
                        : (capacityStaffing.thresholds?.[row.key] ?? '');
                      return (
                        <div key={row.key} className="flex items-center gap-2">
                          <span className="flex-1 text-caption truncate" style={{ color: row.key === '__total' ? 'var(--accent-text)' : 'var(--g-text-soft)', fontWeight: row.key === '__total' ? 600 : 400 }}>{row.label}</span>
                          <select value={String(cur)}
                            onChange={(e) => {
                              const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                              if (row.key === '__total') {
                                saveStaffing({ ...capacityStaffing, totalThreshold: v });
                              } else {
                                const thresholds = { ...(capacityStaffing.thresholds || {}) };
                                if (v == null) delete thresholds[row.key]; else thresholds[row.key] = v;
                                saveStaffing({ ...capacityStaffing, thresholds });
                              }
                            }}
                            className="rounded-md px-1.5 py-1 text-caption"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--g-text-hi)' }}>
                            <option value="">No minimum</option>
                            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-caption text-mute mb-1">Who counts toward staffing</div>
                  <div className="space-y-1">
                    {Object.entries(STAFF_GROUP_LABELS).map(([g, label]) => {
                      const groups = Array.isArray(capacityStaffing.groups) && capacityStaffing.groups.length ? capacityStaffing.groups : ['gp'];
                      const on = groups.includes(g);
                      return (
                        <label key={g} className="flex items-center gap-2 cursor-pointer text-caption" style={{ color: 'var(--g-text-soft)' }}>
                          <input type="checkbox" checked={on}
                            onChange={() => {
                              const next = on ? groups.filter((x) => x !== g) : [...groups, g];
                              saveStaffing({ ...capacityStaffing, groups: next.length ? next : ['gp'] });
                            }} />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-caption text-faint mt-2 leading-normal">Judged from roles on the staff register. Counting requires routine slots at the site that day.</div>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400">Urgent</span>
                <SlotFilter overrides={urgOv} setOverrides={(v) => persistFilter('urgent', v)} knownSlotTypes={knownSlotTypes} title="Urgent slot types" readOnly={!canEdit} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400">Routine</span>
                <SlotFilter overrides={routOv} setOverrides={(v) => persistFilter('routine', v)} knownSlotTypes={knownSlotTypes} title="Routine slot types" readOnly={!canEdit} />
              </div>
            </div>
          </div>

          {capView === 'month' && (<>
          {/* Column header strip */}
          {/* The day columns get an "Urgent · AM | PM" annotation so it's
              clear at a glance that the per-day numbers are urgent-slot
              counts (the user explicitly asked for this clarification).
              The routine column on the right gets its own label tying back
              to the weekly target. */}
          {/* #4: the key, above the grid it explains. It was the last row
              of the card, after all sixty tiles. */}
          <div className="px-5 py-2 flex items-center gap-4 flex-wrap text-[11px] text-slate-400 border-b border-white/5">
            <span className="font-semibold">Key:</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#2563eb'}}/>Over</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#047857'}}/>On target</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#b45309'}}/>Tight</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#dc2626'}}/>Short &middot; shows {'−'}N vs target</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{border:'1.5px dashed var(--g-border-2)'}}/>No sessions on EMIS yet</span>
            <span>|</span>
            <span>Demand chip: &#8593; above typical &middot; &#8593;&#8593; well above</span>
          </div>

          {/* #10: "URGENT · AM | PM" was printed five times, once per
              column, in alarm-red caps. One spanning band says it once and
              hands the red back to the tiles; day names step up a size. */}
          <div className="grid border-b border-white/10" style={{gridTemplateColumns:'62px repeat(5, 1fr) 190px'}}>
            <div style={{gridColumn:'1'}}/>
            <div className="px-3 pt-2 text-center" style={{gridColumn:'2 / span 5'}}>
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{color:'var(--meta)',borderBottom:'1px solid var(--g-border)',paddingBottom:4}}>Urgent slots · AM | PM per day</div>
            </div>
            <div className="px-3 pt-2 border-l border-purple-900/30" style={{gridColumn:'7',background:'rgba(167,139,250,0.05)'}}>
              <div className="text-[11px] text-purple-300 font-bold uppercase tracking-wider">Routine</div>
            </div>
            <div style={{gridColumn:'1'}} className="pb-2"/>
            {['Mon','Tue','Wed','Thu','Fri'].map((d,i) => (
              <div key={d} className="px-3 pb-2 pt-1 text-center border-l border-white/5" style={{gridColumn:`${i+2}`}}>
                <div className="text-sm font-semibold text-slate-300">{d}</div>
              </div>
            ))}
            <div className="px-3 pb-2 pt-1 border-l border-purple-900/30" style={{gridColumn:'7',background:'rgba(167,139,250,0.05)'}}>
              <div className="text-xs font-semibold text-slate-300">vs weekly target</div>
            </div>
          </div>

          {/* Weeks */}
          {weeks.map((wk,wi)=>{
            if (blankFrom >= 0 && wi > blankFrom) return null;
            if (wi === blankFrom) {
              const n = weeks.length - blankFrom;
              const reach = lastExported ? lastExported.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : null;
              return (
                <div key="blank" className="px-4 py-4">
                  <div className="rounded-lg px-4 py-3 flex items-center gap-4 flex-wrap" style={{ border: '1px dashed var(--g-border-2)' }}>
                    <div className="flex-1 min-w-[260px]">
                      <div className="text-sm font-medium" style={{ color: 'var(--g-text-hi)' }}>
                        {reach ? `The EMIS export runs to ${reach}` : 'No EMIS export loaded for these weeks'}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--meta)' }}>
                        {n === 1 ? `Week ${blankFrom + 1} is` : `Weeks ${blankFrom + 1} to ${weeks.length} are`} not exported yet. Slot numbers appear here when the next export is uploaded; the weekly view shows who the rota says is in until then.
                      </div>
                    </div>
                    <button onClick={() => setActiveSection?.('huddle-today')} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }}>Upload an export</button>
                    <button onClick={() => { setWeekDetailOffset(blankFrom); setCapView('week'); }} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'transparent', border: '1px solid transparent', color: 'var(--meta)' }}>Show the rota projection</button>
                  </div>
                </div>
              );
            }
            return (
            <div key={wi} className="grid border-b border-white/5" style={{gridTemplateColumns:'62px repeat(5, 1fr) 190px'}}>
              {/* #9: the week label was inert while a week-detail view sat
                  behind a header toggle. The obvious thing to click now
                  opens that week in detail. */}
              <button onClick={()=>{setWeekDetailOffset(wi);setCapView('week');}}
                title={`Open week ${wi+1} (${wk.label}) in day-by-day detail`}
                className="p-3 border-r border-white/5 flex flex-col justify-center text-left transition-colors hover:bg-white/5 group/wk"
                style={{cursor:'pointer',border:'none',background:'transparent'}}>
                <div className="text-xs font-bold text-slate-300 font-mono-data">Wk {wi+1}</div>
                <div className="text-[11px] text-slate-400">{wk.label}</div>
                <div className="text-[11px] mt-0.5 opacity-0 group-hover/wk:opacity-100 transition-opacity" style={{color:'var(--link)'}}>detail &rarr;</div>
              </button>
              {wk.days.map((d,di)=>{
                const sel = selectedDay===d.isoKey;
                if(d.isBH) return (
                  /* #8: the one closed-day treatment everywhere — house icon,
                     neutral surface. Amber belongs to "tight", not to a
                     day off. */
                  <div key={di} className="p-2 border-l border-white/5">
                    <div className="rounded-lg h-full flex flex-col items-center justify-center gap-1" style={{background:'var(--g-tile-2)',border:'1px solid var(--g-border-2)'}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--meta)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
                      <span className="text-[11px]" style={{color:'var(--meta)'}}>Bank holiday</span>
                    </div>
                  </div>
                );
                if(!d.hasData) return (
                  <div key={di} className="p-2 border-l border-white/5">
                    <div className="rounded-lg h-full flex items-center justify-center" style={{background:'var(--g-tile-2)'}}>
                      <span className="text-[11px] text-slate-400">No data</span>
                    </div>
                  </div>
                );
                let amV = vBand(d.amS,d.amT);
                let pmV = vBand(d.pmS,d.pmT);
                // A session with NO urgent slots on EMIS at all is not short
                // — it has not been templated yet, so there is nothing to
                // judge. Dashed outline for those; every session with any
                // slots offered gets the usual colours at any distance.
                //
                // This replaced a "booking horizon" heuristic (>21 days out
                // + few bookings) that was an invented cutoff: urgent slots
                // are barely pre-booked at any distance, so the bookings
                // test was hollow, and a genuinely under-built far week was
                // being hidden. Darren set this rule instead.
                const GHOST = { bg: 'transparent', text: 'var(--meta)', ghost: true };
                if (d.amS === 0 && amV === VB.short) amV = GHOST;
                if (d.pmS === 0 && pmV === VB.short) pmV = GHOST;
                // Tooltip strings — native browser tooltips (cheap; no popper needed).
                // AM/PM tip: duty doctor + supplied/target. Demand tip: top
                // 2 driver factors. teamClin lookup gives the friendly
                // name when EMIS spells it differently (e.g. "COX, Darren (Dr)"
                // → "Dr Darren Cox").
                const dutyLabel = (duty) => {
                  if (!duty) return null;
                  const m = teamClin.find(tc=>matchesStaffMember(duty.name,tc));
                  return m?.name || duty.name;
                };
                const amDutyName = dutyLabel(d.amDuty);
                const pmDutyName = dutyLabel(d.pmDuty);
                const amTip = `AM urgent · ${d.amS}${d.amT>0?' / '+d.amT:''}${amDutyName?'\nDuty: '+amDutyName:''}`;
                const pmTip = `PM urgent · ${d.pmS}${d.pmT>0?' / '+d.pmT:''}${pmDutyName?'\nDuty: '+pmDutyName:''}`;
                const demandTip = d.pred?.factors ? (() => {
                  const f = d.pred.factors;
                  const drivers = [];
                  if (f.dayOfWeek?.effect) drivers.push(`${f.dayOfWeek.day||'Day of week'} ${f.dayOfWeek.effect>0?'+':''}${Math.round(f.dayOfWeek.effect)}`);
                  if (f.schoolHoliday) drivers.push(`School holiday ${f.schoolHoliday>0?'+':''}${Math.round(f.schoolHoliday)}`);
                  if (f.firstWeekBack) drivers.push(`First week back ${f.firstWeekBack>0?'+':''}${Math.round(f.firstWeekBack)}`);
                  if (f.firstDayBack) drivers.push(`First day back ${f.firstDayBack>0?'+':''}${Math.round(f.firstDayBack)}`);
                  if (f.nearBankHoliday?.effect) drivers.push(`Near BH ${f.nearBankHoliday.effect>0?'+':''}${Math.round(f.nearBankHoliday.effect)}`);
                  if (f.weather?.effect) drivers.push(`${f.weather.label||'Weather'} ${f.weather.effect>0?'+':''}${Math.round(f.weather.effect)}`);
                  if (f.month?.effect) drivers.push(`Time of year ${f.month.effect>0?'+':''}${Math.round(f.month.effect)}`);
                  drivers.sort((a,b)=>{
                    const na = parseInt(a.match(/-?\d+$/)?.[0]||'0');
                    const nb = parseInt(b.match(/-?\d+$/)?.[0]||'0');
                    return Math.abs(nb)-Math.abs(na);
                  });
                  return `Predicted ${d.predicted} (${d.dc.label})\n${drivers.slice(0,3).join(' · ')}`;
                })() : `Predicted ${d.predicted}`;
                return (
                  <div key={di} className="p-2 border-l border-white/5">
                    <button onClick={()=>toggleDay(d.isoKey)}
                      className="rounded-lg h-full w-full cursor-pointer transition-all duration-150 text-left block"
                      style={{
                        padding:'8px',
                        borderLeft: d.isToday?'3px solid #10b981':'3px solid transparent',
                        outline: sel?'2px solid #6366f1':'none',
                        outlineOffset: -1,
                        background: sel?'rgba(99,102,241,0.18)':(d.isPast?'var(--g-tile-2)':'var(--g-tile-2)'),
                        opacity: d.isPast?0.5:1,
                        filter: d.isPast?'saturate(0.4)':'none',
                        border: 'none'
                      }}>
                      <div className="flex items-center justify-between mb-2">
                        {d.isToday
                          ? <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono-data" style={{background:'#10b981',color:'white',letterSpacing:'0.05em'}}>Today · {d.dayNum}</span>
                          : <span className="text-xs font-bold text-slate-300 font-mono-data">{d.dayNum}</span>}
                        <div className="flex items-center gap-1">
                          {annotations[d.isoKey] && <span title={annotations[d.isoKey].note} className="text-[11px] leading-none cursor-help">📝</span>}
                          {d.predicted && <span title={demandTip} className="text-[11px] font-bold px-1.5 py-0.5 rounded cursor-help font-mono-data" style={{background:d.dc.bg,color:d.dc.text,border:`1px solid ${d.dc.border || 'transparent'}`}}>{d.dc.mark}{d.predicted}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <div title={amV.ghost ? 'AM — no urgent sessions on EMIS yet' : amTip} className="flex-1 text-center rounded-md py-1.5" style={{background:amV.bg, border: amV.ghost ? '1.5px dashed var(--g-border-2)' : 'none'}}>
                          <div className="text-base font-bold leading-none font-mono-data" style={{color:amV.text}}>{amV.ghost ? '\u2014' : d.amS}{amV.deficit && d.amT > d.amS ? <span style={{fontSize:'0.72em',opacity:0.85}}> {'\u2212'}{d.amT - d.amS}</span> : null}</div>
                          <div className="text-[11px] font-bold mt-0.5" style={{color:amV.text,opacity:0.8}}>AM</div>
                        </div>
                        <div title={pmV.ghost ? 'PM — no urgent sessions on EMIS yet' : pmTip} className="flex-1 text-center rounded-md py-1.5" style={{background:pmV.bg, border: pmV.ghost ? '1.5px dashed var(--g-border-2)' : 'none'}}>
                          <div className="text-base font-bold leading-none font-mono-data" style={{color:pmV.text}}>{pmV.ghost ? '\u2014' : d.pmS}{pmV.deficit && d.pmT > d.pmS ? <span style={{fontSize:'0.72em',opacity:0.85}}> {'\u2212'}{d.pmT - d.pmS}</span> : null}</div>
                          <div className="text-[11px] font-bold mt-0.5" style={{color:pmV.text,opacity:0.8}}>PM</div>
                        </div>
                      </div>
                    {showStaffing && (() => {
                        const st = staffingFor(d.isoKey);
                        if (!st.length) return null;
                        const tot = st.find((e) => e.isTotal);
                        const rest = st.filter((e) => !e.isTotal);
                        const tipOn = (ev, e) => {
                          const r = ev.currentTarget.getBoundingClientRect();
                          setStaffTip({ x: r.left + r.width / 2, y: r.top, entry: e });
                        };
                        const splitStr = (e) => e.sessions && Object.keys(e.sessions).length > 1
                          ? ['am','pm','eve'].filter((k) => k in e.sessions).map((k) => e.sessions[k]).join('\u00b7') : null;
                        return (
                          <div className="mt-1.5">
                            {tot && (() => {
                              const C = STATE_COLOURS[tot.state] || STATE_COLOURS.none;
                              const short = tot.state === 'short' ? tot.threshold - tot.counted.length : 0;
                              return (
                                <div onMouseEnter={(ev) => tipOn(ev, tot)} onMouseLeave={() => setStaffTip(null)}
                                  className="flex items-center px-1.5 py-0.5 rounded-md"
                                  style={{background: C.bg, border: `1px solid ${C.bd}`, borderLeft: '3px solid #818cf8'}}>
                                  <span className="text-[11px] font-bold uppercase" style={{color: C.fg, opacity: 0.85}}>All</span>
                                  <span className="ml-auto text-xs font-bold font-mono-data" style={{color: C.fg}}>
                                    {tot.counted.length}{short > 0 && <span className="text-[11px]"> ({'\u2212'}{short})</span>}
                                  </span>
                                </div>
                              );
                            })()}
                            <div className="flex gap-1 mt-1">
                              {rest.map((e) => {
                                const C = STATE_COLOURS[e.state] || STATE_COLOURS.none;
                                const short = e.state === 'short' && e.threshold != null ? e.threshold - e.worstCount : 0;
                                const split = splitStr(e);
                                return (
                                  <div key={e.site.name}
                                    onMouseEnter={(ev) => tipOn(ev, e)}
                                    onMouseLeave={() => setStaffTip(null)}
                                    className="flex-1 text-center rounded-md py-1"
                                    style={{background: C.bg, border: `1px solid ${C.bd}`, borderLeft: `3px solid ${e.site.colour || '#64748b'}`}}>
                                    <div className="text-xs font-bold leading-none font-mono-data" style={{color: C.fg}}>
                                      {e.counted.length}{short > 0 && <span className="text-[11px]"> {'\u2212'}{short}</span>}
                                    </div>
                                    <div className="text-[11px] font-mono-data mt-0.5" style={{color: C.fg, opacity: 0.75}}>{split || '\u00a0'}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </button>
                  </div>
                );
              })}
              {/* Routine column — weekly bullet chart */}
              <div className="border-l border-purple-900/30" style={{background:'rgba(167,139,250,0.03)'}}>
                <WeeklyRoutineBullet wk={wk} rTarget={wk.effTarget || rTarget} shortWeek={wk.openDays < 5} />
              </div>
            </div>
            );
          })}

          {/* Footer: target edit (the key moved to the top of the grid —
              #4: it sat below sixty tiles that it explained) */}
          <div className="px-5 py-3 flex items-center gap-5 flex-wrap text-[11px] text-slate-400">
            <span className="text-slate-400">|</span>
            {rTarget>0
              ? <span className="text-slate-400">Routine target: <strong className="text-slate-300">{rTarget}</strong>/wk {canEdit && <button role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={async()=>{const v=await promptDialog({ title: 'Weekly routine target', label: 'Routine slots a week', type: 'number', defaultValue: rTarget, validate: (x)=> (!x || Number(x) <= 0 ? 'Enter a number above zero.' : '') });if(v)updateTarget(v);}} className="text-indigo-400 underline cursor-pointer ml-1" style={{background:'none',border:'none',fontSize:'inherit'}}>edit</button>}</span>
              : canEdit ? <button role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={async()=>{const v=await promptDialog({ title: 'Set a weekly routine target', message: 'The number of routine slots the practice aims to offer each week. The grid colours each week against it.', label: 'Routine slots a week', type: 'number', defaultValue: 200, validate: (x)=> (!x || Number(x) <= 0 ? 'Enter a number above zero.' : '') });if(v)updateTarget(v);}} className="text-indigo-400 underline cursor-pointer" style={{background:'none',border:'none',fontSize:'inherit'}}>Set routine target</button> : <span className="text-slate-400 text-xs">Routine target not set</span>}
          </div>
          </>)}
          {capView === 'week' && (
            <CapacityWeek key={weekDetailOffset} initialOffset={weekDetailOffset} data={data} hs={hs} huddleData={huddleData} sites={sites}
              capacityStaffing={capacityStaffing} teamClin={teamClin} />
          )}
        </div>


        {/* ─── Insights bar (below calendar) ─── */}
        {/* Four tab-style buttons that each open one insight in the
            expansion area below. Click again to collapse. Mutually
            exclusive with the day detail drawer — picking a marker
            clears any selected day. Days inside an expanded list are
            clickable and switch to the day drawer. */}
        {/* Week detail answers one question - can we function next week -
            and these cards answer a different, six-week one. Shown
            together the page read as a wall, so they stand down there. */}
        {capView !== 'week' && (
        <div className="rounded-2xl overflow-hidden" style={{background:'var(--g-panel)',border:'1px solid var(--g-border)'}}>
          <div className="grid grid-cols-5 gap-2 p-3" style={{borderBottom: selectedMarker ? '1px solid var(--g-border)' : 'none'}}>
            {/* Urgent below target */}
            {(() => {
              const isActive = selectedMarker === 'short';
              return (
                <button onClick={() => toggleMarker('short')}
                  className="px-3 py-3 rounded-lg flex items-center gap-3 transition-colors text-left"
                  style={{background: isActive ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.07)', border: `1px solid ${isActive ? 'rgba(239,68,68,0.45)' : 'rgba(239,68,68,0.35)'}`}}>
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{background:'rgba(239,68,68,0.18)'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color: 'var(--c-red)'}}>Urgent below target &rarr;</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{shortDays.length} day{shortDays.length===1?'':'s'} flagged</div>
                  </div>
                  <span className="text-base font-bold text-red-400 font-mono-data">{shortDays.length}</span>
                </button>
              );
            })()}
            {/* Highest demand */}
            {(() => {
              const isActive = selectedMarker === 'demand';
              return (
                <button onClick={() => toggleMarker('demand')}
                  className="px-3 py-3 rounded-lg flex items-center gap-3 transition-colors text-left"
                  style={{background: isActive ? 'rgba(245,158,11,0.15)' : 'var(--g-tile-2)', border: `1px solid ${isActive ? 'rgba(245,158,11,0.45)' : 'var(--g-border-2)'}`}}>
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{background:'rgba(245,158,11,0.18)'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color: isActive ? 'var(--c-amber)' : 'var(--g-text-hi)'}}>Highest demand days</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Top {Math.min(topDemand.length,5)} predicted-busiest</div>
                  </div>
                  <span className="text-base font-bold text-amber-400 font-mono-data">{topDemand.length}</span>
                </button>
              );
            })()}
            {/* Routine by week */}
            {(() => {
              const isActive = selectedMarker === 'routine';
              const disabled = rTarget <= 0;
              return (
                <button onClick={() => !disabled && (toggleMarker('routine'))}
                  disabled={disabled}
                  className="px-3 py-3 rounded-lg flex items-center gap-3 transition-colors text-left"
                  style={{
                    background: disabled ? 'var(--g-tile-2)' : (isActive ? 'rgba(167,139,250,0.15)' : 'var(--g-tile-2)'),
                    border: `1px solid ${disabled ? 'var(--g-tile)' : (isActive ? 'rgba(167,139,250,0.45)' : 'var(--g-border-2)')}`,
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer'
                  }}>
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{background:'rgba(167,139,250,0.18)'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--duty-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color: isActive ? 'var(--duty-fg)' : 'var(--g-text-hi)'}}>Routine by week</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{disabled ? 'No target set' : `vs ${rTarget}/wk target`}</div>
                  </div>
                  <span className="text-base font-bold text-purple-300 font-mono-data">{disabled ? '—' : weeks.filter(w=>w.wR>0).length}</span>
                </button>
              );
            })()}
            {/* Week-on-week */}
            {(() => {
              const isActive = selectedMarker === 'trend';
              return (
                <button onClick={() => toggleMarker('trend')}
                  className="px-3 py-3 rounded-lg flex items-center gap-3 transition-colors text-left"
                  style={{background: isActive ? 'rgba(148,163,184,0.15)' : 'var(--g-tile-2)', border: `1px solid ${isActive ? 'rgba(148,163,184,0.45)' : 'var(--g-border-2)'}`}}>
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{background:'rgba(148,163,184,0.18)'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{stroke:'var(--g-text-mid)'}} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color: isActive ? 'var(--g-text-hi)' : 'var(--g-text-hi)'}}>Week-on-week</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Urgent + routine deltas</div>
                  </div>
                  <span className="text-base font-bold text-slate-300 font-mono-data">{weeks.filter(w=>w.wU>0).length}</span>
                </button>
              );
            })()}
            {/* Patterns — automated rule-based insights */}
            {(() => {
              const isActive = selectedMarker === 'patterns';
              const highCount = patterns.filter(p => p.severity === 'high').length;
              return (
                <button onClick={() => toggleMarker('patterns')}
                  className="px-3 py-3 rounded-lg flex items-center gap-3 transition-colors text-left"
                  style={{background: isActive ? 'rgba(99,102,241,0.15)' : 'var(--g-tile-2)', border: `1px solid ${isActive ? 'rgba(99,102,241,0.45)' : 'var(--g-border-2)'}`}}>
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{background:'rgba(99,102,241,0.18)'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-pale)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color: isActive ? 'var(--accent-text)' : 'var(--g-text-hi)'}}>Patterns</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{patterns.length===0?'Nothing flagged':highCount>0?`${highCount} high · ${patterns.length-highCount} other`:`${patterns.length} insight${patterns.length===1?'':'s'}`}</div>
                  </div>
                  <span className="text-base font-bold font-mono-data" style={{color:highCount>0?'var(--c-red)':'var(--accent-text)'}}>{patterns.length}</span>
                </button>
              );
            })()}
          </div>

          {/* Expansion area — only renders when a marker is selected */}
          {selectedMarker && (
            <div className="p-4 space-y-2">
              {selectedMarker==='short' && (
                shortDays.length===0
                  ? <p className="text-sm text-slate-400 text-center py-6">All days are meeting their urgent capacity target.</p>
                  : <div className="grid grid-cols-2 gap-2">{shortDays.map((d,i)=>{const u=d.amS+d.pmS,t=d.amT+d.pmT;return(
                      <button key={i} onClick={()=>pickDay(d.isoKey)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors" style={{background:'var(--g-tile)',border:'1px solid var(--g-tile)'}}>
                        <span className="text-xs font-semibold text-slate-300 w-20 flex-shrink-0">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:'var(--g-border-2)'}}>
                          <div className="h-full rounded-full" style={{width:`${Math.min((u/t)*100,100)}%`,background:u<t*0.8?'#ef4444':'#f59e0b'}}/>
                        </div>
                        <span className="text-xs font-bold text-red-400 flex-shrink-0">{u}</span>
                        <span className="text-[11px] text-slate-400 flex-shrink-0">/ {t}</span>
                      </button>
                    );})}</div>
              )}
              {selectedMarker==='demand' && (
                topDemand.length===0
                  ? <p className="text-sm text-slate-400 text-center py-6">No demand prediction data yet.</p>
                  : <div className="grid grid-cols-2 gap-2">{topDemand.map((d,i)=>{
                      const u = d.amS+d.pmS;
                      const cov = d.needed>0?Math.round((u/d.needed)*100):100;
                      const col = cov>=90?'#10b981':cov>=80?'#f59e0b':'#ef4444';
                      const verdict = cov>=90?'OK':cov>=80?'Tight':'Short';
                      return (
                        <button key={i} onClick={()=>pickDay(d.isoKey)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors" style={{background:'var(--g-tile)',border:'1px solid var(--g-tile)'}}>
                          <span className="text-xs font-semibold text-slate-300 w-20 flex-shrink-0">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{background:d.dc.bg,color:d.dc.text,border:`1px solid ${d.dc.border || 'transparent'}`}}>{d.dc.mark}{d.predicted}</span>
                          <span className="text-[11px] text-slate-400 flex-1">need {d.needed}</span>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs font-bold" style={{color:col}}>{verdict}</div>
                            <div className="text-[11px] text-slate-400">{u} / {d.needed}</div>
                          </div>
                        </button>
                      );
                    })}</div>
              )}
              {selectedMarker==='routine' && (
                rTarget<=0
                  ? <p className="text-sm text-slate-400 text-center py-6">Set a weekly routine target in the calendar footer to enable this.</p>
                  : weeks.filter(w=>w.wR>0).length===0
                    ? <p className="text-sm text-slate-400 text-center py-6">No routine slot data uploaded yet.</p>
                    : <div className="grid grid-cols-2 gap-2">{weeks.filter(w=>w.wR>0).map((w,i)=>{const vb=vBand(w.wR,rTarget);return(
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{background:'var(--g-tile)',border:'1px solid var(--g-tile)'}}>
                          <span className="text-xs font-semibold text-slate-300 w-12 flex-shrink-0">Wk {weeks.indexOf(w)+1}</span>
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:'var(--g-border-2)'}}>
                            <div className="h-full rounded-full" style={{width:`${Math.min((w.wR/rTarget)*100,100)}%`,background:vb.bg}}/>
                          </div>
                          <span className="text-xs font-bold flex-shrink-0" style={{color:vb.fg || vb.bg}}>{w.wR}</span>
                          <span className="text-[11px] text-slate-400 flex-shrink-0">/ {rTarget}</span>
                        </div>
                      );})}</div>
              )}
              {selectedMarker==='trend' && (
                weeks.filter(w=>w.wU>0).length===0
                  ? <p className="text-sm text-slate-400 text-center py-6">No urgent data uploaded yet.</p>
                  : <div className="grid grid-cols-2 gap-2">{weeks.filter(w=>w.wU>0).map((w,i,arr)=>{const delta=i>0?w.wU-arr[i-1].wU:0;return(
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{background:'var(--g-tile)',border:'1px solid var(--g-tile)'}}>
                        <span className="text-xs font-semibold text-slate-300 w-12 flex-shrink-0">Wk {weeks.indexOf(w)+1}</span>
                        <div className="flex items-center gap-1.5"><span className="text-sm font-bold text-slate-200">{w.wU}</span><span className="text-[11px] text-slate-400">urg</span></div>
                        <div className="flex items-center gap-1.5"><span className="text-sm font-bold" style={{color:'var(--c-violet)'}}>{w.wR}</span><span className="text-[11px] text-slate-400">rout</span></div>
                        {delta!==0 && <span className={`text-xs font-bold ml-auto ${delta>0?'text-emerald-500':'text-red-500'}`}>{delta>0?'↑':'↓'}{Math.abs(delta)} urg</span>}
                      </div>
                    );})}</div>
              )}
              {selectedMarker==='patterns' && (
                patterns.length===0
                  ? <div className="text-center py-8">
                      <div className="text-sm text-slate-300 mb-2">Nothing flagged.</div>
                      <div className="text-[11px] text-slate-400 max-w-md mx-auto">No recurring capacity issues detected in the current data. Patterns become more reliable once you have several weeks of CSV uploads — the detector looks across all available data to spot weekday-level imbalances, single-clinician concentration risk, routine target streaks, and a handful of other things.</div>
                    </div>
                  : <div className="grid grid-cols-1 gap-3">
                      {patterns.map((p, i) => {
                        const sevColour = p.severity === 'high' ? 'var(--state-short)' : p.severity === 'medium' ? 'var(--state-tight)' : 'var(--g-text-mid)';
                        const sevBg = p.severity === 'high' ? 'rgba(239,68,68,0.06)' : p.severity === 'medium' ? 'rgba(245,158,11,0.06)' : 'rgba(148,163,184,0.04)';
                        const sevBorder = p.severity === 'high' ? 'rgba(239,68,68,0.2)' : p.severity === 'medium' ? 'rgba(245,158,11,0.2)' : 'rgba(148,163,184,0.15)';
                        const sevLabel = p.severity === 'high' ? 'HIGH' : p.severity === 'medium' ? 'MEDIUM' : 'INFO';
                        return (
                          <div key={p.id} className="rounded-lg overflow-hidden" style={{background: sevBg, border: `1px solid ${sevBorder}`}}>
                            {/* Header row */}
                            <div className="px-4 py-3 flex items-start gap-3" style={{borderBottom: `1px solid ${sevBorder}`}}>
                              <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{background: `${p.iconColor}22`}}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={p.icon}/></svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{background: sevColour, color: 'white'}}>{sevLabel}</span>
                                </div>
                                <div className="text-sm font-semibold text-slate-100 leading-snug">{p.title}</div>
                              </div>
                              {p.affectedDates.length > 0 && (
                                <button onClick={()=>pickDay(p.affectedDates[0])} className="text-[11px] px-2 py-1 rounded text-slate-400 hover:text-white hover:bg-white/5 flex-shrink-0" style={{background:'none',border:'1px solid var(--g-border-2)',cursor:'pointer'}}>
                                  See day →
                                </button>
                              )}
                            </div>
                            {/* Body */}
                            <div className="px-4 py-3 space-y-3">
                              <p className="text-[12px] text-slate-300 leading-relaxed">{p.detail}</p>
                              {p.evidence && p.evidence.length > 0 && (
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Evidence</div>
                                  <div className="space-y-1">
                                    {p.evidence.map((ev, j) => (
                                      <div key={j} className="flex items-center gap-3 px-2.5 py-1.5 rounded text-[11px]" style={{background:'var(--g-tile-2)'}}>
                                        <span className="text-slate-400 flex-shrink-0">{ev.label}</span>
                                        <span className="text-slate-200 font-medium ml-auto text-right">{ev.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {p.suggestion && (
                                <div className="rounded p-2.5" style={{background:'var(--g-tile-2)', borderLeft: `2px solid ${p.iconColor}`}}>
                                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{color: p.iconColor}}>Suggestion</div>
                                  <p className="text-[12px] text-slate-300 leading-relaxed">{p.suggestion}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ═══ DAY DETAIL DRAWER (desktop) ═══ */}
      {/* Fixed-position drawer that slides in from the right when a day
          is selected. Doesn't push the calendar — overlays the rightmost
          ~440px of the screen. Calendar behind it stays at full width and
          is partially obscured. Click the ✕ (or click any other day) to
          close. Only shown on lg+ — mobile uses inline expansion as
          before. */}
      {detailDay && (
        <div ref={drawerRef} className="hidden lg:flex fixed top-0 right-0 bottom-0 z-40 flex-col animate-in slide-in-from-right" style={{width:'440px',background:'linear-gradient(180deg, var(--g-ink-2) 0%, var(--g-ink) 100%)',borderLeft:'1px solid var(--g-line)',boxShadow:'-12px 0 32px rgba(0,0,0,0.5)'}}>
          <div className="px-4 py-3 flex items-center gap-2 border-b border-white/10 flex-shrink-0">
            <span className="text-sm font-semibold text-ink-max font-heading">{detailDay.dayName} {detailDay.dayNum} {detailDay.monthStr}</span>
            <button onClick={closeDay} className="ml-auto text-slate-400 hover:text-white" style={{background:'none',border:'none',cursor:'pointer',padding:'4px 8px'}} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <PredictionBand day={detailDay} convRate={convRate} />
          <div className="overflow-y-auto p-4 space-y-3" style={{flex:1}}>
            {/* Annotation — sticky note for this day */}
            <div className="rounded-lg p-3" style={{background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.18)'}}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">📝 Note</span>
                {!annEditing && canEdit && (
                  <button onClick={()=>{setAnnDraft(annotations[detailDay.isoKey]?.note||'');setAnnEditing(true);}} className="ml-auto text-[11px] text-amber-300/70 hover:text-amber-300" style={{background:'none',border:'none',cursor:'pointer'}}>
                    {annotations[detailDay.isoKey] ? 'Edit' : 'Add note'}
                  </button>
                )}
              </div>
              {annEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={annDraft}
                    onChange={e=>setAnnDraft(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    autoFocus
                    placeholder="e.g. Dr Smith locum AM · training pm · expecting surge"
                    className="w-full text-[12px] text-slate-200 rounded p-2 resize-none"
                    style={{background:'var(--g-field)',border:'1px solid rgba(251,191,36,0.25)',outline:'none'}}
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={()=>saveAnnotation(detailDay.isoKey)} disabled={annSaving} className="text-[11px] font-semibold px-3 py-1.5 rounded" style={{background:'#f59e0b',color:'#1e293b',border:'none',cursor:annSaving?'default':'pointer',opacity:annSaving?0.6:1}}>
                      {annSaving?'Saving…':'Save'}
                    </button>
                    <button onClick={()=>{setAnnEditing(false);setAnnDraft(annotations[detailDay.isoKey]?.note||'');}} className="text-[11px] text-slate-400 hover:text-white px-2 py-1.5" style={{background:'none',border:'none',cursor:'pointer'}}>Cancel</button>
                    {annotations[detailDay.isoKey] && <button onClick={()=>deleteAnnotation(detailDay.isoKey)} disabled={annSaving} className="text-[11px] text-red-400 hover:text-red-300 px-2 py-1.5 ml-auto" style={{background:'none',border:'none',cursor:'pointer'}}>Delete</button>}
                  </div>
                </div>
              ) : annotations[detailDay.isoKey] ? (
                <p className="text-[12px] text-slate-200 leading-relaxed whitespace-pre-wrap">{annotations[detailDay.isoKey].note}</p>
              ) : (
                <p className="text-[11px] text-slate-400 italic">{canEdit ? 'No note for this day. Click "Add note" to jot down context (locum cover, training, expected surge, etc).' : 'No note for this day.'}</p>
              )}
            </div>
            {/* AM urgent section */}
            <div className="rounded-lg p-3" style={{background:'var(--g-tile)',border:'1px solid var(--g-tile)'}}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-400">AM urgent</span>
                <span className="text-base font-bold text-red-400 ml-auto">{detailDay.amS}</span>
                {detailDay.amT>0 && <span className="text-[11px] text-slate-400">/ {detailDay.amT}</span>}
              </div>
              {detailDay.amDuty && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded mb-2" style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.25)'}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--c-red)" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                  <span className="text-[11px] font-semibold text-red-300">{(teamClin.find(tc=>matchesStaffMember(detailDay.amDuty.name,tc))?.name)||detailDay.amDuty.name} (duty)</span>
                </div>
              )}
              <div className="space-y-1">
                {detailClin.am.map((c,j)=>{const lc=c.loc?siteCol(c.loc):null;return(
                  <div key={j} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{background:'var(--g-tile-2)'}}>
                    {lc && <div className="w-1 h-3.5 rounded-sm flex-shrink-0" style={{background:lc}}/>}
                    <span className="text-[11px] text-slate-300 flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] font-bold text-slate-300">{c.slots+c.bkd}</span>
                  </div>
                );})}
                {detailClin.am.length===0 && <div className="text-[11px] text-slate-400 py-2 text-center">No slots</div>}
              </div>
            </div>
            {/* PM urgent section */}
            <div className="rounded-lg p-3" style={{background:'var(--g-tile)',border:'1px solid var(--g-tile)'}}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">PM urgent</span>
                <span className="text-base font-bold text-blue-400 ml-auto">{detailDay.pmS}</span>
                {detailDay.pmT>0 && <span className="text-[11px] text-slate-400">/ {detailDay.pmT}</span>}
              </div>
              {detailDay.pmDuty && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded mb-2" style={{background:'rgba(59,130,246,0.12)',border:'1px solid rgba(59,130,246,0.25)'}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--c-blue)" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                  <span className="text-[11px] font-semibold text-blue-300">{(teamClin.find(tc=>matchesStaffMember(detailDay.pmDuty.name,tc))?.name)||detailDay.pmDuty.name} (duty)</span>
                </div>
              )}
              <div className="space-y-1">
                {detailClin.pm.map((c,j)=>{const lc=c.loc?siteCol(c.loc):null;return(
                  <div key={j} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{background:'var(--g-tile-2)'}}>
                    {lc && <div className="w-1 h-3.5 rounded-sm flex-shrink-0" style={{background:lc}}/>}
                    <span className="text-[11px] text-slate-300 flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] font-bold text-slate-300">{c.slots+c.bkd}</span>
                  </div>
                );})}
                {detailClin.pm.length===0 && <div className="text-[11px] text-slate-400 py-2 text-center">No slots</div>}
              </div>
            </div>
            {/* Routine section */}
            <div className="rounded-lg p-3" style={{background:'rgba(167,139,250,0.05)',border:'1px solid rgba(167,139,250,0.15)'}}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300">Routine</span>
                <span className="text-base font-bold text-purple-300 ml-auto">{detailDay.rTotal}</span>
              </div>
              <div className="mb-3"><DonutGauge avail={detailDay.rA} emb={detailDay.rE} booked={detailDay.rB}/></div>
              <div className="space-y-1">
                {detailClin.rout.map((c,j)=>{const lc=c.loc?siteCol(c.loc):null;return(
                  <div key={j} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{background:'var(--g-tile-2)'}}>
                    {lc && <div className="w-1 h-3.5 rounded-sm flex-shrink-0" style={{background:lc}}/>}
                    <span className="text-[11px] text-slate-300 flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] font-bold text-slate-300">{c.slots+c.bkd}</span>
                  </div>
                );})}
                {detailClin.rout.length===0 && <div className="text-[11px] text-slate-400 py-2 text-center">No slots</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MOBILE LAYOUT ═══ */}
      <div className="lg:hidden space-y-4">
        {/* 6-week strip — horizontally scrollable */}
        <div className="rounded-xl overflow-hidden" style={{background:"var(--g-panel-2)",border:"1px solid var(--g-border)"}}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{background:"var(--g-panel-2)",borderBottom:"1px solid var(--g-tile)"}}>
            <div>
              <div className="font-heading text-sm font-medium text-slate-200">Capacity planning</div>
              <div className="text-[11px] text-slate-400">Tap any day · 6-week forward view</div>
            </div>
          </div>

          {weeks.map((wk, wi) => {
            const wkLabel = wi === 0 ? 'This week' : wi === 1 ? 'Next week' : `In ${wi} weeks`;
            const ws = wk.ws;
            const wcStr = `wc ${ws.getDate()} ${ws.toLocaleString('en-GB',{month:'short'})}`;
            return (
              <div key={wi} style={{borderTop: wi > 0 ? '1px solid var(--g-tile)' : 'none'}}>
                <div className="flex items-baseline justify-between px-4 py-2">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{wkLabel}</div>
                  <div className="text-[11px] text-slate-400">{wcStr}</div>
                </div>
                <div className="grid grid-cols-5 gap-1 px-3 pb-3">
                  {wk.days.map((d, di) => {
                    const sel = selectedDay === d.isoKey;
                    const u = d.amS + d.pmS;
                    const t = d.amT + d.pmT;
                    const fillPct = t > 0 ? Math.min(100, (u/t)*100) : 0;
                    const fillCol = u >= t ? '#10b981' : u >= t * 0.8 ? '#f59e0b' : '#ef4444';
                    const predCol = d.predicted ? d.dc.text : 'var(--g-text-faint)';
                    return (
                      <button key={di}
                        onClick={() => d.hasData && !d.isBH && setSelectedDay(sel ? null : d.isoKey)}
                        disabled={!d.hasData || d.isBH}
                        className="rounded-md p-1.5 flex flex-col items-center gap-1 transition-all"
                        style={{
                          background: sel ? 'rgba(99,102,241,0.18)' : (d.isPast ? 'var(--g-tile-2)' : 'var(--g-tile)'),
                          border: sel ? '1px solid rgba(99,102,241,0.5)' : (d.isToday ? '1px solid rgba(16,185,129,0.4)' : '1px solid transparent'),
                          opacity: d.isPast ? 0.5 : 1,
                          cursor: (d.hasData && !d.isBH) ? 'pointer' : 'default'
                        }}>
                        <div className="text-[11px] font-bold text-slate-400">{d.dayShort}</div>
                        <div className="text-[11px] text-slate-400 leading-none -mt-1">{d.dayNum}</div>
                        {d.isBH ? (
                          <div className="text-[11px] font-bold text-amber-400 mt-1">BH</div>
                        ) : !d.hasData ? (
                          <div className="text-[11px] text-slate-400 mt-1">—</div>
                        ) : (<>
                          <div className="font-mono-data text-base font-bold leading-none" style={{color: fillCol}}>{u}</div>
                          <div className="w-full h-1 rounded-sm overflow-hidden" style={{background: 'var(--g-border)'}}>
                            <div className="h-full" style={{width: `${fillPct}%`, background: fillCol}}/>
                          </div>
                          <div className="font-mono-data text-[11px] font-bold leading-none" style={{color: predCol}}>{d.predicted || '—'}</div>
                        </>)}
                      </button>
                    );
                  })}
                </div>
                {/* Inline expansion: if selectedDay is in this week */}
                {wk.days.some(d => d.isoKey === selectedDay) && detailDay && (
                  <div className="px-4 pb-3 -mt-1">
                    <div className="rounded-lg overflow-hidden" style={{background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)'}}>
                      <div className="px-3 py-2 flex items-center justify-between" style={{borderBottom: '1px solid rgba(99,102,241,0.15)'}}>
                        <div className="text-xs font-semibold text-slate-200">{detailDay.dayName} {detailDay.dayNum} {detailDay.monthStr}</div>
                        <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-white text-xs" style={{background:'none',border:'none',cursor:'pointer'}}>✕</button>
                      </div>
                      {/* Full prediction band — driver factors, confidence
                          range, and demand level all visible at the top of
                          the mobile card too. */}
                      <PredictionBand day={detailDay} convRate={convRate} />
                      <div className="p-3 space-y-2">
                        {/* AM urgent */}
                        {(() => {
                          const amCol = detailDay.amT > 0 ? (detailDay.amS >= detailDay.amT ? 'var(--c-green-2)' : detailDay.amS >= detailDay.amT * 0.8 ? 'var(--c-amber-2)' : 'var(--c-red-2)') : 'var(--g-text-mid)';
                          return (
                            <div className="rounded-md p-2.5" style={{background: 'var(--g-tile)'}}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-bold uppercase tracking-wider" style={{color: amCol}}>AM urgent</span>
                                <div className="flex items-baseline gap-1">
                                  <span className="font-mono-data text-base font-bold" style={{color: amCol}}>{detailDay.amS}</span>
                                  {detailDay.amT > 0 && <span className="text-[11px] text-slate-400">/ {detailDay.amT}</span>}
                                </div>
                              </div>
                              {detailDay.amDuty && <div className="text-[11px] text-slate-400">Duty: <span className="font-semibold text-slate-300">{detailDay.amDuty.name?.split(',')[0]}</span></div>}
                            </div>
                          );
                        })()}
                        {/* PM urgent */}
                        {(() => {
                          const pmCol = detailDay.pmT > 0 ? (detailDay.pmS >= detailDay.pmT ? 'var(--c-green-2)' : detailDay.pmS >= detailDay.pmT * 0.8 ? 'var(--c-amber-2)' : 'var(--c-red-2)') : 'var(--g-text-mid)';
                          return (
                            <div className="rounded-md p-2.5" style={{background: 'var(--g-tile)'}}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-bold uppercase tracking-wider" style={{color: pmCol}}>PM urgent</span>
                                <div className="flex items-baseline gap-1">
                                  <span className="font-mono-data text-base font-bold" style={{color: pmCol}}>{detailDay.pmS}</span>
                                  {detailDay.pmT > 0 && <span className="text-[11px] text-slate-400">/ {detailDay.pmT}</span>}
                                </div>
                              </div>
                              {detailDay.pmDuty && <div className="text-[11px] text-slate-400">Duty: <span className="font-semibold text-slate-300">{detailDay.pmDuty.name?.split(',')[0]}</span></div>}
                            </div>
                          );
                        })()}
                        {/* Routine total */}
                        <div className="rounded-md p-2.5" style={{background: 'var(--g-tile)'}}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Routine</span>
                            <span className="font-mono-data text-base font-bold text-emerald-400">{detailDay.rTotal}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px]">
                            <span className="text-slate-400">Avail <span className="text-emerald-400 font-bold">{detailDay.rA}</span></span>
                            <span className="text-slate-400">Emb <span className="text-amber-400 font-bold">{detailDay.rE}</span></span>
                            <span className="text-slate-400">Booked <span className="text-slate-300 font-bold">{detailDay.rB}</span></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Strip key */}
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{borderTop: '1px solid var(--g-tile)'}}>
            <span className="text-[11px] text-slate-400">Top: urgent slots</span>
            <span className="text-[11px] text-slate-400">·</span>
            <span className="text-[11px] text-slate-400">Bottom: predicted demand</span>
          </div>
        </div>

        {/* Tabbed sections */}
        <div className="grid grid-cols-2 gap-1.5">
          {[
            {id: 'short', label: 'Short', count: shortDays.length, icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01', col: '#f87171'},
            {id: 'demand', label: 'High demand', count: topDemand.length, icon: 'M22 12h-4l-3 9L9 3l-3 9H2', col: '#fbbf24'},
            ...(rTarget > 0 ? [{id: 'routine', label: 'Routine', count: weeks.filter(w => w.wR > 0).length, icon: 'M3 3h18v18H3zM3 9h18M9 21V9', col: '#a78bfa'}] : []),
            {id: 'trend', label: 'Trend', count: weeks.filter(w => w.wU > 0).length, icon: 'M18 20V10M12 20V4M6 20v-6', col: 'var(--g-text-mid)'},
          ].map(t => {
            const active = mobileTab === t.id;
            return (
              <button key={t.id} onClick={() => setMobileTab(t.id)}
                className="rounded-lg px-3 py-2 flex items-center gap-2 transition-all"
                style={{
                  background: active ? `${t.col}22` : 'var(--g-tile)',
                  border: `1px solid ${active ? `${t.col}55` : 'var(--g-border)'}`,
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? t.col : 'var(--g-text-mid)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
                <span className="text-xs font-semibold" style={{color: active ? t.col : 'var(--g-text-mid)'}}>{t.label}</span>
                <span className="text-[11px] ml-auto" style={{color: active ? t.col : 'var(--g-text-faint)'}}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {mobileTab === 'short' && (
          <div className="rounded-xl overflow-hidden" style={{background:"var(--g-panel-2)",border:"1px solid var(--g-border)"}}>
            <div className="px-4 py-2.5" style={{background:"rgba(239,68,68,0.15)",borderBottom:"1px solid rgba(239,68,68,0.1)"}}>
              <span className="text-xs font-semibold text-ink-max">Urgent capacity below target</span>
            </div>
            <div className="p-3 space-y-1.5">
              {shortDays.length === 0 && <p className="text-sm text-slate-400 text-center py-3">All days meeting target</p>}
              {shortDays.slice(0, 10).map((d, i) => {
                const u = d.amS + d.pmS, t = d.amT + d.pmT;
                return (
                  <button key={i} onClick={() => setSelectedDay(d.isoKey)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left" style={{background: 'var(--g-tile)'}}>
                    <span className="text-xs font-semibold text-slate-300 w-16">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background: 'var(--g-border-2)'}}>
                      <div className="h-full rounded-full" style={{width: `${Math.min((u/t)*100, 100)}%`, background: u < t * 0.8 ? '#ef4444' : '#f59e0b'}}/>
                    </div>
                    <span className="text-xs font-bold text-red-400">{u}</span>
                    <span className="text-[11px] text-slate-400">/ {t}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mobileTab === 'demand' && (
          <div className="rounded-xl overflow-hidden" style={{background:"var(--g-panel-2)",border:"1px solid var(--g-border)"}}>
            <div className="px-4 py-2.5" style={{background:"rgba(245,158,11,0.15)",borderBottom:"1px solid rgba(245,158,11,0.1)"}}>
              <span className="text-xs font-semibold text-ink-max">Highest demand days</span>
            </div>
            <div className="p-3 space-y-1.5">
              {topDemand.length === 0 && <p className="text-sm text-slate-400 text-center py-3">No demand data</p>}
              {topDemand.map((d, i) => {
                const u = d.amS + d.pmS;
                return (
                  <button key={i} onClick={() => setSelectedDay(d.isoKey)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left" style={{background: 'var(--g-tile)'}}>
                    <span className="text-xs font-semibold text-slate-300 w-16">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{background: d.dc.bg, color: d.dc.text}}>{d.predicted}</span>
                    <span className="text-[11px] text-slate-400 ml-auto">urg {u}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mobileTab === 'routine' && rTarget > 0 && (
          <div className="rounded-xl overflow-hidden" style={{background:"var(--g-panel-2)",border:"1px solid var(--g-border)"}}>
            <div className="px-4 py-2.5" style={{background:"rgba(124,58,237,0.15)",borderBottom:"1px solid rgba(124,58,237,0.1)"}}>
              <span className="text-xs font-semibold text-ink-max">Weekly routine capacity</span>
            </div>
            <div className="p-3 space-y-1.5">
              {weeks.filter(w => w.wR > 0).map((w, i) => {
                const vb = vBand(w.wR, rTarget);
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{background: 'var(--g-tile)'}}>
                    <span className="text-xs font-semibold text-slate-300 w-12">Wk {weeks.indexOf(w)+1}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background: 'var(--g-border-2)'}}>
                      <div className="h-full rounded-full" style={{width: `${Math.min((w.wR/rTarget)*100, 100)}%`, background: vb.bg}}/>
                    </div>
                    <span className="text-xs font-bold" style={{color: vb.fg || vb.bg}}>{w.wR}</span>
                    <span className="text-[11px] text-slate-400">/ {rTarget}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mobileTab === 'trend' && (
          <div className="rounded-xl overflow-hidden" style={{background:"var(--g-panel-2)",border:"1px solid var(--g-border)"}}>
            <div className="px-4 py-2.5" style={{background:"var(--g-panel-2)",borderBottom:"1px solid var(--g-tile)"}}>
              <span className="text-xs font-semibold text-ink-max">Week-on-week</span>
            </div>
            <div className="p-3 space-y-1.5">
              {weeks.filter(w => w.wU > 0).map((w, i, arr) => {
                const delta = i > 0 ? w.wU - arr[i-1].wU : 0;
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{background: 'var(--g-tile)'}}>
                    <span className="text-xs font-semibold text-slate-300 w-12">Wk {weeks.indexOf(w)+1}</span>
                    <div className="flex items-center gap-1.5"><span className="text-sm font-bold text-slate-200">{w.wU}</span><span className="text-[11px] text-slate-400">urg</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-sm font-bold text-emerald-400">{w.wR}</span><span className="text-[11px] text-slate-400">rout</span></div>
                    {delta !== 0 && <span className={`text-xs font-bold ml-auto ${delta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{delta > 0 ? '↑' : '↓'}{Math.abs(delta)} urg</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Clinician capacity detail - a 28-day per-clinician breakdown, which
          is not the question the week detail is being asked. */}
      {capView !== 'week' && (
        <ClinicianCapacity data={data} huddleData={huddleData} routineOverrides={routOv} />
      )}
      </div>
      {staffTip && (
        <div className="fixed z-50 pointer-events-none" style={{ left: staffTip.x, top: staffTip.y - 8, transform: 'translate(-50%, -100%)' }}>
          <div className="rounded-xl p-3 shadow-2xl text-left" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.16)', minWidth: 200, maxWidth: 260 }}>
            <div className="text-caption font-semibold" style={{ color: staffTip.entry.isTotal ? 'var(--accent-text)' : 'var(--g-text-hi)' }}>{staffTip.entry.site.name}</div>
            <div className="text-caption mt-0.5" style={{ color: staffTip.entry.below ? 'var(--c-amber-2)' : 'var(--g-text-mid)' }}>
              {staffTip.entry.below
                ? `Below minimum: ${staffTip.entry.counted.length} counted, minimum ${staffTip.entry.threshold}`
                : staffTip.entry.threshold != null
                  ? `${staffTip.entry.counted.length} counted (minimum ${staffTip.entry.threshold})`
                  : `${staffTip.entry.counted.length} counted (no minimum set)`}
            </div>
            {staffTip.entry.sessions && Object.keys(staffTip.entry.sessions).length > 0 && (
              <div className="text-caption mt-0.5 text-slate-300">
                {['am','pm','eve'].filter((k) => k in staffTip.entry.sessions).map((k) => `${k.toUpperCase()} ${staffTip.entry.sessions[k]}`).join(' \u00b7 ')}
                {staffTip.entry.worstSession && Object.keys(staffTip.entry.sessions).length > 1 ? ` \u2014 colour follows worst (${staffTip.entry.worstSession.toUpperCase()})` : ''}
              </div>
            )}
            {staffTip.entry.counted.length > 0 && (
              <div className="mt-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-0.5">Counted - routine slots here</div>
                {staffTip.entry.counted.map((n) => <div key={n} className="text-caption text-slate-300 leading-normal">{n}</div>)}
              </div>
            )}
            {staffTip.entry.basedButOut.length > 0 && (
              <div className="mt-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-0.5">Based here - no routine slots today</div>
                {staffTip.entry.basedButOut.map((n) => <div key={n} className="text-caption text-slate-400 leading-normal">{n}</div>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
