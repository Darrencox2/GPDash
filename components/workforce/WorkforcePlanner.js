'use client';
// components/workforce/WorkforcePlanner.js
//
// Workforce planner — maps clinician capacity per session, strips out
// non-clinical "other activities" (deductions) to reveal real clinical
// capacity, and compares it against the practice's demand model to show
// where supply and demand diverge.
//
// Sources everything from data GPdash already holds:
//   • roster        → working_patterns (AM/PM per weekday)
//   • clinicians    → data.clinicians
//   • demand        → the practice's calibrated demand model (data._v4)
//   • config        → practice_settings.workforce (maxOff, deductions, duty…)
//
// The capacity maths live in lib/workforce.js (pure, tested). This file is
// the data loading + interactive UI only.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  buildWorkforceModel, typicalWeekdayDemand,
  WF_DAYS, WF_DAY_NAMES, WF_SESSIONS,
} from '@/lib/workforce';

const SESSION_LABEL = { am: 'AM', pm: 'PM' };
const METRICS = [
  { id: 'net',      label: 'Net clinical' },
  { id: 'rostered', label: 'Sessions worked' },
  { id: 'duty',     label: 'Duty cover' },
  { id: 'ratio',    label: 'Demand ratio' },
];

// ─── colour helpers ─────────────────────────────────────────────────────
const C = {
  green:  { bg: '#10b981', text: '#fff' },
  teal:   { bg: '#0ea5e9', text: '#fff' },
  amber:  { bg: '#f59e0b', text: '#1e293b' },
  red:    { bg: '#ef4444', text: '#fff' },
  none:   { bg: 'rgba(255,255,255,0.06)', text: '#94a3b8' },
};
function capacityColour(v, max) {
  if (max <= 0) return C.none;
  const t = v / max;
  if (v <= 0) return C.red;
  if (t >= 0.66) return C.green;
  if (t >= 0.4) return C.teal;
  if (t >= 0.25) return C.amber;
  return C.red;
}
function dutyColour(v) {
  if (v <= 0) return C.red;
  if (v === 1) return C.amber;
  if (v === 2) return C.teal;
  return C.green;
}
function ratioColour(v, min, max) {
  if (v == null) return C.none;
  if (max <= min) return C.teal;
  const t = (v - min) / (max - min); // higher ratio = more stretched = worse
  if (t <= 0.33) return C.green;
  if (t <= 0.66) return C.amber;
  return C.red;
}

export default function WorkforcePlanner({ data, toast }) {
  const supabase = useMemo(() => createClient(), []);
  const v4 = data?._v4 || {};
  const practiceId = v4.practiceId;
  const listSize = v4.practiceListSize;
  const demandSettings = v4.demandSettings;

  const clinicians = useMemo(() => {
    const raw = data?.clinicians;
    const arr = Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
    return arr.filter(c => c && c.status !== 'left');
  }, [data?.clinicians]);

  const [patternById, setPatternById] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metric, setMetric] = useState('net');
  const [openCell, setOpenCell] = useState(null); // { day, session }
  const [editor, setEditor] = useState(null);      // 'deductions' | 'duty' | null

  // ─── Load roster + config ───────────────────────────────────────────
  useEffect(() => {
    if (!practiceId) { setError('No practice selected.'); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      const [patternsRes, settingsRes] = await Promise.all([
        supabase
          .from('working_patterns')
          .select('clinician_id, pattern, clinicians!inner(practice_id)')
          .eq('clinicians.practice_id', practiceId)
          .is('effective_to', null),
        supabase
          .from('practice_settings')
          .select('workforce')
          .eq('practice_id', practiceId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (patternsRes.error) { setError(patternsRes.error.message); setLoading(false); return; }
      const byId = {};
      for (const r of patternsRes.data || []) byId[r.clinician_id] = r.pattern || {};
      const wf = settingsRes.data?.workforce || {};
      setPatternById(byId);
      setConfig({
        maxOff: Number.isFinite(wf.maxOff) ? wf.maxOff : 2,
        holidayOn: wf.holidayOn !== false,
        weeklyTotal: wf.weeklyTotal ?? null,
        dutyEligibleIds: Array.isArray(wf.dutyEligibleIds) ? wf.dutyEligibleIds : [],
        deductions: Array.isArray(wf.deductions) ? wf.deductions : [],
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [practiceId, supabase]);

  // ─── Model ──────────────────────────────────────────────────────────
  const model = useMemo(() => {
    if (!patternById || !config) return null;
    return buildWorkforceModel({ clinicians, patternById, config, demandSettings, listSize });
  }, [clinicians, patternById, config, demandSettings, listSize]);

  const modelDemand = useMemo(
    () => typicalWeekdayDemand(demandSettings, listSize),
    [demandSettings, listSize]
  );

  // Heatmap colour scaling references.
  const scale = useMemo(() => {
    if (!model) return { capMax: 1, ratioMin: 0, ratioMax: 1 };
    let capMax = 0; const ratios = [];
    for (const day of WF_DAYS) {
      for (const s of WF_SESSIONS) {
        capMax = Math.max(capMax, model.grid[day][s][metric === 'rostered' ? 'rostered' : 'net']);
      }
      const r = model.perDay[day].demandRatio;
      if (r != null) ratios.push(r);
    }
    return {
      capMax: capMax || 1,
      ratioMin: ratios.length ? Math.min(...ratios) : 0,
      ratioMax: ratios.length ? Math.max(...ratios) : 1,
    };
  }, [model, metric]);

  // ─── Config mutators ────────────────────────────────────────────────
  const update = useCallback((patch) => {
    setConfig(c => ({ ...c, ...patch }));
    setDirty(true);
  }, []);

  const toggleDuty = (id) => {
    setConfig(c => {
      const set = new Set(c.dutyEligibleIds);
      set.has(id) ? set.delete(id) : set.add(id);
      return { ...c, dutyEligibleIds: [...set] };
    });
    setDirty(true);
  };

  const addDeduction = () => {
    const firstId = clinicians[0]?.id || '';
    update({ deductions: [...config.deductions, {
      id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      clinicianId: firstId, day: 'wed', session: 'am', amount: 1, label: '',
    }] });
  };
  const updateDeduction = (id, patch) => {
    update({ deductions: config.deductions.map(d => d.id === id ? { ...d, ...patch } : d) });
  };
  const removeDeduction = (id) => {
    update({ deductions: config.deductions.filter(d => d.id !== id) });
  };

  const save = async () => {
    if (!practiceId) return;
    setSaving(true);
    const { error: err } = await supabase
      .from('practice_settings')
      .upsert({ practice_id: practiceId, workforce: config }, { onConflict: 'practice_id' });
    setSaving(false);
    if (err) { toast?.(`Couldn't save: ${err.message}`, 'error'); return; }
    setDirty(false);
    toast?.('Workforce plan saved', 'success');
  };

  // ─── Render ───────────────────────────────────────────────────────────
  if (loading) return <div style={S.card}><p style={S.muted}>Loading roster…</p></div>;
  if (error) return <div style={S.card}><p style={S.muted}>Couldn't load: {error}</p></div>;
  if (!model) return <div style={S.card}><p style={S.muted}>No roster data yet.</p></div>;

  const clinName = (id) => clinicians.find(c => c.id === id)?.name || 'Unknown';

  // Thinnest net session (headline)
  let thin = null;
  for (const day of WF_DAYS) for (const s of WF_SESSIONS) {
    const v = model.grid[day][s].net;
    if (thin == null || v < thin.v) thin = { day, s, v };
  }
  // Most-stretched day by ratio
  let stretched = null;
  for (const day of WF_DAYS) {
    const r = model.perDay[day].demandRatio;
    if (r != null && (stretched == null || r > stretched.r)) stretched = { day, r };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#f1f5f9', fontFamily: "'Outfit', sans-serif" }}>Workforce planner</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8', maxWidth: 620, lineHeight: 1.5 }}>
            Real clinical capacity per session — rostered clinicians minus non-clinical activities and a holiday
            allowance — set against your demand model. Mid-week is where capacity and demand most often diverge.
          </p>
        </div>
        <button onClick={save} disabled={!dirty || saving} style={{
          ...S.btnPrimary, opacity: dirty && !saving ? 1 : 0.45, cursor: dirty && !saving ? 'pointer' : 'default',
        }}>
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      {/* Headline cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <HeadlineCard label="Net clinical sessions / week" value={model.totals.net} sub={`${model.totals.rostered} rostered before deductions`} />
        <HeadlineCard label="Modelled demand / week" value={model.demand.weeklyTotal} sub="requests, from your demand model" />
        <HeadlineCard label="Thinnest session" value={thin ? `${WF_DAY_NAMES[thin.day].slice(0,3)} ${SESSION_LABEL[thin.s]}` : '–'} sub={thin ? `${thin.v} net clinical` : ''} accent={C.amber.bg} />
        <HeadlineCard label="Most stretched day" value={stretched ? WF_DAY_NAMES[stretched.day] : '–'} sub={stretched ? `${stretched.r.toFixed(0)} requests / session` : ''} accent={C.red.bg} />
      </div>

      {/* Controls */}
      <div style={{ ...S.card, display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 8 }}>
          {METRICS.map(m => (
            <button key={m.id} onClick={() => setMetric(m.id)} style={{
              ...S.toggle, background: metric === m.id ? '#6366f1' : 'transparent', color: metric === m.id ? '#fff' : '#94a3b8',
            }}>{m.label}</button>
          ))}
        </div>

        <label style={S.ctrlRow}>
          <input type="checkbox" checked={config.holidayOn} onChange={e => update({ holidayOn: e.target.checked })} />
          <span>Holiday allowance</span>
        </label>

        <label style={S.ctrlRow}>
          <span>Max clinicians off / session</span>
          <input type="number" min={0} max={20} value={config.maxOff}
            onChange={e => update({ maxOff: Math.max(0, parseInt(e.target.value || '0', 10)) })}
            style={S.numInput} />
        </label>

        <label style={{ ...S.ctrlRow, flex: 1, minWidth: 220 }}>
          <span style={{ whiteSpace: 'nowrap' }}>Weekly demand</span>
          <input type="range" min={Math.round(modelDemand.weeklyTotal * 0.5)} max={Math.round(modelDemand.weeklyTotal * 1.6)}
            value={config.weeklyTotal ?? modelDemand.weeklyTotal}
            onChange={e => update({ weeklyTotal: parseInt(e.target.value, 10) })}
            style={{ flex: 1 }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: '#e2e8f0', minWidth: 38, textAlign: 'right' }}>{model.demand.weeklyTotal}</span>
          {config.weeklyTotal != null && (
            <button onClick={() => update({ weeklyTotal: null })} style={S.linkBtn} title="Reset to model">reset</button>
          )}
        </label>
      </div>

      {/* Heatmap */}
      <div style={S.card}>
        <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(5, 1fr)', gap: 8 }}>
          <div />
          {WF_DAYS.map(day => (
            <div key={day} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#cbd5e1', paddingBottom: 2 }}>
              {WF_DAY_NAMES[day].slice(0, 3)}
              <div style={{ fontSize: 10.5, fontWeight: 400, color: ratioColour(model.perDay[day].demandRatio, scale.ratioMin, scale.ratioMax).bg }}>
                {model.perDay[day].demandRatio != null ? `${model.perDay[day].demandRatio.toFixed(0)}/sess` : '–'}
              </div>
            </div>
          ))}

          {WF_SESSIONS.map(session => (
            <FragmentRow key={session} session={session}>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{SESSION_LABEL[session]}</div>
              {WF_DAYS.map(day => {
                const cell = model.grid[day][session];
                const dayInfo = model.perDay[day];
                let col, big;
                if (metric === 'ratio') { col = ratioColour(dayInfo.demandRatio, scale.ratioMin, scale.ratioMax); big = dayInfo.demandRatio != null ? dayInfo.demandRatio.toFixed(0) : '–'; }
                else if (metric === 'duty') { col = dutyColour(cell.dutyRostered); big = cell.dutyRostered; }
                else if (metric === 'rostered') { col = capacityColour(cell.rostered, scale.capMax); big = cell.rostered; }
                else { col = capacityColour(cell.net, scale.capMax); big = cell.net; }
                const isOpen = openCell && openCell.day === day && openCell.session === session;
                return (
                  <button key={day} onClick={() => setOpenCell(isOpen ? null : { day, session })} style={{
                    background: col.bg, color: col.text, border: isOpen ? '2px solid #fff' : '2px solid transparent',
                    borderRadius: 10, padding: '10px 6px', cursor: 'pointer', textAlign: 'center', transition: 'transform 0.1s',
                    fontFamily: 'inherit',
                  }}>
                    <div style={{ fontSize: 19, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{big}</div>
                    <div style={{ fontSize: 9.5, opacity: 0.85, marginTop: 1 }}>
                      {metric === 'ratio' ? 'req/sess' : `ratio ${dayInfo.demandRatio != null ? dayInfo.demandRatio.toFixed(0) : '–'}`}
                    </div>
                  </button>
                );
              })}
            </FragmentRow>
          ))}
        </div>
        <Legend metric={metric} />
      </div>

      {/* Cell detail */}
      {openCell && (
        <CellDetail
          cell={model.grid[openCell.day][openCell.session]}
          dayInfo={model.perDay[openCell.day]}
          day={openCell.day} session={openCell.session}
          holidayOn={config.holidayOn} maxOff={config.maxOff}
          clinName={clinName}
          onClose={() => setOpenCell(null)}
        />
      )}

      {/* Editors */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setEditor(editor === 'deductions' ? null : 'deductions')} style={editor === 'deductions' ? S.btnPrimary : S.btnGhost}>
          Other activities ({config.deductions.length})
        </button>
        <button onClick={() => setEditor(editor === 'duty' ? null : 'duty')} style={editor === 'duty' ? S.btnPrimary : S.btnGhost}>
          Duty eligibility ({config.dutyEligibleIds.length})
        </button>
      </div>

      {editor === 'deductions' && (
        <DeductionsEditor
          deductions={config.deductions} clinicians={clinicians}
          onAdd={addDeduction} onUpdate={updateDeduction} onRemove={removeDeduction}
        />
      )}
      {editor === 'duty' && (
        <DutyEditor clinicians={clinicians} dutyIds={config.dutyEligibleIds} onToggle={toggleDuty} />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────
function FragmentRow({ children }) { return <>{children}</>; }

function HeadlineCard({ label, value, sub, accent }) {
  return (
    <div style={{ ...S.card, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || '#f1f5f9', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Legend({ metric }) {
  const items = metric === 'ratio'
    ? [['Lower demand / session', C.green.bg], ['Mid', C.amber.bg], ['Most stretched', C.red.bg]]
    : metric === 'duty'
    ? [['0 duty-eligible', C.red.bg], ['1', C.amber.bg], ['2', C.teal.bg], ['3+', C.green.bg]]
    : [['Healthy', C.green.bg], ['OK', C.teal.bg], ['Tight', C.amber.bg], ['Thin / none', C.red.bg]];
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
      {items.map(([label, bg]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: bg }} />{label}
        </div>
      ))}
    </div>
  );
}

function CellDetail({ cell, dayInfo, day, session, holidayOn, maxOff, clinName, onClose }) {
  return (
    <div style={{ ...S.card, borderColor: 'rgba(99,102,241,0.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, color: '#f1f5f9' }}>{WF_DAY_NAMES[day]} {SESSION_LABEL[session]}</h3>
        <button onClick={onClose} style={S.linkBtn}>close</button>
      </div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>
        {cell.rostered} rostered − {cell.deductionTotal} activities − {holidayOn ? maxOff : 0} holiday = <strong style={{ color: cell.net > 0 ? '#10b981' : '#ef4444' }}>{cell.net} net</strong>
        {dayInfo.demandRatio != null && <span style={{ color: '#94a3b8' }}>  ·  {dayInfo.demand} requests that day → {dayInfo.demandRatio.toFixed(1)} per net session</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div>
          <div style={S.detailHead}>Rostered ({cell.rostered})</div>
          {cell.rosteredClinicians.length === 0 ? <div style={S.muted}>Nobody rostered.</div> :
            cell.rosteredClinicians.map(c => (
              <div key={c.id} style={{ fontSize: 12.5, color: '#e2e8f0', padding: '2px 0' }}>
                {c.name} <span style={{ color: '#64748b' }}>· {c.role || 'no role'}</span>
                {c.duty && <span style={{ color: '#818cf8', marginLeft: 6, fontSize: 11 }}>duty-eligible</span>}
              </div>
            ))}
        </div>
        <div>
          <div style={S.detailHead}>Other activities ({cell.deductions.length})</div>
          {cell.deductions.length === 0 ? <div style={S.muted}>None this session.</div> :
            cell.deductions.map(d => (
              <div key={d.id} style={{ fontSize: 12.5, color: '#e2e8f0', padding: '2px 0' }}>
                {d.label || 'Activity'} <span style={{ color: '#64748b' }}>· {clinName(d.clinicianId)} · −{d.amount}</span>
              </div>
            ))}
          <div style={{ ...S.detailHead, marginTop: 10 }}>Duty cover</div>
          <div style={{ fontSize: 12.5, color: cell.dutyRostered > 0 ? '#e2e8f0' : '#ef4444' }}>{cell.dutyRostered} duty-eligible clinician{cell.dutyRostered === 1 ? '' : 's'} present</div>
        </div>
      </div>
    </div>
  );
}

function DeductionsEditor({ deductions, clinicians, onAdd, onUpdate, onRemove }) {
  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, color: '#f1f5f9' }}>Other (non-clinical) activities</h3>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>Teaching, admin, branch visits — each removes a clinician from a specific session.</p>
        </div>
        <button onClick={onAdd} style={S.btnGhost}>+ Add</button>
      </div>
      {deductions.length === 0 ? <p style={S.muted}>No activities yet — clinical capacity equals the full roster.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {deductions.map(d => (
            <div key={d.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <select value={d.clinicianId} onChange={e => onUpdate(d.id, { clinicianId: e.target.value })} style={S.select}>
                {clinicians.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={d.day} onChange={e => onUpdate(d.id, { day: e.target.value })} style={S.select}>
                {WF_DAYS.map(day => <option key={day} value={day}>{WF_DAY_NAMES[day].slice(0,3)}</option>)}
              </select>
              <select value={d.session} onChange={e => onUpdate(d.id, { session: e.target.value })} style={S.select}>
                <option value="am">AM</option><option value="pm">PM</option><option value="both">Both</option>
              </select>
              <input type="number" min={0} max={1} step={0.5} value={d.amount} onChange={e => onUpdate(d.id, { amount: parseFloat(e.target.value) || 0 })} style={{ ...S.numInput, width: 56 }} title="Sessions removed" />
              <input type="text" value={d.label} placeholder="Label (e.g. Teaching)" onChange={e => onUpdate(d.id, { label: e.target.value })} style={{ ...S.textInput, flex: 1, minWidth: 120 }} />
              <button onClick={() => onRemove(d.id)} style={S.linkBtn}>remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DutyEditor({ clinicians, dutyIds, onToggle }) {
  const set = new Set(dutyIds);
  return (
    <div style={S.card}>
      <h3 style={{ margin: '0 0 3px', fontSize: 15, color: '#f1f5f9' }}>Duty-doctor eligibility</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>Who can hold the duty slot. Used for the duty-cover view. Verify against current reality — these were seeded from history.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
        {clinicians.map(c => {
          const on = set.has(c.id);
          return (
            <button key={c.id} onClick={() => onToggle(c.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              textAlign: 'left', fontFamily: 'inherit',
              border: `1px solid ${on ? '#818cf8' : 'rgba(255,255,255,0.1)'}`,
              background: on ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
            }}>
              <span style={{ color: on ? '#818cf8' : '#475569' }}>{on ? '✓' : '○'}</span>
              <span style={{ fontSize: 12.5, color: on ? '#c7d2fe' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────
const S = {
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 },
  muted: { fontSize: 13, color: '#94a3b8', margin: 0 },
  btnPrimary: { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  toggle: { border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  ctrlRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#cbd5e1' },
  numInput: { width: 56, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e2e8f0', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit' },
  textInput: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e2e8f0', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit' },
  select: { background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e2e8f0', padding: '5px 8px', fontSize: 12.5, fontFamily: 'inherit' },
  linkBtn: { background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', padding: 0, textDecoration: 'underline' },
  detailHead: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
};
