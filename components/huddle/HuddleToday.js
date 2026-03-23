'use client';
import { useState, useRef } from 'react';
import { Button, Card, SectionHeading } from '@/components/ui';
import { getHuddleCapacity, getTodayDateStr, parseHuddleCSV, get7DayAvailability } from '@/lib/huddle';
import SlotFilter from './SlotFilter';

export default function HuddleToday({ data, saveData, toast, huddleData, setHuddleData, huddleMessages, setHuddleMessages }) {
  const [newMsg, setNewMsg] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [slotOverrides, setSlotOverrides] = useState(null);
  const [showFilter, setShowFilter] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const hs = data?.huddleSettings || {};

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
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs, slotOverrides) : null;

  return (
    <div className="space-y-6 animate-in" onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={e => { e.preventDefault(); setIsDragging(false); }} onDrop={onDrop}>
      {isDragging && (
        <div className="fixed inset-0 z-40 bg-teal-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center border-2 border-dashed border-teal-400">
            <div className="text-4xl mb-2">📊</div>
            <div className="text-lg font-semibold text-slate-900">Drop CSV here</div>
          </div>
        </div>
      )}

      <SectionHeading title="Today's Huddle" subtitle={data?.huddleCsvUploadedAt ? `Last report: ${new Date(data.huddleCsvUploadedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'No report uploaded'}>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
        <Button variant={isUploadedToday ? 'upload_fresh' : 'upload_stale'} onClick={() => fileRef.current?.click()}>
          {isUploadedToday ? '✓ Upload Report' : '⚠ Upload Report'}
        </Button>
      </SectionHeading>

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

      {/* URGENT ON THE DAY */}
      {!huddleData ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Upload Appointment Report</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload or drag-and-drop your EMIS CSV to see urgent capacity.</p>
          <Button onClick={() => fileRef.current?.click()}>Select CSV File</Button>
        </div>
      ) : capacity && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-lg font-semibold text-slate-900">Urgent on the Day</h2><p className="text-xs text-slate-500 mt-0.5">Available urgent capacity{displayDate !== todayStr ? ` (${displayDate})` : ''}</p></div>
            <SlotFilter overrides={slotOverrides} setOverrides={setSlotOverrides} show={showFilter} setShow={setShowFilter} huddleSettings={hs} />
          </div>

          {displayDate !== todayStr && (
            <Card className="p-3 bg-amber-50 border-amber-200 text-amber-800 text-sm flex items-center gap-2">⚠️ Today not found in report. Showing {displayDate}.</Card>
          )}

          <div className="text-center py-4">
            <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-blue-500">{capacity.am.total + capacity.pm.total}</div>
            <div className="text-sm text-slate-500 mt-1">urgent slots available</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[{ label: 'Morning', sub: '08:00 – 13:00', data: capacity.am, accent: 'from-amber-400 to-orange-400', colour: 'text-amber-600' },
              { label: 'Afternoon', sub: '13:00 – 18:30', data: capacity.pm, accent: 'from-blue-400 to-indigo-500', colour: 'text-blue-600' }].map(s => (
              <div key={s.label} className="card overflow-hidden">
                <div className={`bg-gradient-to-r ${s.accent} px-5 py-3`}>
                  <div className="flex items-center justify-between text-white">
                    <div><div className="text-lg font-bold">{s.label}</div><div className="text-xs opacity-90">{s.sub}</div></div>
                    <div className="text-3xl font-bold">{s.data.total}</div>
                  </div>
                </div>
                <div className="p-4">
                  {s.data.byClinician.length > 0 ? (
                    <div className="space-y-2">{s.data.byClinician.map((c, i) => <div key={i} className="flex items-center justify-between"><span className="text-sm text-slate-700">{c.name}</span><span className={`text-sm font-semibold ${s.colour}`}>{c.available}</span></div>)}</div>
                  ) : <div className="text-center text-slate-400 text-sm py-4">No capacity</div>}
                </div>
              </div>
            ))}
          </div>

          {capacity.bySlotType.length > 0 && (
            <div className="card overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200"><div className="text-sm font-semibold text-slate-900">Capacity by Slot Type</div></div>
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-500 uppercase"><th className="text-left py-1 font-medium">Slot Type</th><th className="text-right py-1 font-medium w-16">AM</th><th className="text-right py-1 font-medium w-16">PM</th><th className="text-right py-1 font-medium w-16">Total</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {capacity.bySlotType.map((s, i) => <tr key={i}><td className="py-2 text-slate-700">{s.name}</td><td className="py-2 text-right text-amber-600 font-medium">{s.am || '–'}</td><td className="py-2 text-right text-blue-600 font-medium">{s.pm || '–'}</td><td className="py-2 text-right font-semibold text-slate-900">{s.total}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7-Day Availability Cards for custom filters */}
          {(() => {
            const customFilters = Object.keys(hs.customFilters || {});
            if (customFilters.length === 0) return null;
            return (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">7-Day Availability</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customFilters.map(filterName => {
                    const days = get7DayAvailability(huddleData, hs, filterName);
                    const totalAvail = days.reduce((sum, d) => sum + (d.available || 0), 0);
                    const filterSlots = hs.customFilters[filterName] || [];
                    const hasSlots = filterSlots.length > 0;
                    return (
                      <div key={filterName} className="card overflow-hidden">
                        <div className="bg-gradient-to-r from-slate-700 to-slate-600 px-4 py-2.5">
                          <div className="flex items-center justify-between text-white">
                            <div className="text-sm font-semibold">{filterName}</div>
                            <div className="text-lg font-bold">{totalAvail}</div>
                          </div>
                          <div className="text-[10px] text-white/60">next 7 days</div>
                        </div>
                        {!hasSlots ? (
                          <div className="p-3 text-xs text-slate-400 text-center">No slot types assigned. Go to Settings to configure.</div>
                        ) : (
                          <div className="p-3">
                            <div className="flex gap-1">
                              {days.map((d, i) => {
                                const isToday = i === 0;
                                const hasData = d.available !== null;
                                return (
                                  <div key={i} className={`flex-1 text-center rounded-md py-1.5 ${isToday ? 'bg-slate-900 text-white' : hasData ? 'bg-slate-50' : 'bg-slate-50 opacity-50'}`}>
                                    <div className="text-[10px] font-medium opacity-60">{d.dayName}</div>
                                    <div className={`text-sm font-bold ${isToday ? '' : hasData ? (d.available > 0 ? 'text-emerald-600' : 'text-slate-400') : 'text-slate-300'}`}>
                                      {hasData ? d.available : '–'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {days.some(d => d.booked !== null && d.booked > 0) && (
                              <div className="mt-2 pt-2 border-t border-slate-100 flex gap-1">
                                {days.map((d, i) => (
                                  <div key={i} className="flex-1 text-center">
                                    <div className="text-[9px] text-slate-400">{d.booked !== null ? `${d.booked} booked` : ''}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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
