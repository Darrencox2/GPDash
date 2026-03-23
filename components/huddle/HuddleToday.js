'use client';
import { useState, useRef, useMemo } from 'react';
import { Button, Card, SectionHeading } from '@/components/ui';
import { getHuddleCapacity, getTodayDateStr, parseHuddleCSV, getNDayAvailability } from '@/lib/huddle';
import SlotFilter from './SlotFilter';

// ── Match CSV clinician name to team member initials ──────────────
function getInitials(csvName, clinicians) {
  if (!csvName || !clinicians || clinicians.length === 0) return csvName;
  const cleaned = csvName.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss)\s*/i, '').trim().toLowerCase();
  const parts = cleaned.split(/\s+/);
  const surname = parts[parts.length - 1] || '';

  for (const c of clinicians) {
    const cCleaned = c.name.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss)\s*/i, '').trim().toLowerCase();
    const cParts = cCleaned.split(/\s+/);
    const cSurname = cParts[cParts.length - 1] || '';
    if (surname && cSurname && surname === cSurname) return c.initials;
  }
  // Fallback: first letters of first+last
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return csvName.slice(0, 3);
}

// ── Inline slot picker for a capacity card ────────────────────────
function CardSlotPicker({ overrides, setOverrides, knownSlotTypes }) {
  const [show, setShow] = useState(false);
  const selectedCount = overrides ? Object.values(overrides).filter(Boolean).length : 0;

  return (
    <div className="relative">
      <button
        onClick={() => { if (!show && !overrides) { const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = true; }); setOverrides(o); } setShow(!show); }}
        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${show ? 'bg-slate-900 text-white' : 'bg-white/20 text-white/90 hover:bg-white/30'}`}
      >
        ⚙ Slots{selectedCount > 0 ? ` (${selectedCount})` : ''}
      </button>
      {show && overrides && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-xl p-3 w-64 max-h-60 overflow-y-auto">
          <div className="text-xs font-medium text-slate-700 mb-2">Include in count:</div>
          <div className="space-y-0.5">
            {(knownSlotTypes || []).sort().map(slot => (
              <label key={slot} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                <input type="checkbox" checked={!!overrides[slot]} onChange={e => setOverrides({ ...overrides, [slot]: e.target.checked })} className="rounded border-slate-300" />
                <span className="truncate" title={slot}>{slot.length > 26 ? slot.slice(0, 26) + '…' : slot}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
            <button onClick={() => { const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = true; }); setOverrides(o); }} className="text-[10px] text-slate-500 hover:underline">All</button>
            <button onClick={() => { const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = false; }); setOverrides(o); }} className="text-[10px] text-slate-500 hover:underline">None</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 7-day compact bar chart strip ─────────────────────────────────
function SevenDayStrip({ huddleData, huddleSettings, overrides, accent = 'teal' }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 7, overrides), [huddleData, huddleSettings, overrides]);
  const maxVal = Math.max(...days.map(d => d.available || 0), 1);
  const accentColours = {
    teal: { bar: 'bg-teal-400', text: 'text-teal-600' },
    violet: { bar: 'bg-violet-400', text: 'text-violet-600' },
    sky: { bar: 'bg-sky-400', text: 'text-sky-600' },
  };
  const ac = accentColours[accent] || accentColours.teal;

  return (
    <div className="p-4">
      <div className="flex items-end gap-1.5" style={{ height: 80 }}>
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null;
          const pct = hasData && d.available > 0 ? Math.max(12, (d.available / maxVal) * 100) : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5">
              {hasData && d.available > 0 && (
                <div className={`text-[10px] font-bold ${isToday ? 'text-slate-800' : ac.text}`}>{d.available}</div>
              )}
              <div
                className={`w-full rounded-t-md transition-all ${isToday ? 'bg-slate-800' : hasData ? ac.bar + ' opacity-70' : 'bg-slate-200'}`}
                style={{ height: hasData ? `${pct}%` : '8%', minHeight: 3 }}
              />
              <div className={`text-[9px] font-medium mt-0.5 ${isToday ? 'text-slate-900 font-bold' : 'text-slate-400'}`}>{d.dayName}</div>
            </div>
          );
        })}
      </div>
      {days.some(d => d.booked !== null && d.booked > 0) && (
        <div className="flex gap-1.5 mt-1 pt-1 border-t border-slate-100">
          {days.map((d, i) => (
            <div key={i} className="flex-1 text-center text-[9px] text-slate-400">
              {d.booked !== null && d.booked > 0 ? `${d.booked}b` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 28-day graphical routine capacity ─────────────────────────────
function TwentyEightDayChart({ huddleData, huddleSettings, overrides }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 28, overrides), [huddleData, huddleSettings, overrides]);
  const maxVal = Math.max(...days.map(d => d.available || 0), 1);
  const totalAvail = days.reduce((sum, d) => sum + (d.available || 0), 0);

  // Group by week for labels
  const weeks = [];
  for (let i = 0; i < days.length; i += 5) {
    weeks.push(days.slice(i, i + 5));
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500">Next 28 weekdays</div>
        <div className="text-sm font-semibold text-slate-700">{totalAvail} total slots</div>
      </div>
      <div className="flex items-end gap-px" style={{ height: 110 }}>
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null;
          const pct = hasData && d.available > 0 ? Math.max(6, (d.available / maxVal) * 100) : 0;
          const isMonday = d.dayName === 'Mon';
          return (
            <div key={i} className={`flex-1 flex flex-col items-center justify-end h-full ${isMonday && i > 0 ? 'ml-1' : ''}`}>
              <div
                className={`w-full rounded-t transition-all cursor-default ${
                  isToday ? 'bg-slate-800' :
                  !hasData ? 'bg-slate-100' :
                  d.available === 0 ? 'bg-red-200' :
                  d.available <= (maxVal * 0.3) ? 'bg-red-400' :
                  d.available <= (maxVal * 0.6) ? 'bg-amber-400' :
                  'bg-emerald-400'
                }`}
                style={{ height: hasData ? `${pct}%` : '4%', minHeight: 2 }}
                title={`${d.dayName} ${d.dayNum} ${d.monthShort}: ${hasData ? d.available + ' available' : 'No data'}${d.booked ? ', ' + d.booked + ' booked' : ''}`}
              />
            </div>
          );
        })}
      </div>
      {/* Week labels */}
      <div className="flex gap-px mt-1">
        {weeks.map((week, wi) => (
          <div key={wi} className={`flex gap-px ${wi > 0 ? 'ml-1' : ''}`} style={{ flex: week.length }}>
            {week.map((d, di) => (
              <div key={di} className="flex-1 text-center">
                <div className={`text-[8px] ${di === 0 ? 'text-slate-500 font-medium' : 'text-slate-300'}`}>
                  {di === 0 ? `${d.dayNum}` : ''}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-400" /><span className="text-[10px] text-slate-500">High</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber-400" /><span className="text-[10px] text-slate-500">Medium</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-red-400" /><span className="text-[10px] text-slate-500">Low</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-slate-100" /><span className="text-[10px] text-slate-500">No data</span></div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function HuddleToday({ data, saveData, toast, huddleData, setHuddleData, huddleMessages, setHuddleMessages }) {
  const [newMsg, setNewMsg] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [slotOverrides, setSlotOverrides] = useState(null);
  const [showFilter, setShowFilter] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const hs = data?.huddleSettings || {};
  const knownSlotTypes = hs?.knownSlotTypes || [];

  // Per-card slot overrides
  const [routineOverrides, setRoutineOverrides] = useState(null);
  const [minorIllnessOverrides, setMinorIllnessOverrides] = useState(null);
  const [physioOverrides, setPhysioOverrides] = useState(null);

  // Team members for initials matching
  const teamClinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    return Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
  }, [data?.clinicians]);

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

      {/* ═══ DATA-DRIVEN SECTIONS ═══ */}
      {!huddleData ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Upload Appointment Report</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload or drag-and-drop your EMIS CSV to see urgent capacity.</p>
          <Button onClick={() => fileRef.current?.click()}>Select CSV File</Button>
        </div>
      ) : capacity && (
        <>
          {/* ─── URGENT ON THE DAY ─── */}
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
                    <div className="flex flex-wrap gap-2">
                      {s.data.byClinician.map((c, i) => {
                        const initials = getInitials(c.name, teamClinicians);
                        return (
                          <div key={i} className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100" title={c.name}>
                            <span className="text-xs font-bold text-slate-700">{initials}</span>
                            <span className={`text-sm font-semibold ${s.colour}`}>{c.available}</span>
                          </div>
                        );
                      })}
                    </div>
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

          {/* ─── ROUTINE CAPACITY (28 days) ─── */}
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-white">Routine Capacity</div>
                  <div className="text-[11px] text-white/70">28-day availability overview</div>
                </div>
                <CardSlotPicker overrides={routineOverrides} setOverrides={setRoutineOverrides} knownSlotTypes={knownSlotTypes} />
              </div>
            </div>
            <TwentyEightDayChart huddleData={huddleData} huddleSettings={hs} overrides={routineOverrides} />
          </div>

          {/* ─── MINOR ILLNESS + PHYSIOTHERAPY (7 days each) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Minor Illness */}
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Minor Illness</div>
                    <div className="text-[10px] text-white/70">Next 7 days</div>
                  </div>
                  <CardSlotPicker overrides={minorIllnessOverrides} setOverrides={setMinorIllnessOverrides} knownSlotTypes={knownSlotTypes} />
                </div>
              </div>
              <SevenDayStrip huddleData={huddleData} huddleSettings={hs} overrides={minorIllnessOverrides} accent="violet" />
            </div>

            {/* Physiotherapy */}
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-r from-sky-500 to-cyan-600 px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Physiotherapy</div>
                    <div className="text-[10px] text-white/70">Next 7 days</div>
                  </div>
                  <CardSlotPicker overrides={physioOverrides} setOverrides={setPhysioOverrides} knownSlotTypes={knownSlotTypes} />
                </div>
              </div>
              <SevenDayStrip huddleData={huddleData} huddleSettings={hs} overrides={physioOverrides} accent="sky" />
            </div>
          </div>

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
