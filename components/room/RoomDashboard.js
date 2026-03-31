'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { autoAllocateRooms, getRoomTypes, GRID_SIZES } from '@/lib/roomAllocation';
import { matchesStaffMember, toLocalIso } from '@/lib/data';
import { getCliniciansForSession } from '@/lib/huddle';
import { predictDemand } from '@/lib/demandPredictor';

export default function RoomDashboard({ data, saveData, huddleData, toast }) {
  const ra = data?.roomAllocation || {};
  const sites = ra.sites || [];
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || null);
  const [session, setSession] = useState('am');
  const [editMode, setEditMode] = useState(false);
  const [dragPerson, setDragPerson] = useState(null);
  const [viewingDate, setViewingDate] = useState(() => { const d = new Date(); d.setHours(12,0,0,0); return d; });
  const gridRef = useRef(null);
  const [gridWidth, setGridWidth] = useState(700);

  const selectedSite = sites.find(s => s.id === selectedSiteId);
  const dateStr = toLocalIso(viewingDate);
  const pred = predictDemand(viewingDate, null);
  const isBH = pred?.isBankHoliday || false;
  const isToday = dateStr === toLocalIso(new Date());

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => { if (entries[0]) setGridWidth(entries[0].contentRect.width); });
    ro.observe(el); setGridWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, [selectedSiteId]);

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

  // Session-filtered clinicians at this site
  const cliniciansAtSite = useMemo(() => {
    if (!huddleData || !selectedSite) return [];
    const csvClinicians = getCliniciansForSession(huddleData, csvDateStr, session);
    if (csvClinicians.length === 0) return [];
    const locData = huddleData.locationData?.[csvDateStr] || {};
    const matched = [];
    csvClinicians.forEach(csvName => {
      const clin = allClinicians.find(c => matchesStaffMember(csvName, c));
      if (!clin) return;
      if (clin.status === 'administrative' || clin.group === 'admin') return;
      const clinIdx = huddleData.clinicians.indexOf(csvName);
      const clinLocations = locData[clinIdx];
      let location = null;
      if (clinLocations) { const entries = Object.entries(clinLocations).sort((a, b) => b[1] - a[1]); location = entries[0]?.[0]; }
      if (!location || location === selectedSite.name) matched.push({ id: clin.id, csvName });
    });
    return matched;
  }, [huddleData, csvDateStr, session, selectedSite, allClinicians]);

  // Allocation
  const historyKey = `${dateStr}-${session}-${selectedSiteId}`;
  const savedAllocation = ra.allocationHistory?.[historyKey];
  const allocation = useMemo(() => {
    if (!selectedSite || isBH) return { assignments: {}, conflicts: [], flags: [] };
    if (savedAllocation) return savedAllocation;
    return autoAllocateRooms(selectedSite, session, cliniciansAtSite, ra.recurringBookings || [], ra.adHocBookings || [], dateStr, allClinicians, ra.clinicianPriority || [], ra.dailyOverrides || {});
  }, [selectedSite, session, cliniciansAtSite, ra, dateStr, isBH, allClinicians, savedAllocation]);

  // Auto-save today's allocation
  useEffect(() => {
    if (!isToday || !selectedSite || isBH || savedAllocation) return;
    if (Object.keys(allocation.assignments).length === 0 && allocation.conflicts.length === 0) return;
    const newHistory = { ...(ra.allocationHistory || {}), [historyKey]: allocation };
    saveData({ ...data, roomAllocation: { ...ra, allocationHistory: newHistory } }, false);
  }, [historyKey, allocation]);

  const siteColour = selectedSite?.colour || '#6366f1';
  const roomTypes = getRoomTypes(ra);
  const grid = selectedSite ? GRID_SIZES[selectedSite.gridSize] || GRID_SIZES.small : GRID_SIZES.small;

  // Auto-crop: find bounding box of rooms + 1 cell buffer
  const cropBounds = useMemo(() => {
    if (!selectedSite || !selectedSite.rooms?.length) return { x: 0, y: 0, w: grid.cols, h: grid.rows };
    const rooms = selectedSite.rooms;
    const minX = Math.max(0, Math.min(...rooms.map(r => r.x)) - 1);
    const minY = Math.max(0, Math.min(...rooms.map(r => r.y)) - 1);
    const maxX = Math.min(grid.cols - 1, Math.max(...rooms.map(r => r.x + (r.w || 1) - 1)) + 1);
    const maxY = Math.min(grid.rows - 1, Math.max(...rooms.map(r => r.y + (r.h || 1) - 1)) + 1);
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }, [selectedSite, grid]);

  const cellSize = Math.max(40, Math.floor((gridWidth - 4) / cropBounds.w));

  // Assigned clinician IDs for green/red indicator
  const assignedIds = useMemo(() => {
    const s = new Set();
    Object.values(allocation.assignments).forEach(a => { if (a?.id) s.add(a.id); });
    return s;
  }, [allocation]);

  // Edit mode handlers
  const handleDrop = (roomId) => {
    if (!dragPerson || !selectedSite) return;
    const currentAssignments = { ...(savedAllocation?.assignments || allocation.assignments) };
    // Remove from old room
    Object.keys(currentAssignments).forEach(rId => { if (currentAssignments[rId]?.id === dragPerson.id) delete currentAssignments[rId]; });
    // Add to new room
    currentAssignments[roomId] = { ...dragPerson, isOverride: true };
    const newHistory = { ...(ra.allocationHistory || {}), [historyKey]: { ...allocation, assignments: currentAssignments } };
    const overrideKey = `${dateStr}-${session}`;
    const newOverrides = { ...ra.dailyOverrides, [selectedSite.id]: { ...(ra.dailyOverrides?.[selectedSite.id] || {}), [overrideKey]: currentAssignments } };
    saveData({ ...data, roomAllocation: { ...ra, allocationHistory: newHistory, dailyOverrides: newOverrides } });
    setDragPerson(null);
    toast('Room reassigned', 'success');
  };

  const handleUnallocate = () => {
    if (!dragPerson || !selectedSite) return;
    const currentAssignments = { ...(savedAllocation?.assignments || allocation.assignments) };
    Object.keys(currentAssignments).forEach(rId => { if (currentAssignments[rId]?.id === dragPerson.id) delete currentAssignments[rId]; });
    const newHistory = { ...(ra.allocationHistory || {}), [historyKey]: { ...allocation, assignments: currentAssignments } };
    const overrideKey = `${dateStr}-${session}`;
    const newOverrides = { ...ra.dailyOverrides, [selectedSite.id]: { ...(ra.dailyOverrides?.[selectedSite.id] || {}), [overrideKey]: currentAssignments } };
    saveData({ ...data, roomAllocation: { ...ra, allocationHistory: newHistory, dailyOverrides: newOverrides } });
    setDragPerson(null);
    toast('Clinician unallocated', 'success');
  };

  const removeOverride = () => {
    if (!selectedSite) return;
    const overrideKey = `${dateStr}-${session}`;
    const newSiteOverrides = { ...(ra.dailyOverrides?.[selectedSite.id] || {}) };
    delete newSiteOverrides[overrideKey];
    const newHistory = { ...(ra.allocationHistory || {}) };
    delete newHistory[historyKey];
    saveData({ ...data, roomAllocation: { ...ra, dailyOverrides: { ...ra.dailyOverrides, [selectedSite.id]: newSiteOverrides }, allocationHistory: newHistory } });
    toast('Reset to auto-allocation', 'success');
  };

  const hasOverrides = selectedSite && ra.dailyOverrides?.[selectedSite.id]?.[`${dateStr}-${session}`];
  const handlePrint = () => window.print();

  if (sites.length === 0) return (
    <div className="card p-12 text-center"><div className="text-2xl mb-2">🏥</div><h3 className="text-sm font-semibold text-slate-600 mb-1">Room allocation not configured</h3><p className="text-xs text-slate-400">Set up sites and rooms in Settings → Room Allocation</p></div>
  );

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden print:shadow-none print:border-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-3 flex items-center justify-between print:bg-white print:border-b print:border-slate-200">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="print:stroke-slate-700"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <span className="text-sm font-semibold text-white print:text-slate-900">Room Allocation</span>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={handlePrint} className="text-xs px-2 py-1 rounded bg-white/20 text-white hover:bg-white/30">Print</button>
            {hasOverrides && <button onClick={removeOverride} className="text-xs text-white/60 hover:text-white">Reset</button>}
            <button onClick={() => setEditMode(!editMode)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${editMode ? 'bg-white text-indigo-600' : 'bg-white/20 text-white hover:bg-white/30'}`}>{editMode ? 'Done' : 'Edit'}</button>
          </div>
        </div>

        {/* Day navigation */}
        <div className="px-5 py-2 border-b border-indigo-400/20 bg-indigo-700/30 flex items-center justify-center gap-3 print:bg-white print:border-slate-200">
          <button onClick={() => navigateDay(-1)} className="text-white/60 hover:text-white text-sm font-bold px-2 print:hidden">◀</button>
          <span className="text-sm font-semibold text-white min-w-[200px] text-center print:text-slate-900">{viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <button onClick={() => navigateDay(1)} className="text-white/60 hover:text-white text-sm font-bold px-2 print:hidden">▶</button>
          {!isToday && <button onClick={() => { const d = new Date(); d.setHours(12,0,0,0); setViewingDate(d); }} className="text-xs px-2 py-0.5 rounded bg-white/20 text-white hover:bg-white/30 ml-2 print:hidden">Today</button>}
        </div>

        {/* Site tabs + session toggle */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex gap-1">
            {sites.map(s => (
              <button key={s.id} onClick={() => setSelectedSiteId(s.id)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedSiteId === s.id ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} style={selectedSiteId === s.id ? {background: s.colour || '#6366f1'} : undefined}>
                {s.name}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setSession('am')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${session === 'am' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>AM</button>
            <button onClick={() => setSession('pm')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${session === 'pm' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>PM</button>
          </div>
        </div>

        {isBH ? (
          <div className="p-12 text-center"><span className="text-sm font-semibold text-amber-500">Bank holiday — practice closed</span></div>
        ) : !selectedSite ? (
          <div className="p-12 text-center text-sm text-slate-400">Select a site</div>
        ) : (
          <div className="p-5">
            {/* Clinician cards — present at this site this session */}
            {cliniciansAtSite.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] text-slate-400 mb-1.5">{session.toUpperCase()} — {cliniciansAtSite.length} clinician{cliniciansAtSite.length !== 1 ? 's' : ''} at {selectedSite.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {cliniciansAtSite.map(c => {
                    const clin = allClinicians.find(cl => cl.id === c.id);
                    if (!clin) return null;
                    const hasRoom = assignedIds.has(c.id);
                    return (
                      <div key={c.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${hasRoom ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}
                        draggable={editMode} onDragStart={editMode ? () => setDragPerson({ id: c.id, name: clin.name, initials: clin.initials, source: 'csv' }) : undefined}
                        style={editMode ? {cursor:'grab'} : undefined}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasRoom ? 'bg-emerald-500' : 'bg-red-400'}`} />
                        {clin.initials}
                        <span className="text-[10px] font-normal opacity-60">{clin.name?.split(' ')[0]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unallocation drop zone — edit mode only */}
            {editMode && dragPerson && (
              <div className="mb-3 p-4 rounded-xl border-2 border-dashed border-red-300 bg-red-50 text-center transition-colors"
                onDragOver={e => e.preventDefault()} onDrop={handleUnallocate}>
                <span className="text-sm text-red-400">Drop here to remove from room</span>
              </div>
            )}

            {/* BUILDING GRID VIEW — auto-cropped */}
            <div ref={gridRef} className="relative rounded-xl mb-4" style={{border:'2px solid #e2e8f0',background:'#f8fafc'}}>
              <div style={{display:'grid',gridTemplateColumns:`repeat(${cropBounds.w}, ${cellSize}px)`,gridTemplateRows:`repeat(${cropBounds.h}, ${cellSize}px)`}}>
                {Array.from({length: cropBounds.h * cropBounds.w}).map((_, i) => {
                  const x = i % cropBounds.w, y = Math.floor(i / cropBounds.w);
                  return <div key={i} style={{width:cellSize,height:cellSize,border:'0.5px solid #f1f5f9'}} />;
                })}
              </div>
              {/* Room overlays — offset by crop bounds */}
              {(selectedSite.rooms || []).map(room => {
                const w = room.w || 1, h = room.h || 1;
                const nc = room.isClinical === false;
                const assigned = allocation.assignments[room.id];
                const isOv = assigned?.isOverride;
                const typeDots = (room.types || []).map(t => roomTypes.find(rt => rt.id === t)).filter(Boolean);
                const rx = room.x - cropBounds.x, ry = room.y - cropBounds.y;
                return <div key={room.id}
                  className="absolute rounded-md flex flex-col items-center justify-center text-center transition-all duration-150"
                  onDragOver={editMode && !nc ? e => e.preventDefault() : undefined}
                  onDrop={editMode && !nc ? () => handleDrop(room.id) : undefined}
                  style={{
                    left: rx * cellSize + 2, top: ry * cellSize + 2,
                    width: w * cellSize - 4, height: h * cellSize - 4,
                    background: nc ? '#e2e8f0' : assigned ? siteColour : siteColour + '30',
                    opacity: nc ? 0.6 : 1,
                    outline: isOv ? '2px solid #f59e0b' : 'none', outlineOffset: -1,
                    cursor: editMode && !nc ? 'pointer' : 'default',
                  }}>
                  <div className="font-bold select-none leading-tight" style={{
                    fontSize: nc ? Math.min(10, cellSize * w / Math.max(room.name.length * 0.8, 1)) : 9,
                    color: nc ? '#475569' : assigned ? 'rgba(255,255,255,0.6)' : siteColour,
                  }}>{room.name}</div>
                  {assigned && !nc && (
                    <div className={`flex flex-col items-center ${editMode ? 'cursor-grab' : ''}`}
                      draggable={editMode} onDragStart={editMode ? () => setDragPerson(assigned) : undefined}>
                      <div className="font-extrabold text-white leading-none" style={{fontSize: Math.min(16, cellSize * w * 0.25)}}>{assigned.initials || '?'}</div>
                      {w * cellSize > 100 && <div className="text-white/80 leading-tight truncate" style={{fontSize:9,maxWidth:w*cellSize-20}}>{assigned.name}</div>}
                      {assigned.isPreferred === false && <div className="w-1.5 h-1.5 rounded-full bg-blue-300 mt-0.5" title="Not in preferred room" />}
                    </div>
                  )}
                  {!assigned && !nc && editMode && (
                    <div className="text-[8px] mt-0.5" style={{color: siteColour + '80'}}>Drop</div>
                  )}
                  {!nc && typeDots.length > 0 && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {typeDots.map(rt => <span key={rt.id} className="w-1.5 h-1.5 rounded-full" style={{background: assigned ? 'rgba(255,255,255,0.5)' : rt.colour}} />)}
                    </div>
                  )}
                </div>;
              })}
            </div>

            {/* Conflicts */}
            {allocation.conflicts.length > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                  <span className="text-sm font-semibold text-red-700">Unassigned ({allocation.conflicts.length})</span>
                </div>
                <div className="space-y-1.5">
                  {allocation.conflicts.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-red-400">{c.initials}</div>
                      <span className="text-sm text-slate-700 flex-1">{c.name}</span>
                      <span className="text-xs text-red-500">{c.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Allocation notes with clash explanations */}
            {allocation.flags.length > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
                <div className="text-xs font-semibold text-blue-700 mb-2">Allocation notes</div>
                <div className="space-y-1">
                  {allocation.flags.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-blue-600">
                      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800}}>?</span>
                      <span><strong>{f.name}:</strong> {f.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Non-clinical rooms */}
            {(selectedSite.rooms || []).some(r => r.isClinical === false) && (
              <div className="mb-3 pt-3 border-t border-slate-100">
                <div className="text-[10px] text-slate-400 mb-1">Non-clinical spaces</div>
                <div className="flex gap-2 flex-wrap">
                  {(selectedSite.rooms || []).filter(r => r.isClinical === false).map(r => (
                    <span key={r.id} className="px-3 py-1 rounded-lg bg-slate-100 text-xs text-slate-500">{r.name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Key */}
            <div className="flex items-center gap-4 pt-3 border-t border-slate-100 text-[10px] text-slate-500 flex-wrap">
              {roomTypes.map(rt => <span key={rt.id} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:rt.colour}} />{rt.label}</span>)}
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Room assigned</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />No room</span>
              {hasOverrides && <span className="flex items-center gap-1"><span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-400 text-white" style={{fontSize:8,fontWeight:800}}>!</span>Override</span>}
            </div>

            {/* No data */}
            {cliniciansAtSite.length === 0 && allocation.conflicts.length === 0 && Object.keys(allocation.assignments).length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <div className="text-xl mb-2">📊</div>
                <div className="text-sm">No {session.toUpperCase()} appointment data for {isToday ? 'today' : 'this date'}</div>
                <div className="text-xs mt-1">{isToday ? 'Upload a CSV on the Today page' : 'CSV data not available'}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
