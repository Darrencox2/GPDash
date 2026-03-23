'use client';
import { useState, useRef, useMemo } from 'react';
import { Button, Card, SectionHeading } from '@/components/ui';
import { getHuddleCapacity, getTodayDateStr, parseHuddleCSV, getNDayAvailability } from '@/lib/huddle';
import SlotFilter from './SlotFilter';

// ── Match CSV clinician name to team member initials ──────────────
function getInitials(csvName, clinicians) {
  if (!csvName || !clinicians || clinicians.length === 0) return csvName?.slice(0, 3) || '??';
  const csvLower = csvName.toLowerCase().trim();
  const csvCleaned = csvLower.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|miss)\s*/i, '').trim();
  const csvParts = csvCleaned.split(/\s+/).filter(Boolean);

  for (const c of clinicians) {
    const cLower = c.name.toLowerCase().trim();
    const cCleaned = cLower.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|miss)\s*/i, '').trim();
    // Exact match on cleaned name
    if (csvCleaned === cCleaned) return c.initials;
    // CSV contains team member name or vice versa
    if (csvCleaned.includes(cCleaned) || cCleaned.includes(csvCleaned)) return c.initials;
  }

  // Try surname match (last word)
  const csvSurname = csvParts[csvParts.length - 1] || '';
  for (const c of clinicians) {
    const cCleaned = c.name.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss)\s*/i, '').trim().toLowerCase();
    const cParts = cCleaned.split(/\s+/).filter(Boolean);
    const cSurname = cParts[cParts.length - 1] || '';
    if (csvSurname && cSurname && csvSurname === cSurname) return c.initials;
  }

  // Try first name match
  const csvFirst = csvParts[0] || '';
  for (const c of clinicians) {
    const cCleaned = c.name.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss)\s*/i, '').trim().toLowerCase();
    const cFirst = cCleaned.split(/\s+/)[0] || '';
    if (csvFirst && cFirst && csvFirst === cFirst) return c.initials;
  }

  // Try matching initials from the team against the CSV name
  for (const c of clinicians) {
    if (c.initials && c.initials.length >= 2) {
      const ini = c.initials.toLowerCase();
      // Check if CSV name starts with the letters of the initials
      if (csvParts.length >= 2 && csvParts[0][0] === ini[0] && csvParts[csvParts.length - 1][0] === ini[ini.length - 1]) return c.initials;
    }
  }

  // Fallback: build initials from the CSV name parts
  if (csvParts.length >= 2) return (csvParts[0][0] + csvParts[csvParts.length - 1][0]).toUpperCase();
  if (csvParts.length === 1 && csvParts[0].length >= 2) return csvParts[0].slice(0, 2).toUpperCase();
  return csvName.slice(0, 3);
}


// ── 7-day compact bar chart strip with available/embargoed/booked ──
function SevenDayStrip({ huddleData, huddleSettings, overrides, accent = 'teal' }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 7, overrides), [huddleData, huddleSettings, overrides]);
  const maxVal = Math.max(...days.map(d => (d.available || 0) + (d.embargoed || 0) + (d.booked || 0)), 1);
  const accentColours = {
    teal: { bar: 'bg-teal-400', emb: 'bg-teal-200', book: 'bg-slate-300', text: 'text-teal-600' },
    violet: { bar: 'bg-violet-400', emb: 'bg-violet-200', book: 'bg-slate-300', text: 'text-violet-600' },
    sky: { bar: 'bg-sky-400', emb: 'bg-sky-200', book: 'bg-slate-300', text: 'text-sky-600' },
  };
  const ac = accentColours[accent] || accentColours.teal;

  return (
    <div className="p-4">
      <div className="flex items-end gap-1.5" style={{ height: 90 }}>
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null;
          const avail = d.available || 0;
          const emb = d.embargoed || 0;
          const book = d.booked || 0;
          const total = avail + emb + book;
          const totalPct = hasData && total > 0 ? Math.max(12, (total / maxVal) * 100) : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5" title={hasData ? `${d.dayName}: ${avail} available, ${emb} embargoed, ${book} booked` : d.dayName}>
              {hasData && total > 0 && (
                <div className={`text-[10px] font-bold ${isToday ? 'text-slate-800' : ac.text}`}>
                  {avail}{emb > 0 && <span className="text-slate-400">+{emb}</span>}{book > 0 && <span className="text-slate-300 ml-0.5">({book})</span>}
                </div>
              )}
              <div className="w-full rounded-t-md overflow-hidden" style={{ height: hasData ? `${totalPct}%` : '8%', minHeight: 3 }}>
                {isToday ? (
                  <div className="w-full h-full bg-slate-800" />
                ) : hasData ? (
                  <div className="w-full h-full flex flex-col justify-end">
                    {avail > 0 && <div className={`${ac.bar} opacity-80`} style={{ height: `${(avail / total) * 100}%` }} />}
                    {emb > 0 && <div className={ac.emb} style={{ height: `${(emb / total) * 100}%` }} />}
                    {book > 0 && <div className={ac.book} style={{ height: `${(book / total) * 100}%` }} />}
                  </div>
                ) : (
                  <div className="w-full h-full bg-slate-200" />
                )}
              </div>
              <div className={`text-[9px] font-medium mt-0.5 ${isToday ? 'text-slate-900 font-bold' : 'text-slate-400'}`}>{d.dayName}</div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1"><div className={`w-2 h-2 rounded-sm ${ac.bar}`} /><span className="text-[10px] text-slate-500">Available</span></div>
        <div className="flex items-center gap-1"><div className={`w-2 h-2 rounded-sm ${ac.emb}`} /><span className="text-[10px] text-slate-500">Embargoed</span></div>
        <div className="flex items-center gap-1"><div className={`w-2 h-2 rounded-sm ${ac.book}`} /><span className="text-[10px] text-slate-500">Booked</span></div>
      </div>
    </div>
  );
}

// ── 28-day graphical routine capacity with stacked available/embargoed/booked ──
function TwentyEightDayChart({ huddleData, huddleSettings, overrides }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 28, overrides), [huddleData, huddleSettings, overrides]);
  const maxVal = Math.max(...days.map(d => (d.available || 0) + (d.embargoed || 0) + (d.booked || 0)), 1);
  const totalAvail = days.reduce((sum, d) => sum + (d.available || 0), 0);
  const totalEmb = days.reduce((sum, d) => sum + (d.embargoed || 0), 0);
  const totalBooked = days.reduce((sum, d) => sum + (d.booked || 0), 0);

  const weeks = [];
  for (let i = 0; i < days.length; i += 5) weeks.push(days.slice(i, i + 5));

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500">Next 28 weekdays</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-emerald-700">{totalAvail} avail</span>
          {totalEmb > 0 && <span className="font-semibold text-amber-600">{totalEmb} emb</span>}
          {totalBooked > 0 && <span className="font-semibold text-slate-500">{totalBooked} booked</span>}
        </div>
      </div>
      <div className="flex items-end gap-px" style={{ height: 110 }}>
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null;
          const avail = d.available || 0;
          const emb = d.embargoed || 0;
          const book = d.booked || 0;
          const total = avail + emb + book;
          const pct = hasData && total > 0 ? Math.max(6, (total / maxVal) * 100) : 0;
          const isMonday = d.dayName === 'Mon';
          return (
            <div key={i} className={`flex-1 flex flex-col items-center justify-end h-full ${isMonday && i > 0 ? 'ml-1' : ''}`}
              title={`${d.dayName} ${d.dayNum} ${d.monthShort}: ${hasData ? avail + ' available' + (emb > 0 ? ', ' + emb + ' embargoed' : '') + (book > 0 ? ', ' + book + ' booked' : '') : 'No data'}`}>
              <div className="w-full rounded-t overflow-hidden cursor-default" style={{ height: hasData ? `${pct}%` : '4%', minHeight: 2 }}>
                {isToday ? (
                  <div className="w-full h-full bg-slate-800" />
                ) : !hasData ? (
                  <div className="w-full h-full bg-slate-100" />
                ) : total === 0 ? (
                  <div className="w-full h-full bg-red-200" />
                ) : (
                  <div className="w-full h-full flex flex-col justify-end">
                    {avail > 0 && <div className={`${avail <= (maxVal * 0.3) ? 'bg-red-400' : avail <= (maxVal * 0.6) ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ height: `${(avail / total) * 100}%` }} />}
                    {emb > 0 && <div className="bg-amber-300" style={{ height: `${(emb / total) * 100}%` }} />}
                    {book > 0 && <div className="bg-slate-300" style={{ height: `${(book / total) * 100}%` }} />}
                  </div>
                )}
              </div>
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
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-400" /><span className="text-[10px] text-slate-500">Available</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber-300" /><span className="text-[10px] text-slate-500">Embargoed</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-slate-300" /><span className="text-[10px] text-slate-500">Booked</span></div>
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
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const hs = data?.huddleSettings || {};
  const knownSlotTypes = hs?.knownSlotTypes || [];
  const saved = hs?.savedSlotFilters || {};

  // Initialise overrides from persisted settings
  const [urgentOverrides, setUrgentOverridesLocal] = useState(() => saved.urgent || null);
  const [routineOverrides, setRoutineOverridesLocal] = useState(() => saved.routine || null);
  const [minorIllnessOverrides, setMinorIllnessOverridesLocal] = useState(() => saved.minorIllness || null);
  const [physioOverrides, setPhysioOverridesLocal] = useState(() => saved.physio || null);

  // Wrapper setters that persist to Redis
  const persistFilter = (key, value) => {
    const newSaved = { ...data.huddleSettings?.savedSlotFilters, [key]: value };
    saveData({ ...data, huddleSettings: { ...hs, savedSlotFilters: newSaved } }, false);
  };
  const setUrgentOverrides = (v) => { setUrgentOverridesLocal(v); persistFilter('urgent', v); };
  const setRoutineOverrides = (v) => { setRoutineOverridesLocal(v); persistFilter('routine', v); };
  const setMinorIllnessOverrides = (v) => { setMinorIllnessOverridesLocal(v); persistFilter('minorIllness', v); };
  const setPhysioOverrides = (v) => { setPhysioOverridesLocal(v); persistFilter('physio', v); };

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
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs, urgentOverrides) : null;

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
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-rose-600 px-5 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-white">Urgent on the Day</div>
                  <div className="text-[11px] text-white/70">Available urgent capacity{displayDate !== todayStr ? ` (${displayDate})` : ''}</div>
                </div>
                <SlotFilter overrides={urgentOverrides} setOverrides={setUrgentOverrides} knownSlotTypes={knownSlotTypes} title="Urgent Slot Filter" />
              </div>
            </div>

            {displayDate !== todayStr && (
              <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm flex items-center gap-2">⚠️ Today not found in report. Showing {displayDate}.</div>
            )}

            {/* Hero numbers */}
            <div className="text-center py-4 border-b border-slate-100">
              <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-blue-500">
                {capacity.am.total + capacity.pm.total}
              </div>
              <div className="text-sm text-slate-500 mt-0.5">available slots</div>
              {(((capacity.am.embargoed || 0) + (capacity.pm.embargoed || 0)) > 0 || ((capacity.am.booked || 0) + (capacity.pm.booked || 0)) > 0) && (
                <div className="mt-1.5 flex items-center justify-center gap-4">
                  {((capacity.am.embargoed || 0) + (capacity.pm.embargoed || 0)) > 0 && (
                    <span className="flex items-center gap-1"><span className="text-base font-bold text-amber-600">{(capacity.am.embargoed || 0) + (capacity.pm.embargoed || 0)}</span><span className="text-xs text-amber-600">embargoed</span></span>
                  )}
                  {((capacity.am.booked || 0) + (capacity.pm.booked || 0)) > 0 && (
                    <span className="flex items-center gap-1"><span className="text-base font-bold text-slate-500">{(capacity.am.booked || 0) + (capacity.pm.booked || 0)}</span><span className="text-xs text-slate-500">booked</span></span>
                  )}
                </div>
              )}
            </div>

            {/* AM / PM cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {[{ label: 'Morning', sub: '08:00 – 13:00', data: capacity.am, colour: 'text-amber-600' },
                { label: 'Afternoon', sub: '13:00 – 18:30', data: capacity.pm, colour: 'text-blue-600' }].map(s => (
                <div key={s.label} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div><div className="text-sm font-bold text-slate-900">{s.label}</div><div className="text-[11px] text-slate-400">{s.sub}</div></div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${s.colour}`}>{s.data.total}</div>
                      <div className="flex items-center gap-2 justify-end">
                        {(s.data.embargoed || 0) > 0 && <span className="text-[11px] text-amber-500">+{s.data.embargoed} emb</span>}
                        {(s.data.booked || 0) > 0 && <span className="text-[11px] text-slate-400">{s.data.booked} bkd</span>}
                      </div>
                    </div>
                  </div>
                  {s.data.byClinician.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1">
                      {s.data.byClinician.map((c, i) => {
                        const initials = getInitials(c.name, teamClinicians);
                        return (
                          <div key={i} className="flex items-center gap-1.5 py-1 px-2 bg-slate-50 rounded border border-slate-100" title={c.name}>
                            <span className="text-xs font-bold text-slate-700 min-w-[22px]">{initials}</span>
                            <span className={`text-xs font-semibold ${s.colour}`}>{c.available}</span>
                            {(c.embargoed || 0) > 0 && <span className="text-[10px] text-amber-500">+{c.embargoed}</span>}
                            {(c.booked || 0) > 0 && <span className="text-[10px] text-slate-400">({c.booked})</span>}
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className="text-center text-slate-400 text-sm py-3">No capacity</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Slot type breakdown */}
          {capacity.bySlotType.length > 0 && (
            <div className="card overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200"><div className="text-sm font-semibold text-slate-900">Capacity by Slot Type</div></div>
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-500 uppercase">
                    <th className="text-left py-1 font-medium">Slot Type</th>
                    <th className="text-right py-1 font-medium w-20">AM</th>
                    <th className="text-right py-1 font-medium w-20">PM</th>
                    <th className="text-right py-1 font-medium w-20">Total</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {capacity.bySlotType.map((s, i) => (
                      <tr key={i}>
                        <td className="py-2 text-slate-700">{s.name}</td>
                        <td className="py-2 text-right">
                          <span className="text-amber-600 font-medium">{s.am || '–'}</span>
                          {s.amEmb > 0 && <span className="text-amber-400 text-xs ml-1">+{s.amEmb}</span>}
                          {(s.amBook || 0) > 0 && <span className="text-slate-400 text-xs ml-1">({s.amBook})</span>}
                        </td>
                        <td className="py-2 text-right">
                          <span className="text-blue-600 font-medium">{s.pm || '–'}</span>
                          {s.pmEmb > 0 && <span className="text-blue-400 text-xs ml-1">+{s.pmEmb}</span>}
                          {(s.pmBook || 0) > 0 && <span className="text-slate-400 text-xs ml-1">({s.pmBook})</span>}
                        </td>
                        <td className="py-2 text-right">
                          <span className="font-semibold text-slate-900">{s.total}</span>
                          {s.totalEmb > 0 && <span className="text-amber-500 text-xs ml-1">+{s.totalEmb}</span>}
                          {(s.totalBook || 0) > 0 && <span className="text-slate-400 text-xs ml-1">({s.totalBook})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 pt-3 border-t border-slate-100 flex gap-4 text-[11px] text-slate-400">
                  <span>Numbers = available</span>
                  <span className="text-amber-500">+n = embargoed</span>
                  <span className="text-slate-400">(n) = booked</span>
                </div>
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
                <SlotFilter overrides={routineOverrides} setOverrides={setRoutineOverrides} knownSlotTypes={knownSlotTypes} title="Routine Slot Filter" />
              </div>
            </div>
            <TwentyEightDayChart huddleData={huddleData} huddleSettings={hs} overrides={routineOverrides} />
          </div>

          {/* ─── MINOR ILLNESS + PHYSIOTHERAPY (7 days each) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Minor Illness</div>
                    <div className="text-[10px] text-white/70">Next 7 days</div>
                  </div>
                  <SlotFilter overrides={minorIllnessOverrides} setOverrides={setMinorIllnessOverrides} knownSlotTypes={knownSlotTypes} title="Minor Illness Slots" />
                </div>
              </div>
              <SevenDayStrip huddleData={huddleData} huddleSettings={hs} overrides={minorIllnessOverrides} accent="violet" />
            </div>
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-r from-sky-500 to-cyan-600 px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Physiotherapy</div>
                    <div className="text-[10px] text-white/70">Next 7 days</div>
                  </div>
                  <SlotFilter overrides={physioOverrides} setOverrides={setPhysioOverrides} knownSlotTypes={knownSlotTypes} title="Physiotherapy Slots" />
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
