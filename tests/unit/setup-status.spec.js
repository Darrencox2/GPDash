// Unit tests for lib/setup-status.js — whether a practice has enough data to
// use the dashboard, and what the per-section indicators say.
//
// The stakes: isMinimumSetupComplete is a gate. app/p/[id]/page.js redirects a
// practice away from its own dashboard to /setup-in-progress when this says
// false, and auto-stamps setup_completed_at when it says true. Too strict and
// a working practice is locked out of the product; too loose and someone lands
// on a dashboard with no team and a capacity of zero.
import { test, expect } from '@playwright/test';
import {
  isMinimumSetupComplete, getSectionStatuses, countCliniciansNeedingAttention,
} from '../../lib/setup-status.js';

const ready = { postcode: 'BS25 1AF', list_size: 9000 };

test.describe('isMinimumSetupComplete', () => {
  test('true only when postcode, list size and a clinician are all present', () => {
    expect(isMinimumSetupComplete(ready, 1)).toBe(true);
  });

  test('each of the three is individually load-bearing', () => {
    expect(isMinimumSetupComplete({ ...ready, postcode: null }, 1)).toBe(false);
    expect(isMinimumSetupComplete({ ...ready, list_size: null }, 1)).toBe(false);
    expect(isMinimumSetupComplete(ready, 0)).toBe(false);
  });

  test('whitespace is not a postcode', () => {
    expect(isMinimumSetupComplete({ ...ready, postcode: '   ' }, 1)).toBe(false);
  });

  test('a zero or negative list size does not count', () => {
    // list_size divides the demand model. Zero would be a division by zero
    // dressed up as a completed setup.
    expect(isMinimumSetupComplete({ ...ready, list_size: 0 }, 1)).toBe(false);
    expect(isMinimumSetupComplete({ ...ready, list_size: -1 }, 1)).toBe(false);
  });

  test('a missing practice is false, not a throw', () => {
    expect(isMinimumSetupComplete(null, 5)).toBe(false);
    expect(isMinimumSetupComplete(undefined, 5)).toBe(false);
  });

  test('a missing clinician count is false, not NaN-true', () => {
    expect(isMinimumSetupComplete(ready, undefined)).toBe(false);
    expect(isMinimumSetupComplete(ready, null)).toBe(false);
  });
});

test.describe('getSectionStatuses — required sections', () => {
  test('details is done when both postcode and list size are set', () => {
    const s = getSectionStatuses({ practice: ready, clinicianCount: 1 });
    expect(s.details.complete).toBe(true);
    expect(s.details.state).toBe('done');
    expect(s.details.hint).toBe(null);
  });

  test('details names the first missing field', () => {
    expect(getSectionStatuses({ practice: { list_size: 9000 } }).details.hint).toBe('Add a postcode');
    expect(getSectionStatuses({ practice: { postcode: 'BS25 1AF' } }).details.hint).toBe('Set the list size');
  });

  test('clinicians is not done while any need attention', () => {
    const s = getSectionStatuses({ practice: ready, clinicianCount: 12, clinicianNeedsAttentionCount: 3 });
    expect(s.clinicians.complete).toBe(false);
    expect(s.clinicians.state).toBe('todo');
    expect(s.clinicians.hint).toBe('3 clinicians need attention (missing initials or role)');
  });

  test('the attention hint is singular for one', () => {
    const s = getSectionStatuses({ practice: ready, clinicianCount: 12, clinicianNeedsAttentionCount: 1 });
    expect(s.clinicians.hint).toBe('1 clinician need attention (missing initials or role)');
  });

  test('an empty team points at the CSV upload', () => {
    expect(getSectionStatuses({ practice: ready, clinicianCount: 0 }).clinicians.hint)
      .toBe('Upload an EMIS CSV to populate your team');
  });
});

test.describe('getSectionStatuses — optional sections never nag', () => {
  test('all three report complete even when empty', () => {
    // complete stays true so the setup strip can auto-hide; state carries the
    // real answer so the UI shows neutral grey rather than green or amber.
    const s = getSectionStatuses({ practice: ready, clinicianCount: 1 });
    for (const key of ['teamnet', 'demand', 'team']) {
      expect(s[key].complete, key).toBe(true);
      expect(s[key].optional, key).toBe(true);
      expect(s[key].state, key).toBe('optional');
    }
  });

  test('they flip to done once actually set up', () => {
    const s = getSectionStatuses({
      practice: ready, clinicianCount: 1,
      teamnetUrl: 'https://teamnet.example/cal.ics',
      demandHistoryCount: 400,
      memberCount: 4,
    });
    expect(s.teamnet.state).toBe('done');
    expect(s.demand.state).toBe('done');
    expect(s.team.state).toBe('done');
    expect(s.team.hint).toBe('4 members');
  });

  test('a single member is not a team — the owner alone does not count', () => {
    expect(getSectionStatuses({ practice: ready, clinicianCount: 1, memberCount: 1 }).team.state)
      .toBe('optional');
  });

  test('a whitespace teamnet url is not a connection', () => {
    expect(getSectionStatuses({ practice: ready, clinicianCount: 1, teamnetUrl: '  ' }).teamnet.state)
      .toBe('optional');
  });
});

test.describe('countCliniciansNeedingAttention', () => {
  test('counts missing initials', () => {
    expect(countCliniciansNeedingAttention([
      { initials: 'DC', role: 'GP Partner' },
      { initials: '', role: 'GP Partner' },
      { initials: '  ', role: 'GP Partner' },
      { role: 'GP Partner' },
    ])).toBe(3);
  });

  test('counts placeholder roles', () => {
    expect(countCliniciansNeedingAttention([
      { initials: 'AB', role: 'staff' },
      { initials: 'CD', role: 'Unknown' },
      { initials: 'EF', role: '' },
      { initials: 'GH', role: 'Salaried GP' },
    ])).toBe(3);
  });

  test('counts a title mistaken for a role', () => {
    // The EMIS import occasionally lands the title in the role column, which
    // produces a clinician whose job is "Dr".
    expect(countCliniciansNeedingAttention([
      { initials: 'AB', role: 'Dr' },
      { initials: 'CD', role: 'Mrs' },
      { initials: 'EF', role: 'Professor' },
      { initials: 'GH', role: 'Advanced Nurse Practitioner' },
    ])).toBe(3);
  });

  test('ignores clinicians who have left', () => {
    // Chasing initials for someone who left the practice is noise that never
    // clears, so the section could never go green.
    expect(countCliniciansNeedingAttention([
      { initials: '', role: 'GP', status: 'left' },
      { initials: '', role: 'GP', status: 'active' },
    ])).toBe(1);
  });

  test('a clean list needs no attention', () => {
    expect(countCliniciansNeedingAttention([{ initials: 'DC', role: 'GP Partner', status: 'active' }])).toBe(0);
  });

  test('non-array input is zero, not a throw', () => {
    expect(countCliniciansNeedingAttention(null)).toBe(0);
    expect(countCliniciansNeedingAttention(undefined)).toBe(0);
    expect(countCliniciansNeedingAttention({})).toBe(0);
  });
});
