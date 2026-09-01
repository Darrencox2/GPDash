// Unit tests for lib/status-transitions.js — the wind-down markers that the
// buddy board, the sweep and Staff Changes all key off.
//
// Background: the database held ZERO wind-down markers and ZERO absence
// provenance across 14 wind-downs, because a marker was written and then
// cleared by the next unrelated save. The save route can only tell "clear
// this" from "this save knows nothing about it" by whether the field is
// PRESENT, so undo must set null rather than drop the key.
import { test, expect } from '@playwright/test';
import { applyTransition, undoTransition, STATUS_TRANSITIONS } from '../../lib/status-transitions.js';

const baseData = () => ({
  clinicians: [{ id: 'c1', name: 'Trudi Withey', initials: 'TW', status: 'active' }],
  plannedAbsences: [],
  auditLog: [],
});

test.describe('applyTransition', () => {
  test('marks provenance on the absence it creates', () => {
    const out = applyTransition(baseData(), 'c1', 'long_term_sick', { untilDate: '2027-01-07', startDate: '2026-10-07' });
    const a = out.plannedAbsences.at(-1);
    expect(a).toMatchObject({ clinicianId: 'c1', startDate: '2026-10-07', endDate: '2027-01-07', source: 'winddown' });
    expect(a.reason).toBe(STATUS_TRANSITIONS.long_term_sick.reason);
    expect(out.clinicians[0].windDown).toMatchObject({ type: 'sick', startDate: '2026-10-07', endDate: '2027-01-07' });
  });

  test('the leaving wind-down defaults to eight weeks', () => {
    expect(STATUS_TRANSITIONS.left_winddown.defaultWeeks).toBe(8);
  });
});

test.describe('undoTransition', () => {
  test('clears the marker as an explicit null, never a missing key', () => {
    const applied = applyTransition(baseData(), 'c1', 'long_term_sick', { untilDate: '2027-01-07', startDate: '2026-10-07' });
    const undone = undoTransition(applied, 'c1');
    const c = undone.clinicians[0];
    // The key MUST survive: the save route treats an absent key as "leave
    // the stored marker alone", so dropping it would strand the marker.
    expect(Object.prototype.hasOwnProperty.call(c, 'windDown')).toBe(true);
    expect(c.windDown).toBeNull();
  });

  test('removes the absence even when it has lost its id and provenance', () => {
    // Exactly the shape the live rows are in: a database uuid instead of the
    // client-side winddown- id, and no source at all.
    const data = {
      ...baseData(),
      clinicians: [{ id: 'c1', name: 'Trudi Withey', status: 'active', windDown: { type: 'sick', startDate: '2026-10-07', endDate: '2027-01-07' } }],
      plannedAbsences: [
        { id: 'e23a95b9-8118-425a-92e3-6a399d9a06fb', clinicianId: 'c1', startDate: '2026-10-07', endDate: '2027-01-07', reason: 'Long term absence' },
        { id: 'other', clinicianId: 'c1', startDate: '2026-09-02', endDate: '2026-09-02', reason: 'annual_leave' },
      ],
    };
    const undone = undoTransition(data, 'c1');
    expect(undone.plannedAbsences.map(a => a.id)).toEqual(['other']);
  });

  test('leaves other people and other absences alone', () => {
    const data = {
      ...baseData(),
      clinicians: [
        { id: 'c1', name: 'A', status: 'active', windDown: { type: 'sick', startDate: '2026-10-07', endDate: '2027-01-07' } },
        { id: 'c2', name: 'B', status: 'active', windDown: { type: 'sick', startDate: '2026-10-07', endDate: '2027-01-07' } },
      ],
      plannedAbsences: [
        { id: 'x', clinicianId: 'c1', startDate: '2026-10-07', endDate: '2027-01-07', reason: 'Long term absence' },
        { id: 'y', clinicianId: 'c2', startDate: '2026-10-07', endDate: '2027-01-07', reason: 'Long term absence' },
      ],
    };
    const undone = undoTransition(data, 'c1');
    expect(undone.plannedAbsences.map(a => a.id)).toEqual(['y']);
    expect(undone.clinicians[1].windDown).not.toBeNull();
  });
});
