// Unit tests for lib/briefing.js — the sheet must degrade gracefully with
// partial data and never throw at 7:55am.
import { test, expect } from '@playwright/test';
import { assembleBriefing, labelReason } from '../../lib/briefing.js';

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

test.describe('who is where, and why they are away', () => {
  const MON = new Date(2026, 8, 7); // Mon 7 Sep 2026
  const mk = (extra = {}) => ({
    clinicians: [
      { id: 'a', name: 'Alice Alpher', initials: 'AA', buddyCover: true, status: 'active' },
      { id: 'b', name: 'Brian Bethe', initials: 'BB', buddyCover: true, status: 'active' },
      { id: 'c', name: 'Clara Gamow', initials: 'CG', buddyCover: true, status: 'active' },
    ],
    roomAllocation: { sites: [{ name: 'Winscombe', colour: '#8b5cf6' }, { name: 'Banwell', colour: '#84cc16' }] },
    dailyOverrides: { '2026-09-07-Monday': { present: ['a', 'b'] } },
    ...extra,
  });

  test('groups the present team by site in the practice site order', () => {
    // Two clinicians with EMIS slots at different sites.
    const huddleData = {
      clinicians: ['ALPHER, Alice (Dr)', 'BETHE, Brian (Dr)'],
      dates: ['07-Sep-2026'],
      dateData: { '07-Sep-2026': { am: { 0: { Urgent: 3 }, 1: { Urgent: 2 } } } },
      locationData: { '07-Sep-2026': { 0: { 'Banwell Surgery': 3 }, 1: { 'Winscombe Surgery': 2 } } },
    };
    const b = assembleBriefing({ data: mk(), huddleData, date: MON });
    // Winscombe is first in the practice's own site list, so it leads.
    expect(b.teamBySite.map(g => g.site)).toEqual(['Winscombe', 'Banwell']);
    expect(b.teamBySite[0].colour).toBe('#8b5cf6');
    expect(b.teamBySite[0].members.map(m => m.name)).toEqual(['Brian Bethe']);
    expect(b.teamBySite[1].members.map(m => m.name)).toEqual(['Alice Alpher']);
  });

  test('a split-site clinician is flagged with both sites', () => {
    const huddleData = {
      clinicians: ['ALPHER, Alice (Dr)'],
      dates: ['07-Sep-2026'],
      dateData: { '07-Sep-2026': { am: { 0: { Urgent: 3 } }, pm: { 0: { Urgent: 3 } } } },
      locationData: { '07-Sep-2026': { 0: { 'Winscombe Surgery': 3, 'Banwell Surgery': 3 } } },
      splitSiteData: { '07-Sep-2026': { 0: { am: 'Winscombe', pm: 'Banwell' } } },
    };
    const b = assembleBriefing({ data: mk(), huddleData, date: MON });
    const alpha = b.present.find(p => p.id === 'a');
    expect(alpha.split).toBe(true);
    expect(alpha.siteAm).toBe('Winscombe');
    expect(alpha.sitePm).toBe('Banwell');
  });

  test('people with no EMIS slots still appear, under no site', () => {
    const b = assembleBriefing({ data: mk(), huddleData: null, date: MON });
    expect(b.teamBySite).toHaveLength(1);
    expect(b.teamBySite[0].site).toBe(null);
    expect(b.teamBySite[0].members).toHaveLength(2);
  });

  test('each absent person carries a readable reason', () => {
    const data = mk({
      dailyOverrides: { '2026-09-07-Monday': { present: ['a'] } },
      weeklyRota: { Monday: ['a', 'b', 'c'] },
      plannedAbsences: [
        { clinicianId: 'b', startDate: '2026-09-01', endDate: '2026-09-14', reason: 'annual_leave' },
        { clinicianId: 'c', startDate: '2026-09-07', endDate: '2026-09-07', reason: 'unwell' },
      ],
    });
    const b = assembleBriefing({ data, huddleData: null, date: MON });
    const reasons = Object.fromEntries([...b.absent, ...b.dayOff].map(p => [p.name, p.reason]));
    // Whoever the day-status engine calls absent must carry a label, never a raw value.
    for (const p of b.absent) expect(p.reason).toBeTruthy();
    for (const p of b.absent) expect(p.reason).not.toContain('_');
    if (reasons['Brian Bethe']) expect(reasons['Brian Bethe']).toBe('Holiday');
  });

  test('a wind-down explains itself when no planned absence covers the day', () => {
    const data = mk({
      dailyOverrides: { '2026-09-07-Monday': { present: ['a'] } },
      weeklyRota: { Monday: ['a', 'b'] },
    });
    data.clinicians[1].windDown = { type: 'sick', startDate: '2026-09-01', endDate: '2026-10-01' };
    const b = assembleBriefing({ data, huddleData: null, date: MON });
    const beta = b.absent.find(p => p.id === 'b');
    if (beta) expect(beta.reason).toBe('Long-term sick');
  });

  test('labelReason turns every storage shape into English', () => {
    expect(labelReason('annual_leave')).toBe('Holiday');
    expect(labelReason('unwell')).toBe('Off sick');
    expect(labelReason('Long term absence')).toBe('Long-term sick');
    expect(labelReason('Training/CPD')).toBe('Training/CPD');   // acronyms survive
    expect(labelReason('training/cpd')).toBe('Training/CPD');
    expect(labelReason('study_leave')).toBe('Study leave');
    expect(labelReason(null)).toBe('Absent');
    expect(labelReason('some_new_thing')).toBe('Some new thing');
  });

  test('the outlook carries routine slots and a band alongside urgent', () => {
    const b = assembleBriefing({ data: {}, huddleData: null, date: MON });
    for (const o of b.outlook) {
      expect(o).toHaveProperty('routineSlots');
      expect(o).toHaveProperty('band');
    }
  });
});
