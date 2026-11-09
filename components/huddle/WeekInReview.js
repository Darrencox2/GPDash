'use client';
// Week in review: the pre-flight check for a week.
//
// Opens on next week, because that is the week someone can still fix.
// One column per weekday, one row per thing that must be right before
// the week goes live on EMIS: urgent slots against target, GPs offering
// appointments per site, who is duty, who holds each ward round, what
// else is happening (teaching, clinics), predicted demand, and where the
// rota and EMIS disagree. Everything that is not fine is also a flag, in
// a list underneath, which the reviewer can acknowledge with a reason or
// go and fix. When the week has been looked at, an admin marks it
// reviewed, and that record (who, when) shows at the top.
//
// The numbers come from lib/week-review.js; this file only draws them.
import { useState, useEffect, useMemo, Fragment } from 'react';
import { assembleWeekReview, mondayOf, resolveWeekReviewConfig, suggestWardRoundTypes, suggestActivityTypes } from '@/lib/week-review';
import { canEditPracticeData } from '@/lib/permissions';
import { getSchoolHolidaysForLEA } from '@/lib/school-holidays-by-lea';
import { toLocalIso } from '@/lib/data';
import { createClient } from '@/utils/supabase/client';
import { Button, promptDialog, confirmDialog } from '@/components/ui';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SEV = {
  high:   { label: 'Needs fixing', colour: 'var(--state-short)', soft: 'rgba(239,68,68,0.12)' },
  medium: { label: 'Worth a look', colour: 'var(--state-tight)', soft: 'rgba(245,158,11,0.12)' },
  info:   { label: 'For information', colour: 'var(--c-cyan)', soft: 'rgba(6,182,212,0.10)' },
};
const STATE_COLOUR = { short: 'var(--state-short)', tight: 'var(--state-tight)', ok: 'var(--state-ok)', none: 'var(--g-text-faint)' };
const DUTY = { bg: 'var(--duty-bg)', bd: 'var(--duty-bd)', fg: 'var(--duty-fg)' };

const S = {
  card: { background: 'var(--g-panel)', border: '1px solid var(--g-border)', borderRadius: 'var(--r-lg)' },
  tile: { background: 'var(--g-tile-2)', border: '1px solid var(--g-border)', borderRadius: 'var(--r-md)' },
  h2: { fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 600, color: 'var(--g-text-hi)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  meta: { fontSize: 11, color: 'var(--meta)' },
  navBtn: { background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-mid)', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 13 },
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
// Short form for a grid cell: "Katie Ellison" -> "K Ellison" when long.
function short(name) {
  const s = String(name || '').trim();
  if (s.length <= 14) return s;
  const i = s.indexOf(' ');
  return i < 1 ? s : `${s[0]} ${s.slice(i + 1)}`;
}

export default function WeekInReview({ data, saveData, huddleData, toast, setActiveSection }) {
  const canEdit = canEditPracticeData(data);
  const hs = useMemo(() => data?.huddleSettings || {}, [data?.huddleSettings]);
  const practiceId = data?._v4?.practiceId || null;
  const userId = data?._v4?.userId || null;
  const myName = data?._v4?.linkedClinicianName || data?._v4?.userEmail || 'Someone';

  // Week offset from the current week. 1 = next week, the default: that
  // is the week there is still time to fix.
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

  // ── The sign-off record ─────────────────────────────────────────────
  const [review, setReview] = useState(null);   // row from week_reviews, or null
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
  const openFlags = week.flags.filter((f) => !acknowledged[f.id]);
  const openHigh = openFlags.filter((f) => f.severity === 'high').length;
  const reviewed = !!review?.reviewed_at;

  const markReviewed = async () => {
    let msg = `Mark w/c ${week.label} as reviewed?`;
    if (openHigh > 0) msg = `${openHigh} item${openHigh === 1 ? '' : 's'} still need${openHigh === 1 ? 's' : ''} fixing. Mark the week reviewed anyway?`;
    const ok = await confirmDialog({ title: 'Mark week reviewed', message: msg, confirmLabel: 'Mark reviewed' });
    if (!ok) return;
    const note = await promptDialog({ title: 'Anything to note for this week?', label: 'Note (optional)', defaultValue: review?.note || '' });
    await persist({ reviewed_by: userId, reviewed_by_name: myName, reviewed_at: new Date().toISOString(), note: note == null ? (review?.note || null) : (note.trim() || null) });
    toast?.('Week marked as reviewed');
  };
  const reopen = async () => {
    const ok = await confirmDialog({ title: 'Reopen this week', message: 'Clear the reviewed mark so the week is checked again?', confirmLabel: 'Reopen' });
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

  // ── Set-up panel (ward rounds, slot types) ──────────────────────────
  const [setupOpen, setSetupOpen] = useState(false);
  const saveConfig = (next) => {
    if (!canEdit) return;
    saveData({ ...data, huddleSettings: { ...hs, weekReview: next } }, false);
  };

  const days = week.days;
  const COLS = { display: 'grid', gridTemplateColumns: '150px repeat(5, minmax(150px, 1fr))', gap: 2, minWidth: 900 };
  const cellBase = { background: 'var(--g-tile-2)', border: '1px solid var(--g-border)', borderRadius: 6, padding: '6px 8px', minHeight: 36, fontSize: 12, color: 'var(--g-text-hi)' };
  const closedCell = (d) => (
    <div style={{ ...cellBase, color: 'var(--g-text-faint)', textAlign: 'center' }}>{d.closed ? (d.closedReason || 'Closed') : 'No export yet'}</div>
  );
  const RowLabel = ({ title, sub }) => (
    <div style={{ padding: '6px 8px 6px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-text-hi)', lineHeight: 1.2 }}>{title}</div>
      {sub && <div style={S.meta}>{sub}</div>}
    </div>
  );
  // A row is label + five cells; closed or export-less days get the
  // closed cell so the grid stays rectangular.
  const Row = ({ title, sub, render }) => (
    <Fragment>
      <RowLabel title={title} sub={sub} />
      {days.map((d) => <Fragment key={`${title}-${d.iso}`}>{(d.closed || !d.hasData) ? closedCell(d) : render(d)}</Fragment>)}
    </Fragment>
  );

  const urgentCell = (u) => {
    if (!u) return <div style={cellBase}>—</div>;
    const col = u.target > 0 ? (u.pct >= 100 ? 'var(--state-ok)' : u.pct >= 80 ? 'var(--state-tight)' : 'var(--state-short)') : 'var(--g-text-mid)';
    return (
      <div style={cellBase}>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono-data" style={{ fontSize: 16, color: col }}>{u.slots}</span>
          {u.target > 0 ? <span style={S.meta}>of {u.target}</span> : <span style={S.meta}>no target</span>}
          {u.pct != null && <span className="ml-auto font-mono-data" style={{ fontSize: 11, color: col }}>{u.pct}%</span>}
        </div>
        {u.target > 0 && (
          <div style={{ height: 4, borderRadius: 999, background: 'var(--g-border)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, u.pct)}%`, height: '100%', background: col }} />
          </div>
        )}
      </div>
    );
  };

  const siteCell = (d, site) => {
    const e = d.sites.find((x) => x.site.name === site.name);
    if (!e) return <div style={cellBase}>—</div>;
    return (
      <div style={{ ...cellBase, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {['am', 'pm'].map((s) => {
          const sess = e.sessions?.[s];
          if (!sess) return <div key={s} style={{ color: 'var(--g-text-faint)' }}><span style={S.meta}>{s.toUpperCase()}</span><div>—</div></div>;
          const col = STATE_COLOUR[sess.state] || STATE_COLOUR.none;
          return (
            <div key={s} title={sess.clins.map((c) => `${c.name}${c.duty ? ' (duty)' : ''}${c.offering ? '' : ' - nothing bookable'}`).join('\n')}>
              <span style={S.meta}>{s.toUpperCase()}</span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono-data" style={{ fontSize: 16, color: col }}>{sess.offering}</span>
                {e.threshold != null && <span style={S.meta}>/ {e.threshold}</span>}
              </div>
              <div style={{ height: 3, borderRadius: 999, background: col, opacity: sess.state === 'none' ? 0.3 : 1, marginTop: 3 }} />
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
          {d.duty[s]
            ? <div style={{ color: DUTY.fg, fontWeight: 600, lineHeight: 1.25 }} title={d.duty[s].name}>{short(d.duty[s].display)}</div>
            : <div style={{ color: week.hasDutyConfig ? 'var(--state-short)' : 'var(--g-text-faint)' }}>{week.hasDutyConfig ? 'none' : 'not set up'}</div>}
        </div>
      ))}
    </div>
  );

  const wardCell = (d, round) => {
    const r = d.wardRounds.find((x) => x.id === round.id);
    if (!r) return <div style={{ ...cellBase, color: 'var(--g-text-faint)', textAlign: 'center' }}>·</div>;
    const col = r.status === 'uncovered' ? 'var(--state-short)' : r.status === 'inferred' ? 'var(--state-tight)' : 'var(--state-ok)';
    return (
      <div style={{ ...cellBase, borderLeft: `3px solid ${col}` }}>
        {r.holders.length === 0
          ? <div style={{ color: col, fontWeight: 600 }}>Nobody</div>
          : r.holders.map((h, i) => (
            <div key={i} className="flex items-baseline gap-1.5" title={`${h.name}: ${h.count} ward round slots in the ${h.session.toUpperCase()}`}>
              <span style={{ fontWeight: 600 }}>{short(h.display)}</span>
              <span style={S.meta}>{h.session.toUpperCase()} · {h.count}</span>
            </div>
          ))}
        {r.status === 'inferred' && <div style={{ ...S.meta, color: 'var(--state-tight)' }}>not the usual GP - check</div>}
      </div>
    );
  };

  const holdersCell = (d) => {
    const list = week.config.wardRounds.length ? d.unassignedWardRounds : d.wardRoundHolders;
    if (!list?.length) return <div style={{ ...cellBase, color: 'var(--g-text-faint)' }}>none</div>;
    return (
      <div style={cellBase}>
        {list.map((h, i) => (
          <div key={i} className="flex items-baseline gap-1.5">
            <span style={{ fontWeight: 600 }}>{short(h.display)}</span>
            <span style={S.meta}>{h.session.toUpperCase()} · {h.count}</span>
          </div>
        ))}
      </div>
    );
  };

  const activityCell = (d) => {
    if (!d.activities.length) return <div style={{ ...cellBase, color: 'var(--g-text-faint)' }}>none</div>;
    return (
      <div style={{ ...cellBase, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {d.activities.map((a, i) => (
          <div key={i} style={{ lineHeight: 1.25 }} title={`${a.type}: ${a.count} slots`}>
            <span style={{ fontWeight: 600 }}>{short(a.display)}</span>
            <span style={S.meta}> {a.session.toUpperCase()} · {a.type.replace(/^\d{4}\s+/, '')}</span>
          </div>
        ))}
      </div>
    );
  };

  const demandCell = (d) => {
    const { predicted, urgentTotal } = d.demand;
    if (predicted == null) return <div style={{ ...cellBase, color: 'var(--g-text-faint)' }}>—</div>;
    const over = urgentTotal != null && predicted > urgentTotal;
    return (
      <div style={cellBase}>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono-data" style={{ fontSize: 16, color: over ? 'var(--state-tight)' : 'var(--g-text-hi)' }}>{predicted}</span>
          <span style={S.meta}>predicted</span>
          {urgentTotal != null && <span className="ml-auto" style={S.meta}>{urgentTotal} urgent</span>}
        </div>
      </div>
    );
  };

  const mismatchCell = (d) => {
    const m = d.mismatches;
    const n = m.plannedNoEmis.length + m.emisButAway.length + m.unknownNames.length;
    if (!n) return <div style={{ ...cellBase, color: 'var(--state-ok)' }}>Plan and EMIS agree</div>;
    return (
      <div style={{ ...cellBase, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {m.plannedNoEmis.map((x, i) => <div key={`p${i}`} style={{ color: 'var(--state-short)' }}>{short(x.name)} <span style={S.meta}>{x.session.toUpperCase()} · rota'd, no EMIS slots</span></div>)}
        {m.emisButAway.map((x, i) => <div key={`e${i}`} style={{ color: 'var(--state-short)' }}>{short(x.name)} <span style={S.meta}>{x.session.toUpperCase()} · away, {x.slots} slots</span></div>)}
        {m.unknownNames.length > 0 && <div style={{ color: 'var(--c-cyan)' }}>{m.unknownNames.length} not on register <span style={S.meta}>{m.unknownNames.map((x) => short(x.replace(/\s*\([^)]*\)\s*$/, ''))).join(', ')}</span></div>}
      </div>
    );
  };

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start gap-3 flex-wrap mb-4">
        <div className="flex-1 min-w-[240px]">
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, color: 'var(--g-text-hi)', lineHeight: 1.2 }}>Week in review</h1>
          <p style={{ fontSize: 13, color: 'var(--meta)', marginTop: 2 }}>Is next week set up on EMIS, and can we function? One row per thing to check, one column per day.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset((o) => o - 1)} style={S.navBtn} aria-label="Previous week">&#8249;</button>
            <button onClick={() => setOffset(1)} style={{ ...S.navBtn, fontSize: 11, fontWeight: 600, background: offset === 1 ? 'var(--accent-soft)' : S.navBtn.background, color: offset === 1 ? 'var(--accent-text)' : S.navBtn.color }}>Next week</button>
            <button onClick={() => setOffset(0)} style={{ ...S.navBtn, fontSize: 11, fontWeight: 600, background: offset === 0 ? 'var(--accent-soft)' : S.navBtn.background, color: offset === 0 ? 'var(--accent-text)' : S.navBtn.color }}>This week</button>
            <button onClick={() => setOffset((o) => o + 1)} style={S.navBtn} aria-label="Next week">&#8250;</button>
          </div>
          <span style={{ fontSize: 13, color: 'var(--g-text-hi)', fontWeight: 600 }}>w/c {week.label}</span>
          {canEdit && (
            <button onClick={() => setSetupOpen((o) => !o)} className="glass-cog" title="Set up ward rounds and activity slot types" aria-label="Set up"
              style={{ width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--g-border-2)', background: setupOpen ? 'var(--accent-soft)' : 'var(--g-tile)', color: 'var(--g-text-mid)', cursor: 'pointer' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Status strip ── */}
      <div className="flex items-center gap-3 flex-wrap mb-4 px-4 py-3" style={{ ...S.card, borderLeft: `4px solid ${reviewed ? 'var(--state-ok)' : openHigh ? 'var(--state-short)' : openFlags.length ? 'var(--state-tight)' : 'var(--state-ok)'}` }}>
        <div className="flex-1 min-w-[220px]">
          {reviewed ? (
            <div style={{ fontSize: 13, color: 'var(--g-text-hi)' }}>
              <strong style={{ color: 'var(--state-ok)' }}>Reviewed</strong> by {review.reviewed_by_name || 'someone'} on {fmtWhen(review.reviewed_at)}
              {review.note && <div style={{ ...S.meta, marginTop: 2, whiteSpace: 'pre-wrap' }}>{review.note}</div>}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--g-text-hi)' }}>
              <strong>Not yet reviewed.</strong>{' '}
              {!week.hasCsv ? 'Upload an EMIS export on Today to check this week.'
                : !week.hasData ? 'The EMIS export does not reach this week yet.'
                : openFlags.length === 0 ? 'Nothing is flagged.'
                : `${openFlags.length} open item${openFlags.length === 1 ? '' : 's'}${openHigh ? `, ${openHigh} need${openHigh === 1 ? 's' : ''} fixing` : ''}.`}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['high', 'medium', 'info'].map((sev) => week.counts[sev] > 0 && (
            <span key={sev} className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ background: SEV[sev].soft, color: SEV[sev].colour, border: `1px solid ${SEV[sev].colour}` }}>
              {week.counts[sev]} {SEV[sev].label.toLowerCase()}
            </span>
          ))}
          {canEdit && week.hasData && (reviewed
            ? <Button variant="secondary" size="sm" onClick={reopen} disabled={saving}>Reopen</Button>
            : <Button variant="primary" size="sm" onClick={markReviewed} disabled={saving}>Mark week reviewed</Button>)}
        </div>
      </div>

      {setupOpen && canEdit && (
        <SetupPanel hs={hs} huddleData={huddleData} clinicians={data?.clinicians} onSave={saveConfig} onClose={() => setSetupOpen(false)} />
      )}

      {/* ── The grid ── */}
      <div style={{ ...S.card, padding: 12, overflowX: 'auto' }}>
        <div style={COLS}>
          <div />
          {days.map((d) => (
            <div key={d.iso} className="text-center pb-1" style={{ borderBottom: d.isToday ? '2px solid var(--accent)' : '1px solid var(--g-border-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: d.isToday ? 'var(--accent-text)' : 'var(--g-text-hi)' }}>
                {d.dayName} <span style={{ fontWeight: 400, color: 'var(--meta)' }}>{fmtDate(d.iso)}</span>
              </div>
              {d.closed && <div style={{ fontSize: 11, color: 'var(--c-amber)' }}>{d.closedReason || 'Closed'}</div>}
              {!d.closed && !d.hasData && <div style={{ fontSize: 11, color: 'var(--g-text-faint)' }}>no export yet</div>}
              {d.flags.filter((f) => !acknowledged[f.id] && f.severity === 'high').length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--state-short)' }}>{d.flags.filter((f) => !acknowledged[f.id] && f.severity === 'high').length} to fix</div>
              )}
            </div>
          ))}

          <SectionBand title="Capacity" />
          <Row title="Urgent AM" sub={week.hasTargets ? 'slots against target' : 'no targets set'} render={(d) => urgentCell(d.urgent.am)} />
          <Row title="Urgent PM" sub={week.hasTargets ? 'slots against target' : 'no targets set'} render={(d) => urgentCell(d.urgent.pm)} />
          <Row title="Demand" sub="predicted urgent contacts" render={demandCell} />

          <SectionBand title="Clinicians offering appointments" sub="per site, against the site minimum" />
          {week.sites.length === 0 && (
            <Fragment>
              <RowLabel title="Sites" />
              <div style={{ ...cellBase, gridColumn: 'span 5', color: 'var(--meta)' }}>No sites are set up. Add them under Practice, Rooms and sites, and set a minimum per site in Capacity planning.</div>
            </Fragment>
          )}
          {week.sites.map((site) => (
            <Fragment key={site.name}>
              <div style={{ padding: '6px 8px 6px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 3, background: site.colour || '#64748b' }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-text-hi)' }}>{site.name}</div>
                  <div style={S.meta}>GPs with bookable slots</div>
                </div>
              </div>
              {days.map((d) => <Fragment key={`${site.name}-${d.iso}`}>{(d.closed || !d.hasData) ? closedCell(d) : siteCell(d, site)}</Fragment>)}
            </Fragment>
          ))}

          <SectionBand title="Duty and ward rounds" />
          <Row title="Duty doctor" sub="from the duty slot type" render={dutyCell} />
          {week.config.wardRounds.map((r) => (
            <Row key={r.id} title={r.name} sub={`${r.days.map((x) => x.slice(0, 3)).join(', ')}${r.session !== 'any' ? ' ' + r.session.toUpperCase() : ''}${r.usual.length ? ' · usually ' + r.usual.join(', ') : ''}`} render={(d) => wardCell(d, r)} />
          ))}
          <Row title={week.config.wardRounds.length ? 'Other ward round slots' : 'Ward round slots'} sub={week.config.wardRounds.length ? 'not matched to a home' : (canEdit ? 'set up the homes with the cog' : 'homes not set up yet')} render={holdersCell} />

          <SectionBand title="Other activities" sub="teaching, clinics, school visits" />
          <Row title="Activities" render={activityCell} />

          <SectionBand title="Plan against EMIS" sub="the rota says one thing, EMIS another" />
          <Row title="Mismatches" render={mismatchCell} />
        </div>
      </div>

      {/* ── Flags ── */}
      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div style={{ ...S.card, padding: 14 }}>
          <div className="flex items-center justify-between mb-2">
            <div style={S.h2}>Flags</div>
            <span style={S.meta}>{openFlags.length} open · {Object.keys(acknowledged).filter((k) => week.flags.some((f) => f.id === k)).length} acknowledged</span>
          </div>
          {week.flags.length === 0 && <div style={{ fontSize: 13, color: 'var(--meta)' }}>{week.hasData ? 'Nothing to flag this week.' : 'Flags appear once the EMIS export covers the week.'}</div>}
          <div className="flex flex-col gap-1.5">
            {week.flags.map((f, i) => {
              const ack = acknowledged[f.id];
              const first = i === 0 || week.flags[i - 1].severity !== f.severity;
              return (
                <Fragment key={f.id}>
                {first && <div className="label-caps" style={{ color: SEV[f.severity].colour, marginTop: i === 0 ? 0 : 8 }}>{SEV[f.severity].label}</div>}
                <div className="flex items-start gap-2 rounded-md px-2.5 py-2" style={{ background: ack ? 'var(--g-tile)' : SEV[f.severity].soft, border: `1px solid ${ack ? 'var(--g-border)' : SEV[f.severity].colour}`, opacity: ack ? 0.75 : 1 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: SEV[f.severity].colour, marginTop: 5, flex: 'none' }} />
                  <div className="flex-1 min-w-0" style={{ fontSize: 12.5, color: 'var(--g-text-hi)', lineHeight: 1.35 }}>
                    <span style={{ color: 'var(--meta)', fontWeight: 600 }}>{f.day.slice(0, 3)} </span>{f.text}
                    {ack && <div style={{ ...S.meta, marginTop: 2 }}>Acknowledged by {ack.by}, {fmtWhen(ack.at)}: {ack.reason}</div>}
                  </div>
                  {canEdit && (ack
                    ? <button onClick={() => unacknowledge(f)} disabled={saving} style={{ ...S.meta, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', flex: 'none' }}>undo</button>
                    : <button onClick={() => acknowledge(f)} disabled={saving} style={{ ...S.meta, color: 'var(--g-text-mid)', background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', flex: 'none' }}>fine, because…</button>)}
                </div>
                </Fragment>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div style={{ ...S.card, padding: 14 }}>
            <div style={S.h2}>Staff changes this week</div>
            {week.staffChanges.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--meta)', marginTop: 6 }}>No starts, leavers, session changes or leave beginning or ending this week.</div>
              : <div className="flex flex-col gap-1 mt-2">
                  {week.staffChanges.map((c) => (
                    <div key={c.id} style={{ fontSize: 12.5, color: 'var(--g-text-hi)' }}>
                      <span style={{ color: 'var(--meta)', fontWeight: 600 }}>{fmtDate(c.date)} </span>{c.text}
                    </div>
                  ))}
                  {setActiveSection && <button onClick={() => setActiveSection('staff-changes')} style={{ ...S.meta, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left', padding: 0, marginTop: 4 }}>Open staff changes</button>}
                </div>}
          </div>
          <div style={{ ...S.card, padding: 14 }}>
            <div style={S.h2}>How to read this</div>
            <ul style={{ fontSize: 12, color: 'var(--meta)', marginTop: 6, paddingLeft: 16, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <li>Urgent slots count every urgent-type slot on the day, booked or not, against the target set in Capacity planning.</li>
              <li>A clinician counts for a site only when they have bookable slots there in that session. Being based there counts for nothing.</li>
              <li>Ward round slots say a GP is doing a round, not which home, so each home is matched by its usual GP. Amber means someone else holds the slots: check they are covering it.</li>
              <li>Mismatches compare the session rota and absences with who actually has EMIS slots. Someone on the rota with no slots is not set up. Someone away with slots needs them blocked.</li>
              <li>Acknowledge a flag when it is fine, say why, and the next reviewer sees it.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionBand({ title, sub }) {
  return (
    <div style={{ gridColumn: '1 / -1', paddingTop: 10, paddingBottom: 2, display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span className="label-caps" style={{ color: 'var(--g-text-mid)' }}>{title}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--g-text-faint)' }}>{sub}</span>}
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
  const gpNames = useMemo(() => (Array.isArray(clinicians) ? clinicians : Object.values(clinicians || {})).filter((c) => c.status !== 'left').map((c) => c.name).sort(), [clinicians]);

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
    <div className="mb-4 p-4" style={{ ...S.card, borderColor: 'var(--accent)' }}>
      <div className="flex items-center justify-between mb-3">
        <div style={S.h2}>Set up week in review</div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={save}>Save</Button>
        </div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Ward rounds */}
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

        {/* Slot types */}
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
