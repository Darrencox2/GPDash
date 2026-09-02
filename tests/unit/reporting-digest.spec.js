// The weekly digest on the reporting page.
import { test, expect } from '@playwright/test';
import { weeklyDigest, pickWeeks } from '../../lib/reporting-digest.js';
import { buildFacts, buildSessionFacts } from '../../lib/workload-report.js';
import { buildFixture } from '../render/fixture.js';

test.describe('weeklyDigest', () => {
  test('nothing to say without data', () => {
    expect(weeklyDigest({ slotFacts: [], sessionFacts: [] })).toBeNull();
  });
  test('the fixture practice gets five tiles that agree with the facts', () => {
    const f = buildFixture();
    const clinicians = f.data.clinicians.map((c) => ({ id: c.id, name: c.name, role: c.role }));
    const slot = buildFacts(f.huddleData, clinicians, f.data.huddleSettings);
    const sess = buildSessionFacts(slot.facts, f.data.huddleSettings.dutyDoctorSlot);
    const d = weeklyDigest({ slotFacts: slot.facts, sessionFacts: sess.facts, hasDuty: sess.hasDuty });
    expect(d).not.toBeNull();
    expect(d.tiles.map((t) => t.id)).toEqual(['fill', 'urgent', 'routine', 'duty', 'busiest']);
    const fill = d.tiles.find((t) => t.id === 'fill');
    expect(fill.display).toMatch(/^\d+%$/);
    expect(Number(fill.display.replace('%', ''))).toBeGreaterThan(0);
    expect(Number(fill.display.replace('%', ''))).toBeLessThanOrEqual(100);
    for (const t of d.tiles) expect(t.presetId).toBeTruthy();
    expect(d.weekLabel).toMatch(/^w\/c \d+ [A-Z][a-z]+$/);
  });
  test('last week is the most recent finished week, not a future one the export covers', () => {
    const D = 86400000; const now = 10 * 7 * D + 3 * D;   // a Wednesday
    const wk = (n) => n * 7 * D;
    expect(pickWeeks([wk(8), wk(9), wk(10), wk(11), wk(12)], now)).toEqual([wk(9), wk(8)]);   // 10 has started, 11 and 12 are ahead
    expect(pickWeeks([wk(10), wk(11)], now)).toEqual([wk(10), undefined]);                    // nothing finished: the one that has started
    expect(pickWeeks([wk(11), wk(12)], now)).toEqual([wk(11), undefined]);                    // all ahead: the nearest
  });
  test('a change is signed, and no change says so', () => {
    const mk = (weekStartMs, status, count, dow = 2) => ({ weekStartMs, status, count, category: 'routine', dow, isSystem: false });
    const w1 = 1000, w2 = 2000;
    const facts = [mk(w2, 'booked', 50), mk(w2, 'available', 50), mk(w1, 'booked', 40), mk(w1, 'available', 60)];
    const d = weeklyDigest({ slotFacts: facts, sessionFacts: [], now: 10 * 86400000 });
    expect(d.tiles.find((t) => t.id === 'fill').delta.display).toBe('+10 pts');
    expect(d.tiles.find((t) => t.id === 'routine').delta.display).toBe('no change');
  });
});
