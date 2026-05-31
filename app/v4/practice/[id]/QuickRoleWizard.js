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
// aside) are left for the grid, per product decision — keeps the pass short.
const COMMON_ROLES = [
  { role: 'GP Partner',     ico: '🩺', hint: 'Partners who own a share of the practice.' },
  { role: 'Salaried GP',    ico: '🩺', hint: 'Employed GPs who are not partners.' },
  { role: 'GP Registrar',   ico: '🎓', hint: 'GPs still in training (registrar / GPST).' },
  { role: 'ANP',            ico: '➕', hint: 'Advanced nurse practitioners.' },
  { role: 'Practice Nurse', ico: '💉', hint: 'Practice / treatment-room nurses.' },
  { role: 'HCA',            ico: '🤝', hint: 'Healthcare assistants and phlebotomists.' },
];

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

  const [roleById, setRoleById] = useState(initialRoles);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [done, setDone] = useState(allPeople.length === 0);
  const [headKey, setHeadKey] = useState(0);
  const [poolKey, setPoolKey] = useState(0);
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

  // On entering a step, pre-tick everyone who currently holds this role.
  useEffect(() => {
    if (done || !current) return;
    const roleLc = current.role.toLowerCase();
    const pre = new Set(allPeople.filter(p => (roleById[p.id] || '').toLowerCase() === roleLc).map(p => p.id));
    setSelected(pre);
    setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, done]);

  const roleLc = current ? current.role.toLowerCase() : '';
  // Sync semantics: ticked-but-not-yet-this-role → assign; unticked-but-
  // currently-this-role → clear. Everyone else is left untouched.
  const toAssignIds = current ? allPeople.filter(p => selected.has(p.id) && (roleById[p.id] || '').toLowerCase() !== roleLc).map(p => p.id) : [];
  const toClearIds = current ? allPeople.filter(p => !selected.has(p.id) && (roleById[p.id] || '').toLowerCase() === roleLc).map(p => p.id) : [];
  const selCount = current ? allPeople.filter(p => selected.has(p.id)).length : 0;

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const advance = () => {
    setHeadKey(k => k + 1);
    setPoolKey(k => k + 1);
    if (step + 1 >= COMMON_ROLES.length) setDone(true);
    else setStep(s => s + 1);
  };

  const confirm = () => {
    if (advancing.current) return;
    advancing.current = true;
    setQuery('');
    // Apply changes in the parent (role + buddy defaults + persist).
    if (toAssignIds.length) onAssign?.(toAssignIds, current.role);
    if (toClearIds.length) onAssign?.(toClearIds, '');
    setRoleById(prev => {
      const next = { ...prev };
      toAssignIds.forEach(id => { next[id] = current.role; });
      toClearIds.forEach(id => { next[id] = ''; });
      return next;
    });
    setTimeout(() => { advancing.current = false; advance(); }, 220);
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
            {done ? 'Done' : `Role ${step + 1} of ${COMMON_ROLES.length}`}
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
                <div style={{ fontSize: 21, fontWeight: 600, color: '#f1f5f9' }}>Who are your {current.role}s?</div>
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6, marginLeft: 44 }}>{current.hint} The people already on this role are ticked — adjust as needed.</div>
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

            <div key={poolKey} style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 22, minHeight: 96, maxHeight: '52vh', overflowY: 'auto' }}>
              {allPeople.length === 0 ? (
                <div style={{ fontSize: 13, color: '#64748b', padding: '12px 2px' }}>No clinicians to sort.</div>
              ) : (() => {
                const q = query.trim().toLowerCase();
                const shown = q ? allPeople.filter(p => p.name.toLowerCase().includes(q)) : allPeople;
                if (shown.length === 0) {
                  return <div style={{ fontSize: 13, color: '#64748b', padding: '12px 2px' }}>No matches for “{query}”.</div>;
                }
                return shown.map((p, i) => {
                  const sel = selected.has(p.id);
                  // Context: if this person currently holds a *different* role,
                  // show it dimmed so you do not reassign them by accident.
                  const cur = roleById[p.id] || '';
                  const showOther = cur && cur.toLowerCase() !== roleLc;
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle(p.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '8px 13px', borderRadius: 999, fontSize: 14, cursor: 'pointer',
                        border: `1px solid ${sel ? '#818cf8' : 'rgba(255,255,255,0.12)'}`,
                        background: sel ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.03)',
                        color: sel ? '#c7d2fe' : '#e2e8f0',
                        transition: 'background 0.14s, border 0.14s, color 0.14s',
                        animation: `qrwChipIn 0.3s ease-out ${Math.min(i, 16) * 0.016}s both`,
                      }}
                    >
                      {sel && <span style={{ color: '#818cf8' }}>✓</span>}
                      <span>{p.name}</span>
                      {p.tag && <span style={{ fontSize: 11, color: '#64748b' }}>{p.tag}</span>}
                      {showOther && <span style={{ fontSize: 10.5, color: '#475569' }}>· {cur}</span>}
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
                {selCount} marked as {current.role}
              </span>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto', fontFamily: "'Space Mono', monospace" }}>
                Role {step + 1} / {COMMON_ROLES.length}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
