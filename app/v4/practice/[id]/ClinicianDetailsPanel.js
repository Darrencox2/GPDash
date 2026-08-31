'use client';

// ClinicianDetailsPanel — slide-out from the right when a row is clicked.
// Surfaces the per-clinician details that don't fit in the main table:
//   - Title, full name, initials, role, status
//   - Aliases (chips, add/remove)
//   - Buddy preferences (primary + secondary)
//   - Room preferences per site
//   - Working pattern mini-summary with link to grid
//   - Free-form notes
//
// Saves direct to Supabase RLS-enforced. Most fields live on the
// clinicians table; v3-era extras (buddy preferences, room preferences,
// notes) sit in clinicians.metadata jsonb (migration 033). The main
// table's local state stays in sync via the onPatch callback so the
// row immediately reflects edits made in the panel.

import { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';

const TITLES = ['', 'Dr', 'Mr', 'Mrs', 'Ms', 'Miss', 'Mx', 'Prof'];
const ROLES = [
  'GP Partner', 'Associate Partner', 'Salaried GP', 'GP Registrar', 'Locum',
  'ANP', 'Paramedic Practitioner', 'Pharmacist', 'Physiotherapist',
  'Practice Nurse', 'Nurse Associate', 'HCA',
  'Medical Student', 'Admin',
];
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'left', label: 'Left' },
  { value: 'administrative', label: 'Administrative' },
];
const DAY_LABELS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
];

export default function ClinicianDetailsPanel({
  clinician,
  allClinicians,
  workingPattern,
  sites,
  practiceId,
  onClose,
  onPatch,
  onOpenWorkingGrid,
}) {
  const supabase = createClient();
  const [local, setLocal] = useState(clinician);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);

  // Reset local state if the clinician we're viewing changes
  useEffect(() => {
    setLocal(clinician);
    setError('');
  }, [clinician?.id]);

  // Escape key closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Save with debounce. Update both clinician columns and metadata jsonb.
  const saveNow = async (next) => {
    setSaving(true);
    setError('');
    try {
      const { error: err } = await supabase
        .from('clinicians')
        .update({
          name: next.name,
          title: next.title || null,
          initials: next.initials || null,
          role: next.role || null,
          status: next.status || 'active',
          aliases: next.aliases || [],
          metadata: {
            primaryBuddy: next.primaryBuddy || null,
            secondaryBuddy: next.secondaryBuddy || null,
            roomPreferences: next.roomPreferences || {},
            notes: next.notes || '',
          },
        })
        .eq('id', next.id);
      if (err) throw err;
      setSavedAt(new Date());
      // Echo the patch up to the table so the row stays in sync.
      onPatch?.(next);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    const next = { ...local, [field]: value };
    setLocal(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNow(next), 500);
  };

  const updateRoomPref = (siteId, slot, roomId) => {
    const cur = local.roomPreferences || {};
    const curForSite = cur[siteId] || {};
    const nextForSite = { ...curForSite, [slot]: roomId || null };
    // Drop the site entry entirely if both prefs cleared
    const nextRooms = { ...cur };
    if (!nextForSite.preferred && !nextForSite.secondary) {
      delete nextRooms[siteId];
    } else {
      nextRooms[siteId] = nextForSite;
    }
    updateField('roomPreferences', nextRooms);
  };

  const addAlias = (raw) => {
    const v = (raw || '').trim();
    if (!v) return;
    const cur = local.aliases || [];
    if (cur.includes(v)) return;
    updateField('aliases', [...cur, v]);
  };

  const removeAlias = (alias) => {
    updateField('aliases', (local.aliases || []).filter(a => a !== alias));
  };

  // Buddy candidates: other clinicians in the buddy system who can provide cover
  const buddyCandidates = useMemo(() => {
    return (allClinicians || [])
      .filter(c => c.id !== local.id && c.status === 'active' && c.buddyCover)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allClinicians, local.id]);

  const sessionsFromPattern = useMemo(() => {
    if (!workingPattern) return 0;
    let n = 0;
    for (const d of DAY_LABELS) {
      const row = workingPattern.pattern?.[d.key] || {};
      if (row.am === 'in') n++;
      if (row.pm === 'in') n++;
    }
    return n;
  }, [workingPattern]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)',
        zIndex: 998,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(540px, 100vw)',
          height: '100vh',
          background: 'linear-gradient(135deg, var(--g-ink), var(--g-ink-2))',
          borderLeft: '1px solid var(--g-border-2)',
          color: 'var(--g-text-hi)',
          fontFamily: "'DM Sans', sans-serif",
          overflowY: 'auto',
          animation: 'slideIn 0.18s ease-out',
        }}
      >
        <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

        <div style={{
          position: 'sticky', top: 0,
          background: 'linear-gradient(135deg, var(--g-ink), var(--g-ink-2))',
          padding: '18px 22px 14px',
          borderBottom: '1px solid var(--g-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          zIndex: 1,
        }}>
          <div className="flex items-center gap-3 min-w-0">
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'rgba(148,163,184,0.15)',
              border: '1px solid var(--g-line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: 14, color: 'var(--g-text-hi)',
              flexShrink: 0,
            }}>
              {(local.initials || '?').toUpperCase()}
            </div>
            <div className="min-w-0">
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, color: 'var(--g-text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {local.title ? `${local.title} ${local.name}` : local.name}
              </div>
              <div className="text-meta text-mid mt-0.5">
                {local.role || 'Unassigned'} · {local.status === 'active' ? 'Active' : (local.status || 'active')}
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: '1px solid var(--g-line)',
            color: 'var(--g-text-mid)', borderRadius: 'var(--r-sm)',
            fontSize: 18, padding: '4px 10px',
            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}>×</button>
        </div>

        <div style={{ padding: '18px 22px 60px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Identity */}
          <Section label="Identity">
            <Field label="Title">
              <select value={local.title || ''} onChange={e => updateField('title', e.target.value)} style={selectStyle}>
                {TITLES.map(t => <option key={t} value={t}>{t || '— none —'}</option>)}
              </select>
            </Field>
            <Field label="Full name">
              <input
                type="text" value={local.name || ''}
                onChange={e => updateField('name', e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Initials">
              <input
                type="text" value={local.initials || ''}
                onChange={e => updateField('initials', e.target.value.toUpperCase().slice(0, 4))}
                style={{ ...inputStyle, fontFamily: "var(--font-mono)", maxWidth: 100, textTransform: 'uppercase' }}
              />
            </Field>
            <Field label="Role">
              <select value={local.role || ''} onChange={e => updateField('role', e.target.value)} style={selectStyle}>
                <option value="">— select —</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                {local.role && !ROLES.includes(local.role) && (
                  <option value={local.role}>{local.role} (custom)</option>
                )}
              </select>
            </Field>
            <Field label="Status">
              <select value={local.status || 'active'} onChange={e => updateField('status', e.target.value)} style={selectStyle}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </Section>

          {/* Working pattern mini-view */}
          <Section label={`Working pattern (${sessionsFromPattern} session${sessionsFromPattern === 1 ? '' : 's'}/week)`}>
            <div style={{
              padding: 12,
              background: 'var(--g-field)',
              border: '1px solid var(--g-tile)',
              borderRadius: 'var(--r-md)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {DAY_LABELS.map(d => {
                  const row = workingPattern?.pattern?.[d.key] || {};
                  return (
                    <div key={d.key} className="text-center">
                      <div style={{ fontSize:11, color: 'var(--g-text-mid)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{d.label}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                        <ReadOnlyHalf on={row.am === 'in'} label="AM" />
                        <ReadOnlyHalf on={row.pm === 'in'} label="PM" />
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => { onOpenWorkingGrid?.(); onClose(); }}
                style={{
                  marginTop: 4, padding: '6px 12px',
                  background: 'rgba(16,185,129,0.10)',
                  border: '1px solid rgba(16,185,129,0.30)',
                  borderRadius: 'var(--r-sm)', color: '#34d399',
                  fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Edit in working-days grid →</button>
            </div>
          </Section>

          {/* Aliases */}
          <Section label="Aliases">
            <p style={hint}>
              Alternative names this clinician appears under in the CSV — useful when
              EMIS exports slightly different name formats (e.g. "Dr Smith" vs
              "Smith, J"). The matcher checks all aliases when assigning appointments.
            </p>
            <AliasEditor
              aliases={local.aliases || []}
              onAdd={addAlias}
              onRemove={removeAlias}
            />
          </Section>

          {/* Buddy preferences — only relevant if in the buddy system */}
          {local.buddyCover && (
            <Section label="Buddy cover preferences">
              <p style={hint}>
                Preferred colleagues to cover for this clinician when absent.
                Primary is tried first; secondary if primary is also out.
              </p>
              <Field label="Primary buddy">
                <select value={local.primaryBuddy || ''} onChange={e => updateField('primaryBuddy', e.target.value || null)} style={selectStyle}>
                  <option value="">— no preference —</option>
                  {buddyCandidates.map(b => (
                    <option key={b.id} value={b.id}>{b.initials} — {b.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Secondary buddy">
                <select value={local.secondaryBuddy || ''} onChange={e => updateField('secondaryBuddy', e.target.value || null)} style={selectStyle}>
                  <option value="">— no preference —</option>
                  {buddyCandidates.filter(b => b.id !== local.primaryBuddy).map(b => (
                    <option key={b.id} value={b.id}>{b.initials} — {b.name}</option>
                  ))}
                </select>
              </Field>
            </Section>
          )}

          {/* Room preferences (per site) — only if sites exist */}
          {sites && sites.length > 0 && (
            <Section label="Room preferences">
              <p style={hint}>
                Where this clinician prefers to sit when in. The room allocator tries
                preferred first, then secondary, then any available room of the right type.
              </p>
              {sites.map(site => {
                const rooms = (site.rooms || []).filter(r => r.isClinical !== false);
                const prefs = local.roomPreferences?.[site.id] || {};
                if (rooms.length === 0) {
                  return (
                    <div key={site.id} style={siteRowStyle}>
                      <SiteDot colour={site.colour} />
                      <span style={{ fontSize: 12, color: 'var(--g-text-hi)', minWidth: 80 }}>{site.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--g-text-mid)', fontStyle: 'italic' }}>No clinical rooms configured</span>
                    </div>
                  );
                }
                return (
                  <div key={site.id} style={siteRowStyle}>
                    <SiteDot colour={site.colour} />
                    <span style={{ fontSize: 12, color: 'var(--g-text-hi)', minWidth: 80 }}>{site.name}</span>
                    <select value={prefs.preferred || ''} onChange={e => updateRoomPref(site.id, 'preferred', e.target.value)} style={{ ...selectStyle, flex: 1, fontSize: 11 }}>
                      <option value="">No preferred room</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <select value={prefs.secondary || ''} onChange={e => updateRoomPref(site.id, 'secondary', e.target.value)} style={{ ...selectStyle, flex: 1, fontSize: 11 }}>
                      <option value="">No secondary</option>
                      {rooms.filter(r => r.id !== prefs.preferred).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </Section>
          )}

          {/* Notes */}
          <Section label="Notes">
            <textarea
              value={local.notes || ''}
              onChange={e => updateField('notes', e.target.value)}
              rows={3}
              placeholder="Internal notes about this clinician (working preferences, reminders, etc.)"
              style={{
                ...inputStyle,
                resize: 'vertical', minHeight: 60, lineHeight: 1.5,
                fontFamily: 'inherit',
              }}
            />
          </Section>

          {/* Save indicator */}
          <div style={{ fontSize: 11, color: saving ? 'var(--g-text-mid)' : (savedAt ? '#10b981' : 'var(--g-text-mid)'), textAlign: 'right' }}>
            {error
              ? <span className="text-red-300">{error}</span>
              : (saving ? 'Saving…' : (savedAt ? '✓ All changes saved' : 'Edits save automatically'))
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles + small components ─────────────────────────────────────────
const inputStyle = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 13,
  background: 'var(--g-field)',
  border: '1px solid var(--g-line)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--g-text-hi)',
  outline: 'none',
  fontFamily: 'inherit',
};
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const hint = { margin: 0, fontSize: 11, color: 'var(--g-text-mid)', lineHeight: 1.5 };
const siteRowStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 10px',
  background: 'var(--g-field)',
  borderRadius: 'var(--r-sm)',
};

function Section({ label, children }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 style={{
        margin: 0,
        fontSize: 11, fontWeight: 600, color: 'var(--g-text-mid)',
        textTransform: 'uppercase', letterSpacing: 0.6,
      }}>{label}</h3>
      {children}
    </section>
  );
}
function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-mid">{label}</span>
      {children}
    </label>
  );
}
function SiteDot({ colour }) {
  return (
    <span style={{
      width: 10, height: 10, borderRadius: '50%',
      background: colour || 'var(--g-text-mid)',
      flexShrink: 0,
    }} />
  );
}
function ReadOnlyHalf({ on, label }) {
  return (
    <div
      title={label}
      style={{
        width: 22, height: 14,
        background: on ? '#10b981' : 'transparent',
        border: `1.5px solid ${on ? '#10b981' : 'var(--g-line)'}`,
        borderRadius: 3,
        boxShadow: on ? '0 0 4px rgba(16,185,129,0.4)' : 'none',
      }}
    />
  );
}

// ─── Alias editor ──────────────────────────────────────────────────────
function AliasEditor({ aliases, onAdd, onRemove }) {
  const [draft, setDraft] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {aliases.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--g-text-mid)', fontStyle: 'italic' }}>No aliases yet</span>
        )}
        {aliases.map(a => (
          <span key={a} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            background: 'rgba(34,211,238,0.10)',
            border: '1px solid rgba(34,211,238,0.25)',
            borderRadius: 'var(--r-pill)',
            fontSize: 12, color: '#67e8f9',
            fontFamily: "var(--font-mono)",
          }}>
            {a}
            <button onClick={() => onRemove(a)} aria-label={`Remove ${a}`} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#67e8f9', fontSize: 12, padding: 0, opacity: 0.7,
            }}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit(e)}
          placeholder="Add an alias…"
          style={{ ...inputStyle, flex: 1, fontSize: 12 }}
        />
        <button onClick={submit} disabled={!draft.trim()} style={{
          padding: '6px 14px',
          background: draft.trim() ? 'rgba(34,211,238,0.15)' : 'var(--g-tile)',
          border: '1px solid ' + (draft.trim() ? 'rgba(34,211,238,0.30)' : 'var(--g-line)'),
          borderRadius: 'var(--r-sm)',
          color: draft.trim() ? '#67e8f9' : 'var(--g-text-mid)',
          fontSize: 12, fontWeight: 500,
          cursor: draft.trim() ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
        }}>Add</button>
      </div>
    </div>
  );
}
