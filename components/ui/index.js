'use client';
// ─────────────────────────────────────────────────────────────────
// GPDash design system. One vocabulary for the whole app:
//   · Neutrals come from the --g-* theme tokens (flip light/dark).
//   · Shape comes from the --r-* scale (6 / 8 / 12 / pill).
//   · Type: Outfit = headings, DM Sans = body, Space Mono = data.
//   · Colour roles: emerald = act, indigo = selected, red = danger,
//     amber = warning. Everything else is neutral.
// Components here are the canonical versions — prefer these over
// bespoke inline styles in new or edited code.
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { onKeyActivate } from '@/lib/a11y';

const HEAD = "'Outfit', sans-serif";
const MONO = "'Space Mono', monospace";

// ─── Toast System ────────────────────────────────────────────────
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  // Portal straight onto document.body so toasts can never be clipped
  // by an ancestor's overflow/transform/backdrop-filter.
  const toastLayer = (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 2147483647, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none', maxWidth: 'min(420px, calc(100vw - 32px))' }}>
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto px-4 py-2.5 shadow-lg text-sm font-medium animate-slide-up" style={{
          borderRadius: 'var(--r-md)', wordBreak: 'break-word', color: '#fff',
          background: t.type === 'error' ? '#dc2626' : t.type === 'warning' ? '#d97706' : '#0f172a',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {t.type === 'success' && '✓ '}{t.type === 'error' && '✕ '}{t.type === 'warning' && '⚠ '}{t.message}
        </div>
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      {mounted && typeof document !== 'undefined' ? createPortal(toastLayer, document.body) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ─── Button ──────────────────────────────────────────────────────
// Variants are colour ROLES, not decorations:
//   primary  = the main act-now action (emerald)
//   secondary= neutral action on a panel
//   ghost    = quiet/inline action
//   danger   = destructive
const BTN_VARIANTS = {
  primary:   { background: '#059669', color: '#fff', border: '1px solid rgba(16,185,129,0.4)' },
  success:   { background: '#059669', color: '#fff', border: '1px solid rgba(16,185,129,0.4)' },
  secondary: { background: 'var(--g-tile)', color: 'var(--g-text-hi)', border: '1px solid var(--g-border-2)' },
  ghost:     { background: 'transparent', color: 'var(--g-text-mid)', border: '1px solid transparent' },
  danger:    { background: '#dc2626', color: '#fff', border: '1px solid rgba(239,68,68,0.4)' },
  accent:    { background: 'var(--accent)', color: '#fff', border: '1px solid rgba(99,102,241,0.4)' },
  // legacy aliases used by the CSV upload flow
  upload_fresh: { background: '#059669', color: '#fff', border: '1px solid rgba(16,185,129,0.4)' },
  upload_stale: { background: '#dc2626', color: '#fff', border: '1px solid rgba(239,68,68,0.4)' },
};
const BTN_SIZES = {
  xs: { padding: '3px 8px',  fontSize: 12, gap: 4, borderRadius: 'var(--r-sm)' },
  sm: { padding: '5px 11px', fontSize: 13, gap: 6, borderRadius: 'var(--r-sm)' },
  md: { padding: '8px 15px', fontSize: 14, gap: 8, borderRadius: 'var(--r-md)' },
  lg: { padding: '10px 19px', fontSize: 14, gap: 8, borderRadius: 'var(--r-md)' },
};

export function Button({ children, variant = 'primary', size = 'md', className = '', disabled, style, ...props }) {
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  const s = BTN_SIZES[size] || BTN_SIZES.md;
  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none hover:brightness-110 active:brightness-95 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:brightness-100 ${className}`}
      style={{ ...v, ...s, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
      disabled={disabled}
      {...props}
    >{children}</button>
  );
}

// ─── Card ────────────────────────────────────────────────────────
export function Card({ children, className = '', padding = true, style, ...props }) {
  return (
    <div className={`${padding ? 'p-5' : ''} ${className}`} style={{ background: 'var(--g-panel)', border: '1px solid var(--g-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', ...style }} {...props}>
      {children}
    </div>
  );
}

// Card header band. accent='ink' gives the signature gradient band used
// on Buddy/Rota cards; coloured accents stay for semantic headers.
export function CardHeader({ children, className = '', accent, style }) {
  const accents = {
    ink:    { background: 'linear-gradient(135deg, var(--g-ink) 0%, var(--g-ink-2) 50%, var(--g-ink) 100%)' },
    red:    { background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff' },
    blue:   { background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff' },
    amber:  { background: 'linear-gradient(135deg, #f59e0b, #ea580c)', color: '#fff' },
    purple: { background: 'linear-gradient(135deg, #7c3aed, #6366f1)', color: '#fff' },
  };
  return (
    <div className={`px-4 py-3 ${className}`} style={{ borderBottom: '1px solid var(--g-border)', ...(accents[accent] || {}), ...style }}>
      {children}
    </div>
  );
}

export function CardTitle({ children, sub }) {
  return (
    <div>
      <div style={{ fontFamily: HEAD, fontSize: 15.5, fontWeight: 600, color: 'var(--g-text-hi)' }}>{children}</div>
      {sub && <div style={{ fontSize: 13, color: 'var(--g-text-mid)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ─── Page Header ─────────────────────────────────────────────────
// The one page-level header: Outfit title, muted subtitle, actions right.
export function PageHeader({ title, subtitle, actions, children, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-x-4 gap-y-2 flex-wrap mb-5 ${className}`}>
      <div className="min-w-0">
        <h1 style={{ fontFamily: HEAD, fontSize: 23, fontWeight: 600, color: 'var(--g-text-hi)', margin: 0, lineHeight: 1.2 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: 'var(--g-text-mid)', margin: '5px 0 0', lineHeight: 1.5, maxWidth: 720 }}>{subtitle}</p>}
      </div>
      {(actions || children) && <div className="flex items-center gap-2 flex-wrap">{actions}{children}</div>}
    </div>
  );
}
// Back-compat alias (older pages import SectionHeading).
export function SectionHeading({ title, subtitle, children }) {
  return <PageHeader title={title} subtitle={subtitle}>{children}</PageHeader>;
}

// ─── Loading Skeleton ────────────────────────────────────────────
export function Skeleton({ className = '', variant = 'text', style }) {
  const variants = {
    text:    { height: 14, borderRadius: 'var(--r-sm)' },
    heading: { height: 22, width: 190, borderRadius: 'var(--r-sm)' },
    card:    { height: 128, borderRadius: 'var(--r-lg)' },
    circle:  { height: 40, width: 40, borderRadius: '50%' },
    button:  { height: 34, width: 96, borderRadius: 'var(--r-md)' },
  };
  return <div className={`animate-pulse ${className}`} style={{ background: 'var(--g-tile-3)', ...(variants[variant] || variants.text), ...style }} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div className="space-y-2"><Skeleton variant="heading" /><Skeleton style={{ width: 130 }} /></div>
        <Skeleton variant="button" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton variant="card" style={{ height: 190 }} />
        <Skeleton variant="card" style={{ height: 190 }} />
      </div>
      <Skeleton variant="card" style={{ height: 260 }} />
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────
// Same shape everywhere: icon, one-line title, short hint, ONE action.
// Emoji-to-line-icon map. Call sites pass emoji (a long-standing API);
// rendering them literally put coloured emoji in an otherwise line-icon
// interface. The API is unchanged — the glyphs now draw in the house style.
const EMPTY_ICONS = {
  '📊': <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/></svg>,
  '📈': <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M6 15l4-4 3 3 5-6"/></svg>,
  '🔍': <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" strokeLinecap="round"/></svg>,
  '🕐': <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  '📋': <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/></svg>,
};

export function EmptyState({ icon, title, description, action, onAction, actionVariant = 'secondary', compact = false }) {
  return (
    <div className="text-center" style={{ padding: compact ? '26px 18px' : '44px 22px' }}>
      {icon && <div style={{ marginBottom: 10, color: 'var(--meta)', display: 'flex', justifyContent: 'center' }}>{EMPTY_ICONS[icon] || <span style={{ fontSize: compact ? 26 : 36, opacity: 0.85 }}>{icon}</span>}</div>}
      <div style={{ fontFamily: HEAD, fontSize: compact ? 14.5 : 16.5, fontWeight: 600, color: 'var(--g-text-hi)', marginBottom: 5 }}>{title}</div>
      {description && <p style={{ fontSize: 13, color: 'var(--g-text-mid)', maxWidth: 430, margin: '0 auto', lineHeight: 1.55 }}>{description}</p>}
      {action && <div className="mt-3.5"><Button size="sm" variant={actionVariant} role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={onAction}>{action}</Button></div>}
    </div>
  );
}

// ─── Pill Toggle ─────────────────────────────────────────────────
export function PillToggle({ options, selected, onChange, size = 'sm' }) {
  const pad = size === 'sm' ? '4px 11px' : '6px 14px';
  return (
    <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: 'var(--g-field)', borderRadius: 'var(--r-md)', border: '1px solid var(--g-border)' }}>
      {options.map(o => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const on = selected === val;
        return (
          <button key={val} onClick={() => onChange(val)} style={{
            padding: pad, fontSize: size === 'sm' ? 12 : 13, fontWeight: 500, border: 'none', cursor: 'pointer',
            borderRadius: 'var(--r-sm)', transition: 'all 0.15s',
            background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--g-text-mid)',
          }}>{label}</button>
        );
      })}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────
export function StatCard({ label, value, accent, sub }) {
  const accentColor = { emerald: '#10b981', amber: '#f59e0b', red: '#ef4444', blue: '#3b82f6', purple: '#8b5cf6', cyan: '#06b6d4' }[accent];
  return (
    <div style={{ background: 'var(--g-tile-2)', border: '1px solid var(--g-border)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--g-label)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, color: accentColor || 'var(--g-text-hi)', lineHeight: 1.3 }}>{value}</div>
      {sub && <div className="text-meta text-mid">{sub}</div>}
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────────
export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: { background: 'var(--g-tile)', color: 'var(--g-text-mid)', border: '1px solid var(--g-border-2)' },
    success: { background: 'rgba(16,185,129,0.14)', color: 'var(--c-green)', border: '1px solid rgba(16,185,129,0.35)' },
    warning: { background: 'rgba(245,158,11,0.14)', color: 'var(--c-amber)', border: '1px solid rgba(245,158,11,0.35)' },
    danger:  { background: 'rgba(239,68,68,0.14)', color: 'var(--c-red)', border: '1px solid rgba(239,68,68,0.35)' },
    info:    { background: 'rgba(59,130,246,0.14)', color: 'var(--c-blue)', border: '1px solid rgba(59,130,246,0.35)' },
    accent:  { background: 'rgba(99,102,241,0.14)', color: 'var(--accent-text)', border: '1px solid rgba(99,102,241,0.35)' },
  };
  return <span className={`inline-flex items-center gap-1 ${className}`} style={{ fontSize: 12, fontWeight: 500, padding: '2px 9px', borderRadius: 'var(--r-pill)', ...(variants[variant] || variants.default) }}>{children}</span>;
}

// ─── Inputs ──────────────────────────────────────────────────────
const FIELD_BASE = {
  background: 'var(--g-field)', border: '1px solid var(--g-line)', color: 'var(--g-text-hi)',
  borderRadius: 'var(--r-md)', outline: 'none', width: '100%',
};
const FIELD_SIZES = {
  sm: { padding: '6px 9px', fontSize: 13 },
  md: { padding: '8px 11px', fontSize: 14 },
};

export function Input({ className = '', size = 'md', style, ...props }) {
  return <input className={`focus:ring-1 focus:ring-emerald-500/50 ${className}`} style={{ ...FIELD_BASE, ...(FIELD_SIZES[size] || FIELD_SIZES.md), ...style }} {...props} />;
}

export function Select({ className = '', size = 'md', children, style, ...props }) {
  return (
    <select className={`focus:ring-1 focus:ring-emerald-500/50 ${className}`} style={{ ...FIELD_BASE, ...(FIELD_SIZES[size] || FIELD_SIZES.md), ...style }} {...props}>
      {children}
    </select>
  );
}

// Label + control wrapper so forms line up everywhere.
export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--g-label)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</span>}
      {children}
      {hint && <span className="block text-meta text-faint mt-1">{hint}</span>}
    </label>
  );
}

// ─── Save Status ─────────────────────────────────────────────────
// The planner's indicator, generalised: pass state = 'idle' | 'saving'
// | 'saved' | 'error'. Renders nothing when idle.
export function SaveStatus({ state, savedLabel = '✓ Saved' }) {
  if (!state || state === 'idle') return null;
  const map = {
    saving: { text: 'Saving…', color: '#fbbf24' },
    saved:  { text: savedLabel, color: '#34d399' },
    error:  { text: 'Save failed', color: '#f87171' },
  };
  const m = map[state] || map.saving;
  return <span style={{ fontSize: 13, color: m.color, minWidth: 58, display: 'inline-block' }}>{m.text}</span>;
}

// ─── Theme hook ──────────────────────────────────────────────────
// True when the light theme is active; updates live when the user
// toggles. Use this to rebuild canvas charts (canvas cannot resolve
// CSS variables, so colours must be re-read on theme change).
export function useIsLight() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setLight(el.getAttribute('data-theme') === 'light');
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return light;
}

// Resolve a CSS custom property to its current concrete value (for
// canvas drawing). Returns the fallback during SSR.
export function cssVar(name, fallback = '') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// ─── Confirm Dialog ──────────────────────────────────────────────
// Imperative, awaitable replacement for window.confirm():
//   const ok = await confirmDialog({ title, message, confirmLabel, danger });
// ConfirmHost is mounted once in the root layout. If somehow unmounted,
// falls back to the native confirm so callers never break.
let _openConfirm = null;

export function confirmDialog(opts = {}) {
  if (typeof opts === 'string') opts = { message: opts };
  if (!_openConfirm) {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(opts.message || opts.title || 'Are you sure?') : false);
  }
  return _openConfirm(opts);
}

export function ConfirmHost() {
  const [req, setReq] = useState(null); // { opts, resolve }
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    _openConfirm = (opts) => new Promise(resolve => {
      // If a dialog is already open, resolve it as cancelled first.
      setReq(prev => { prev?.resolve(false); return { opts, resolve }; });
    });
    return () => { _openConfirm = null; };
  }, []);

  const close = useCallback((val) => {
    setReq(prev => { prev?.resolve(val); return null; });
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req, close]);

  if (!mounted || !req || typeof document === 'undefined') return null;
  const { title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = req.opts || {};

  return createPortal(
    <div role="button" tabIndex={0} onKeyDown={onKeyActivate} onClick={() => close(false)} style={{ position: 'fixed', inset: 0, zIndex: 2147483600, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16, animation: 'uiFadeIn 0.12s ease-out' }}>
      <style>{`@keyframes uiFadeIn { from { opacity: 0 } to { opacity: 1 } } @keyframes uiPopIn { from { opacity: 0; transform: scale(0.97) translateY(4px) } to { opacity: 1; transform: none } }`}</style>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{
        width: 'min(430px, 100%)', background: 'var(--surface-solid)', border: '1px solid var(--g-border-2)',
        borderRadius: 'var(--r-lg)', padding: '20px 20px 16px', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55)',
        animation: 'uiPopIn 0.14s ease-out',
      }}>
        <div className="flex items-start gap-3">
          <div aria-hidden style={{
            width: 34, height: 34, borderRadius: 'var(--r-md)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            background: danger ? 'rgba(239,68,68,0.14)' : 'rgba(99,102,241,0.14)',
            border: `1px solid ${danger ? 'rgba(239,68,68,0.35)' : 'rgba(99,102,241,0.35)'}`,
          }}>{danger ? '⚠' : '?'}</div>
          <div className="min-w-0">
            <div style={{ fontFamily: HEAD, fontSize: 16.5, fontWeight: 600, color: 'var(--g-text-hi)', lineHeight: 1.3 }}>{title}</div>
            {message && <div style={{ fontSize: 13, color: 'var(--g-text-mid)', lineHeight: 1.55, marginTop: 6, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>{message}</div>}
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-[18px]">
          <Button variant="secondary" size="sm" onClick={() => close(false)}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'accent'} size="sm" onClick={() => close(true)} autoFocus>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
