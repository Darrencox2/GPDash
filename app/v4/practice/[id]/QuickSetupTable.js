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
// like 'Staff'. Helps the user spot who hasn't been touched yet.

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { guessGroupFromRole } from '@/lib/data';

const TITLES = ['', 'Dr', 'Mr', 'Mrs', 'Ms', 'Miss', 'Prof'];
const ROLES = [
  'GP Partner', 'Associate Partner', 'Salaried GP', 'GP Registrar', 'Locum',
  'ANP', 'Paramedic Practitioner', 'Pharmacist', 'Physiotherapist',
  'Practice Nurse', 'Nurse Associate', 'HCA',
  'Medical Student', 'Admin',
];
const GROUPS = [
  { value: 'gp', label: 'GP' },
  { value: 'nursing', label: 'Nursing' },
  { value: 'allied', label: 'Allied' },
  { value: 'admin', label: 'Admin' },
];
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'longTermAbsent', label: 'Long-term absent' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'left', label: 'Left' },
];

// Default role used by CSV auto-discovery when no role parenthetical is
// present. Treat as "needs review" because it's almost certainly wrong.
const PLACEHOLDER_ROLES = new Set(['', 'Staff', 'Unknown']);

// Helper: detect rows that need user attention before they're useful.
function needsAttention(c) {
  if (!c.initials || c.initials.trim().length === 0) return true;
  if (PLACEHOLDER_ROLES.has((c.role || '').trim())) return true;
  return false;
}

// Subtle deep-equality for the diff that triggers auto-save. Avoids a
// JSON.stringify on every render — only call when something might have
// actually changed.
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
    (a.canProvideCover !== false) === (b.canProvideCover !== false)
  );
}

export default function QuickSetupTable({ practiceId, initialClinicians }) {
  const [clinicians, setClinicians] = useState(initialClinicians || []);
  const [search, setSearch] = useState('');
  const [showLeft, setShowLeft] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | dirty | saving | saved | error
  const [errorMsg, setErrorMsg] = useState('');

  // The "last saved" snapshot is used to decide if anything's dirty.
  // We start with the initial data treated as saved.
  const lastSavedRef = useRef(initialClinicians || []);
  const saveTimer = useRef(null);
  const inFlight = useRef(false);

  // Re-derive dirtiness whenever clinicians changes.
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

  // Auto-save: when dirty, debounce 800ms then POST. Clear timer on
  // unmount or further edits (the next render cycle will set a new one).
  const doSave = useCallback(async () => {
    if (inFlight.current) return; // single-flight
    inFlight.current = true;
    setSaveState('saving');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/v4/data?practiceId=${practiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicians }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
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

  // Update a single field on a single clinician. When role changes, also
  // re-derive group via guessGroupFromRole so the user doesn't have to
  // manually keep them in sync (they can still override).
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

  // ─── Derived: filtered + sorted rows ──────────────────────────────────
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
    // Sort: needs-attention first, then by group (gp, nursing, allied, admin), then alphabetically
    const groupOrder = { gp: 0, nursing: 1, allied: 2, admin: 3 };
    return [...rows].sort((a, b) => {
      const aA = needsAttention(a) ? 0 : 1;
      const bA = needsAttention(b) ? 0 : 1;
      if (aA !== bA) return aA - bA;
      const aG = groupOrder[a.group] ?? 4;
      const bG = groupOrder[b.group] ?? 4;
      if (aG !== bG) return aG - bG;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [clinicians, search, showLeft]);

  const attentionCount = useMemo(() => clinicians.filter(c => c.status !== 'left' && needsAttention(c)).length, [clinicians]);

  return (
    <div>
      {/* Header strip: search, show-left toggle, save status, attention count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, role, or initials…"
          style={{
            flex: '1 1 240px',
            padding: '8px 12px',
            fontSize: 13,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            color: '#e2e8f0',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
          <input type="checkbox" checked={showLeft} onChange={e => setShowLeft(e.target.checked)} />
          Show left
        </label>
        <SaveIndicator state={saveState} errorMsg={errorMsg} onRetry={doSave} />
      </div>

      {attentionCount > 0 && (
        <div style={{
          padding: '10px 14px', marginBottom: 12,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 6,
          fontSize: 12, color: '#fde68a', lineHeight: 1.5,
        }}>
          <strong style={{ color: '#fbbf24' }}>{attentionCount} clinician{attentionCount === 1 ? '' : 's'} need{attentionCount === 1 ? 's' : ''} attention.</strong>{' '}
          Highlighted rows below are missing initials or have a placeholder role. Fix those and the highlight clears.
        </div>
      )}

      {/* Scrollable table — sticky-name on the left so wide screens get a tidy
          experience and narrow ones can pan horizontally without losing
          context of who they're editing. */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 920 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Th sticky width={220}>Name</Th>
                <Th width={70}>Title</Th>
                <Th width={70}>Initials</Th>
                <Th width={170}>Role</Th>
                <Th width={110}>Group</Th>
                <Th width={70} style={{ textAlign: 'center' }}>Sess/wk</Th>
                <Th width={140}>Status</Th>
                <Th width={80} style={{ textAlign: 'center' }}>Buddy</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <Row
                  key={c.id}
                  c={c}
                  zebra={i % 2 === 1}
                  needsAttn={c.status !== 'left' && needsAttention(c)}
                  onChange={(field, value) => updateField(c.id, field, value)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#64748b' }}>
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
        Edits save automatically. For deeper settings (room preferences, buddy assignments, aliases), open Team Members on the practice dashboard.
      </div>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────
function Row({ c, zebra, needsAttn, onChange }) {
  const [localInitials, setLocalInitials] = useState(c.initials || '');
  // Keep local in sync with prop changes (e.g. when re-fetching after save)
  useEffect(() => { setLocalInitials(c.initials || ''); }, [c.initials]);

  const baseBg = needsAttn
    ? 'rgba(245,158,11,0.06)'
    : (zebra ? 'rgba(255,255,255,0.015)' : 'transparent');

  return (
    <tr style={{ background: baseBg, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <Td sticky bg={needsAttn ? '#1f1a0e' : (zebra ? '#0f1825' : '#0d1422')}>
        <input
          type="text"
          value={c.name || ''}
          onChange={e => onChange('name', e.target.value)}
          style={inputStyle}
        />
      </Td>
      <Td>
        <select value={c.title || ''} onChange={e => onChange('title', e.target.value)} style={selectStyle}>
          {TITLES.map(t => <option key={t} value={t}>{t || '—'}</option>)}
        </select>
      </Td>
      <Td>
        <input
          type="text"
          maxLength={4}
          value={localInitials}
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
        <select value={c.role || ''} onChange={e => onChange('role', e.target.value)} style={selectStyle}>
          <option value="">— select —</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          {/* Allow CSV-derived roles that aren't in our list to remain visible */}
          {c.role && !ROLES.includes(c.role) && <option value={c.role}>{c.role} (custom)</option>}
        </select>
      </Td>
      <Td>
        <select value={c.group || 'gp'} onChange={e => onChange('group', e.target.value)} style={selectStyle}>
          {GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </Td>
      <Td style={{ textAlign: 'center' }}>
        <input
          type="number"
          min={0}
          max={10}
          value={c.sessions || 0}
          onChange={e => onChange('sessions', parseInt(e.target.value) || 0)}
          style={{ ...inputStyle, textAlign: 'center', width: 50, padding: '6px 4px' }}
        />
      </Td>
      <Td>
        <select value={c.status || 'active'} onChange={e => onChange('status', e.target.value)} style={selectStyle}>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Td>
      <Td style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={!!c.buddyCover}
          onChange={e => onChange('buddyCover', e.target.checked)}
          style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
        />
      </Td>
    </tr>
  );
}

// ─── Cell components ────────────────────────────────────────────────────
function Th({ children, sticky, width, style }) {
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
      left: sticky ? 0 : 'auto',
      zIndex: sticky ? 2 : 1,
      ...style,
    }}>{children}</th>
  );
}

function Td({ children, sticky, bg, style }) {
  return (
    <td style={{
      padding: '6px 8px',
      fontSize: 13, color: '#e2e8f0',
      verticalAlign: 'middle',
      position: sticky ? 'sticky' : 'static',
      left: sticky ? 0 : 'auto',
      zIndex: sticky ? 1 : 0,
      background: sticky ? bg : 'transparent',
      ...style,
    }}>{children}</td>
  );
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 13,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 4,
  color: '#e2e8f0',
  outline: 'none',
  fontFamily: 'inherit',
};
const selectStyle = { ...inputStyle, cursor: 'pointer' };

// ─── Save indicator ─────────────────────────────────────────────────────
function SaveIndicator({ state, errorMsg, onRetry }) {
  if (state === 'idle') {
    return <span style={{ fontSize: 11, color: '#64748b' }}>—</span>;
  }
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
