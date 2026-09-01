'use client';
// ═══════════════════════════════════════════════════════════════════════════
// StaffFilter — one staff filter, used everywhere staff are filtered
// ═══════════════════════════════════════════════════════════════════════════
// Three screens had grown three different answers to "show me only some of
// the team": Staff Changes filtered by job title, the capacity week filtered
// by the four coarse groups, and the report builder shipped its own private
// copy of the dropdown. Same question, three vocabularies, three behaviours.
//
// This is the single one. It always offers EVERY role on the register, so
// "GP Registrar but not Medical Student" is expressible - the coarse groups
// could not say that. The groups survive as presets, which is what they were
// really good for.
//
// Selecting nothing means everyone: an empty filter is not an empty screen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import MultiSelect from '@/components/ui/MultiSelect';
import { classifyStaffRole } from '@/lib/site-staffing';

// Build the option list from whatever the caller has: the staff register,
// or anything else carrying { role }. Each option counts its people so the
// number is there to judge by before you tick it.
export function staffRoleOptions(people, { sessionsOf = null } = {}) {
  const acc = {};
  for (const p of people || []) {
    const role = p.role || 'Unspecified';
    if (!acc[role]) acc[role] = { id: role, label: role, group: classifyStaffRole(role), n: 0, sessions: 0 };
    acc[role].n += 1;
    if (sessionsOf) acc[role].sessions += sessionsOf(p) || 0;
  }
  return Object.values(acc)
    .sort((a, b) => (b.sessions - a.sessions) || (b.n - a.n) || a.label.localeCompare(b.label))
    .map((o) => ({ ...o, hint: sessionsOf ? `${o.n} · ${o.sessions}` : String(o.n) }));
}

// ── Remembering the choice ────────────────────────────────────────────────
// Every screen that filters staff should come back the way you left it, and
// each one gets its own key: the roles you want on the capacity week are not
// the roles you want on staff changes. The choice is a per-viewer preference,
// not practice data, so it lives in localStorage rather than the database.
//
// `available` is the role ids currently on the register. A stored role that
// has since been renamed or retired is dropped, and if nothing survives the
// filter falls back rather than silently showing an empty screen - a stale
// preference must never look like "nobody works here".
export function usePersistedRoles(storageKey, { available = null, fallback = [] } = {}) {
  const [roles, setRoles] = useState(null);   // null until localStorage is read
  useEffect(() => {
    let stored = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) stored = JSON.parse(raw);
    } catch { /* private mode, or a value we did not write */ }
    setRoles(Array.isArray(stored) ? stored : []);
  }, [storageKey]);

  const set = useCallback((next) => {
    const clean = Array.isArray(next) ? next : [];
    setRoles(clean);
    try { localStorage.setItem(storageKey, JSON.stringify(clean)); } catch { /* private mode */ }
  }, [storageKey]);

  const live = useMemo(() => {
    const chosen = roles || [];
    if (!available) return chosen;
    const known = new Set(available);
    const kept = chosen.filter((r) => known.has(r));
    return kept.length ? kept : fallback;
  }, [roles, available, fallback]);

  return [live, set, roles !== null];
}

export default function StaffFilter({
  options, selected, onChange, label = 'Staff', allLabel = 'Everyone',
  width = 220, hintLabel = null,
}) {
  // The four groups as presets. Only offered when the roles on screen
  // actually populate them, so a nursing-free list has no Nursing preset
  // that selects nothing.
  const presets = useMemo(() => {
    const inGroup = (g) => (options || []).filter((o) => o.group === g).map((o) => o.id);
    return [
      { label: 'GPs', ids: inGroup('gp') },
      { label: 'GPs + nursing', ids: [...inGroup('gp'), ...inGroup('nursing')] },
      { label: 'Everyone', ids: [] },
    ].filter((p, i) => i === 2 || p.ids.length > 0);
  }, [options]);

  return (
    <MultiSelect
      label={label}
      options={options || []}
      selected={selected || []}
      onChange={onChange}
      allLabel={allLabel}
      presets={presets}
      width={width}
      hintLabel={hintLabel}
    />
  );
}
