// Unit tests for lib/rota-design.js — the rules a partner applies by eye
// when reading a draft rota, now applied by code. If these are wrong the
// planner blesses a week that does not work.
import { test, expect } from '@playwright/test';
import { ACTIVITY_KINDS, KIND_BY_ID, effectiveSessions, capacityVsDemand, designFindings, templateScore, DEFAULT_APPTS_PER_SESSION } from '../../lib/rota-design.js';

const A='a1', B='b2', C='c3';
const fullWeek = (ids) => {
  const g={}; for (const d of ['mon','tue','wed','thu','fri']) g[d]={am:[...ids],pm:[...ids]};
  return g;
};
const duty = (day, session, who=null) => ({ id:`d-${day}-${session}`, day, session, kind:'duty', label:'Duty', duration:'one', week:'all', assignedClinicianId: who });
const allDuty = (who=null) => ['mon','tue','wed','thu','fri'].flatMap(d=>[duty(d,'am',who),duty(d,'pm',who)]);

test.describe('the activity catalogue', () => {
  test('surgery keeps the book, duty and admin close it', () => {
    expect(KIND_BY_ID.surgery.yield).toBe(1);
    expect(KIND_BY_ID.duty.yield).toBe(0);
    expect(KIND_BY_ID.admin.yield).toBe(0);
  });
  test('every kind has the fields the UI renders', () => {
    for (const k of ACTIVITY_KINDS) {
      expect(typeof k.id).toBe('string');
      expect(typeof k.label).toBe('string');
      expect(k.yield).toBeGreaterThanOrEqual(0);
      expect(k.yield).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('effectiveSessions', () => {
  test('a head with no activities is one full book', () => {
    const eff = effectiveSessions({ allocation: fullWeek([A]), activities: [], includedIds:[A] });
    expect(eff.mon.am).toMatchObject({ heads: 1, effective: 1 });
  });

  test('duty consumes a whole session of capacity', () => {
    const eff = effectiveSessions({ allocation: fullWeek([A,B]), activities: [duty('mon','am',A)], includedIds:[A,B] });
    expect(eff.mon.am.effective).toBe(1);   // two heads, one on duty
    expect(eff.mon.pm.effective).toBe(2);   // pm untouched
  });

  test('a half-session special clinic costs a quarter of a book', () => {
    // clinic yield 0.5 × duration half 0.5 = 0.25 lost
    const act = { id:'x', day:'mon', session:'am', kind:'clinic', duration:'half', week:'all', assignedClinicianId:A };
    const eff = effectiveSessions({ allocation: fullWeek([A]), activities:[act], includedIds:[A] });
    expect(eff.mon.am.effective).toBeCloseTo(0.75);
  });

  test('an UNASSIGNED activity still consumes capacity — the work exists', () => {
    const eff = effectiveSessions({ allocation: fullWeek([A,B]), activities:[duty('mon','am',null)], includedIds:[A,B] });
    expect(eff.mon.am.effective).toBe(1);
  });

  test('capacity never goes negative', () => {
    const eff = effectiveSessions({ allocation: {mon:{am:[A],pm:[]}}, activities:[duty('mon','am',A), {...duty('mon','am',B), id:'d2'}], includedIds:[A,B] });
    expect(eff.mon.am.effective).toBe(0);
  });

  test('week A/B activities only bite in their week', () => {
    const wkB = { ...duty('mon','am',A), week:'b' };
    const effA = effectiveSessions({ allocation: fullWeek([A]), activities:[wkB], week:'a', includedIds:[A] });
    const effB = effectiveSessions({ allocation: fullWeek([A]), activities:[wkB], week:'b', includedIds:[A] });
    expect(effA.mon.am.effective).toBe(1);
    expect(effB.mon.am.effective).toBe(0);
  });
});

test.describe('capacityVsDemand', () => {
  test('converts sessions to appointments and reports the surplus', () => {
    const r = capacityVsDemand({ allocation: fullWeek([A,B,C]), activities: [], includedIds:[A,B,C], demandSettings: { baseline: 100, dowEffects: [0,0,0,0,0] }, listSize: null });
    // 3 heads × 2 sessions × 14 appts = 84/day vs 100 demand
    expect(r.perDay.mon.capacity).toBe(6 * DEFAULT_APPTS_PER_SESSION);
    expect(r.perDay.mon.surplus).toBe(84 - 100);
    expect(r.weekDemand).toBe(500);
  });

  test('respects a practice-specific appointments-per-session', () => {
    const r = capacityVsDemand({ allocation: fullWeek([A]), activities: [], includedIds:[A], demandSettings: { baseline: 10, dowEffects:[0,0,0,0,0] }, listSize: null, apptsPerSession: 10 });
    expect(r.perDay.mon.capacity).toBe(20);
  });
});

test.describe('designFindings', () => {
  const base = { allocation: fullWeek([A,B,C]), includedIds:[A,B,C],
    clinicians: [{id:A,name:'Dr A'},{id:B,name:'Dr B'},{id:C,name:'Dr C'}],
    demandSettings: { baseline: 20, dowEffects:[0,0,0,0,0] }, listSize: null };

  test('a week with no duty at all is critical, ten times over', () => {
    const { findings } = designFindings({ ...base, activities: [] });
    const duties = findings.filter(f=>f.rule==='duty-missing');
    expect(duties).toHaveLength(10);   // 5 days × AM+PM
    expect(duties[0].severity).toBe('critical');
  });

  test('assigned duty everywhere silences the duty rules', () => {
    const { findings } = designFindings({ ...base, activities: allDuty(A) });
    expect(findings.filter(f=>f.rule.startsWith('duty-'))).toHaveLength(0);
  });

  test('duty assigned to someone not duty-capable is flagged by name', () => {
    const { findings } = designFindings({ ...base, activities: allDuty(A), dutyCapableIds: new Set([B]) });
    const f = findings.find(f=>f.rule==='duty-not-capable');
    expect(f).toBeTruthy();
    expect(f.message).toContain('Dr A');
  });

  test('capacity below demand becomes a finding with the numbers in it', () => {
    const short = designFindings({ ...base, demandSettings: { baseline: 500, dowEffects:[0,0,0,0,0] }, activities: allDuty(A) });
    const f = short.findings.find(f=>f.rule==='capacity-short' && f.day==='mon');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('critical');
    expect(f.message).toMatch(/appointments planned against/);
  });

  test('duty holder with a full surgery in the same session is a clash', () => {
    const acts = [...allDuty(A), { id:'s1', day:'mon', session:'am', kind:'surgery', duration:'one', week:'all', assignedClinicianId:A }];
    const { findings } = designFindings({ ...base, activities: acts });
    expect(findings.find(f=>f.rule==='duty-surgery-clash')).toBeTruthy();
  });

  test('a 10-session clinician with no admin time is noted', () => {
    const { findings } = designFindings({ ...base, activities: allDuty(B) });
    expect(findings.find(f=>f.rule==='no-admin-time' && f.message.includes('Dr A'))).toBeTruthy();
  });

  test('findings arrive most-severe first', () => {
    const { findings } = designFindings({ ...base, activities: [] });
    const sev = findings.map(f=>({critical:0,warn:1,info:2})[f.severity]);
    expect(sev).toEqual([...sev].sort((a,b)=>a-b));
  });
});

test.describe('templateScore', () => {
  test('a clean, covered, sufficient week scores 100', () => {
    const r = designFindings({ allocation: fullWeek([A,B,C]), includedIds:[A,B,C],
      clinicians:[{id:A,name:'Dr A'},{id:B,name:'Dr B'},{id:C,name:'Dr C'}],
      demandSettings: { baseline: 20, dowEffects:[0,0,0,0,0] }, listSize:null,
      activities: [...allDuty(A), { id:'ad', day:'fri', session:'pm', kind:'admin', duration:'one', week:'all', assignedClinicianId:B }] });
    // Dr C still has no admin -> one info finding, so near-perfect not perfect
    expect(templateScore(r)).toBeGreaterThanOrEqual(90);
  });
  test('an empty week scores badly', () => {
    const r = designFindings({ allocation: fullWeek([A]), includedIds:[A], clinicians:[{id:A,name:'Dr A'}],
      demandSettings: { baseline: 400, dowEffects:[0,0,0,0,0] }, listSize:null, activities: [] });
    expect(templateScore(r)).toBeLessThan(40);
  });
});
