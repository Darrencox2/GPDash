// ═══════════════════════════════════════════════════════════════════════════
// The weekly digest: five numbers, last week against the week before
// ═══════════════════════════════════════════════════════════════════════════
// The reporting page used to open on a catalogue of thirteen reports.
// What people actually want on a Monday is the handful of figures that
// moved, each one a door into the report that explains it. This computes
// those from the same facts the report builder uses, so a digest tile and
// the chart behind it can never disagree.
//
// "Last week" is the most recent week the export covers, not the calendar
// week, so a stalled upload shows the last real week rather than zeros.

const dowName = (d) => ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d];

function weekLabelOf(ms) {
  const d = new Date(ms);
  return `w/c ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
}

function slotTotals(facts) {
  let offered = 0, booked = 0, urgent = 0, routine = 0;
  const byDow = new Map();
  for (const f of facts) {
    if (f.isSystem) continue;
    const n = f.count || 0;
    offered += n;
    if (f.status === 'booked') { booked += n; byDow.set(f.dow, (byDow.get(f.dow) || 0) + n); }
    if (f.category === 'urgent') urgent += n;
    if (f.category === 'routine') routine += n;
  }
  let busiest = null;
  for (const [dow, n] of byDow) if (!busiest || n > busiest.n) busiest = { dow, n };
  return { offered, booked, urgent, routine, fill: offered > 0 ? (booked / offered) * 100 : null, busiest };
}

// Duty share spread: among clinicians who worked at least `minSessions`,
// the highest duty share minus the lowest, in percentage points. Zero means
// the duty load is shared evenly; forty means one person carries it.
function dutySpread(sessionFacts, minSessions = 3) {
  const per = new Map();
  for (const f of sessionFacts) {
    if (f.isSystem) continue;
    const p = per.get(f.clinicianId) || { worked: 0, duty: 0, name: f.clinicianName };
    p.worked += 1; if (f.isDuty) p.duty += 1;
    per.set(f.clinicianId, p);
  }
  const shares = [...per.values()].filter((p) => p.worked >= minSessions).map((p) => ({ ...p, share: (p.duty / p.worked) * 100 }));
  if (shares.length < 2 || !shares.some((s) => s.duty > 0)) return null;
  shares.sort((a, b) => b.share - a.share);
  return { spread: shares[0].share - shares[shares.length - 1].share, top: shares[0], bottom: shares[shares.length - 1] };
}

// The export usually reaches weeks ahead, full of slots nobody has booked
// yet. "Last week" must be the most recent week that has finished; failing
// that, the most recent one that has at least started.
export function pickWeeks(weekStarts, now = Date.now()) {
  const sorted = [...new Set(weekStarts)].sort((a, b) => b - a);
  const finished = sorted.filter((ms) => ms + 7 * 86400000 <= now);
  const started = sorted.filter((ms) => ms <= now);
  // Everything ahead of today: the nearest week, with nothing to compare.
  if (!finished.length && !started.length) return [sorted[sorted.length - 1], undefined];
  const pool = finished.length ? finished : started;
  const i = sorted.indexOf(pool[0]);
  return [sorted[i], sorted[i + 1]];
}

export function weeklyDigest({ slotFacts = [], sessionFacts = [], hasDuty = false, now = Date.now() } = {}) {
  const real = slotFacts.filter((f) => !f.isSystem);
  if (real.length === 0) return null;
  const [thisMs, prevMs] = pickWeeks(real.map((f) => f.weekStartMs), now);
  const inWeek = (ms) => (f) => f.weekStartMs === ms;
  const cur = slotTotals(slotFacts.filter(inWeek(thisMs)));
  const prev = prevMs != null ? slotTotals(slotFacts.filter(inWeek(prevMs))) : null;
  const curDuty = hasDuty ? dutySpread(sessionFacts.filter(inWeek(thisMs))) : null;
  const prevDuty = hasDuty && prevMs != null ? dutySpread(sessionFacts.filter(inWeek(prevMs))) : null;

  const pct = (v) => (v == null ? '—' : `${Math.round(v)}%`);
  const num = (v) => (v == null ? '—' : String(Math.round(v)));
  const delta = (a, b, unit = '') => {
    if (a == null || b == null) return null;
    const d = a - b;
    if (Math.abs(d) < 0.5) return { value: 0, display: 'no change' };
    return { value: d, display: `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d))}${unit}` };
  };

  const tiles = [
    { id: 'fill', label: 'Fill rate', display: pct(cur.fill), prevDisplay: pct(prev?.fill), delta: delta(cur.fill, prev?.fill, ' pts'), upIsGood: true, presetId: 'fill-by-week', note: `${cur.booked} of ${cur.offered} slots booked` },
    { id: 'urgent', label: 'Urgent slots offered', display: num(cur.urgent), prevDisplay: num(prev?.urgent), delta: delta(cur.urgent, prev?.urgent), upIsGood: true, presetId: 'urgent-by-week', note: 'book on the day and urgent telephone' },
    { id: 'routine', label: 'Routine slots offered', display: num(cur.routine), prevDisplay: num(prev?.routine), delta: delta(cur.routine, prev?.routine), upIsGood: true, presetId: 'routine-by-week', note: 'routine face to face and telephone' },
    { id: 'busiest', label: 'Busiest day', display: cur.busiest ? dowName(cur.busiest.dow) : '—', prevDisplay: prev?.busiest ? dowName(prev.busiest.dow) : '—', delta: null, upIsGood: null, presetId: 'booked-by-dow', note: cur.busiest ? `${cur.busiest.n} booked` : 'no bookings' },
  ];
  if (hasDuty) {
    tiles.splice(3, 0, {
      id: 'duty', label: 'Duty share spread', display: curDuty ? `${Math.round(curDuty.spread)} pts` : '—', prevDisplay: prevDuty ? `${Math.round(prevDuty.spread)} pts` : '—',
      delta: curDuty && prevDuty ? delta(curDuty.spread, prevDuty.spread, ' pts') : null, upIsGood: false, presetId: 'duty-share',
      note: curDuty ? `${curDuty.top.name.split(' ').pop()} ${Math.round(curDuty.top.share)}% to ${curDuty.bottom.name.split(' ').pop()} ${Math.round(curDuty.bottom.share)}%` : 'needs two people on duty',
    });
  }
  return { weekLabel: weekLabelOf(thisMs), prevLabel: prevMs != null ? weekLabelOf(prevMs) : null, thisMs, prevMs: prevMs ?? null, tiles };
}
