// Unit tests for lib/huddle.js — parsing and reading the EMIS export blob.
// Everything downstream (capacity, buddy cover, the calendar feed, the
// workload report) reads through these, so a quiet regression here is felt
// everywhere at once.
import { test, expect } from '@playwright/test';
import {
  parseHuddleDateStr, getBand, getCliniciansForDate,
  getSlotRowsForClinicianDate, getDutyDoctor,
} from '../../lib/huddle.js';

test.describe('parseHuddleDateStr — EMIS "DD-Mon-YYYY"', () => {
  test('parses to the right local calendar day', () => {
    const d = parseHuddleDateStr('31-Aug-2026');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);      // August, zero-indexed
    expect(d.getDate()).toBe(31);
  });

  test('is local midnight, not UTC — so the date key never slips a day', () => {
    const d = parseHuddleDateStr('01-Jan-2026');
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  test('handles every month abbreviation the export uses', () => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    months.forEach((mon, i) => {
      expect(parseHuddleDateStr(`15-${mon}-2026`).getMonth()).toBe(i);
    });
  });

  test('an unrecognised month yields an Invalid Date rather than a wrong one', () => {
    // Worth pinning: silently landing on a plausible-but-wrong date would be
    // far worse than a value callers can test with isNaN, which they do.
    expect(Number.isNaN(parseHuddleDateStr('15-Sept-2026').getTime())).toBe(true);
  });
});

test.describe('getBand — capacity vs target', () => {
  test('bands run short / tight / good / over at 80, 90 and 120 percent', () => {
    expect(getBand(70, 100).label).toBe('Short');
    expect(getBand(80, 100).label).toBe('Tight');
    expect(getBand(89, 100).label).toBe('Tight');
    expect(getBand(90, 100).label).toBe('Good');
    expect(getBand(119, 100).label).toBe('Good');
    expect(getBand(120, 100).label).toBe('Over');
  });

  test('a zero or missing target produces no judgement', () => {
    expect(getBand(50, 0).label).toBe('');
    expect(getBand(50, -1).label).toBe('');
  });

  test('reports the percentage it used', () => {
    expect(getBand(50, 100).pct).toBe(50);
  });
});

// A minimal blob in the real shape: two clinicians, one date, AM slots for
// index 0 only. Built by hand so the expectations are readable.
const BLOB = {
  clinicians: ['COX, Darren (Dr)', 'SMITH, Jane (Dr)'],
  dates: ['31-Aug-2026'],
  dateData:      { '31-Aug-2026': { am: { 0: { 'Routine': 6 } }, pm: {} } },
  bookedData:    { '31-Aug-2026': { am: { 0: { 'Routine': 4 } }, pm: {} } },
  embargoedData: { '31-Aug-2026': { am: {}, pm: {} } },
  slotRows: {
    '31-Aug-2026': {
      0: [
        { time: 'After or At 13:00', slotType: 'Routine', location: 'Winscombe' },
        { time: 'Before 12:59',      slotType: 'Urgent',  location: 'Winscombe' },
        { time: '09:30 - 09:45',     slotType: 'Routine', location: 'Winscombe' },
      ],
    },
  },
};

test.describe('getCliniciansForDate', () => {
  test('returns only clinicians with a non-zero slot count that day', () => {
    expect(getCliniciansForDate(BLOB, '31-Aug-2026')).toEqual(['COX, Darren (Dr)']);
  });

  test('a date with no data returns empty, not undefined', () => {
    expect(getCliniciansForDate(BLOB, '01-Sep-2026')).toEqual([]);
  });

  test('missing or malformed blobs return empty rather than throwing', () => {
    expect(getCliniciansForDate(null, '31-Aug-2026')).toEqual([]);
    expect(getCliniciansForDate({}, '31-Aug-2026')).toEqual([]);
  });
});

test.describe('getSlotRowsForClinicianDate', () => {
  test('sorts bucket labels and clock times into one running order', () => {
    const rows = getSlotRowsForClinicianDate(BLOB, '31-Aug-2026', 'COX, Darren (Dr)');
    // "Before 12:59" -> 0, "09:30" -> 570, "After or At 13:00" -> 720
    expect(rows.map(r => r.time)).toEqual([
      'Before 12:59', '09:30 - 09:45', 'After or At 13:00',
    ]);
  });

  test('does not mutate the source array', () => {
    const before = BLOB.slotRows['31-Aug-2026'][0].map(r => r.time);
    getSlotRowsForClinicianDate(BLOB, '31-Aug-2026', 'COX, Darren (Dr)');
    expect(BLOB.slotRows['31-Aug-2026'][0].map(r => r.time)).toEqual(before);
  });

  test('an unknown clinician returns empty', () => {
    expect(getSlotRowsForClinicianDate(BLOB, '31-Aug-2026', 'NOBODY, Real')).toEqual([]);
  });
});

// CHARACTERISATION TEST, not a specification. CLAUDE.md records that
// getDutyDoctor must remain unchanged after a prior "fix" was reverted.
// This pins the behaviour it has today so an accidental edit is caught,
// deliberately without asserting what it *ought* to do.
test.describe('getDutyDoctor — behaviour lock', () => {
  test('returns null when nothing matches, without throwing', () => {
    expect(getDutyDoctor(BLOB, '31-Aug-2026', 'am', [], [])).toBeFalsy();
    expect(getDutyDoctor(null, '31-Aug-2026', 'am', ['Duty'], [])).toBeFalsy();
  });
});
