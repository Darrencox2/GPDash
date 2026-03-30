'use client';
import { useState, useMemo, useRef, useCallback } from 'react';
import { GRID_SIZES, ROOM_TYPES, SITE_COLOUR_PRESETS, RECURRENCE_LABELS, DAY_LABELS, describeRecurrence } from '@/lib/roomAllocation';
import { matchesStaffMember } from '@/lib/data';

export default function RoomSettings({ data, saveData, toast, huddleData }) {
  const ra = data?.roomAllocation || {};
  const sites = ra.sites || [];
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [showAddSite, setShowAddSite] = useState(false);
  const [tab, setTab] = useState('grid'); // grid | bookings | priority
  const gridRef = useRef(null);

  const selectedSite = sites.find(s => s.id === selectedSiteId);
  const csvLocations = useMemo(() => {
    if (!huddleData) return [];
    const locs = new Set();
    Object.values(huddleData.slotLocationData || {}).forEach(dateData => {
      ['am','pm'].forEach(s => { Object.values(dateData[s] || {}).forEach(clinData => { Object.values(clinData || {}).forEach(loc => { if (loc) locs.add(loc); }); }); });
    });
    return Array.from(locs).filter(Boolean).sort();
  }, [huddleData]);

  const save = (newRA) => saveData({ ...data, roomAllocation: newRA });

  // Site management
  const addSite = (name, colour, gridSize) => {
    const id = 'site_' + Date.now();
    const newSites = [...sites, { id, name, colour, gridSize: gridSize || 'small', rooms: [] }];
    save({ ...ra, sites: newSites });
    setSelectedSiteId(id);
    setShowAddSite(false);
    toast('Site added', 'success');
  };

  const updateSite = (siteId, updates) => {
    const newSites = sites.map(s => s.id === siteId ? { ...s, ...updates } : s);
    save({ ...ra, sites: newSites });
  };

  const deleteSite = (siteId) => {
    if (!confirm('Delete this site and all its rooms?')) return;
    save({ ...ra, sites: sites.filter(s => s.id !== siteId) });
    setSelectedSiteId(sites.find(s => s.id !== siteId)?.id || null);
    toast('Site deleted', 'success');
  };

  const convertGridSize = (siteId, newSize) => {
    const site = sites.find(s => s.id === siteId);
    if (!site) return;
    const oldGrid = GRID_SIZES[site.gridSize];
    const newGrid = GRID_SIZES[newSize];
    // Find bounding box of existing rooms
    const rooms = site.rooms || [];
    if (rooms.length === 0) { updateSite(siteId, { gridSize: newSize }); return; }
    const minX = Math.min(...rooms.map(r => r.x));
    const maxX = Math.max(...rooms.map(r => r.x));
    const minY = Math.min(...rooms.map(r => r.y));
    const maxY = Math.max(...rooms.map(r => r.y));
    const clusterW = maxX - minX + 1;
    const clusterH = maxY - minY + 1;
    const offsetX = Math.floor((newGrid.cols - clusterW) / 2) - minX;
    const offsetY = Math.floor((newGrid.rows - clusterH) / 2) - minY;
    const movedRooms = rooms.map(r => ({ ...r, x: Math.max(0, Math.min(r.x + offsetX, newGrid.cols - 1)), y: Math.max(0, Math.min(r.y + offsetY, newGrid.rows - 1)) }));
    updateSite(siteId, { gridSize: newSize, rooms: movedRooms });
    toast(`Converted to ${GRID_SIZES[newSize].label}`, 'success');
  };

  // Room management
  const addRoom = (x, y) => {
    if (!selectedSite) return;
    const id = 'room_' + Date.now();
    const newRoom = { id, name: `Room ${(selectedSite.rooms?.length || 0) + 1}`, x, y, types: [], isClinical: true };
    setEditingRoom(newRoom);
  };

  const saveRoom = (room) => {
    if (!selectedSite) return;
    const existing = selectedSite.rooms.find(r => r.id === room.id);
    const newRooms = existing ? selectedSite.rooms.map(r => r.id === room.id ? room : r) : [...selectedSite.rooms, room];
    updateSite(selectedSite.id, { rooms: newRooms });
    setEditingRoom(null);
  };

  const deleteRoom = (roomId) => {
    if (!selectedSite) return;
    updateSite(selectedSite.id, { rooms: selectedSite.rooms.filter(r => r.id !== roomId) });
    setEditingRoom(null);
    toast('Room deleted', 'success');
  };

  const moveRoom = (roomId, newX, newY) => {
    if (!selectedSite) return;
    const occupied = selectedSite.rooms.find(r => r.id !== roomId && r.x === newX && r.y === newY);
    if (occupied) return;
    updateSite(selectedSite.id, { rooms: selectedSite.rooms.map(r => r.id === roomId ? { ...r, x: newX, y: newY } : r) });
  };

  // Grid interaction
  const grid = selectedSite ? GRID_SIZES[selectedSite.gridSize] || GRID_SIZES.small : GRID_SIZES.small;
  const cellSize = Math.min(56, Math.floor(600 / grid.cols));

  const handleGridMouseDown = (x, y, e) => {
    if (!selectedSite) return;
    const existing = selectedSite.rooms.find(r => r.x === x && r.y === y);
    if (existing) {
      // Start drag to move
      e.preventDefault();
      setDragStart({ roomId: existing.id, x, y, mode: 'move' });
    } else {
      // Click empty cell to create room
      addRoom(x, y);
    }
  };

  const handleGridMouseMove = (x, y) => {
    if (dragStart?.mode === 'move') setDragCurrent({ x, y });
  };

  const handleGridMouseUp = (x, y) => {
    if (dragStart?.mode === 'move' && (x !== dragStart.x || y !== dragStart.y)) {
      moveRoom(dragStart.roomId, x, y);
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  // Bookings
  const recurringBookings = ra.recurringBookings || [];
  const adHocBookings = ra.adHocBookings || [];
  const [editBooking, setEditBooking] = useState(null);

  const saveRecurring = (booking) => {
    const existing = recurringBookings.find(b => b.id === booking.id);
    const newList = existing ? recurringBookings.map(b => b.id === booking.id ? booking : b) : [...recurringBookings, { ...booking, id: 'rec_' + Date.now() }];
    save({ ...ra, recurringBookings: newList });
    setEditBooking(null);
    toast('Recurring booking saved', 'success');
  };

  const deleteRecurring = (id) => {
    save({ ...ra, recurringBookings: recurringBookings.filter(b => b.id !== id) });
    toast('Booking deleted', 'success');
  };

  const saveAdHoc = (booking) => {
    const existing = adHocBookings.find(b => b.id === booking.id);
    const newList = existing ? adHocBookings.map(b => b.id === booking.id ? booking : b) : [...adHocBookings, { ...booking, id: 'adhoc_' + Date.now() }];
    save({ ...ra, adHocBookings: newList });
    setEditBooking(null);
    toast('Ad hoc booking saved', 'success');
  };

  const deleteAdHoc = (id) => {
    save({ ...ra, adHocBookings: adHocBookings.filter(b => b.id !== id) });
    toast('Booking deleted', 'success');
  };

  // Priority
  const cliniciansList = useMemo(() => {
    if (!data?.clinicians) return [];
    return (Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians)).filter(c => c.buddyCover && c.status !== 'left');
  }, [data?.clinicians]);
  const priorityOrder = ra.clinicianPriority || cliniciansList.map(c => c.id);

  const movePriority = (id, dir) => {
    const list = [...priorityOrder];
    const idx = list.indexOf(id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= list.length) return;
    [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
    save({ ...ra, clinicianPriority: list });
  };

  return (
    <div className="space-y-6">
      {/* Site tabs */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          <span className="text-sm font-semibold text-white">Room Allocation Settings</span>
        </div>
        <div className="border-b border-slate-200">
          <div className="flex items-center gap-1 px-4 pt-3">
            {sites.map(s => (
              <button key={s.id} onClick={() => setSelectedSiteId(s.id)} className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${selectedSiteId === s.id ? 'bg-white border border-b-0 border-slate-200 text-slate-900' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{background: s.colour || '#94a3b8'}} />
                {s.name}
              </button>
            ))}
            <button onClick={() => setShowAddSite(true)} className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600">+ Add site</button>
          </div>
        </div>

        {/* Add site form */}
        {showAddSite && <AddSiteForm csvLocations={csvLocations} existingSites={sites} onSave={addSite} onCancel={() => setShowAddSite(false)} />}

        {selectedSite && (
          <div className="p-5">
            {/* Sub-tabs */}
            <div className="flex items-center gap-1 mb-5">
              {[{id:'grid',label:'Room Layout'},{id:'bookings',label:'Bookings'},{id:'priority',label:'Priority'}].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.label}</button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <label className="text-xs text-slate-500">Grid size:</label>
                <select value={selectedSite.gridSize} onChange={e => convertGridSize(selectedSite.id, e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1">
                  {Object.entries(GRID_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button onClick={() => deleteSite(selectedSite.id)} className="text-xs text-red-400 hover:text-red-600 ml-2">Delete site</button>
              </div>
            </div>

            {tab === 'grid' && (
              <>
                {/* Site colour */}
                <div className="flex items-center gap-3 mb-4">
                  <label className="text-xs text-slate-500">Site colour:</label>
                  <div className="flex gap-1.5">
                    {SITE_COLOUR_PRESETS.map(c => <button key={c} onClick={() => updateSite(selectedSite.id, { colour: c })} className="w-5 h-5 rounded-full transition-transform hover:scale-125" style={{background: c, outline: selectedSite.colour === c ? '2px solid #1e293b' : '1px solid #e2e8f0', outlineOffset: 1}} />)}
                    <input type="color" value={selectedSite.colour || '#8c64c3'} onChange={e => updateSite(selectedSite.id, { colour: e.target.value })} className="w-5 h-5 rounded-full border-0 cursor-pointer" style={{padding:0}} />
                  </div>
                </div>
                {/* Grid */}
                <div className="text-xs text-slate-400 mb-2">Click an empty square to add a room. Click a room to edit. Drag rooms to reposition.</div>
                <div ref={gridRef} className="inline-block rounded-xl overflow-hidden" style={{border:'2px solid #e2e8f0',background:'#f8fafc'}} onMouseLeave={() => { setDragStart(null); setDragCurrent(null); }}>
                  {Array.from({length: grid.rows}).map((_, y) => (
                    <div key={y} className="flex">
                      {Array.from({length: grid.cols}).map((_, x) => {
                        const room = selectedSite.rooms.find(r => r.x === x && r.y === y);
                        const isDragTarget = dragCurrent?.x === x && dragCurrent?.y === y;
                        const isDragging = dragStart?.mode === 'move' && dragStart.x === x && dragStart.y === y;
                        return (
                          <div key={x}
                            onMouseDown={e => handleGridMouseDown(x, y, e)}
                            onMouseMove={() => handleGridMouseMove(x, y)}
                            onMouseUp={() => handleGridMouseUp(x, y)}
                            className="relative cursor-pointer transition-all duration-100"
                            style={{width: cellSize, height: cellSize, border: '0.5px solid #e2e8f0',
                              background: room ? (room.isClinical === false ? '#f1f5f9' : (selectedSite.colour || '#8c64c3') + '20') : isDragTarget ? '#dbeafe' : 'transparent',
                              opacity: isDragging ? 0.3 : 1}}>
                            {room && (
                              <div className="absolute inset-1 rounded flex items-center justify-center text-center" style={{
                                background: room.isClinical === false ? '#e2e8f0' : selectedSite.colour || '#8c64c3',
                                opacity: room.isClinical === false ? 0.6 : 0.85}}>
                                <span className="text-white text-[8px] font-bold leading-tight px-0.5 select-none" style={{textShadow:'0 1px 2px rgba(0,0,0,0.3)'}}>{room.name}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {/* Room type legend */}
                <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
                  {ROOM_TYPES.map(rt => <span key={rt.id} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:rt.colour}}/>{rt.label}</span>)}
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-300"/>Non-clinical</span>
                </div>
              </>
            )}

            {tab === 'bookings' && (
              <BookingsTab sites={sites} selectedSite={selectedSite} recurringBookings={recurringBookings} adHocBookings={adHocBookings} saveRecurring={saveRecurring} deleteRecurring={deleteRecurring} saveAdHoc={saveAdHoc} deleteAdHoc={deleteAdHoc} editBooking={editBooking} setEditBooking={setEditBooking} />
            )}

            {tab === 'priority' && (
              <PriorityTab cliniciansList={cliniciansList} priorityOrder={priorityOrder} movePriority={movePriority} />
            )}
          </div>
        )}

        {!selectedSite && !showAddSite && (
          <div className="p-12 text-center">
            <div className="text-2xl mb-2">🏥</div>
            <h3 className="text-sm font-semibold text-slate-600 mb-1">No sites configured</h3>
            <p className="text-xs text-slate-400 mb-4">Add a site to start setting up rooms.</p>
            <button onClick={() => setShowAddSite(true)} className="btn-primary">Add site</button>
          </div>
        )}
      </div>

      {/* Room edit popup */}
      {editingRoom && <RoomEditPopup room={editingRoom} site={selectedSite} onSave={saveRoom} onDelete={deleteRoom} onCancel={() => setEditingRoom(null)} />}
    </div>
  );
}

function AddSiteForm({ csvLocations, existingSites, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [colour, setColour] = useState(SITE_COLOUR_PRESETS[0]);
  const [gridSize, setGridSize] = useState('small');
  const suggestions = csvLocations.filter(l => !existingSites.some(s => s.name === l));
  return (
    <div className="p-5 border-b border-slate-200 bg-slate-50">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">Add site</h3>
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Site name</label>
          <div className="flex items-center gap-2">
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Winscombe" className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-48" />
            {suggestions.length > 0 && (
              <div className="flex gap-1">{suggestions.map(s => <button key={s} onClick={() => setName(s)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300">{s}</button>)}</div>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Colour</label>
          <div className="flex gap-1.5 items-center">
            {SITE_COLOUR_PRESETS.slice(0, 6).map(c => <button key={c} onClick={() => setColour(c)} className="w-5 h-5 rounded-full hover:scale-125 transition-transform" style={{background:c, outline: colour === c ? '2px solid #1e293b' : '1px solid #e2e8f0', outlineOffset: 1}} />)}
            <input type="color" value={colour} onChange={e => setColour(e.target.value)} className="w-5 h-5 rounded-full border-0 cursor-pointer" style={{padding:0}} />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Grid size</label>
          <select value={gridSize} onChange={e => setGridSize(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5">
            {Object.entries(GRID_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => name.trim() && onSave(name.trim(), colour, gridSize)} disabled={!name.trim()} className="btn-primary text-sm">Add</button>
          <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
        </div>
      </div>
      {/* Grid preview */}
      <div className="mt-3">
        <div className="text-[10px] text-slate-400 mb-1">Preview ({GRID_SIZES[gridSize].cols} × {GRID_SIZES[gridSize].rows})</div>
        <div className="inline-block rounded overflow-hidden" style={{border:'1px solid #e2e8f0'}}>
          {Array.from({length: GRID_SIZES[gridSize].rows}).map((_, y) => (
            <div key={y} className="flex">{Array.from({length: GRID_SIZES[gridSize].cols}).map((_, x) => <div key={x} style={{width:12,height:12,border:'0.5px solid #e2e8f0',background: colour + '10'}} />)}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoomEditPopup({ room, site, onSave, onDelete, onCancel }) {
  const [name, setName] = useState(room.name || '');
  const [types, setTypes] = useState(room.types || []);
  const [isClinical, setIsClinical] = useState(room.isClinical !== false);
  const toggleType = (t) => setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl p-5 w-96" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">{room.id?.startsWith('room_') && !site?.rooms?.find(r => r.id === room.id) ? 'Add room' : 'Edit room'}</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Room name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" autoFocus />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500">Non-clinical space</label>
            <button onClick={() => setIsClinical(!isClinical)} className={`w-8 h-5 rounded-full transition-colors ${isClinical ? 'bg-slate-300' : 'bg-amber-400'}`}>
              <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${isClinical ? 'translate-x-1' : 'translate-x-[17px]'}`} />
            </button>
            <span className="text-xs text-slate-400">{isClinical ? 'Clinical room' : 'Non-clinical (e.g. waiting room, corridor)'}</span>
          </div>
          {isClinical && (
            <div>
              <label className="text-xs text-slate-500 block mb-2">Suitable for</label>
              <div className="flex flex-wrap gap-2">
                {ROOM_TYPES.map(rt => (
                  <button key={rt.id} onClick={() => toggleType(rt.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${types.includes(rt.id) ? 'text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`} style={types.includes(rt.id) ? {background: rt.colour} : undefined}>
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
          {site?.rooms?.find(r => r.id === room.id) ? <button onClick={() => onDelete(room.id)} className="text-xs text-red-400 hover:text-red-600">Delete room</button> : <div />}
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
            <button onClick={() => name.trim() && onSave({ ...room, name: name.trim(), types: isClinical ? types : [], isClinical })} disabled={!name.trim()} className="btn-primary text-sm">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingsTab({ sites, selectedSite, recurringBookings, adHocBookings, saveRecurring, deleteRecurring, saveAdHoc, deleteAdHoc, editBooking, setEditBooking }) {
  const siteBookings = recurringBookings.filter(b => b.siteId === selectedSite.id);
  const siteAdHoc = adHocBookings.filter(b => b.siteId === selectedSite.id);
  const clinicalRooms = (selectedSite.rooms || []).filter(r => r.isClinical !== false);
  return (
    <div className="space-y-6">
      {/* Recurring */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Recurring bookings</h3>
          <button onClick={() => setEditBooking({ type: 'recurring', siteId: selectedSite.id, name: '', session: 'am', roomTypes: [], preferredRoom: null, recurrence: { frequency: 'weekly', day: 1 } })} className="text-xs text-indigo-600 hover:text-indigo-800">+ Add recurring</button>
        </div>
        {siteBookings.length === 0 && <p className="text-xs text-slate-400">No recurring bookings at this site.</p>}
        <div className="space-y-2">
          {siteBookings.map(b => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
              <span className="text-sm font-medium text-slate-700 flex-1">{b.name}</span>
              <span className="text-xs text-slate-500">{describeRecurrence(b.recurrence)}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">{b.session.toUpperCase()}</span>
              <span className="text-xs text-slate-400">{clinicalRooms.find(r => r.id === b.preferredRoom)?.name || 'Any suitable'}</span>
              <button onClick={() => setEditBooking({ ...b, type: 'recurring' })} className="text-xs text-indigo-500 hover:text-indigo-700">Edit</button>
              <button onClick={() => deleteRecurring(b.id)} className="text-xs text-red-400 hover:text-red-600">×</button>
            </div>
          ))}
        </div>
      </div>
      {/* Ad hoc */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Ad hoc bookings</h3>
          <button onClick={() => setEditBooking({ type: 'adhoc', siteId: selectedSite.id, name: '', session: 'am', roomTypes: [], preferredRoom: null, date: new Date().toISOString().split('T')[0] })} className="text-xs text-indigo-600 hover:text-indigo-800">+ Add ad hoc</button>
        </div>
        {siteAdHoc.length === 0 && <p className="text-xs text-slate-400">No ad hoc bookings at this site.</p>}
        <div className="space-y-2">
          {siteAdHoc.map(b => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
              <span className="text-sm font-medium text-slate-700 flex-1">{b.name}</span>
              <span className="text-xs text-slate-500">{b.date}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">{b.session.toUpperCase()}</span>
              <button onClick={() => setEditBooking({ ...b, type: 'adhoc' })} className="text-xs text-indigo-500 hover:text-indigo-700">Edit</button>
              <button onClick={() => deleteAdHoc(b.id)} className="text-xs text-red-400 hover:text-red-600">×</button>
            </div>
          ))}
        </div>
      </div>
      {/* Edit modal */}
      {editBooking && <BookingEditModal booking={editBooking} site={selectedSite} rooms={clinicalRooms} onSave={editBooking.type === 'recurring' ? saveRecurring : saveAdHoc} onCancel={() => setEditBooking(null)} />}
    </div>
  );
}

function BookingEditModal({ booking, site, rooms, onSave, onCancel }) {
  const [b, setB] = useState(booking);
  const update = (k, v) => setB(prev => ({ ...prev, [k]: v }));
  const updateRec = (k, v) => setB(prev => ({ ...prev, recurrence: { ...prev.recurrence, [k]: v } }));
  const toggleType = (t) => setB(prev => ({ ...prev, roomTypes: (prev.roomTypes || []).includes(t) ? prev.roomTypes.filter(x => x !== t) : [...(prev.roomTypes || []), t] }));
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl p-5 w-[420px]" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">{b.type === 'recurring' ? 'Recurring booking' : 'Ad hoc booking'}</h3>
        <div className="space-y-4">
          <div><label className="text-xs text-slate-500 block mb-1">Name</label><input type="text" value={b.name} onChange={e => update('name', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" placeholder="e.g. Podiatry" autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-500 block mb-1">Session</label><select value={b.session} onChange={e => update('session', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"><option value="am">AM</option><option value="pm">PM</option></select></div>
            {b.type === 'adhoc' && <div><label className="text-xs text-slate-500 block mb-1">Date</label><input type="date" value={b.date || ''} onChange={e => update('date', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" /></div>}
          </div>
          {b.type === 'recurring' && (
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500 block mb-1">Frequency</label>
                <select value={b.recurrence?.frequency || 'weekly'} onChange={e => updateRec('frequency', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">
                  {Object.entries(RECURRENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {['weekly','biweekly','monthly_day'].includes(b.recurrence?.frequency) && (
                <div><label className="text-xs text-slate-500 block mb-1">Day</label>
                  <select value={b.recurrence?.day ?? 1} onChange={e => updateRec('day', parseInt(e.target.value))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">
                    {[1,2,3,4,5].map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                  </select>
                </div>
              )}
              {b.recurrence?.frequency === 'monthly_day' && (
                <div><label className="text-xs text-slate-500 block mb-1">Which week</label>
                  <select value={b.recurrence?.nth ?? 1} onChange={e => updateRec('nth', parseInt(e.target.value))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">
                    {[1,2,3,4].map(n => <option key={n} value={n}>{['','1st','2nd','3rd','4th'][n]}</option>)}
                  </select>
                </div>
              )}
              {b.recurrence?.frequency === 'monthly_date' && (
                <div><label className="text-xs text-slate-500 block mb-1">Date of month</label>
                  <input type="number" min={1} max={31} value={b.recurrence?.dateOfMonth ?? 1} onChange={e => updateRec('dateOfMonth', parseInt(e.target.value))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500 block mb-1">Start date (optional)</label><input type="date" value={b.recurrence?.startDate || ''} onChange={e => updateRec('startDate', e.target.value || undefined)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" /></div>
                <div><label className="text-xs text-slate-500 block mb-1">End date (optional)</label><input type="date" value={b.recurrence?.endDate || ''} onChange={e => updateRec('endDate', e.target.value || undefined)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" /></div>
              </div>
            </div>
          )}
          <div><label className="text-xs text-slate-500 block mb-1">Preferred room (optional)</label>
            <select value={b.preferredRoom || ''} onChange={e => update('preferredRoom', e.target.value || null)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">
              <option value="">Any suitable room</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-slate-500 block mb-2">Room type (if no preferred room)</label>
            <div className="flex flex-wrap gap-2">
              {ROOM_TYPES.map(rt => <button key={rt.id} onClick={() => toggleType(rt.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${(b.roomTypes || []).includes(rt.id) ? 'text-white' : 'bg-slate-100 text-slate-500'}`} style={(b.roomTypes || []).includes(rt.id) ? {background:rt.colour} : undefined}>{rt.label}</button>)}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button onClick={() => b.name.trim() && onSave(b)} disabled={!b.name.trim()} className="btn-primary text-sm">Save</button>
        </div>
      </div>
    </div>
  );
}

function PriorityTab({ cliniciansList, priorityOrder, movePriority }) {
  const sorted = [...cliniciansList].sort((a, b) => {
    const ai = priorityOrder.indexOf(a.id); const bi = priorityOrder.indexOf(b.id);
    return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
  });
  return (
    <div>
      <p className="text-xs text-slate-500 mb-3">When room preferences clash, clinicians higher in this list get priority. Drag or use arrows to reorder.</p>
      <div className="space-y-1 max-w-md">
        {sorted.map((c, i) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
            <span className="text-xs font-bold text-slate-300 w-5">{i + 1}</span>
            <span className="text-sm font-medium text-slate-700 flex-1">{c.name}</span>
            <span className="text-xs text-slate-400">{c.role}</span>
            <button onClick={() => movePriority(c.id, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-600 disabled:opacity-20 text-sm">▲</button>
            <button onClick={() => movePriority(c.id, 1)} disabled={i === sorted.length - 1} className="text-slate-400 hover:text-slate-600 disabled:opacity-20 text-sm">▼</button>
          </div>
        ))}
      </div>
    </div>
  );
}
