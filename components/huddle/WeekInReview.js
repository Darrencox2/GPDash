'use client';
// Week in review: the pre-flight check for a week.
//
// Opens on next week, because that is the week someone can still fix.
// The page is built in layers so it reads at a glance and opens up on
// demand:
//   1. a status line: reviewed or not, how many things are open
//   2. five day tiles: a verdict per day, duty, urgent percentages.
//      Click a day and its full checklist opens underneath
//   3. one line per check across the week, with a verdict. Click a check
//      and its five-day detail opens underneath
//   4. the open flags, each one a click to its day, each acknowledgeable
// Every name goes to that person's rota, every day to Today, every
// capacity figure to the capacity week view, every ward round to its
// set-up. The numbers come from lib/week-review.js; this file draws them.
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { assembleWeekReview, mondayOf, resolveWeekReviewConfig, suggestWardRoundTypes, suggestActivityTypes, displayNameFor } from '@/lib/week-review';
import { canEditPracticeData } from '@/lib/permissions';
import { getSchoolHolidaysForLEA } from '@/lib/school-holidays-by-lea';
import { matchesStaffMember } from '@/lib/data';
import { createClient } from '@/utils/supabase/client';
import { Button, promptDialog, confirmDialog } from '@/components/ui';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SEV = {
  high:   { label: 'to fix', long: 'Needs fixing', colour: 'var(--state-short)', soft: 'rgba(239,68,68,0.12)' },
  medium: { label: 'to check', long: 'Worth a look', colour: 'var(--state-tight)', soft: 'rgba(245,158,11,0.12)' },
  info:   { label: 'to note', long: 'For information', colour: 'var(--c-cyan)', soft: 'rgba(6,182,212,0.10)' },
};
const OK = 'var(--state-ok)';
const STATE_COLOUR = { short: 'var(--state-short)', tight: 'var(--state-tight)', ok: OK, none: 'var(--g-text-faint)' };
const DUTY = { fg: 'var(--duty-fg)' };

const S = {
  card: { background: 'var(--g-panel)', border: '1px solid var(--g-border)', borderRadius: 'var(--r-lg)' },
  tile: { background: 'var(--g-tile-2)', border: '1px solid var(--g-border)', borderRadius: 'var(--r-md)' },
  h2: { fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 600, color: 'var(--g-text-hi)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  meta: { fontSize: 11, color: 'var(--meta)' },
  navBtn: { background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-mid)', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 13 },
  link: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left' },
};

function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
}
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// "Katie Ellison" -> "K Ellison" when there is no room for the forename.
function short(name) {
  const s = String(name || '').trim();
  if (s.length <= 14) return s;
  const i = s.indexOf(' ');
  return i < 1 ? s : `${s[0]} ${s.slice(i + 1)}`;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

// A chevron that says open or closed.
function Chevron({ open, colour = 'var(--meta)' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms', flex: 'none' }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
// A coloured dot: the verdict in one glyph.
function Dot({ colour, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: 999, background: colour, display: 'inline-block', flex: 'none' }} />;
}

export default function WeekInReview({ data, saveData, huddleData, toast, setActiveSection, onOpenDate, onOpenWeek, onOpenClinician }) {
  const canEdit = canEditPracticeData(data);
  const hs = useMemo(() => data?.huddleSettings || {}, [data?.huddleSettings]);
  const practiceId = data?._v4?.practiceId || null;
  const userId = data?._v4?.userId || null;
  const myName = data?._v4?.linkedClinicianName || data?._v4?.userEmail || 'Someone';
  const clinicians = useMemo(() => (Array.isArray(data?.clinicians) ? data.clinicians : Object.values(data?.clinicians || {})), [data?.clinicians]);

  // Week offset from the current week. 1 = next week, the default: the
  // week there is still time to fix.
  const [offset, setOffset] = useState(1);
  const monday = useMemo(() => {
    const m = mondayOf(new Date());
    m.setDate(m.getDate() + offset * 7);
    return m;
  }, [offset]);

  const predictionOptions = useMemo(() => {
    const opts = {};
    if (data?._v4?.demandSettings) opts.demandSettings = data._v4.demandSettings;
    if (data?._v4?.practiceAdminDistrict) {
      const cal = getSchoolHolidaysForLEA(data._v4.practiceAdminDistrict);
      if (cal?.ranges) opts.schoolHolidayRanges = cal.ranges;
    }
    if (typeof data?._v4?.practiceListSize === 'number') opts.listSize = data._v4.practiceListSize;
    return opts;
  }, [data?._v4?.demandSettings, data?._v4?.practiceAdminDistrict, data?._v4?.practiceListSize]);

  const week = useMemo(
    () => assembleWeekReview({ data, huddleData, monday, predictionOptions }),
    [data, huddleData, monday, predictionOptions]
  );
  const days = week.days;

  // ── The sign-off record ─────────────────────────────────────────────
  const [review, setReview] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!practiceId) return;
    let cancelled = false;
    setReview(null);
    (async () => {
      try {
        const supabase = createClient();
        const { data: row } = await supabase
          .from('week_reviews')
          .select('id, week_start, reviewed_by, reviewed_by_name, reviewed_at, note, acknowledged, updated_at')
          .eq('practice_id', practiceId)
          .eq('week_start', week.mondayIso)
          .maybeSingle();
        if (!cancelled && row) setReview(row);
      } catch { /* the table may not exist yet - the page still works without a record */ }
    })();
    return () => { cancelled = true; };
  }, [practiceId, week.mondayIso]);

  const persist = async (patch) => {
    if (!practiceId || !canEdit) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const base = { practice_id: practiceId, week_start: week.mondayIso, acknowledged: review?.acknowledged || {} };
      const { data: row, error } = await supabase
        .from('week_reviews')
        .upsert({ ...base, ...(review || {}), ...patch, practice_id: practiceId, week_start: week.mondayIso }, { onConflict: 'practice_id,week_start' })
        .select('id, week_start, reviewed_by, reviewed_by_name, reviewed_at, note, acknowledged, updated_at')
        .single();
      if (error) throw error;
      setReview(row);
      return row;
    } catch (e) {
      toast?.(`Could not save the review: ${e?.message || e}`, 'error');
    } finally { setSaving(false); }
  };

  const acknowledged = review?.acknowledged || {};
  const isOpen = (f) => !acknowledged[f.id];
  const openFlags = week.flags.filter(isOpen);
  const openCounts = { high: 0, medium: 0, info: 0 };
  for (const f of openFlags) openCounts[f.severity] += 1;
  const reviewed = !!review?.reviewed_at;

  const markReviewed = async () => {
    let msg = `Mark w/c ${week.label} as reviewed?`;
    if (openCounts.high > 0) msg = `${plural(openCounts.high, 'item')} still need${openCounts.high === 1 ? 's' : ''} fixing. Mark the week reviewed anyway?`;
    const ok = await confirmDialog({ title: 'Mark week reviewed', message: msg });
    if (!ok) return;
    const note = await promptDialog({ title: 'Anything to note for this week?', label: 'Note (optional)', defaultValue: review?.note || '' });
    await persist({ reviewed_by: userId, reviewed_by_name: myName, reviewed_at: new Date().toISOString(), note: note == null ? (review?.note || null) : (note.trim() || null) });
    toast?.('Week marked as reviewed');
  };
  const reopen = async () => {
    const ok = await confirmDialog({ title: 'Reopen this week', message: 'Clear the reviewed mark so the week is checked again?' });
    if (!ok) return;
    await persist({ reviewed_by: null, reviewed_by_name: null, reviewed_at: null });
  };
  const acknowledge = async (flag) => {
    const reason = await promptDialog({ title: 'Acknowledge this item', message: flag.text, label: 'Why it is fine', validate: (v) => (!v || !v.trim() ? 'Say why, so the next reviewer knows.' : '') });
    if (reason == null) return;
    await persist({ acknowledged: { ...acknowledged, [flag.id]: { by: myName, at: new Date().toISOString(), reason: reason.trim() } } });
  };
  const unacknowledge = async (flag) => {
    const next = { ...acknowledged };
    delete next[flag.id];
    await persist({ acknowledged: next });
  };

  // ── Where clicks go ─────────────────────────────────────────────────
  const [setupOpen, setSetupOpen] = useState(false);
  const saveConfig = (next) => { if (canEdit) saveData({ ...data, huddleSettings: { ...hs, weekReview: next } }, false); };
  const openDay = (iso) => onOpenDate?.(iso);
  const openCapacity = () => onOpenWeek?.(offset + 1);
  const openPerson = (csvOrName) => {
    const c = clinicians.find((x) => x.name === csvOrName) || clinicians.find((x) => matchesStaffMember(csvOrName, x));
    if (c?.initials) onOpenClinician?.(c);
  };
  const canOpenPerson = (csvOrName) => !!onOpenClinician && !!(clinicians.find((x) => x.name === csvOrName) || clinicians.find((x) => matchesStaffMember(csvOrName, x)))?.initials;

  // Which day's checklist is open, and which check's week detail.
  const [dayOpen, setDayOpen] = useState(null);       // iso or null
  const [checksOpen, setChecksOpen] = useState({});   // { [id]: true }
  const toggleCheck = (id) => setChecksOpen((o) => ({ ...o, [id]: !o[id] }));
  const [showAck, setShowAck] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const dayPanelRef = useRef(null);
  useEffect(() => { setDayOpen(null); }, [week.mondayIso]);
  const jumpToDay = (iso) => {
    setDayOpen(iso);
    setTimeout(() => dayPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  // A person's name, clickable when they are on the register.
  const Person = ({ name, display, duty, dim }) => {
    const label = short(display || name);
    const style = { fontWeight: 600, color: duty ? DUTY.fg : dim ? 'var(--g-text-faint)' : 'var(--g-text-hi)' };
    return canOpenPerson(name)
      ? <button onClick={() => openPerson(name)} title={`${display || name}: open rota`} style={{ ...S.link, ...style, textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{label}</button>
      : <span style={style} title={display || name}>{label}</span>;
  };

  // ── Verdicts per check, across the week ─────────────────────────────
  const live = days.filter((d) => d.hasData && !d.closed);
  const countFlags = (kind) => openFlags.filter((f) => f.kind === kind).length;
  const checks = useMemo(() => {
    const out = [];
    const verdict = (bad, good, nBad, sevIfBad = 'high') => (nBad ? { text: bad, colour: SEV[sevIfBad].colour } : { text: good, colour: OK });
    if (!live.length) return out;
    const nUrg = countFlags('urgent-short');
    out.push({ id: 'urgent', title: 'Urgent capacity', sub: 'against the Capacity planning target',
      ...(!week.hasTargets ? { text: 'No targets set', colour: 'var(--g-text-faint)' } : verdict(`${plural(nUrg, 'session')} below target`, 'Every session on target', nUrg, 'medium')),
      onTitle: openCapacity });
    const nDem = countFlags('demand-over');
    out.push({ id: 'demand', title: 'Predicted demand', sub: 'against urgent slots offered', ...verdict(`${plural(nDem, 'day')} above capacity`, 'Within capacity every day', nDem, 'medium') });
    const nSite = countFlags('site-short'), nNobody = countFlags('site-nobody-offering');
    out.push({ id: 'sites', title: 'Clinicians per site', sub: 'GPs with bookable slots, against the site minimum',
      ...(!week.sites.length ? { text: 'No sites set up', colour: 'var(--g-text-faint)' } : verdict(`${plural(nSite, 'session')} short${nNobody ? `, ${nNobody} with nobody offering` : ''}`, 'Every site meets its minimum', nSite + nNobody)),
      onTitle: openCapacity });
    const nDuty = countFlags('duty-missing');
    out.push({ id: 'duty', title: 'Duty doctor', sub: 'from the duty slot type',
      ...(!week.hasDutyConfig ? { text: 'Duty slot type not set up', colour: 'var(--g-text-faint)' } : verdict(`${plural(nDuty, 'session')} without duty`, 'Named every session', nDuty)) });
    const nUn = countFlags('ward-uncovered'), nInf = days.reduce((s, d) => s + d.wardRounds.filter((r) => r.status === 'inferred').length, 0), nClash = countFlags('duty-clash');
    const totalRounds = days.reduce((s, d) => s + d.wardRounds.length, 0);
    out.push({ id: 'wards', title: 'Ward rounds', sub: week.config.wardRounds.length ? week.config.wardRounds.map((r) => r.name).join(', ') : 'homes not set up yet',
      ...(!week.config.wardRounds.length
        ? { text: canEdit ? 'Set up the homes to check cover' : 'Homes not set up', colour: 'var(--g-text-faint)' }
        : nUn ? { text: `${plural(nUn, 'round')} uncovered${nInf ? `, ${nInf} by a stand-in` : ''}${nClash ? `, ${nClash} duty clash` : ''}`, colour: SEV.high.colour }
        : nInf || nClash ? { text: `${nInf ? `${nInf} by a stand-in` : ''}${nInf && nClash ? ', ' : ''}${nClash ? `${plural(nClash, 'duty clash', 'duty clashes')}` : ''}`, colour: SEV.medium.colour }
        : { text: `All ${totalRounds} covered`, colour: OK }),
      onTitle: canEdit ? () => setSetupOpen(true) : null });
    const nAct = days.reduce((s, d) => s + d.activities.length, 0);
    out.push({ id: 'activities', title: 'Other activities', sub: 'teaching, clinics, school visits', text: nAct ? `${nAct} this week` : 'None this week', colour: 'var(--g-text-mid)' });
    const nMis = countFlags('plan-no-emis') + countFlags('emis-but-away'), nUnk = days.reduce((s, d) => s + d.mismatches.unknownNames.length, 0);
    out.push({ id: 'plan', title: 'Plan against EMIS', sub: 'the rota and absences against who has slots',
      ...verdict(`${plural(nMis, 'mismatch', 'mismatches')}${nUnk ? `, ${nUnk} not on register` : ''}`, nUnk ? `Agree, ${nUnk} not on register` : 'Plan and EMIS agree', nMis) });
    out.push({ id: 'staff', title: 'Staff changes', sub: 'starting or ending this week', text: week.staffChanges.length ? `${week.staffChanges.length} this week` : 'None this week', colour: week.staffChanges.length ? SEV.info.colour : 'var(--g-text-mid)',
      onTitle: setActiveSection ? () => setActiveSection('staff-changes') : null });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, openFlags.length, canEdit]);

  // ── Cells for the per-check week detail ─────────────────────────────
  const cellBase = { background: 'var(--g-tile)', border: '1px solid var(--g-border)', borderRadius: 6, padding: '6px 8px', minHeight: 34, fontSize: 12, color: 'var(--g-text-hi)' };
  const closedCell = (d) => <div style={{ ...cellBase, color: 'var(--g-text-faint)', textAlign: 'center' }}>{d.closed ? (d.closedReason || 'Closed') : 'No export yet'}</div>;
  const DayHead = ({ d }) => (
    <button onClick={() => jumpToDay(d.iso)} style={{ ...S.link, textAlign: 'center', fontSize: 11, fontWeight: 600, color: d.isToday ? 'var(--accent-text)' : 'var(--g-text-mid)', paddingBottom: 2 }} title="Open this day">
      {d.dayName.slice(0, 3)} <span style={{ fontWeight: 400, color: 'var(--meta)' }}>{d.dt.getDate()}</span>
    </button>
  );
  const Grid = ({ rows }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(5, minmax(0, 1fr))', gap: 3, minWidth: 640 }}>
      <div />
      {days.map((d) => <DayHead key={d.iso} d={d} />)}
      {rows.map(([label, render]) => (
        <Fragment key={label}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-text-hi)', display: 'flex', alignItems: 'center' }}>{label}</div>
          {days.map((d) => <Fragment key={`${label}-${d.iso}`}>{(d.closed || !d.hasData) ? closedCell(d) : render(d)}</Fragment>)}
        </Fragment>
      ))}
    </div>
  );

  const urgentCell = (u) => {
    if (!u) return <div style={cellBase}>—</div>;
    const col = u.target > 0 ? (u.pct >= 100 ? OK : u.pct >= 80 ? SEV.medium.colour : SEV.high.colour) : 'var(--g-text-mid)';
    return (
      <button onClick={openCapacity} style={{ ...S.link, ...cellBase, width: '100%' }} title="Open the capacity week view">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono-data" style={{ fontSize: 15, color: col }}>{u.slots}</span>
          <span style={S.meta}>{u.target > 0 ? `of ${u.target}` : 'no target'}</span>
          {u.pct != null && <span className="ml-auto font-mono-data" style={{ fontSize: 11, color: col }}>{u.pct}%</span>}
        </div>
        {u.target > 0 && <div style={{ height: 3, borderRadius: 999, background: 'var(--g-border)', marginTop: 5, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, u.pct)}%`, height: '100%', background: col }} /></div>}
      </button>
    );
  };
  const siteCell = (d, site) => {
    const e = d.sites.find((x) => x.site.name === site.name);
    if (!e) return <div style={cellBase}>—</div>;
    return (
      <div style={{ ...cellBase, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {['am', 'pm'].map((s) => {
          const sess = e.sessions?.[s];
          if (!sess) return <div key={s}><span style={S.meta}>{s.toUpperCase()}</span><div style={{ color: 'var(--g-text-faint)' }}>—</div></div>;
          const col = STATE_COLOUR[sess.state] || STATE_COLOUR.none;
          return (
            <div key={s} title={sess.clins.map((c) => `${displayNameFor(c.name, clinicians)}${c.duty ? ' (duty)' : ''}${c.offering ? '' : ' - nothing bookable'}`).join('\n')}>
              <span style={S.meta}>{s.toUpperCase()}</span>
              <div className="flex items-baseline gap-1"><span className="font-mono-data" style={{ fontSize: 15, color: col }}>{sess.offering}</span>{e.threshold != null && <span style={S.meta}>/ {e.threshold}</span>}</div>
            </div>
          );
        })}
      </div>
    );
  };
  const dutyCell = (d) => (
    <div style={{ ...cellBase, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {['am', 'pm'].map((s) => (
        <div key={s}>
          <span style={S.meta}>{s.toUpperCase()}</span>
          <div>{d.duty[s] ? <Person name={d.duty[s].name} display={d.duty[s].display} duty /> : <span style={{ color: week.hasDutyConfig ? SEV.high.colour : 'var(--g-text-faint)' }}>{week.hasDutyConfig ? 'none' : '—'}</span>}</div>
        </div>
      ))}
    </div>
  );
  const wardCell = (d, round) => {
    const r = d.wardRounds.find((x) => x.id === round.id);
    if (!r) return <div style={{ ...cellBase, color: 'var(--g-text-faint)', textAlign: 'center' }}>·</div>;
    const col = r.status === 'uncovered' ? SEV.high.colour : r.status === 'inferred' ? SEV.medium.colour : OK;
    return (
      <div style={{ ...cellBase, borderLeft: `3px solid ${col}` }}>
        {r.holders.length === 0 ? <span style={{ color: col, fontWeight: 600 }}>Nobody</span>
          : r.holders.map((h, i) => <div key={i}><Person name={h.name} display={h.display} /> <span style={S.meta}>{h.session.toUpperCase()}</span></div>)}
      </div>
    );
  };
  const listCell = (items, render) => (!items.length
    ? <div style={{ ...cellBase, color: 'var(--g-text-faint)' }}>none</div>
    : <div style={{ ...cellBase, display: 'flex', flexDirection: 'column', gap: 2 }}>{items.map(render)}</div>);

  const checkDetail = (id) => {
    switch (id) {
      case 'urgent': return <Grid rows={[['Urgent AM', (d) => urgentCell(d.urgent.am)], ['Urgent PM', (d) => urgentCell(d.urgent.pm)]]} />;
      case 'demand': return <Grid rows={[['Predicted', (d) => {
        const { predicted, urgentTotal } = d.demand;
        if (predicted == null) return <div style={{ ...cellBase, color: 'var(--g-text-faint)' }}>—</div>;
        const over = urgentTotal != null && predicted > urgentTotal;
        return <div style={cellBase}><span className="font-mono-data" style={{ fontSize: 15, color: over ? SEV.medium.colour : 'var(--g-text-hi)' }}>{predicted}</span> <span style={S.meta}>vs {urgentTotal} urgent</span></div>;
      }]]} />;
      case 'sites': return <Grid rows={week.sites.map((site) => [site.name, (d) => siteCell(d, site)])} />;
      case 'duty': return <Grid rows={[['Duty', dutyCell]]} />;
      case 'wards': return <Grid rows={[
        ...week.config.wardRounds.map((r) => [r.name, (d) => wardCell(d, r)]),
        [week.config.wardRounds.length ? 'Unmatched' : 'Ward round slots', (d) => listCell(week.config.wardRounds.length ? d.unassignedWardRounds : d.wardRoundHolders, (h, i) => <div key={i}><Person name={h.name} display={h.display} /> <span style={S.meta}>{h.session.toUpperCase()} · {h.count}</span></div>)],
      ]} />;
      case 'activities': return <Grid rows={[['Activities', (d) => listCell(d.activities, (a, i) => <div key={i} title={`${a.type}: ${a.count} slots`}><Person name={a.name} display={a.display} /> <span style={S.meta}>{a.session.toUpperCase()} · {a.type.replace(/^\d{4}\s+/, '')}</span></div>)]]} />;
      case 'plan': return <Grid rows={[['Mismatches', (d) => {
        const m = d.mismatches;
        const items = [
          ...m.plannedNoEmis.map((x) => ({ key: `p${x.id}${x.session}`, name: x.name, note: `${x.session.toUpperCase()} · rota, no EMIS slots`, colour: SEV.high.colour })),
          ...m.emisButAway.map((x) => ({ key: `e${x.id}${x.session}`, name: x.name, note: `${x.session.toUpperCase()} · away, ${x.slots} slots`, colour: SEV.high.colour })),
          ...m.unknownNames.map((n) => ({ key: `u${n}`, name: n, display: n.replace(/\s*\([^)]*\)\s*$/, ''), note: 'not on register', colour: SEV.info.colour })),
        ];
        if (!items.length) return <div style={{ ...cellBase, color: OK }}>Agree</div>;
        return listCell(items, (x) => <div key={x.key} style={{ color: x.colour }}><Person name={x.name} display={x.display} /> <span style={S.meta}>{x.note}</span></div>);
      }]]} />;
      case 'staff': return (
        <div style={{ fontSize: 12.5, color: 'var(--g-text-hi)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {week.staffChanges.length === 0 && <span style={{ color: 'var(--meta)' }}>No starts, leavers, session changes or leave beginning or ending this week.</span>}
          {week.staffChanges.map((c) => <div key={c.id}><button onClick={() => jumpToDay(c.date)} style={{ ...S.link, color: 'var(--meta)', fontWeight: 600 }}>{fmtDate(c.date)}</button> {c.text}</div>)}
        </div>
      );
      default: return null;
    }
  };

  // ── One day, in full ────────────────────────────────────────────────
  const dayFlags = (d) => d.flags.filter(isOpen);
  const dayVerdict = (d) => {
    if (d.closed) return { text: d.closedReason || 'Closed', colour: 'var(--g-text-faint)' };
    if (!d.hasData) return { text: 'No export yet', colour: 'var(--g-text-faint)' };
    const fl = dayFlags(d);
    const high = fl.filter((f) => f.severity === 'high').length;
    const med = fl.filter((f) => f.severity === 'medium').length;
    if (high) return { text: `${high} to fix`, colour: SEV.high.colour };
    if (med) return { text: `${med} to check`, colour: SEV.medium.colour };
    if (fl.length) return { text: `${fl.length} to note`, colour: SEV.info.colour };
    return { text: 'All good', colour: OK };
  };
  const FlagActions = ({ flag }) => {
    const ack = acknowledged[flag.id];
    if (!canEdit && !ack) return null;
    return ack
      ? <span style={{ ...S.meta, marginLeft: 'auto', flex: 'none' }} title={`Acknowledged by ${ack.by}, ${fmtWhen(ack.at)}: ${ack.reason}`}>ok: {ack.reason}{canEdit && <> · <button onClick={() => unacknowledge(flag)} disabled={saving} style={{ ...S.link, textDecoration: 'underline', color: 'var(--meta)' }}>undo</button></>}</span>
      : <button onClick={() => acknowledge(flag)} disabled={saving} style={{ ...S.meta, marginLeft: 'auto', flex: 'none', color: 'var(--g-text-mid)', background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', borderRadius: 6, padding: '1px 7px', cursor: 'pointer' }}>fine, because…</button>;
  };
  // A line of the day checklist: dot, label, value, and the flag's
  // acknowledge button when the line has a flag.
  const Line = ({ colour, label, children, flag, onClick }) => (
    <div className="flex items-center gap-2 flex-wrap" style={{ padding: '5px 0', borderBottom: '1px solid var(--g-border)', fontSize: 12.5, color: 'var(--g-text-hi)' }}>
      <Dot colour={colour} />
      {onClick ? <button onClick={onClick} style={{ ...S.link, width: 120, flex: 'none', color: 'var(--g-text-mid)', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{label}</button> : <span style={{ width: 120, flex: 'none', color: 'var(--g-text-mid)' }}>{label}</span>}
      <span className="flex items-center gap-1.5 flex-wrap" style={{ minWidth: 0 }}>{children}</span>
      {flag && <FlagActions flag={flag} />}
    </div>
  );
  const findFlag = (d, kind, key) => d.flags.find((f) => f.kind === kind && (key == null || f.id.endsWith(':' + key)));

  const DayPanel = ({ d }) => {
    const v = dayVerdict(d);
    return (
      <div ref={dayPanelRef} style={{ ...S.card, padding: '12px 16px', marginTop: 8, borderTop: `3px solid ${v.colour}` }}>
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--g-text-hi)' }}>{d.dayName} {fmtDate(d.iso)}</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: v.colour }}>{v.text}</span>
          <span className="ml-auto flex items-center gap-2">
            {onOpenDate && <Button variant="secondary" size="xs" onClick={() => openDay(d.iso)}>Open on Today</Button>}
            <button onClick={() => setDayOpen(null)} aria-label="Close" style={{ ...S.navBtn, padding: '2px 8px' }}>✕</button>
          </span>
        </div>
        {(d.closed || !d.hasData) ? (
          <div style={{ fontSize: 13, color: 'var(--meta)', padding: '8px 0' }}>{d.closed ? `${d.closedReason || 'Closed'}. ${d.hasData ? 'EMIS still has slots on this day.' : 'Nothing to check.'}` : 'The EMIS export does not reach this day yet. Upload a longer export on Today to check it.'}</div>
        ) : (
          <div>
            {['am', 'pm'].map((s) => {
              const u = d.urgent[s];
              const col = !u || u.target <= 0 ? 'var(--g-text-faint)' : u.pct >= 100 ? OK : u.pct >= 80 ? SEV.medium.colour : SEV.high.colour;
              return <Line key={s} colour={col} label={`Urgent ${s.toUpperCase()}`} flag={findFlag(d, 'urgent-short', s)} onClick={onOpenWeek ? openCapacity : null}>
                <span className="font-mono-data" style={{ color: col }}>{u?.slots ?? 0}</span><span style={S.meta}>{u?.target > 0 ? `of ${u.target} target (${u.pct}%)` : 'no target set'}</span>
              </Line>;
            })}
            <Line colour={d.demand.predicted == null ? 'var(--g-text-faint)' : d.demand.predicted > d.demand.urgentTotal ? SEV.medium.colour : OK} label="Demand" flag={findFlag(d, 'demand-over')}>
              {d.demand.predicted == null ? <span style={S.meta}>no prediction</span> : <><span className="font-mono-data">{d.demand.predicted}</span><span style={S.meta}>predicted vs {d.demand.urgentTotal} urgent slots</span></>}
            </Line>
            {d.sites.map((e) => ['am', 'pm'].map((s) => {
              const sess = e.sessions?.[s];
              if (!sess) return null;
              const col = STATE_COLOUR[sess.state] || STATE_COLOUR.none;
              return <Line key={`${e.site.name}${s}`} colour={sess.offering === 0 && sess.clins.length ? SEV.medium.colour : col} label={`${e.site.name} ${s.toUpperCase()}`} flag={findFlag(d, 'site-short', `${e.site.name}:${s}`) || findFlag(d, 'site-nobody-offering', `${e.site.name}:${s}`)} onClick={onOpenWeek ? openCapacity : null}>
                <span className="font-mono-data" style={{ color: col }}>{sess.offering}</span><span style={S.meta}>{e.threshold != null ? `of ${e.threshold} minimum` : 'offering'} ·</span>
                {sess.clins.map((c) => <Person key={c.name} name={c.name} display={displayNameFor(c.name, clinicians)} duty={c.duty} dim={!c.offering} />)}
              </Line>;
            }))}
            {week.hasDutyConfig && ['am', 'pm'].map((s) => (
              <Line key={`duty${s}`} colour={d.duty[s] ? OK : SEV.high.colour} label={`Duty ${s.toUpperCase()}`} flag={findFlag(d, 'duty-missing', s)}>
                {d.duty[s] ? <Person name={d.duty[s].name} display={d.duty[s].display} duty /> : <span style={{ color: SEV.high.colour }}>nobody holds the duty slot</span>}
              </Line>
            ))}
            {d.wardRounds.map((r) => (
              <Line key={r.id} colour={r.status === 'uncovered' ? SEV.high.colour : r.status === 'inferred' ? SEV.medium.colour : OK} label={r.name} flag={findFlag(d, 'ward-uncovered', r.id) || d.flags.find((f) => f.kind === 'duty-clash' && f.id.includes(`:${r.id}:`))} onClick={canEdit ? () => setSetupOpen(true) : null}>
                {r.holders.length === 0 ? <span style={{ color: SEV.high.colour }}>nobody holds ward round slots</span>
                  : r.holders.map((h, i) => <Fragment key={i}><Person name={h.name} display={h.display} /><span style={S.meta}>{h.session.toUpperCase()} · {h.count} slots</span></Fragment>)}
                {r.status === 'inferred' && <span style={{ ...S.meta, color: SEV.medium.colour }}>not the usual GP</span>}
              </Line>
            ))}
            {(week.config.wardRounds.length ? d.unassignedWardRounds : d.wardRoundHolders).length > 0 && (
              <Line colour={SEV.info.colour} label={week.config.wardRounds.length ? 'Other rounds' : 'Ward rounds'} flag={findFlag(d, 'ward-unclear')}>
                {(week.config.wardRounds.length ? d.unassignedWardRounds : d.wardRoundHolders).map((h, i) => <Fragment key={i}><Person name={h.name} display={h.display} /><span style={S.meta}>{h.session.toUpperCase()} · {h.count}</span></Fragment>)}
              </Line>
            )}
            {d.activities.length > 0 && (
              <Line colour="var(--g-text-mid)" label="Activities">
                {d.activities.map((a, i) => <Fragment key={i}><Person name={a.name} display={a.display} /><span style={S.meta}>{a.session.toUpperCase()} {a.type.replace(/^\d{4}\s+/, '')}{i < d.activities.length - 1 ? ' ·' : ''}</span></Fragment>)}
              </Line>
            )}
            {d.mismatches.plannedNoEmis.map((x) => (
              <Line key={`p${x.id}${x.session}`} colour={SEV.high.colour} label="Not on EMIS" flag={findFlag(d, 'plan-no-emis', `${x.id}:${x.session}`)}>
                <Person name={x.name} display={x.name} /><span style={S.meta}>on the rota {x.session.toUpperCase()}, no EMIS slots</span>
              </Line>
            ))}
            {d.mismatches.emisButAway.map((x) => (
              <Line key={`e${x.id}${x.session}`} colour={SEV.high.colour} label="Away, slots open" flag={findFlag(d, 'emis-but-away', `${x.id}:${x.session}`)}>
                <Person name={x.name} display={x.name} /><span style={S.meta}>{x.reason.toLowerCase()} {x.session.toUpperCase()}, {x.slots} slots still on EMIS</span>
              </Line>
            ))}
            {d.mismatches.unknownNames.length > 0 && (
              <Line colour={SEV.info.colour} label="Not on register" flag={findFlag(d, 'unknown-name')}>
                {d.mismatches.unknownNames.map((n) => <span key={n} style={{ fontWeight: 600 }}>{short(n.replace(/\s*\([^)]*\)\s*$/, ''))}</span>)}
              </Line>
            )}
            {!d.mismatches.plannedNoEmis.length && !d.mismatches.emisButAway.length && (
              <Line colour={OK} label="Plan vs EMIS"><span style={{ color: OK }}>agree</span></Line>
            )}
            {d.flags.filter((f) => f.kind === 'staff-change').map((f) => (
              <Line key={f.id} colour={SEV.info.colour} label="Staff change" onClick={setActiveSection ? () => setActiveSection('staff-changes') : null}><span>{f.text}</span></Line>
            ))}
          </div>
        )}
      </div>
    );
  };

  const statusColour = reviewed ? OK : openCounts.high ? SEV.high.colour : openCounts.medium ? SEV.medium.colour : OK;
  const selectedDay = days.find((d) => d.iso === dayOpen) || null;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, color: 'var(--g-text-hi)', lineHeight: 1.2, marginRight: 'auto' }}>Week in review</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset((o) => o - 1)} style={S.navBtn} aria-label="Previous week">&#8249;</button>
          <button onClick={() => setOffset(1)} style={{ ...S.navBtn, fontSize: 11, fontWeight: 600, background: offset === 1 ? 'var(--accent-soft)' : S.navBtn.background, color: offset === 1 ? 'var(--accent-text)' : S.navBtn.color }}>Next week</button>
          <button onClick={() => setOffset(0)} style={{ ...S.navBtn, fontSize: 11, fontWeight: 600, background: offset === 0 ? 'var(--accent-soft)' : S.navBtn.background, color: offset === 0 ? 'var(--accent-text)' : S.navBtn.color }}>This week</button>
          <button onClick={() => setOffset((o) => o + 1)} style={S.navBtn} aria-label="Next week">&#8250;</button>
        </div>
        <span style={{ fontSize: 13, color: 'var(--g-text-hi)', fontWeight: 600 }}>w/c {week.label}</span>
        {canEdit && (
          <button onClick={() => setSetupOpen((o) => !o)} title="Set up ward rounds and activity slot types" aria-label="Set up"
            style={{ width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--g-border-2)', background: setupOpen ? 'var(--accent-soft)' : 'var(--g-tile)', color: 'var(--g-text-mid)', cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
          </button>
        )}
      </div>

      {/* ── Status line ── */}
      <div className="flex items-center gap-3 flex-wrap mb-3 px-4 py-2.5" style={{ ...S.card, borderLeft: `4px solid ${statusColour}` }}>
        <div className="flex-1 min-w-[220px]" style={{ fontSize: 13, color: 'var(--g-text-hi)' }}>
          {reviewed ? (
            <><strong style={{ color: OK }}>Reviewed</strong> by {review.reviewed_by_name || 'someone'}, {fmtWhen(review.reviewed_at)}{review.note && <span style={{ color: 'var(--meta)' }}> · {review.note}</span>}</>
          ) : !week.hasCsv ? <><strong>Not yet reviewed.</strong> Upload an EMIS export on Today to check this week.</>
          : !week.hasData ? <><strong>Not yet reviewed.</strong> The EMIS export does not reach this week yet.</>
          : openFlags.length === 0 ? <><strong>Nothing open.</strong> Every check passes or has been acknowledged.</>
          : <><strong>Not yet reviewed.</strong>{' '}
              {['high', 'medium', 'info'].filter((s) => openCounts[s]).map((s, i) => <Fragment key={s}>{i > 0 && ', '}<span style={{ color: SEV[s].colour, fontWeight: 600 }}>{openCounts[s]} {SEV[s].label}</span></Fragment>)}.
            </>}
        </div>
        {canEdit && week.hasData && (reviewed
          ? <Button variant="secondary" size="sm" onClick={reopen} disabled={saving}>Reopen</Button>
          : <Button variant="primary" size="sm" onClick={markReviewed} disabled={saving}>Mark week reviewed</Button>)}
      </div>

      {setupOpen && canEdit && (
        <SetupPanel hs={hs} huddleData={huddleData} clinicians={clinicians} onSave={saveConfig} onClose={() => setSetupOpen(false)} />
      )}

      {/* ── Day tiles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
        {days.map((d) => {
          const v = dayVerdict(d);
          const open = dayOpen === d.iso;
          return (
            <button key={d.iso} onClick={() => setDayOpen(open ? null : d.iso)} aria-expanded={open}
              style={{ ...S.card, textAlign: 'left', padding: '10px 12px', cursor: 'pointer', borderColor: open ? 'var(--accent)' : d.isToday ? 'var(--accent-soft)' : 'var(--g-border)', borderTop: `3px solid ${v.colour}`, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div className="flex items-baseline gap-1.5" style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-text-hi)' }}>{d.dayName.slice(0, 3)}</span>
                <span style={S.meta}>{d.dt.getDate()}</span>
                <span className="ml-auto" style={{ fontSize: 12, fontWeight: 600, color: v.colour, whiteSpace: 'nowrap' }}>{v.text}</span>
              </div>
              {d.hasData && !d.closed && (
                <>
                  <div style={{ fontSize: 11.5, color: 'var(--g-text-mid)', display: 'flex', gap: 8, minWidth: 0 }}>
                    <span style={{ ...S.meta, flex: 'none' }}>Duty</span>
                    <span style={{ color: d.duty.am ? DUTY.fg : SEV.high.colour, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.duty.am ? short(d.duty.am.display) : (week.hasDutyConfig ? 'none' : '—')}</span>
                    <span style={{ color: d.duty.pm ? DUTY.fg : SEV.high.colour, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.duty.pm ? short(d.duty.pm.display) : (week.hasDutyConfig ? 'none' : '—')}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {['am', 'pm'].map((s) => {
                      const u = d.urgent[s];
                      const col = !u || u.target <= 0 ? 'var(--g-text-faint)' : u.pct >= 100 ? OK : u.pct >= 80 ? SEV.medium.colour : SEV.high.colour;
                      return (
                        <div key={s}>
                          <div className="flex items-baseline gap-1"><span style={S.meta}>{s.toUpperCase()}</span><span className="font-mono-data" style={{ fontSize: 13, color: col }}>{u?.target > 0 ? `${u.pct}%` : (u?.slots ?? 0)}</span></div>
                          <div style={{ height: 3, borderRadius: 999, background: 'var(--g-border)', overflow: 'hidden' }}><div style={{ width: `${u?.target > 0 ? Math.min(100, u.pct) : 0}%`, height: '100%', background: col }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="flex items-center" style={{ ...S.meta, marginTop: 'auto' }}>{open ? 'Hide detail' : 'Show detail'}<Chevron open={open} /></div>
            </button>
          );
        })}
      </div>
      {selectedDay && <DayPanel d={selectedDay} />}

      {/* ── Checks across the week ── */}
      <div style={{ ...S.card, marginTop: 12, overflow: 'hidden' }}>
        {checks.length === 0 && <div style={{ padding: 14, fontSize: 13, color: 'var(--meta)' }}>{week.hasCsv ? 'The EMIS export does not reach this week, so there is nothing to check yet.' : 'Upload an EMIS export on Today to check this week.'}</div>}
        {checks.map((c, i) => {
          const open = !!checksOpen[c.id];
          return (
            <div key={c.id} style={{ borderTop: i ? '1px solid var(--g-border)' : 'none' }}>
              <div className="flex items-center gap-3" style={{ padding: '10px 14px' }}>
                <button onClick={() => toggleCheck(c.id)} aria-expanded={open} className="flex items-center gap-3 flex-1 min-w-0" style={{ ...S.link }}>
                  <Chevron open={open} />
                  <Dot colour={c.colour} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-text-hi)', flex: 'none' }}>{c.title}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: c.colour, flex: 'none' }}>{c.text}</span>
                  <span className="truncate hidden sm:inline" style={{ ...S.meta, minWidth: 0 }}>{c.sub}</span>
                </button>
                {c.onTitle && <button onClick={c.onTitle} style={{ ...S.meta, background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', color: 'var(--g-text-mid)', flex: 'none' }}>{c.id === 'wards' ? 'Set up' : c.id === 'staff' ? 'Open' : 'Capacity week'}</button>}
              </div>
              {open && <div style={{ padding: '0 14px 12px 14px', overflowX: 'auto' }}>{checkDetail(c.id)}</div>}
            </div>
          );
        })}
      </div>

      {/* ── Open flags ── */}
      {week.flags.length > 0 && (
        <div style={{ ...S.card, marginTop: 12, padding: '0 14px 0 14px' }}>
          <div className="flex items-center gap-3 flex-wrap" style={{ padding: '10px 0' }}>
            <button onClick={() => setItemsOpen((v) => !v)} aria-expanded={itemsOpen} className="flex items-center gap-2" style={{ ...S.link, fontSize: 13, color: 'var(--g-text-hi)', fontWeight: 600 }}>
              <Chevron open={itemsOpen} />All open items
              <span style={{ ...S.meta, fontWeight: 400 }}>{openFlags.length} open · the same items as the day tiles, in one list</span>
            </button>
            {itemsOpen && week.flags.length - openFlags.length > 0 && (
              <button onClick={() => setShowAck((v) => !v)} style={{ ...S.link, ...S.meta, textDecoration: 'underline', marginLeft: 'auto' }}>{showAck ? 'hide' : 'show'} {week.flags.length - openFlags.length} acknowledged</button>
            )}
          </div>
          {itemsOpen && openFlags.length === 0 && !showAck && <div style={{ fontSize: 13, color: 'var(--meta)', paddingBottom: 12 }}>Nothing open.</div>}
          {itemsOpen && <div className="flex flex-col gap-1" style={{ paddingBottom: 12 }}>
            {(showAck ? week.flags : openFlags).map((f) => {
              const ack = acknowledged[f.id];
              return (
                <div key={f.id} className="flex items-center gap-2 flex-wrap rounded-md px-2.5 py-1.5" style={{ background: ack ? 'var(--g-tile)' : SEV[f.severity].soft, border: `1px solid ${ack ? 'var(--g-border)' : SEV[f.severity].colour}`, opacity: ack ? 0.7 : 1 }}>
                  <Dot colour={SEV[f.severity].colour} />
                  <button onClick={() => jumpToDay(f.iso)} style={{ ...S.link, fontSize: 12.5, color: 'var(--g-text-hi)', lineHeight: 1.35, flex: '1 1 240px', minWidth: 0 }} title="Open this day">
                    <span style={{ color: 'var(--meta)', fontWeight: 600 }}>{f.day.slice(0, 3)} </span>{f.text}
                  </button>
                  <FlagActions flag={f} />
                </div>
              );
            })}
          </div>}
        </div>
      )}

      {/* ── About ── */}
      <div style={{ ...S.card, marginTop: 12 }}>
        <button onClick={() => setAboutOpen((v) => !v)} aria-expanded={aboutOpen} className="flex items-center gap-2" style={{ ...S.link, padding: '10px 14px', width: '100%', fontSize: 13, color: 'var(--g-text-mid)' }}>
          <Chevron open={aboutOpen} />How these checks work
        </button>
        {aboutOpen && (
          <ul style={{ fontSize: 12.5, color: 'var(--meta)', padding: '0 14px 12px 36px', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Urgent slots count every urgent-type slot on the day, booked or not, against the target set in Capacity planning.</li>
            <li>A clinician counts for a site only when they have bookable slots there in that session. Being based there counts for nothing.</li>
            <li>Ward round slots say a GP is doing a round, not which home, so each home is matched by its usual GP. Amber means someone else holds the slots: check they are covering it.</li>
            <li>Plan against EMIS compares the session rota and absences with who actually has EMIS slots. Someone on the rota with no slots is not set up. Someone away with slots needs them blocked.</li>
            <li>Acknowledge an item when it is fine, say why, and the next reviewer sees it. Mark the week reviewed when you have been through it.</li>
            <li>Names open that person on My rota. Days open on Today. Capacity figures open the capacity week view.</li>
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Set-up: which slot types mean a ward round, the homes and who usually
// does them, and which other slot types to list as activities. ──────────
function SetupPanel({ hs, huddleData, clinicians, onSave, onClose }) {
  const resolved = useMemo(() => resolveWeekReviewConfig(hs, huddleData), [hs, huddleData]);
  const [draft, setDraft] = useState(() => ({
    wardRoundTypes: resolved.wardRoundTypes,
    activityTypes: resolved.activityTypes,
    wardRounds: resolved.wardRounds.length ? resolved.wardRounds : [],
  }));
  const allTypes = useMemo(() => (huddleData?.allSlotTypes || []).slice().sort((a, b) => a.localeCompare(b)), [huddleData]);
  const [filter, setFilter] = useState('');
  const shown = allTypes.filter((t) => !filter || t.toLowerCase().includes(filter.toLowerCase()));
  const gpNames = useMemo(() => (clinicians || []).filter((c) => c.status !== 'left').map((c) => c.name).sort(), [clinicians]);

  const toggle = (key, t) => setDraft((d) => ({ ...d, [key]: d[key].includes(t) ? d[key].filter((x) => x !== t) : [...d[key], t] }));
  const setRound = (i, patch) => setDraft((d) => ({ ...d, wardRounds: d.wardRounds.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const addRound = () => setDraft((d) => ({ ...d, wardRounds: [...d.wardRounds, { id: `wr-${Date.now()}`, name: '', days: [], session: 'any', usual: [] }] }));
  const removeRound = (i) => setDraft((d) => ({ ...d, wardRounds: d.wardRounds.filter((_, k) => k !== i) }));
  const save = () => {
    onSave({
      wardRoundTypes: draft.wardRoundTypes,
      activityTypes: draft.activityTypes,
      wardRounds: draft.wardRounds.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim(), usual: r.usual.filter(Boolean) })),
    });
    onClose();
  };
  const suggestedWard = suggestWardRoundTypes(huddleData);
  const suggestedAct = suggestActivityTypes(huddleData);
  const inputStyle = { background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', borderRadius: 6, color: 'var(--g-text-hi)', fontSize: 12, padding: '4px 7px' };

  return (
    <div className="mb-3 p-4" style={{ ...S.card, borderColor: 'var(--accent)' }}>
      <div className="flex items-center justify-between mb-3">
        <div style={S.h2}>Set up week in review</div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={save}>Save</Button>
        </div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div style={{ ...S.tile, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-text-hi)' }}>Ward rounds</div>
          <div style={{ ...S.meta, marginBottom: 8 }}>Each home, the days it happens, and who usually does it. The EMIS slot does not say which home, so the usual GP is how a holder is matched to one.</div>
          <div className="flex flex-col gap-2">
            {draft.wardRounds.map((r, i) => (
              <div key={r.id} style={{ ...S.card, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="flex gap-2">
                  <input value={r.name} onChange={(e) => setRound(i, { name: e.target.value })} placeholder="Home name, e.g. Winscombe Hall" style={{ ...inputStyle, flex: 1 }} />
                  <select value={r.session} onChange={(e) => setRound(i, { session: e.target.value })} style={inputStyle}>
                    <option value="any">AM or PM</option><option value="am">AM</option><option value="pm">PM</option>
                  </select>
                  <button onClick={() => removeRound(i)} title="Remove" style={{ ...inputStyle, cursor: 'pointer', color: 'var(--c-red)' }}>✕</button>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {WEEKDAYS.map((d) => {
                    const on = r.days.includes(d);
                    return (
                      <button key={d} onClick={() => setRound(i, { days: on ? r.days.filter((x) => x !== d) : [...r.days, d].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)) })}
                        style={{ ...inputStyle, cursor: 'pointer', fontWeight: 600, background: on ? 'var(--accent-soft)' : inputStyle.background, color: on ? 'var(--accent-text)' : 'var(--g-text-mid)' }}>{d.slice(0, 3)}</button>
                    );
                  })}
                </div>
                <div>
                  <div style={S.meta}>Usually done by</div>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {r.usual.map((u, k) => (
                      <span key={k} className="text-[11px] rounded px-1.5 py-0.5 flex items-center gap-1" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }}>
                        {u}<button onClick={() => setRound(i, { usual: r.usual.filter((_, j) => j !== k) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--meta)', padding: 0 }}>✕</button>
                      </span>
                    ))}
                    <select value="" onChange={(e) => { if (e.target.value && !r.usual.includes(e.target.value)) setRound(i, { usual: [...r.usual, e.target.value] }); }} style={inputStyle}>
                      <option value="">add a GP…</option>
                      {gpNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={addRound}>Add a ward round</Button>
          </div>
        </div>

        <div style={{ ...S.tile, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-text-hi)' }}>Slot types</div>
          <div style={{ ...S.meta, marginBottom: 8 }}>Tick the slot types that mean a ward round (W) or another activity worth listing (A). Suggestions from the export are pre-ticked.</div>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter slot types…" style={{ ...inputStyle, width: '100%', marginBottom: 6 }} />
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {shown.map((t) => {
              const w = draft.wardRoundTypes.includes(t);
              const a = draft.activityTypes.includes(t);
              const hint = suggestedWard.includes(t) ? 'W?' : suggestedAct.includes(t) ? 'A?' : '';
              return (
                <div key={t} className="flex items-center gap-2" style={{ fontSize: 12, color: w || a ? 'var(--g-text-hi)' : 'var(--g-text-mid)' }}>
                  <label className="flex items-center gap-1" title="Ward round"><input type="checkbox" checked={w} onChange={() => toggle('wardRoundTypes', t)} /> W</label>
                  <label className="flex items-center gap-1" title="Other activity"><input type="checkbox" checked={a} onChange={() => toggle('activityTypes', t)} /> A</label>
                  <span className="truncate" style={{ flex: 1 }}>{t}</span>
                  {hint && <span style={{ ...S.meta, flex: 'none' }}>{hint}</span>}
                </div>
              );
            })}
            {shown.length === 0 && <div style={S.meta}>No slot types match.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
