// Unit tests for lib/calendar-feed.js — the pure half of the personal ICS
// feed at /api/v4/calendar/[token].
//
// The stakes: this feed lands in a clinician's own calendar app. A wrong
// session bucket puts a morning surgery in their afternoon; a missing escape
// breaks the whole .ics file and the subscription silently stops updating
// rather than showing an error.
//
// The load-bearing domain fact, verified against a live export: EMIS row times
// are session buckets ("Before 12:59" / "After or At 13:00"), not clocks.
import { test, expect } from '@playwright/test';
import { icsStamp, esc, parseTimeMins, buildBlocks } from '../../lib/calendar-feed.js';

test.describe('icsStamp', () => {
  test('formats local time as the ICS basic form', () => {
    expect(icsStamp(new Date(2026, 8, 4, 9, 5))).toBe('20260904T090500');
  });

  test('zero-pads every component', () => {
    expect(icsStamp(new Date(2026, 0, 1, 0, 0))).toBe('20260101T000000');
  });
});

test.describe('esc', () => {
  test('escapes the four characters that break an ICS line', () => {
    expect(esc('a;b,c\nd')).toBe('a\\;b\\,c\\nd');
  });

  test('escapes backslashes first, so an escape is not double-processed', () => {
    // If the backslash rule ran last it would escape the backslashes this
    // function had just inserted, and every semicolon would come out wrong.
    expect(esc('a\\b')).toBe('a\\\\b');
    expect(esc('a\\;b')).toBe('a\\\\\\;b');
  });

  test('coerces non-strings rather than throwing mid-feed', () => {
    expect(esc(42)).toBe('42');
    expect(esc(null)).toBe('null');
  });
});

test.describe('parseTimeMins', () => {
  test('reads a clock time into minutes past midnight', () => {
    expect(parseTimeMins('09:30')).toBe(570);
    expect(parseTimeMins('13:00')).toBe(780);
    expect(parseTimeMins('9:05 - 9:15')).toBe(545);
  });

  test('returns null for the session-bucket labels and for junk', () => {
    expect(parseTimeMins('Before 12:59')).toBe(779);  // it does contain a clock
    expect(parseTimeMins('After or At')).toBe(null);
    expect(parseTimeMins('')).toBe(null);
    expect(parseTimeMins(null)).toBe(null);
    expect(parseTimeMins(undefined)).toBe(null);
  });
});

test.describe('buildBlocks — session bucketing', () => {
  test('"Before" is morning and "After" is afternoon, regardless of the clock in the label', () => {
    // This is the whole domain fact. "Before 12:59" contains 12:59, which a
    // clock-first reading would bucket as AM by luck; "After or At 13:00"
    // contains 13:00, which would bucket as PM by luck. Both must be decided
    // by the word, not the number, or a relabelled export silently reshuffles
    // somebody's day.
    const blocks = buildBlocks([
      { time: 'Before 12:59', count: 3 },
      { time: 'After or At 13:00', count: 4 },
    ]);
    expect(blocks.map(b => b.session)).toEqual(['AM', 'PM']);
    expect(blocks[0].total).toBe(3);
    expect(blocks[1].total).toBe(4);
  });

  test('literal clock times fall back to the hour', () => {
    const blocks = buildBlocks([
      { time: '09:00', count: 1 },
      { time: '14:00', count: 1 },
      { time: '18:30', count: 1 },
    ]);
    expect(blocks.map(b => b.session)).toEqual(['AM', 'PM', 'Evening']);
  });

  test('18:30 is the evening boundary and is inclusive', () => {
    expect(buildBlocks([{ time: '18:29' }])[0].session).toBe('PM');
    expect(buildBlocks([{ time: '18:30' }])[0].session).toBe('Evening');
  });

  test('rows with no readable time are dropped, not defaulted into a session', () => {
    // Defaulting would invent appointments in a block the clinician does not
    // actually work.
    expect(buildBlocks([{ time: 'unknown' }, { time: '' }, {}])).toEqual([]);
  });

  test('blocks always come back in AM, PM, Evening order', () => {
    const blocks = buildBlocks([
      { time: '19:00' }, { time: 'After or At 13:00' }, { time: 'Before 12:59' },
    ]);
    expect(blocks.map(b => b.session)).toEqual(['AM', 'PM', 'Evening']);
  });

  test('each block carries the documented session span', () => {
    const [am, pm, eve] = buildBlocks([
      { time: 'Before 12:59' }, { time: 'After or At 13:00' }, { time: '19:00' },
    ]);
    expect([am.startMins, am.endMins]).toEqual([8 * 60 + 30, 13 * 60]);
    expect([pm.startMins, pm.endMins]).toEqual([13 * 60 + 30, 18 * 60]);
    expect([eve.startMins, eve.endMins]).toEqual([18 * 60 + 30, 20 * 60]);
  });
});

test.describe('buildBlocks — counts and summaries', () => {
  test('a row with no count is worth one appointment, not zero', () => {
    expect(buildBlocks([{ time: '09:00' }, { time: '09:00' }])[0].total).toBe(2);
  });

  test('the site is the location with the most appointments', () => {
    const [block] = buildBlocks([
      { time: '09:00', count: 2, location: 'Winscombe' },
      { time: '09:00', count: 5, location: 'Banwell' },
    ]);
    expect(block.site).toBe('Banwell');
    expect(block.total).toBe(7);
  });

  test('site is null when no row carries a location', () => {
    expect(buildBlocks([{ time: '09:00' }])[0].site).toBe(null);
  });

  test('slot summary is biggest-first and capped at six kinds', () => {
    const rows = [];
    for (let i = 1; i <= 8; i++) rows.push({ time: '09:00', count: i, slotType: `Type${i}` });
    const [block] = buildBlocks(rows);
    const lines = block.slotSummary.split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('8x Type8');
    expect(lines[5]).toBe('3x Type3');
  });

  test('empty and null input give no blocks', () => {
    expect(buildBlocks([])).toEqual([]);
    expect(buildBlocks(null)).toEqual([]);
    expect(buildBlocks(undefined)).toEqual([]);
  });
});
