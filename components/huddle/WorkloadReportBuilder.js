'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import MultiSelect from '@/components/ui/MultiSelect';
import { PageHeader, EmptyState, useToast } from '@/components/ui';
import {
  buildFacts, buildSessionFacts, runReport, collectGroupFacts, describeMeasure, isTimeDimension,
  makeConditionalColour, PRESET_GROUPS, PRESETS, groupByOptionsForGrain, splitByOptionsForGrain, RANGE_OPTIONS, rangeLabel,
  buildFilterOptions, buildReportRows, reportRowsToCsv, reportInsight, REPORT_PALETTE, REPORT_SINGLE,
} from '@/lib/workload-report';
import ReportScheduleModal from './ReportScheduleModal';
import WeeklyDigest from './WeeklyDigest';
import { createClient } from '@/utils/supabase/client';
import { canEditPracticeData } from '@/lib/permissions';
import { onKeyActivate } from '@/lib/a11y';

const STATUS_OPTS = [
  { id: 'available', label: 'Available', colour: '#10b981' },
  { id: 'embargoed', label: 'Embargoed', colour: '#f59e0b' },
  { id: 'booked', label: 'Booked', colour: '#ef4444' },
];
const CATEGORY_OPTS = [
  { id: 'urgent', label: 'Urgent', colour: '#ef4444' },
  { id: 'routine', label: 'Routine', colour: '#10b981' },
  { id: 'other', label: 'Other', colour: 'var(--g-text-mid)' },
];
const SESSION_MODE_OPTS = [
  { id: 'worked', label: 'Worked' },
  { id: 'slottype', label: 'Includes slot type(s)' },
  { id: 'busiest', label: 'Most urgent slots' },
  { id: 'duty', label: 'Duty doctor' },
];
const SESSION_OPTS = [
  { id: 'am', label: 'AM', colour: '#f59e0b' },
  { id: 'pm', label: 'PM', colour: '#6366f1' },
];
// Bar colours come from lib/workload-report so the emailed chart and this
// one cannot end up different colours.
const PALETTE = REPORT_PALETTE;
const SINGLE = REPORT_SINGLE;

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
        <button onClick={() => onChange([])} className="text-xs px-2 py-1 rounded-md"
          style={{ background: none ? 'rgba(99,102,241,0.25)' : 'var(--g-tile)', border: `1px solid ${none ? 'rgba(99,102,241,0.5)' : 'var(--g-border-2)'}`, color: none ? 'var(--accent-text)' : 'var(--g-text-mid)' }}>{allLabel}</button>
      )}
      {options.map(o => {
        const on = (selected || []).includes(o.id);
        return (
          <button key={o.id} onClick={() => toggle(o.id)} className="text-xs px-2 py-1 rounded-md flex items-center gap-1"
            style={{ background: on ? `${o.colour}28` : 'var(--g-tile)', border: `1px solid ${on ? `${o.colour}88` : 'var(--g-border-2)'}`, color: on ? 'var(--g-text-hi)' : 'var(--g-text-mid)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.colour, opacity: on ? 1 : 0.4 }} />{o.label}
          </button>
        );
      })}
    </div>
  );
}

function Segmented({ options, value, onChange, disabledIds = [] }) {
  return (
    <div className="flex flex-wrap" style={{ background: 'var(--g-field)', borderRadius: 'var(--r-sm)', padding: 2, gap: 2 }}>
      {options.map(o => {
        const active = value === o.id, disabled = disabledIds.includes(o.id);
        return (
          <button key={o.id} disabled={disabled} onClick={() => !disabled && onChange(o.id)} className="text-xs font-medium px-2.5 py-1 rounded"
            style={{ background: active ? 'rgba(99,102,241,0.9)' : 'transparent', color: disabled ? 'var(--g-text-faint)' : active ? 'white' : 'var(--g-text-mid)', cursor: disabled ? 'not-allowed' : 'pointer' }}>{o.label}</button>
        );
      })}
    </div>
  );
}


function StepSection({ n, title, children, right }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center text-[11px] font-bold rounded-full" style={{ width: 17, height: 17, background: 'rgba(99,102,241,0.25)', color: 'var(--accent-text)' }}>{n}</span>
          <span className="text-sm font-semibold text-slate-200">{title}</span>
        </div>
        {right}
      </div>
      <div className="pl-[25px] space-y-2">{children}</div>
    </div>
  );
}

function Collapsible({ title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 text-sm font-semibold text-slate-300" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span><span>{title}</span>
        {badge ? <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.25)', color: 'var(--accent-text)' }}>{badge}</span> : null}
      </button>
      {open && <div className="mt-2 pl-[18px] space-y-2.5">{children}</div>}
    </div>
  );
}

export default function WorkloadReportBuilder({ data, huddleData }) {
  const hs = useMemo(() => data?.huddleSettings || {}, [data?.huddleSettings]);
  const canEdit = canEditPracticeData(data);
  const practiceId = data?._v4?.practiceId || null;
  const userId = data?._v4?.userId || null;

  const clinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left').map(c => ({ id: c.id, name: c.name, role: c.role || 'Unspecified' }));
  }, [data?.clinicians]);

  const slotData = useMemo(() => buildFacts(huddleData, clinicians, hs), [huddleData, clinicians, hs]);
  const sessionData = useMemo(() => buildSessionFacts(slotData.facts, hs?.dutyDoctorSlot), [slotData, hs?.dutyDoctorSlot]);
  const filterOpts = useMemo(() => buildFilterOptions(clinicians, slotData), [clinicians, slotData]);

  // View: 'gallery' (pick a report) | 'builder' (work on one).
  const [view, setView] = useState('gallery');
  const [reportName, setReportName] = useState('Custom report');
  // Tracks the report currently open so editing + saving works in place.
  // loadedSavedId: the saved_reports row id when editing a saved report
  // (null for a preset or a scratch report). baseConfig: the snapshot to
  // reset back to.
  const [loadedSavedId, setLoadedSavedId] = useState(null);
  const [baseConfig, setBaseConfig] = useState(null);
  // 'preset' | 'saved' | 'scratch' — drives how Save behaves.
  const [origin, setOrigin] = useState('scratch');

  // Config state.
  const [grain, setGrain] = useState('sessions');
  const [num, setNum] = useState({ statuses: [], categories: [], mode: 'busiest', slotTypes: [], sessions: [] });
  const [denomMode, setDenomMode] = useState('group');
  const [denom, setDenom] = useState({ statuses: ['available','embargoed','booked'], categories: [], mode: 'worked', slotTypes: [], sessions: [] });
  const [groupBy, setGroupBy] = useState('clinician');
  const [splitBy, setSplitBy] = useState('none');
  const [range, setRange] = useState('last8next8');
  const [chart, setChart] = useState('bars');
  const [globalFilter, setGlobalFilter] = useState({ clinicianIds: [], roles: [], locations: [], slotTypes: [], sessions: [] });
  const [excludeSystem, setExcludeSystem] = useState(true);
  const [sort, setSort] = useState('value');
  const [topN, setTopN] = useState(0);
  const [refOn, setRefOn] = useState(true);
  const [refMode, setRefMode] = useState('auto');
  const [refCustom, setRefCustom] = useState('');
  // Colour.
  const [colourMode, setColourMode] = useState('conditional'); // multi | single | conditional
  const [condMode, setCondMode] = useState('auto');            // auto | custom
  const [condLow, setCondLow] = useState('');
  const [condHigh, setCondHigh] = useState('');
  const [condInvert, setCondInvert] = useState(false);

  // Saved reports.
  const [savedReports, setSavedReports] = useState([]);
  const [savingReport, setSavingReport] = useState(false);
  const [newReportName, setNewReportName] = useState('');
  const [showSaveBox, setShowSaveBox] = useState(false);
  const [drill, setDrill] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const toast = useToast();
  // Per-user favourites (set of refs like 'preset:busiest-load' / 'saved:<uuid>').
  const [favourites, setFavourites] = useState(() => new Set());

  useEffect(() => {
    if (!practiceId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: rows, error } = await supabase.from('saved_reports').select('id, name, config, updated_at').eq('practice_id', practiceId).order('created_at', { ascending: true });
        if (!error && !cancelled && rows) setSavedReports(rows);
      } catch { /* table may not exist yet */ }
    })();
    return () => { cancelled = true; };
  }, [practiceId]);

  useEffect(() => {
    if (!practiceId || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: rows, error } = await supabase.from('report_favourites').select('ref').eq('practice_id', practiceId).eq('user_id', userId);
        if (!error && !cancelled && rows) setFavourites(new Set(rows.map(r => r.ref)));
      } catch { /* table may not exist yet */ }
    })();
    return () => { cancelled = true; };
  }, [practiceId, userId]);

  const toggleFav = async (ref) => {
    if (!practiceId || !userId) return;
    const has = favourites.has(ref);
    // Optimistic update.
    setFavourites(prev => { const n = new Set(prev); has ? n.delete(ref) : n.add(ref); return n; });
    try {
      const supabase = createClient();
      if (has) await supabase.from('report_favourites').delete().eq('practice_id', practiceId).eq('user_id', userId).eq('ref', ref);
      else await supabase.from('report_favourites').insert({ practice_id: practiceId, user_id: userId, ref });
    } catch {
      // Roll back on failure.
      setFavourites(prev => { const n = new Set(prev); has ? n.add(ref) : n.delete(ref); return n; });
    }
  };

  const numMode = (n) => n?.mode || (n?.kinds ? (n.kinds.includes('worked') ? 'worked' : (n.kinds.includes('duty') || n.kinds.includes('support')) ? 'busiest' : 'worked') : 'worked');
  const applyConfig = (c, name) => {
    if (!c) return;
    setGrain(c.grain || 'slots');
    setNum({ statuses: c.num?.statuses || [], categories: c.num?.categories || [], mode: numMode(c.num), slotTypes: c.num?.slotTypes || [], sessions: c.num?.sessions || [] });
    const mode = c.denomMode || (c.denom ? 'custom' : 'none');
    setDenomMode(mode);
    if (c.denom) setDenom({ statuses: c.denom.statuses || ['available','embargoed','booked'], categories: c.denom.categories || [], mode: numMode(c.denom), slotTypes: c.denom.slotTypes || [], sessions: c.denom.sessions || [] });
    setGroupBy(c.groupBy || 'clinician');
    setSplitBy(c.splitBy || 'none');
    setRange(c.range || 'last8next8');
    setChart(c.chart || 'bars');
    setGlobalFilter({ clinicianIds: c.globalFilter?.clinicianIds || [], roles: c.globalFilter?.roles || [], locations: c.globalFilter?.locations || [], slotTypes: c.globalFilter?.slotTypes || [], sessions: c.globalFilter?.sessions || [] });
    setExcludeSystem(typeof c.excludeSystem === 'boolean' ? c.excludeSystem : true);
    setTopN(typeof c.topN === 'number' ? c.topN : 0);
    setSort(c.sort || 'value');
    setColourMode(c.colourMode || 'multi');
    setCondInvert(!!c.colourInvert);
    setCondMode(c.condMode || 'auto');
    setCondLow(c.condLow != null ? String(c.condLow) : '');
    setCondHigh(c.condHigh != null ? String(c.condHigh) : '');
    if (name) setReportName(name);
  };

  const facts = grain === 'sessions' ? sessionData.facts : slotData.facts;
  const { dateMin, dateMax } = slotData;
  const isSession = grain === 'sessions';
  const groupByOpts = groupByOptionsForGrain(grain);
  const splitByOpts = splitByOptionsForGrain(grain);

  const config = useMemo(() => ({
    grain,
    num: isSession ? { mode: num.mode, slotTypes: num.slotTypes, sessions: num.sessions } : { statuses: num.statuses, categories: num.categories },
    denomMode,
    denom: denomMode === 'custom' ? (isSession ? { mode: denom.mode, slotTypes: denom.slotTypes, sessions: denom.sessions } : { statuses: denom.statuses, categories: denom.categories }) : null,
    groupBy, splitBy, range, globalFilter, excludeSystem, sort, topN, chart,
    colourMode, colourInvert: condInvert, condMode, condLow, condHigh,
  }), [grain, isSession, num, denomMode, denom, groupBy, splitBy, range, globalFilter, excludeSystem, sort, topN, chart, colourMode, condInvert, condMode, condLow, condHigh]);

  const result = useMemo(() => runReport(facts, config), [facts, config]);

  // Lets the schedule modal compute figures for the other reports in a
  // bundle without re-parsing the CSV — the facts are already built here
  // for both grains, so this is just a second pass over them.
  const runFor = useCallback((cfg) => {
    const f = cfg?.grain === 'sessions' ? sessionData.facts : slotData.facts;
    return runReport(f || [], cfg);
  }, [slotData, sessionData]);

  useEffect(() => {
    if (!groupByOpts.map(o => o.id).includes(groupBy)) setGroupBy('clinician');
    if (!splitByOpts.map(o => o.id).includes(splitBy)) setSplitBy('none');
  }, [grain]); // eslint-disable-line

  // Normalise a config to a comparable shape (defaults applied) so we can
  // tell whether the current report differs from the one that was loaded.
  const normConfig = (c) => {
    if (!c) return '';
    const mode = c.denomMode || (c.denom ? 'custom' : 'none');
    return JSON.stringify({
      grain: c.grain || 'slots',
      num: c.num || {},
      denomMode: mode,
      denom: mode === 'custom' ? (c.denom || {}) : null,
      groupBy: c.groupBy || 'clinician',
      splitBy: c.splitBy || 'none',
      range: c.range || 'last8next8',
      globalFilter: { clinicianIds: c.globalFilter?.clinicianIds || [], roles: c.globalFilter?.roles || [], locations: c.globalFilter?.locations || [], slotTypes: c.globalFilter?.slotTypes || [], sessions: c.globalFilter?.sessions || [] },
      excludeSystem: typeof c.excludeSystem === 'boolean' ? c.excludeSystem : true,
      sort: c.sort || 'value',
      topN: typeof c.topN === 'number' ? c.topN : 0,
      chart: c.chart || 'bars',
      colourMode: c.colourMode || 'multi',
      colourInvert: !!c.colourInvert,
    });
  };
  const dirty = baseConfig != null && normConfig(config) !== normConfig(baseConfig);

  const openConfig = (cfg, name, savedId = null, org = 'scratch') => { applyConfig(cfg, name); setBaseConfig(cfg); setLoadedSavedId(savedId); setOrigin(org); setShowSaveBox(false); setView('builder'); };
  const openPreset = (p) => openConfig({ ...p.config }, p.label, null, 'preset');
  const openSaved = (r) => openConfig(r.config, r.name, r.id, 'saved');
  const openBlank = () => openConfig({ grain: 'slots', num: { statuses: ['booked'] }, denomMode: 'none', groupBy: 'clinician', range: 'last8', chart: 'bars', colourMode: 'multi' }, 'Custom report', null, 'scratch');
  const resetReport = () => { if (baseConfig) applyConfig(baseConfig, reportName); };

  // Persist. `asNew` forces the name box (Save as new); otherwise, when
  // editing a saved report, save in place under the same name.
  const persist = async (name) => {
    if (!name || !practiceId || !canEdit) return null;
    setSavingReport(true);
    try {
      const supabase = createClient();
      const { data: row, error } = await supabase.from('saved_reports').upsert({ practice_id: practiceId, name, config, updated_by: userId }, { onConflict: 'practice_id,name' }).select('id, name, config, updated_at').single();
      if (!error && row) {
        setSavedReports(prev => [...prev.filter(r => r.name !== row.name && r.id !== row.id), row]);
        setReportName(row.name); setBaseConfig(row.config); setLoadedSavedId(row.id); setOrigin('saved');
        return row;
      }
    } catch { /* ignore */ }
    finally { setSavingReport(false); }
    return null;
  };
  const saveChanges = () => persist(reportName);                 // update the open saved report
  const saveForPractice = () => persist(reportName);             // save a preset under its own name, for this practice
  const saveAsNew = async () => { const n = newReportName.trim(); if (!n) return; const row = await persist(n); if (row) { setNewReportName(''); setShowSaveBox(false); } };

  const deleteReport = async (id) => {
    if (!practiceId || !canEdit) return;
    try { const supabase = createClient(); await supabase.from('saved_reports').delete().eq('id', id); setSavedReports(prev => prev.filter(r => r.id !== id)); }
    catch { /* ignore */ }
  };
  const openDrill = (groupKey, groupLabel, seriesKey = null, seriesLabel = '') => setDrill({ groupKey, groupLabel, seriesKey, seriesLabel, facts: collectGroupFacts(facts, config, groupKey, seriesKey) });

  if (!huddleData) {
    return (
      <div className="rounded-xl" style={{ background: 'var(--g-panel-2)', border: '1px solid var(--g-border)' }}>
        <EmptyState icon="📊" title="No CSV data yet" description="Upload a huddle CSV on the Today page to start building reports." />
      </div>
    );
  }

  // ─── GALLERY ───────────────────────────────────────────────────────────
  if (view === 'gallery') {
    // Per-group accent colours (Design A): a left bar + coloured heading,
    // cards otherwise calm and dark. Cycles if more groups are added.
    const GROUP_ACCENTS = [
      { bar: '#6366f1', head: 'var(--accent-pale)', ring: 'rgba(99,102,241,0.55)' },  // indigo
      { bar: '#14b8a6', head: 'var(--c-teal)', ring: 'rgba(20,184,166,0.55)' },  // teal
      { bar: '#f59e0b', head: 'var(--c-amber)', ring: 'rgba(245,158,11,0.55)' },  // amber
      { bar: '#ec4899', head: 'var(--c-pink-2)', ring: 'rgba(236,72,153,0.55)' },  // pink
    ];
    const star = (ref) => (
      <button onClick={(e) => { e.stopPropagation(); toggleFav(ref); }}
        className="absolute top-2 right-2 transition-colors"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: favourites.has(ref) ? 'var(--c-amber-2)' : 'var(--g-text-faint)', fontSize: 16, lineHeight: 1 }}
        title={favourites.has(ref) ? 'Remove from favourites' : 'Add to favourites'} aria-label="Toggle favourite">
        {favourites.has(ref) ? '★' : '☆'}
      </button>
    );
    const card = (key, accent, onClick, body, extra) => (
      <div key={key} role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={onClick}
        className="group relative rounded-xl p-4 pr-8 cursor-pointer flex flex-col transition-transform hover:-translate-y-0.5"
        style={{ background: 'var(--g-panel-2)', border: '1px solid var(--g-tile)', borderLeft: `3px solid ${accent.bar}`, minHeight: 84 }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent.ring; e.currentTarget.style.borderLeftColor = accent.bar; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--g-tile)'; e.currentTarget.style.borderLeftColor = accent.bar; }}>
        {body}{extra}
      </div>
    );
    const gold = { bar: '#eab308', head: 'var(--c-gold)', ring: 'rgba(234,179,8,0.55)' };
    const emerald = { bar: '#10b981', head: 'var(--c-mint)', ring: 'rgba(16,185,129,0.55)' };
    // Resolve favourited refs back to a preset or saved report (skipping any
    // that no longer exist, e.g. a deleted saved report).
    const favResolved = Array.from(favourites).map(ref => {
      if (ref.startsWith('preset:')) { const p = PRESETS.find(x => x.id === ref.slice(7)); return p ? { ref, kind: 'preset', item: p } : null; }
      if (ref.startsWith('saved:')) { const r = savedReports.find(x => x.id === ref.slice(6)); return r ? { ref, kind: 'saved', item: r } : null; }
      return null;
    }).filter(Boolean);
    return (
      <div className="space-y-7">
        <PageHeader title="Reporting" subtitle="Last week at a glance, then every report. Each tile opens the report behind it; every report is fully editable once open." className="mb-0" />

        {/* The landing answers first: last week against the week before,
            from the same facts every report below is built on. */}
        <WeeklyDigest slotData={slotData} sessionData={sessionData} onOpenPreset={openPreset} />

        {favResolved.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-full" style={{ width: 4, height: 15, background: gold.bar }} />
              <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: gold.head }}>★ Favourites</h2>
              <span className="text-xs text-slate-400">Your pinned reports</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {favResolved.map(({ ref, kind, item }) => kind === 'preset'
                ? card(ref, gold, () => openPreset(item),
                    <><div className="text-sm font-semibold text-slate-100">{item.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5 leading-snug">{item.description}</div></>,
                    star(ref))
                : card(ref, gold, () => openSaved(item),
                    <><div className="text-sm font-semibold text-slate-100">{item.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{describeMeasure(item.config)}</div></>,
                    star(ref)))}
            </div>
          </div>
        )}

        {savedReports.filter(r => !favourites.has(`saved:${r.id}`)).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-full" style={{ width: 4, height: 15, background: emerald.bar }} />
              <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: emerald.head }}>Your saved reports</h2>
              <span className="text-xs text-slate-400">Reports your practice has saved</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedReports.filter(r => !favourites.has(`saved:${r.id}`)).map(r => card(
                r.id, emerald, () => openSaved(r),
                <><div className="text-sm font-semibold text-slate-100">{r.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{describeMeasure(r.config)}</div></>,
                <>{star(`saved:${r.id}`)}
                  {canEdit && <button onClick={(e) => { e.stopPropagation(); deleteReport(r.id); }} className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity" style={{ background: 'none', border: 'none', cursor: 'pointer' }} title="Delete report">✕</button>}</>
              ))}
            </div>
          </div>
        )}

        {PRESET_GROUPS.map((g, gi) => {
          const accent = GROUP_ACCENTS[gi % GROUP_ACCENTS.length];
          const savedNames = new Set(savedReports.map(r => r.name.toLowerCase()));
          const presets = g.presets.filter(p => !savedNames.has(p.label.toLowerCase()) && !favourites.has(`preset:${p.id}`));
          if (presets.length === 0) return null;
          return (
            <div key={g.group}>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="rounded-full" style={{ width: 4, height: 15, background: accent.bar }} />
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: accent.head }}>{g.group}</h2>
                <span className="text-xs text-slate-400">{g.blurb}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {presets.map(p => card(
                  p.id, accent, () => openPreset(p),
                  <><div className="text-sm font-semibold text-slate-100">{p.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-snug">{p.description}</div></>,
                  star(`preset:${p.id}`)
                ))}
              </div>
            </div>
          );
        })}

        <div className="pt-1">
          <button onClick={openBlank}
            className="w-full sm:w-auto rounded-xl px-4 py-3 cursor-pointer flex items-center gap-3 transition-colors"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px dashed rgba(99,102,241,0.4)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}>
            <span className="flex items-center justify-center rounded-lg text-lg font-bold" style={{ width: 34, height: 34, background: 'rgba(99,102,241,0.25)', color: 'var(--accent-text)' }}>+</span>
            <span className="text-left"><span className="block text-sm font-semibold text-indigo-200">Build from scratch</span><span className="block text-xs text-slate-400">Start with a blank report and configure everything yourself.</span></span>
          </button>
        </div>
      </div>
    );
  }

  // ─── BUILDER ───────────────────────────────────────────────────────────
  const fmt = (v) => result.isRatio ? `${v.toFixed(1)}%` : `${Math.round(v)}`;
  const avg = result.valueAvg;
  let refValue = null, refLabel = '';
  if (refOn) {
    if (refMode === 'custom' && refCustom !== '' && !isNaN(parseFloat(refCustom))) { refValue = parseFloat(refCustom); refLabel = `Target ${fmt(refValue)}`; }
    else if (result.isRatio) { refValue = result.totalValue; refLabel = `Fair share ${fmt(refValue)}`; }
    else { refValue = avg; refLabel = `Average ${fmt(avg)}`; }
  }
  const maxVal = Math.max(...result.groups.map(g => g.value), result.isRatio ? 100 : 1, refValue || 0);

  // Bar colour function by mode.
  const condColour = makeConditionalColour({ result, refValue, mode: condMode, low: condLow === '' ? null : parseFloat(condLow), high: condHigh === '' ? null : parseFloat(condHigh), invert: condInvert });
  const colourFor = (value, index) => colourMode === 'single' ? SINGLE : colourMode === 'conditional' ? condColour(value) : PALETTE[index % PALETTE.length];

  const usesBusiest = isSession && (num.mode === 'busiest' || (denomMode === 'custom' && denom.mode === 'busiest'));
  const usesDuty = isSession && (num.mode === 'duty' || (denomMode === 'custom' && denom.mode === 'duty'));
  const dutyMissing = (usesBusiest && !sessionData.hasUrgent) || (usesDuty && !sessionData.hasDuty);
  const filterCount = ['clinicianIds','roles','locations','slotTypes','sessions'].reduce((n, k) => n + (globalFilter[k]?.length || 0), 0);

  // Same sentence the scheduled email prints, from the same function.
  const insight = reportInsight(result);

  // Rows come from lib/workload-report, shared with the CSV that scheduled
  // report emails attach — the downloaded file and the emailed one are
  // produced by the same code.
  const copyTable = () => navigator.clipboard?.writeText(buildReportRows(result).map(r => r.join('\t')).join('\n'));
  const downloadCsv = () => {
    const blob = new Blob([reportRowsToCsv(buildReportRows(result))], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${reportName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      {/* Back to gallery */}
      <button onClick={() => setView('gallery')} className="text-sm text-slate-400 hover:text-white flex items-center gap-1" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span>←</span> All reports
      </button>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* MAIN */}
        <div className="flex-1 min-w-0 w-full rounded-xl overflow-hidden" style={{ background: 'var(--g-panel)', border: '1px solid var(--g-border)' }}>
          {/* Header band */}
          <div className="px-5 pt-5 pb-4" style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.10), rgba(99,102,241,0))' }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-extrabold text-ink-max tracking-tight leading-tight">{reportName}</h1>
                <p className="text-sm text-slate-400 mt-1">
                  {describeMeasure(config)} · by <span className="text-indigo-300">{groupByOpts.find(o => o.id === groupBy)?.label.toLowerCase()}</span>
                  {result.hasSplit && <> · split by <span className="text-indigo-300">{splitByOpts.find(o => o.id === splitBy)?.label.toLowerCase()}</span></>}
                  {' · '}<span className="text-slate-300">{rangeLabel(range).toLowerCase()}</span>
                  {filterCount > 0 && <> · <span className="text-amber-300">{filterCount} filter{filterCount === 1 ? '' : 's'}</span></>}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <div className="text-xs text-slate-400 uppercase tracking-wide leading-none mb-1">Overall</div>
                  <div className="text-3xl font-extrabold text-indigo-300 leading-none">{fmt(result.totalValue)}</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {canEdit && loadedSavedId && (
                <button onClick={saveChanges} disabled={savingReport || !dirty} className="text-xs px-2.5 py-1 rounded-md font-medium"
                  style={{ background: dirty ? '#10b981' : 'rgba(16,185,129,0.12)', color: dirty ? '#06281e' : 'var(--c-mint)', border: '1px solid rgba(16,185,129,0.3)', cursor: dirty ? 'pointer' : 'default', opacity: savingReport ? 0.6 : 1 }}>
                  {savingReport ? '…' : dirty ? 'Save changes' : 'Saved'}
                </button>
              )}
              {canEdit && !loadedSavedId && origin === 'preset' && (
                <button onClick={saveForPractice} disabled={savingReport} className="text-xs px-2.5 py-1 rounded-md font-medium"
                  style={{ background: '#10b981', color: '#06281e', border: '1px solid rgba(16,185,129,0.3)', cursor: 'pointer', opacity: savingReport ? 0.6 : 1 }}>
                  {savingReport ? '…' : 'Save for my practice'}
                </button>
              )}
              {canEdit && <button onClick={() => setShowSaveBox(s => !s)} className="text-xs px-2.5 py-1 rounded-md" style={{ background: 'var(--g-tile)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--c-mint)' }}>{(loadedSavedId || origin === 'preset') ? 'Save as new' : 'Save report'}</button>}
              {dirty && <button onClick={resetReport} className="text-xs px-2.5 py-1 rounded-md" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)' }}>↺ Reset</button>}
              <button onClick={copyTable} className="text-xs px-2.5 py-1 rounded-md" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-line)', color: 'var(--g-text-mid)' }}>Copy</button>
              <button onClick={downloadCsv} className="text-xs px-2.5 py-1 rounded-md" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-line)', color: 'var(--g-text-mid)' }}>CSV</button>
              {canEdit && (loadedSavedId ? (
                <button onClick={() => setScheduleOpen(true)} className="text-xs px-2.5 py-1 rounded-md font-medium"
                  style={{ background: 'rgba(8,145,178,0.15)', border: '1px solid rgba(8,145,178,0.45)', color: 'var(--c-cyan)', cursor: 'pointer' }}
                  title="Email this report to people on a regular basis">
                  &#9993; Email on a schedule
                </button>
              ) : (
                // A schedule follows a saved report, so there has to be one
                // to follow. Say why rather than hiding the button.
                <button disabled className="text-xs px-2.5 py-1 rounded-md"
                  style={{ background: 'var(--g-tile)', border: '1px solid var(--g-line)', color: 'var(--g-text-faint)', cursor: 'not-allowed' }}
                  title="Save this report first - a schedule follows the saved report, so your later edits reach the people it is emailed to">
                  &#9993; Email on a schedule
                </button>
              ))}
              {dirty && loadedSavedId && <span className="text-xs text-amber-300/80">Unsaved changes</span>}
              {origin === 'preset' && !loadedSavedId && <span className="text-xs text-slate-400">Save keeps this report, with your changes, for your whole practice</span>}
            </div>
            {showSaveBox && canEdit && (
              <div className="flex items-center gap-2 mt-2">
                <input value={newReportName} onChange={e => setNewReportName(e.target.value)} placeholder="Name this report…" className="flex-1 max-w-xs text-xs rounded px-2 py-1.5"
                  style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }} />
                <button onClick={saveAsNew} disabled={savingReport || !newReportName.trim()} className="text-xs px-3 py-1.5 rounded" style={{ background: '#10b981', color: '#06281e', border: 'none', opacity: (savingReport || !newReportName.trim()) ? 0.5 : 1 }}>{savingReport ? '…' : 'Save'}</button>
              </div>
            )}
          </div>

          {/* Chart body */}
          <div className="px-5 pb-5 pt-1">
            {insight && <div className="mb-4 text-sm text-amber-200/90 rounded-lg px-3 py-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>💡 {insight}</div>}
            {dutyMissing ? (
              <p className="text-base text-slate-400 text-center py-10">{usesDuty ? 'No duty doctor sessions found. The \u201cduty doctor\u201d measure needs duty slots to be set on the Today page (the slots that define who the duty clinician is).' : 'No urgent slots found in this data. The \u201cmost urgent slots\u201d measure needs an urgent slot category \u2014 set which slot types count as urgent in the Today page filter.'}</p>
            ) : result.groups.length === 0 ? (
              <p className="text-base text-slate-400 text-center py-10">No data matches. Widen the date range, relax the filters, or turn off &ldquo;exclude system rows&rdquo;.</p>
            ) : (chart === 'table') ? (
              <TableView result={result} groupLabel={groupByOpts.find(o => o.id === groupBy)?.label} fmt={fmt} onPick={openDrill} />
            ) : (chart === 'trend' && timeDim(groupBy)) ? (
              <TrendView result={result} fmt={fmt} isRatio={result.isRatio} refValue={refValue} refLabel={refLabel} maxVal={maxVal} onPick={openDrill} colourFor={colourFor} />
            ) : (chart === 'stacked' && result.hasSplit) ? (
              <StackedView result={result} fmt={fmt} onPick={openDrill} />
            ) : (
              <BarsView result={result} fmt={fmt} maxVal={maxVal} isRatio={result.isRatio} refValue={refValue} refLabel={refLabel} onPick={openDrill} colourFor={colourFor} />
            )}
          </div>
        </div>

        {/* RIGHT CONTROLS */}
        <div className="w-full lg:w-80 lg:flex-shrink-0 rounded-xl p-4 space-y-4" style={{ background: 'var(--g-panel)', border: '1px solid var(--g-border)' }}>
          <StepSection n="1" title="Measure">
            <Segmented options={[{ id: 'slots', label: 'Slots' }, { id: 'sessions', label: 'Sessions' }]} value={grain} onChange={setGrain} />
            <div className="text-xs text-slate-400 font-medium mt-1">{isSession ? 'Count sessions that are…' : 'Count slots…'}</div>
            {isSession ? (
              <>
                <Segmented options={SESSION_MODE_OPTS} value={num.mode} onChange={(m) => setNum(n => ({ ...n, mode: m }))} />
                {num.mode === 'slottype' && (
                  <MultiSelect label="Slot types to include" options={filterOpts.slotTypes} selected={num.slotTypes} onChange={(v) => setNum(n => ({ ...n, slotTypes: v }))} />
                )}
                {num.mode === 'busiest' && <div className="text-xs text-slate-400">The session each day with the most urgent slots — the de-facto on-call.</div>}
                {num.mode === 'duty' && <div className="text-xs text-slate-400">The session where the clinician was the duty doctor, using the duty slots set on the Today page.</div>}
                <div className="text-xs text-slate-400 mt-1">Restrict to</div>
                <ChipGroup options={SESSION_OPTS} selected={num.sessions} onChange={(v) => setNum(n => ({ ...n, sessions: v }))} allLabel="AM+PM" />
              </>
            ) : (
              <>
                <div className="text-xs text-slate-400">Slot types</div>
                <MultiSelect label="All slot types" options={filterOpts.slotTypes} selected={globalFilter.slotTypes} onChange={(v) => setGlobalFilter(f => ({ ...f, slotTypes: v }))} />
                <div className="text-xs text-slate-400 mt-1">Status</div>
                <ChipGroup options={STATUS_OPTS} selected={num.statuses} onChange={(v) => setNum(n => ({ ...n, statuses: v }))} />
                <div className="text-xs text-slate-400">Category</div>
                <ChipGroup options={CATEGORY_OPTS} selected={num.categories} onChange={(v) => setNum(n => ({ ...n, categories: v }))} />
              </>
            )}
            <div className="text-xs text-slate-400 font-medium mt-2">Show as</div>
            <select value={denomMode} onChange={e => setDenomMode(e.target.value)} className="w-full text-xs rounded-md px-2 py-1.5" style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }}>
              <option value="none" style={{ background: 'var(--surface-2)' }}>Count (raw number)</option>
              <option value="group" style={{ background: 'var(--surface-2)' }}>% of each group&rsquo;s total</option>
              <option value="total" style={{ background: 'var(--surface-2)' }}>% of overall total (share)</option>
              <option value="custom" style={{ background: 'var(--surface-2)' }}>% of a custom subset…</option>
            </select>
            {denomMode === 'custom' && (
              <div className="mt-1 pl-3 space-y-2" style={{ borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
                <div className="text-xs text-slate-400">…as a % of {isSession ? 'sessions' : 'slots'} that are:</div>
                {isSession ? (
                  <>
                    <Segmented options={SESSION_MODE_OPTS} value={denom.mode} onChange={(m) => setDenom(d => ({ ...d, mode: m }))} />
                    {denom.mode === 'slottype' && (
                      <MultiSelect label="Slot types to include" options={filterOpts.slotTypes} selected={denom.slotTypes} onChange={(v) => setDenom(d => ({ ...d, slotTypes: v }))} />
                    )}
                    <ChipGroup options={SESSION_OPTS} selected={denom.sessions} onChange={(v) => setDenom(d => ({ ...d, sessions: v }))} allLabel="AM+PM" />
                  </>
                ) : (
                  <>
                    <div className="text-xs text-slate-400">Status</div>
                    <ChipGroup options={STATUS_OPTS} selected={denom.statuses} onChange={(v) => setDenom(d => ({ ...d, statuses: v }))} />
                    <div className="text-xs text-slate-400">Category</div>
                    <ChipGroup options={CATEGORY_OPTS} selected={denom.categories} onChange={(v) => setDenom(d => ({ ...d, categories: v }))} />
                  </>
                )}
              </div>
            )}
          </StepSection>

          <div style={{ borderTop: '1px solid var(--g-border)' }} />

          <StepSection n="2" title="Break down">
            <div className="text-xs text-slate-400">Group by</div>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="w-full text-xs rounded-md px-2 py-1.5" style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }}>
              {groupByOpts.map(o => <option key={o.id} value={o.id} style={{ background: 'var(--surface-2)' }}>{o.label}</option>)}
            </select>
            <div className="text-xs text-slate-400 mt-1">Compare by (series)</div>
            <select value={splitBy} onChange={e => setSplitBy(e.target.value)} className="w-full text-xs rounded-md px-2 py-1.5" style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }}>
              {splitByOpts.filter(o => o.id !== groupBy).map(o => <option key={o.id} value={o.id} style={{ background: 'var(--surface-2)' }}>{o.label}</option>)}
            </select>
          </StepSection>

          <div style={{ borderTop: '1px solid var(--g-border)' }} />

          <StepSection n="3" title="View">
            <div className="text-xs text-slate-400">Date range</div>
            <Segmented
              options={[...RANGE_OPTIONS, { id: 'custom', label: 'Custom' }]}
              value={typeof range === 'object' ? 'custom' : range}
              onChange={(id) => setRange(id === 'custom' ? { type: 'relative', backWeeks: 2, fwdWeeks: 4 } : id)} />
            {typeof range === 'object' && (
              <div className="pl-3 space-y-2" style={{ borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
                <Segmented
                  options={[{ id: 'relative', label: 'Weeks from today' }, { id: 'absolute', label: 'Specific dates' }]}
                  value={range.type}
                  onChange={(t) => setRange(t === 'relative' ? { type: 'relative', backWeeks: 2, fwdWeeks: 4 } : { type: 'absolute', from: '', to: '' })} />
                {range.type === 'relative' ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="number" min="0" max="104" value={range.backWeeks}
                      onChange={e => setRange(r => ({ ...r, backWeeks: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-14 text-xs rounded px-1.5 py-1" style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }} />
                    <span className="text-xs text-slate-400">weeks back →</span>
                    <input type="number" min="0" max="104" value={range.fwdWeeks}
                      onChange={e => setRange(r => ({ ...r, fwdWeeks: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-14 text-xs rounded px-1.5 py-1" style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }} />
                    <span className="text-xs text-slate-400">weeks ahead</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={range.from || ''} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
                      className="text-xs rounded px-1.5 py-1" style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none', colorScheme: 'dark' }} />
                    <span className="text-xs text-slate-400">to</span>
                    <input type="date" value={range.to || ''} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
                      className="text-xs rounded px-1.5 py-1" style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none', colorScheme: 'dark' }} />
                  </div>
                )}
                <div className="text-xs text-slate-400">{rangeLabel(range)}</div>
              </div>
            )}
            <div className="text-xs text-slate-400 mt-1">Chart</div>
            <Segmented options={[{ id: 'bars', label: 'Bars' }, { id: 'stacked', label: 'Stacked' }, { id: 'trend', label: 'Trend' }, { id: 'table', label: 'Table' }]} value={chart} onChange={setChart} disabledIds={[...(timeDim(groupBy) ? [] : ['trend']), ...(result.hasSplit ? [] : ['stacked'])]} />
            <div className="text-xs text-slate-400 mt-1">Bar colour</div>
            <Segmented options={[{ id: 'multi', label: 'Multi' }, { id: 'single', label: 'Single' }, { id: 'conditional', label: 'Conditional' }]} value={colourMode} onChange={setColourMode} />
            {colourMode === 'conditional' && (
              <div className="pl-3 space-y-2" style={{ borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
                <Segmented options={[{ id: 'auto', label: 'Auto (vs reference)' }, { id: 'custom', label: 'Custom' }]} value={condMode} onChange={setCondMode} />
                {condMode === 'custom' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Red ≤</span>
                    <input value={condLow} onChange={e => setCondLow(e.target.value)} placeholder="low" className="w-14 text-xs rounded px-1.5 py-1" style={{ background: 'var(--g-field)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--g-text-hi)', outline: 'none' }} />
                    <span className="text-xs text-slate-400">Green ≥</span>
                    <input value={condHigh} onChange={e => setCondHigh(e.target.value)} placeholder="high" className="w-14 text-xs rounded px-1.5 py-1" style={{ background: 'var(--g-field)', border: '1px solid rgba(16,185,129,0.4)', color: 'var(--g-text-hi)', outline: 'none' }} />
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={condInvert} onChange={e => setCondInvert(e.target.checked)} className="accent-indigo-500" />
                  <span className="text-xs text-slate-300">Invert (less is better)</span>
                </label>
              </div>
            )}
          </StepSection>

          <div style={{ borderTop: '1px solid var(--g-border)' }} />

          <StepSection n="4" title="Refine">
            <Collapsible title="Filter data" badge={filterCount || null} defaultOpen={filterCount > 0}>
              <MultiSelect label="Clinicians" options={filterOpts.clinicians} selected={globalFilter.clinicianIds} onChange={(v) => setGlobalFilter(f => ({ ...f, clinicianIds: v }))} />
              {filterOpts.roles.length > 1 && (<><div className="text-xs text-slate-400">Role</div><ChipGroup options={filterOpts.roles.map((r, i) => ({ ...r, colour: PALETTE[i % PALETTE.length] }))} selected={globalFilter.roles} onChange={(v) => setGlobalFilter(f => ({ ...f, roles: v }))} /></>)}
              {!isSession && filterOpts.locations.length > 1 && (<><div className="text-xs text-slate-400">Site</div><ChipGroup options={filterOpts.locations.map((l, i) => ({ ...l, colour: PALETTE[i % PALETTE.length] }))} selected={globalFilter.locations} onChange={(v) => setGlobalFilter(f => ({ ...f, locations: v }))} /></>)}
              <div className="text-xs text-slate-400">Session</div>
              <ChipGroup options={SESSION_OPTS} selected={globalFilter.sessions} onChange={(v) => setGlobalFilter(f => ({ ...f, sessions: v }))} allLabel="AM+PM" />
              {filterCount > 0 && <button onClick={() => setGlobalFilter({ clinicianIds: [], roles: [], locations: [], slotTypes: [], sessions: [] })} className="text-xs text-slate-400 hover:text-white mt-1" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear all filters</button>}
            </Collapsible>
            <Collapsible title="Sort, limit & reference">
              <div className="flex items-center justify-between"><span className="text-xs text-slate-400">Sort</span><Segmented options={[{ id: 'value', label: 'Value' }, { id: 'alpha', label: 'A–Z' }]} value={sort} onChange={setSort} /></div>
              <div className="flex items-center justify-between"><span className="text-xs text-slate-400">Show</span><Segmented options={[{ id: '0', label: 'All' }, { id: '10', label: 'Top 10' }, { id: '5', label: 'Top 5' }]} value={String(topN)} onChange={(v) => setTopN(parseInt(v))} /></div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={excludeSystem} onChange={e => setExcludeSystem(e.target.checked)} className="accent-indigo-500" /><span className="text-xs text-slate-300">Exclude system rows</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={refOn} onChange={e => setRefOn(e.target.checked)} className="accent-indigo-500" /><span className="text-xs text-slate-300">Reference line</span></label>
              {refOn && (
                <div className="pl-5 flex items-center gap-2">
                  <Segmented options={[{ id: 'auto', label: result.isRatio ? 'Fair share' : 'Average' }, { id: 'custom', label: 'Custom' }]} value={refMode} onChange={setRefMode} />
                  {refMode === 'custom' && <input value={refCustom} onChange={e => setRefCustom(e.target.value)} placeholder="value" className="w-16 text-xs rounded px-1.5 py-1" style={{ background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)', outline: 'none' }} />}
                </div>
              )}
            </Collapsible>
          </StepSection>
        </div>
      </div>

      {drill && <DrillModal drill={drill} isSession={isSession} onClose={() => setDrill(null)} />}

      {scheduleOpen && (
        <ReportScheduleModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          practiceId={practiceId}
          userId={userId}
          practiceName={data?._v4?.practiceName || 'your practice'}
          savedReportId={loadedSavedId}
          reportName={reportName}
          result={result}
          config={config}
          savedReports={savedReports}
          runFor={runFor}
          canEdit={canEdit}
          toast={toast}
        />
      )}
    </div>
  );
}

function timeDim(d) { return isTimeDimension(d); }

// ── Bars ────────────────────────────────────────────────────────────────
function BarsView({ result, fmt, maxVal, isRatio, refValue, refLabel, onPick, colourFor }) {
  const multi = result.hasSplit && result.series.length > 1;
  return (
    <div className="space-y-2.5">
      {multi && <div className="flex flex-wrap gap-3 mb-2">{result.series.map((s, i) => <span key={s.key} className="flex items-center gap-1 text-xs text-slate-400"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />{s.label}</span>)}</div>}
      {result.groups.map((g, gi) => (
        <div key={g.key} className="flex items-center gap-3">
          <div className="w-32 lg:w-40 text-sm font-medium text-slate-300 truncate text-right" title={g.label}>{g.label}</div>
          <div className="flex-1 min-w-0">
            {multi ? (
              <div className="space-y-1">
                {result.series.map((s, si) => { const cell = g.cells[s.key]; const w = (cell.value / maxVal) * 100;
                  return (
                    <div key={s.key} role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={() => onPick && onPick(g.key, g.label, s.key, s.label)} className="relative h-4 rounded overflow-hidden cursor-pointer" style={{ background: 'var(--g-tile)' }} title="Click to drill down">
                      <div className="absolute left-0 top-0 bottom-0 rounded" style={{ width: `${Math.max(w, 0.5)}%`, background: PALETTE[si % PALETTE.length], opacity: 0.9 }} />
                      <span className="absolute right-1.5 top-0 bottom-0 flex items-center text-[11px] font-medium text-slate-200">{fmt(cell.value)}</span>
                    </div>
                  ); })}
              </div>
            ) : (
              <div role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={() => onPick && onPick(g.key, g.label)} className="relative h-8 rounded-lg overflow-hidden cursor-pointer group" style={{ background: 'var(--g-tile)' }} title="Click to drill down">
                <div className="absolute left-0 top-0 bottom-0 rounded-lg transition-all group-hover:brightness-110" style={{ width: `${Math.max((g.value / maxVal) * 100, 1)}%`, background: colourFor(g.value, gi), opacity: 0.9 }} />
                {refValue != null && <div className="absolute top-0 bottom-0" style={{ left: `${(refValue / maxVal) * 100}%`, width: 2, background: 'var(--g-marker)' }} title={refLabel} />}
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-sm font-bold text-ink-max drop-shadow">{fmt(g.value)}</span>
                  {isRatio && <span className="text-[11px] text-ink-max/75 ml-2">{g.numerator}/{g.denominator}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      {refValue != null && !multi && (
        <div className="flex items-center gap-2 pt-2.5 mt-1 text-xs text-slate-400" style={{ borderTop: '1px solid var(--g-border)' }}>
          <span className="inline-block align-middle" style={{ width: 2, height: 12, background: 'var(--g-marker)' }} />
          <span>{refLabel} · {result.groups.length} group{result.groups.length === 1 ? '' : 's'} · click a bar to drill down</span>
        </div>
      )}
    </div>
  );
}

// ── Stacked ─────────────────────────────────────────────────────────────
function StackedView({ result, fmt, onPick }) {
  const totals = result.groups.map(g => result.series.reduce((s, ser) => s + (g.cells[ser.key]?.value || 0), 0));
  const maxTotal = Math.max(...totals, 1);
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-3 mb-2">{result.series.map((s, i) => <span key={s.key} className="flex items-center gap-1 text-xs text-slate-400"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />{s.label}</span>)}</div>
      {result.groups.map((g, gi) => { const total = totals[gi];
        return (
          <div key={g.key} className="flex items-center gap-3">
            <div className="w-32 lg:w-40 text-sm font-medium text-slate-300 truncate text-right" title={g.label}>{g.label}</div>
            <div className="flex-1 relative h-8 rounded-lg overflow-hidden flex" style={{ background: 'var(--g-tile)' }}>
              {result.series.map((s, si) => { const v = g.cells[s.key]?.value || 0; const w = (v / maxTotal) * 100; if (w <= 0) return null;
                return <div key={s.key} role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={() => onPick && onPick(g.key, g.label, s.key, s.label)} title={`${s.label}: ${fmt(v)} — click to drill down`} className="cursor-pointer hover:brightness-110 transition-all" style={{ width: `${w}%`, background: PALETTE[si % PALETTE.length], opacity: 0.9 }} />; })}
              <span className="absolute right-2.5 top-0 bottom-0 flex items-center text-xs font-bold text-ink-max drop-shadow pointer-events-none">{fmt(total)}</span>
            </div>
          </div>
        ); })}
    </div>
  );
}

// ── Trend ───────────────────────────────────────────────────────────────
function TrendView({ result, fmt, isRatio, refValue, refLabel, maxVal, onPick, colourFor }) {
  const groups = result.groups;
  const W = 740, H = 260, padL = 44, padR = 18, padT = 18, padB = 42;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const multi = result.hasSplit && result.series.length > 1;
  const localMax = Math.max(maxVal, ...groups.flatMap(g => multi ? result.series.map(s => g.cells[s.key]?.value || 0) : [g.value]), isRatio ? 100 : 1);
  const x = (i) => padL + (groups.length === 1 ? innerW / 2 : (i / (groups.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / localMax) * innerH;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: localMax * f, yy: y(localMax * f) }));
  const lineFor = (valFn) => groups.map((g, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(valFn(g)).toFixed(1)}`).join(' ');
  const single = '#818cf8';
  return (
    <div className="w-full overflow-x-auto">
      {multi && <div className="flex flex-wrap gap-3 mb-2">{result.series.map((s, i) => <span key={s.key} className="flex items-center gap-1 text-xs text-slate-400"><span className="w-3 h-0.5" style={{ background: PALETTE[i % PALETTE.length] }} />{s.label}</span>)}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480 }}>
        <defs><linearGradient id="trendfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity="0.28" /><stop offset="100%" stopColor="#818cf8" stopOpacity="0.02" /></linearGradient></defs>
        {grid.map((gl, i) => (<g key={i}><line x1={padL} y1={gl.yy} x2={W - padR} y2={gl.yy} style={{ stroke: 'var(--g-border)' }} /><text x={padL - 8} y={gl.yy + 3} textAnchor="end" style={{ fontSize:11, fill: 'var(--g-text-mid)' }}>{isRatio ? `${Math.round(gl.v)}%` : Math.round(gl.v)}</text></g>))}
        {refValue != null && <g><line x1={padL} y1={y(refValue)} x2={W - padR} y2={y(refValue)} style={{ stroke: 'var(--g-label)' }} strokeDasharray="5 3" /><text x={W - padR} y={y(refValue) - 4} textAnchor="end" style={{ fontSize:11, fill: 'var(--g-text-hi)' }}>{refLabel}</text></g>}
        {multi ? result.series.map((s, si) => (
          <g key={s.key}>
            <path d={lineFor(g => g.cells[s.key]?.value || 0)} fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth="2.5" strokeLinejoin="round" />
            {groups.map((g, i) => <circle key={g.key} cx={x(i)} cy={y(g.cells[s.key]?.value || 0)} r="3" fill={PALETTE[si % PALETTE.length]} style={{ stroke: 'var(--g-ink-2)' }} strokeWidth="1.5" />)}
          </g>
        )) : (
          <g>
            <path d={`${lineFor(g => g.value)} L ${x(groups.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`} fill="url(#trendfill)" />
            <path d={lineFor(g => g.value)} fill="none" stroke={single} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {groups.map((g, i) => (<g key={g.key} className="cursor-pointer" onClick={() => onPick && onPick(g.key, g.label)}><circle cx={x(i)} cy={y(g.value)} r="4.5" fill={colourFor ? colourFor(g.value, i) : single} style={{ stroke: 'var(--g-ink)' }} strokeWidth="2" /><text x={x(i)} y={y(g.value) - 11} textAnchor="middle" style={{ fontSize:11, fontWeight: 700, fill: 'var(--g-text-hi)' }}>{fmt(g.value)}</text></g>))}
          </g>
        )}
        {groups.map((g, i) => <text key={g.key} x={x(i)} y={H - padB + 18} textAnchor="middle" style={{ fontSize:11, fill: 'var(--g-text-mid)' }} transform={groups.length > 8 ? `rotate(-35 ${x(i)} ${H - padB + 18})` : undefined}>{g.label.replace('w/c ', '')}</text>)}
      </svg>
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────
function TableView({ result, groupLabel, fmt, onPick }) {
  const multi = result.hasSplit && result.series.length > 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--g-line)' }}>
            <th className="text-xs font-semibold uppercase tracking-wider text-slate-400 py-2 pr-4">{groupLabel}</th>
            {multi ? result.series.map(s => <th key={s.key} className="text-xs font-semibold uppercase tracking-wider text-slate-400 py-2 px-3 text-right">{s.label}</th>)
              : (<>{result.isRatio && <th className="text-xs text-slate-400 py-2 px-3 text-right uppercase tracking-wider font-semibold">Num</th>}{result.isRatio && <th className="text-xs text-slate-400 py-2 px-3 text-right uppercase tracking-wider font-semibold">Denom</th>}<th className="text-xs text-slate-400 py-2 pl-3 text-right uppercase tracking-wider font-semibold">{result.isRatio ? '%' : 'Count'}</th></>)}
          </tr>
        </thead>
        <tbody>
          {result.groups.map(g => (
            <tr key={g.key} role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={() => onPick && onPick(g.key, g.label)} className="cursor-pointer hover:bg-white/5" style={{ borderBottom: '1px solid var(--g-tile)' }}>
              <td className="text-sm text-slate-200 py-2 pr-4">{g.label}</td>
              {multi ? result.series.map(s => <td key={s.key} className="text-sm text-indigo-300 font-medium py-2 px-3 text-right tabular-nums">{fmt(g.cells[s.key]?.value || 0)}</td>)
                : (<>{result.isRatio && <td className="text-sm text-slate-400 py-2 px-3 text-right tabular-nums">{g.numerator}</td>}{result.isRatio && <td className="text-sm text-slate-400 py-2 px-3 text-right tabular-nums">{g.denominator}</td>}<td className="text-sm font-bold text-indigo-300 py-2 pl-3 text-right tabular-nums">{fmt(g.value)}</td></>)}
            </tr>
          ))}
        </tbody>
        {!multi && (
          <tfoot><tr style={{ borderTop: '1px solid var(--g-line)' }}>
            <td className="text-sm font-semibold text-slate-300 py-2 pr-4">Total / overall</td>
            {result.isRatio && <td className="text-sm text-slate-300 py-2 px-3 text-right tabular-nums">{result.totalNum}</td>}
            {result.isRatio && <td className="text-sm text-slate-300 py-2 px-3 text-right tabular-nums">{result.totalDenom}</td>}
            <td className="text-sm font-bold text-indigo-200 py-2 pl-3 text-right tabular-nums">{fmt(result.totalValue)}</td>
          </tr></tfoot>
        )}
      </table>
    </div>
  );
}

// ── Drill-down modal ────────────────────────────────────────────────────
function DrillModal({ drill, isSession, onClose }) {
  const { groupLabel, seriesLabel, facts } = drill;
  const totalCount = facts.reduce((s, f) => s + (f.count || 0), 0);
  const byDate = {};
  facts.forEach(f => { (byDate[f.iso] = byDate[f.iso] || []).push(f); });
  const dates = Object.keys(byDate).sort();
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-xl overflow-hidden flex flex-col" style={{ background: 'linear-gradient(180deg,var(--g-ink-2),var(--g-ink))', border: '1px solid var(--g-line)', maxHeight: '80vh' }}>
        <div className="px-4 py-3 flex items-center gap-2 border-b border-white/10 flex-shrink-0">
          <div><div className="text-base font-semibold text-ink-max">{groupLabel}{seriesLabel ? ` · ${seriesLabel}` : ''}</div><div className="text-xs text-slate-400">{totalCount} {isSession ? 'session' : 'slot'}{totalCount === 1 ? '' : 's'} across {dates.length} day{dates.length === 1 ? '' : 's'}</div></div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }} aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {dates.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No underlying records.</p>}
          {dates.map(iso => { const rows = byDate[iso]; const d = new Date(iso + 'T00:00:00');
            return (
              <div key={iso} className="rounded-lg p-2" style={{ background: 'var(--g-tile-2)', border: '1px solid var(--g-tile)' }}>
                <div className="text-xs font-medium text-slate-300 mb-1">{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div className="flex flex-wrap gap-1">
                  {rows.map((f, i) => <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--g-tile)', color: 'var(--g-text-mid)' }}>{f.session.toUpperCase()}{isSession ? ` · ${f.clinicianName}${f.isBusiestUrgent ? ' · most urgent' : ''}${f.urgentCount ? ` · ${f.urgentCount} urgent` : ''}` : ` · ${f.clinicianName} · ${f.slotType} · ${f.status}${f.count > 1 ? ` ×${f.count}` : ''}`}</span>)}
                </div>
              </div>
            ); })}
        </div>
      </div>
    </div>
  );
}
