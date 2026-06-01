'use client';

// QuickRoleWizard — a floating, animated "quick fire" way to assign roles
// to a whole team at once, role by role rather than person by person.
//
// Flow: for each common general-practice role in turn, the clinicians who
// still need a role are shown as tappable chips. Tap everyone who fits,
// hit Assign, and they fly out of the pool (and get that role + its
// buddy-cover defaults applied via onAssign). Anyone left when the pass
// finishes simply stays in the grid behind the modal for individual tidy-up.
//
// Props:
//   clinicians  — full clinician list (v3-shape: { id, name, role, status, aliases })
//   onAssign    — (ids: string[], role: string) => void  (parent applies + persists)
//   onClose     — () => void
//
// Styling matches the v4 dark-glass language; animations echo the setup
// celebration (spring pop, lift-in, confetti burst).

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { allRoles } from '@/lib/data';

// The pass only steps through the everyday roles. Less common ones (ANP
// The pass steps. The first one pulls out the non-clinicians (telephone
// triage, care navigators, system / slot-holder pseudo-entries) and marks
// them administrative + Administrator, so they drop out of the way for the
// clinical role steps that follow. Less common clinical roles are left for
// the grid, per product decision — keeps the pass short.
const COMMON_ROLES = [
  { role: 'Administrator', admin: true, ico: '☎️', question: 'Who are your non-clinicians?',
    hint: 'Telephone triage, care navigators, and any system or slot-holder entries that are not real clinicians. These get marked administrative and drop out of buddy cover.' },
  { role: 'GP Partner',     ico: '🩺', hint: 'Partners who own a share of the practice.' },
  { role: 'Salaried GP',    ico: '🩺', hint: 'Employed GPs who are not partners.' },
  { role: 'GP Registrar',   ico: '🎓', hint: 'GPs still in training (registrar / GPST).' },
  { role: 'ANP',            ico: '➕', hint: 'Advanced nurse practitioners.' },
  { role: 'Practice Nurse', ico: '💉', hint: 'Practice / treatment-room nurses.' },
  { role: 'HCA',            ico: '🤝', hint: 'Healthcare assistants and phlebotomists.' },
];

// Role values that mean "not really set" — treated as needing a role.
const PLACEHOLDER = new Set(['', 'staff', 'unknown', 'unknow', 'none', 'n/a', 'na', 'tbc']);
// Pull a title hint (Dr, Mrs…) from the original CSV name kept in aliases.
function titleHint(c) {
  const alias = (c.aliases && c.aliases[0]) || '';
  const m = alias.match(/\(([^)]+)\)/);
  if (!m) return '';
  const t = m[1].trim();
  return /^(mr|mrs|ms|miss|mx|dr|prof|rev)$/i.test(t) ? t : '';
}

export default function QuickRoleWizard({ clinicians, onAssign, onClose }) {
  // Everyone on the team (not left) — shown on every step. Stable for the
  // session, sorted by name for easy scanning.
  const allPeople = useMemo(
    () => (clinicians || [])
      .filter(c => c.status !== 'left')
      .map(c => ({ id: c.id, name: c.name || '—', tag: titleHint(c) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [clinicians]
  );
  // Live role per clinician, seeded from their current stored role. Updated
  // as the user assigns, so each step can pre-tick the people already on
  // that role (including ones assigned earlier in this same run).
  const initialRoles = useMemo(() => {
    const m = {};
    (clinicians || []).forEach(c => { if (c.status !== 'left') m[c.id] = c.role || ''; });
    return m;
  }, [clinicians]);
  const initialStatus = useMemo(() => {
    const m = {};
    (clinicians || []).forEach(c => { if (c.status !== 'left') m[c.id] = c.status || 'active'; });
    return m;
  }, [clinicians]);

  const [roleById, setRoleById] = useState(initialRoles);
  const [statusById, setStatusById] = useState(initialStatus);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [done, setDone] = useState(allPeople.length === 0);
  const [headKey, setHeadKey] = useState(0);
  const [poolKey, setPoolKey] = useState(0);
  const [fading, setFading] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const advancing = useRef(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = COMMON_ROLES[step];
  const isAdminStep = !!current?.admin;

  // On entering a step, pre-tick the right people: on the non-clinician
  // step, everyone already administrative; on a role step, everyone already
  // on that role (excluding administrative entries).
  useEffect(() => {
    if (done || !current) return;
    let pre;
    if (current.admin) {
      pre = new Set(allPeople.filter(p => statusById[p.id] === 'administrative').map(p => p.id));
    } else {
      const roleLc = current.role.toLowerCase();
      pre = new Set(allPeople.filter(p => statusById[p.id] !== 'administrative' && (roleById[p.id] || '').toLowerCase() === roleLc).map(p => p.id));
    }
    setSelected(pre);
    setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, done]);

  const roleLc = current ? current.role.toLowerCase() : '';
  // Sync semantics. Non-clinician step works on status; role steps on role.
  let toAssignIds, toClearIds;
  if (isAdminStep) {
    toAssignIds = allPeople.filter(p => selected.has(p.id) && statusById[p.id] !== 'administrative').map(p => p.id);
    toClearIds = allPeople.filter(p => !selected.has(p.id) && statusById[p.id] === 'administrative').map(p => p.id);
  } else {
    toAssignIds = current ? allPeople.filter(p => selected.has(p.id) && (roleById[p.id] || '').toLowerCase() !== roleLc).map(p => p.id) : [];
    toClearIds = current ? allPeople.filter(p => !selected.has(p.id) && (roleById[p.id] || '').toLowerCase() === roleLc).map(p => p.id) : [];
  }
  const selCount = current ? allPeople.filter(p => selected.has(p.id)).length : 0;

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const advance = () => {
    setFading(new Set());
    setHeadKey(k => k + 1);
    setPoolKey(k => k + 1);
    if (step + 1 >= COMMON_ROLES.length) setDone(true);
    else setStep(s => s + 1);
  };

  const confirm = () => {
    if (advancing.current) return;
    advancing.current = true;
    setQuery('');
    // Fade out the people who just got this step's role/admin status, so
    // there's clear "sorted" feedback before we move on (they then appear
    // greyed on later steps). Only the freshly-assigned fade — not the
    // ones being un-assigned.
    if (toAssignIds.length) setFading(new Set(toAssignIds));
    if (isAdminStep) {
      // Mark selected as administrative + Administrator; un-mark removes
      // them (back to active + needing a role).
      if (toAssignIds.length) onAssign?.(toAssignIds, 'Administrator', { status: 'administrative' });
      if (toClearIds.length) onAssign?.(toClearIds, '', { status: 'active' });
      setStatusById(prev => {
        const next = { ...prev };
        toAssignIds.forEach(id => { next[id] = 'administrative'; });
        toClearIds.forEach(id => { next[id] = 'active'; });
        return next;
      });
      setRoleById(prev => {
        const next = { ...prev };
        toAssignIds.forEach(id => { next[id] = 'Administrator'; });
        toClearIds.forEach(id => { next[id] = ''; });
        return next;
      });
    } else {
      if (toAssignIds.length) onAssign?.(toAssignIds, current.role);
      if (toClearIds.length) onAssign?.(toClearIds, '');
      setRoleById(prev => {
        const next = { ...prev };
        toAssignIds.forEach(id => { next[id] = current.role; });
        toClearIds.forEach(id => { next[id] = ''; });
        return next;
      });
      // Assigning a clinical role re-activates any admin entry.
      if (toAssignIds.length) {
        setStatusById(prev => {
          const next = { ...prev };
          toAssignIds.forEach(id => { if (next[id] === 'administrative') next[id] = 'active'; });
          return next;
        });
      }
    }
    // Hold long enough for the fade-out to play (or advance promptly if
    // nothing was assigned).
    setTimeout(() => { advancing.current = false; advance(); }, toAssignIds.length ? 480 : 160);
  };

  // ─── Confetti for the finish screen ─────────────────────────────────
  const confetti = useMemo(() => {
    const cols = ['#6366f1', '#818cf8', '#10b981', '#f59e0b', '#34d399'];
    return Array.from({ length: 16 }, (_, i) => {
      const ang = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 70;
      return { dx: Math.round(Math.cos(ang) * dist), dy: Math.round(Math.sin(ang) * dist - 20), c: cols[i % 5], d: i * 0.012 };
    });
  }, []);

  if (!mounted || typeof document === 'undefined') return null;

  const overlay = (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'radial-gradient(120% 120% at 50% 0%, rgba(30,41,59,0.78) 0%, rgba(8,12,22,0.9) 70%)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'qrwFade 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes qrwFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qrwPop { 0% { transform: scale(0.92) translateY(12px); opacity: 0; } 60% { transform: scale(1.015) translateY(0); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes qrwChipIn { from { transform: scale(0.8) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes qrwFadeOut { 0% { opacity: 1; transform: scale(1); } 30% { transform: scale(1.08); } 100% { opacity: 0; transform: scale(0.6) translateY(-22px); } }
        @keyframes qrwHeadIn { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes qrwCheck { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.18); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes qrwLift { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes qrwConf { 0% { transform: translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(var(--dx),var(--dy)) scale(0.3); opacity: 0; } }
      `}</style>

      <div
        style={{
          width: 'min(1080px, 96vw)', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto',
          background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(129,140,248,0.28)',
          borderRadius: 18, padding: '26px 32px 24px',
          boxShadow: '0 40px 90px -20px rgba(0,0,0,0.75)',
          animation: 'qrwPop 0.55s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#818cf8', fontWeight: 600 }}>
            {done ? 'Done' : `Step ${step + 1} of ${COMMON_ROLES.length}`}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ height: '100%', width: `${done ? 100 : Math.round((step / COMMON_ROLES.length) * 100)}%`, background: 'linear-gradient(90deg,#6366f1,#818cf8)', borderRadius: 999, transition: 'width 0.45s cubic-bezier(0.2,0.8,0.2,1)' }} />
        </div>

        {done ? (() => {
          const known = allRoles();
          const withRole = allPeople.filter(p => {
            const r = (roleById[p.id] || '').toLowerCase();
            return r && known.some(x => x.toLowerCase() === r);
          }).length;
          const leftover = allPeople.length - withRole;
          return (
          <div style={{ textAlign: 'center', padding: '4px 0 12px' }}>
            <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 14px' }}>
              {confetti.map((c, i) => (
                <span key={i} aria-hidden style={{ position: 'absolute', top: 0, left: '50%', width: 8, height: 8, borderRadius: 2, background: c.c, '--dx': `${c.dx}px`, '--dy': `${c.dy}px`, animation: `qrwConf 0.9s ease-out ${c.d}s both` }} />
              ))}
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'qrwCheck 0.55s cubic-bezier(0.34,1.56,0.64,1)' }}>
                <span style={{ color: 'white', fontSize: 38 }}>✓</span>
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#f1f5f9', animation: 'qrwLift 0.45s ease-out 0.15s both' }}>
              {withRole} of {allPeople.length} have a role
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6, animation: 'qrwLift 0.45s ease-out 0.25s both' }}>
              {leftover > 0
                ? `${leftover} still need a role — they're waiting in the grid below for you to finish off.`
                : 'Everyone has a role. Nice work.'}
            </div>
            <div style={{ marginTop: 20, animation: 'qrwLift 0.45s ease-out 0.35s both' }}>
              <button onClick={onClose} style={{ background: '#6366f1', border: 'none', color: 'white', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Back to the team
              </button>
            </div>
          </div>
          );
        })() : (
          <>
            <div key={headKey} style={{ marginBottom: 16, animation: 'qrwHeadIn 0.35s ease-out' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(129,140,248,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{current.ico}</div>
                <div style={{ fontSize: 21, fontWeight: 600, color: '#f1f5f9' }}>{current.question || `Who are your ${current.role}s?`}</div>
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6, marginLeft: 44 }}>{current.hint} {isAdminStep ? 'Anyone already administrative is ticked — adjust as needed.' : 'The people already on this role are ticked — adjust as needed.'}</div>
            </div>

            <div style={{ position: 'relative', marginBottom: 14 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 13 }}>🔍</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a name…"
                style={{
                  width: '100%', padding: '9px 12px 9px 34px', fontSize: 14,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>

            <div key={poolKey} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 8, marginBottom: 22, minHeight: 96, maxHeight: '52vh', overflowY: 'auto', alignContent: 'start' }}>
              {allPeople.length === 0 ? (
                <div style={{ fontSize: 13, color: '#64748b', padding: '12px 2px' }}>No clinicians to sort.</div>
              ) : (() => {
                const q = query.trim().toLowerCase();
                const shown = q ? allPeople.filter(p => p.name.toLowerCase().includes(q)) : allPeople;
                if (shown.length === 0) {
                  return <div style={{ fontSize: 13, color: '#64748b', padding: '12px 2px', gridColumn: '1 / -1' }}>No matches for “{query}”.</div>;
                }
                return shown.map((p, i) => {
                  const sel = selected.has(p.id);
                  const cur = roleById[p.id] || '';
                  const isAdmin = statusById[p.id] === 'administrative';
                  const isFading = fading.has(p.id);
                  const hasRole = isAdmin || (cur && cur.toLowerCase() !== '' && !PLACEHOLDER.has(cur.trim().toLowerCase()));
                  // Three tiers: selected for this role (indigo, prominent),
                  // already on another role (dimmed so it recedes), or not yet
                  // allocated (normal — these are the ones still to sort).
                  const allocatedElsewhere = !sel && hasRole;
                  // Subline: "Administrative" for non-clinicians, else their
                  // role if allocated, else the Dr/Mrs title hint.
                  const subline = isAdmin ? 'Administrative' : (hasRole ? cur : (p.tag || ''));
                  return (
                    <button
                      key={p.id}
                      onClick={() => !isFading && toggle(p.id)}
                      title={p.name}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                        padding: '7px 11px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        minHeight: 46,
                        border: `1px solid ${sel ? '#818cf8' : 'rgba(255,255,255,0.10)'}`,
                        background: sel ? 'rgba(99,102,241,0.20)' : 'rgba(255,255,255,0.03)',
                        opacity: allocatedElsewhere ? 0.45 : 1,
                        transition: 'background 0.14s, border 0.14s, opacity 0.14s',
                        animation: isFading
                          ? `qrwFadeOut 0.42s cubic-bezier(0.4,0,0.6,1) ${Math.min(i, 16) * 0.03}s both`
                          : `qrwChipIn 0.3s ease-out ${Math.min(i, 16) * 0.014}s both`,
                      }}
                    >
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 5, width: '100%',
                        fontSize: 13.5, fontWeight: sel ? 600 : 500,
                        color: sel ? '#c7d2fe' : '#e2e8f0',
                      }}>
                        {sel && <span style={{ color: '#818cf8', flexShrink: 0 }}>✓</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      </span>
                      {subline && (
                        <span style={{ fontSize: 10.5, color: hasRole ? '#94a3b8' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                          {subline}
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={confirm}
                style={{
                  border: 'none', padding: '9px 16px', borderRadius: 10, fontSize: 14, fontWeight: 500,
                  background: '#6366f1', color: 'white', display: 'inline-flex', alignItems: 'center', gap: 7,
                  cursor: 'pointer', transition: 'opacity 0.15s',
                }}
              >
                {step + 1 >= COMMON_ROLES.length ? 'Confirm & finish' : 'Confirm & continue'} →
              </button>
              <span style={{ fontSize: 12.5, color: '#94a3b8' }}>
                {selCount} marked as {isAdminStep ? 'non-clinician' : current.role}
              </span>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto', fontFamily: "'Space Mono', monospace" }}>
                Step {step + 1} / {COMMON_ROLES.length}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
