'use client';
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { GRID_SIZES, getRoomTypes, SITE_COLOUR_PRESETS } from '@/lib/roomAllocation';

export default function RoomSettings({ data, saveData, toast, huddleData }) {
  const ra = data?.roomAllocation || {};
  const sites = ra.sites || [];
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [showAddSite, setShowAddSite] = useState(false);
  const [dragPriorityId, setDragPriorityId] = useState(null);
  const gridContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(700);
  const selectedSite = sites.find(s => s.id === selectedSiteId);
  const csvLocations = useMemo(() => {
    if (!huddleData) return [];
    const locs = new Set();
    Object.values(huddleData.locationData || {}).forEach(dateData => {
      Object.values(dateData || {}).forEach(clinLocs => {
        Object.keys(clinLocs || {}).forEach(loc => { if (loc) locs.add(loc); });
      });
    });
    return Array.from(locs).filter(Boolean).sort();
  }, [huddleData]);
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => { if (entries[0]) setContainerWidth(entries[0].contentRect.width); });
    ro.observe(el);
    setContainerWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, [selectedSiteId]);
  const save = (newRA) => saveData({ ...data, roomAllocation: newRA });
  const addSite = (name, colour, gridSize) => {
    const id = 'site_' + Date.now();
    save({ ...ra, sites: [...sites, { id, name, colour, gridSize: gridSize || 'small', rooms: [] }] });
    setSelectedSiteId(id); setShowAddSite(false); toast('Site added', 'success');
  };
  const updateSite = (siteId, updates) => save({ ...ra, sites: sites.map(s => s.id === siteId ? { ...s, ...updates } : s) });
  const deleteSite = (siteId) => {
    if (!confirm('Delete this site and all its rooms?')) return;
    save({ ...ra, sites: sites.filter(s => s.id !== siteId) });
    setSelectedSiteId(sites.find(s => s.id !== siteId)?.id || null); toast('Site deleted', 'success');
  };
  const convertGridSize = (siteId, newSize) => {
    const site = sites.find(s => s.id === siteId); if (!site) return;
    const newGrid = GRID_SIZES[newSize]; const rooms = site.rooms || [];
    if (rooms.length === 0) { updateSite(siteId, { gridSize: newSize }); return; }
    const minX = Math.min(...rooms.map(r => r.x)), maxX = Math.max(...rooms.map(r => r.x + (r.w || 1) - 1));
    const minY = Math.min(...rooms.map(r => r.y)), maxY = Math.max(...rooms.map(r => r.y + (r.h || 1) - 1));
    if (maxX - minX + 1 > newGrid.cols || maxY - minY + 1 > newGrid.rows) { toast('Rooms too large for this grid size', 'error'); return; }
    const offsetX = Math.floor((newGrid.cols - (maxX - minX + 1)) / 2) - minX;
    const offsetY = Math.floor((newGrid.rows - (maxY - minY + 1)) / 2) - minY;
    updateSite(siteId, { gridSize: newSize, rooms: rooms.map(r => ({ ...r, x: r.x + offsetX, y: r.y + offsetY })) });
    toast('Grid resized', 'success');
  };
  const saveRoom = (room) => { if (!selectedSite) return; const existing = selectedSite.rooms.find(r => r.id === room.id); updateSite(selectedSite.id, { rooms: existing ? selectedSite.rooms.map(r => r.id === room.id ? room : r) : [...selectedSite.rooms, room] }); setEditingRoom(null); };
  const deleteRoom = (roomId) => { if (!selectedSite) return; updateSite(selectedSite.id, { rooms: selectedSite.rooms.filter(r => r.id !== roomId) }); setEditingRoom(null); toast('Room deleted', 'success'); };
  const grid = selectedSite ? GRID_SIZES[selectedSite.gridSize] || GRID_SIZES.small : GRID_SIZES.small;
  const cellSize = Math.max(36, Math.floor((containerWidth - 4) / grid.cols));
  const isCellOccupied = useCallback((x, y, excludeId) => {
    if (!selectedSite) return false;
    return selectedSite.rooms.some(r => r.id !== excludeId && x >= r.x && x < r.x + (r.w || 1) && y >= r.y && y < r.y + (r.h || 1));
  }, [selectedSite]);
  const canPlaceRoom = useCallback((x, y, w, h, excludeId) => {
    for (let cx = x; cx < x + w; cx++) for (let cy = y; cy < y + h; cy++) { if (cx >= grid.cols || cy >= grid.rows || isCellOccupied(cx, cy, excludeId)) return false; }
    return true;
  }, [grid, isCellOccupied]);
  const moveRoom = (roomId, newX, newY) => { const room = selectedSite?.rooms?.find(r => r.id === roomId); if (!room || !canPlaceRoom(newX, newY, room.w || 1, room.h || 1, roomId)) return; updateSite(selectedSite.id, { rooms: selectedSite.rooms.map(r => r.id === roomId ? { ...r, x: newX, y: newY } : r) }); };
  const getRoomAt = (x, y) => selectedSite?.rooms?.find(r => x >= r.x && x < r.x + (r.w || 1) && y >= r.y && y < r.y + (r.h || 1));
  const handleGridMouseDown = (x, y, e) => { if (!selectedSite) return; e.preventDefault(); const existing = getRoomAt(x, y); if (existing) setDragStart({ roomId: existing.id, x, y, mode: 'move' }); else { setDragStart({ x, y, mode: 'create' }); setDragCurrent({ x, y }); } };
  const handleGridMouseMove = (x, y) => { if (dragStart) setDragCurrent({ x, y }); };
  const handleGridMouseUp = (x, y) => {
    if (!dragStart) return;
    if (dragStart.mode === 'create') {
      const x1 = Math.min(dragStart.x, x), y1 = Math.min(dragStart.y, y);
      const w = Math.max(dragStart.x, x) - x1 + 1, h = Math.max(dragStart.y, y) - y1 + 1;
      if (canPlaceRoom(x1, y1, w, h, null)) setEditingRoom({ id: 'room_' + Date.now(), name: 'Room ' + ((selectedSite.rooms?.length || 0) + 1), x: x1, y: y1, w, h, types: [], isClinical: true });
    } else if (dragStart.mode === 'move') {
      const room = selectedSite.rooms.find(r => r.id === dragStart.roomId);
      if (room && x === dragStart.x && y === dragStart.y) setEditingRoom(room);
      else if (room) moveRoom(room.id, x - (dragStart.x - room.x), y - (dragStart.y - room.y));
    }
    setDragStart(null); setDragCurrent(null);
  };
  const allStaff = useMemo(() => (Array.isArray(data?.clinicians) ? data.clinicians : Object.values(data?.clinicians || {})).filter(c => c.status !== 'left'), [data?.clinicians]);
  const priorityOrder = ra.clinicianPriority || allStaff.map(c => c.id);
  const sortedPriority = [...allStaff].sort((a, b) => { const ai = priorityOrder.indexOf(a.id), bi = priorityOrder.indexOf(b.id); return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi); });
  const handlePriorityDrop = (targetId) => {
    if (!dragPriorityId || dragPriorityId === targetId) return;
    const list = sortedPriority.map(c => c.id); const fi = list.indexOf(dragPriorityId), ti = list.indexOf(targetId);
    if (fi < 0 || ti < 0) return; list.splice(fi, 1); list.splice(ti, 0, dragPriorityId);
    save({ ...ra, clinicianPriority: list }); setDragPriorityId(null);
  };

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          <span className="text-sm font-semibold text-white">Site Room Layout</span>
        </div>
        <div className="border-b border-slate-200"><div className="flex items-center gap-1 px-4 pt-3">
          {sites.map(s => <button key={s.id} onClick={() => setSelectedSiteId(s.id)} className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${selectedSiteId === s.id ? 'bg-white border border-b-0 border-slate-200 text-slate-900' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{background: s.colour || '#94a3b8'}} />{s.name}</button>)}
          <button onClick={() => setShowAddSite(true)} className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600">+ Add site</button>
        </div></div>
        {showAddSite && <AddSiteForm csvLocations={csvLocations} existingSites={sites} onSave={addSite} onCancel={() => setShowAddSite(false)} />}
        {selectedSite && <div className="p-5">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <label className="text-xs text-slate-500">Colour:</label>
            <div className="flex gap-1.5">{SITE_COLOUR_PRESETS.map(c => <button key={c} onClick={() => updateSite(selectedSite.id, { colour: c })} className="w-5 h-5 rounded-full hover:scale-125 transition-transform" style={{background: c, outline: selectedSite.colour === c ? '2px solid #1e293b' : '1px solid #e2e8f0', outlineOffset: 1}} />)}<input type="color" value={selectedSite.colour || '#8c64c3'} onChange={e => updateSite(selectedSite.id, { colour: e.target.value })} className="w-5 h-5 rounded-full border-0 cursor-pointer" style={{padding:0}} /></div>
            <span className="text-slate-300">|</span>
            <label className="text-xs text-slate-500">Grid:</label>
            <select value={selectedSite.gridSize} onChange={e => convertGridSize(selectedSite.id, e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1">{Object.entries(GRID_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <span className="text-slate-300">|</span>
            <label className="text-xs text-slate-500">Card width:</label>
            <input type="range" min="100" max="220" step="10" value={selectedSite.minRoomWidth || 140} onChange={e => updateSite(selectedSite.id, { minRoomWidth: parseInt(e.target.value) })} className="w-24" />
            <span className="text-xs text-slate-600 font-medium w-8">{selectedSite.minRoomWidth || 140}</span>
            <button onClick={() => deleteSite(selectedSite.id)} className="text-xs text-red-400 hover:text-red-600 ml-auto">Delete site</button>
          </div>
          <div className="text-xs text-slate-400 mb-2">Click + drag to create a room. Click a room to edit. Drag to reposition.</div>
          <div ref={gridContainerRef} className="relative rounded-xl" style={{border:'2px solid #e2e8f0',background:'#f8fafc'}} onMouseLeave={() => { setDragStart(null); setDragCurrent(null); }}>
            <div style={{display:'grid',gridTemplateColumns:`repeat(${grid.cols}, ${cellSize}px)`,gridTemplateRows:`repeat(${grid.rows}, ${cellSize}px)`}}>
              {Array.from({length: grid.rows * grid.cols}).map((_, i) => {
                const x = i % grid.cols, y = Math.floor(i / grid.cols);
                const isInDrag = dragStart?.mode === 'create' && dragCurrent && x >= Math.min(dragStart.x, dragCurrent.x) && x <= Math.max(dragStart.x, dragCurrent.x) && y >= Math.min(dragStart.y, dragCurrent.y) && y <= Math.max(dragStart.y, dragCurrent.y);
                return <div key={i} onMouseDown={e => handleGridMouseDown(x, y, e)} onMouseMove={() => handleGridMouseMove(x, y)} onMouseUp={() => handleGridMouseUp(x, y)} className="cursor-crosshair" style={{width:cellSize,height:cellSize,border:'0.5px solid #e2e8f0',background: isInDrag ? (selectedSite.colour || '#6366f1') + '25' : 'transparent'}} />;
              })}
            </div>
            {(selectedSite.rooms || []).map(room => {
              const w = room.w || 1, h = room.h || 1, nc = room.isClinical === false;
              const isDragging = dragStart?.mode === 'move' && dragStart.roomId === room.id && dragCurrent && (dragCurrent.x !== dragStart.x || dragCurrent.y !== dragStart.y);
              return <div key={room.id} className="absolute rounded-md flex items-center justify-center text-center transition-opacity" style={{left: room.x * cellSize + 3, top: room.y * cellSize + 3, width: w * cellSize - 6, height: h * cellSize - 6, background: nc ? '#e2e8f0' : selectedSite.colour || '#8c64c3', opacity: isDragging ? 0.3 : (nc ? 0.7 : 0.85), pointerEvents: 'none'}}>
                <span className="font-bold leading-tight px-1 select-none" style={{fontSize: Math.min(12, cellSize * w / Math.max(room.name.length * 0.7, 1)), color: nc ? '#475569' : '#fff', textShadow: nc ? 'none' : '0 1px 2px rgba(0,0,0,0.3)'}}>{room.name}</span>
              </div>;
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">{getRoomTypes(ra).map(rt => <span key={rt.id} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:rt.colour}}/>{rt.label}</span>)}<span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-300"/>Non-clinical</span></div>
        </div>}
        {!selectedSite && !showAddSite && <div className="p-12 text-center"><div className="text-2xl mb-2">🏥</div><h3 className="text-sm font-semibold text-slate-600 mb-1">No sites configured</h3><p className="text-xs text-slate-400 mb-4">Add a site to start setting up rooms.</p><button onClick={() => setShowAddSite(true)} className="btn-primary">Add site</button></div>}
      </div>

      {/* ROOM TYPES CARD */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Room Types</span>
          <button onClick={() => {
            const name = prompt('New room type name:');
            if (!name?.trim()) return;
            const colour = SITE_COLOUR_PRESETS[Math.floor(Math.random() * SITE_COLOUR_PRESETS.length)];
            const id = name.trim().toLowerCase().replace(/\s+/g, '_');
            const current = getRoomTypes(ra);
            save({ ...ra, roomTypes: [...current, { id, label: name.trim(), colour }] });
            toast('Room type added', 'success');
          }} className="text-xs px-2 py-1 rounded bg-white/20 text-white hover:bg-white/30">+ Add type</button>
        </div>
        <div className="p-5">
          <div className="space-y-2">
            {getRoomTypes(ra).map((rt, i) => (
              <div key={rt.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                <input type="color" value={rt.colour} onChange={e => { const types = [...getRoomTypes(ra)]; types[i] = { ...types[i], colour: e.target.value }; save({ ...ra, roomTypes: types }); }} className="w-5 h-5 rounded-full border-0 cursor-pointer flex-shrink-0" style={{padding:0}} />
                <input type="text" value={rt.label} onChange={e => { const types = [...getRoomTypes(ra)]; types[i] = { ...types[i], label: e.target.value }; save({ ...ra, roomTypes: types }); }} className="text-sm font-medium text-slate-700 bg-transparent border-0 flex-1 outline-none" />
                <span className="text-[10px] text-slate-400">{rt.id}</span>
                <button onClick={() => { if (!confirm('Delete this room type?')) return; save({ ...ra, roomTypes: getRoomTypes(ra).filter(x => x.id !== rt.id) }); toast('Deleted', 'success'); }} className="text-xs text-red-400 hover:text-red-600">×</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PROCEDURE SLOT TYPES */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3">
          <div>
            <span className="text-sm font-semibold text-white">Procedure Slot Types</span>
            <span className="text-xs text-white/50 ml-2">Slot types that require a procedure room for nurses</span>
          </div>
        </div>
        <div className="p-5">
          {(() => {
            const allSlots = [...new Set([...(huddleData?.allSlotTypes || []), ...(data?.huddleSettings?.knownSlotTypes || [])])].sort();
            const selected = ra.procedureSlotTypes || [];
            const available = allSlots.filter(s => !selected.includes(s));
            return (<>
              {selected.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-2 mb-3">No procedure slot types defined</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selected.map((st, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200">
                      <span className="text-sm text-sky-800 font-medium">{st}</span>
                      <button onClick={() => save({ ...ra, procedureSlotTypes: selected.filter((_, j) => j !== i) })} className="text-xs text-sky-400 hover:text-red-500">×</button>
                    </div>
                  ))}
                </div>
              )}
              {available.length > 0 ? (
                <select onChange={e => { if (!e.target.value) return; save({ ...ra, procedureSlotTypes: [...selected, e.target.value] }); toast('Added', 'success'); e.target.value = ''; }} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-600" defaultValue="">
                  <option value="">Add a slot type...</option>
                  {available.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : allSlots.length === 0 ? (
                <p className="text-xs text-slate-400">Upload a CSV on the Today page to see available slot types</p>
              ) : null}
            </>);
          })()}
        </div>
      </div>

      {/* ROOM PREFERENCES MATRIX */}
      {sites.length > 0 && allStaff.length > 0 && (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-3">
            <span className="text-sm font-semibold text-white">Room Preferences</span>
            <span className="text-xs text-white/50 ml-2">Set preferred & secondary rooms per clinician per site</span>
          </div>
          <div className="p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-2 text-xs font-semibold text-slate-500 w-40">Clinician</th>
                  {sites.map(s => (
                    <th key={s.id} className="text-center py-2 px-2" colSpan={2}>
                      <span className="inline-block w-2 h-2 rounded-full mr-1" style={{background: s.colour || '#94a3b8'}} />
                      <span className="text-xs font-semibold text-slate-700">{s.name}</span>
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <th />
                  {sites.map(s => (
                    <React.Fragment key={s.id}>
                      <th className="text-center py-1 px-1 text-[10px] text-slate-400 font-normal">Preferred</th>
                      <th className="text-center py-1 px-1 text-[10px] text-slate-400 font-normal">Secondary</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allStaff.filter(c => c.group !== 'admin' && c.status !== 'administrative').map(c => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="py-1.5 px-2">
                      <div className="text-xs font-medium text-slate-700">{c.name}</div>
                      <div className="text-[10px] text-slate-400">{c.role}</div>
                    </td>
                    {sites.map(s => {
                      const rooms = (s.rooms || []).filter(r => r.isClinical !== false);
                      const prefs = c.roomPreferences?.[s.id] || {};
                      const updatePref = (field, val) => {
                        const newPrefs = { ...(c.roomPreferences || {}), [s.id]: { ...prefs, [field]: val || null } };
                        const clinicians = (Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians || {})).map(cl => cl.id === c.id ? { ...cl, roomPreferences: newPrefs } : cl);
                        saveData({ ...data, clinicians });
                      };
                      return (
                        <React.Fragment key={s.id}>
                          <td className="py-1 px-1"><select value={prefs.preferred || ''} onChange={e => updatePref('preferred', e.target.value)} className="w-full text-[11px] border border-slate-200 rounded px-1 py-1"><option value="">—</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td>
                          <td className="py-1 px-1"><select value={prefs.secondary || ''} onChange={e => updatePref('secondary', e.target.value)} className="w-full text-[11px] border border-slate-200 rounded px-1 py-1"><option value="">—</option>{rooms.filter(r => r.id !== prefs.preferred).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PRIORITY CARD */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-600 px-5 py-3"><span className="text-sm font-semibold text-white">Clinician Priority</span><span className="text-xs text-white/50 ml-2">Drag to reorder — higher = gets preferred room first</span></div>
        <div className="p-5"><div className="space-y-1 max-w-lg">
          {sortedPriority.map((c, i) => <div key={c.id} draggable onDragStart={() => setDragPriorityId(c.id)} onDragOver={e => e.preventDefault()} onDrop={() => handlePriorityDrop(c.id)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors cursor-grab active:cursor-grabbing ${dragPriorityId === c.id ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50 hover:bg-slate-100'}`}>
            <span className="text-xs font-bold text-slate-300 w-5">{i + 1}</span><span className="text-sm font-medium text-slate-700 flex-1">{c.name}</span><span className="text-xs text-slate-400">{c.role}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2"><circle cx="8" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>
          </div>)}
        </div></div>
      </div>

      {editingRoom && <RoomEditPopup room={editingRoom} site={selectedSite} roomTypes={getRoomTypes(ra)} onSave={saveRoom} onDelete={deleteRoom} onCancel={() => setEditingRoom(null)} />}
    </div>
  );
}

function AddSiteForm({ csvLocations, existingSites, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [colour, setColour] = useState(SITE_COLOUR_PRESETS[0]);
  const [gridSize, setGridSize] = useState('small');
  const suggestions = csvLocations.filter(l => !existingSites.some(s => s.name === l));
  return <div className="p-5 border-b border-slate-200 bg-slate-50">
    <h3 className="text-sm font-semibold text-slate-900 mb-3">Add site</h3>
    <div className="flex items-end gap-4 flex-wrap">
      <div><label className="text-xs text-slate-500 block mb-1">Site name</label><div className="flex items-center gap-2"><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Winscombe" className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-48" />{suggestions.length > 0 && <div className="flex gap-1">{suggestions.map(s => <button key={s} onClick={() => setName(s)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300">{s}</button>)}</div>}</div></div>
      <div><label className="text-xs text-slate-500 block mb-1">Colour</label><div className="flex gap-1.5 items-center">{SITE_COLOUR_PRESETS.slice(0, 6).map(c => <button key={c} onClick={() => setColour(c)} className="w-5 h-5 rounded-full hover:scale-125 transition-transform" style={{background:c, outline: colour === c ? '2px solid #1e293b' : '1px solid #e2e8f0', outlineOffset: 1}} />)}<input type="color" value={colour} onChange={e => setColour(e.target.value)} className="w-5 h-5 rounded-full border-0 cursor-pointer" style={{padding:0}} /></div></div>
      <div><label className="text-xs text-slate-500 block mb-1">Grid size</label><select value={gridSize} onChange={e => setGridSize(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5">{Object.entries(GRID_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
      <div className="flex gap-2"><button onClick={() => name.trim() && onSave(name.trim(), colour, gridSize)} disabled={!name.trim()} className="btn-primary text-sm">Add</button><button onClick={onCancel} className="btn-secondary text-sm">Cancel</button></div>
    </div>
  </div>;
}

function RoomEditPopup({ room, site, roomTypes, onSave, onDelete, onCancel }) {
  const [name, setName] = useState(room.name || '');
  const [types, setTypes] = useState(room.types || []);
  const [isClinical, setIsClinical] = useState(room.isClinical !== false);
  const toggleType = (t) => setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  return <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onCancel}>
    <div className="bg-white rounded-xl shadow-2xl p-5 w-96" onClick={e => e.stopPropagation()}>
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{!site?.rooms?.find(r => r.id === room.id) ? 'Add room' : 'Edit room'}</h3>
      <div className="space-y-4">
        <div><label className="text-xs text-slate-500 block mb-1">Room name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" autoFocus /></div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500">Non-clinical space</label>
          <button onClick={() => setIsClinical(!isClinical)} className={`w-8 h-5 rounded-full transition-colors ${isClinical ? 'bg-slate-300' : 'bg-amber-400'}`}><div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${isClinical ? 'translate-x-1' : 'translate-x-[17px]'}`} /></button>
          <span className="text-xs text-slate-400">{isClinical ? 'Clinical room' : 'Non-clinical'}</span>
        </div>
        {isClinical && <div><label className="text-xs text-slate-500 block mb-2">Suitable for</label><div className="flex flex-wrap gap-2">{roomTypes.map(rt => <button key={rt.id} onClick={() => toggleType(rt.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${types.includes(rt.id) ? 'text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`} style={types.includes(rt.id) ? {background: rt.colour} : undefined}>{rt.label}</button>)}</div></div>}
        {(room.w > 1 || room.h > 1) && <div className="text-xs text-slate-400">Size: {room.w || 1} x {room.h || 1} squares</div>}
      </div>
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
        {site?.rooms?.find(r => r.id === room.id) ? <button onClick={() => onDelete(room.id)} className="text-xs text-red-400 hover:text-red-600">Delete room</button> : <div />}
        <div className="flex gap-2"><button onClick={onCancel} className="btn-secondary text-sm">Cancel</button><button onClick={() => name.trim() && onSave({ ...room, name: name.trim(), types: isClinical ? types : [], isClinical })} disabled={!name.trim()} className="btn-primary text-sm">Save</button></div>
      </div>
    </div>
  </div>;
}
