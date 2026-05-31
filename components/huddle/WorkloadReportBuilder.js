'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  buildFacts, buildSessionFacts, runReport, collectGroupFacts, describeMeasure, isTimeDimension,
  PRESET_GROUPS, groupByOptionsForGrain, splitByOptionsForGrain, RANGE_OPTIONS,
  buildFilterOptions,
} from '@/lib/workload-report';
import { createClient } from '@/utils/supabase/client';
import { canEditPracticeData } from '@/lib/permissions';

const STATUS_OPTS = [
  { id: 'available', label: 'Available', colour: '#10b981' },
  { id: 'embargoed', label: 'Embargoed', colour: '#f59e0b' },
  { id: 'booked', label: 'Booked', colour: '#ef4444' },
];
const CATEGORY_OPTS = [
  { id: 'urgent', label: 'Urgent', colour: '#ef4444' },
  { id: 'routine', label: 'Routine', colour: '#10b981' },
  { id: 'other', label: 'Other', colour: '#64748b' },
];
const KIND_OPTS = [
  { id: 'worked', label: 'Worked', colour: '#6366f1' },
  { id: 'duty', label: 'Duty', colour: '#ef4444' },
  { id: 'support', label: 'Support', colour: '#0ea5e9' },
];
const SESSION_OPTS = [
  { id: 'am', label: 'AM', colour: '#f59e0b' },
  { id: 'pm', label: 'PM', colour: '#6366f1' },
];
const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#a78bfa','#ec4899','#14b8a6','#f97316','#84cc16'];

function ChipGroup({ options, selected, onChange, allLabel = 'Any', allowAll = true }) {
  const toggle = (id) => {
    const set = new Set(selected || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange(Array.from(set));
  };
  const none = !selected || selected.length === 0;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {allowAll && (
        <button onClick={() => onChange([])} className="text-[10px] px-2 py-1 rounded-md"
          style={{ background: none ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)', border: `1px solid ${none ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`, color: none ? '#c7d2fe' : '#94a3b8' }}>{allLabel}</button>
      )}
      {options.map(o => {
        const on = (selected || []).includes(o.id);
        return (
          <button key={o.id} onClick={() => toggle(o.id)} className="text-[10px] px-2 py-1 rounded-md flex items-center gap-1"
            style={{ background: on ? `${o.colour}28` : 'rgba(255,255,255,0.04)', border: `1px solid ${on ? `${o.colour}88` : 'rgba(255,255,255,0.08)'}`, color: on ? '#e2e8f0' : '#94a3b8' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.colour, opacity: on ? 1 : 0.4 }} />{o.label}
          </button>
        );
      })}
    </div>
  );
}

function Segmented({ options, value, onChange, disabledIds = [] }) {
  return (
    <div className="flex flex-wrap" style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: 2, gap: 2 }}>
      {options.map(o => {
        const active = value === o.id, disabled = disabledIds.includes(o.id);
        return (
          <button key={o.id} disabled={disabled} onClick={() => !disabled && onChange(o.id)} className="text-[11px] font-medium px-2.5 py-1 rounded"
            style={{ background: active ? 'rgba(99,102,241,0.9)' : 'transparent', color: disabled ? '#475569' : active ? 'white' : '#94a3b8', cursor: disabled ? 'not-allowed' : 'pointer' }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// Collapsible searchable multi-select for large lists (clinicians, slot types).
function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = selected || [];
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (id) => {
    const s = new Set(sel);
    if (s.has(id)) s.delete(id); else s.add(id);
    onChange(Array.from(s));
  };
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-[11px] rounded-md px-2 py-1.5"
        style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${sel.length ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`, color: '#e2e8f0' }}>
        <span>{label}{sel.length ? ` · ${sel.length}` : ''}</span>
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-1 rounded-md p-2 space-y-1" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-1">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="flex-1 text-[10px] rounded px-2 py-1"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
            {sel.length > 0 && <button onClick={() => onChange([])} className="text-[10px] text-slate-400 px-1">Clear</button>}
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {filtered.map(o => {
              const on = sel.includes(o.id);
              return (
                <label key={o.id} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-white/5">
                  <input type="checkbox" checked={on} onChange={() => toggle(o.id)} className="accent-indigo-500" />
                  <span className="text-[10px] text-slate-300 truncate">{o.label}</span>
                </label>
              );
            })}
            {filtered.length === 0 && <div className="text-[10px] text-slate-600 px-1 py-1">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function PanelSection({ title, children, right }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

// Numbered step header — gives the panel a guided, top-to-bottom feel.
function StepSection({ n, title, children, right }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center text-[9px] font-bold rounded-full" style={{ width: 16, height: 16, background: 'rgba(99,102,241,0.25)', color: '#c7d2fe' }}>{n}</span>
          <span className="text-[11px] font-semibold text-slate-200">{title}</span>
        </div>
        {right}
      </div>
      <div className="pl-[24px] space-y-2">{children}</div>
    </div>
  );
}

// Collapsible block with a count badge — keeps the panel from feeling dense.
function Collapsible({ title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 text-[11px] font-semibold text-slate-300" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span className="text-slate-500">{open ? '▾' : '▸'}</span>
        <span>{title}</span>
        {badge ? <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.25)', color: '#c7d2fe' }}>{badge}</span> : null}
      </button>
      {open && <div className="mt-2 pl-[18px] space-y-2.5">{children}</div>}
    </div>
  );
}

export default function WorkloadReportBuilder({ data, huddleData }) {
  const hs = data?.huddleSettings || {};
  const canEdit = canEditPracticeData(data);
  const practiceId = data?._v4?.practiceId || null;
  const userId = data?._v4?.userId || null;
  const clinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left').map(c => ({ id: c.id, name: c.name, role: c.role || 'Unspecified' }));
  }, [data?.clinicians]);

  const slotData = useMemo(() => buildFacts(huddleData, clinicians, hs), [huddleData, clinicians, hs]);
  const sessionData = useMemo(() => buildSessionFacts(huddleData, clinicians, hs), [huddleData, clinicians, hs]);
  const filterOpts = useMemo(() => buildFilterOptions(clinicians, slotData), [clinicians, slotData]);

  // Config state.
  const [grain, setGrain] = useState('sessions');
  const [num, setNum] = useState({ statuses: [], categories: [], kinds: ['duty'], sessions: [] });
  const [denomMode, setDenomMode] = useState('group');   // none | group | total | custom
  const [denom, setDenom] = useState({ statuses: ['available','embargoed','booked'], categories: [], kinds: ['worked'], sessions: [] });
  const [groupBy, setGroupBy] = useState('clinician');
  const [splitBy, setSplitBy] = useState('none');
  const [range, setRange] = useState('last8next8');
  const [chart, setChart] = useState('bars');
  const [globalFilter, setGlobalFilter] = useState({ clinicianIds: [], roles: [], locations: [], slotTypes: [], sessions: [] });
  const [excludeSystem, setExcludeSystem] = useState(true);
  const [sort, setSort] = useState('value');
  const [topN, setTopN] = useState(0);          // 0 = all
  const [refOn, setRefOn] = useState(true);
  const [refMode, setRefMode] = useState('auto'); // auto | custom
  const [refCustom, setRefCustom] = useState('');

  // Saved reports (persisted per practice).
  const [savedReports, setSavedReports] = useState([]);
  const [savingReport, setSavingReport] = useState(false);
  const [newReportName, setNewReportName] = useState('');
  const [showSaveBox, setShowSaveBox] = useState(false);

  // Drill-down modal: { groupKey, groupLabel, seriesKey, facts } | null
  const [drill, setDrill] = useState(null);

  useEffect(() => {
    if (!practiceId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: rows, error } = await supabase
          .from('saved_reports')
          .select('id, name, config, updated_at')
          .eq('practice_id', practiceId)
          .order('created_at', { ascending: true });
        if (!error && !cancelled && rows) setSavedReports(rows);
      } catch { /* table may not exist yet — fail silent */ }
    })();
    return () => { cancelled = true; };
  }, [practiceId]);

  // Apply an external config (from a saved report / preset object).
  const applyConfig = (c) => {
    if (!c) return;
    setGrain(c.grain || 'slots');
    setNum({ statuses: c.num?.statuses || [], categories: c.num?.categories || [], kinds: c.num?.kinds || ['worked'], sessions: c.num?.sessions || [] });
    // Back-compat: older configs used { denom: filter|null }; new ones use denomMode.
    const mode = c.denomMode || (c.denom ? 'custom' : 'none');
    setDenomMode(mode);
    if (c.denom) setDenom({ statuses: c.denom.statuses || ['available','embargoed','booked'], categories: c.denom.categories || [], kinds: c.denom.kinds || ['worked'], sessions: c.denom.sessions || [] });
    setGroupBy(c.groupBy || 'clinician');
    setSplitBy(c.splitBy || 'none');
    setRange(c.range || 'last8next8');
    setChart(c.chart || 'bars');
    setGlobalFilter({ clinicianIds: c.globalFilter?.clinicianIds || [], roles: c.globalFilter?.roles || [], locations: c.globalFilter?.locations || [], slotTypes: c.globalFilter?.slotTypes || [], sessions: c.globalFilter?.sessions || [] });
    if (typeof c.excludeSystem === 'boolean') setExcludeSystem(c.excludeSystem);
    if (typeof c.topN === 'number') setTopN(c.topN);
    if (c.sort) setSort(c.sort);
  };
  // applyConfig is also used by saved reports + presets below.

  const facts = grain === 'sessions' ? sessionData.facts : slotData.facts;
  const { dateMin, dateMax } = slotData;
  const isSession = grain === 'sessions';
  const groupByOpts = groupByOptionsForGrain(grain);
  const splitByOpts = splitByOptionsForGrain(grain);

  const config = useMemo(() => ({
    grain,
    num: isSession ? { kinds: num.kinds, sessions: num.sessions } : { statuses: num.statuses, categories: num.categories },
    denomMode,
    denom: denomMode === 'custom' ? (isSession ? { kinds: denom.kinds, sessions: denom.sessions } : { statuses: denom.statuses, categories: denom.categories }) : null,
    groupBy, splitBy, range,
    globalFilter, excludeSystem, sort, topN,
    chart,
  }), [grain, isSession, num, denomMode, denom, groupBy, splitBy, range, globalFilter, excludeSystem, sort, topN, chart]);

  const result = useMemo(() => runReport(facts, config), [facts, config]);

  // Keep groupBy / splitBy valid for the grain.
  useEffect(() => {
    if (!groupByOpts.map(o => o.id).includes(groupBy)) setGroupBy('clinician');
    if (!splitByOpts.map(o => o.id).includes(splitBy)) setSplitBy('none');
  }, [grain]); // eslint-disable-line

  const applyPreset = (p) => applyConfig({ ...p.config });

  // Save the current config as a named report.
  const saveReport = async () => {
    const name = newReportName.trim();
    if (!name || !practiceId || !canEdit) return;
    setSavingReport(true);
    try {
      const supabase = createClient();
      const { data: row, error } = await supabase
        .from('saved_reports')
        .upsert({ practice_id: practiceId, name, config, updated_by: userId }, { onConflict: 'practice_id,name' })
        .select('id, name, config, updated_at')
        .single();
      if (!error && row) {
        setSavedReports(prev => {
          const without = prev.filter(r => r.name !== row.name);
          return [...without, row];
        });
        setNewReportName('');
        setShowSaveBox(false);
      }
    } catch { /* ignore */ }
    finally { setSavingReport(false); }
  };

  const deleteReport = async (id) => {
    if (!practiceId || !canEdit) return;
    try {
      const supabase = createClient();
      await supabase.from('saved_reports').delete().eq('id', id);
      setSavedReports(prev => prev.filter(r => r.id !== id));
    } catch { /* ignore */ }
  };

  // Open the drill-down for a clicked group (and optional series).
  const openDrill = (groupKey, groupLabel, seriesKey = null, seriesLabel = '') => {
    const f = collectGroupFacts(facts, config, groupKey, seriesKey);
    setDrill({ groupKey, groupLabel, seriesKey, seriesLabel, facts: f });
  };

  const timeOk = isTimeDimension(groupBy);
  let effectiveChart = chart;
  if (effectiveChart === 'trend' && !timeOk) effectiveChart = 'bars';
  if (effectiveChart === 'stacked' && !result.hasSplit) effectiveChart = 'bars';

  if (!huddleData) {
    return (
      <div className="rounded-xl p-12 text-center" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="text-2xl mb-2">📊</div>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">No CSV data</h3>
        <p className="text-xs text-slate-400">Upload a huddle CSV on the Today page to build reports.</p>
      </div>
    );
  }

  const fmt = (v) => result.isRatio ? `${v.toFixed(1)}%` : `${Math.round(v)}`;
  const avg = result.groups.length ? result.groups.reduce((s, g) => s + g.value, 0) / result.groups.length : 0;

  // Reference line.
  let refValue = null, refLabel = '';
  if (refOn) {
    if (refMode === 'custom' && refCustom !== '' && !isNaN(parseFloat(refCustom))) {
      refValue = parseFloat(refCustom); refLabel = `Target ${fmt(refValue)}`;
    } else if (result.isRatio) {
      refValue = result.totalValue; refLabel = `Fair share ${fmt(refValue)}`;
    } else {
      refValue = avg; refLabel = `Average ${fmt(avg)}`;
    }
  }
  const maxVal = Math.max(...result.groups.map(g => g.value), result.isRatio ? 100 : 1, refValue || 0);

  const usesDutySupport = isSession && ((num.kinds || []).some(k => k === 'duty' || k === 'support') || (denomMode === 'custom' && (denom.kinds || []).some(k => k === 'duty' || k === 'support')));
  const dutyMissing = usesDutySupport && !sessionData.hasDuty;
  const filterCount = ['clinicianIds','roles','locations','slotTypes','sessions'].reduce((n, k) => n + (globalFilter[k]?.length || 0), 0);

  // Auto-insight: a one-line takeaway.
  const insight = useMemo(() => {
    if (!result.groups.length || result.hasSplit) return null;
    const sorted = [...result.groups].sort((a, b) => b.value - a.value);
    const top = sorted[0];
    if (!top || top.value <= 0) return null;
    if (result.isRatio) {
      const ratio = avg > 0 ? top.value / avg : 0;
      if (ratio >= 1.4) return `${top.label} carries the highest ${describeMeasure(config).split(' ÷')[0]} at ${fmt(top.value)} — about ${ratio.toFixed(1)}× the group average of ${fmt(avg)}.`;
    } else {
      const share = result.totalNum > 0 ? (top.numerator / result.totalNum) * 100 : 0;
      if (share >= 25) return `${top.label} accounts for ${share.toFixed(0)}% of the total (${fmt(top.value)} of ${result.totalNum}).`;
    }
    return null;
  }, [result, avg, config]); // eslint-disable-line

  // Export.
  const buildRows = () => {
    const header = ['Group'];
    if (result.hasSplit) result.series.forEach(s => header.push(s.label || 'Series'));
    else header.push(result.isRatio ? 'Percentage' : 'Count');
    if (result.isRatio && !result.hasSplit) { header.push('Numerator', 'Denominator'); }
    const rows = result.groups.map(g => {
      const r = [g.label];
      if (result.hasSplit) result.series.forEach(s => r.push(result.isRatio ? g.cells[s.key].value.toFixed(1) : g.cells[s.key].value));
      else { r.push(result.isRatio ? g.value.toFixed(1) : g.value); if (result.isRatio) r.push(g.numerator, g.denominator); }
      return r;
    });
    return [header, ...rows];
  };
  const copyTable = () => {
    const tsv = buildRows().map(r => r.join('\t')).join('\n');
    navigator.clipboard?.writeText(tsv);
  };
  const downloadCsv = () => {
    const csv = buildRows().map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `workload-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* MAIN */}
      <div className="flex-1 min-w-0 w-full rounded-xl p-5" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-slate-100 leading-snug">
              {describeMeasure(config)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              by <span className="text-indigo-300">{groupByOpts.find(o => o.id === groupBy)?.label.toLowerCase()}</span>
              {result.hasSplit && <> · split by <span className="text-indigo-300">{splitByOpts.find(o => o.id === splitBy)?.label.toLowerCase()}</span></>}
              {' · '}<span className="text-slate-300">{RANGE_OPTIONS.find(o => o.id === range)?.label.toLowerCase()}</span>
              {filterCount > 0 && <> · <span className="text-amber-300">{filterCount} filter{filterCount === 1 ? '' : 's'} applied</span></>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right mr-1"><div className="text-[10px] text-slate-500 leading-none">Overall</div><div className="text-lg font-bold text-indigo-300 leading-tight">{fmt(result.totalValue)}</div></div>
            <button onClick={copyTable} className="text-[10px] px-2 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>Copy</button>
            <button onClick={downloadCsv} className="text-[10px] px-2 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>CSV</button>
          </div>
        </div>

        {insight && <div className="mb-4 text-[11px] text-amber-200/90 rounded-lg px-3 py-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>💡 {insight}</div>}

        {dutyMissing ? (
          <p className="text-sm text-slate-400 text-center py-8">Duty doctor slot not configured. Set a duty slot type in the Today page filter to enable duty &amp; support session reports.</p>
        ) : result.groups.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No data matches. Widen the date range, relax the filters, or turn off &ldquo;exclude system rows&rdquo;.</p>
        ) : effectiveChart === 'table' ? (
          <TableView result={result} groupLabel={groupByOpts.find(o => o.id === groupBy)?.label} fmt={fmt} onPick={openDrill} />
        ) : effectiveChart === 'trend' ? (
          <TrendView result={result} fmt={fmt} isRatio={result.isRatio} refValue={refValue} refLabel={refLabel} maxVal={maxVal} onPick={openDrill} />
        ) : effectiveChart === 'stacked' ? (
          <StackedView result={result} fmt={fmt} onPick={openDrill} />
        ) : (
          <BarsView result={result} fmt={fmt} maxVal={maxVal} isRatio={result.isRatio} refValue={refValue} refLabel={refLabel} onPick={openDrill} />
        )}
      </div>

      {/* RIGHT CONTROLS */}
      <div className="w-full lg:w-80 lg:flex-shrink-0 rounded-xl p-4 space-y-5" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <PanelSection title="Quick reports" right={
          canEdit ? <button onClick={() => setShowSaveBox(s => !s)} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}>+ Save</button> : null
        }>
          {showSaveBox && canEdit && (
            <div className="flex items-center gap-1 mb-2">
              <input value={newReportName} onChange={e => setNewReportName(e.target.value)} placeholder="Report name…" className="flex-1 text-[10px] rounded px-2 py-1"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
              <button onClick={saveReport} disabled={savingReport || !newReportName.trim()} className="text-[10px] px-2 py-1 rounded"
                style={{ background: '#10b981', color: '#06281e', border: 'none', opacity: (savingReport || !newReportName.trim()) ? 0.5 : 1 }}>{savingReport ? '…' : 'Save'}</button>
            </div>
          )}
          {savedReports.length > 0 && (
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-wide text-emerald-600/80 mb-1">My saved reports</div>
              <div className="flex flex-wrap gap-1.5">
                {savedReports.map(r => (
                  <span key={r.id} className="flex items-center text-[10px] rounded-md overflow-hidden" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                    <button onClick={() => applyConfig(r.config)} className="px-2 py-1" style={{ color: '#6ee7b7', background: 'none', border: 'none' }}>{r.name}</button>
                    {canEdit && <button onClick={() => deleteReport(r.id)} title="Delete" className="px-1.5 py-1 text-emerald-700/70 hover:text-red-400" style={{ background: 'rgba(0,0,0,0.15)', border: 'none' }}>×</button>}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
            {PRESET_GROUPS.map(g => (
              <div key={g.group}>
                <div className="text-[9px] uppercase tracking-wide text-slate-600 mb-1">{g.group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.presets.map(p => (
                    <button key={p.id} onClick={() => applyPreset(p)} className="text-[10px] px-2 py-1 rounded-md text-left"
                      style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#c7d2fe' }}>{p.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PanelSection>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* ① Measure */}
        <StepSection n="1" title="Measure">
          <Segmented options={[{ id: 'slots', label: 'Slots' }, { id: 'sessions', label: 'Sessions' }]} value={grain} onChange={setGrain} />
          <p className="text-[9px] text-slate-600 leading-snug">{isSession ? 'A session = one clinician working an AM or PM.' : 'A slot = one appointment slot.'}</p>
          <div className="text-[9px] text-slate-500 font-medium mt-1">Count {isSession ? 'sessions' : 'slots'} that are…</div>
          {isSession ? (
            <>
              <ChipGroup options={KIND_OPTS} selected={num.kinds} onChange={(v) => setNum(n => ({ ...n, kinds: v.length ? v : ['worked'] }))} allowAll={false} />
              <ChipGroup options={SESSION_OPTS} selected={num.sessions} onChange={(v) => setNum(n => ({ ...n, sessions: v }))} allLabel="AM+PM" />
            </>
          ) : (
            <>
              <div className="text-[9px] text-slate-600">Status</div>
              <ChipGroup options={STATUS_OPTS} selected={num.statuses} onChange={(v) => setNum(n => ({ ...n, statuses: v }))} />
              <div className="text-[9px] text-slate-600">Category</div>
              <ChipGroup options={CATEGORY_OPTS} selected={num.categories} onChange={(v) => setNum(n => ({ ...n, categories: v }))} />
            </>
          )}
          {/* Show as — the denominator */}
          <div className="text-[9px] text-slate-500 font-medium mt-2">Show as</div>
          <select value={denomMode} onChange={e => setDenomMode(e.target.value)} className="w-full text-[11px] rounded-md px-2 py-1.5"
            style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }}>
            <option value="none" style={{ background: '#1e293b' }}>Count (raw number)</option>
            <option value="group" style={{ background: '#1e293b' }}>% of each group&rsquo;s total</option>
            <option value="total" style={{ background: '#1e293b' }}>% of overall total (share)</option>
            <option value="custom" style={{ background: '#1e293b' }}>% of a custom subset…</option>
          </select>
          <p className="text-[9px] text-slate-600 leading-snug">
            {denomMode === 'group' && `Each ${isSession ? 'clinician/group' : 'group'} as a rate — e.g. booked ÷ all that group's slots = fill rate.`}
            {denomMode === 'total' && 'Each group as a share of the whole report. Shares add up to 100%.'}
            {denomMode === 'custom' && 'Divide by your own subset, defined below.'}
            {denomMode === 'none' && 'Plain counts.'}
          </p>
          {denomMode === 'custom' && (
            <div className="mt-1 pl-3 space-y-2" style={{ borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
              <div className="text-[9px] text-slate-600">…as a % of {isSession ? 'sessions' : 'slots'} that are:</div>
              {isSession ? (
                <>
                  <ChipGroup options={KIND_OPTS} selected={denom.kinds} onChange={(v) => setDenom(d => ({ ...d, kinds: v.length ? v : ['worked'] }))} allowAll={false} />
                  <ChipGroup options={SESSION_OPTS} selected={denom.sessions} onChange={(v) => setDenom(d => ({ ...d, sessions: v }))} allLabel="AM+PM" />
                </>
              ) : (
                <>
                  <div className="text-[9px] text-slate-600">Status</div>
                  <ChipGroup options={STATUS_OPTS} selected={denom.statuses} onChange={(v) => setDenom(d => ({ ...d, statuses: v }))} />
                  <div className="text-[9px] text-slate-600">Category</div>
                  <ChipGroup options={CATEGORY_OPTS} selected={denom.categories} onChange={(v) => setDenom(d => ({ ...d, categories: v }))} />
                </>
              )}
            </div>
          )}
        </StepSection>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* ② Break down */}
        <StepSection n="2" title="Break down">
          <div className="text-[9px] text-slate-600">Group by (bars / rows)</div>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="w-full text-[11px] rounded-md px-2 py-1.5"
            style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }}>
            {groupByOpts.map(o => <option key={o.id} value={o.id} style={{ background: '#1e293b' }}>{o.label}</option>)}
          </select>
          <div className="text-[9px] text-slate-600 mt-1">Compare by (splits into series)</div>
          <select value={splitBy} onChange={e => setSplitBy(e.target.value)} className="w-full text-[11px] rounded-md px-2 py-1.5"
            style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }}>
            {splitByOpts.filter(o => o.id !== groupBy).map(o => <option key={o.id} value={o.id} style={{ background: '#1e293b' }}>{o.label}</option>)}
          </select>
        </StepSection>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* ③ Filter (collapsible) */}
        <StepSection n="3" title="Filter">
          <Collapsible title="Narrow the data" badge={filterCount || null} defaultOpen={filterCount > 0}>
            <MultiSelect label="Clinicians" options={filterOpts.clinicians} selected={globalFilter.clinicianIds} onChange={(v) => setGlobalFilter(f => ({ ...f, clinicianIds: v }))} />
            {filterOpts.roles.length > 1 && (<><div className="text-[9px] text-slate-600">Role</div><ChipGroup options={filterOpts.roles.map((r, i) => ({ ...r, colour: PALETTE[i % PALETTE.length] }))} selected={globalFilter.roles} onChange={(v) => setGlobalFilter(f => ({ ...f, roles: v }))} /></>)}
            {!isSession && filterOpts.locations.length > 1 && (<><div className="text-[9px] text-slate-600">Site</div><ChipGroup options={filterOpts.locations.map((l, i) => ({ ...l, colour: PALETTE[i % PALETTE.length] }))} selected={globalFilter.locations} onChange={(v) => setGlobalFilter(f => ({ ...f, locations: v }))} /></>)}
            {!isSession && <MultiSelect label="Slot types" options={filterOpts.slotTypes} selected={globalFilter.slotTypes} onChange={(v) => setGlobalFilter(f => ({ ...f, slotTypes: v }))} />}
            <div className="text-[9px] text-slate-600">Session</div>
            <ChipGroup options={SESSION_OPTS} selected={globalFilter.sessions} onChange={(v) => setGlobalFilter(f => ({ ...f, sessions: v }))} allLabel="AM+PM" />
            {filterCount > 0 && <button onClick={() => setGlobalFilter({ clinicianIds: [], roles: [], locations: [], slotTypes: [], sessions: [] })} className="text-[10px] text-slate-400 hover:text-white mt-1" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear all filters</button>}
          </Collapsible>
        </StepSection>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* ④ View */}
        <StepSection n="4" title="View">
          <div className="text-[9px] text-slate-600">Date range</div>
          <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
          <div className="text-[9px] text-slate-600 mt-1">Chart</div>
          <Segmented options={[{ id: 'bars', label: 'Bars' }, { id: 'stacked', label: 'Stacked' }, { id: 'trend', label: 'Trend' }, { id: 'table', label: 'Table' }]} value={chart} onChange={setChart}
            disabledIds={[...(timeOk ? [] : ['trend']), ...(result.hasSplit ? [] : ['stacked'])]} />
          <Collapsible title="More options">
            <div className="flex items-center justify-between"><span className="text-[10px] text-slate-400">Sort</span>
              <Segmented options={[{ id: 'value', label: 'Value' }, { id: 'alpha', label: 'A–Z' }]} value={sort} onChange={setSort} /></div>
            <div className="flex items-center justify-between"><span className="text-[10px] text-slate-400">Show</span>
              <Segmented options={[{ id: '0', label: 'All' }, { id: '10', label: 'Top 10' }, { id: '5', label: 'Top 5' }]} value={String(topN)} onChange={(v) => setTopN(parseInt(v))} /></div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={excludeSystem} onChange={e => setExcludeSystem(e.target.checked)} className="accent-indigo-500" />
              <span className="text-[10px] text-slate-300">Exclude system rows (TRIAGE, CCAS…)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={refOn} onChange={e => setRefOn(e.target.checked)} className="accent-indigo-500" />
              <span className="text-[10px] text-slate-300">Reference line</span>
            </label>
            {refOn && (
              <div className="pl-5 flex items-center gap-2">
                <Segmented options={[{ id: 'auto', label: result.isRatio ? 'Fair share' : 'Average' }, { id: 'custom', label: 'Custom' }]} value={refMode} onChange={setRefMode} />
                {refMode === 'custom' && <input value={refCustom} onChange={e => setRefCustom(e.target.value)} placeholder="value" className="w-16 text-[10px] rounded px-1.5 py-1" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />}
              </div>
            )}
          </Collapsible>
        </StepSection>
      </div>

      {/* Drill-down modal */}
      {drill && <DrillModal drill={drill} isSession={isSession} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ── Drill-down modal ────────────────────────────────────────────────────
function DrillModal({ drill, isSession, onClose }) {
  const { groupLabel, seriesLabel, facts } = drill;
  const totalCount = facts.reduce((s, f) => s + (f.count || 0), 0);
  // Group facts by date for readability.
  const byDate = {};
  facts.forEach(f => { (byDate[f.iso] = byDate[f.iso] || []).push(f); });
  const dates = Object.keys(byDate).sort();
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-xl overflow-hidden flex flex-col" style={{ background: 'linear-gradient(180deg,#1e293b,#0f172a)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '80vh' }}>
        <div className="px-4 py-3 flex items-center gap-2 border-b border-white/10 flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-white">{groupLabel}{seriesLabel ? ` · ${seriesLabel}` : ''}</div>
            <div className="text-[10px] text-slate-500">{totalCount} {isSession ? 'session' : 'slot'}{totalCount === 1 ? '' : 's'} across {dates.length} day{dates.length === 1 ? '' : 's'}</div>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {dates.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No underlying records.</p>}
          {dates.map(iso => {
            const rows = byDate[iso];
            const d = new Date(iso + 'T00:00:00');
            return (
              <div key={iso} className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-[11px] font-medium text-slate-300 mb-1">{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div className="flex flex-wrap gap-1">
                  {rows.map((f, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                      {f.session.toUpperCase()}
                      {isSession
                        ? ` · ${f.clinicianName}${f.isDuty ? ' · duty' : ''}${f.isSupport ? ' · support' : ''}`
                        : ` · ${f.clinicianName} · ${f.slotType} · ${f.status}${f.count > 1 ? ` ×${f.count}` : ''}`}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Bars (single or grouped multi-series) ───────────────────────────────
function BarsView({ result, fmt, maxVal, isRatio, refValue, refLabel, onPick }) {
  const multi = result.hasSplit && result.series.length > 1;
  return (
    <div className="space-y-2">
      {multi && (
        <div className="flex flex-wrap gap-3 mb-2">
          {result.series.map((s, i) => <span key={s.key} className="flex items-center gap-1 text-[10px] text-slate-400"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />{s.label}</span>)}
        </div>
      )}
      {result.groups.map((g, gi) => (
        <div key={g.key} className="flex items-center gap-3">
          <div className="w-32 lg:w-36 text-[11px] font-medium text-slate-300 truncate text-right" title={g.label}>{g.label}</div>
          <div className="flex-1 min-w-0">
            {multi ? (
              <div className="space-y-0.5">
                {result.series.map((s, si) => {
                  const cell = g.cells[s.key]; const w = (cell.value / maxVal) * 100;
                  return (
                    <div key={s.key} onClick={() => onPick && onPick(g.key, g.label, s.key, s.label)} className="relative h-3.5 rounded overflow-hidden cursor-pointer" style={{ background: 'rgba(255,255,255,0.05)' }} title="Click to drill down">
                      <div className="absolute left-0 top-0 bottom-0 rounded" style={{ width: `${Math.max(w, 0.5)}%`, background: PALETTE[si % PALETTE.length], opacity: 0.85 }} />
                      <span className="absolute right-1 top-0 bottom-0 flex items-center text-[8px] text-slate-300">{fmt(cell.value)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div onClick={() => onPick && onPick(g.key, g.label)} className="relative h-7 rounded-lg overflow-hidden cursor-pointer" style={{ background: 'rgba(255,255,255,0.06)' }} title="Click to drill down">
                <div className="absolute left-0 top-0 bottom-0 rounded-lg" style={{ width: `${Math.max((g.value / maxVal) * 100, 1)}%`, background: PALETTE[gi % PALETTE.length], opacity: 0.8 }} />
                {refValue != null && <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${(refValue / maxVal) * 100}%`, background: 'rgba(255,255,255,0.5)' }} title={refLabel} />}
                <div className="absolute inset-0 flex items-center px-2.5">
                  <span className="text-[11px] font-bold text-white drop-shadow">{fmt(g.value)}</span>
                  {isRatio && <span className="text-[9px] text-white/70 ml-2">{g.numerator}/{g.denominator}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      {refValue != null && !multi && (
        <div className="flex items-center gap-2 pt-2 mt-1 text-[10px] text-slate-500" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="inline-block w-0.5 h-3 align-middle" style={{ background: 'rgba(255,255,255,0.5)' }} />
          <span>{refLabel} · {result.groups.length} group{result.groups.length === 1 ? '' : 's'} · click a bar to drill down</span>
        </div>
      )}
    </div>
  );
}

// ── Stacked bars ────────────────────────────────────────────────────────
function StackedView({ result, fmt, onPick }) {
  const totals = result.groups.map(g => result.series.reduce((s, ser) => s + (g.cells[ser.key]?.value || 0), 0));
  const maxTotal = Math.max(...totals, 1);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 mb-2">
        {result.series.map((s, i) => <span key={s.key} className="flex items-center gap-1 text-[10px] text-slate-400"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />{s.label}</span>)}
      </div>
      {result.groups.map((g, gi) => {
        const total = totals[gi];
        return (
          <div key={g.key} className="flex items-center gap-3">
            <div className="w-32 lg:w-36 text-[11px] font-medium text-slate-300 truncate text-right" title={g.label}>{g.label}</div>
            <div className="flex-1 relative h-7 rounded-lg overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {result.series.map((s, si) => {
                const v = g.cells[s.key]?.value || 0; const w = (v / maxTotal) * 100;
                if (w <= 0) return null;
                return <div key={s.key} onClick={() => onPick && onPick(g.key, g.label, s.key, s.label)} title={`${s.label}: ${fmt(v)} — click to drill down`} className="cursor-pointer" style={{ width: `${w}%`, background: PALETTE[si % PALETTE.length], opacity: 0.85 }} />;
              })}
              <span className="absolute right-2 top-0 bottom-0 flex items-center text-[10px] font-bold text-white drop-shadow pointer-events-none">{fmt(total)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Trend (single or multi-series lines) ────────────────────────────────
function TrendView({ result, fmt, isRatio, refValue, refLabel, maxVal, onPick }) {
  const groups = result.groups;
  const W = 720, H = 240, padL = 40, padR = 16, padT = 16, padB = 40;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const multi = result.hasSplit && result.series.length > 1;
  const localMax = Math.max(maxVal, ...groups.flatMap(g => multi ? result.series.map(s => g.cells[s.key]?.value || 0) : [g.value]), isRatio ? 100 : 1);
  const x = (i) => padL + (groups.length === 1 ? innerW / 2 : (i / (groups.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / localMax) * innerH;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: localMax * f, yy: y(localMax * f) }));
  const lineFor = (valFn) => groups.map((g, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(valFn(g)).toFixed(1)}`).join(' ');
  return (
    <div className="w-full overflow-x-auto">
      {multi && <div className="flex flex-wrap gap-3 mb-2">{result.series.map((s, i) => <span key={s.key} className="flex items-center gap-1 text-[10px] text-slate-400"><span className="w-3 h-0.5" style={{ background: PALETTE[i % PALETTE.length] }} />{s.label}</span>)}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480 }}>
        {grid.map((gl, i) => (<g key={i}><line x1={padL} y1={gl.yy} x2={W - padR} y2={gl.yy} stroke="rgba(255,255,255,0.06)" /><text x={padL - 6} y={gl.yy + 3} textAnchor="end" fill="#64748b" style={{ fontSize: 9 }}>{isRatio ? `${Math.round(gl.v)}%` : Math.round(gl.v)}</text></g>))}
        {refValue != null && <g><line x1={padL} y1={y(refValue)} x2={W - padR} y2={y(refValue)} stroke="rgba(248,250,252,0.4)" strokeDasharray="4 3" /><text x={W - padR} y={y(refValue) - 3} textAnchor="end" fill="#cbd5e1" style={{ fontSize: 8 }}>{refLabel}</text></g>}
        {multi ? result.series.map((s, si) => (
          <g key={s.key}>
            <path d={lineFor(g => g.cells[s.key]?.value || 0)} fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth="2.5" strokeLinejoin="round" />
            {groups.map((g, i) => <circle key={g.key} cx={x(i)} cy={y(g.cells[s.key]?.value || 0)} r="3" fill={PALETTE[si % PALETTE.length]} stroke="#1e293b" strokeWidth="1.5" />)}
          </g>
        )) : (
          <g>
            <path d={`${lineFor(g => g.value)} L ${x(groups.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`} fill="rgba(99,102,241,0.15)" />
            <path d={lineFor(g => g.value)} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {groups.map((g, i) => (<g key={g.key}><circle cx={x(i)} cy={y(g.value)} r="3.5" fill="#818cf8" stroke="#1e293b" strokeWidth="1.5" style={{ cursor: 'pointer' }} onClick={() => onPick && onPick(g.key, g.label)} /><text x={x(i)} y={y(g.value) - 9} textAnchor="middle" fill="#c7d2fe" style={{ fontSize: 9, fontWeight: 700 }}>{fmt(g.value)}</text></g>))}
          </g>
        )}
        {groups.map((g, i) => <text key={g.key} x={x(i)} y={H - padB + 16} textAnchor="middle" fill="#64748b" style={{ fontSize: 9 }} transform={groups.length > 8 ? `rotate(-35 ${x(i)} ${H - padB + 16})` : undefined}>{g.label.replace('w/c ', '')}</text>)}
      </svg>
    </div>
  );
}

// ── Table (single or multi-series) ──────────────────────────────────────
function TableView({ result, groupLabel, fmt, onPick }) {
  const multi = result.hasSplit && result.series.length > 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <th className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 pr-4">{groupLabel}</th>
            {multi ? result.series.map(s => <th key={s.key} className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 px-3 text-right">{s.label}</th>)
              : (<>{result.isRatio && <th className="text-[10px] text-slate-500 py-2 px-3 text-right uppercase tracking-wider font-semibold">Num</th>}{result.isRatio && <th className="text-[10px] text-slate-500 py-2 px-3 text-right uppercase tracking-wider font-semibold">Denom</th>}<th className="text-[10px] text-slate-500 py-2 pl-3 text-right uppercase tracking-wider font-semibold">{result.isRatio ? '%' : 'Count'}</th></>)}
          </tr>
        </thead>
        <tbody>
          {result.groups.map(g => (
            <tr key={g.key} onClick={() => onPick && onPick(g.key, g.label)} className="cursor-pointer hover:bg-white/5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td className="text-[12px] text-slate-200 py-2 pr-4">{g.label}</td>
              {multi ? result.series.map(s => <td key={s.key} className="text-[12px] text-indigo-300 font-medium py-2 px-3 text-right tabular-nums">{fmt(g.cells[s.key]?.value || 0)}</td>)
                : (<>{result.isRatio && <td className="text-[12px] text-slate-400 py-2 px-3 text-right tabular-nums">{g.numerator}</td>}{result.isRatio && <td className="text-[12px] text-slate-400 py-2 px-3 text-right tabular-nums">{g.denominator}</td>}<td className="text-[12px] font-bold text-indigo-300 py-2 pl-3 text-right tabular-nums">{fmt(g.value)}</td></>)}
            </tr>
          ))}
        </tbody>
        {!multi && (
          <tfoot><tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <td className="text-[11px] font-semibold text-slate-300 py-2 pr-4">Total / overall</td>
            {result.isRatio && <td className="text-[11px] text-slate-300 py-2 px-3 text-right tabular-nums">{result.totalNum}</td>}
            {result.isRatio && <td className="text-[11px] text-slate-300 py-2 px-3 text-right tabular-nums">{result.totalDenom}</td>}
            <td className="text-[12px] font-bold text-indigo-200 py-2 pl-3 text-right tabular-nums">{fmt(result.totalValue)}</td>
          </tr></tfoot>
        )}
      </table>
    </div>
  );
}
