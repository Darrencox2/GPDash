// Unit tests for lib/briefing.js — the sheet must degrade gracefully with
// partial data and never throw at 7:55am.
import { test, expect } from '@playwright/test';
import { assembleBriefing } from '../../lib/briefing.js';

const MONDAY = new Date(2026, 8, 7);       // Mon 7 Sep 2026 — an ordinary day
const BH = new Date(2026, 7, 31);          // August bank holiday
const SUNDAY = new Date(2026, 8, 6);

test.describe('assembleBriefing', () => {
  test('degrades with no data at all rather than throwing', () => {
    const b = assembleBriefing({ data: null, huddleData: null, huddleMessages: null, date: MONDAY });
    expect(b.hasCsv).toBe(false);
    expect(b.duty.am).toBe(null);
    expect(b.present).toEqual([]);
    expect(b.outlook).toHaveLength(5);
  });

  test('knows a bank holiday and a Sunday are closed', () => {
    expect(assembleBriefing({ data: {}, huddleData: null, date: BH }).closed).toBe(true);
    expect(assembleBriefing({ data: {}, huddleData: null, date: SUNDAY }).closed).toBe(true);
    expect(assembleBriefing({ data: {}, huddleData: null, date: MONDAY }).closed).toBe(false);
  });

  test('a practice-declared closed day closes the briefing too', () => {
    const b = assembleBriefing({ data: { closedDays: { '2026-09-07': 'Staff training' } }, huddleData: null, date: MONDAY });
    expect(b.closed).toBe(true);
    expect(b.closedReason).toBe('Staff training');
  });

  test('outlook contains only weekdays and skips nothing', () => {
    const b = assembleBriefing({ data: {}, huddleData: null, date: new Date(2026, 8, 4) }); // a Friday
    expect(b.outlook).toHaveLength(5);
    for (const o of b.outlook) expect(['Monday','Tuesday','Wednesday','Thursday','Friday']).toContain(o.dayName);
  });

  test('cover pairs resolve ids to people and drop unknowns', () => {
    const A={id:'a',name:'Dr A',buddyCover:true,status:'active'}, B={id:'b',name:'Dr B',buddyCover:true,status:'active'};
    const data = {
      clinicians: [A,B],
      allocationHistory: { '2026-09-07': { presentIds: ['a'], allocations: { b: 'a' }, dayOffAllocations: {} } },
    };
    const b = assembleBriefing({ data, huddleData: null, date: MONDAY });
    expect(b.coverPairs).toHaveLength(1);
    expect(b.coverPairs[0].coverer.name).toBe('Dr A');
    expect(b.coverPairs[0].absent[0].name).toBe('Dr B');
  });

  test('notices pass through with author attribution', () => {
    const b = assembleBriefing({ data: {}, huddleData: null, huddleMessages: [{ text: 'Fridge vaccine delivery 10am', author: 'LB' }], date: MONDAY });
    expect(b.notices[0]).toMatchObject({ text: 'Fridge vaccine delivery 10am', author: 'LB' });
  });
});
