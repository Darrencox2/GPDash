'use client';
import { useState, useRef, useMemo, useEffect } from 'react';
import { Button, Card } from '@/components/ui';
import { getHuddleCapacity, parseHuddleCSV, mergeHuddleData, getNDayAvailability, getDutyDoctor, getBand, getCliniciansForDate, getSiteColour } from '@/lib/huddle';
import SlotFilter from './SlotFilter';
import WhosInOut from './WhosInOut';
import HuddleFullscreen from './HuddleFullscreen';
import { guessGroupFromRole, matchesStaffMember, toLocalIso, toHuddleDateStr } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';
import { MiniGauge, SevenDayStrip, TwentyEightDayChart, ROLE_COLOURS, SpeedometerGauge } from './HuddleShared';

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
  const [huddleScreen, setHuddleScreen] = useState(null);

  // Auto-open screen 2 if ?huddle=2 in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('huddle') === '2') {
        setHuddleScreen(2);
        setIsFullscreen(true);
        const dateParam = params.get('date');
        if (dateParam) {
          const d = new Date(dateParam + 'T00:00:00');
          if (!isNaN(d.getTime())) setViewingDate(d);
        }
      }
    }
  }, []);
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
  const maxDate = useMemo(() => { const d = new Date(realToday); d.setDate(d.getDate() + 60); return d; }, [realToday]);
  const minDate = useMemo(() => { const d = new Date(realToday); d.setDate(d.getDate() - 60); return d; }, [realToday]);

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

  const sites = data?.roomAllocation?.sites || [];
  const siteCol = (name) => getSiteColour(name, sites);
  const teamClinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    return Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
  }, [data?.clinicians]);

  const processCSV = (csvText) => {
    try {
      const parsed = parseHuddleCSV(csvText);
      const merged = mergeHuddleData(huddleData, parsed);
      setHuddleData(merged);
      const uploadTime = new Date().toISOString();
      const newHs = { ...hs, knownClinicians: [...new Set([...(hs.knownClinicians||[]), ...merged.clinicians])], knownSlotTypes: [...new Set([...(hs.knownSlotTypes||[]), ...merged.allSlotTypes])], lastUploadDate: uploadTime };

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

      saveData({ ...data, clinicians: updatedClinicians, huddleCsvData: merged, huddleCsvUploadedAt: uploadTime, huddleSettings: newHs }, false);
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
  const viewingDateStr = toHuddleDateStr(viewingDate);
  const displayDate = huddleData?.dates?.includes(viewingDateStr) ? viewingDateStr : null;
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs, urgentOverrides) : null;
  const hasDataForDate = !!displayDate;
  // Check ALL slots (unfiltered) to determine if practice is open
  const allCapacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, {}) : null;
  const hasSlots = allCapacity && ((allCapacity.am.total||0) + (allCapacity.pm.total||0) + (allCapacity.am.embargoed||0) + (allCapacity.pm.embargoed||0) + (allCapacity.am.booked||0) + (allCapacity.pm.booked||0)) > 0;
  const viewingPrediction = useMemo(() => predictDemand(viewingDate, null), [viewingDate]);
  const isPracticeClosed = !hasSlots || viewingPrediction?.isBankHoliday || viewingDate.getDay() === 0 || viewingDate.getDay() === 6;

  const hasUrgentFilter = !!urgentOverrides;
  const hasRoutineFilter = !!routineOverrides;

  // 8AM daily snapshot — save today's capacity once per day
  useEffect(() => {
    if (!isViewingToday || !capacity || !displayDate || !huddleData) return;
    const now = new Date();
    if (now.getHours() < 8) return;
    const todayKey = toLocalIso(realToday);
    const existing = data.predictionHistory?.[todayKey];
    if (existing) return;
    const dutySlots = hs?.dutyDoctorSlot;
    const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
    const dutyAm = hasDuty ? getDutyDoctor(huddleData, displayDate, 'am', dutySlots, teamClinicians) : null;
    const dutyPm = hasDuty ? getDutyDoctor(huddleData, displayDate, 'pm', dutySlots, teamClinicians) : null;
    // Routine capacity (unfiltered for simplicity)
    const routineOv = hs?.savedSlotFilters?.routine;
    let routineTotal = 0;
    if (routineOv) {
      const rCap = getHuddleCapacity(huddleData, displayDate, hs, routineOv);
      routineTotal = (rCap.am.total||0) + (rCap.pm.total||0) + (rCap.am.embargoed||0) + (rCap.pm.embargoed||0) + (rCap.am.booked||0) + (rCap.pm.booked||0);
    }
    const snapshot = {
      savedAt: now.toISOString(),
      urgentAm: (capacity.am.total || 0) + (capacity.am.embargoed || 0) + (capacity.am.booked || 0),
      urgentPm: (capacity.pm.total || 0) + (capacity.pm.embargoed || 0) + (capacity.pm.booked || 0),
      urgentTotal: (capacity.am.total || 0) + (capacity.am.embargoed || 0) + (capacity.am.booked || 0) + (capacity.pm.total || 0) + (capacity.pm.embargoed || 0) + (capacity.pm.booked || 0),
      availAm: (capacity.am.total || 0) + (capacity.am.embargoed || 0),
      availPm: (capacity.pm.total || 0) + (capacity.pm.embargoed || 0),
      bookedAm: capacity.am.booked || 0,
      bookedPm: capacity.pm.booked || 0,
      dutyDoctorAm: dutyAm?.name || null,
      dutyDoctorPm: dutyPm?.name || null,
      routineTotal,
      clinicianCount: (capacity.am.byClinician?.length || 0),
    };
    saveData({ ...data, predictionHistory: { ...(data.predictionHistory || {}), [todayKey]: snapshot } }, false);
  }, [isViewingToday, capacity, displayDate, huddleData]);

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
    <div className="-m-4 lg:-m-6 min-h-screen animate-in" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)'}}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragging(true); } }} onDragLeave={e => { e.preventDefault(); setIsDragging(false); }} onDrop={e => { if (e.dataTransfer.types.includes('Files')) { onDrop(e); } }}>
    <div className="max-w-6xl mx-auto px-3 py-4 sm:p-4 lg:p-6 space-y-4">
      {isFullscreen && <HuddleFullscreen data={data} huddleData={huddleData} viewingDate={viewingDate} onExit={() => { setIsFullscreen(false); setHuddleScreen(null); if (huddleScreen === 2) window.close(); }} onNavigateDay={navigateDay} screen={huddleScreen} />}
      {isDragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none" style={{background:'rgba(15,23,42,0.7)'}}>
          <div className="glass rounded-2xl p-8 text-center" style={{border:'2px dashed rgba(16,185,129,0.4)'}}>
            <div className="text-4xl mb-2">📊</div>
            <div className="text-lg font-medium text-slate-200">Drop CSV here</div>
          </div>
        </div>
      )}

      {/* Date header with navigation */}
      <div className="flex items-center justify-between gap-2 mb-4 pl-12 lg:pl-0">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="glass-dark rounded-xl px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-1 sm:gap-3 cursor-pointer relative flex-shrink-0" onClick={() => setShowCalendar(!showCalendar)}>
            <button onClick={(e) => { e.stopPropagation(); navigateDay(-1); }} className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <div className="text-center px-1">
              <div className="font-mono-data text-2xl sm:text-3xl font-bold text-white leading-none">{viewingDate.getDate()}</div>
              <div className="text-[10px] sm:text-sm text-slate-500 uppercase tracking-wider">{viewingDate.toLocaleDateString('en-GB', { month: 'short' })}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); navigateDay(1); }} className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            {showCalendar && (
              <div className="absolute top-full left-0 mt-2 z-50 rounded-xl shadow-2xl p-3" style={{background:"#1e293b",border:"1px solid rgba(255,255,255,0.1)"}} onClick={e => e.stopPropagation()}>
                <input type="date" value={toLocalIso(viewingDate)} min={toLocalIso(minDate)} max={toLocalIso(maxDate)} onChange={(e) => goToDate(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.1)",color:"#e2e8f0"}} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-lg sm:text-2xl font-medium text-white truncate">
                {isViewingToday ? 'Today' : viewingDate.toLocaleDateString('en-GB', { weekday: 'short' })}
              </h1>
              {!isViewingToday && <button onClick={goToToday} className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium underline flex-shrink-0">today</button>}
            </div>
            <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">
              {viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
          <button onClick={() => fileRef.current?.click()}
            className="h-8 w-8 sm:w-auto sm:px-3 rounded-lg flex items-center justify-center sm:gap-1.5 text-xs font-medium text-white transition-colors"
            style={{ background: isUploadedToday ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.6)', border: `1px solid ${isUploadedToday ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}
            title={data?.huddleCsvUploadedAt ? `Uploaded ${new Date(data.huddleCsvUploadedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : 'No CSV uploaded'}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            <span className="hidden sm:inline">{isUploadedToday ? 'CSV uploaded' : 'Upload CSV'}</span>
          </button>
          <button onClick={() => setIsFullscreen(true)} className="h-8 w-8 sm:w-auto sm:px-3 rounded-lg flex items-center justify-center sm:gap-1.5 text-xs font-medium text-white transition-colors"
            style={{ background: 'rgba(124,58,237,0.7)', border: '1px solid rgba(124,58,237,0.3)' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
            <span className="hidden sm:inline">Huddle board</span>
          </button>
        </div>
      </div>

      {/* Not-today banner */}
      {!isViewingToday && (
        <div className="glass-dark rounded-lg p-3 flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-slate-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span className="text-xs text-slate-400">
            Viewing {viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {!hasDataForDate && huddleData && ' — no CSV data available for this date'}
          </span>
        </div>
      )}

      {error && <Card className="p-4 bg-red-50 border-red-200 text-red-700 text-sm">{error}</Card>}

      <div style={{ opacity: contentOpacity, transition: 'opacity 0.15s ease-in-out' }}>

      {/* ═══ DATA-DRIVEN SECTIONS ═══ */}
      {!huddleData ? (
        <div className="glass rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="font-heading text-lg font-medium text-slate-200 mb-2">Upload Appointment Report</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload or drag-and-drop your EMIS CSV to see urgent capacity.</p>
          <Button onClick={() => fileRef.current?.click()}>Select CSV File</Button>
        </div>
      ) : isPracticeClosed ? (
        <div className="glass rounded-xl overflow-hidden">
          <div className="py-16 px-6 text-center">
            <div className="mx-auto mb-4" style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <path d="M9 22V12h6v10" />
              </svg>
            </div>
            <h2 className="font-heading text-xl font-medium text-slate-300 mb-2">Practice closed</h2>
            <p className="text-sm text-slate-500">{viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            {viewingPrediction?.isBankHoliday && <span className="inline-block mt-3 text-xs font-medium px-3 py-1 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.1)' }}>Bank Holiday</span>}
          </div>
        </div>
      ) : (
        <>
      {/* ═══ SUMMARY GAUGE BAR ═══ */}
      {capacity && (() => {
        const urgTotal = (capacity.am.total || 0) + (capacity.am.embargoed || 0) + (capacity.am.booked || 0) + (capacity.pm.total || 0) + (capacity.pm.embargoed || 0) + (capacity.pm.booked || 0);
        const urgAvail = (capacity.am.total || 0) + (capacity.am.embargoed || 0) + (capacity.pm.total || 0) + (capacity.pm.embargoed || 0);
        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const todayDayName = dayNames[viewingDate.getDay()];
        const targetTotal = (hs.expectedCapacity?.[todayDayName]?.am || 0) + (hs.expectedCapacity?.[todayDayName]?.pm || 0);
        const coveragePct = targetTotal > 0 ? Math.round((urgTotal / targetTotal) * 100) : 0;
        const band = getBand(urgTotal, targetTotal);
        const pred = viewingPrediction;
        const predTotal = pred?.predicted || 0;
        const predBaseline = pred?.factors?.baseline || 0;
        const predDowEffect = pred?.factors?.dayOfWeek?.effect || 0;
        const predAvgDay = Math.round(predBaseline + predDowEffect);
        const predDiff = predTotal - predAvgDay;
        const predLabel = predDiff > 3 ? 'Higher than a normal ' + todayDayName : predDiff < -3 ? 'Lower than a normal ' + todayDayName : 'Typical for a ' + todayDayName;
        const predColour = predDiff > 3 ? '#f59e0b' : predDiff < -3 ? '#10b981' : '#94a3b8';
        const displayFactors = [];
        if (pred?.factors) {
          const f = pred.factors;
          if (f.schoolHoliday) displayFactors.push({ label: 'School holiday', impact: f.schoolHoliday });
          if (f.firstWeekBack) displayFactors.push({ label: 'First week back', impact: f.firstWeekBack });
          if (f.firstDayBack) displayFactors.push({ label: 'First day back', impact: f.firstDayBack });
          if (f.secondDayBack) displayFactors.push({ label: 'Second day back', impact: f.secondDayBack });
          if (f.nearBankHoliday) displayFactors.push({ label: `Near bank holiday (${f.nearBankHoliday.daysAway}d)`, impact: f.nearBankHoliday.effect });
          if (f.christmasPeriod) displayFactors.push({ label: 'Christmas period', impact: f.christmasPeriod });
          if (f.endOfMonth) displayFactors.push({ label: 'End of month', impact: f.endOfMonth });
          if (f.shortWeek) displayFactors.push({ label: `Short week (${f.shortWeek.workingDays}d)`, impact: f.shortWeek.effect });
          if (f.month) displayFactors.push({ label: `Month effect`, impact: f.month.effect });
          if (f.trend && Math.abs(f.trend.effect) >= 0.5) displayFactors.push({ label: 'Long-term trend', impact: Math.round(f.trend.effect) });
        }
        // Routine 28-day totals
        const routineDays28 = getNDayAvailability(huddleData, hs, 28, effectiveRoutineOverrides);
        const routine28 = routineDays28.filter(d => d.available !== null && !d.isWeekend);
        const routineAvail = routine28.reduce((s, d) => s + (d.available || 0), 0);
        const routineEmb = routine28.reduce((s, d) => s + (d.embargoed || 0), 0);
        // Clinicians: use CSV data when available, else working patterns
        const dateKey = toLocalIso(viewingDate);
        const viewingDateStr2 = toHuddleDateStr(viewingDate);
        const csvClinicians = huddleData?.dates?.includes(viewingDateStr2) ? getCliniciansForDate(huddleData, viewingDateStr2) : [];
        const plannedAbsences = (Array.isArray(data.plannedAbsences) ? data.plannedAbsences : []).filter(a => dateKey >= a.startDate && dateKey <= a.endDate);
        const absentIds = new Set(plannedAbsences.map(a => a.clinicianId));
        const visibleClinicians = teamClinicians.filter(c => c.status !== 'left' && c.status !== 'administrative' && c.showWhosIn !== false && !c.longTermAbsent);
        let inCount, offCount;
        if (csvClinicians.length > 0) {
          // Count unique clinicians in CSV that match our staff register
          const matchedIds = new Set();
          visibleClinicians.forEach(c => { if (csvClinicians.some(csvName => matchesStaffMember(csvName, c))) matchedIds.add(c.id); });
          inCount = matchedIds.size;
          offCount = visibleClinicians.length - inCount;
        } else {
          const scheduledToday = visibleClinicians.filter(c => c.workingPattern?.[todayDayName]);
          inCount = scheduledToday.filter(c => !absentIds.has(c.id)).length;
          offCount = visibleClinicians.length - inCount;
        }
        return (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* NOTICEBOARD — right column */}
            <div className="glass rounded-xl overflow-hidden flex flex-col md:order-2">
              <div className="px-4 py-2.5 flex items-center gap-2" style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span className="font-heading text-sm font-medium text-slate-300">Noticeboard</span>
                {huddleMessages.length > 0 && <span className="text-xs text-slate-600 ml-auto">{huddleMessages.length}</span>}
              </div>
              <div className="p-3 space-y-1.5 flex-1">
                {huddleMessages.length === 0 && <p className="text-sm text-slate-500 text-center py-3">No messages yet.</p>}
                {huddleMessages.map((msg, i) => {
                  const colours = ['#f59e0b','#3b82f6','#ec4899','#10b981','#8b5cf6'];
                  const c = colours[i % colours.length];
                  const initials = msg.author ? msg.author.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';
                  const time = msg.addedAt ? new Date(msg.addedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                    <div key={msg.id || i} className="flex items-start gap-2 px-2.5 py-2 rounded-lg group" style={{ borderLeft: `3px solid ${c}`, background: `${c}10` }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 mt-0.5" style={{ background: `${c}30`, color: c }}>{initials}</div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-slate-300 leading-tight block">{msg.text}</span>
                        {time && <span className="text-[10px] text-slate-600">{time}</span>}
                      </div>
                      <button onClick={() => removeMessage(i)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-xs mt-0.5">✕</button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5 p-3 pt-0">
                <input type="text" value={newAuthor} onChange={e => setNewAuthor(e.target.value)} placeholder="Name" className="w-16 px-2 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-500" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'#e2e8f0'}} />
                <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addMessage(); }} placeholder="Message..." className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-500" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'#e2e8f0'}} />
                <Button onClick={addMessage} size="sm">+</Button>
              </div>
            </div>
            {/* SUMMARY — spans first 3 cols */}
            <div className="glass rounded-xl p-5 md:col-span-3 md:order-1">
              <div className="flex flex-col md:flex-row gap-5 items-stretch">
                <div className="flex-shrink-0 flex items-center justify-center">
                  <SpeedometerGauge percentage={coveragePct} className="w-full max-w-[300px]" width={null} viewBox="0 0 300 145" slots={urgTotal} target={targetTotal} />
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="glass-inner rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-sm text-slate-500 mb-1">Predicted demand</div>
                    <div className="font-mono-data text-3xl md:text-5xl font-bold text-amber-400 leading-none">{predTotal || '—'}</div>
                    <div className="text-sm text-slate-600 mt-1">requests today</div>
                  </div>
                  <div className="glass-inner rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-sm text-slate-500 mb-1">Urgent available</div>
                    <div className="font-mono-data text-3xl md:text-5xl font-bold leading-none" style={{color:band.colour}}>{urgAvail}</div>
                    <div className="text-sm text-slate-600 mt-1">appointments today</div>
                  </div>
                  <div className="glass-inner rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-sm text-slate-500 mb-1">Routine 28 days</div>
                    <div className="font-mono-data text-3xl md:text-5xl font-bold text-emerald-400 leading-none">{routineAvail + routineEmb}</div>
                    <div className="text-sm text-slate-600 mt-1">{routineEmb > 0 ? `${routineAvail} avail · ${routineEmb} emb` : 'available'}</div>
                  </div>
                  <div className="glass-inner rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-sm text-slate-500 mb-1">Clinicians today</div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono-data text-3xl md:text-5xl font-bold text-white leading-none">{inCount}</span>
                      
                    </div>
                    <div className="text-sm text-slate-600 mt-1">of {visibleClinicians.length} active</div>
                  </div>
                </div>
              </div>
            {predTotal > 0 && (
              <div className="glass-inner rounded-xl p-4 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={predColour} strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  <span className="text-lg font-medium" style={{color:predColour}}>{predLabel}</span>
                </div>
                <div className="text-sm text-slate-400 leading-relaxed">
                  Average {todayDayName} sees {predAvgDay} requests.
                  {displayFactors.filter(f => f.impact !== 0).slice(0, 2).map((f, i) => ` ${f.label} ${f.impact > 0 ? '+' : ''}${f.impact}.`).join('') || ''}
                </div>
                <details className="mt-2">
                  <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-300 flex items-center gap-1">
                    Demand factors
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Base {todayDayName} avg</span><span className="font-bold text-slate-300 font-mono-data">{predAvgDay}</span></div>
                    {displayFactors.filter(f => f.impact !== 0).map((f, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-slate-500">{f.label}</span>
                        <span className="font-bold font-mono-data" style={{color: f.impact > 0 ? '#ef4444' : f.impact < 0 ? '#10b981' : '#475569'}}>{f.impact > 0 ? '+' : ''}{f.impact}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm pt-1.5 mt-1.5" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                      <span className="text-slate-300 font-medium">Predicted total</span>
                      <span className="font-bold text-amber-400 font-mono-data">{predTotal}</span>
                    </div>
                  </div>
                </details>
              </div>
            )}
            </div>
          </div>
        );
      })()}

      {/* ═══ URGENT ON THE DAY ═══ */}
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
              const cliniciansAfterDuty = dutyDocDisplay
                ? allClinicians.filter(c => !matchesStaffMember(c.name, { name: dutyDocDisplay.name, aliases: [] }))
                : allClinicians;

              // Duty support = clinician with most total slots (after removing duty doctor and exclusions)
              // Must have at least 5 urgent slots AND at least 2 more than runner-up
              const supportCandidates = cliniciansAfterDuty.filter(c => !c.displayName?.toLowerCase().includes('balson'));
              const sortedSupport = [...supportCandidates].sort((a, b) => b.total - a.total);
              const topSupport = sortedSupport[0] || null;
              const runnerUp = sortedSupport[1] || null;
              const dutySupportClin = topSupport && topSupport.total >= 5 && topSupport.total >= ((runnerUp?.total || 0) + 2) ? topSupport : null;
              const dutySupportDisplay = dutySupportClin ? dutySupportClin : null;

              // Filter duty support out of main list
              const clinicians = dutySupportDisplay
                ? cliniciansAfterDuty.filter(c => c.name !== dutySupportDisplay.name)
                : cliniciansAfterDuty;

              const dutyLocCol = dutyDocDisplay?.location ? siteCol(dutyDocDisplay.location) : null;
              const dutyLocLetter = dutyDocDisplay?.location ? dutyDocDisplay.location.charAt(0) : '';
              const supportLocCol = dutySupportDisplay?.location ? siteCol(dutySupportDisplay.location) : null;
              const supportLocLetter = dutySupportDisplay?.location ? dutySupportDisplay.location.charAt(0) : '';

              return (
                <div className="flex-1 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-mono-data text-4xl md:text-6xl font-bold leading-none" style={{ color: band.colour }}>{slots}</span>
                    <div className="flex-1">
                      <div className="relative">
                        <div className="h-2.5 rounded-full relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="absolute left-0 top-0 bottom-0" style={{ width: `${Math.min(bar.fillPct, 100)}%`, display:'flex', borderRadius: '5px' }}>
                            {avail > 0 && <div style={{flex: avail, background: band.colour}} />}
                            {booked > 0 && <div style={{flex: booked, background: '#f59e0b'}} />}
                          </div>
                        </div>
                        {target > 0 && <div className="absolute z-[2]" style={{ left: `${Math.min(bar.markerPct, 100)}%`, top: '50%', transform: 'translate(-50%, -50%)' }}><div style={{width:14,height:14,borderRadius:'50%',border:`2.5px solid ${band.colour}`,background:'#0f172a',boxShadow:`0 0 8px ${band.colour}`}} /></div>}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:`${band.colour}20`,color:band.colour}}>{band.label} · {Math.round(band.pct)}%</span>
                          <span className="text-sm text-slate-400">{avail} available{booked > 0 ? <span> · {booked} booked</span> : ''}{added > 0 ? <span style={{color:'#818cf8'}}> · +{added} since 8am</span> : ''}</span>
                        </div>
                        {target > 0 && <span className="text-sm text-slate-500">target {target}</span>}
                      </div>
                    </div>
                  </div>
                  {dutyDocDisplay && (
                    <div className="rounded-lg overflow-hidden mb-2" style={{ background: '#dc2626', boxShadow: '0 2px 8px rgba(220,38,38,0.2)' }}>
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="white" className="flex-shrink-0"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{dutyDocDisplay.title ? `${dutyDocDisplay.title} ` : ''}{dutyDocDisplay.name}</div>
                          <div className="text-xs text-white/60">Duty · {dutyDocDisplay.location || '?'}</div>
                        </div>
                        <span className="font-mono-data text-base font-bold text-white flex-shrink-0">{dutyDocDisplay.total}</span>
                      </div>
                    </div>
                  )}
                  {dutySupportDisplay && (
                    <div className="rounded-lg overflow-hidden mb-3" style={{ background: '#2563eb', boxShadow: '0 2px 8px rgba(37,99,235,0.2)' }}>
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="flex-shrink-0"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{dutySupportDisplay.displayName}</div>
                          <div className="text-xs text-white/60">Support · {dutySupportDisplay.location || '?'}</div>
                        </div>
                        <span className="font-mono-data text-base font-bold text-white flex-shrink-0">{dutySupportDisplay.total}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {clinicians.map((c, i) => {
                      const locPill = c.location ? siteCol(c.location) : null;
                      return (
                        <div key={i} className="glass-inner rounded-lg px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{fontFamily:"'Outfit',sans-serif",background: band.colour, boxShadow:`0 0 6px ${band.colour}30`}}>{c.initials}</div>
                            <div className="min-w-0">
                              <span className="text-sm text-slate-200 truncate">{c.displayName}</span>
                              {c.role && <div className="text-xs text-slate-400">{c.role}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-mono-data text-sm font-bold" style={{color: band.colour}}>{c.total}</span>
                            {locPill && <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-white" style={{background:locPill}}>{c.location.charAt(0)}</div>}
                          </div>
                        </div>
                      );
                    })}
                    {clinicians.length === 0 && <div className="text-center text-slate-400 text-sm py-3">No capacity</div>}
                  </div>
                </div>
              );
            };

            return (
              <div className="rounded-xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="glass-header px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span className="font-heading text-base font-medium text-slate-200">Urgent on the day</span>
                    <SlotFilter overrides={urgentOverrides} setOverrides={setUrgentOverrides} knownSlotTypes={knownSlotTypes} title="Urgent Slot Filter" dutyDoctorSlot={dutyDoctorSlot} setDutyDoctorSlot={setDutyDoctorSlot} />
                  </div>
                </div>
                {displayDate && displayDate !== viewingDateStr && (
                  <div className="px-4 py-2 text-xs text-amber-400 flex items-center gap-2" style={{background:'rgba(245,158,11,0.1)',borderBottom:'1px solid rgba(245,158,11,0.1)'}}>Date not found in report. Showing {displayDate}.</div>
                )}
                {urgentOverrides && Object.values(urgentOverrides).every(v => !v) ? (
                  <div className="py-12 px-6 text-center glass-inner rounded-b-xl">
                    <div className="text-slate-600 mb-2" style={{fontSize:32}}>↑</div>
                    <h3 className="text-base font-semibold text-slate-300 mb-1">No slots selected</h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">Open the filter above to choose which slot types to include as urgent on the day.</p>
                  </div>
                ) : (<>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                  <div className="rounded-xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,0.06)'}}>
                    <div className="glass-header px-4 py-2.5 rounded-t-xl">
                      <span className="font-heading text-sm font-medium text-slate-400">Morning</span>
                    </div>
                    <div style={{background:'rgba(15,23,42,0.4)'}}>
                      <SessionPanel label="Morning" slots={urgentAm} avail={availAm} booked={bookedAm} added={addedAm} target={expectedAm} band={amBand} isShort={false} sessionData={capacity.am} dutyDoc={hasDutySlot ? getDutyDoctor(huddleData, displayDate, 'am', dutyDoctorSlot, teamClinicians) : null} />
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,0.06)'}}>
                    <div className="glass-header px-4 py-2.5 rounded-t-xl">
                      <span className="font-heading text-sm font-medium text-slate-400">Afternoon</span>
                    </div>
                    <div style={{background:'rgba(15,23,42,0.4)'}}>
                      <SessionPanel label="Afternoon" slots={urgentPm} avail={availPm} booked={bookedPm} added={addedPm} target={expectedPm} band={pmBand} isShort={pmBand.colour === '#ef4444' || pmBand.colour === '#f59e0b'} sessionData={capacity.pm} dutyDoc={hasDutySlot ? getDutyDoctor(huddleData, displayDate, 'pm', dutyDoctorSlot, teamClinicians) : null} />
                    </div>
                  </div>
                </div>

                {/* Slot type breakdown — collapsible */}
                {capacity.bySlotType.length > 0 && (
                  <details className="mx-4 mb-3">
                    <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 flex items-center gap-1 py-1">
                      Slot type breakdown
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                    </summary>
                    <div className="glass-inner rounded-lg p-3 mt-1 space-y-1.5">
                      {capacity.bySlotType.map((s, i) => {
                        const allAvail = (s.total || 0) + (s.totalEmb || 0);
                        const allBooked = s.totalBook || 0;
                        const slotTotal = allAvail + allBooked;
                        if (slotTotal === 0) return null;
                        const locs = s.byLocation || {};
                        const LOC_C = { 'Winscombe': '#a855f7', 'Banwell': '#10b981', 'Locking': '#f97316' };
                        const locEntries = ['Winscombe','Banwell','Locking'].map(loc => ({ loc, count: locs[loc] || 0, col: LOC_C[loc] })).filter(l => l.count > 0);
                        const locTotal = locEntries.reduce((sum, l) => sum + l.count, 0) || 1;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className="text-xs text-slate-400 truncate" style={{width:130,textAlign:'right',flexShrink:0}} title={s.name}>{s.name}</div>
                            <div style={{flex:1,height:10,borderRadius:3,overflow:'hidden',background:'rgba(255,255,255,0.06)',display:'flex'}}>
                              {locEntries.map((l,j) => <div key={j} style={{width:(l.count/locTotal)*100+'%',height:10,background:l.col,minWidth:2}} title={`${l.loc}: ${l.count}`} />)}
                            </div>
                            <span className="font-mono-data text-xs font-bold text-slate-300" style={{minWidth:20,textAlign:'right'}}>{slotTotal}</span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
                </>)}
              </div>
            );
          })()}

      {/* WHO'S IN / OUT */}
      <WhosInOut data={data} saveData={saveData} huddleData={huddleData} onNavigate={setActiveSection} viewingDate={viewingDate} />

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
              <div className="rounded-xl overflow-hidden glass-dark">
                <div className="glass-header px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-heading text-base font-medium text-slate-200">Routine Capacity</div>
                      <div className="text-[13px] text-slate-600">30-day availability overview</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setActiveSection('huddle-forward')} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">Clinician detail →</button>
                      <SlotFilter overrides={routineOverrides} setOverrides={setRoutineOverrides} knownSlotTypes={knownSlotTypes} title="Routine Slot Filter" />
                    </div>
                  </div>
                </div>

                {routineOverrides && Object.values(routineOverrides).every(v => !v) ? (
                  <div className="py-12 px-6 text-center glass-inner">
                    <div className="text-slate-600 mb-2" style={{fontSize:32}}>↑</div>
                    <h3 className="text-base font-semibold text-slate-300 mb-1">No slots selected</h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">Open the filter above to choose which slot types to include as routine capacity.</p>
                  </div>
                ) : (<>
                {/* Booking gauges — non-overlapping weekly ranges */}
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/10 border-b border-white/10">
                  {periodGauges.map(g => (
                    <div key={g.label} className="flex flex-col items-center py-4 px-2">
                      <MiniGauge value={g.avail} max={g.total} size={100} strokeWidth={8} colour={g.colour}>
                        <text x="50" y="44" textAnchor="middle" fill="#e2e8f0" style={{ fontSize: '22px', fontWeight: 700 }}>{Math.round(g.pct)}%</text>
                        <text x="50" y="58" textAnchor="middle" fill="#64748b" style={{ fontSize: '10px' }}>available</text>
                      </MiniGauge>
                      <div className="text-[13px] font-semibold text-slate-300 mt-1">{g.label}</div>
                      <div className="text-[13px] text-slate-500">{g.avail} available · {g.booked} booked</div>
                    </div>
                  ))}
                </div>

                <details className="border-t border-white/10">
                  <summary className="px-4 py-2 text-xs text-slate-500 cursor-pointer hover:text-slate-300 flex items-center justify-center gap-1">
                    28-day chart
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                  </summary>
                  <TwentyEightDayChart huddleData={huddleData} huddleSettings={hs} overrides={effectiveRoutineOverrides} teamClinicians={teamClinicians} />
                </details>
                </>)}
              </div>
            );
          })()}

          {/* ─── CUSTOM CAPACITY CARDS (14 days each) ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {capacityCards.map(card => {
              const gradient = GRADIENT_MAP[card.colour] || GRADIENT_MAP.violet;
              const overrides = cardOverrides[card.id] || null;
              const effective = overrides || allSlotsOverrides;
              return (
                <div key={card.id} className="rounded-xl overflow-visible group relative glass-dark">
                  <div className="glass-header px-4 py-2.5 rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-heading text-base font-medium text-slate-200">{card.title}</div>
                        <div className="text-xs text-slate-600">Next 14 days</div>
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
                className="glass-inner rounded-xl flex items-center justify-center border-2 border-dashed transition-colors hover:border-slate-500"
                style={{borderColor:'rgba(255,255,255,0.08)', minHeight:80}}>
                <div className="text-center">
                  <div className="text-lg text-slate-600 leading-none">+</div>
                  <div className="text-xs text-slate-500 mt-1">Add card</div>
                </div>
              </button>
            ) : (
              <div className="glass rounded-xl p-3">
                <div className="flex gap-2 mb-2">
                  <input type="text" value={newCardTitle} onChange={e => setNewCardTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCapacityCard(); }}
                    placeholder="Card title..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500" autoFocus />
                  <Button onClick={addCapacityCard} size="sm" disabled={!newCardTitle.trim()}>Add</Button>
                  <button onClick={() => { setShowAddCard(false); setNewCardTitle(''); }} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {CARD_COLOURS.map(c => (
                    <button key={c.key} onClick={() => setNewCardColour(c.key)} title={c.label}
                      className={`w-5 h-5 rounded bg-gradient-to-r ${c.gradient} transition-all ${newCardColour === c.key ? 'ring-2 ring-white/40 ring-offset-1 ring-offset-slate-900 scale-110' : 'opacity-50 hover:opacity-100'}`} />
                  ))}
                </div>
              </div>
            )}
          </div>

        </>
      )}
      </div>
    </div>
    </div>
  );
}
