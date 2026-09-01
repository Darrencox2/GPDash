// Unit tests for lib/staff-plan.js — the timeline maths under Staff Changes.
import { test, expect } from '@playwright/test';
import { monthKey, addMonths, aprilStart, monthRange, derivePeople, sessionsByMonth, totalsByMonth, per1000ByMonth, planSummary, suggestedEventsFromWindDowns, monthEndDate, capacityTimeline, absenceCode, monthFraction, listSizeLookup } from '../../lib/staff-plan.js';

const P = { id: 'a', name: 'Dr A', sessions: 6, kind: 'real' };
const MONTHS = monthRange('2026-04', 13);

test.describe('month helpers', () => {
  test('april anchoring follows the financial year', () => {
    expect(aprilStart(new Date(2026, 8, 1))).toBe('2026-04');   // Sept -> this April
    expect(aprilStart(new Date(2026, 1, 1))).toBe('2025-04');   // Feb -> LAST April
    expect(aprilStart(new Date(2026, 3, 1))).toBe('2026-04');   // April itself
  });
  test('addMonths crosses year ends', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-04', 12)).toBe('2027-04');
  });
  test('monthEndDate lands on the real month end', () => {
    expect(monthEndDate('2026-11')).toBe('2026-11-30');
    expect(monthEndDate('2028-02')).toBe('2028-02-29');   // leap year
  });
});

test.describe('sessionsByMonth', () => {
  test('no events means a flat line at base sessions', () => {
    const s = sessionsByMonth(P, [], MONTHS);
    expect(s['2026-04']).toBe(6);
    expect(s['2027-04']).toBe(6);
  });
  test('a leave zeroes from its month onwards', () => {
    const s = sessionsByMonth(P, [{ personRef: 'a', type: 'leave', month: '2026-09' }], MONTHS);
    expect(s['2026-08']).toBe(6);
    expect(s['2026-09']).toBe(0);
    expect(s['2027-04']).toBe(0);
  });
  test('a change steps to the new value', () => {
    const s = sessionsByMonth(P, [{ personRef: 'a', type: 'change', month: '2027-01', sessions: 4 }], MONTHS);
    expect(s['2026-12']).toBe(6);
    expect(s['2027-01']).toBe(4);
  });
  test('temporary leave zeroes the span and restores after', () => {
    const s = sessionsByMonth(P, [{ personRef: 'a', type: 'temp_leave', month: '2026-11', toMonth: '2027-02' }], MONTHS);
    expect(s['2026-10']).toBe(6);
    expect(s['2026-11']).toBe(0);
    expect(s['2027-02']).toBe(0);
    expect(s['2027-03']).toBe(6);   // automatically back
  });
  test('a planned person is 0 until their join', () => {
    const loc = { id: 'x', name: 'Dr Locum', sessions: 0, kind: 'planned' };
    const s = sessionsByMonth(loc, [{ personRef: 'x', type: 'join', month: '2026-11', sessions: 4 }], MONTHS);
    expect(s['2026-10']).toBe(0);
    expect(s['2026-11']).toBe(4);
  });
  test('events for other people are ignored', () => {
    const s = sessionsByMonth(P, [{ personRef: 'zzz', type: 'leave', month: '2026-05' }], MONTHS);
    expect(s['2026-06']).toBe(6);
  });
});

test.describe('totals and summaries', () => {
  const B = { id: 'b', name: 'Dr B', sessions: 4, kind: 'real' };
  test('totals sum every person per month', () => {
    const { totals } = totalsByMonth([P, B], [{ personRef: 'a', type: 'leave', month: '2026-09' }], MONTHS);
    expect(totals['2026-08']).toBe(10);
    expect(totals['2026-09']).toBe(4);
  });
  test('planSummary finds the low point and end delta', () => {
    const { totals } = totalsByMonth([P, B], [{ personRef: 'a', type: 'temp_leave', month: '2026-11', toMonth: '2026-12' }], MONTHS);
    const sum = planSummary(totals, MONTHS, '2026-09');
    expect(sum.low).toBe(4);
    expect(sum.lowMk).toBe('2026-11');
    expect(sum.endDelta).toBe(0);
  });
});

test.describe('per-1000-patients', () => {
  test('uses the nearest earlier known list size, then the current one', () => {
    const totals = { '2026-04': 157, '2026-05': 157, '2026-06': 157 };
    const out = per1000ByMonth(totals, ['2026-04', '2026-05', '2026-06'], { '2026-05': 10000 }, 11515);
    expect(out['2026-04']).toBeCloseTo(13.6, 1);   // current size fallback
    expect(out['2026-05']).toBeCloseTo(15.7, 1);   // NHS-known month
    expect(out['2026-06']).toBeCloseTo(15.7, 1);   // carried forward
  });
  test('no list size at all yields null, never Infinity', () => {
    const out = per1000ByMonth({ '2026-04': 157 }, ['2026-04'], null, null);
    expect(out['2026-04']).toBe(null);
  });
});

test.describe('derivePeople', () => {
  test('counts in=1 and half=0.5 from the session rota detail', () => {
    const data = {
      clinicians: [{ id: 'a', name: 'Dr A', initials: 'DA', role: 'GP Partner', status: 'active' }],
      sessionRotaDetail: { a: { Monday: { am: 'in', pm: 'half' }, Tuesday: { am: 'in' } } },
    };
    const people = derivePeople(data);
    expect(people[0].sessions).toBe(2.5);
    expect(people[0].group).toBe('gp');
  });
  test('drops the inactive and the sessionless', () => {
    const data = {
      clinicians: [
        { id: 'a', name: 'A', status: 'left', role: 'GP' },
        { id: 'b', name: 'B', status: 'active', role: 'GP' },
      ],
      sessionRotaDetail: { a: { Monday: { am: 'in' } } },
    };
    expect(derivePeople(data)).toHaveLength(0);
  });
});

test.describe('wind-down bridge', () => {
  test('a leaving wind-down suggests a leave event in its end month', () => {
    const people = [{ id: 'a', name: 'Dr A', sessions: 6, kind: 'real', windDown: { type: 'left', startDate: '2026-08-01', endDate: '2026-09-28' } }];
    const sugg = suggestedEventsFromWindDowns(people, []);
    expect(sugg[0]).toMatchObject({ type: 'leave', month: '2026-09' });
  });
  test('a sickness wind-down suggests a temp span', () => {
    const people = [{ id: 'a', name: 'Dr A', sessions: 6, kind: 'real', windDown: { type: 'sick', startDate: '2026-08-20', endDate: '2026-09-15' } }];
    const sugg = suggestedEventsFromWindDowns(people, []);
    expect(sugg[0]).toMatchObject({ type: 'temp_leave', month: '2026-08', toMonth: '2026-09' });
  });
  test('already-recorded events are not re-suggested', () => {
    const people = [{ id: 'a', name: 'Dr A', sessions: 6, kind: 'real', windDown: { type: 'left', endDate: '2026-09-28' } }];
    expect(suggestedEventsFromWindDowns(people, [{ personRef: 'a', type: 'leave', month: '2026-09' }])).toHaveLength(0);
  });
});

// ─── Day-level timeline (the chart) ───────────────────────────────────────
test.describe('capacityTimeline', () => {
  const PEOPLE = [
    { id: 'a', name: 'Ann Adams', initials: 'AA', sessions: 6, group: 'gp', kind: 'real' },
    { id: 'b', name: 'Bea Brown', initials: 'BB', sessions: 4, group: 'nursing', kind: 'real' },
  ];
  const flat = (t) => t.steps.map((s) => [s.date, s.value]);

  test('no events is a single step at the window start', () => {
    const t = capacityTimeline(PEOPLE, [], MONTHS);
    expect(flat(t)).toEqual([['2026-04-01', 10]]);
    expect(t.marks).toEqual([]);
  });

  test('temp leave starting mid-month steps on the day, not the 1st', () => {
    const ev = [{ id: 'e', personRef: 'a', type: 'temp_leave', month: '2026-08', toMonth: '2027-08',
                  startDate: '2026-08-28', endDate: '2027-08-28', reason: 'maternity' }];
    const t = capacityTimeline(PEOPLE, ev, MONTHS);
    expect(flat(t)).toEqual([['2026-04-01', 10], ['2026-08-28', 4]]);
    // 4 whole months in, then 27/31 of August
    expect(t.steps[1].x).toBeCloseTo(4 + 27 / 31, 5);
  });

  test('a mark carries the signed change and a short code, not the new total', () => {
    const ev = [
      { id: 'e1', personRef: 'a', type: 'change', month: '2026-06', startDate: '2026-06-15', sessions: 8 },
      { id: 'e2', personRef: 'b', type: 'temp_leave', month: '2026-09', toMonth: '2026-10',
        startDate: '2026-09-10', endDate: '2026-10-09', reason: 'long_term_sick' },
    ];
    const m = capacityTimeline(PEOPLE, ev, MONTHS).marks;
    expect(m.map((x) => [x.date, x.tag, x.code, x.delta])).toEqual([
      ['2026-06-15', 'AA', null, 2],      // 6 -> 8 reads as +2
      ['2026-09-10', 'BB', 'SICK', -4],
      ['2026-10-10', 'BB', 'BACK', 4],    // the return is a mark of its own
    ]);
  });

  test('a leaving date is the last day worked; a month-only leave keeps the monthly rule', () => {
    const dated = capacityTimeline(PEOPLE, [{ id: 'e', personRef: 'a', type: 'leave', month: '2026-07', endDate: '2026-07-20' }], MONTHS);
    expect(flat(dated)).toEqual([['2026-04-01', 10], ['2026-07-21', 4]]);
    const legacy = capacityTimeline(PEOPLE, [{ id: 'e', personRef: 'a', type: 'leave', month: '2026-07' }], MONTHS);
    expect(flat(legacy)).toEqual([['2026-04-01', 10], ['2026-07-01', 4]]);
  });

  test('a change to the sessions someone already works is not a step', () => {
    const t = capacityTimeline(PEOPLE, [{ id: 'e', personRef: 'a', type: 'change', month: '2026-06', startDate: '2026-06-04', sessions: 6 }], MONTHS);
    expect(flat(t)).toEqual([['2026-04-01', 10]]);
    expect(t.marks).toEqual([]);
  });

  test('planned people start at nothing and join on their date', () => {
    const people = [...PEOPLE, { id: 'p1', name: 'Peter', sessions: 0, group: 'gp', kind: 'planned' }];
    const t = capacityTimeline(people, [{ id: 'e', personRef: 'p1', type: 'join', month: '2026-09', startDate: '2026-09-07', sessions: 6 }], MONTHS);
    expect(flat(t)).toEqual([['2026-04-01', 10], ['2026-09-07', 16]]);
    expect(t.marks[0]).toMatchObject({ tag: 'Peter', code: 'JOIN', delta: 6 });
  });

  test('groups are split out, so a flat group reads as flat', () => {
    const ev = [{ id: 'e', personRef: 'a', type: 'leave', month: '2026-05' }];
    const t = capacityTimeline(PEOPLE, ev, MONTHS);
    expect(t.steps[1].byGroup).toEqual({ gp: 0, nursing: 4, hca: 0, other: 0 });
  });

  test('absenceCode turns the stored reasons into labels', () => {
    expect(absenceCode('maternity')).toBe('MAT');
    expect(absenceCode('long_term_sick')).toBe('SICK');
    expect(absenceCode('training')).toBe('TRG');
    expect(absenceCode('')).toBe('AWAY');
  });

  test('monthFraction places a date inside its own month band', () => {
    expect(monthFraction('2026-04-01', MONTHS)).toBe(0);
    expect(monthFraction('2026-04-16', MONTHS)).toBeCloseTo(0.5, 5);
    expect(monthFraction('2027-04-01', MONTHS)).toBe(12);
  });
});

// A recorded join means "not here before this" for anyone, not just for a
// planned placeholder. This is what makes linking a planned person to the
// real clinician safe: without it the starter reads as having worked all year.
test.describe('a join applies to real people too', () => {
  const REAL = { id: 'r', name: 'Peter Sandford', initials: 'PS', sessions: 6, group: 'gp', kind: 'real' };
  const JOIN = [{ id: 'j', personRef: 'r', type: 'join', month: '2026-09', startDate: '2026-09-01', sessions: 6 }];

  test('monthly walk: nothing before the join month', () => {
    const s = sessionsByMonth(REAL, JOIN, MONTHS);
    expect(s['2026-08']).toBe(0);
    expect(s['2026-09']).toBe(6);
    expect(s['2027-04']).toBe(6);
  });
  test('monthly walk: no join still means their full pattern all year', () => {
    const s = sessionsByMonth(REAL, [], MONTHS);
    expect(s['2026-04']).toBe(6);
  });
  test('day-level walk agrees, and steps on the join date', () => {
    const t = capacityTimeline([REAL], JOIN, MONTHS);
    expect(t.steps.map((s) => [s.date, s.value])).toEqual([['2026-04-01', 0], ['2026-09-01', 6]]);
    expect(t.marks[0]).toMatchObject({ tag: 'PS', code: 'JOIN', delta: 6 });
  });
});

// A linked planned person leaves behind a join with NO session count - the
// real clinician's rota is the truth from that date on.
test.describe('a join without a number means the rota sessions', () => {
  const REAL = { id: 'r', name: 'Peter Sandford', initials: 'PS', sessions: 6, group: 'gp', kind: 'real' };
  const JOIN = [{ id: 'j', personRef: 'r', type: 'join', month: '2026-09', startDate: '2026-09-01' }];

  test('monthly walk: zero before, rota sessions after', () => {
    const s = sessionsByMonth(REAL, JOIN, MONTHS);
    expect(s['2026-08']).toBe(0);
    expect(s['2026-09']).toBe(6);
  });
  test('day-level walk agrees', () => {
    const t = capacityTimeline([REAL], JOIN, MONTHS);
    expect(t.steps.map((s) => [s.date, s.value])).toEqual([['2026-04-01', 0], ['2026-09-01', 6]]);
  });
  test('a planned person still needs the number, so nothing changes for them', () => {
    const planned = { id: 'p', name: 'Posy', sessions: 0, group: 'gp', kind: 'planned' };
    const s = sessionsByMonth(planned, [{ id: 'j', personRef: 'p', type: 'join', month: '2026-09' }], MONTHS);
    expect(s['2026-09']).toBe(0);
  });
});

test.describe('wind-down suggestions claim their board absence', () => {
  test('a sickness suggestion carries the absence start date and exact span', () => {
    const people = [{ id: 'c1', name: 'Trudi', windDown: { type: 'sick', startDate: '2026-10-07', endDate: '2027-01-07' } }];
    const [sg] = suggestedEventsFromWindDowns(people, []);
    expect(sg).toMatchObject({ type: 'temp_leave', absenceStart: '2026-10-07', startDate: '2026-10-07', endDate: '2027-01-07' });
  });
  test('a leaving suggestion carries the absence start date', () => {
    const people = [{ id: 'c1', name: 'Alex', windDown: { type: 'left', startDate: '2026-08-10', endDate: '2026-09-28' } }];
    const [sg] = suggestedEventsFromWindDowns(people, []);
    expect(sg).toMatchObject({ type: 'leave', absenceStart: '2026-08-10' });
  });
});

test.describe('listSizeLookup', () => {
  test('carries the nearest earlier size forward, even from before the window', () => {
    const at = listSizeLookup({ '2026-01': 11400, '2026-04': 11515 }, 12000);
    expect(at('2026-03-15')).toBe(11400);   // pre-window publication still applies
    expect(at('2026-09-01')).toBe(11515);
    expect(at('2025-06-01')).toBe(12000);   // nothing earlier -> registered size
  });
  test('no sizes at all falls back to the registered size, or null', () => {
    expect(listSizeLookup(null, 9000)('2026-05-01')).toBe(9000);
    expect(listSizeLookup({}, null)('2026-05-01')).toBeNull();
  });
});
