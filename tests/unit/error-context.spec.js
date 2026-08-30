// Unit tests for lib/error-context.js.
// The error box is only useful if it recognises a stale build correctly and
// produces a report someone can paste. Both are testable without a browser.
import { test, expect } from '@playwright/test';
import { noteAction, getTrail, isStaleBuildError, buildErrorReport } from '../../lib/error-context.js';

test.describe('isStaleBuildError', () => {
  // The real message Darren saw, plus the other shapes browsers use.
  const stale = [
    { message: 'Failed to load chunk /_next/static/chunks/314uzn56-jsq_.js from module 96672' },
    { name: 'ChunkLoadError', message: 'Loading chunk 493 failed.' },
    { message: 'Importing a module script failed.' },
    { message: 'error loading dynamically imported module: /_next/static/x.js' },
  ];
  for (const e of stale) {
    test(`recognises: ${(e.name || '') + e.message.slice(0, 40)}`, () => {
      expect(isStaleBuildError(e)).toBe(true);
    });
  }

  test('does NOT treat ordinary crashes as stale builds', () => {
    // Reloading on a real bug would hide it behind an infinite-looking refresh.
    expect(isStaleBuildError({ message: "Cannot read properties of undefined (reading 'map')" })).toBe(false);
    expect(isStaleBuildError({ message: 'Network request failed' })).toBe(false);
    expect(isStaleBuildError({})).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
  });
});

test.describe('the breadcrumb', () => {
  test('records actions in order and ignores repeats', () => {
    noteAction('Opened section: huddle-today');
    noteAction('Opened section: huddle-today');   // repeat
    noteAction('Opened section: buddy-cover');
    const t = getTrail().map(x => x.label);
    expect(t.slice(-2)).toEqual(['Opened section: huddle-today', 'Opened section: buddy-cover']);
  });

  test('is capped so it cannot grow without bound', () => {
    for (let i = 0; i < 40; i++) noteAction(`step ${i}`);
    expect(getTrail().length).toBeLessThanOrEqual(8);
  });

  test('ignores empty labels', () => {
    const before = getTrail().length;
    noteAction('');
    noteAction(null);
    expect(getTrail().length).toBe(before);
  });
});

test.describe('buildErrorReport', () => {
  const report = () => buildErrorReport({
    error: Object.assign(new Error('Boom'), { stack: 'Error: Boom\n  at thing (file.js:1:1)' }),
    componentStack: '\n    in CapacityWeek\n    in SectionErrorBoundary',
    section: 'huddle-forward',
    version: 'v4.127.0',
    practice: 'WINSCOMBE SURGERY',
  });

  test('includes everything needed to act on it without asking follow-ups', () => {
    const r = report();
    for (const needle of ['GPDash error report', 'v4.127.0', 'huddle-forward', 'WINSCOMBE SURGERY', 'Boom', 'What I did just before', 'Component stack', 'CapacityWeek']) {
      expect(r).toContain(needle);
    }
  });

  test('is plain text that survives being pasted into a message', () => {
    const r = report();
    expect(r).not.toContain('<');
    expect(r.split('\n').length).toBeGreaterThan(10);
  });

  test('degrades rather than throwing when everything is missing', () => {
    expect(() => buildErrorReport({})).not.toThrow();
    expect(buildErrorReport({})).toContain('GPDash error report');
  });
});
