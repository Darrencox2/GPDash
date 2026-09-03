// Unit tests for lib/permissions.js — the role gating every component asks
// before showing an edit affordance.
//
// The stakes: these helpers are not the security boundary (RLS is), but they
// decide what a person is shown. Two rules in here are easy to break by
// accident and expensive when broken:
//
//   1. Leadership EXCLUDES the operational 'admin' role. Meetings are
//      confidential — partners' business, not the reception manager's. This
//      mirrors the database function is_practice_leadership(), and if the two
//      drift the UI offers a module the database then refuses.
//   2. Platform admin acts as owner everywhere, including on practices they
//      are not a member of.
import { test, expect } from '@playwright/test';
import {
  getRole, isPlatformAdmin, isLeadership, isAdmin,
  canEditPracticeData, canManagePractice, canManageMembers,
  canAccessMeetings, canPromoteToOwner, canEditRotaNote,
  canMarkPresence, canViewMembers, canViewAuditLog, roleLabel,
} from '../../lib/permissions.js';

const as = (role, extra = {}) => ({ _v4: { myRole: role, ...extra } });
const platformAdmin = { _v4: { myRole: 'user', isPlatformAdmin: true } };

const ROLES = ['owner', 'partner', 'practice_manager', 'admin', 'user'];

test.describe('role probes', () => {
  test('getRole reads through _v4 and tolerates missing data', () => {
    expect(getRole(as('owner'))).toBe('owner');
    expect(getRole({})).toBe(null);
    expect(getRole(null)).toBe(null);
    expect(getRole(undefined)).toBe(null);
  });

  test('isPlatformAdmin is false unless the flag is actually set', () => {
    expect(isPlatformAdmin(platformAdmin)).toBe(true);
    expect(isPlatformAdmin(as('owner'))).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
  });
});

test.describe('leadership excludes operational admin', () => {
  // This is the rule most likely to be "simplified" by someone tidying up.
  test('owner, partner and practice_manager are leadership', () => {
    expect(isLeadership(as('owner'))).toBe(true);
    expect(isLeadership(as('partner'))).toBe(true);
    expect(isLeadership(as('practice_manager'))).toBe(true);
  });

  test('admin is NOT leadership, and cannot reach Meetings', () => {
    expect(isAdmin(as('admin'))).toBe(true);
    expect(isLeadership(as('admin'))).toBe(false);
    expect(canAccessMeetings(as('admin'))).toBe(false);
  });

  test('but admin can still edit practice data', () => {
    // The distinction is confidentiality, not capability. An admin who lost
    // edit rights here would be unable to run the huddle.
    expect(canEditPracticeData(as('admin'))).toBe(true);
  });

  test('user reaches nothing', () => {
    expect(isLeadership(as('user'))).toBe(false);
    expect(canAccessMeetings(as('user'))).toBe(false);
    expect(canEditPracticeData(as('user'))).toBe(false);
  });
});

test.describe('owner-only capabilities', () => {
  test('renaming the practice and promoting an owner are owner-only', () => {
    for (const role of ROLES) {
      const expected = role === 'owner';
      expect(canManagePractice(as(role)), `canManagePractice for ${role}`).toBe(expected);
      expect(canPromoteToOwner(as(role)), `canPromoteToOwner for ${role}`).toBe(expected);
    }
  });

  test('member management is wider than practice management', () => {
    // partner / practice_manager / admin can invite and set roles, but must
    // not be able to rename the practice or hand ownership away.
    expect(canManageMembers(as('partner'))).toBe(true);
    expect(canManagePractice(as('partner'))).toBe(false);
    expect(canManageMembers(as('admin'))).toBe(true);
    expect(canPromoteToOwner(as('admin'))).toBe(false);
    expect(canManageMembers(as('user'))).toBe(false);
  });
});

test.describe('platform admin acts as owner everywhere', () => {
  test('every capability opens, even with a base role of user', () => {
    expect(canEditPracticeData(platformAdmin)).toBe(true);
    expect(canManagePractice(platformAdmin)).toBe(true);
    expect(canManageMembers(platformAdmin)).toBe(true);
    expect(canAccessMeetings(platformAdmin)).toBe(true);
    expect(canPromoteToOwner(platformAdmin)).toBe(true);
    expect(canViewAuditLog(platformAdmin)).toBe(true);
  });
});

test.describe('canEditRotaNote — the one self-service exception', () => {
  test('management edits anyone', () => {
    expect(canEditRotaNote(as('owner'), 'clin-1')).toBe(true);
    expect(canEditRotaNote(as('admin'), 'clin-1')).toBe(true);
  });

  test('a plain user edits only the clinician they are linked to', () => {
    const linked = as('user', { linkedClinicianId: 'clin-1' });
    expect(canEditRotaNote(linked, 'clin-1')).toBe(true);
    expect(canEditRotaNote(linked, 'clin-2')).toBe(false);
  });

  test('an unlinked user edits nobody — including the undefined clinician', () => {
    // Regression shape: if linkedClinicianId is undefined and the caller also
    // passes undefined, a bare === comparison would grant access to a note
    // that has no clinician.
    const unlinked = as('user');
    expect(canEditRotaNote(unlinked, undefined)).toBe(false);
    expect(canEditRotaNote(unlinked, 'clin-1')).toBe(false);
  });
});

test.describe('presence, members and audit follow edit rights', () => {
  test('all three track canEditPracticeData for every role', () => {
    for (const role of ROLES) {
      const data = as(role);
      const base = canEditPracticeData(data);
      expect(canMarkPresence(data), `canMarkPresence for ${role}`).toBe(base);
      expect(canViewMembers(data), `canViewMembers for ${role}`).toBe(base);
      expect(canViewAuditLog(data), `canViewAuditLog for ${role}`).toBe(base);
    }
  });

  test('a plain user cannot toggle their own presence', () => {
    // Deliberate per the role design — presence is set by whoever runs the
    // huddle, not by each clinician for themselves.
    expect(canMarkPresence(as('user', { linkedClinicianId: 'clin-1' }))).toBe(false);
  });
});

test.describe('roleLabel', () => {
  test('names every role, and falls back to Guest', () => {
    expect(roleLabel(platformAdmin)).toBe('Platform admin');
    expect(roleLabel(as('owner'))).toBe('Practice owner');
    expect(roleLabel(as('partner'))).toBe('Partner');
    expect(roleLabel(as('practice_manager'))).toBe('Practice manager');
    expect(roleLabel(as('admin'))).toBe('Practice admin');
    expect(roleLabel(as('user'))).toBe('Practice user');
    expect(roleLabel({})).toBe('Guest');
    expect(roleLabel(null)).toBe('Guest');
  });

  test('platform admin label wins over the underlying role', () => {
    expect(roleLabel({ _v4: { myRole: 'owner', isPlatformAdmin: true } })).toBe('Platform admin');
  });
});
