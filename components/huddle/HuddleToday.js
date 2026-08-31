'use client';
import { useState, useRef, useMemo, useEffect } from 'react';
import { Button, Card, EmptyState } from '@/components/ui';
import { getHuddleCapacity, parseHuddleCSV, mergeHuddleData, getNDayAvailability, getPastWeeksRoutine, getDutyDoctor, getDutyDoctorDiagnostic, getBand, getCliniciansForDate, getSiteColour, getActiveSlotTypes } from '@/lib/huddle';
import SlotFilter from './SlotFilter';
import WhosInOut from './WhosInOut';
import HuddleFullscreen from './HuddleFullscreen';
import { guessGroupFromRole, buddyDefaultsForRole, matchesStaffMember, toLocalIso, toHuddleDateStr, logEvent } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';
import { getSchoolHolidaysForLEA } from '@/lib/school-holidays-by-lea';
import { MiniGauge, SevenDayStrip, TwentyEightDayChart, ROLE_COLOURS, SpeedometerGauge, ACCENT_BAR_COLOURS, ClinicianDayPanel } from './HuddleShared';
import { canEditPracticeData } from '@/lib/permissions';
import { inferWeeklyRota } from '@/lib/auto-rota';
import NhsBenchmarkRibbon from './NhsBenchmarkRibbon';
import RoutineWaitTime from './RoutineWaitTime';
import { onKeyActivate } from '@/lib/a11y';

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

// New practices start with no capacity cards. The empty state below the
// "Add card" button explains how to create them. Previously HuddleToday
// referenced DEFAULT_CAPACITY_CARDS without declaring it — the only reason
// the page didn't crash for new practices was that hs?.capacityCards
// happened to be truthy after they ran setup. This makes the fallback
// explicit and safe.
const DEFAULT_CAPACITY_CARDS = [];

// Allowed durations for the per-card period selector. 7/14/21/28 covers
// most needs — short rolling outlook (1 week), default fortnight, three
// weeks, and full month.
const CARD_DURATIONS = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 21, label: '21 days' },
  { days: 28, label: '28 days' },
];


// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function HuddleToday({ data, saveData, toast, huddleData, setHuddleData, huddleMessages, setHuddleMessages, setActiveSection }) {
  const canEdit = canEditPracticeData(data);
  const [newMsg, setNewMsg] = useState('');
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
  const saved = hs?.savedSlotFilters || {};
  // The universe of slot types the filter picker can show. Historically this
  // was just hs.knownSlotTypes (the permanent union built on CSV upload via
  // the Today page). But practices set up through the onboarding wizard get
  // their slot filters saved without hs.knownSlotTypes ever being populated,
  // which left the picker empty ("24 of 0 selected"). So build the union of
  // every source we have: the stored known list, the live CSV's slot types,
  // and any slot names already present in the saved routine/urgent filters.
  const knownSlotTypes = useMemo(() => {
    const set = new Set();
    (hs?.knownSlotTypes || []).forEach(s => set.add(s));
    (huddleData?.allSlotTypes || []).forEach(s => set.add(s));
    Object.keys(saved.routine || {}).forEach(s => set.add(s));
    Object.keys(saved.urgent || {}).forEach(s => set.add(s));
    (Array.isArray(hs?.dutyDoctorSlot) ? hs.dutyDoctorSlot : (hs?.dutyDoctorSlot ? [hs.dutyDoctorSlot] : [])).forEach(s => set.add(s));
    return Array.from(set);
  }, [hs?.knownSlotTypes, huddleData?.allSlotTypes, saved.routine, saved.urgent, hs?.dutyDoctorSlot]);
  // Slot types that actually have count data in the current huddleData
  // (vs the permanent union above). Used by SlotFilter to visually
  // distinguish stale entries — see getActiveSlotTypes docstring.
  const activeSlotTypes = useMemo(() => getActiveSlotTypes(huddleData), [huddleData]);

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
  // Drag-and-drop state for reordering capacity cards. We track the index
  // being dragged + the index it's hovering over for the drop indicator.
  const [draggingCardIdx, setDraggingCardIdx] = useState(null);
  const [dragOverCardIdx, setDragOverCardIdx] = useState(null);
  // Clicking a clinician in the urgent on-the-day list opens their slot
  // breakdown in a side panel. Store both the clinician name (for lookup
  // in the parsed CSV) and the accent colour to use for the panel —
  // matches whichever band colour the clinician was rendered in.
  const [selectedUrgentClinician, setSelectedUrgentClinician] = useState(null);

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
    if (!canEdit) return;
    const newSaved = { ...data.huddleSettings?.savedSlotFilters, [key]: value };
    saveData({ ...data, huddleSettings: { ...hs, savedSlotFilters: newSaved } }, false);
  };
  const setUrgentOverrides = (v) => { if (!canEdit) return; setUrgentOverridesLocal(v); persistFilter('urgent', v); };
  const setRoutineOverrides = (v) => { if (!canEdit) return; setRoutineOverridesLocal(v); persistFilter('routine', v); };
  const dutyDoctorSlot = hs?.dutyDoctorSlot || null;
  const hasDutySlot = dutyDoctorSlot && (!Array.isArray(dutyDoctorSlot) || dutyDoctorSlot.length > 0);
  const setDutyDoctorSlot = (v) => { if (!canEdit) return; saveData({ ...data, huddleSettings: { ...hs, dutyDoctorSlot: v && v.length > 0 ? v : null } }, false); };
  const setCardOverride = (cardId, v) => {
    if (!canEdit) return;
    setCardOverrides(prev => ({ ...prev, [cardId]: v }));
    persistFilter(cardId, v);
  };

  const capacityCards = hs?.capacityCards || DEFAULT_CAPACITY_CARDS;

  const addCapacityCard = () => {
    if (!canEdit) return;
    if (!newCardTitle.trim()) return;
    const id = 'card_' + Date.now();
    // Default to 14 days — the previous fixed duration, so existing cards
    // that are missing the field render the same as before via the
    // (card.days || 14) fallback at render time.
    const newCard = { id, title: newCardTitle.trim(), colour: newCardColour, days: 14 };
    const updatedCards = [...capacityCards, newCard];
    saveData({ ...data, huddleSettings: { ...hs, capacityCards: updatedCards } });
    setCardOverrides(prev => ({ ...prev, [id]: null }));
    setNewCardTitle('');
    setShowAddCard(false);
  };

  // Update any field on an existing card. Used by the duration picker
  // and the inline title/colour editors.
  const updateCapacityCard = (cardId, patch) => {
    if (!canEdit) return;
    const updatedCards = capacityCards.map(c => c.id === cardId ? { ...c, ...patch } : c);
    saveData({ ...data, huddleSettings: { ...hs, capacityCards: updatedCards } });
  };

  // Reorder cards via drag-and-drop. Pure index shuffle: pull the dragged
  // card out of its current position and splice it in at the target index.
  const reorderCapacityCards = (fromIdx, toIdx) => {
    if (!canEdit) return;
    if (fromIdx === toIdx || fromIdx == null || toIdx == null) return;
    const next = [...capacityCards];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    saveData({ ...data, huddleSettings: { ...hs, capacityCards: next } });
  };

  // Palette for the card-settings panel. Maps the existing CARD_COLOURS
  // entries into {key, label, hex} consumed by SlotFilter's cardSettings
  // prop. Hex from ACCENT_BAR_COLOURS so the swatch matches the actual
  // bar colour the user will see on the card.
  const cardPalette = useMemo(
    () => CARD_COLOURS.map(c => ({ key: c.key, label: c.label, hex: ACCENT_BAR_COLOURS[c.key] || '#8b5cf6' })),
    []
  );

  const removeCapacityCard = (cardId) => {
    if (!canEdit) return;
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
      // Some CSVs have parens that hold a TITLE rather than a role — e.g.
      // "Smith, Jane (Mrs)" or "Brown, Tom (Dr)". We must not capture
      // those as the clinician's role; otherwise the dropdown ends up
      // showing "Mrs (custom)" / "Dr (custom)" and the user has to fix
      // every row by hand. Treat title-like parens as "no role detected".
      const TITLE_LIKE = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'doctor', 'prof', 'professor', 'rev', 'reverend', 'sir', 'dame', 'lord', 'lady']);
      (parsed.clinicians || []).forEach(csvName => {
        const matched = updatedClinicians.some(c => matchesStaffMember(csvName, c));
        if (!matched) {
          const roleMatch = csvName.match(/\(([^)]+)\)/);
          const rawRole = roleMatch ? roleMatch[1].trim() : '';
          // If the parens were just a title, drop the role (let the user
          // pick a real one in Quick Setup). Otherwise use what was found,
          // or fall back to empty string so the row flags as needs-attention.
          const role = (!rawRole || TITLE_LIKE.has(rawRole.toLowerCase())) ? '' : rawRole;
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
          // Role-aware buddy defaults — GP Partners + Salaried GPs default
          // in AND can cover; Registrars + ANPs default in but can't cover;
          // everyone else off. Matches the wizard's CSV import behaviour.
          const buddyDefaults = buddyDefaultsForRole(role);
          updatedClinicians.push({
            id: newId, name, initials, role, group: guessGroupFromRole(role),
            sessions: 0, primaryBuddy: null, secondaryBuddy: null,
            status: 'active', longTermAbsent: false,
            ...buddyDefaults,
            showWhosIn: true, source: 'csv', confirmed: false, aliases: [csvName],
          });
          newCount++;
        }
      });

      const updated = { ...data, clinicians: updatedClinicians, huddleCsvData: merged, huddleCsvUploadedAt: uploadTime, huddleSettings: newHs };

      // ─── First-upload baseline: auto-generate weekly working pattern ────
      // If the practice has no working-pattern data yet (fresh setup, or
      // explicit reset), infer everyone's pattern from the CSV history so
      // the user has a baseline to refine instead of starting from scratch.
      //
      // We use the permissive filter (every active, non-administrative
      // clinician with CSV activity, regardless of buddyCover) — and for
      // anyone we can infer a pattern for, we also flip buddyCover=true
      // so they show up in the rota grid. This is what makes the baseline
      // actually visible to the user; without the buddyCover flip the
      // weeklyRota entries are set but the UI hides them.
      //
      // Only fires on the FIRST upload (existing weeklyRota empty). On
      // subsequent uploads the user has already curated their team and
      // we don't want to clobber their decisions.
      const existingRota = data.weeklyRota || {};
      const hasExistingPattern = Object.values(existingRota).some(arr => Array.isArray(arr) && arr.length > 0);
      let inferredCount = 0;
      if (!hasExistingPattern && updatedClinicians.length > 0) {
        const result = inferWeeklyRota({
          huddleData: merged,
          clinicians: updatedClinicians,
          huddleSettings: newHs,
          plannedAbsences: data.plannedAbsences || [],
          existingRota,
          includeOnlyBuddyCover: false, // permissive: capture everyone with CSV activity
        });
        if (!result.error) {
          // Set buddyCover=true for every clinician we successfully inferred
          // a pattern for — otherwise the rota grid (which filters by
          // buddyCover) wouldn't show them and the baseline would be invisible.
          const inferredIds = new Set(
            (result.summary || []).filter(s => !s.incomplete).map(s => s.clinicianId)
          );
          inferredCount = inferredIds.size;
          if (inferredCount > 0) {
            updatedClinicians = updatedClinicians.map(c =>
              inferredIds.has(c.id) ? { ...c, buddyCover: true } : c
            );
            updated.clinicians = updatedClinicians;
            updated.weeklyRota = result.newRota;
          }
        }
      }

      const descParts = [`CSV uploaded`];
      if (newCount > 0) descParts.push(`${newCount} new staff`);
      if (inferredCount > 0) descParts.push(`patterns inferred for ${inferredCount}`);
      const desc = descParts.length > 1 ? descParts.join(' — ') : descParts[0];
      saveData(logEvent(updated, 'csv', desc, { newStaffCount: newCount, inferredPatterns: inferredCount }), false);

      // Toast: surface auto-inference if it happened — it's a substantial
      // one-time event and the user wants to know it ran.
      let msg;
      if (inferredCount > 0 && newCount > 0) {
        msg = `Report uploaded — ${newCount} new staff discovered, working patterns inferred for ${inferredCount}. Review on Team → Rota.`;
      } else if (inferredCount > 0) {
        msg = `Report uploaded — working patterns inferred for ${inferredCount} clinicians. Review on Team → Rota.`;
      } else if (newCount > 0) {
        msg = `Report uploaded — ${newCount} new staff discovered`;
      } else {
        msg = 'Report uploaded successfully';
      }
      toast(msg, (newCount > 0 || inferredCount > 0) ? 'warning' : 'success');
      setError('');
    } catch (err) { setError('Failed to parse CSV: ' + err.message); toast('Failed to parse CSV', 'error'); }
  };

  const onFileChange = (e) => { if (!canEdit) return; const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => processCSV(ev.target.result); r.readAsText(f); e.target.value = ''; };
  const onDrop = (e) => { if (!canEdit) return; e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (!f || !f.name.endsWith('.csv')) { toast('Please drop a CSV file', 'warning'); return; } const r = new FileReader(); r.onload = (ev) => processCSV(ev.target.result); r.readAsText(f); };

  const addMessage = () => {
    if (!canEdit) return;
    if (!newMsg.trim()) return;
    // Author is always the logged-in user — pulled from _v4.userName which
    // resolves to linked clinician name → profile name → email local part.
    const author = data?._v4?.userName || null;
    const updated = [...huddleMessages, { id: Date.now(), text: newMsg.trim(), author, addedAt: new Date().toISOString() }];
    setHuddleMessages(updated);
    saveData({ ...data, huddleMessages: updated }, false);
    setNewMsg('');
  };
  const removeMessage = (i) => { if (!canEdit) return; const updated = huddleMessages.filter((_, idx) => idx !== i); setHuddleMessages(updated); saveData({ ...data, huddleMessages: updated }, false); };

  const isUploadedToday = data?.huddleCsvUploadedAt ? new Date(data.huddleCsvUploadedAt).toDateString() === realToday.toDateString() : false;
  const viewingDateStr = toHuddleDateStr(viewingDate);
  const displayDate = huddleData?.dates?.includes(viewingDateStr) ? viewingDateStr : null;
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs, urgentOverrides) : null;
  const hasDataForDate = !!displayDate;
  // Check ALL slots (unfiltered) to determine if practice is open
  const allCapacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, {}) : null;
  const hasSlots = allCapacity && ((allCapacity.am.total||0) + (allCapacity.pm.total||0) + (allCapacity.am.embargoed||0) + (allCapacity.pm.embargoed||0) + (allCapacity.am.booked||0) + (allCapacity.pm.booked||0)) > 0;
  // Build per-practice prediction options once. demandSettings comes from
  // the practice's NHS auto-seed or AskMyGP CSV calibration; school holidays
  // come from postcodes.io → LEA at setup time. Falls back gracefully if
  // either is missing (predictor falls back to list-size-scaled defaults
  // and flags the result with usingFallback so the UI shows a banner).
  const predictionOptions = useMemo(() => {
    const opts = {};
    if (data?._v4?.demandSettings) opts.demandSettings = data._v4.demandSettings;
    if (data?._v4?.practiceAdminDistrict) {
      const cal = getSchoolHolidaysForLEA(data._v4.practiceAdminDistrict);
      if (cal?.ranges) opts.schoolHolidayRanges = cal.ranges;
    }
    // List size is used by the fallback path to scale the generic
    // baseline proportionally. When the practice has no demand_settings
    // yet, this gives a much better first-time estimate than returning
    // an 11k-list-size practice's numbers verbatim.
    if (typeof data?._v4?.practiceListSize === 'number') {
      opts.listSize = data._v4.practiceListSize;
    }
    return opts;
  }, [data?._v4?.demandSettings, data?._v4?.practiceAdminDistrict, data?._v4?.practiceListSize]);
  const viewingPrediction = useMemo(
    () => predictDemand(viewingDate, null, predictionOptions),
    [viewingDate, predictionOptions]
  );
  const isPracticeClosed = !hasSlots || viewingPrediction?.isBankHoliday || viewingDate.getDay() === 0 || viewingDate.getDay() === 6;

  // A closed day was a dead end: a large empty card and no way onward. Step
  // forward to the next weekday that is not a bank holiday. Capped at 14 days
  // so a long shutdown cannot loop, and it lands on a weekday regardless.
  const jumpToNextOpenDay = () => {
    const d = new Date(viewingDate);
    for (let i = 0; i < 14; i++) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      if (predictDemand(d, null, predictionOptions)?.isBankHoliday) continue;
      setViewingDate(d);
      return;
    }
    setViewingDate(d);
  };

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
    <div className="-m-4 lg:-m-6 min-h-screen animate-in" style={{background:'var(--app-bg)'}}
      onDragOver={canEdit ? e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragging(true); } } : undefined}
      onDragLeave={canEdit ? e => { e.preventDefault(); setIsDragging(false); } : undefined}
      onDrop={canEdit ? e => { if (e.dataTransfer.types.includes('Files')) { onDrop(e); } } : undefined}>
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
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="glass-dark rounded-xl px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-1 sm:gap-3 cursor-pointer relative flex-shrink-0" role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={() => setShowCalendar(!showCalendar)}>
            <button aria-label="Previous day" onClick={(e) => { e.stopPropagation(); navigateDay(-1); }} className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <div className="text-center px-1">
              <div className="font-mono-data text-2xl sm:text-3xl font-bold text-slate-900 leading-none">{viewingDate.getDate()}</div>
              <div className="text-[11px] sm:text-sm text-slate-400 uppercase tracking-wider">{viewingDate.toLocaleDateString('en-GB', { month: 'short' })}</div>
            </div>
            <button aria-label="Next day" onClick={(e) => { e.stopPropagation(); navigateDay(1); }} className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            {showCalendar && (
              <div className="absolute top-full left-0 mt-2 z-50 rounded-xl shadow-2xl p-3" style={{background:"var(--surface-solid)",border:"1px solid var(--border)"}} role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={e => e.stopPropagation()}>
                <input type="date" value={toLocalIso(viewingDate)} min={toLocalIso(minDate)} max={toLocalIso(maxDate)} onChange={(e) => goToDate(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" style={{background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)"}} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-lg sm:text-2xl font-medium text-slate-900 truncate">
                {isViewingToday ? 'Today' : viewingDate.toLocaleDateString('en-GB', { weekday: 'short' })}
              </h1>
            </div>
            <span className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
              {viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            {!isViewingToday && (
              <button
                onClick={goToToday}
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-500 hover:text-emerald-400 font-medium"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 12l6-6M3 12l6 6"/></svg>
                Navigate to today
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
          {canEdit && (
            <button onClick={() => fileRef.current?.click()}
              className="h-8 w-8 sm:w-auto sm:px-3 rounded-lg flex items-center justify-center sm:gap-1.5 text-xs font-medium text-white transition-colors"
              /* Not red. Red is the delete colour everywhere else in the app,
                 and this is a routine upload — it was the single loudest
                 element on the screen while the genuinely irreversible
                 controls were quieter. Amber when action is due (no CSV
                 today), green once done. */
              style={{ background: isUploadedToday ? 'rgba(16,185,129,0.92)' : 'rgba(180,83,9,0.95)', border: `1px solid ${isUploadedToday ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.35)'}` }}
              title={data?.huddleCsvUploadedAt ? `Uploaded ${new Date(data.huddleCsvUploadedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : 'No CSV uploaded'}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              <span className="hidden sm:inline">{isUploadedToday ? 'CSV uploaded' : 'Upload CSV'}</span>
            </button>
          )}
          {/* Secondary: two solid CTAs side by side meant neither led. This is
              a view switch, not the primary action on the screen. */}
          <button onClick={() => setIsFullscreen(true)} className="h-8 w-8 sm:w-auto sm:px-3 rounded-lg flex items-center justify-center sm:gap-1.5 text-xs font-medium transition-colors"
            style={{ background: 'rgba(124,58,237,0.16)', border: '1px solid rgba(124,58,237,0.45)', color: '#c4b5fd' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
            <span className="hidden sm:inline">Huddle board</span>
          </button>
        </div>
      </div>

      {/* Show a small warning only when CSV data is missing for the
          viewed date — the redundant "Viewing X" date label has been
          removed since the date is already prominent in the navigator. */}
      {!isViewingToday && !hasDataForDate && huddleData && (
        <div className="glass-dark rounded-lg p-3 flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span className="text-xs text-slate-400">No CSV data available for this date</span>
        </div>
      )}

      {error && <Card className="p-4 bg-red-50 border-red-200 text-red-700 text-sm">{error}</Card>}

      <div style={{ opacity: contentOpacity, transition: 'opacity 0.15s ease-in-out' }}>

      {/* ═══ DATA-DRIVEN SECTIONS ═══ */}
      {!huddleData ? (
        <div className="glass rounded-xl">
          {canEdit
            ? <EmptyState icon="📊" title="No appointment data yet" description="Upload or drag-and-drop your EMIS CSV to see urgent capacity." action="Select CSV File" actionVariant="primary" onAction={() => fileRef.current?.click()} />
            : <EmptyState icon="📊" title="No appointment data yet" description="Ask an admin to upload today's EMIS appointment report." />}
        </div>
      ) : isPracticeClosed ? (
        <div className="glass rounded-xl overflow-hidden">
          <div className="py-16 px-6 text-center">
            <div className="mx-auto mb-4" style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <path d="M9 22V12h6v10" />
              </svg>
            </div>
            <h2 className="font-heading text-xl font-medium text-slate-300 mb-2">Practice closed</h2>
            <p className="text-sm text-slate-400">{viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            {viewingPrediction?.isBankHoliday && <span className="inline-block mt-3 text-xs font-medium px-3 py-1 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--c-amber)', border: '1px solid rgba(245,158,11,0.1)' }}>Bank Holiday</span>}
            {/* A closed day used to be a dead end — a large empty card with
                nothing to do. Anyone landing here on a Sunday wants the next
                day the practice is actually open. */}
            {(
              <div className="mt-5">
                <button
                  type="button"
                  onClick={jumpToNextOpenDay}
                  className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--link)' }}
                >
                  Go to the next open day &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
      {/* NHS demand benchmarks ribbon — sits just above the urgent
          on-the-day gauge so it provides external context before users
          look at today's numbers. Stays quiet if practice ODS isn't in
          the latest NHS data. */}
      <NhsBenchmarkRibbon
        odsCode={data?._v4?.practiceOds}
        listSize={data?._v4?.practiceListSize}
      />

      {/* ═══ SUMMARY GAUGE BAR ═══ */}
      {capacity && (() => {
        const urgTotal = (capacity.am.total || 0) + (capacity.am.embargoed || 0) + (capacity.am.booked || 0) + (capacity.pm.total || 0) + (capacity.pm.embargoed || 0) + (capacity.pm.booked || 0);
        const urgAvail = (capacity.am.total || 0) + (capacity.am.embargoed || 0) + (capacity.pm.total || 0) + (capacity.pm.embargoed || 0);
        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const todayDayName = dayNames[viewingDate.getDay()];
        // Gauge target = predicted demand × urgent conversion ratio when both
        // are available (live, demand-driven). Falls back to the static
        // expected-capacity table (kept for capacity planning use) when
        // there's no prediction for the day. The conversion rate lives in
        // huddleSettings.demandCapacity.conversionRate (0..1, default 0.25)
        // and is editable in Practice → Demand model.
        const convRate = hs?.demandCapacity?.conversionRate ?? 0.25;
        const predictedToday = viewingPrediction?.predicted || 0;
        const demandDrivenTarget = predictedToday > 0 ? Math.round(predictedToday * convRate) : 0;
        const staticTarget = (hs.expectedCapacity?.[todayDayName]?.am || 0) + (hs.expectedCapacity?.[todayDayName]?.pm || 0);
        const targetTotal = demandDrivenTarget > 0 ? demandDrivenTarget : staticTarget;
        const targetSource = demandDrivenTarget > 0 ? 'demand' : (staticTarget > 0 ? 'static' : 'none');
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* NOTICEBOARD — message-thread style (Option B from the design pass).
                Avatars use a deterministic colour per author so the same
                person always looks the same. No more random rainbow rotation. */}
            {/* Empty most days — and a full column saying "no notices" is
                prime space spent on nothing. Collapsed to one line until it
                has content; the moment a notice exists it gets the panel. */}
            <div className={`glass rounded-xl overflow-hidden flex flex-col lg:order-2 panefx-cyan ${huddleMessages.length === 0 ? 'self-start w-full' : ''}`}>
              <div className="px-4 py-2.5 flex items-center gap-2" style={{borderBottom: huddleMessages.length > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <span className="font-heading text-sm font-medium text-slate-300">Noticeboard</span>
                {huddleMessages.length > 0
                  ? <span className="text-xs text-slate-400 ml-auto">{huddleMessages.length} today</span>
                  : <span className="text-xs text-slate-400 ml-auto">no notices</span>}
              </div>
              <div className="flex-1 overflow-y-auto" style={{maxHeight:'420px'}}>
                {huddleMessages.map((msg, i) => {
                  // Deterministic palette — hash the author name into one of 5
                  // muted accent colours so the same person is always shown
                  // with the same avatar tint.
                  const palette = [
                    { bg: 'rgba(59,130,246,0.18)', fg: 'var(--c-blue)' },   // blue
                    { bg: 'rgba(16,185,129,0.18)', fg: 'var(--c-green)' },   // green
                    { bg: 'rgba(168,85,247,0.18)', fg: 'var(--c-purple)' },   // purple
                    { bg: 'rgba(245,158,11,0.18)', fg: 'var(--c-amber)' },   // amber
                    { bg: 'rgba(236,72,153,0.18)', fg: 'var(--c-pink)' },   // pink
                  ];
                  const authorKey = msg.author || 'anon';
                  let h = 0; for (let k = 0; k < authorKey.length; k++) h = (h * 31 + authorKey.charCodeAt(k)) | 0;
                  const c = palette[Math.abs(h) % palette.length];
                  const initials = msg.author
                    ? msg.author.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
                    : '?';
                  const time = msg.addedAt ? new Date(msg.addedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                    <div key={msg.id || i} className="px-4 py-2.5 flex gap-2.5 items-start group hover:bg-white/[0.02] transition-colors">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0" style={{ background: c.bg, color: c.fg }}>{initials}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs font-medium text-slate-200">{msg.author || 'Anonymous'}</span>
                          {time && <span className="text-[11px] text-slate-400">{time}</span>}
                        </div>
                        <div className="text-xs text-slate-300 leading-relaxed break-words">{msg.text}</div>
                      </div>
                      {canEdit && (
                        <button onClick={() => removeMessage(i)} className="text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-xs leading-none mt-1" title="Delete notice">✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
              {canEdit && (
                <div className="p-3 flex gap-2" style={{borderTop:'1px solid rgba(255,255,255,0.04)'}}>
                  <input
                    type="text"
                    value={newMsg}
                    onChange={e => setNewMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addMessage(); }}
                    placeholder="Add a notice…"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                    style={{background:'var(--surface-2)',border:'1px solid var(--border)',color:'var(--text-1)'}}
                  />
                  <button
                    onClick={addMessage}
                    disabled={!newMsg.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{background:'rgba(34,211,238,0.15)',border:'1px solid rgba(34,211,238,0.3)',color:'var(--c-cyan)'}}
                  >
                    Post
                  </button>
                </div>
              )}
            </div>
            {/* SUMMARY — spans first 3 cols */}
            <div className="glass rounded-xl p-5 lg:col-span-3 lg:order-1 panefx-violet">
              <div className="flex flex-col lg:flex-row gap-5 items-stretch">
                <div className="flex-shrink-0 flex items-center justify-center">
                  {/* slots/target text removed from under the needle: the raw count
                      lives in the tile beside it, and the target is on the
                      session bars below. The gauge's one job is the ratio. */}
                  <SpeedometerGauge percentage={coveragePct} className="w-full max-w-[300px]" width={null} viewBox="0 0 300 145" />
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
                  <div className="glass-inner rounded-xl p-4 flex flex-col justify-center relative">
                    <div className="text-sm text-slate-400 mb-1 flex items-center gap-1.5">
                      Predicted demand
                      {pred?.usingFallback && (
                        <span
                          title="Estimated from list size — calibrate by uploading an AskMyGP CSV in Practice → Demand model"
                          className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--c-amber)', border: '1px solid rgba(245,158,11,0.3)' }}
                        >
                          est
                        </span>
                      )}
                    </div>
                    <div className="font-mono-data text-3xl lg:text-5xl font-bold text-amber-400 leading-none">{predTotal || '—'}</div>
                    <div className="text-sm text-slate-400 mt-1">requests today</div>
                  </div>
                  <div className="glass-inner rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-sm text-slate-400 mb-1">Urgent available</div>
                    <div className="font-mono-data text-3xl lg:text-5xl font-bold leading-none" style={{color:band.colour}}>{urgAvail}</div>
                    <div className="text-sm text-slate-400 mt-1">appointments today</div>
                  </div>
                  <div className="glass-inner rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-sm text-slate-400 mb-1">Routine 28 days</div>
                    <div className="font-mono-data text-3xl lg:text-5xl font-bold text-emerald-400 leading-none">{routineAvail + routineEmb}</div>
                    <div className="text-sm text-slate-400 mt-1">{routineEmb > 0 ? `${routineAvail} avail · ${routineEmb} emb` : 'available'}</div>
                  </div>
                  <div className="glass-inner rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-sm text-slate-400 mb-1">Clinicians today</div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono-data text-3xl lg:text-5xl font-bold text-slate-900 leading-none">{inCount}</span>
                      
                    </div>
                    <div className="text-sm text-slate-400 mt-1">of {visibleClinicians.length} active</div>
                  </div>
                </div>
              </div>
            {/* Fallback warning banner — shown when no per-practice
                demand_settings is in place. The prediction is being
                derived from list-size-scaled generic baselines rather
                than the practice's own data. Hides automatically once
                an NHS auto-seed or CSV calibration has been run. */}
            {pred?.usingFallback && data?._v4?.practiceSlug && (
              <div
                className="rounded-lg p-3 mt-3 flex items-start gap-2.5"
                style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.25)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fcd34d" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-amber-300 mb-0.5">Demand prediction is an estimate</div>
                  <div className="text-xs text-amber-200/80 leading-relaxed">
                    Today's prediction uses national-average submission rates scaled to your list size of {(data._v4.practiceListSize || 0).toLocaleString()}.
                    For a tailored prediction reflecting your practice's actual demand pattern, upload an AskMyGP CSV (12+ weeks recommended) in{' '}
                    <a
                      href={`/v4/practice/${data._v4.practiceSlug}?tab=demand`}
                      className="underline hover:text-amber-100 transition-colors"
                    >
                      Practice → Demand model
                    </a>.
                  </div>
                </div>
              </div>
            )}
            {predTotal > 0 && (
              /* Was a full card: icon row + a paragraph + the details toggle,
                 ~120px for one sentence. Same content on one line now — the
                 approved compaction is height, not information. */
              <div className="glass-inner rounded-xl px-4 py-2.5 mt-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={predColour} strokeWidth="2" className="flex-shrink-0"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  <span className="text-sm font-semibold" style={{color:predColour}}>{predLabel}</span>
                  <span className="text-sm text-slate-400">
                    avg {todayDayName.slice(0,3)} {predAvgDay}{displayFactors.filter(f => f.impact !== 0).slice(0, 2).map(f => ` · ${f.label} ${f.impact > 0 ? '+' : ''}${f.impact}`).join('')}
                  </span>
                </div>
                <details className="mt-1">
                  <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300 flex items-center gap-1">
                    Demand factors
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="text-slate-400">Base {todayDayName} avg</span><span className="font-bold text-slate-300 font-mono-data">{predAvgDay}</span></div>
                    {displayFactors.filter(f => f.impact !== 0).map((f, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-slate-400">{f.label}</span>
                        <span className="font-bold font-mono-data" style={{color: f.impact > 0 ? '#ef4444' : f.impact < 0 ? '#10b981' : '#475569'}}>{f.impact > 0 ? '+' : ''}{f.impact}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm pt-1.5 mt-1.5" style={{borderTop:'1px solid var(--border)'}}>
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
            const SessionPanel = ({ label, slots, avail, booked, added, target, band, isShort, sessionData, dutyDoc, dutyDocDiag, dutySlotNames }) => {
              const bar = barPct(slots, target);
              const availPct = slots > 0 ? (avail / slots) * 100 : 0;
              const bookedPct = slots > 0 ? (booked / slots) * 100 : 0;
              const allClinicians = (sessionData?.byClinician || [])
                .map(c => {
                  const matched = teamClinicians.find(tc => matchesStaffMember(c.name, tc));
                  const avail = (c.available || 0) + (c.embargoed || 0);
                  return {
                    ...c,
                    displayName: matched?.name || c.name,
                    title: matched?.title || '',
                    role: matched?.role || '',
                    initials: matched?.initials || (c.name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
                    total: avail + (c.booked || 0),
                    avail,
                  };
                })
                .filter(c => c.total > 0);

              // Resolve duty doctor and remove from clinician list
              const dutyDocDisplay = dutyDoc ? (() => {
                const matched = teamClinicians.find(tc => matchesStaffMember(dutyDoc.name, tc));
                const dutyInList = allClinicians.find(c => matchesStaffMember(c.name, matched || { name: dutyDoc.name }));
                return { name: matched?.name || dutyDoc.name, initials: matched?.initials || (dutyDoc.name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2), title: matched?.title, location: dutyDoc.location, total: dutyInList?.total || 0, csvName: dutyDoc.name, booked: dutyInList?.booked || 0, avail: (dutyInList?.available || 0) + (dutyInList?.embargoed || 0) };
              })() : null;

              // The remainder list = everyone except the duty doctor, sorted
              // by available urgent slots descending (who has the most spare
              // capacity right now). Tie-break on total slots so the busier
              // session sits above an emptier one with the same availability.
              const clinicians = (dutyDocDisplay
                  ? allClinicians.filter(c => !matchesStaffMember(c.name, { name: dutyDocDisplay.name, aliases: [] }))
                  : allClinicians
                ).slice().sort((a, b) => (b.avail || 0) - (a.avail || 0) || (b.total || 0) - (a.total || 0));

              const dutyLocCol = dutyDocDisplay?.location ? siteCol(dutyDocDisplay.location) : null;
              const dutyLocLetter = dutyDocDisplay?.location ? dutyDocDisplay.location.charAt(0) : '';

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
                        {target > 0 && <div className="absolute z-[2]" style={{ left: `${Math.min(bar.markerPct, 100)}%`, top: '50%', transform: 'translate(-50%, -50%)' }}><div style={{width:14,height:14,borderRadius:'50%',border:`2.5px solid ${band.colour}`,background:'var(--app-bg)',boxShadow:`0 0 8px ${band.colour}`}} /></div>}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:`${band.colour}20`,color:band.colour}}>{band.label} · {Math.round(band.pct)}%</span>
                          <span className="text-sm text-slate-400">{avail} available{booked > 0 ? <span> · {booked} booked</span> : ''}{added > 0 ? <span style={{color:'var(--c-indigo)'}}> · +{added} since 8am</span> : ''}</span>
                        </div>
                        {target > 0 && <span className="text-sm text-slate-400">target {target}</span>}
                      </div>
                    </div>
                  </div>
                  {dutyDocDisplay && (
                    /* The duty doctor is the most important ROLE of the day,
                       not an emergency — the old solid alarm-red made a
                       normal day read as an incident, and its bare 0 (duty
                       triages rather than holding bookable urgent slots)
                       looked like a fault. Site colour as the rail, raised
                       surface, star kept; a word where a count would lie. */
                    <button
                      onClick={() => setSelectedUrgentClinician({ name: dutyDocDisplay.csvName, accent: dutyLocCol || '#8b5cf6' })}
                      className="rounded-lg overflow-hidden mb-2 w-full text-left transition-transform hover:scale-[1.01]"
                      /* Tinted with the duty site's colour, as in the
                         approved mockup — for Winscombe that is the purple.
                         Fill at low alpha so the row reads as a role, not an
                         alert; rail solid for identity. */
                      style={(() => {
                        const c = dutyLocCol || '#8b5cf6';
                        const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
                        return {
                          background: `rgba(${r},${g},${b},0.14)`,
                          border: `1px solid rgba(${r},${g},${b},0.4)`,
                          borderLeft: `4px solid ${c}`,
                          boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
                          cursor: 'pointer',
                        };
                      })()}
                    >
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fbbf24" className="flex-shrink-0"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{dutyDocDisplay.title ? `${dutyDocDisplay.title} ` : ''}{dutyDocDisplay.name}</div>
                          <div className="text-xs" style={{ color: 'var(--meta)' }}>Duty · {dutyDocDisplay.location || '?'}</div>
                        </div>
                        <span className="font-mono-data text-xs font-bold flex-shrink-0" style={{ color: dutyDocDisplay.total > 0 ? '#fff' : 'var(--meta)', letterSpacing: dutyDocDisplay.total > 0 ? 0 : 0.4 }}>
                          {dutyDocDisplay.total > 0 ? dutyDocDisplay.total : 'triage'}
                        </span>
                      </div>
                    </button>
                  )}
                  {/* Diagnostic — shown only when a duty slot is configured
                      but no real GP was detected. Reveals what the function
                      actually saw so the cause is visible at a glance:
                      either no slot data at all for the configured types,
                      or candidates that all got filtered out as dummies. */}
                  {!dutyDocDisplay && dutyDocDiag && (dutyDocDiag.candidates?.length > 0 || (dutySlotNames || []).length > 0) && (
                    <div className="rounded-lg mb-2 px-3 py-2.5 text-xs" style={{
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px dashed rgba(239,68,68,0.30)',
                      color: 'var(--c-red)',
                    }}>
                      <div className="font-semibold mb-1" style={{ color: 'var(--c-red)' }}>
                        Duty doctor not detected — diagnostic
                      </div>
                      <div className="opacity-80 mb-1">
                        Looking for: <span style={{ fontFamily: "var(--font-mono)" }}>{(dutySlotNames || []).map(s => `"${s}"`).join(', ') || '(none)'}</span>
                      </div>
                      {dutyDocDiag.candidates.length === 0 ? (
                        <div className="opacity-80">
                          No slot data found for these slot types on this date / session.
                          The slot type may be misspelled or have a leading/trailing space.
                        </div>
                      ) : (
                        <>
                          <div className="opacity-80 mb-1">Found these candidates (sorted by slot count):</div>
                          <ul className="space-y-0.5 ml-1">
                            {dutyDocDiag.candidates.map((c, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="opacity-60">·</span>
                                <span style={{ fontFamily: "var(--font-mono)" }}>{c.name}</span>
                                <span className="opacity-70">({c.count} slot{c.count === 1 ? '' : 's'})</span>
                                <span className="opacity-70 ml-auto flex-shrink-0">
                                  {c.matchesStaff ? (
                                    <span style={{ color: 'var(--c-green)' }}>→ {c.matchedTo}</span>
                                  ) : (
                                    <span style={{ color: 'var(--c-red)' }}>no match in staff register</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {dutyDocDiag.reason === 'all_filtered_as_dummies' && (
                            <div className="opacity-80 mt-1.5 pt-1.5" style={{ borderTop: '1px solid rgba(239,68,68,0.15)' }}>
                              All candidates were filtered out — none of them match a clinician in your staff register. Either the duty slots are being recorded against an EMIS system entry (like &quot;TRIAGE, TELEPHONE&quot;), or the name format in your CSV differs from your saved clinicians. Add an alias for one of these names on the clinician&apos;s record to resolve.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {clinicians.map((c, i) => {
                      const locPill = c.location ? siteCol(c.location) : null;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedUrgentClinician({ name: c.name, accent: band.colour })}
                          className="glass-inner rounded-lg px-3 py-2 flex items-center justify-between text-left transition-colors hover:bg-white/5"
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{fontFamily:"var(--font-heading)",background: band.colour, boxShadow:`0 0 6px ${band.colour}30`}}>{c.initials}</div>
                            <div className="min-w-0">
                              <span className="text-sm text-slate-200 truncate">{c.title ? `${c.title} ` : ''}{c.displayName}</span>
                              {c.role && <div className="text-xs text-slate-400">{c.role}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-mono-data text-sm font-bold" style={{color: band.colour}}>{c.total}</span>
                            {locPill && <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-white" style={{background:locPill}}>{c.location.charAt(0)}</div>}
                          </div>
                        </button>
                      );
                    })}
                    {clinicians.length === 0 && <div className="text-center text-slate-400 text-sm py-3">No capacity</div>}
                  </div>
                </div>
              );
            };

            return (
              <div className="rounded-xl overflow-hidden glass">
                <div className="glass-header hdr-cyan px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span className="font-heading text-base font-medium text-slate-200">Urgent on the day</span>
                    <SlotFilter overrides={urgentOverrides} setOverrides={setUrgentOverrides} knownSlotTypes={knownSlotTypes} activeSlotTypes={activeSlotTypes} title="Urgent Slot Filter" dutyDoctorSlot={dutyDoctorSlot} setDutyDoctorSlot={setDutyDoctorSlot} readOnly={!canEdit} />
                  </div>
                </div>
                {displayDate && displayDate !== viewingDateStr && (
                  <div className="px-4 py-2 text-xs text-amber-400 flex items-center gap-2" style={{background:'rgba(245,158,11,0.1)',borderBottom:'1px solid rgba(245,158,11,0.1)'}}>Date not found in report. Showing {displayDate}.</div>
                )}
                {urgentOverrides && Object.values(urgentOverrides).every(v => !v) ? (
                  <div className="py-12 px-6 text-center glass-inner rounded-b-xl">
                    <div className="text-slate-400 mb-2" style={{fontSize:32}}>↑</div>
                    <h3 className="text-base font-semibold text-slate-300 mb-1">No slots selected</h3>
                    <p className="text-sm text-slate-400 max-w-sm mx-auto">Open the filter above to choose which slot types to include as urgent on the day.</p>
                  </div>
                ) : (<>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                  <div className="rounded-xl overflow-hidden glass">
                    <div className="glass-header hdr-amber px-4 py-2.5 rounded-t-xl">
                      <span className="font-heading text-sm font-medium text-slate-400">Morning</span>
                    </div>
                    <div>
                      <SessionPanel label="Morning" slots={urgentAm} avail={availAm} booked={bookedAm} added={addedAm} target={expectedAm} band={amBand} isShort={false} sessionData={capacity.am} dutyDoc={hasDutySlot ? getDutyDoctor(huddleData, displayDate, 'am', dutyDoctorSlot, teamClinicians) : null} dutyDocDiag={hasDutySlot ? getDutyDoctorDiagnostic(huddleData, displayDate, 'am', dutyDoctorSlot, teamClinicians) : null} dutySlotNames={Array.isArray(dutyDoctorSlot) ? dutyDoctorSlot : (dutyDoctorSlot ? [dutyDoctorSlot] : [])} />
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden glass">
                    <div className="glass-header hdr-teal px-4 py-2.5 rounded-t-xl">
                      <span className="font-heading text-sm font-medium text-slate-400">Afternoon</span>
                    </div>
                    <div>
                      <SessionPanel label="Afternoon" slots={urgentPm} avail={availPm} booked={bookedPm} added={addedPm} target={expectedPm} band={pmBand} isShort={pmBand.colour === '#ef4444' || pmBand.colour === '#f59e0b'} sessionData={capacity.pm} dutyDoc={hasDutySlot ? getDutyDoctor(huddleData, displayDate, 'pm', dutyDoctorSlot, teamClinicians) : null} dutyDocDiag={hasDutySlot ? getDutyDoctorDiagnostic(huddleData, displayDate, 'pm', dutyDoctorSlot, teamClinicians) : null} dutySlotNames={Array.isArray(dutyDoctorSlot) ? dutyDoctorSlot : (dutyDoctorSlot ? [dutyDoctorSlot] : [])} />
                    </div>
                  </div>
                </div>

                {/* Slot type breakdown — collapsible */}
                {capacity.bySlotType.length > 0 && (
                  <details className="mx-4 mb-3">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300 flex items-center gap-1 py-1">
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
                        // Build per-location entries dynamically. Order +
                        // colours come from the practice's configured sites
                        // (data.roomAllocation.sites). Any locations the CSV
                        // mentions but that aren't yet configured fall back
                        // to grey, sorted alphabetically at the end.
                        const configuredSiteNames = sites.map(x => x.name);
                        const csvLocations = Object.keys(locs).filter(l => !configuredSiteNames.includes(l)).sort();
                        const locEntries = [...configuredSiteNames, ...csvLocations]
                          .map(loc => ({ loc, count: locs[loc] || 0, col: siteCol(loc) }))
                          .filter(l => l.count > 0);
                        const locTotal = locEntries.reduce((sum, l) => sum + l.count, 0) || 1;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className="text-xs text-slate-400 truncate" style={{width:130,textAlign:'right',flexShrink:0}} title={s.name}>{s.name}</div>
                            <div style={{flex:1,height:10,borderRadius:3,overflow:'hidden',background:'var(--border)',display:'flex'}}>
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

          {/* ─── ROUTINE WAIT TIMES ─── */}
          <RoutineWaitTime data={data} huddleData={huddleData} routineOverrides={effectiveRoutineOverrides} />

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
                <div className="glass-header hdr-green px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-heading text-base font-medium text-slate-200">Routine Capacity</div>
                      <div className="text-[13px] text-slate-400">30-day availability overview</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setActiveSection('huddle-forward')} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">Clinician detail →</button>
                      <SlotFilter overrides={routineOverrides} setOverrides={setRoutineOverrides} knownSlotTypes={knownSlotTypes} activeSlotTypes={activeSlotTypes} title="Routine Slot Filter" readOnly={!canEdit} />
                    </div>
                  </div>
                </div>

                {routineOverrides && Object.values(routineOverrides).every(v => !v) ? (
                  <div className="py-12 px-6 text-center glass-inner">
                    <div className="text-slate-400 mb-2" style={{fontSize:32}}>↑</div>
                    <h3 className="text-base font-semibold text-slate-300 mb-1">No slots selected</h3>
                    <p className="text-sm text-slate-400 max-w-sm mx-auto">Open the filter above to choose which slot types to include as routine capacity.</p>
                  </div>
                ) : (<>
                {/* Booking gauges — non-overlapping weekly ranges */}
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/10 border-b border-white/10">
                  {periodGauges.map(g => (
                    <div key={g.label} className="flex flex-col items-center py-4 px-2">
                      <MiniGauge value={g.avail} max={g.total} size={100} strokeWidth={8} colour={g.colour}>
                        <text x="50" y="44" textAnchor="middle" fill="var(--text-1)" style={{ fontSize: '22px', fontWeight: 700 }}>{Math.round(g.pct)}%</text>
                        <text x="50" y="58" textAnchor="middle" fill="#64748b" style={{ fontSize: '10px' }}>available</text>
                      </MiniGauge>
                      <div className="text-[13px] font-semibold text-slate-300 mt-1">{g.label}</div>
                      <div className="text-[13px] text-slate-400">{g.avail} available · {g.booked} booked</div>
                    </div>
                  ))}
                </div>

                {/* The donuts only look forward. This row is the backwards
                    half: what each of the last few weeks offered and how
                    full it ended, from history the blob already keeps. */}
                {(() => {
                  // Computed here, in the card's own scope - the summary
                  // block above is a separate closure. (First attempt
                  // defined it there; the new error boundary caught it.)
                  const pastWeeks = getPastWeeksRoutine(huddleData, hs, 4, effectiveRoutineOverrides).filter(w => w.daysWithData > 0);
                  return pastWeeks.length > 0 && (
                  <div className="px-4 py-3 border-t border-white/10">
                    <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--meta)' }}>Previous weeks &middot; offered / booked</div>
                    <div className="flex gap-2">
                      {pastWeeks.map((w) => (
                        <div key={w.weekStart} className="flex-1 rounded-lg px-2.5 py-2 text-center" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border)' }} title={`Week beginning ${w.label}: ${w.offered} routine slots offered across ${w.daysWithData} day${w.daysWithData === 1 ? '' : 's'}, ${w.booked} booked${w.fillPct != null ? ` (${w.fillPct}%)` : ''}`}>
                          <div className="text-[11px]" style={{ color: 'var(--meta)' }}>wc {w.label}</div>
                          <div className="font-mono-data text-sm font-bold" style={{ color: 'var(--g-text-hi)' }}>{w.offered}</div>
                          <div className="text-[11px]" style={{ color: 'var(--meta)' }}>{w.fillPct != null ? `${w.fillPct}% booked` : 'no data'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
                })()}

                <details className="border-t border-white/10 group">
                  <summary
                    className="px-4 py-3 text-sm text-slate-300 cursor-pointer flex items-center justify-center gap-2 transition-colors hover:bg-white/5"
                    style={{ listStyle: 'none' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400 transition-transform group-open:rotate-180"><path d="M6 9l6 6 6-6"/></svg>
                    <span className="font-medium">View next 28 days</span>
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">expand</span>
                  </summary>
                  <TwentyEightDayChart huddleData={huddleData} huddleSettings={hs} overrides={effectiveRoutineOverrides} teamClinicians={teamClinicians} />
                </details>
                </>)}
              </div>
            );
          })()}

          {/* ─── CUSTOM CAPACITY CARDS ─── */}
          {capacityCards.length === 0 ? (
            // Empty-state how-to. Shows when a practice hasn't created any
            // capacity cards yet — typical for new sign-ups. Explains what
            // the cards are for and how to add one, rather than just an
            // orphan "+" button.
            <div className="glass rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{background:'rgba(139,92,246,0.15)',border:'1px solid rgba(139,92,246,0.25)'}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading text-base font-medium text-slate-200 mb-1">Capacity cards</h3>
                  <p className="text-sm text-slate-400 mb-3 leading-relaxed">
                    Build cards to track availability for specific clinic types — for example "Diabetes review", "Travel clinic", or "First trimester antenatal". Each card filters the routine slot types you assign to it and shows availability across the next 7, 14, 21, or 28 days.
                  </p>
                  {canEdit ? (
                    !showAddCard ? (
                      <button onClick={() => setShowAddCard(true)} className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors" style={{background:'rgba(139,92,246,0.15)',border:'1px solid rgba(139,92,246,0.3)',color:'var(--c-purple)'}}>+ Create your first card</button>
                    ) : (
                      <div className="flex gap-2 mb-2">
                        <input type="text" value={newCardTitle} onChange={e => setNewCardTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addCapacityCard(); }}
                          placeholder="e.g. Diabetes review"
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500" autoFocus />
                        <Button onClick={addCapacityCard} size="sm" disabled={!newCardTitle.trim()}>Add</Button>
                        <button onClick={() => { setShowAddCard(false); setNewCardTitle(''); }} className="text-xs text-slate-400 hover:text-slate-300">✕</button>
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-slate-400 italic">Ask an admin to set these up.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {capacityCards.map((card, idx) => {
              const overrides = cardOverrides[card.id] || null;
              const effective = overrides || allSlotsOverrides;
              const cardDays = card.days || 14;
              const accentBar = ACCENT_BAR_COLOURS[card.colour] || '#8b5cf6';
              const isDragging = draggingCardIdx === idx;
              const isDragOver = dragOverCardIdx === idx && draggingCardIdx !== null && draggingCardIdx !== idx;
              return (
                <div
                  key={card.id}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    if (!canEdit) return;
                    setDraggingCardIdx(idx);
                    // Required so Firefox actually fires the drag.
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                  }}
                  onDragOver={(e) => {
                    if (!canEdit || draggingCardIdx == null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverCardIdx !== idx) setDragOverCardIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverCardIdx === idx) setDragOverCardIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorderCapacityCards(draggingCardIdx, idx);
                    setDraggingCardIdx(null);
                    setDragOverCardIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggingCardIdx(null);
                    setDragOverCardIdx(null);
                  }}
                  className="rounded-xl overflow-visible group relative glass-dark transition-all"
                  style={{
                    gridColumn: card.fullWidth ? 'span 2' : 'span 1',
                    opacity: isDragging ? 0.4 : 1,
                    cursor: canEdit ? 'grab' : 'default',
                    boxShadow: isDragOver ? `0 0 0 2px ${accentBar}, 0 8px 24px rgba(0,0,0,0.3)` : undefined,
                  }}
                >
                  {/* Coloured top stripe — quick visual anchor that matches the
                      card's accent colour without making the whole header
                      garish. */}
                  <div style={{height:3,background:accentBar,borderTopLeftRadius:12,borderTopRightRadius:12}} />
                  <div className="glass-header hdr-pink px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Drag handle — only visible on hover, only for editors */}
                        {canEdit && (
                          <div className="flex-shrink-0 opacity-0 group-hover:opacity-50 transition-opacity text-slate-400" title="Drag to reorder">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                          </div>
                        )}
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:accentBar,boxShadow:`0 0 8px ${accentBar}88`}} />
                        <div className="min-w-0">
                          <div className="font-heading text-base font-medium text-slate-200 truncate">{card.title}</div>
                          <div className="text-xs text-slate-400">Next {cardDays} days</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Single cog now hosts: slot filter + title/colour/period/full-width editing + delete */}
                        <SlotFilter
                          overrides={overrides}
                          setOverrides={(v) => setCardOverride(card.id, v)}
                          knownSlotTypes={knownSlotTypes}
                          activeSlotTypes={activeSlotTypes}
                          title={`${card.title} settings`}
                          readOnly={!canEdit}
                          cardSettings={canEdit ? {
                            card,
                            palette: cardPalette,
                            onChange: (patch) => updateCapacityCard(card.id, patch),
                            onDelete: () => removeCapacityCard(card.id),
                          } : null}
                        />
                      </div>
                    </div>
                  </div>
                  <SevenDayStrip huddleData={huddleData} huddleSettings={hs} overrides={effective} accent={card.colour} teamClinicians={teamClinicians} hasFilter={!!overrides} days={cardDays} />
                </div>
              );
            })}

            {/* Add card button */}
            {canEdit && (!showAddCard ? (
              <button onClick={() => setShowAddCard(true)}
                className="glass-inner rounded-xl flex items-center justify-center border-2 border-dashed transition-colors hover:border-slate-500"
                style={{borderColor:'rgba(255,255,255,0.08)', minHeight:80}}>
                <div className="text-center">
                  <div className="text-lg text-slate-400 leading-none">+</div>
                  <div className="text-xs text-slate-400 mt-1">Add card</div>
                </div>
              </button>
            ) : (
              <div className="glass rounded-xl p-3">
                <div className="flex gap-2 mb-2">
                  <input type="text" value={newCardTitle} onChange={e => setNewCardTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCapacityCard(); }}
                    placeholder="Card title..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500" autoFocus />
                  <Button onClick={addCapacityCard} size="sm" disabled={!newCardTitle.trim()}>Add</Button>
                  <button onClick={() => { setShowAddCard(false); setNewCardTitle(''); }} className="text-xs text-slate-400 hover:text-slate-300">✕</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {CARD_COLOURS.map(c => (
                    <button key={c.key} onClick={() => setNewCardColour(c.key)} title={c.label}
                      className={`w-5 h-5 rounded bg-gradient-to-r ${c.gradient} transition-all ${newCardColour === c.key ? 'ring-2 ring-white/40 ring-offset-1 ring-offset-slate-900 scale-110' : 'opacity-50 hover:opacity-100'}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}

        </div>
      )}
      </div>
    </div>

    {/* Clinician slot breakdown — opens when a row in the urgent on the
        day list (or the duty doctor card) is clicked. Uses the urgent
        overrides so what's shown matches what the user just clicked on. */}
    {selectedUrgentClinician && (
      <ClinicianDayPanel
        clinicianName={selectedUrgentClinician.name}
        dateStr={displayDate}
        huddleData={huddleData}
        huddleSettings={hs}
        overrides={urgentOverrides}
        teamClinicians={teamClinicians}
        onClose={() => setSelectedUrgentClinician(null)}
        accent={selectedUrgentClinician.accent}
      />
    )}
    </div>
  );
}
