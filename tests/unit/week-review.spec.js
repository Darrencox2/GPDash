// Unit tests for lib/week-review.js: the week must assemble from partial
// data without throwing, and each check must fire on the case it exists
// for and stay quiet otherwise.
import { test, expect } from '@playwright/test';
import { assembleWeekReview, resolveWeekReviewConfig, suggestWardRoundTypes, suggestActivityTypes, mondayOf } from '../../lib/week-review.js';
import { toHuddleDateStr, toLocalIso } from '../../lib/data.js';

const MONDAY = new Date(2026, 10, 16);   // Mon 16 Nov 2026
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const GP = (id, name, csv) => ({ id, name, role: 'GP Partner', status: 'active', csvName: csv, buddyCover: true });
const PEOPLE = [GP('a', 'Darren Cox', 'COX, Darren (Dr)'), GP('b', 'Alice Blackwell', 'BLACKWELL, Alice (Dr)'), GP('c', 'Harry Lobb', 'LOBB, Harry (Dr)')];
const CSV = PEOPLE.map((p) => p.csvName).concat(['LOCUM, Pat (Dr)']);
const URGENT = 'Book on the day', ROUTINE = 'Routine', WARD = '2026 Nursing home ward round', TEACH = '2026 Teaching or Supervision';

// A week of EMIS data. `plan(dayIdx)` returns, per clinician index, the
// rows for that day: [{ session, type, n, location }].
function buildHuddle(plan) {
  const dates = [], dateData = {}, bookedData = {}, embargoedData = {}, blockedData = {}, slotRows = {}, locationData = {};
  for (let i = 0; i < 5; i++) {
    const dt = new Date(MONDAY); dt.setDate(dt.getDate() + i);
    const ds = toHuddleDateStr(dt);
    dates.push(ds);
    dateData[ds] = { am: {}, pm: {} }; bookedData[ds] = { am: {}, pm: {} }; embargoedData[ds] = { am: {}, pm: {} }; blockedData[ds] = { am: {}, pm: {} };
    slotRows[ds] = {}; locationData[ds] = {};
    const byClin = plan(i) || {};
    for (const [idx, rows] of Object.entries(byClin)) {
      slotRows[ds][idx] = [];
      for (const r of rows) {
        const sess = r.session;
        const store = dateData;
        store[ds][sess][idx] = store[ds][sess][idx] || {};
        store[ds][sess][idx][r.type] = (store[ds][sess][idx][r.type] || 0) + r.n;
        for (let k = 0; k < r.n; k++) slotRows[ds][idx].push({ time: sess === 'am' ? 'Before 12:59' : 'After or At 13:00', slotType: r.type, status: 'available', location: r.location || 'Winscombe Surgery', count: 1 });
        locationData[ds][idx] = locationData[ds][idx] || {};
        locationData[ds][idx][r.location || 'Winscombe Surgery'] = (locationData[ds][idx][r.location || 'Winscombe Surgery'] || 0) + r.n;
      }
    }
  }
  return { clinicians: CSV, allSlotTypes: [URGENT, ROUTINE, WARD, TEACH, 'Admin'], reportDate: dates[0], dates, dateData, bookedData, embargoedData, blockedData, locationData, splitSiteData: {}, slotLocationData: {}, slotRows };
}

// Everyone in both sessions with urgent and routine; Darren duty.
const normalDay = () => ({
  0: [{ session: 'am', type: URGENT, n: 8 }, { session: 'am', type: ROUTINE, n: 4 }, { session: 'pm', type: URGENT, n: 8 }, { session: 'pm', type: ROUTINE, n: 4 }],
  1: [{ session: 'am', type: URGENT, n: 2 }, { session: 'am', type: ROUTINE, n: 6 }, { session: 'pm', type: URGENT, n: 2 }, { session: 'pm', type: ROUTINE, n: 6 }],
  2: [{ session: 'am', type: ROUTINE, n: 6, location: 'Banwell Surgery' }, { session: 'pm', type: ROUTINE, n: 6, location: 'Banwell Surgery' }],
});

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const fullRota = Object.fromEntries(PEOPLE.map((p) => [p.id, Object.fromEntries(WEEKDAYS.map((d) => [d, ['M', 'A']]))]));

function baseData(extra = {}) {
  return {
    clinicians: PEOPLE,
    sessionRota: fullRota,
    roomAllocation: { sites: [{ name: 'Winscombe', colour: '#8b5cf6' }, { name: 'Banwell', colour: '#84cc16' }] },
    huddleSettings: {
      slotCategories: { urgent: [URGENT], routine: [ROUTINE] },
      dutyDoctorSlot: [URGENT],
      expectedCapacity: Object.fromEntries(WEEKDAYS.map((d) => [d, { am: 10, pm: 10 }])),
      capacityStaffing: { groups: ['gp'], thresholds: { Winscombe: 2, Banwell: 1 } },
      weekReview: {
        wardRoundTypes: [WARD],
        activityTypes: [TEACH],
        wardRounds: [
          { id: 'wh', name: 'Winscombe Hall', days: ['Monday'], session: 'am', usual: ['Darren Cox'] },
          { id: 'mm', name: 'Meadfield Manor', days: ['Tuesday'], session: 'any', usual: ['Alice Blackwell'] },
          { id: 'sm', name: "St Monica's", days: ['Tuesday', 'Thursday'], session: 'any', usual: ['Harry Lobb'] },
        ],
      },
    },
    plannedAbsences: [],
    closedDays: {},
    ...extra,
  };
}

const flagsOf = (w, kind) => w.flags.filter((f) => f.kind === kind);
const dayNamed = (w, name) => w.days.find((d) => d.dayName === name);

test.describe('assembleWeekReview', () => {
  test('degrades with no data at all', () => {
    const w = assembleWeekReview({ data: null, huddleData: null, monday: MONDAY });
    expect(w.days).toHaveLength(5);
    expect(w.hasCsv).toBe(false);
    expect(w.flags.every((f) => f.kind === 'no-data')).toBe(true);
    expect(w.mondayIso).toBe('2026-11-16');
  });

  test('a week after the export ends is all no-data, not errors', () => {
    const far = new Date(2027, 5, 7);
    const w = assembleWeekReview({ data: baseData(), huddleData: buildHuddle(normalDay), monday: far });
    expect(w.hasData).toBe(false);
    expect(flagsOf(w, 'no-data')).toHaveLength(5);
  });

  test('mondayOf lands on the Monday of any day', () => {
    expect(toLocalIso(mondayOf(new Date(2026, 10, 19)))).toBe('2026-11-16');
    expect(toLocalIso(mondayOf(new Date(2026, 10, 15)))).toBe('2026-11-09'); // a Sunday belongs to the week before
  });

  test('urgent slots are read against the weekday target and flagged when short', () => {
    const w = assembleWeekReview({ data: baseData(), huddleData: buildHuddle(normalDay), monday: MONDAY });
    const mon = dayNamed(w, 'Monday');
    expect(mon.urgent.am.slots).toBe(10);
    expect(mon.urgent.am.target).toBe(10);
    expect(flagsOf(w, 'urgent-short')).toHaveLength(0);
    // Halve Friday's urgent slots: a medium flag for each session.
    const thin = buildHuddle((i) => { const d = normalDay(); if (i === 4) { d[0] = d[0].map((r) => r.type === URGENT ? { ...r, n: 4 } : r); d[1] = d[1].filter((r) => r.type !== URGENT); } return d; });
    const w2 = assembleWeekReview({ data: baseData(), huddleData: thin, monday: MONDAY });
    const fri = flagsOf(w2, 'urgent-short').filter((f) => f.day === 'Friday');
    expect(fri).toHaveLength(2);
    expect(fri[0].severity).toBe('high'); // 4 of 10 is under half
  });

  test('duty doctor is named per session and missing duty is a high flag', () => {
    const w = assembleWeekReview({ data: baseData(), huddleData: buildHuddle(normalDay), monday: MONDAY });
    expect(dayNamed(w, 'Monday').duty.am.display).toBe('Darren Cox');
    const noDuty = buildHuddle((i) => { const d = normalDay(); if (i === 2) { for (const k of Object.keys(d)) d[k] = d[k].filter((r) => r.type !== URGENT); } return d; });
    const w2 = assembleWeekReview({ data: baseData(), huddleData: noDuty, monday: MONDAY });
    const wed = flagsOf(w2, 'duty-missing').filter((f) => f.day === 'Wednesday');
    expect(wed).toHaveLength(2);
    expect(wed[0].severity).toBe('high');
  });

  test('sites count GPs with bookable slots and flag a shortfall against the minimum', () => {
    const w = assembleWeekReview({ data: baseData(), huddleData: buildHuddle(normalDay), monday: MONDAY });
    const mon = dayNamed(w, 'Monday');
    const win = mon.sites.find((s) => s.site.name === 'Winscombe');
    expect(win.sessions.am.offering).toBe(2);
    expect(win.sessions.am.state).toBe('tight');
    expect(flagsOf(w, 'site-short')).toHaveLength(0);
    // Alice gone from Winscombe on Tuesday: 1 of 2 is short.
    const short = buildHuddle((i) => { const d = normalDay(); if (i === 1) delete d[1]; return d; });
    const w2 = assembleWeekReview({ data: baseData(), huddleData: short, monday: MONDAY });
    const tue = flagsOf(w2, 'site-short').filter((f) => f.day === 'Tuesday');
    expect(tue.map((f) => f.site)).toEqual(['Winscombe', 'Winscombe']);
  });

  test('ward rounds: covered by the usual GP, inferred for a stand-in, uncovered when nobody holds slots', () => {
    const huddle = buildHuddle((i) => {
      const d = normalDay();
      if (i === 0) d[0].push({ session: 'am', type: WARD, n: 12 });            // Mon: Darren does Winscombe Hall
      if (i === 1) { d[1].push({ session: 'am', type: WARD, n: 10 }); d[2].push({ session: 'am', type: WARD, n: 10 }); } // Tue: Alice + Harry
      // Thu: nobody holds ward round slots -> St Monica's uncovered
      return d;
    });
    const w = assembleWeekReview({ data: baseData(), huddleData: huddle, monday: MONDAY });
    const mon = dayNamed(w, 'Monday').wardRounds.find((r) => r.id === 'wh');
    expect(mon.status).toBe('covered');
    expect(mon.holders[0].display).toBe('Darren Cox');
    const tue = dayNamed(w, 'Tuesday');
    expect(tue.wardRounds.find((r) => r.id === 'mm').holders[0].display).toBe('Alice Blackwell');
    expect(tue.wardRounds.find((r) => r.id === 'sm').holders[0].display).toBe('Harry Lobb');
    const thu = dayNamed(w, 'Thursday').wardRounds.find((r) => r.id === 'sm');
    expect(thu.status).toBe('uncovered');
    expect(flagsOf(w, 'ward-uncovered').map((f) => f.day)).toEqual(['Thursday']);
    // Monday has no round on Tuesday's list and vice versa.
    expect(dayNamed(w, 'Monday').wardRounds.map((r) => r.id)).toEqual(['wh']);
    expect(dayNamed(w, 'Wednesday').wardRounds).toEqual([]);
  });

  test('a stand-in on the only open round is inferred, and two open rounds stay unclear', () => {
    const huddle = buildHuddle((i) => {
      const d = normalDay();
      if (i === 0) d[2].push({ session: 'am', type: WARD, n: 12 });  // Mon: Harry, not Darren, holds the slots
      if (i === 1) d[0].push({ session: 'am', type: WARD, n: 12 });  // Tue: Darren alone, two rounds expected
      return d;
    });
    const w = assembleWeekReview({ data: baseData(), huddleData: huddle, monday: MONDAY });
    const mon = dayNamed(w, 'Monday').wardRounds[0];
    expect(mon.status).toBe('inferred');
    expect(mon.holders[0].display).toBe('Harry Lobb');
    const tue = dayNamed(w, 'Tuesday');
    expect(tue.wardRounds.every((r) => r.status === 'uncovered')).toBe(true);
    expect(tue.unassignedWardRounds[0].display).toBe('Darren Cox');
    expect(flagsOf(w, 'ward-unclear').map((f) => f.day)).toEqual(['Tuesday']);
  });

  test('duty doctor holding ward round slots in the same session is a clash', () => {
    const huddle = buildHuddle((i) => { const d = normalDay(); if (i === 0) d[0].push({ session: 'am', type: WARD, n: 12 }); return d; });
    const w = assembleWeekReview({ data: baseData(), huddleData: huddle, monday: MONDAY });
    const clash = flagsOf(w, 'duty-clash');
    expect(clash).toHaveLength(1);
    expect(clash[0].text).toContain('Darren Cox');
    expect(clash[0].session).toBe('am');
  });

  test('other activities are listed by session', () => {
    const huddle = buildHuddle((i) => { const d = normalDay(); if (i === 2) d[1].push({ session: 'pm', type: TEACH, n: 3 }); return d; });
    const w = assembleWeekReview({ data: baseData(), huddleData: huddle, monday: MONDAY });
    const wed = dayNamed(w, 'Wednesday').activities;
    expect(wed).toEqual([{ type: TEACH, session: 'pm', name: 'BLACKWELL, Alice (Dr)', display: 'Alice Blackwell', count: 3 }]);
  });

  test('plan against EMIS: rota with no slots, away with slots, and names off the register', () => {
    const huddle = buildHuddle((i) => {
      const d = normalDay();
      if (i === 3) delete d[2];                                              // Thu: Harry rota'd, nothing on EMIS
      if (i === 4) d[3] = [{ session: 'am', type: ROUTINE, n: 5 }];          // Fri: a locum
      return d;
    });
    const data = baseData({ plannedAbsences: [{ clinicianId: 'b', startDate: '2026-11-18', endDate: '2026-11-18', reason: 'Annual leave', session: 'pm' }] });
    const w = assembleWeekReview({ data, huddleData: huddle, monday: MONDAY });
    const thu = dayNamed(w, 'Thursday').mismatches;
    expect(thu.plannedNoEmis.map((x) => `${x.name} ${x.session}`)).toEqual(['Harry Lobb am', 'Harry Lobb pm']);
    const wed = dayNamed(w, 'Wednesday').mismatches;
    expect(wed.emisButAway).toHaveLength(1);
    expect(wed.emisButAway[0]).toMatchObject({ name: 'Alice Blackwell', session: 'pm', reason: 'Annual leave' });
    expect(wed.plannedNoEmis).toHaveLength(0);     // a morning-only absence is not a morning mismatch
    const fri = dayNamed(w, 'Friday').mismatches;
    expect(fri.unknownNames).toEqual(['LOCUM, Pat (Dr)']);
    expect(flagsOf(w, 'unknown-name')).toHaveLength(1);
  });

  test('a daily override that marks someone in is the plan, even over leave', () => {
    const data = baseData({
      plannedAbsences: [{ clinicianId: 'a', startDate: '2026-11-16', endDate: '2026-11-16', reason: 'Annual leave' }],
      dailyOverrides: { '2026-11-16-Monday': { present: ['a', 'b', 'c'] } },
    });
    const w = assembleWeekReview({ data, huddleData: buildHuddle(normalDay), monday: MONDAY });
    expect(dayNamed(w, 'Monday').mismatches.emisButAway).toHaveLength(0);
  });

  test('a closed day with slots is flagged, and an ordinary closed day reports nothing else', () => {
    const data = baseData({ closedDays: { '2026-11-18': 'Staff training' } });
    const w = assembleWeekReview({ data, huddleData: buildHuddle(normalDay), monday: MONDAY });
    const wed = dayNamed(w, 'Wednesday');
    expect(wed.closed).toBe(true);
    expect(wed.flags.map((f) => f.kind)).toEqual(['closed-with-slots']);
    const quiet = assembleWeekReview({ data, huddleData: buildHuddle((i) => (i === 2 ? {} : normalDay())), monday: MONDAY });
    expect(dayNamed(quiet, 'Wednesday').flags).toEqual([]);
  });

  test('staff changes that start or end in the week are listed and flagged on their day', () => {
    const data = baseData({ staffPlan: { plannedPeople: [{ id: 'p1', name: 'New salaried GP' }], events: [
      { id: 'e1', personRef: 'p1', type: 'join', startDate: '2026-11-18', sessions: 6 },
      { id: 'e2', personRef: 'a', type: 'temp_leave', startDate: '2026-11-02', endDate: '2026-11-20', reason: 'sickness' },
      { id: 'e3', personRef: 'b', type: 'change', startDate: '2026-12-01', sessions: 4 },
    ] } });
    const w = assembleWeekReview({ data, huddleData: buildHuddle(normalDay), monday: MONDAY });
    expect(w.staffChanges.map((c) => c.text)).toEqual(['New salaried GP starts on 6 sessions', 'Darren Cox returns from sickness']);
    expect(flagsOf(w, 'staff-change').map((f) => f.day)).toEqual(['Wednesday', 'Friday']);
  });

  test('flags are ordered by severity then date, and counted', () => {
    const huddle = buildHuddle((i) => { const d = normalDay(); if (i === 4) { for (const k of Object.keys(d)) d[k] = d[k].filter((r) => r.type !== URGENT); } return d; });
    const w = assembleWeekReview({ data: baseData(), huddleData: huddle, monday: MONDAY });
    const sev = w.flags.map((f) => f.severity);
    const rank = { high: 0, medium: 1, info: 2 };
    for (let i = 1; i < sev.length; i++) expect(rank[sev[i]]).toBeGreaterThanOrEqual(rank[sev[i - 1]]);
    expect(w.counts.high + w.counts.medium + w.counts.info).toBe(w.flags.length);
  });
});

test.describe('config', () => {
  test('suggests ward round and activity types from the export, and keeps the saved choice', () => {
    const hd = { allSlotTypes: ['2026 Nursing home ward round', '2026 Teaching or Supervision', 'Baby imms', '2026 Session holder Clinician to book Face to Face', 'Admin'] };
    expect(suggestWardRoundTypes(hd)).toEqual(['2026 Nursing home ward round']);
    expect(suggestActivityTypes(hd)).toEqual(['2026 Teaching or Supervision', 'Baby imms']);
    const c = resolveWeekReviewConfig({}, hd);
    expect(c.wardRoundTypes).toEqual(['2026 Nursing home ward round']);
    expect(c.wardRounds).toEqual([]);
    const saved = resolveWeekReviewConfig({ weekReview: { wardRoundTypes: ['Visit'], activityTypes: [], wardRounds: [{ name: 'Hall', days: ['Monday', 'Funday'], session: 'pm' }] } }, hd);
    expect(saved.wardRoundTypes).toEqual(['Visit']);
    expect(saved.activityTypes).toEqual([]);
    expect(saved.wardRounds).toEqual([{ id: 'Hall', name: 'Hall', days: ['Monday'], session: 'pm', usual: [] }]);
  });
});
