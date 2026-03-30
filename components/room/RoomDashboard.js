'use client';
import { useState, useMemo } from 'react';
import { autoAllocateRooms, DEFAULT_ROOM_TYPES, getRoomTypes, matchesRecurrence } from '@/lib/roomAllocation';
import { matchesStaffMember, toLocalIso } from '@/lib/data';
import { getCliniciansForDate, LOCATION_COLOURS } from '@/lib/huddle';
import { predictDemand } from '@/lib/demandPredictor';

export default function RoomDashboard({ data, saveData, huddleData, toast }) {
  const ra = data?.roomAllocation || {};
  const sites = ra.sites || [];
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || null);
  const [session, setSession] = useState('am');
  const [editMode, setEditMode] = useState(false);
  const [dragPerson, setDragPerson] = useState(null);
  const [viewingDate, setViewingDate] = useState(new Date());

  const selectedSite = sites.find(s => s.id === selectedSiteId);
  const dateStr = toLocalIso(viewingDate);
  const pred = predictDemand(viewingDate, null);
  const isBH = pred?.isBankHoliday || false;
  const isToday = dateStr === toLocalIso(new Date());

  const navigateDay = (dir) => {
    const d = new Date(viewingDate);
    d.setDate(d.getDate() + dir);
    // Skip weekends
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + dir);
    setViewingDate(d);
  };

  // Get CSV date string
  const csvDateStr = useMemo(() => {
    const d = new Date(dateStr + 'T12:00:00');
    return `${String(d.getDate()).padStart(2,'0')}-${d.toLocaleString('en-GB',{month:'short'})}-${d.getFullYear()}`;
  }, [dateStr]);

  // Get clinicians at each site from CSV for this session
  const cliniciansAtSite = useMemo(() => {
    if (!huddleData || !selectedSite) return [];
    const allClinicians = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians || {});
    const csvClinicians = getCliniciansForDate(huddleData, csvDateStr);
    if (csvClinicians.length === 0) return [];

    // Get location data for this date
    const locData = huddleData.locationData?.[csvDateStr] || {};

    const matched = [];
    csvClinicians.forEach(csvName => {
      const clin = allClinicians.find(c => matchesStaffMember(csvName, c));
      if (!clin) return;
      // Skip administrative staff — they don't need rooms
      if (clin.status === 'administrative' || clin.group === 'admin') return;
      // Determine this clinician's location for this session
      const clinIdx = huddleData.clinicians.indexOf(csvName);
      const clinLocations = locData[clinIdx];
      let location = null;
      if (clinLocations) {
        // Get most common location for this clinician
        const entries = Object.entries(clinLocations).sort((a, b) => b[1] - a[1]);
        location = entries[0]?.[0];
      }
      // Match to selected site — include if location matches site name, or if no location data
      if (!location || location === selectedSite.name) {
        matched.push({ id: clin.id, csvName });
      }
    });
    return matched;
  }, [huddleData, csvDateStr, session, selectedSite, data?.clinicians]);

  // Auto-allocate
  const allocation = useMemo(() => {
    if (!selectedSite || isBH) return { assignments: {}, conflicts: [], flags: [] };
    const allClinicians = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians || {});
    return autoAllocateRooms(
      selectedSite, session, cliniciansAtSite,
      ra.recurringBookings || [], ra.adHocBookings || [],
      dateStr, allClinicians, ra.clinicianPriority || [],
      ra.dailyOverrides || {}
    );
  }, [selectedSite, session, cliniciansAtSite, ra, dateStr, isBH, data?.clinicians]);

  const allClinicians = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians || {});

  // Edit mode: drag clinician to room
  const handleDrop = (roomId) => {
    if (!dragPerson || !selectedSite) return;
    const overrideKey = `${dateStr}-${session}`;
    const currentOverride = { ...(ra.dailyOverrides?.[selectedSite.id]?.[overrideKey] || allocation.assignments) };
    // Remove person from old room
    Object.keys(currentOverride).forEach(rId => {
      if (currentOverride[rId]?.id === dragPerson.id) delete currentOverride[rId];
    });
    // Add to new room
    currentOverride[roomId] = { ...dragPerson, isOverride: true };
    const newOverrides = { ...ra.dailyOverrides, [selectedSite.id]: { ...(ra.dailyOverrides?.[selectedSite.id] || {}), [overrideKey]: currentOverride } };
    saveData({ ...data, roomAllocation: { ...ra, dailyOverrides: newOverrides } });
    setDragPerson(null);
    toast('Room reassigned', 'success');
  };

  const removeOverride = () => {
    if (!selectedSite) return;
    const overrideKey = `${dateStr}-${session}`;
    const newSiteOverrides = { ...(ra.dailyOverrides?.[selectedSite.id] || {}) };
    delete newSiteOverrides[overrideKey];
    const newOverrides = { ...ra.dailyOverrides, [selectedSite.id]: newSiteOverrides };
    saveData({ ...data, roomAllocation: { ...ra, dailyOverrides: newOverrides } });
    toast('Reset to auto-allocation', 'success');
  };

  const hasOverrides = selectedSite && ra.dailyOverrides?.[selectedSite.id]?.[`${dateStr}-${session}`];

  if (sites.length === 0) return (
    <div className="card p-12 text-center">
      <div className="text-2xl mb-2">🏥</div>
      <h3 className="text-sm font-semibold text-slate-600 mb-1">Room allocation not configured</h3>
      <p className="text-xs text-slate-400">Set up sites and rooms in Settings → Room Allocation</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <span className="text-sm font-semibold text-white">Room Allocation</span>
          </div>
          <div className="flex items-center gap-2">
            {hasOverrides && <button onClick={removeOverride} className="text-xs text-white/60 hover:text-white">Reset overrides</button>}
            <button onClick={() => setEditMode(!editMode)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${editMode ? 'bg-white text-indigo-600' : 'bg-white/20 text-white hover:bg-white/30'}`}>{editMode ? 'Done' : 'Edit'}</button>
          </div>
        </div>

        {/* Day navigation */}
        <div className="px-5 py-2 border-b border-indigo-400/20 bg-indigo-700/30 flex items-center justify-center gap-3">
          <button onClick={() => navigateDay(-1)} className="text-white/60 hover:text-white text-sm font-bold px-2">◀</button>
          <span className="text-sm font-semibold text-white min-w-[200px] text-center">{viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <button onClick={() => navigateDay(1)} className="text-white/60 hover:text-white text-sm font-bold px-2">▶</button>
          {!isToday && <button onClick={() => setViewingDate(new Date())} className="text-xs px-2 py-0.5 rounded bg-white/20 text-white hover:bg-white/30 ml-2">Today</button>}
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
            {/* Room grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(selectedSite.rooms || []).filter(r => r.isClinical !== false).map(room => {
                const assigned = allocation.assignments[room.id];
                const isOv = assigned?.isOverride;
                const roomTypes = getRoomTypes(ra);
                const roomTypeDots = (room.types || []).map(t => roomTypes.find(rt => rt.id === t)).filter(Boolean);
                return (
                  <div key={room.id}
                    className={`rounded-xl border-2 transition-all duration-150 ${editMode ? 'cursor-pointer' : ''} ${assigned ? 'border-slate-200' : 'border-dashed border-slate-300'}`}
                    style={isOv ? {outline:'2px solid #f59e0b',outlineOffset:'-1px'} : undefined}
                    onDragOver={editMode ? e => e.preventDefault() : undefined}
                    onDrop={editMode ? () => handleDrop(room.id) : undefined}>
                    <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2" style={{background: (selectedSite.colour || '#6366f1') + '10'}}>
                      <div className="text-xs font-semibold text-slate-700 flex-1">{room.name}</div>
                      <div className="flex gap-1">{roomTypeDots.map(rt => <span key={rt.id} className="w-2 h-2 rounded-full flex-shrink-0" style={{background:rt.colour}} title={rt.label} />)}</div>
                    </div>
                    <div className="p-3 min-h-[60px] flex items-center justify-center">
                      {assigned ? (
                        <div className={`flex items-center gap-2 ${editMode ? 'cursor-grab' : ''}`}
                          draggable={editMode}
                          onDragStart={editMode ? () => setDragPerson(assigned) : undefined}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{background: selectedSite.colour || '#6366f1'}}>
                            {assigned.initials || '?'}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-900">{assigned.name}</div>
                            <div className="text-[10px] text-slate-400">{assigned.source === 'csv' ? 'EMIS' : assigned.source === 'recurring' ? 'Recurring' : 'Ad hoc'}
                              {assigned.isPreferred === false && <span className="text-blue-500 ml-1">• Not preferred</span>}
                              {isOv && <span className="text-amber-500 ml-1">• Override</span>}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">{editMode ? 'Drop here' : 'Unoccupied'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Non-clinical rooms (visual reference) */}
            {(selectedSite.rooms || []).some(r => r.isClinical === false) && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-[10px] text-slate-400 mb-2">Non-clinical spaces</div>
                <div className="flex gap-2 flex-wrap">
                  {(selectedSite.rooms || []).filter(r => r.isClinical === false).map(r => (
                    <span key={r.id} className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-500">{r.name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Conflicts */}
            {allocation.conflicts.length > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200">
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

            {/* Flags */}
            {allocation.flags.length > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
                <div className="text-xs font-semibold text-blue-700 mb-2">Allocation notes</div>
                <div className="space-y-1">
                  {allocation.flags.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-blue-600">
                      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800}}>?</span>
                      <span>{f.name}: {f.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key */}
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-500 flex-wrap">
              {getRoomTypes(ra).map(rt => <span key={rt.id} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:rt.colour}} />{rt.label}</span>)}
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:selectedSite?.colour || '#6366f1'}} />Assigned</span>
              <span className="flex items-center gap-1"><span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 text-white" style={{fontSize:8,fontWeight:800}}>?</span>Not preferred</span>
              <span className="flex items-center gap-1"><span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-400 text-white" style={{fontSize:8,fontWeight:800}}>!</span>Override</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400" />Unassigned</span>
            </div>

            {/* No data state */}
            {cliniciansAtSite.length === 0 && allocation.conflicts.length === 0 && Object.keys(allocation.assignments).length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <div className="text-xl mb-2">📊</div>
                <div className="text-sm">No appointment data for today</div>
                <div className="text-xs mt-1">Upload a CSV on the Today page to see room allocations</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
