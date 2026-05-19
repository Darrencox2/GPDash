'use client';

// QuickSetupTable — single-row-per-clinician inline-editable table.
//
// Designed for fast first-pass setup after a CSV upload, but kept as a
// permanent management view. Trades the depth of Team Members (room
// preferences, primary/secondary buddies, alias management) for raw speed:
// every essential field is editable on-screen without expanding cards.
//
// Auto-save: edits update local state immediately and queue a debounced
// save (~800ms after the last change). The whole clinicians array is sent
// to /api/v4/data POST which diffs server-side and only writes changed
// rows. Single-flight: in-flight save in progress + new edits → start a
// new debounce after the current save settles.
//
// "Needs attention" highlight: rows are flagged amber when essential
// fields are missing — empty initials, or role still set to a placeholder
// like 'Staff' or a stray title (Mrs / Mr / Dr / etc) that the CSV
// import couldn't reliably distinguish from a real role.
//
// Bulk actions: a checkbox at the start of every row + a select-all
// checkbox in the header. When 1+ rows are selected, a sticky toolbar
// appears with: set role / set group / set status / toggle buddy cover /
// toggle who's in. Each action applies to every selected row in one
// batch and is auto-saved like any other edit.

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { guessGroupFromRole } from '@/lib/data';

const ROLES = [
  'GP Partner', 'Associate Partner', 'Salaried GP', 'GP Registrar', 'Locum',
  'ANP', 'Paramedic Practitioner', 'Pharmacist', 'Physiotherapist',
  'Practice Nurse', 'Nurse Associate', 'HCA',
  'Medical Student', 'Admin',
];
// Group is auto-derived from role via guessGroupFromRole. No UI for it
// anymore — exposing it as a separate field just let users put a row
// into a state where role and group disagreed. The four groups
// (gp / nursing / allied / admin) are still stored in the DB
// (clinician_group enum) and used for filtering elsewhere; the role
// dropdown determines which one a row gets.
// Database enum public.clinician_status only allows these three values.
// Long-term absent is modelled separately via a boolean on the clinician
// record in v3 — not a status here. Don't add other values to this list
// or saves will fail with a Postgres enum constraint violation.
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'left', label: 'Left' },
];

// Treat these strings as "role wasn't really set" — usually CSV-import
// debris (a title that landed in the parens, or our literal default).
// Title-like values can sneak in when the CSV has names like
// "Smith, Jane (Mrs)" — old imports may have these stored. Showing
// them in the dropdown as "(custom)" was misleading.
const TITLE_LIKE = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'doctor', 'prof', 'professor', 'rev', 'sir', 'dame', 'lord', 'lady']);
const PLACEHOLDER_ROLES = new Set(['', 'staff', 'unknown']);
function isPlaceholderOrTitle(role) {
  const r = (role || '').trim().toLowerCase();
  return PLACEHOLDER_ROLES.has(r) || TITLE_LIKE.has(r);
}

function needsAttention(c) {
  if (!c.initials || c.initials.trim().length === 0) return true;
  if (isPlaceholderOrTitle(c.role)) return true;
  return false;
}

function clinicianFieldsEqual(a, b) {
  return (
    a.name === b.name &&
    a.title === b.title &&
    a.initials === b.initials &&
    a.role === b.role &&
    a.group === b.group &&
    a.status === b.status &&
    (a.sessions || 0) === (b.sessions || 0) &&
    !!a.buddyCover === !!b.buddyCover &&
    (a.canProvideCover !== false) === (b.canProvideCover !== false) &&
    (a.showWhosIn !== false) === (b.showWhosIn !== false)
  );
}

export default function QuickSetupTable({ practiceId, initialClinicians }) {
  const [clinicians, setClinicians] = useState(initialClinicians || []);
  const [search, setSearch] = useState('');
  const [showLeft, setShowLeft] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const lastSavedRef = useRef(initialClinicians || []);
  const saveTimer = useRef(null);
  const inFlight = useRef(false);

  const isDirty = useMemo(() => {
    const saved = lastSavedRef.current;
    if (clinicians.length !== saved.length) return true;
    const savedById = new Map(saved.map(c => [c.id, c]));
    for (const c of clinicians) {
      const s = savedById.get(c.id);
      if (!s) return true;
      if (!clinicianFieldsEqual(c, s)) return true;
    }
    return false;
  }, [clinicians]);

  const doSave = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaveState('saving');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicians }),
      });
      const body = await res.json().catch(() => ({}));
      // res.ok is true for 200-299 — including 207 (multi-status).
      // The API returns 207 when SOME ops ran but others failed
      // (e.g. one row hit an enum/unique/check constraint). We must
      // treat 207 as a failure here; otherwise the user sees "Saved"
      // and assumes everything went through when one or more rows
      // were silently rejected.
      if (!res.ok || body?.ok === false) {
        const detail = Array.isArray(body?.errors) && body.errors.length > 0
          ? body.errors.join(' · ')
          : (body?.error || `Save failed (${res.status})`);
        throw new Error(detail);
      }
      lastSavedRef.current = clinicians;
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      setErrorMsg(e.message || 'Save failed — try again');
    } finally {
      inFlight.current = false;
    }
  }, [clinicians, practiceId]);

  useEffect(() => {
    if (!isDirty) return;
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { doSave(); }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [isDirty, clinicians, doSave]);

  const updateField = (id, field, value) => {
    setClinicians(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };
      if (field === 'role') {
        const guessed = guessGroupFromRole(value);
        if (guessed) updated.group = guessed;
      }
      return updated;
    }));
  };

  // ─── Bulk update: apply a partial change to every selected row ───────
  // Same role-derives-group rule as single-row updates.
  const bulkUpdate = (changes) => {
    if (selectedIds.size === 0) return;
    setClinicians(prev => prev.map(c => {
      if (!selectedIds.has(c.id)) return c;
      const updated = { ...c, ...changes };
      if (changes.role !== undefined) {
        const guessed = guessGroupFromRole(changes.role);
        if (guessed && changes.group === undefined) updated.group = guessed;
      }
      return updated;
    }));
  };

  // ─── Selection helpers ───────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // ─── Derived: filtered + sorted rows ─────────────────────────────────
  // Sort priority:
  //   1. Rows needing attention first (so users see what to fix)
  //   2. Then by role, using ROLES array order (GP Partner, Associate
  //      Partner, Salaried GP, ... — practical seniority/group order
  //      already encoded in that constant). Unknown / custom roles
  //      go to the end so the structured roles cluster cleanly.
  //   3. Then alphabetically by name within each role.
  // Effect: GP Partners cluster, then Salaried GPs, then ANPs, then
  // Practice Nurses, etc. Makes bulk-edit (select all GP Partners →
  // turn buddy on) intuitive without needing a group filter.
  const filtered = useMemo(() => {
    let rows = clinicians;
    if (!showLeft) {
      rows = rows.filter(c => c.status !== 'left');
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.initials || '').toLowerCase().includes(q) ||
        (c.role || '').toLowerCase().includes(q)
      );
    }
    const roleOrder = Object.fromEntries(ROLES.map((r, i) => [r, i]));
    return [...rows].sort((a, b) => {
      const aA = needsAttention(a) ? 0 : 1;
      const bA = needsAttention(b) ? 0 : 1;
      if (aA !== bA) return aA - bA;
      const aR = roleOrder[a.role] ?? 999;
      const bR = roleOrder[b.role] ?? 999;
      if (aR !== bR) return aR - bR;
      // Same role bucket — fall back to alphabetical
      const ar = (a.role || '').localeCompare(b.role || '');
      if (ar !== 0) return ar; // handles custom roles deterministically
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [clinicians, search, showLeft]);

  // Visible-rows-only "select all" — checking the header box selects
  // everything currently filtered, not hidden left/searched-out rows.
  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));
  const someFilteredSelected = filtered.some(c => selectedIds.has(c.id));
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.add(c.id));
        return next;
      });
    }
  };

  const attentionCount = useMemo(() => clinicians.filter(c => c.status !== 'left' && needsAttention(c)).length, [clinicians]);
  const selectedCount = selectedIds.size;

  return (
    <div>
      {/* Header strip: search, show-left toggle, save status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, role, or initials…"
          style={{
            flex: '1 1 240px', padding: '8px 12px', fontSize: 13,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
          <input type="checkbox" checked={showLeft} onChange={e => setShowLeft(e.target.checked)} />
          Show left
        </label>
        <SaveIndicator state={saveState} errorMsg={errorMsg} onRetry={doSave} />
      </div>

      {attentionCount > 0 && selectedCount === 0 && (
        <div style={{
          padding: '10px 14px', marginBottom: 12,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 6,
          fontSize: 12, color: '#fde68a', lineHeight: 1.5,
        }}>
          <strong style={{ color: '#fbbf24' }}>{attentionCount} clinician{attentionCount === 1 ? '' : 's'} need{attentionCount === 1 ? 's' : ''} attention.</strong>{' '}
          Highlighted rows are missing initials or have a placeholder role.
          Tip: tick multiple rows and use the bulk actions toolbar to set them all at once.
        </div>
      )}

      {/* Bulk actions toolbar — appears when ≥1 row selected. Sticky to
          top of the table area so it's always visible while scrolling
          through 30+ clinicians. */}
      {selectedCount > 0 && (
        <BulkActionsBar
          count={selectedCount}
          onClear={clearSelection}
          onSetRole={(role) => bulkUpdate({ role })}
          onSetStatus={(status) => bulkUpdate({ status })}
          onSetBuddyCover={(buddyCover) => bulkUpdate({ buddyCover })}
          onSetWhosIn={(showWhosIn) => bulkUpdate({ showWhosIn })}
        />
      )}

      <div style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10, overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Th width={36} style={{ textAlign: 'center', paddingLeft: 12, paddingRight: 4 }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={el => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all visible rows"
                    style={{ cursor: 'pointer' }}
                  />
                </Th>
                <Th sticky stickyLeft={36} width={240}>Name</Th>
                <Th width={80}>Initials</Th>
                <Th width={170}>Role</Th>
                <Th width={140}>Status</Th>
                <Th width={100} style={{ textAlign: 'center' }}>Buddy cover</Th>
                <Th width={100} style={{ textAlign: 'center' }}>Who's In</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <Row
                  key={c.id}
                  c={c}
                  zebra={i % 2 === 1}
                  needsAttn={c.status !== 'left' && needsAttention(c)}
                  selected={selectedIds.has(c.id)}
                  onToggleSelect={() => toggleSelect(c.id)}
                  onChange={(field, value) => updateField(c.id, field, value)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#64748b' }}>
                    {clinicians.length === 0
                      ? 'No clinicians yet. Upload a CSV from the Today page to populate this list.'
                      : 'No clinicians match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
        Edits save automatically. For deeper settings (room preferences, primary/secondary buddy assignments, aliases), open Team Members on the practice dashboard.
      </div>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────
function Row({ c, zebra, needsAttn, selected, onToggleSelect, onChange }) {
  const [localInitials, setLocalInitials] = useState(c.initials || '');
  useEffect(() => { setLocalInitials(c.initials || ''); }, [c.initials]);

  const baseBg = selected
    ? 'rgba(34,211,238,0.08)' // selected: cyan tint
    : (needsAttn
      ? 'rgba(245,158,11,0.06)'
      : (zebra ? 'rgba(255,255,255,0.015)' : 'transparent'));

  const stickyBg = selected
    ? '#0d2230'
    : (needsAttn ? '#1f1a0e' : (zebra ? '#0f1825' : '#0d1422'));

  // If the stored role is title-like (e.g. 'Mrs' lingering from a buggy
  // CSV import), DON'T offer it as a "(custom)" option — that just
  // lets the user keep the bad data. Treat it as empty in the dropdown
  // so they have to pick a real role. The needs-attention banner already
  // tells them why.
  const showRoleAsCustom = c.role && !ROLES.includes(c.role) && !isPlaceholderOrTitle(c.role);
  const dropdownRole = isPlaceholderOrTitle(c.role) ? '' : c.role;

  return (
    <tr style={{ background: baseBg, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <Td style={{ textAlign: 'center', paddingLeft: 12, paddingRight: 4 }}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`Select ${c.name}`} style={{ cursor: 'pointer' }} />
      </Td>
      <Td sticky stickyLeft={36} bg={stickyBg}>
        <input
          type="text" value={c.name || ''}
          onChange={e => onChange('name', e.target.value)}
          style={inputStyle}
        />
      </Td>
      <Td>
        <input
          type="text" maxLength={4} value={localInitials}
          onChange={e => {
            const v = e.target.value.toUpperCase().slice(0, 4);
            setLocalInitials(v);
            onChange('initials', v);
          }}
          style={{ ...inputStyle, textAlign: 'center', fontFamily: "'Space Mono', monospace", letterSpacing: '0.05em' }}
          placeholder="—"
        />
      </Td>
      <Td>
        <select value={dropdownRole || ''} onChange={e => onChange('role', e.target.value)} style={selectStyle}>
          <option value="">— select —</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          {showRoleAsCustom && <option value={c.role}>{c.role} (custom)</option>}
        </select>
      </Td>
      <Td>
        <select value={c.status || 'active'} onChange={e => onChange('status', e.target.value)} style={selectStyle}>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Td>
      <Td style={{ textAlign: 'center' }}>
        <ToggleSwitch
          on={!!c.buddyCover}
          onClick={() => onChange('buddyCover', !c.buddyCover)}
          colourOn="#a855f7"
          ariaLabel={`Buddy cover for ${c.name}`}
        />
      </Td>
      <Td style={{ textAlign: 'center' }}>
        <ToggleSwitch
          on={c.showWhosIn !== false}
          onClick={() => onChange('showWhosIn', c.showWhosIn === false)}
          colourOn="#14b8a6"
          ariaLabel={`Show ${c.name} on Who's In page`}
        />
      </Td>
    </tr>
  );
}

// ─── Modern toggle switch ──────────────────────────────────────────────
// iOS-style slider. Coloured track when on (purple = buddy cover,
// teal = who's in), neutral when off. 36×20 with an 18px knob that
// slides on click. Bigger hit target than a checkbox, more
// recognisable than the old "On"/"Off" pill, and matches what users
// expect for boolean settings in modern apps.
function ToggleSwitch({ on, onClick, colourOn, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        padding: 0,
        background: on ? colourOn : 'rgba(255,255,255,0.10)',
        border: `1px solid ${on ? colourOn : 'rgba(255,255,255,0.14)'}`,
        borderRadius: 999,
        cursor: 'pointer',
        transition: 'background 0.15s, border 0.15s',
        boxShadow: on ? `0 0 8px ${colourOn}55` : 'none',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 1,
          left: on ? 17 : 1,
          width: 16,
          height: 16,
          background: 'white',
          borderRadius: '50%',
          boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
          transition: 'left 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </button>
  );
}

// ─── Bulk actions toolbar ──────────────────────────────────────────────
// "Set group" was dropped in v4.8.5 — group is auto-derived from role
// server-side, so exposing it as a separate action just gave users a
// way to put a record in an inconsistent state. The role-derives-group
// rule covers every practical case.
function BulkActionsBar({ count, onClear, onSetRole, onSetStatus, onSetBuddyCover, onSetWhosIn }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      padding: '10px 14px', marginBottom: 12,
      background: 'rgba(34,211,238,0.1)',
      border: '1px solid rgba(34,211,238,0.25)',
      borderRadius: 8,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      backdropFilter: 'blur(8px)',
    }}>
      <strong style={{ fontSize: 13, color: '#a5f3fc' }}>{count} selected</strong>
      <span style={{ color: '#475569' }}>·</span>

      <BulkSelect label="Set role" onChange={onSetRole}>
        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </BulkSelect>

      <BulkSelect label="Set status" onChange={onSetStatus}>
        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </BulkSelect>

      <span style={{ color: '#475569' }}>·</span>
      <BulkButton onClick={() => onSetBuddyCover(true)}>Buddy on</BulkButton>
      <BulkButton onClick={() => onSetBuddyCover(false)}>Buddy off</BulkButton>
      <BulkButton onClick={() => onSetWhosIn(true)}>Who's In on</BulkButton>
      <BulkButton onClick={() => onSetWhosIn(false)}>Who's In off</BulkButton>

      <span style={{ marginLeft: 'auto' }}>
        <button onClick={onClear} style={{
          padding: '5px 10px', fontSize: 11,
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', cursor: 'pointer',
        }}>Clear selection</button>
      </span>
    </div>
  );
}

function BulkSelect({ label, onChange, children }) {
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        if (!e.target.value) return;
        onChange(e.target.value);
        // Reset to placeholder so the same action can be repeated. The
        // user's intent is "do this NOW" not "lock this dropdown".
        e.target.value = '';
      }}
      style={{
        padding: '5px 10px', fontSize: 12,
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4, color: '#cbd5e1', cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <option value="">{label}…</option>
      {children}
    </select>
  );
}
function BulkButton({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 10px', fontSize: 11, fontWeight: 500,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 4, color: '#cbd5e1', cursor: 'pointer',
      fontFamily: 'inherit',
    }}>{children}</button>
  );
}

// ─── Cell components ────────────────────────────────────────────────────
function Th({ children, sticky, stickyLeft, width, style }) {
  return (
    <th style={{
      padding: '10px 12px',
      fontSize: 11, fontWeight: 600,
      textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.6,
      color: '#94a3b8',
      background: 'inherit',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      width,
      position: sticky ? 'sticky' : 'static',
      left: sticky ? (stickyLeft || 0) : 'auto',
      zIndex: sticky ? 2 : 1,
      ...style,
    }}>{children}</th>
  );
}
function Td({ children, sticky, stickyLeft, bg, style }) {
  return (
    <td style={{
      padding: '6px 8px',
      fontSize: 13, color: '#e2e8f0',
      verticalAlign: 'middle',
      position: sticky ? 'sticky' : 'static',
      left: sticky ? (stickyLeft || 0) : 'auto',
      zIndex: sticky ? 1 : 0,
      background: sticky ? bg : 'transparent',
      ...style,
    }}>{children}</td>
  );
}

const inputStyle = {
  width: '100%', padding: '6px 8px', fontSize: 13,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 4, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit',
};
const selectStyle = { ...inputStyle, cursor: 'pointer' };

function SaveIndicator({ state, errorMsg, onRetry }) {
  if (state === 'idle') return <span style={{ fontSize: 11, color: '#64748b' }}>—</span>;
  if (state === 'dirty' || state === 'saving') {
    return <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }} />
      {state === 'saving' ? 'Saving…' : 'Saving in a moment…'}
    </span>;
  }
  if (state === 'saved') {
    return <span style={{ fontSize: 11, color: '#34d399', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
      All changes saved
    </span>;
  }
  if (state === 'error') {
    return (
      <span style={{ fontSize: 11, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
        {errorMsg || 'Save failed'}
        <button onClick={onRetry} style={{
          padding: '3px 8px', fontSize: 11, background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4,
          color: '#fca5a5', cursor: 'pointer',
        }}>Retry</button>
      </span>
    );
  }
  return null;
}
