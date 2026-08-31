'use client';

// WorkingDaysGrid — modal for setting standard AM/PM working pattern
// per clinician. Opened from a single button on the Clinicians tab so
// the main table stays uncluttered.
//
// Storage: working_patterns table, one row per clinician with
// effective_to = null. Each row's `pattern` is a JSONB blob:
//   { mon: { am: 'in', pm: 'off', eve: 'off' }, ... } - three sessions (unified rota)
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

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { confirmDialog } from '@/components/ui';
import { createClient } from '@/utils/supabase/client';
import { normalizeWorkingPattern } from '@/lib/v4-data';

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

function classifyStaff(role) {
  const r = String(role || '').toLowerCase();
  if (/hca|healthcare assistant|phleb/.test(r)) return 'hca';
  if (/nurse|matron|anp|acp/.test(r)) return 'nursing';
  if (/gp|doctor|registrar/.test(r)) return 'gp';
  return 'other';
}

function sessionsFromPattern(pattern) {
  let n = 0;
  for (const d of DAYS) {
    const row = pattern[d.key] || {};
    for (const k of ['am', 'pm', 'eve']) {
      if (row[k] === 'in') n += 1;
      else if (row[k] === 'half') n += 0.5;
    }
  }
  return n;
}

export default function WorkingDaysGrid({ practiceId, clinicians, initialPatterns, onClose }) {
  const [staffFilter, setStaffFilter] = useState('buddy');
  const supabase = createClient();
  const [patterns, setPatterns] = useState(() => {
    // Seed from the server-rendered initialPatterns so the modal isn't
    // visibly empty for the half-second the refetch takes. Refetch
    // immediately on mount to get any saves the user made earlier in
    // this session — initialPatterns is captured at page load and
    // would otherwise be stale every time the modal reopens.
    // normalizeWorkingPattern handles legacy long-key shapes from the
    // old mutation-1 bug.
    const out = {};
    for (const c of clinicians) {
      const existing = initialPatterns[c.id];
      out[c.id] = {
        rowId: existing?.id,
        pattern: normalizeWorkingPattern(existing?.pattern),
      };
    }
    return out;
  });
  const [savingIds, setSavingIds] = useState(new Set());
  const [errors, setErrors] = useState({}); // clinicianId → error message
  const saveTimers = useRef({}); // clinicianId → timeout
  // Auto-generate state — separate from per-row saving since it touches
  // potentially every clinician at once and has its own progress arc.
  const [generating, setGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(true);

  // Refresh-on-mount: re-fetch current working_patterns from the DB so
  // the modal always shows what's actually saved. Without this, closing
  // and reopening within the same session would re-mount with stale
  // initialPatterns (server-rendered at page load, doesn't reflect
  // edits made earlier in the same session). Saves persist fine — the
  // grid just couldn't see them on its second open.
  useEffect(() => {
    let cancelled = false;
    const ids = clinicians.map(c => c.id);
    if (ids.length === 0) { setRefreshing(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('working_patterns')
          .select('id, clinician_id, pattern')
          .in('clinician_id', ids)
          .is('effective_to', null);
        if (cancelled) return;
        if (error) {
          // Non-fatal — keep the initial seed. User can still edit + save.
          setRefreshing(false);
          return;
        }
        const fresh = {};
        for (const c of clinicians) {
          const row = (data || []).find(r => r.clinician_id === c.id);
          fresh[c.id] = {
            rowId: row?.id,
            pattern: normalizeWorkingPattern(row?.pattern),
          };
        }
        setPatterns(fresh);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only — clinicians prop is stable for the modal's lifetime

  // Sort clinicians: by ROLES order, then by name. Skip "left" status.
  const ordered = useMemo(() => {
    const roleIdx = Object.fromEntries(ROLE_ORDER.map((r, i) => [r, i]));
    return clinicians
      .filter(c => c.status !== 'left')
      .filter(c => {
        if (staffFilter === 'all') return true;
        if (staffFilter === 'buddy') return !!(c.buddy_cover ?? c.buddyCover);
        return classifyStaff(c.role) === staffFilter;
      })
      .slice()
      .sort((a, b) => {
        const ar = roleIdx[a.role] ?? 999;
        const br = roleIdx[b.role] ?? 999;
        if (ar !== br) return ar - br;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [clinicians, staffFilter]);

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
      // Three-state cycle: off -> in -> half -> off. A half session still
      // counts as working for presence and cover (any-session rule); it
      // exists so session COUNTS can match contracts (e.g. 5.5 sessions).
      const curVal = curDay[session] === 'in' ? 'in' : curDay[session] === 'half' ? 'half' : 'off';
      const nextVal = curVal === 'off' ? 'in' : curVal === 'in' ? 'half' : 'off';
      const nextPattern = {
        ...cur.pattern,
        [dayKey]: { ...curDay, [session]: nextVal },
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
        nextPattern[d.key] = { am: fill ? 'in' : 'off', pm: fill ? 'in' : 'off', eve: fill ? (cur.pattern?.[d.key]?.eve || 'off') : 'off' };
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

  // Auto-generate from CSV — fetches the practice's stored huddle_csv_data,
  // runs the inference, and writes patterns for clinicians WITHOUT an
  // existing row (don't overwrite manual edits). Tells the user how many
  // got generated + how many were skipped because they already had patterns
  // or had no CSV activity.
  const generateFromCsv = async ({ overwrite = false } = {}) => {
    setGenerating(true);
    setGenerateStatus(null);
    try {
      const { data: csvRow } = await supabase
        .from('huddle_csv_data')
        .select('data')
        .eq('practice_id', practiceId)
        .maybeSingle();
      const parsed = csvRow?.data;
      if (!parsed?.dates?.length) {
        setGenerateStatus({ ok: false, text: 'No CSV data on file. Upload an EMIS report first via the Today page.' });
        setGenerating(false);
        return;
      }
      const { inferAmPmPatterns } = await import('@/lib/auto-rota');
      // Filter target list: skip 'left' and (unless overwrite) skip
      // clinicians who already have a pattern with at least one 'in'.
      const targets = clinicians
        .filter(c => c.status !== 'left')
        .filter(c => {
          if (overwrite) return true;
          const existing = patterns[c.id]?.pattern || {};
          const anyOn = DAYS.some(d => existing[d.key]?.am === 'in' || existing[d.key]?.pm === 'in');
          return !anyOn;
        });
      if (targets.length === 0) {
        setGenerateStatus({ ok: false, text: 'No clinicians need a generated pattern. Use "Regenerate all" if you want to overwrite existing patterns.' });
        setGenerating(false);
        return;
      }
      const { patterns: inferred, ambiguityWarnings } = inferAmPmPatterns({
        huddleData: parsed,
        clinicians: targets,
        includeOnlyBuddyCover: false,
      });

      // Apply each inferred pattern via saveClinician (handles insert vs update)
      let succeeded = 0;
      for (const p of inferred) {
        const cur = patterns[p.clinicianId] || { pattern: {} };
        const payload = { ...cur, pattern: p.pattern };
        try {
          await saveClinician(p.clinicianId, payload);
          // Mirror locally so the grid reflects immediately
          setPatterns(prev => ({
            ...prev,
            [p.clinicianId]: { ...prev[p.clinicianId], pattern: p.pattern },
          }));
          succeeded++;
        } catch {
          // saveClinician already sets the error on this row
        }
      }
      const skipped = targets.length - inferred.length;
      const parts = [];
      if (succeeded > 0) parts.push(`Generated ${succeeded} pattern${succeeded === 1 ? '' : 's'}`);
      if (skipped > 0) parts.push(`${skipped} skipped (no CSV activity)`);
      if (ambiguityWarnings?.length > 0) parts.push(`${ambiguityWarnings.length} ambiguous initials (check manually)`);
      setGenerateStatus({ ok: succeeded > 0, text: parts.join(' · ') || 'Nothing to generate' });
    } catch (e) {
      setGenerateStatus({ ok: false, text: `Generation failed: ${e.message || e}` });
    } finally {
      setGenerating(false);
    }
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
          background: 'linear-gradient(135deg, var(--g-ink), var(--g-ink-2))',
          border: '1px solid var(--g-line)',
          borderRadius: 'var(--r-lg)',
          padding: 24,
          color: 'var(--g-text-hi)',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 style={{
              fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600,
              color: 'var(--g-text-hi)', margin: 0,
            }}>Working days grid</h2>
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}
              style={{ marginTop: 8, background: 'var(--g-tile)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--g-text-hi)', borderRadius: 'var(--r-md)', padding: '4px 8px', fontSize: 12 }}>
              <option value="buddy">Buddy cover clinicians</option>
              <option value="all">All staff</option>
              <option value="gp">GPs</option>
              <option value="nursing">Nursing</option>
              <option value="hca">HCAs</option>
              <option value="other">Other</option>
            </select>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--g-text-mid)', lineHeight: 1.5 }}>
              Standard working pattern per clinician - morning, afternoon and evening sessions. Click a session to cycle off, full, half.
              Saves as you go.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--g-text-mid)',
              borderRadius: 'var(--r-sm)',
              fontSize: 18, padding: '4px 10px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >×</button>
        </div>

        {/* Generate-from-CSV row */}
        <div style={{
          marginTop: 14, padding: '10px 12px',
          background: 'rgba(16,185,129,0.06)',
          border: '1px solid rgba(16,185,129,0.18)',
          borderRadius: 'var(--r-md)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: 'var(--g-text-hi)', lineHeight: 1.5 }}>
            <strong className="text-emerald-400">Auto-generate from CSV</strong>
            <div className="text-mid text-caption mt-0.5">
              Looks at the last 12 weeks of appointment history. Sets AM or PM "in" when
              the clinician appeared in ≥50% of weeks for that session.
            </div>
          </div>
          <button
            onClick={() => generateFromCsv({ overwrite: false })}
            disabled={generating}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 500,
              background: generating ? 'var(--g-tile)' : 'rgba(16,185,129,0.15)',
              border: '1px solid ' + (generating ? 'var(--g-line)' : 'rgba(16,185,129,0.30)'),
              borderRadius: 'var(--r-sm)',
              color: generating ? 'var(--g-text-mid)' : '#34d399',
              cursor: generating ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {generating ? 'Generating…' : 'Generate for missing'}
          </button>
          <button
            onClick={async () => {
              if (!(await confirmDialog({ message: 'Overwrite ALL working patterns from CSV? This will replace any manual edits.', danger: true }))) return;
              generateFromCsv({ overwrite: true });
            }}
            disabled={generating}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 500,
              background: 'transparent',
              border: '1px solid var(--g-line)',
              borderRadius: 'var(--r-sm)',
              color: generating ? 'var(--g-text-faint)' : 'var(--g-text-mid)',
              cursor: generating ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Regenerate all
          </button>
        </div>
        {generateStatus && (
          <div style={{
            marginTop: 8, padding: '8px 12px',
            background: generateStatus.ok ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
            border: `1px solid ${generateStatus.ok ? 'rgba(16,185,129,0.30)' : 'rgba(245,158,11,0.30)'}`,
            color: generateStatus.ok ? '#34d399' : '#fcd34d',
            borderRadius: 'var(--r-sm)', fontSize: 12,
          }}>
            {generateStatus.text}
          </div>
        )}

        <div style={{
          marginTop: 16,
          border: '1px solid var(--g-border-2)',
          borderRadius: 'var(--r-md)',
          overflow: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--g-tile-2)' }}>
                <Th width={220} sticky>Clinician</Th>
                {DAYS.map(d => (
                  <Th key={d.key} width={88} className="text-center">{d.label}</Th>
                ))}
                <Th width={60} className="text-center">/wk</Th>
                <Th width={120} className="text-center">Quick set</Th>
              </tr>
              <tr style={{ background: 'var(--g-tile-2)' }}>
                <Th sticky />
                {DAYS.map(d => (
                  <th key={`sub-${d.key}`} style={{
                    padding: '4px 6px',
                    fontSize:11, color: 'var(--g-text-mid)', fontWeight: 500,
                    borderBottom: '1px solid var(--g-border-2)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                      <span>AM</span><span>PM</span><span>Eve</span>
                    </div>
                  </th>
                ))}
                <th style={{ borderBottom: '1px solid var(--g-border-2)' }} />
                <th style={{ borderBottom: '1px solid var(--g-border-2)' }} />
              </tr>
            </thead>
            <tbody>
              {ordered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-body-sm text-mid">
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
                    background: i % 2 === 1 ? 'var(--g-tile-2)' : 'transparent',
                  }}>
                    <Td sticky>
                      <div className="text-body-sm text-hi font-medium">{c.name}</div>
                      <div className="text-caption text-mid mt-0.5">
                        {c.role || 'Unassigned'}{c.initials ? ` · ${c.initials}` : ''}
                      </div>
                      {err && <div className="text-caption text-red-300 mt-0.5">{err}</div>}
                    </Td>
                    {DAYS.map(d => {
                      const dayPattern = data.pattern[d.key] || {};
                      return (
                        <Td key={d.key} className="text-center px-1 py-1.5">
                          <div style={{ display: 'inline-flex', gap: 3 }}>
                            <SessionToggle
                              on={dayPattern.am === 'in'}
                              half={dayPattern.am === 'half'}
                              onClick={() => toggle(c.id, d.key, 'am')}
                              label={`${d.label} AM`}
                            />
                            <SessionToggle
                              on={dayPattern.pm === 'in'}
                              half={dayPattern.pm === 'half'}
                              onClick={() => toggle(c.id, d.key, 'pm')}
                              label={`${d.label} PM`}
                            />
                            <SessionToggle
                              on={dayPattern.eve === 'in'}
                              half={dayPattern.eve === 'half'}
                              onClick={() => toggle(c.id, d.key, 'eve')}
                              label={`${d.label} Evening`}
                            />
                          </div>
                        </Td>
                      );
                    })}
                    <Td className="text-center">
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: sessions === 0 ? 'var(--g-text-faint)' : 'var(--g-text-hi)',
                      }}>
                        {sessions}
                      </span>
                      {saving && (
                        <div style={{ fontSize:11, color: 'var(--g-text-mid)', marginTop: 2 }}>Saving…</div>
                      )}
                    </Td>
                    <Td className="text-center">
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

        <div className="mt-3.5 flex justify-between items-center">
          <p style={{ margin: 0, fontSize: 11, color: 'var(--g-text-mid)', lineHeight: 1.5, maxWidth: 540 }}>
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
              borderRadius: 'var(--r-md)',
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
function SessionToggle({ on, half, onClick, label }) {
  const active = on || half;
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={active}
      aria-label={label}
      title={`${label}${half ? ' (half session)' : on ? '' : ' (off)'} - click to cycle off / full / half`}
      style={{
        width: 24, height: 24, padding: 0,
        background: on ? '#10b981' : half ? 'linear-gradient(180deg, #10b981 50%, transparent 50%)' : 'transparent',
        border: `1.5px solid ${active ? '#10b981' : 'rgba(255,255,255,0.18)'}`,
        borderRadius: 'var(--r-sm)',
        cursor: 'pointer',
        transition: 'background 0.12s, border 0.12s',
        boxShadow: active ? '0 0 6px rgba(16,185,129,0.4)' : 'none',
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
        padding: '3px 8px', fontSize:11, fontWeight: 500,
        background: 'var(--g-tile)',
        border: '1px solid var(--g-line)',
        borderRadius: 'var(--r-sm)', color: 'var(--g-text-mid)', cursor: 'pointer',
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
      fontSize: 11, fontWeight: 600, color: 'var(--g-text-mid)',
      textTransform: 'uppercase', letterSpacing: 0.4,
      borderBottom: '1px solid var(--g-border-2)',
      width, minWidth: width,
      position: sticky ? 'sticky' : undefined,
      left: sticky ? 0 : undefined,
      background: sticky ? 'var(--g-surface)' : undefined,
      zIndex: sticky ? 2 : undefined,
      ...style,
    }}>{children}</th>
  );
}

function Td({ children, sticky, style }) {
  return (
    <td style={{
      padding: '8px 12px',
      borderBottom: '1px solid var(--g-tile)',
      verticalAlign: 'middle',
      position: sticky ? 'sticky' : undefined,
      left: sticky ? 0 : undefined,
      background: sticky ? 'inherit' : undefined,
      ...style,
    }}>{children}</td>
  );
}
