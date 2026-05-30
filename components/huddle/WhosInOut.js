'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { DAYS, STAFF_GROUPS, matchesStaffMember, toLocalIso, toHuddleDateStr } from '@/lib/data';
import { getCliniciansForDate, getClinicianLocationsForDate, getClinicianSessionLocations, getSiteColour } from '@/lib/huddle';
import { canEditPracticeData } from '@/lib/permissions';
import { createClient } from '@/utils/supabase/client';
import { ClinicianDayPanel } from './HuddleShared';
import SidePanel from './SidePanel';

const ROLE_COLOURS = {
  'GP Partner': 'bg-blue-50 border-blue-200 text-blue-800',
  'Associate Partner': 'bg-blue-50 border-blue-200 text-blue-800',
  'Salaried GP': 'bg-indigo-50 border-indigo-200 text-indigo-800',
  'Locum': 'bg-purple-50 border-purple-200 text-purple-800',
  'ANP': 'bg-emerald-50 border-emerald-200 text-emerald-800',
  'Paramedic Practitioner': 'bg-amber-50 border-amber-200 text-amber-800',
  'GP Registrar': 'bg-rose-50 border-rose-200 text-rose-800',
  'Pharmacist': 'bg-cyan-50 border-cyan-200 text-cyan-800',
  'Practice Nurse': 'bg-teal-50 border-teal-200 text-teal-800',
  'Nurse Associate': 'bg-teal-50 border-teal-200 text-teal-800',
  'HCA': 'bg-lime-50 border-lime-200 text-lime-800',
  'Medical Student': 'bg-rose-50 border-rose-200 text-rose-800',
};

function PersonCard({ person, status, reason, onClick, onHide, onMarkOffToday, location, sessionLoc, getSiteCol }) {
  const isAbsent = status === 'absent';
  const isDayOff = status === 'dayoff';
  const displayName = person.title ? `${person.title} ${person.name}` : person.name;
  const roleColMap = { gp: '#3b82f6', nursing: '#10b981', allied: '#a855f7' };
  const roleCol = roleColMap[person.group] || '#64748b';
  const badgeCol = isAbsent ? '#ef4444' : isDayOff ? '#f59e0b' : roleCol;

  // Location
  const amLoc = sessionLoc?.am;
  const pmLoc = sessionLoc?.pm;
  const fallbackLoc = location;
  const aLoc = amLoc || fallbackLoc;
  const pLoc = pmLoc || fallbackLoc;
  const aC = getSiteCol ? getSiteCol(aLoc) : '#64748b';
  const pC = getSiteCol ? getSiteCol(pLoc) : '#64748b';
  const hasLoc = !isAbsent && !isDayOff && (aLoc || pLoc);
  const isSplit = hasLoc && aLoc && pLoc && aLoc !== pLoc;

  // Only "present" people have CSV slot data — clicking absent or day-off
  // shouldn't open the panel because there's nothing to show.
  const isClickable = !!onClick && !isAbsent && !isDayOff;
  // "Off today" only makes sense for someone currently considered
  // present — you can't mark them off if they're already absent.
  const canMarkOff = !!onMarkOffToday && !isAbsent;

  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={`glass-inner rounded-lg transition-all group relative px-3 py-2 flex items-center justify-between text-left w-full ${isClickable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'}`}
    >
      <div className="absolute top-1 right-1 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {canMarkOff && (
          <span
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMarkOffToday(); }}
            role="button"
            title="Mark off today"
            className="text-[10px] px-1.5 py-0.5 rounded text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition-colors cursor-pointer"
            style={{ fontWeight: 500 }}
          >
            Off today
          </span>
        )}
        {onHide && (
          <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); onHide(); }}
            role="button"
            title="Hide from Who's In"
            className="text-xs text-slate-500 hover:text-red-400 transition-colors cursor-pointer">✕</span>
        )}
      </div>
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ fontFamily: "'Outfit',sans-serif", background: badgeCol, boxShadow: `0 0 6px ${badgeCol}30` }}>
          {person.initials || '?'}
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-medium leading-tight truncate ${isAbsent ? 'text-slate-500' : 'text-slate-200'}`}>{displayName}</div>
          <div className="text-xs leading-tight mt-0.5" style={{ color: isAbsent ? '#f87171' : isDayOff ? '#fbbf24' : '#64748b' }}>
            {reason || person.role || 'Staff'}
          </div>
        </div>
      </div>
      {hasLoc && (
        <div className="flex flex-col gap-px flex-shrink-0">
          <div className="rounded-t-sm flex items-center justify-center text-[9px] font-bold text-white" style={{ width: 22, height: 13, background: aC }}>{aLoc?.charAt(0) || '?'}</div>
          <div className="rounded-b-sm flex items-center justify-center text-[9px] font-bold text-white" style={{ width: 22, height: 13, background: isSplit ? pC : aC }}>{pLoc?.charAt(0) || aLoc?.charAt(0) || '?'}</div>
        </div>
      )}
    </button>
  );
}

// PeopleGrid — replaces the old DropZone. We no longer support drag-drop
// to manually move people between Present / Absent / Day Off columns —
// users now rely on the rota and CSV to drive that classification, and
// click any present person to open their slot breakdown.
function PeopleGrid({ children, isEmpty }) {
  return (
    <div className="min-h-[40px] p-1.5">
      {isEmpty && <div className="flex items-center justify-center py-2 text-xs text-slate-600">None</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

export default function WhosInOut({ data, saveData, huddleData, onNavigate, viewingDate: viewingDateProp }) {
  const canEdit = canEditPracticeData(data);
  const sites = data?.roomAllocation?.sites || [];
  const siteCol = (name) => getSiteColour(name, sites);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbsent, setShowAbsent] = useState(false);
  // Clicking a present person opens their slot breakdown in a SidePanel.
  // Stores the person object (the team-register entry) so we can look up
  // their CSV name via matchesStaffMember on each cap.am.byClinician row.
  const [selectedPerson, setSelectedPerson] = useState(null);
  // "Off today" quick action — when set, opens a small modal asking
  // for an absence reason. Confirming inserts a single-day row into
  // the absences table so the buddy allocator picks them up as
  // absent on the next regen (and the rest of the dashboard reflects
  // the change). Stored as the person object so we can show their
  // name in the modal.
  const [offTodayCandidate, setOffTodayCandidate] = useState(null);
  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const allClinicians = ensureArray(data?.clinicians);

  // The dashboard's data.clinicians is loaded once via SSR and doesn't
  // auto-refresh when the user edits show_whos_in elsewhere (e.g. in
  // QuickSetupTable on the practice page). To stop this widget showing
  // people whose Who's-In has just been turned off, fetch a fresh
  // {id → show_whos_in} map straight from the DB on mount and use it
  // to override the (possibly stale) c.showWhosIn values from `data`.
  const supabaseRef = useRef(null);
  if (!supabaseRef.current && typeof window !== 'undefined') {
    supabaseRef.current = createClient();
  }
  const [freshShowMap, setFreshShowMap] = useState(null);
  useEffect(() => {
    const sb = supabaseRef.current;
    const practiceId = data?._v4?.practiceId;
    if (!sb || !practiceId) return;
    let cancelled = false;
    sb.from('clinicians')
      .select('id, show_whos_in')
      .eq('practice_id', practiceId)
      .then(({ data: rows, error }) => {
        if (cancelled || error || !rows) return;
        const map = {};
        for (const r of rows) map[r.id] = r.show_whos_in !== false;
        setFreshShowMap(map);
      });
    return () => { cancelled = true; };
  }, [data?._v4?.practiceId]);

  const isShowWhosIn = (c) => {
    // Prefer the fresh DB value when we have one; fall back to the
    // dashboard's local state if the fetch hasn't completed yet.
    if (freshShowMap && Object.prototype.hasOwnProperty.call(freshShowMap, c.id)) {
      return freshShowMap[c.id];
    }
    return c.showWhosIn !== false;
  };

  const vd = viewingDateProp || new Date();
  const dayIndex = vd.getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex];
  const dateKey = toLocalIso(vd);
  const dayKey = `${dateKey}-${dayName}`;
  const isViewingToday = useMemo(() => { const n = new Date(); n.setHours(0,0,0,0); const v = new Date(vd); v.setHours(0,0,0,0); return v.getTime() === n.getTime(); }, [vd]);

  // Only show people who are visible, not left, not administrative
  const visibleStaff = allClinicians.filter(c => isShowWhosIn(c) && c.status !== 'left' && c.status !== 'administrative');
  const unconfirmedCount = allClinicians.filter(c => !c.confirmed).length;

  // ── Data sources (all hooks MUST be above any early return) ─────

  // 1. CSV: who has slots on viewed date specifically
  const viewingDateStr = toHuddleDateStr(vd);
  const todayCsvClinicians = useMemo(() => {
    if (!huddleData) return [];
    const displayDate = huddleData.dates?.includes(viewingDateStr) ? viewingDateStr : null;
    if (!displayDate) return [];
    return getCliniciansForDate(huddleData, displayDate);
  }, [huddleData, viewingDateStr]);

  const csvPresentIds = useMemo(() => {
    if (todayCsvClinicians.length === 0) return new Set();
    const matched = new Set();
    allClinicians.forEach(c => {
      if (todayCsvClinicians.some(csvName => matchesStaffMember(csvName, c))) matched.add(c.id);
    });
    return matched;
  }, [allClinicians, todayCsvClinicians]);

  const hasCSV = todayCsvClinicians.length > 0;

  // Location data for this date
  const csvLocationMap = useMemo(() => {
    if (!huddleData) return {};
    const displayDate = huddleData.dates?.includes(viewingDateStr) ? viewingDateStr : null;
    if (!displayDate) return {};
    return getClinicianLocationsForDate(huddleData, displayDate);
  }, [huddleData, viewingDateStr]);

  const csvSessionLocMap = useMemo(() => {
    if (!huddleData) return {};
    const displayDate = huddleData.dates?.includes(viewingDateStr) ? viewingDateStr : null;
    if (!displayDate) return {};
    return getClinicianSessionLocations(huddleData, displayDate);
  }, [huddleData, viewingDateStr]);

  // 2. Planned absences: who is on leave today?
  const absenceMap = useMemo(() => {
    const map = {};
    ensureArray(data.plannedAbsences).forEach(a => {
      if (dateKey >= a.startDate && dateKey <= a.endDate) {
        map[a.clinicianId] = a.reason || 'Leave';
      }
    });
    return map;
  }, [data.plannedAbsences, dateKey]);

  // 3. Manual overrides from drag-drop (only if user has dragged today)
  const manualOverride = data.dailyOverrides?.[dayKey];
  const manualPresent = manualOverride?.present ? new Set(ensureArray(manualOverride.present)) : null;

  // 4. Rota (fallback when no CSV)
  const rotaScheduled = ensureArray(data.weeklyRota?.[dayName]);

  // ── Categorise (mutually exclusive with early returns) ────────────
  const categories = useMemo(() => {
    const inPractice = [];
    const leaveAbsent = [];
    const dayOff = [];

    visibleStaff.forEach(person => {
      if (person.longTermAbsent || person.status === 'longTermAbsent') {
        leaveAbsent.push({ person, reason: 'Long-term absent' });
        return;
      }
      if (manualPresent !== null) {
        const isManualScheduled = ensureArray(manualOverride?.scheduled || []).includes(person.id);
        if (isManualScheduled && !manualPresent.has(person.id)) {
          leaveAbsent.push({ person, reason: absenceMap[person.id] || 'Absent' });
          return;
        }
        if (manualPresent.has(person.id)) {
          inPractice.push({ person });
          return;
        }
      }
      if (absenceMap[person.id]) {
        leaveAbsent.push({ person, reason: absenceMap[person.id] });
        return;
      }
      if (hasCSV && csvPresentIds.has(person.id)) {
        inPractice.push({ person });
        return;
      }
      if (!hasCSV && person.buddyCover && rotaScheduled.includes(person.id)) {
        inPractice.push({ person });
        return;
      }
      dayOff.push({ person });
    });

    return { inPractice, leaveAbsent, dayOff };
  }, [visibleStaff, csvPresentIds, absenceMap, manualPresent, manualOverride, hasCSV, rotaScheduled]);

  // Map person IDs to their CSV location
  const personLocationMap = useMemo(() => {
    const map = {};
    allClinicians.forEach(person => {
      Object.entries(csvLocationMap).forEach(([csvName, loc]) => {
        if (matchesStaffMember(csvName, person)) map[person.id] = loc;
      });
    });
    return map;
  }, [allClinicians, csvLocationMap]);

  const personSessionLocMap = useMemo(() => {
    const map = {};
    allClinicians.forEach(person => {
      Object.entries(csvSessionLocMap).forEach(([csvName, locs]) => {
        if (matchesStaffMember(csvName, person)) map[person.id] = locs;
      });
    });
    return map;
  }, [allClinicians, csvSessionLocMap]);

  // Group in-practice by staff group, sorted by location. Site order
  // comes from data.roomAllocation.sites (the order admins set in Room
  // Settings). CSV-only locations sort to the end alphabetically so
  // unfamiliar names group together rather than appearing scattered.
  const siteOrder = useMemo(() => {
    const map = {};
    sites.forEach((s, i) => { map[s.name] = i; });
    return map;
  }, [sites]);
  const sortByLocation = (arr) => arr.sort((a, b) => {
    const locA = personLocationMap[a.person.id];
    const locB = personLocationMap[b.person.id];
    const la = siteOrder[locA] ?? (locA ? 100 : 999); // unknown but present, then absent
    const lb = siteOrder[locB] ?? (locB ? 100 : 999);
    if (la !== lb) return la - lb;
    return (locA || '').localeCompare(locB || '');
  });
  const gpTeam = sortByLocation(categories.inPractice.filter(e => e.person.group === 'gp'));
  const nursingTeam = sortByLocation(categories.inPractice.filter(e => e.person.group === 'nursing'));
  const othersTeam = sortByLocation(categories.inPractice.filter(e => e.person.group !== 'gp' && e.person.group !== 'nursing'));

  // ── NOW safe to early return ───────────────────────────────────────
  if (!DAYS.includes(dayName) || allClinicians.length === 0) return null;

  // Drag-drop manual overrides have been removed — clinicians' status
  // (Present / Absent / Day Off) is driven by the rota + CSV. Clicking a
  // present clinician opens their slot breakdown instead.

  // hide/show person: write show_whos_in directly to the clinicians
  // table via the user's authenticated supabase session. The bulk save
  // path (saveData → /api/v4/data) no longer handles clinician field
  // updates — only inserts — to prevent stale state from overwriting
  // recent toggles. The saveData call below stays so the local
  // dashboard state updates optimistically; the direct supabase write
  // is the actual DB persistence. The freshShowMap also gets updated
  // optimistically so visibleStaff / hiddenPeople reflect the change
  // immediately even though they read from the map, not local state.

  const hidePerson = (id) => {
    if (!canEdit) return;
    const updated = allClinicians.map(c => c.id === id ? { ...c, showWhosIn: false } : c);
    saveData({ ...data, clinicians: updated }, false);
    setFreshShowMap(prev => ({ ...(prev || {}), [id]: false }));
    const sb = supabaseRef.current;
    if (sb) {
      sb.from('clinicians').update({ show_whos_in: false }).eq('id', id).then(({ error }) => {
        if (error) console.error('hidePerson DB write failed', error);
      });
    }
  };

  const showPerson = (id) => {
    if (!canEdit) return;
    const updated = allClinicians.map(c => c.id === id ? { ...c, showWhosIn: true } : c);
    saveData({ ...data, clinicians: updated }, false);
    setFreshShowMap(prev => ({ ...(prev || {}), [id]: true }));
    const sb = supabaseRef.current;
    if (sb) {
      sb.from('clinicians').update({ show_whos_in: true }).eq('id', id).then(({ error }) => {
        if (error) console.error('showPerson DB write failed', error);
      });
    }
  };

  const hiddenPeople = allClinicians.filter(c => !isShowWhosIn(c) && c.status !== 'left' && c.status !== 'administrative');

  // Persist a single-day absence for the candidate clinician. Reason
  // comes from the modal's dropdown; notes are optional and stored
  // free-text (no health data per the absences table convention).
  // Writes directly via the supabase client — same RLS-gated path the
  // rest of v4 uses. After a successful write we refresh the page so
  // the buddy allocator + Who's In widget pick the new absence up;
  // optimistic local update would be nicer but the absence-driven
  // recalc lives in a server-rendered tree above this component.
  const markOffToday = async (personId, reason, notes) => {
    const sb = supabaseRef.current;
    if (!sb) return { error: 'No supabase client' };
    const today = toLocalIso(new Date());
    const { error } = await sb.from('absences').insert({
      clinician_id: personId,
      start_date: today,
      end_date: today,
      reason,
      notes: notes || null,
    });
    if (error) return { error: error.message };
    // Trigger a server re-render so the absence flows back into data
    // (planned absences, who's-in classification, buddy regeneration
    // if the dashboard auto-regens on absence changes).
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
    return { ok: true };
  };

  return (
    <div className="rounded-xl overflow-hidden glass">
      <div className="glass-header px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-heading text-base font-medium text-slate-200">{isViewingToday ? "Who's in today" : `Who's in — ${vd.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`}</span>
            <span className="text-xs text-slate-600">{categories.inPractice.length} in · {categories.leaveAbsent.length + categories.dayOff.length} off</span>
          </div>
          <button onClick={() => setShowSettings(true)}
            className="glass-cog w-8 h-8 rounded-lg flex items-center justify-center"
            title="Who's in settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/></svg>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3" style={{background:'rgba(15,23,42,0.5)'}}>
        {/* Unconfirmed staff banner. Link goes to Practice → Clinicians
            (which replaced the old in-dashboard "Clinicians" page in
            v4.14.0). The link is rendered as a real anchor — full page
            navigation rather than in-dashboard section change, since
            the destination is a different route. */}
        {unconfirmedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.15)'}}>
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <span className="text-xs text-amber-400">{unconfirmedCount} unconfirmed from CSV</span>
            {data?._v4?.practiceSlug && (
              <a
                href={`/v4/practice/${data._v4.practiceSlug}?tab=clinicians`}
                className="ml-auto text-xs font-medium text-amber-300 hover:text-amber-100 underline"
              >Review</a>
            )}
          </div>
        )}

        {/* ROLE SECTIONS */}
        {[
          { label: 'GPs', team: gpTeam, colour: '#3b82f6' },
          { label: 'Nurses & HCAs', team: nursingTeam, colour: '#10b981' },
          { label: 'Other practitioners', team: othersTeam, colour: '#a855f7' },
        ].filter(s => s.team.length > 0).map(section => (
          <div key={section.label}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-1 h-3.5 rounded-full" style={{background:section.colour}} />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{section.label} ({section.team.length})</span>
            </div>
            <PeopleGrid isEmpty={section.team.length === 0}>
              {section.team.map(e => <PersonCard key={e.person.id} person={e.person} status="present" onClick={() => setSelectedPerson({ person: e.person, accent: section.colour })} onHide={() => hidePerson(e.person.id)} onMarkOffToday={canEdit ? () => setOffTodayCandidate(e.person) : null} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} getSiteCol={siteCol} />)}
            </PeopleGrid>
          </div>
        ))}

        {/* LEAVE / ABSENT + DAY OFF — collapsible */}
        {(categories.leaveAbsent.length > 0 || categories.dayOff.length > 0) && (
          <div>
            <button onClick={() => setShowAbsent(!showAbsent)}
              className="flex items-center gap-2 w-full text-left py-1 group">
              <span className={`text-xs text-slate-500 transition-transform ${showAbsent ? 'rotate-90' : ''}`}>▶</span>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {categories.leaveAbsent.length > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />{categories.leaveAbsent.length} absent</span>}
                {categories.dayOff.length > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:'#f59e0b'}} />{categories.dayOff.length} day off</span>}
              </div>
            </button>
            {showAbsent && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {categories.leaveAbsent.map(e => <PersonCard key={e.person.id} person={e.person} status="absent" reason={e.reason} onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} getSiteCol={siteCol} />)}
                {categories.dayOff.map(e => <PersonCard key={e.person.id} person={e.person} status="dayoff" onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} getSiteCol={siteCol} />)}
              </div>
            )}
          </div>
        )}

        {/* Location legend — built from configured sites */}
        {sites.length > 0 && (
          <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 pt-2 text-xs">
            {sites.map(s => (
              <span key={s.name} className="flex items-center gap-1">
                <span className="rounded-sm flex items-center justify-center text-[8px] font-bold text-white" style={{width:14,height:14,background:s.colour||'#64748b'}}>{(s.name || '?').charAt(0).toUpperCase()}</span>
                <span className="text-slate-500">{s.name}</span>
              </span>
            ))}
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">Left=AM Right=PM</span>
          </div>
        )}
      </div>

      {/* Settings — unified right-side panel */}
      <SidePanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Who's In settings"
        subtitle="Hide / show people on this card"
        accent="#06b6d4"
        width="md"
      >
        {hiddenPeople.length > 0 && (
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Hidden — click to restore</div>
            <div className="space-y-1">
              {hiddenPeople.map(c => (
                <button key={c.id} onClick={() => showPerson(c.id)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-emerald-400 transition-colors flex items-center justify-between" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}>
                  <span>{c.name}</span><span className="text-xs text-slate-500">restore</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {Object.entries(STAFF_GROUPS).map(([groupKey, groupInfo]) => {
          const groupPeople = allClinicians.filter(c => c.group === groupKey && c.status !== 'left' && c.status !== 'administrative');
          if (groupPeople.length === 0) return null;
          return (
            <div key={groupKey} className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{groupInfo.label}</div>
              <div className="space-y-1">
                {groupPeople.map(c => (
                  <button key={c.id} onClick={() => isShowWhosIn(c) ? hidePerson(c.id) : showPerson(c.id)}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between" style={{background: isShowWhosIn(c) ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)', border: isShowWhosIn(c) ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.06)', color: isShowWhosIn(c) ? '#34d399' : '#64748b'}}>
                    <span>{c.name}</span><span className="text-xs opacity-60">{c.role}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </SidePanel>

      {/* Slot breakdown — opens when a present person is clicked. CSV
          name lookup uses matchesStaffMember to find the matching CSV row
          for the clicked team-register person. */}
      {selectedPerson && (() => {
        const csvName = todayCsvClinicians.find(n => matchesStaffMember(n, selectedPerson.person));
        if (!csvName) return (
          <SidePanel open={true} onClose={() => setSelectedPerson(null)} title={selectedPerson.person.name} accent={selectedPerson.accent}>
            <div className="px-4 py-8 text-center text-sm text-slate-500">No CSV slot data found for this person on this date.</div>
          </SidePanel>
        );
        return (
          <ClinicianDayPanel
            clinicianName={csvName}
            dateStr={viewingDateStr}
            huddleData={huddleData}
            huddleSettings={data?.huddleSettings}
            overrides={null}
            teamClinicians={allClinicians}
            onClose={() => setSelectedPerson(null)}
            accent={selectedPerson.accent}
          />
        );
      })()}

      {offTodayCandidate && (
        <OffTodayModal
          person={offTodayCandidate}
          onClose={() => setOffTodayCandidate(null)}
          onConfirm={(reason, notes) => markOffToday(offTodayCandidate.id, reason, notes)}
        />
      )}
    </div>
  );
}

// Quick "off today" modal — single-day absence for a clinician the
// user just learned isn't coming in. Reason is a controlled enum
// (matches absences.reason type); notes are optional and free-text.
// On confirm we insert the absence and reload so the rest of the
// dashboard picks up the change.
function OffTodayModal({ person, onClose, onConfirm }) {
  const [reason, setReason] = useState('unwell');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const REASONS = [
    { value: 'unwell', label: 'Unwell' },
    { value: 'annual_leave', label: 'Annual leave' },
    { value: 'training', label: 'Training' },
    { value: 'study_leave', label: 'Study leave' },
    { value: 'parental_leave', label: 'Parental leave' },
    { value: 'compassionate', label: 'Compassionate' },
    { value: 'other', label: 'Other' },
  ];

  const handle = async () => {
    setBusy(true);
    setErr('');
    const res = await onConfirm(reason, notes.trim() || null);
    if (res?.error) {
      setErr(res.error);
      setBusy(false);
    }
    // On success the parent reloads — no need to clean up here.
  };

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, color: 'white', marginBottom: 4 }}>
          Mark off today
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
          {person.title ? `${person.title} ` : ''}{person.name} won&apos;t be in today.
        </div>

        <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          style={{
            width: '100%', padding: '8px 10px', marginBottom: 14,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: 14,
          }}
        >
          {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
          rows={2}
          placeholder="e.g. covering urgent home visit instead"
          style={{
            width: '100%', padding: '8px 10px', marginBottom: 16,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: 14,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />

        {err && (
          <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              color: '#94a3b8',
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handle}
            disabled={busy}
            style={{
              padding: '8px 14px',
              background: busy ? 'rgba(245, 158, 11, 0.3)' : '#f59e0b',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              fontSize: 13,
              fontWeight: 500,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Saving…' : 'Mark off today'}
          </button>
        </div>
      </div>
    </div>
  );
}
