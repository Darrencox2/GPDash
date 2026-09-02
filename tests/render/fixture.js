// ═══════════════════════════════════════════════════════════════════════════
// A whole practice, invented, for render tests.
// ═══════════════════════════════════════════════════════════════════════════
// Ten clinicians across three sites, two weeks of EMIS-shaped slot data,
// a rota, absences, a staff plan and spend rates: enough for every
// dashboard section to have something to draw. Names are fictional.
// The same shapes the API route returns (see app/api/v4/data/route.js and
// lib/huddle.js), built by hand so the tests need no database.
import { toHuddleDateStr, toLocalIso } from '@/lib/data';

const PEOPLE = [
  ['COX, Darren (Dr)', 'Darren Cox', 'DC', 'GP Partner'],
  ['BLACKWELL, Alice (Dr)', 'Alice Blackwell', 'AB', 'Salaried GP'],
  ['LOBB, Harry (Dr)', 'Harry Lobb', 'HL', 'GP Registrar'],
  ['WITHEY, Trudi (Dr)', 'Trudi Withey', 'TW', 'GP Partner'],
  ['PATEL-HUGHES, Meera (Dr)', 'Meera Patel-Hughes', 'MP', 'Salaried GP'],
  ['OKONKWO, Benedict (Dr)', 'Benedict Okonkwo', 'BO', 'GP Partner'],
  ['REID, Nina (Sr)', 'Nina Reid', 'NR', 'Practice Nurse'],
  ['FLYNN, Owen (Mr)', 'Owen Flynn', 'OF', 'Advanced Nurse Practitioner'],
  ['SAUNDERS, Priya', 'Priya Saunders', 'PS', 'Clinical Pharmacist'],
  ['MARSH, Lily', 'Lily Marsh', 'LM', 'HCA'],
];
const SITES = [
  { name: 'Winscombe', colour: '#8b5cf6' },
  { name: 'Banwell', colour: '#84cc16' },
  { name: 'Locking', colour: '#f97316' },
];
const TYPES = ['Book on the day', 'Routine 15 min', 'Telephone urgent', 'Telephone routine', 'Admin', 'Meeting', 'Home visit', 'Minor surgery', 'Baby clinic', 'Blood test'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function buildFixture() {
  const monday = new Date(); monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const clinicians = PEOPLE.map(p => p[0]);
  const dates = [], dateData = {}, bookedData = {}, embargoedData = {}, blockedData = {}, slotRows = {}, locationData = {}, slotLocationData = {};
  for (let w = -1; w < 3; w++) for (let i = 0; i < 5; i++) {
    const dt = new Date(monday); dt.setDate(dt.getDate() + w * 7 + i);
    const ds = toHuddleDateStr(dt);
    dates.push(ds);
    dateData[ds] = { am: {}, pm: {} }; bookedData[ds] = { am: {}, pm: {} }; embargoedData[ds] = { am: {}, pm: {} }; blockedData[ds] = { am: {}, pm: {} };
    slotRows[ds] = {}; locationData[ds] = {}; slotLocationData[ds] = {};
    PEOPLE.forEach((p, idx) => {
      if ((idx + i + w) % 5 === 4) return;
      const site = SITES[(idx + i) % SITES.length].name;
      const rows = [];
      const am = {}, pm = {}, amB = {}, pmB = {};
      const push = (time, t, n, booked) => { for (let k = 0; k < n; k++) rows.push({ time, slotType: t, location: site, booked: k < booked }); };
      const isGp = idx < 6;
      const t1 = isGp ? 'Book on the day' : TYPES[8 + (idx % 2)];
      const t2 = isGp ? 'Routine 15 min' : 'Blood test';
      push('Before 12:59', t1, 8, 5); am[t1] = 8; amB[t1] = 5;
      push('Before 12:59', t2, 4, 4); am[t2] = 4; amB[t2] = 4;
      if ((idx + i) % 3 !== 2) { push('After or At 13:00', 'Routine 15 min', 6, 3); pm['Routine 15 min'] = 6; pmB['Routine 15 min'] = 3; push('After or At 13:00', 'Telephone urgent', 3, 1); pm['Telephone urgent'] = 3; pmB['Telephone urgent'] = 1; }
      if (idx === 0) { push('Before 12:59', 'Home visit', 2, 0); am['Home visit'] = 2; amB['Home visit'] = 0; }
      slotRows[ds][idx] = rows;
      dateData[ds].am[idx] = am; dateData[ds].pm[idx] = pm;
      bookedData[ds].am[idx] = amB; bookedData[ds].pm[idx] = pmB;
      locationData[ds][idx] = site;
    });
  }
  const teamClin = PEOPLE.map((p, i) => ({ id: `c${i}`, name: p[1], initials: p[2], role: p[3], status: 'active', csvName: p[0], emisName: p[0], site: SITES[i % 3].name, email: `${p[2].toLowerCase()}@example.nhs.uk`, buddyCover: i < 6 }));
  const rota = (n, off) => { const out = {}; let left = n; DAYS.forEach((d, k) => { out[d] = { am: (left > 0 && k !== off) ? 'in' : 'out', pm: (left > 1 && k !== off) ? 'in' : 'out' }; left -= 2; }); return out; };
  const sessionRotaDetail = Object.fromEntries(teamClin.map((c, i) => [c.id, rota(9 - (i % 4), i % 5)]));
  const weeklyRota = Object.fromEntries(teamClin.map((c, i) => [c.id, DAYS.filter((d, k) => k !== i % 5)]));
  const y = new Date().getFullYear();
  const todayIso = toLocalIso(new Date());
  const data = {
    _v4: { practiceName: 'Winscombe & Banwell Family Practice', role: 'admin', practiceId: 'p1', practiceSlug: 'winscombe', userId: 'u1', isPlatformAdmin: false, email: 'darren.cox@example.nhs.uk' },
    role: 'admin',
    clinicians: teamClin,
    sessionRotaDetail, weeklyRota,
    sites: SITES,
    huddleSettings: {
      slotCategories: { routine: ['Routine 15 min', 'Telephone routine'], urgent: ['Book on the day', 'Telephone urgent'] },
      savedSlotFilters: { routine: { 'Routine 15 min': true, 'Telephone routine': true }, urgent: { 'Book on the day': true, 'Telephone urgent': true } },
      dutyDoctorSlot: ['Book on the day'], knownSlotTypes: TYPES, sites: SITES,
      capacityStaffing: { groups: ['gp'], thresholds: { Winscombe: 3, Banwell: 2, Locking: 2 } },
      routineTarget: 320,
    },
    huddleCsvUploadedAt: new Date().toISOString(),
    plannedAbsences: [
      { id: 'a1', clinicianId: 'c3', clinicianName: 'Trudi Withey', startDate: `${y}-10-07`, endDate: `${y + 1}-01-07`, reason: 'sickness', session: 'all' },
      { id: 'a2', clinicianId: 'c1', clinicianName: 'Alice Blackwell', startDate: todayIso, endDate: todayIso, reason: 'annual leave', session: 'all' },
    ],
    dailyOverrides: {}, rotaNotes: {}, roomAllocation: {}, allocationHistory: [], closedDays: {},
    staffPlan: { plannedPeople: [{ id: 'p1', name: 'New salaried GP', role: 'Salaried GP', group: 'gp' }], events: [
      { id: 'e1', personRef: 'c0', type: 'change', month: `${y}-11`, startDate: `${y}-11-01`, sessions: 6 },
      { id: 'e4', personRef: 'c3', type: 'temp_leave', month: `${y}-10`, toMonth: `${y + 1}-01`, startDate: `${y}-10-07`, endDate: `${y + 1}-01-07`, reason: 'long-term sickness' },
      { id: 'e6', personRef: 'p1', type: 'join', month: `${y}-10`, startDate: `${y}-10-01`, sessions: 6 },
    ] },
    spendRates: { locumSession: 450, salariedSession: 380 }, spendDecisions: [],
    listSize: 11515,
  };
  const huddleData = { clinicians, allSlotTypes: TYPES, reportDate: todayIso, dates, dateData, bookedData, embargoedData, blockedData, locationData, splitSiteData: {}, slotLocationData, slotRows };
  return { data, huddleData, teamClin, sites: SITES };
}