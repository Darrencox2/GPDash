// lib/permissions.js — single source of truth for role-based UI gating.
//
// Every component that decides whether to show or disable an edit affordance
// imports from here. This keeps role checks consistent and makes the rules
// easy to change in one place.
//
// Server-side, the dashboard loader populates data._v4.myRole and
// data._v4.isPlatformAdmin. RLS in the database is the actual security
// boundary — these helpers only control what the UI shows. A 'user' who
// somehow gets past UI gating still can't write to the database.

// ─── Role probes ──────────────────────────────────────────────────────

export function getRole(data) {
  return data?._v4?.myRole || null;
}

export function isPlatformAdmin(data) {
  return !!data?._v4?.isPlatformAdmin;
}

export function isOwner(data) {
  return getRole(data) === 'owner';
}

export function isAdmin(data) {
  // 'admin' role specifically. For "admin or higher" use canEditPracticeData.
  return getRole(data) === 'admin';
}

export function isUser(data) {
  return getRole(data) === 'user';
}

// ─── Capability probes — what every component should ask ─────────────

// Can edit any practice-level data (clinicians, working patterns, settings,
// huddle, buddy cover, rooms, etc.). Platform admin acts as owner everywhere.
export function canEditPracticeData(data) {
  if (isPlatformAdmin(data)) return true;
  const role = getRole(data);
  return role === 'owner' || role === 'admin';
}

// Can manage the practice itself (rename, change slug, transfer ownership).
// Owner-only.
export function canManagePractice(data) {
  if (isPlatformAdmin(data)) return true;
  return getRole(data) === 'owner';
}

// Can invite, remove, or change roles of practice members.
export function canManageMembers(data) {
  if (isPlatformAdmin(data)) return true;
  const role = getRole(data);
  return role === 'owner' || role === 'admin';
}

// Can promote a member to owner. Owner-only.
export function canPromoteToOwner(data) {
  if (isPlatformAdmin(data)) return true;
  return getRole(data) === 'owner';
}

// Can a user edit the rota note for this clinician on a given date?
// - Admins/owners: yes for anyone
// - 'user' role: yes only if the clinician is themselves
// - Others: no
export function canEditRotaNote(data, clinicianId) {
  if (canEditPracticeData(data)) return true;
  // Self-edit: 'user' role can edit their own rota notes
  return data?._v4?.linkedClinicianId === clinicianId;
}

// Can mark presence (in/out) for a clinician on a given day. Admin-only —
// general users cannot toggle their own presence per the role design.
export function canMarkPresence(data) {
  return canEditPracticeData(data);
}

// Can view the list of practice members (other users on this site).
// Admin-only — general users don't see who else is on the site.
export function canViewMembers(data) {
  return canEditPracticeData(data);
}

// Can view the audit log.
export function canViewAuditLog(data) {
  return canEditPracticeData(data);
}

// ─── Display helper ─────────────────────────────────────────────────

// Human-readable label for the current role. Used in the UI banner that
// tells general users they're in view-only mode.
export function roleLabel(data) {
  if (isPlatformAdmin(data)) return 'Platform admin';
  const role = getRole(data);
  if (role === 'owner') return 'Practice owner';
  if (role === 'admin') return 'Practice admin';
  if (role === 'user') return 'Practice user';
  return 'Guest';
}
