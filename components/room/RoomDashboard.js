'use client';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { autoAllocateRooms, getRoomTypes, GRID_SIZES, RECURRENCE_LABELS, DAY_LABELS, describeRecurrence } from '@/lib/roomAllocation';
import { matchesStaffMember, toLocalIso } from '@/lib/data';
import { getCliniciansForSession } from '@/lib/huddle';
import { predictDemand } from '@/lib/demandPredictor';

export default function RoomDashboard({ data, saveData, huddleData, toast }) {
  const ra = data?.roomAllocation || {};
  const sites = ra.sites || [];
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || null);
  const [session, setSession] = useState('am');
  const [editMode, setEditMode] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [viewingDate, setViewingDate] = useState(() => { const d = new Date(); d.setHours(12,0,0,0); return d; });
  const gridRef = useRef(null);

  // Drag state
  const [dragPerson, setDragPerson] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [hoveredRoom, setHoveredRoom] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const roomRefs = useRef({});

  const selectedSite = sites.find(s => s.id === selectedSiteId);
  const dateStr = toLocalIso(viewingDate);
  const pred = predictDemand(viewingDate, null);
  const isBH = pred?.isBankHoliday || false;
  const isToday = dateStr === toLocalIso(new Date());

  const navigateDay = (dir) => {
    const d = new Date(viewingDate); d.setDate(d.getDate() + dir); d.setHours(12,0,0,0);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + dir);
    setViewingDate(d);
  };

  const csvDateStr = useMemo(() => {
    const d = new Date(dateStr + 'T12:00:00');
    return `${String(d.getDate()).padStart(2,'0')}-${d.toLocaleString('en-GB',{month:'short'})}-${d.getFullYear()}`;
  }, [dateStr]);

  const allClinicians = useMemo(() => Array.isArray(data?.clinicians) ? data.clinicians : Object.values(data?.clinicians || {}), [data?.clinicians]);

  // Debug info
  const debugInfo = useMemo(() => {
    if (!huddleData || !showDebug) return [];
    const info = [];
    (huddleData.clinicians || []).forEach((csvName, idx) => {
      const clin = allClinicians.find(c => matchesStaffMember(csvName, c));
      const amSlots = {}, pmSlots = {};
      let amTotal = 0, pmTotal = 0;
      ['dateData','bookedData','embargoedData'].forEach(storeName => {
        const store = huddleData[storeName];
        if (!store?.[csvDateStr]) return;
        ['am','pm'].forEach(sess => {
          const d = store[csvDateStr]?.[sess]?.[idx];
          if (!d) return;
          const target = sess === 'am' ? amSlots : pmSlots;
          Object.entries(d).forEach(([st, count]) => {
            target[`${storeName.replace('Data','')}: ${st}`] = (target[`${storeName.replace('Data','')}: ${st}`] || 0) + count;
            if (sess === 'am') amTotal += count; else pmTotal += count;
          });
        });
      });
      if (amTotal > 0 || pmTotal > 0) {
        const locData = huddleData.locationData?.[csvDateStr]?.[idx];
        const locations = locData ? Object.entries(locData).sort((a,b) => b[1]-a[1]).map(([l,c]) => `${l}(${c})`) : [];
        const location = locData ? Object.entries(locData).sort((a,b) => b[1]-a[1])[0]?.[0] : null;
        info.push({ csvName, matchedTo: clin?.name || '⚠ UNMATCHED', isAdmin: clin ? (clin.status === 'administrative' || clin.group === 'admin') : false, location, locations: locations.join(', '), amTotal, pmTotal, amSlots, pmSlots });
      }
    });
    return info;
  }, [huddleData, csvDateStr, allClinicians, showDebug]);

  // Session-filtered clinicians at this site (strict location matching)
  const cliniciansAtSite = useMemo(() => {
    if (!huddleData || !selectedSite) return [];
    const csvClinicians = getCliniciansForSession(huddleData, csvDateStr, session);
    if (csvClinicians.length === 0) return [];
    const locData = huddleData.locationData?.[csvDateStr] || {};
    const hasAnyLocationData = Object.keys(locData).length > 0;
    const matched = [];
    csvClinicians.forEach(csvName => {
      const clin = allClinicians.find(c => matchesStaffMember(csvName, c));
      if (!clin || clin.status === 'administrative' || clin.group === 'admin') return;
      const clinIdx = huddleData.clinicians.indexOf(csvName);
      const clinLocations = locData[clinIdx];
      if (clinLocations) {
        if (Object.keys(clinLocations).includes(selectedSite.name)) matched.push({ id: clin.id, csvName });
      } else if (!hasAnyLocationData) {
        matched.push({ id: clin.id, csvName });
      }
    });
    return matched;
  }, [huddleData, csvDateStr, session, selectedSite, allClinicians]);

  // Detect which nurses need procedure rooms this session
  const procedureFlags = useMemo(() => {
    const procSlots = ra.procedureSlotTypes || [];
    if (procSlots.length === 0 || !huddleData) return {};
    const flags = {}; // { clinicianId: [matchingSlotType, ...] }
    cliniciansAtSite.forEach(c => {
      const clin = allClinicians.find(cl => cl.id === c.id);
      if (!clin || clin.group !== 'nursing') return;
      const clinIdx = huddleData.clinicians.indexOf(c.csvName);
      if (clinIdx < 0) return;
      const matchedSlots = [];
      [huddleData.dateData, huddleData.bookedData, huddleData.embargoedData].forEach(store => {
        const sessData = store?.[csvDateStr]?.[session]?.[clinIdx];
        if (!sessData) return;
        Object.keys(sessData).forEach(st => { if (procSlots.some(ps => st.toLowerCase().includes(ps.toLowerCase())) && !matchedSlots.includes(st)) matchedSlots.push(st); });
      });
      if (matchedSlots.length > 0) flags[c.id] = matchedSlots;
    });
    return flags;
  }, [cliniciansAtSite, ra.procedureSlotTypes, huddleData, csvDateStr, session, allClinicians]);

  // Allocation — always recompute for today, use history only for past dates
  const historyKey = `${dateStr}-${session}-${selectedSiteId}`;
  const overrideKey = `${dateStr}-${session}`;
  const siteOverrides = ra.dailyOverrides?.[selectedSiteId]?.[overrideKey];

  const allocation = useMemo(() => {
    if (!selectedSite || isBH) return { assignments: {}, conflicts: [], flags: [] };
    // For today: always fresh compute (unless manual overrides exist)
    // For past dates: use saved history if available
    if (!isToday) {
      const saved = ra.allocationHistory?.[historyKey];
      if (saved) return saved;
    }
    return autoAllocateRooms(selectedSite, session, cliniciansAtSite, ra.recurringBookings || [], ra.adHocBookings || [], dateStr, allClinicians, ra.clinicianPriority || [], ra.dailyOverrides || {}, procedureFlags);
  }, [selectedSite, session, cliniciansAtSite, ra, dateStr, isBH, allClinicians, isToday, historyKey, procedureFlags]);

  // Auto-save today's allocation
  useEffect(() => {
    if (!isToday || !selectedSite || isBH) return;
    if (Object.keys(allocation.assignments).length === 0 && allocation.conflicts.length === 0) return;
    const existing = ra.allocationHistory?.[historyKey];
    if (existing && JSON.stringify(existing.assignments) === JSON.stringify(allocation.assignments)) return;
    saveData({ ...data, roomAllocation: { ...ra, allocationHistory: { ...(ra.allocationHistory || {}), [historyKey]: allocation } } }, false);
  }, [historyKey, allocation]);

  const siteColour = selectedSite?.colour || '#6366f1';
  const roomTypes = getRoomTypes(ra);
  const grid = selectedSite ? GRID_SIZES[selectedSite.gridSize] || GRID_SIZES.small : GRID_SIZES.small;

  const cropBounds = useMemo(() => {
    if (!selectedSite || !selectedSite.rooms?.length) return { x: 0, y: 0, w: grid.cols, h: grid.rows };
    const rooms = selectedSite.rooms;
    const minX = Math.max(0, Math.min(...rooms.map(r => r.x)) - 1);
    const minY = Math.max(0, Math.min(...rooms.map(r => r.y)) - 1);
    const maxX = Math.min(grid.cols - 1, Math.max(...rooms.map(r => r.x + (r.w || 1) - 1)) + 1);
    const maxY = Math.min(grid.rows - 1, Math.max(...rooms.map(r => r.y + (r.h || 1) - 1)) + 1);
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }, [selectedSite, grid]);

  const assignedIds = useMemo(() => {
    const s = new Set();
    Object.values(allocation.assignments).forEach(a => { if (a?.id) s.add(a.id); });
    return s;
  }, [allocation]);

  // ── Pointer-based drag ──────────────────────────────────────
  const startDrag = useCallback((person, e) => {
    if (!editMode) return;
    e.preventDefault();
    setDragPerson(person);
    setDragPos({ x: e.clientX, y: e.clientY });
    setIsDragging(true);
    setHoveredRoom(null);
  }, [editMode]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      // Hit-test rooms
      let found = null;
      Object.entries(roomRefs.current).forEach(([roomId, el]) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) found = roomId;
      });
      setHoveredRoom(found);
    };
    const onUp = () => {
      if (hoveredRoom === '__unallocate__') {
        doUnallocate();
      } else if (hoveredRoom && dragPerson) {
        doPlace(hoveredRoom);
      }
      setIsDragging(false);
      setDragPerson(null);
      setHoveredRoom(null);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
  }, [isDragging, hoveredRoom, dragPerson]);

  // Compute natural allocation (without overrides) for override comparison
  const naturalAllocation = useMemo(() => {
    if (!selectedSite || isBH) return { assignments: {} };
    return autoAllocateRooms(selectedSite, session, cliniciansAtSite, ra.recurringBookings || [], ra.adHocBookings || [], dateStr, allClinicians, ra.clinicianPriority || [], {}, procedureFlags);
  }, [selectedSite, session, cliniciansAtSite, ra.recurringBookings, ra.adHocBookings, dateStr, allClinicians, ra.clinicianPriority, isBH, procedureFlags]);

  const doPlace = (roomId) => {
    if (!dragPerson || !selectedSite) return;
    const cur = { ...(allocation.assignments) };
    Object.keys(cur).forEach(rId => { if (cur[rId]?.id === dragPerson.id) delete cur[rId]; });
    // Check if this is where auto-allocation would have put them
    const naturalRoom = Object.entries(naturalAllocation.assignments).find(([_, a]) => a?.id === dragPerson.id)?.[0];
    const isBackToNatural = naturalRoom === roomId;
    cur[roomId] = { ...dragPerson, isOverride: !isBackToNatural };
    const newOverrides = { ...ra.dailyOverrides, [selectedSite.id]: { ...(ra.dailyOverrides?.[selectedSite.id] || {}), [overrideKey]: cur } };
    const newHistory = { ...(ra.allocationHistory || {}), [historyKey]: { ...allocation, assignments: cur } };
    saveData({ ...data, roomAllocation: { ...ra, dailyOverrides: newOverrides, allocationHistory: newHistory } });
    toast('Room assigned', 'success');
  };

  const doUnallocate = () => {
    if (!dragPerson || !selectedSite) return;
    const cur = { ...(allocation.assignments) };
    Object.keys(cur).forEach(rId => { if (cur[rId]?.id === dragPerson.id) delete cur[rId]; });
    const newOverrides = { ...ra.dailyOverrides, [selectedSite.id]: { ...(ra.dailyOverrides?.[selectedSite.id] || {}), [overrideKey]: cur } };
    const newHistory = { ...(ra.allocationHistory || {}), [historyKey]: { ...allocation, assignments: cur } };
    saveData({ ...data, roomAllocation: { ...ra, dailyOverrides: newOverrides, allocationHistory: newHistory } });
    toast('Clinician unallocated', 'success');
  };

  // Reset overrides — all sites for this date+session
  const resetAll = () => {
    const newOverrides = { ...ra.dailyOverrides };
    const newHistory = { ...(ra.allocationHistory || {}) };
    sites.forEach(s => {
      const key = `${dateStr}-${session}`;
      if (newOverrides[s.id]) { delete newOverrides[s.id][key]; }
      delete newHistory[`${dateStr}-${session}-${s.id}`];
    });
    saveData({ ...data, roomAllocation: { ...ra, dailyOverrides: newOverrides, allocationHistory: newHistory } });
    toast('All overrides reset', 'success');
  };

  // Bookings management
  const [editBooking, setEditBooking] = useState(null);
  const [showBookings, setShowBookings] = useState(false);
  const recurringBookings = ra.recurringBookings || [];
  const adHocBookings = ra.adHocBookings || [];
  const save = (newRA) => saveData({ ...data, roomAllocation: newRA });
  const saveBooking = (b) => {
    if (b.type === 'recurring') { const list = recurringBookings.find(x => x.id === b.id) ? recurringBookings.map(x => x.id === b.id ? b : x) : [...recurringBookings, { ...b, id: 'rec_' + Date.now() }]; save({ ...ra, recurringBookings: list }); }
    else { const list = adHocBookings.find(x => x.id === b.id) ? adHocBookings.map(x => x.id === b.id ? b : x) : [...adHocBookings, { ...b, id: 'adhoc_' + Date.now() }]; save({ ...ra, adHocBookings: list }); }
    setEditBooking(null); toast('Booking saved', 'success');
  };
  const deleteBooking = (id, type) => { save(type === 'recurring' ? { ...ra, recurringBookings: recurringBookings.filter(b => b.id !== id) } : { ...ra, adHocBookings: adHocBookings.filter(b => b.id !== id) }); toast('Deleted', 'success'); };

  const hasAnyOverrides = sites.some(s => ra.dailyOverrides?.[s.id]?.[`${dateStr}-${session}`]);

  if (sites.length === 0) return (
    <div className="card p-12 text-center"><div className="text-2xl mb-2">🏥</div><h3 className="text-sm font-semibold text-slate-600 mb-1">Room allocation not configured</h3><p className="text-xs text-slate-400">Set up sites and rooms in Settings → Room Allocation</p></div>
  );

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden print:shadow-none print:border-0">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-3 flex items-center justify-between print:bg-white print:border-b print:border-slate-200">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="print:stroke-slate-700"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <span className="text-sm font-semibold text-white print:text-slate-900">Room Allocation</span>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={() => setShowDebug(!showDebug)} className={`text-xs px-2 py-1 rounded transition-colors ${showDebug ? 'bg-amber-400 text-amber-900 font-medium' : 'bg-white/20 text-white/70 hover:text-white hover:bg-white/30'}`}>{showDebug ? '● Debug' : 'Debug'}</button>
            <button onClick={() => window.print()} className="text-xs px-2 py-1 rounded bg-white/20 text-white hover:bg-white/30">Print</button>
            {hasAnyOverrides && <button onClick={resetAll} className="text-xs text-white/60 hover:text-white">Reset all</button>}
            <button onClick={() => { setEditMode(!editMode); setDragPerson(null); }} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${editMode ? 'bg-white text-indigo-600' : 'bg-white/20 text-white hover:bg-white/30'}`}>{editMode ? 'Done' : 'Edit'}</button>
          </div>
        </div>

        <div className="px-5 py-2 border-b border-indigo-400/20 bg-indigo-700/30 flex items-center justify-center gap-3 print:bg-white print:border-slate-200">
          <button onClick={() => navigateDay(-1)} className="text-white/60 hover:text-white text-sm font-bold px-2 print:hidden">◀</button>
          <span className="text-sm font-semibold text-white min-w-[200px] text-center print:text-slate-900">{viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <button onClick={() => navigateDay(1)} className="text-white/60 hover:text-white text-sm font-bold px-2 print:hidden">▶</button>
          {!isToday && <button onClick={() => { const d = new Date(); d.setHours(12,0,0,0); setViewingDate(d); }} className="text-xs px-2 py-0.5 rounded bg-white/20 text-white hover:bg-white/30 ml-2 print:hidden">Today</button>}
        </div>

        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex gap-1">{sites.map(s => (
            <button key={s.id} onClick={() => setSelectedSiteId(s.id)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedSiteId === s.id ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} style={selectedSiteId === s.id ? {background: s.colour || '#6366f1'} : undefined}>{s.name}</button>
          ))}</div>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setSession('am')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${session === 'am' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>AM</button>
            <button onClick={() => setSession('pm')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${session === 'pm' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>PM</button>
          </div>
        </div>

        {isBH ? <div className="p-12 text-center"><span className="text-sm font-semibold text-amber-500">Bank holiday — practice closed</span></div>
        : !selectedSite ? <div className="p-12 text-center text-sm text-slate-400">Select a site</div>
        : (
          <div className="p-5">
            {/* Unallocate drop zone — visible during drag */}
            {isDragging && (
              <div ref={el => roomRefs.current['__unallocate__'] = el}
                className={`mb-3 py-3 rounded-xl border-2 border-dashed text-center transition-colors ${hoveredRoom === '__unallocate__' ? 'border-red-500 bg-red-100' : 'border-red-300 bg-red-50'}`}>
                <span className={`text-sm ${hoveredRoom === '__unallocate__' ? 'text-red-600 font-semibold' : 'text-red-400'}`}>Drop to remove from room</span>
              </div>
            )}

            {/* Main layout: rooms left, clinicians right */}
            <div className="flex gap-5">
              {/* LEFT — Spatial room grid with mini-cards */}
              <div className="flex-1 min-w-0 overflow-x-auto" ref={gridRef}>
                <div className="relative rounded-xl p-2" style={{background:'#f8fafc', border:'1px solid #e2e8f0'}}>
                  <div style={{display:'grid', gridTemplateColumns:`repeat(${cropBounds.w}, 200px)`, gridTemplateRows:`repeat(${cropBounds.h}, auto)`, gap: 6}}>
                    {(selectedSite.rooms || []).map(room => {
                      const w = room.w || 1, h = room.h || 1, nc = room.isClinical === false;
                      const assigned = nc ? null : allocation.assignments[room.id];
                      const isOv = assigned?.isOverride;
                      const typeDots = nc ? [] : (room.types || []).map(t => roomTypes.find(rt => rt.id === t)).filter(Boolean);
                      const rx = room.x - cropBounds.x + 1, ry = room.y - cropBounds.y + 1;
                      const isHovered = hoveredRoom === room.id;
                      const beingDraggedFrom = isDragging && assigned && dragPerson?.id === assigned.id;
                      const procSlots = assigned ? procedureFlags[assigned.id] : null;

                      if (nc) return (
                        <div key={room.id} style={{gridColumn:`${rx} / span ${w}`, gridRow:`${ry} / span ${h}`, background:'#e2e8f0', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', padding:10, opacity:0.7, minHeight:52}}>
                          <span className="text-xs font-semibold text-slate-500 text-center leading-tight">{room.name}</span>
                        </div>
                      );

                      return (
                        <div key={room.id}
                          ref={el => { roomRefs.current[room.id] = el; }}
                          onPointerDown={editMode && assigned ? (e) => startDrag(assigned, e) : undefined}
                          style={{gridColumn:`${rx} / span ${w}`, gridRow:`${ry} / span ${h}`, background: assigned && !beingDraggedFrom ? '#fff' : '#fafafa', border: isOv ? '2px solid #f59e0b' : assigned ? `2px solid ${siteColour}40` : '2px dashed #e2e8f0', borderRadius:10, overflow:'hidden', opacity: beingDraggedFrom ? 0.25 : 1, transition:'all 0.15s'}}
                          className={`${editMode && assigned ? 'cursor-grab active:cursor-grabbing' : ''} ${isHovered ? 'ring-2 ring-indigo-500 ring-offset-1 scale-[1.03] shadow-lg' : ''}`}>
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{background: assigned && !beingDraggedFrom ? siteColour + '15' : '#f8fafc', borderBottom:'1px solid #f1f5f9'}}>
                            <span className="text-[11px] font-bold flex-1 truncate" style={{color: assigned && !beingDraggedFrom ? siteColour : '#94a3b8'}}>{room.name}</span>
                            {typeDots.map(rt => <span key={rt.id} className="w-2 h-2 rounded-full flex-shrink-0" style={{background:rt.colour}} title={rt.label} />)}
                          </div>
                          <div className="px-2.5 py-2 flex items-center gap-2.5" style={{minHeight:50}}>
                            {assigned && !beingDraggedFrom ? (<>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{background: siteColour}}>{assigned.initials || '?'}</div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-slate-900 truncate">{assigned.name}</div>
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  {isOv && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">Override</span>}
                                  {procSlots && <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 font-medium" title={procSlots.join(', ')}>Procedure</span>}
                                  {assigned.isPreferred === false && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 font-medium">Not pref</span>}
                                </div>
                              </div>
                            </>) : (
                              <span className="text-xs text-slate-300 w-full text-center">{isDragging ? 'Drop here' : 'Vacant'}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT — Clinician cards sorted by role */}
              {cliniciansAtSite.length > 0 && (
                <div className="w-52 flex-shrink-0">
                  <div className="text-xs text-slate-500 font-medium mb-2">{session.toUpperCase()} · {cliniciansAtSite.length} at {selectedSite.name}</div>
                  <div className="space-y-3">
                    {[{group:'gp',label:'Clinicians',col:'#3b82f6'},{group:'nursing',label:'Nursing',col:'#10b981'},{group:'allied',label:'Allied',col:'#8b5cf6'}].map(g => {
                      const members = cliniciansAtSite.map(c => {
                        const clin = allClinicians.find(cl => cl.id === c.id);
                        return clin?.group === g.group ? { ...c, clin } : null;
                      }).filter(Boolean);
                      if (members.length === 0) return null;
                      return (
                        <div key={g.group}>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:g.col}}/>{g.label}</div>
                          <div className="space-y-1">
                            {members.map(({clin, ...c}) => {
                              const hasRoom = assignedIds.has(c.id);
                              const beingDragged = isDragging && dragPerson?.id === c.id;
                              const procSlots = procedureFlags[c.id];
                              return (
                                <div key={c.id}
                                  onPointerDown={editMode ? (e) => startDrag({ id: c.id, name: clin.name, initials: clin.initials, source: 'csv' }, e) : undefined}
                                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all duration-150 select-none
                                    ${hasRoom ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}
                                    ${editMode ? 'cursor-grab active:cursor-grabbing hover:shadow-md' : ''}
                                    ${beingDragged ? 'opacity-30 scale-95' : ''}`}>
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasRoom ? 'bg-emerald-500' : 'bg-red-400'}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-slate-800 truncate">{clin.name}</div>
                                    <div className="text-[10px] text-slate-400">{clin.role}</div>
                                  </div>
                                  {procSlots && (
                                    <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-sky-500 text-white flex-shrink-0 cursor-default" title={`Procedure room needed: ${procSlots.join(', ')}`}>P</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>{/* end flex container */}

            {/* Floating drag element */}
            {isDragging && dragPerson && (
              <div className="fixed z-50 pointer-events-none" style={{left: dragPos.x - 30, top: dragPos.y - 20}}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl shadow-2xl border border-indigo-300 bg-white">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{background: siteColour}}>{dragPerson.initials}</div>
                  <div className="text-sm font-semibold text-slate-900">{dragPerson.name}</div>
                </div>
              </div>
            )}

            {/* Conflicts */}
            {allocation.conflicts.length > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200">
                <div className="flex items-center gap-2 mb-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg><span className="text-sm font-semibold text-red-700">Unassigned ({allocation.conflicts.length})</span></div>
                <div className="space-y-1.5">{allocation.conflicts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white"><div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-red-400">{c.initials}</div><span className="text-sm text-slate-700 flex-1">{c.name}</span><span className="text-xs text-red-500">{c.message}</span></div>
                ))}</div>
              </div>
            )}

            {allocation.flags.length > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
                <div className="text-xs font-semibold text-blue-700 mb-2">Allocation notes</div>
                <div className="space-y-1">{allocation.flags.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-blue-600"><span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800}}>?</span><span><strong>{f.name}:</strong> {f.message}</span></div>
                ))}</div>
              </div>
            )}

            <div className="flex items-center gap-4 pt-3 border-t border-slate-100 text-[10px] text-slate-500 flex-wrap">
              {roomTypes.map(rt => <span key={rt.id} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:rt.colour}} />{rt.label}</span>)}
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Room assigned</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />No room</span>
            </div>

            {cliniciansAtSite.length === 0 && allocation.conflicts.length === 0 && Object.keys(allocation.assignments).length === 0 && (
              <div className="text-center py-8 text-slate-400"><div className="text-xl mb-2">📊</div><div className="text-sm">No {session.toUpperCase()} data for {isToday ? 'today' : 'this date'}</div></div>
            )}
          </div>
        )}
      </div>

      {/* Debug panel */}
      {showDebug && (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-amber-600 to-amber-500 px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Session Debug — {csvDateStr} ({session.toUpperCase()})</span>
            <button onClick={() => setShowDebug(false)} className="text-xs text-white/70 hover:text-white">Close</button>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200 text-left">
                <th className="py-2 px-2 font-semibold text-slate-500">CSV Name</th>
                <th className="py-2 px-2 font-semibold text-slate-500">Matched To</th>
                <th className="py-2 px-2 font-semibold text-slate-500">Locations</th>
                <th className="py-2 px-2 font-semibold text-slate-500 text-center">AM</th>
                <th className="py-2 px-2 font-semibold text-slate-500 text-center">PM</th>
                <th className="py-2 px-2 font-semibold text-slate-500">AM Detail</th>
                <th className="py-2 px-2 font-semibold text-slate-500">PM Detail</th>
                <th className="py-2 px-2 font-semibold text-slate-500">Status</th>
              </tr></thead>
              <tbody>{debugInfo.map((d, i) => {
                const inSession = session === 'am' ? d.amTotal > 0 : d.pmTotal > 0;
                const matchesSite = d.location && d.location === selectedSite?.name;
                return (
                  <tr key={i} className={`border-b border-slate-50 ${inSession && matchesSite && !d.isAdmin ? 'bg-emerald-50' : d.isAdmin ? 'bg-slate-100 opacity-50' : inSession && !matchesSite ? 'bg-amber-50/50' : ''}`}>
                    <td className="py-1.5 px-2 font-mono">{d.csvName}</td>
                    <td className="py-1.5 px-2">{d.matchedTo}</td>
                    <td className="py-1.5 px-2 text-[10px]">{d.locations || '—'}</td>
                    <td className="py-1.5 px-2 text-center font-bold" style={{color: d.amTotal > 0 ? '#059669' : '#94a3b8'}}>{d.amTotal}</td>
                    <td className="py-1.5 px-2 text-center font-bold" style={{color: d.pmTotal > 0 ? '#059669' : '#94a3b8'}}>{d.pmTotal}</td>
                    <td className="py-1.5 px-2 text-[10px] text-slate-400">{Object.entries(d.amSlots).map(([k,v]) => `${k}:${v}`).join(', ') || '—'}</td>
                    <td className="py-1.5 px-2 text-[10px] text-slate-400">{Object.entries(d.pmSlots).map(([k,v]) => `${k}:${v}`).join(', ') || '—'}</td>
                    <td className="py-1.5 px-2">
                      {d.isAdmin ? <span className="text-slate-400">Admin</span>
                      : !inSession ? <span className="text-slate-400">No {session.toUpperCase()} slots</span>
                      : !d.location ? <span className="text-amber-500">No location</span>
                      : matchesSite ? <span className="text-emerald-600 font-medium">✓ {selectedSite?.name}</span>
                      : <span className="text-slate-400">{d.location}</span>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
            {debugInfo.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No CSV data for this date</p>}
          </div>
        </div>
      )}

      {/* Bookings card */}
      <div className="card overflow-hidden print:hidden">
        <button onClick={() => setShowBookings(!showBookings)} className="w-full bg-gradient-to-r from-slate-700 to-slate-600 px-5 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Room Bookings</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50">{recurringBookings.length} recurring · {adHocBookings.length} ad hoc</span>
            <span className="text-white/50 text-xs">{showBookings ? '▲' : '▼'}</span>
          </div>
        </button>
        {showBookings && (
          <div className="p-5">
            <div className="flex gap-2 mb-3">
              <button onClick={() => setEditBooking({ type: 'recurring', siteId: sites[0]?.id || '', name: '', session: 'am', roomTypes: [], preferredRoom: null, recurrence: { frequency: 'weekly', day: 1 } })} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium">+ Recurring</button>
              <button onClick={() => setEditBooking({ type: 'adhoc', siteId: sites[0]?.id || '', name: '', session: 'am', roomTypes: [], preferredRoom: null, date: new Date().toISOString().split('T')[0] })} className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 font-medium">+ Ad hoc</button>
            </div>
            <div className="space-y-1.5">
              {recurringBookings.length === 0 && adHocBookings.length === 0 && <p className="text-sm text-slate-400 text-center py-3">No bookings configured</p>}
              {recurringBookings.map(b => { const site = sites.find(s => s.id === b.siteId); return <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                {site && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: site.colour || '#94a3b8'}} />}
                <span className="text-sm font-medium text-slate-700 flex-1">{b.name}</span><span className="text-xs text-slate-400">{site?.name}</span><span className="text-xs text-slate-500">{describeRecurrence(b.recurrence)}</span><span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-600">{b.session.toUpperCase()}</span>
                <button onClick={() => setEditBooking({ ...b, type: 'recurring' })} className="text-xs text-indigo-500 hover:text-indigo-700">Edit</button><button onClick={() => deleteBooking(b.id, 'recurring')} className="text-xs text-red-400 hover:text-red-600">×</button>
              </div>; })}
              {adHocBookings.map(b => { const site = sites.find(s => s.id === b.siteId); return <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors">
                {site && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: site.colour || '#94a3b8'}} />}
                <span className="text-sm font-medium text-slate-700 flex-1">{b.name}</span><span className="text-xs text-slate-400">{site?.name}</span><span className="text-xs text-amber-600">{b.date}</span><span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-600">{b.session.toUpperCase()}</span>
                <button onClick={() => setEditBooking({ ...b, type: 'adhoc' })} className="text-xs text-indigo-500 hover:text-indigo-700">Edit</button><button onClick={() => deleteBooking(b.id, 'adhoc')} className="text-xs text-red-400 hover:text-red-600">×</button>
              </div>; })}
            </div>
          </div>
        )}
      </div>

      {/* Booking edit modal */}
      {editBooking && <BookingEditModal booking={editBooking} sites={sites} roomTypes={roomTypes} onSave={saveBooking} onCancel={() => setEditBooking(null)} />}
    </div>
  );
}

function BookingEditModal({ booking, sites, roomTypes, onSave, onCancel }) {
  const [b, setB] = useState(booking);
  const update = (k, v) => setB(prev => ({ ...prev, [k]: v }));
  const updateRec = (k, v) => setB(prev => ({ ...prev, recurrence: { ...prev.recurrence, [k]: v } }));
  const toggleType = (t) => setB(prev => ({ ...prev, roomTypes: (prev.roomTypes || []).includes(t) ? prev.roomTypes.filter(x => x !== t) : [...(prev.roomTypes || []), t] }));
  const selectedSite = sites.find(s => s.id === b.siteId);
  const rooms = selectedSite ? (selectedSite.rooms || []).filter(r => r.isClinical !== false) : [];
  return <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onCancel}>
    <div className="bg-white rounded-xl shadow-2xl p-5 w-[420px]" onClick={e => e.stopPropagation()}>
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{b.type === 'recurring' ? 'Recurring booking' : 'Ad hoc booking'}</h3>
      <div className="space-y-4">
        <div><label className="text-xs text-slate-500 block mb-1">Name</label><input type="text" value={b.name} onChange={e => update('name', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" placeholder="e.g. Podiatry" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-500 block mb-1">Site</label><select value={b.siteId || ''} onChange={e => { update('siteId', e.target.value); update('preferredRoom', null); }} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"><option value="">Select site</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="text-xs text-slate-500 block mb-1">Session</label><select value={b.session} onChange={e => update('session', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"><option value="am">AM</option><option value="pm">PM</option></select></div>
        </div>
        {b.type === 'adhoc' && <div><label className="text-xs text-slate-500 block mb-1">Date</label><input type="date" value={b.date || ''} onChange={e => update('date', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" /></div>}
        {b.type === 'recurring' && <div className="space-y-3">
          <div><label className="text-xs text-slate-500 block mb-1">Frequency</label><select value={b.recurrence?.frequency || 'weekly'} onChange={e => updateRec('frequency', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">{Object.entries(RECURRENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          {['weekly','biweekly','monthly_day'].includes(b.recurrence?.frequency) && <div><label className="text-xs text-slate-500 block mb-1">Day</label><select value={b.recurrence?.day ?? 1} onChange={e => updateRec('day', parseInt(e.target.value))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">{[1,2,3,4,5].map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}</select></div>}
          {b.recurrence?.frequency === 'monthly_day' && <div><label className="text-xs text-slate-500 block mb-1">Which week</label><select value={b.recurrence?.nth ?? 1} onChange={e => updateRec('nth', parseInt(e.target.value))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">{[1,2,3,4].map(n => <option key={n} value={n}>{['','1st','2nd','3rd','4th'][n]}</option>)}</select></div>}
          {b.recurrence?.frequency === 'monthly_date' && <div><label className="text-xs text-slate-500 block mb-1">Date of month</label><input type="number" min={1} max={31} value={b.recurrence?.dateOfMonth ?? 1} onChange={e => updateRec('dateOfMonth', parseInt(e.target.value))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" /></div>}
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-500 block mb-1">Start date</label><input type="date" value={b.recurrence?.startDate || ''} onChange={e => updateRec('startDate', e.target.value || undefined)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" /></div><div><label className="text-xs text-slate-500 block mb-1">End date</label><input type="date" value={b.recurrence?.endDate || ''} onChange={e => updateRec('endDate', e.target.value || undefined)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" /></div></div>
        </div>}
        <div><label className="text-xs text-slate-500 block mb-1">Preferred room</label><select value={b.preferredRoom || ''} onChange={e => update('preferredRoom', e.target.value || null)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"><option value="">Any suitable room</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div><label className="text-xs text-slate-500 block mb-2">Room type (fallback)</label><div className="flex flex-wrap gap-2">{roomTypes.map(rt => <button key={rt.id} onClick={() => toggleType(rt.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${(b.roomTypes || []).includes(rt.id) ? 'text-white' : 'bg-slate-100 text-slate-500'}`} style={(b.roomTypes || []).includes(rt.id) ? {background:rt.colour} : undefined}>{rt.label}</button>)}</div></div>
      </div>
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100"><button onClick={onCancel} className="btn-secondary text-sm">Cancel</button><button onClick={() => b.name.trim() && b.siteId && onSave(b)} disabled={!b.name.trim() || !b.siteId} className="btn-primary text-sm">Save</button></div>
    </div>
  </div>;
}
