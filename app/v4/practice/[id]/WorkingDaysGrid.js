'use client';

// WorkingDaysGrid — modal for setting standard AM/PM working pattern
// per clinician. Opened from a single button on the Clinicians tab so
// the main table stays uncluttered.
//
// Storage: working_patterns table, one row per clinician with
// effective_to = null. Each row's `pattern` is a JSONB blob:
//   { mon: { am: 'in', pm: 'off' }, tue: { am: 'in', pm: 'in' }, ... }
// Days stored as 3-letter lowercase keys (mon, tue, wed, thu, fri).
// Saturday/Sunday excluded for now — GP practices don't typically
// rota out weekends through this system.
//
// AM/PM is a real distinction here — many clinicians do half-day
// sessions, and a "Tuesday morning only" pattern is common. Each
// AM and PM toggles independently.
//
// Sessions/week is computed live: sum of `in` cells across all
// AM and PM slots. Whole day in = 2 sessions; AM only = 1.

import { useState, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';

const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
];

// Order clinicians the same way the table does: by ROLES array order,
// then by name. Kept inline (rather than importing from QuickSetupTable)
// so this component stays self-contained.
const ROLE_ORDER = [
  'GP Partner', 'Associate Partner', 'Salaried GP', 'GP Registrar', 'Locum',
  'ANP', 'Paramedic Practitioner', 'Pharmacist', 'Physiotherapist',
  'Practice Nurse', 'Nurse Associate', 'HCA',
  'Medical Student', 'Admin',
];

function sessionsFromPattern(pattern) {
  let n = 0;
  for (const d of DAYS) {
    const row = pattern[d.key] || {};
    if (row.am === 'in') n++;
    if (row.pm === 'in') n++;
  }
  return n;
}

export default function WorkingDaysGrid({ practiceId, clinicians, initialPatterns, onClose }) {
  const supabase = createClient();
  const [patterns, setPatterns] = useState(() => {
    // Map of clinicianId → { id?: rowId, pattern: { mon: {am, pm}, ... } }
    // Initialise from server-loaded data + fill blanks with all-off
    const out = {};
    for (const c of clinicians) {
      const existing = initialPatterns[c.id];
      out[c.id] = {
        rowId: existing?.id,
        pattern: existing?.pattern || {},
      };
    }
    return out;
  });
  const [savingIds, setSavingIds] = useState(new Set());
  const [errors, setErrors] = useState({}); // clinicianId → error message
  const saveTimers = useRef({}); // clinicianId → timeout

  // Sort clinicians: by ROLES order, then by name. Skip "left" status.
  const ordered = useMemo(() => {
    const roleIdx = Object.fromEntries(ROLE_ORDER.map((r, i) => [r, i]));
    return clinicians
      .filter(c => c.status !== 'left')
      .slice()
      .sort((a, b) => {
        const ar = roleIdx[a.role] ?? 999;
        const br = roleIdx[b.role] ?? 999;
        if (ar !== br) return ar - br;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [clinicians]);

  // Persist a single clinician's pattern. Upsert: if row exists update,
  // otherwise insert with effective_from = today.
  const saveClinician = useCallback(async (clinicianId, payload) => {
    setSavingIds(prev => new Set([...prev, clinicianId]));
    setErrors(prev => { const n = { ...prev }; delete n[clinicianId]; return n; });
    try {
      if (payload.rowId) {
        const { error } = await supabase
          .from('working_patterns')
          .update({ pattern: payload.pattern })
          .eq('id', payload.rowId);
        if (error) throw error;
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from('working_patterns')
          .insert({
            clinician_id: clinicianId,
            effective_from: today,
            effective_to: null,
            pattern: payload.pattern,
          })
          .select('id')
          .single();
        if (error) throw error;
        // Remember the new row id so subsequent saves UPDATE not INSERT
        setPatterns(prev => ({
          ...prev,
          [clinicianId]: { ...prev[clinicianId], rowId: data.id },
        }));
      }
    } catch (e) {
      setErrors(prev => ({ ...prev, [clinicianId]: e.message || 'Save failed' }));
    } finally {
      setSavingIds(prev => { const n = new Set(prev); n.delete(clinicianId); return n; });
    }
  }, [supabase]);

  const toggle = (clinicianId, dayKey, session) => {
    setPatterns(prev => {
      const cur = prev[clinicianId] || { pattern: {} };
      const curDay = cur.pattern[dayKey] || {};
      const wasOn = curDay[session] === 'in';
      const nextPattern = {
        ...cur.pattern,
        [dayKey]: { ...curDay, [session]: wasOn ? 'off' : 'in' },
      };
      const next = { ...cur, pattern: nextPattern };
      // Debounce save: 600ms after the last click on this clinician
      if (saveTimers.current[clinicianId]) clearTimeout(saveTimers.current[clinicianId]);
      saveTimers.current[clinicianId] = setTimeout(() => {
        saveClinician(clinicianId, next);
      }, 600);
      return { ...prev, [clinicianId]: next };
    });
  };

  // Bulk row actions: "weekdays" (all on), "clear" (all off)
  const setRow = (clinicianId, fill) => {
    setPatterns(prev => {
      const cur = prev[clinicianId] || { pattern: {} };
      const nextPattern = {};
      for (const d of DAYS) {
        nextPattern[d.key] = { am: fill ? 'in' : 'off', pm: fill ? 'in' : 'off' };
      }
      const next = { ...cur, pattern: nextPattern };
      if (saveTimers.current[clinicianId]) clearTimeout(saveTimers.current[clinicianId]);
      saveTimers.current[clinicianId] = setTimeout(() => {
        saveClinician(clinicianId, next);
      }, 200);
      return { ...prev, [clinicianId]: next };
    });
  };

  // Click outside / Escape to close
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 920, width: '100%',
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: 24,
          color: '#cbd5e1',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h2 style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 600,
              color: 'white', margin: 0,
            }}>Working days grid</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
              Standard AM/PM working pattern per clinician. Click a half to toggle.
              Saves as you go.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#94a3b8',
              borderRadius: 6,
              fontSize: 18, padding: '4px 10px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >×</button>
        </div>

        <div style={{
          marginTop: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          overflow: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Th width={220} sticky>Clinician</Th>
                {DAYS.map(d => (
                  <Th key={d.key} width={88} style={{ textAlign: 'center' }}>{d.label}</Th>
                ))}
                <Th width={60} style={{ textAlign: 'center' }}>/wk</Th>
                <Th width={120} style={{ textAlign: 'center' }}>Quick set</Th>
              </tr>
              <tr style={{ background: 'rgba(255,255,255,0.015)' }}>
                <Th sticky />
                {DAYS.map(d => (
                  <th key={`sub-${d.key}`} style={{
                    padding: '4px 6px',
                    fontSize: 10, color: '#64748b', fontWeight: 500,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                      <span>AM</span><span>PM</span>
                    </div>
                  </th>
                ))}
                <th style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }} />
                <th style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }} />
              </tr>
            </thead>
            <tbody>
              {ordered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#64748b' }}>
                    No active clinicians to configure.
                  </td>
                </tr>
              )}
              {ordered.map((c, i) => {
                const data = patterns[c.id] || { pattern: {} };
                const sessions = sessionsFromPattern(data.pattern);
                const saving = savingIds.has(c.id);
                const err = errors[c.id];
                return (
                  <tr key={c.id} style={{
                    background: i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
                  }}>
                    <Td sticky>
                      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {c.role || 'Unassigned'}{c.initials ? ` · ${c.initials}` : ''}
                      </div>
                      {err && <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>{err}</div>}
                    </Td>
                    {DAYS.map(d => {
                      const dayPattern = data.pattern[d.key] || {};
                      return (
                        <Td key={d.key} style={{ textAlign: 'center', padding: '6px 4px' }}>
                          <div style={{ display: 'inline-flex', gap: 3 }}>
                            <SessionToggle
                              on={dayPattern.am === 'in'}
                              onClick={() => toggle(c.id, d.key, 'am')}
                              label={`${d.label} AM`}
                            />
                            <SessionToggle
                              on={dayPattern.pm === 'in'}
                              onClick={() => toggle(c.id, d.key, 'pm')}
                              label={`${d.label} PM`}
                            />
                          </div>
                        </Td>
                      );
                    })}
                    <Td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: sessions === 0 ? '#475569' : '#cbd5e1',
                      }}>
                        {sessions}
                      </span>
                      {saving && (
                        <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Saving…</div>
                      )}
                    </Td>
                    <Td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <SmallBtn onClick={() => setRow(c.id, true)}>All</SmallBtn>
                        <SmallBtn onClick={() => setRow(c.id, false)}>Clear</SmallBtn>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.5, maxWidth: 540 }}>
            This is the standard week — daily overrides (sick days, training, swapped
            sessions) are handled elsewhere on the dashboard and won't change this grid.
            Weekends aren't included.
          </p>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              background: '#0891b2',
              border: '1px solid #06b6d4',
              borderRadius: 8,
              color: 'white', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle for a single AM or PM cell ─────────────────────────────────
// Compact square: 18×18. Filled emerald when 'in', hollow when 'off'.
// Clicking flips. We use buttons (not checkboxes) so keyboard tab order
// is predictable and the visual treatment is consistent with the rest
// of the app.
function SessionToggle({ on, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      style={{
        width: 24, height: 24, padding: 0,
        background: on ? '#10b981' : 'transparent',
        border: `1.5px solid ${on ? '#10b981' : 'rgba(255,255,255,0.18)'}`,
        borderRadius: 5,
        cursor: 'pointer',
        transition: 'background 0.12s, border 0.12s',
        boxShadow: on ? '0 0 6px rgba(16,185,129,0.4)' : 'none',
      }}
    />
  );
}

function SmallBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 8px', fontSize: 10, fontWeight: 500,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4, color: '#94a3b8', cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >{children}</button>
  );
}

function Th({ children, width, sticky, style }) {
  return (
    <th style={{
      textAlign: 'left',
      padding: '10px 12px',
      fontSize: 11, fontWeight: 600, color: '#94a3b8',
      textTransform: 'uppercase', letterSpacing: 0.4,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      width, minWidth: width,
      position: sticky ? 'sticky' : undefined,
      left: sticky ? 0 : undefined,
      background: sticky ? '#0f172a' : undefined,
      zIndex: sticky ? 2 : undefined,
      ...style,
    }}>{children}</th>
  );
}

function Td({ children, sticky, style }) {
  return (
    <td style={{
      padding: '8px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      verticalAlign: 'middle',
      position: sticky ? 'sticky' : undefined,
      left: sticky ? 0 : undefined,
      background: sticky ? 'inherit' : undefined,
      ...style,
    }}>{children}</td>
  );
}
