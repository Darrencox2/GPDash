'use client';
import { useEffect, useRef } from 'react';

// SidePanel — unified right-side slide-out used across the dashboard.
//
// Replaces ad-hoc patterns: each card used to roll its own popover or
// hover-tooltip with different sizes, themes, and z-indexes. Everything
// now goes through this so:
//  - Click anywhere → panel slides in from the right
//  - One click anywhere outside (or ESC) closes it
//  - Dark glass theme that matches the rest of the dashboard
//  - Stacking is consistent (z-50 for the scrim, z-50+1 for the panel)
//
// Props:
//  - open: boolean — controls visibility
//  - onClose: () => void
//  - title: string | ReactNode — header line
//  - subtitle: string | ReactNode — small line below the title (optional)
//  - accent: hex string — drives the small left-edge stripe + scroll thumb
//  - width: 'sm' | 'md' | 'lg' (default 'md', maps to 320 / 400 / 480px)
//  - children: panel body
//
// The panel uses position: fixed + flex justify-end so it always sits on
// the viewport's right edge regardless of where the trigger element lives
// in the DOM. The semi-transparent scrim fills the rest of the screen and
// captures click-outside.
export default function SidePanel({ open, onClose, title, subtitle, accent = '#06b6d4', width = 'md', children }) {
  const panelRef = useRef(null);

  // Close on ESC and lock body scroll while open. Body scroll lock prevents
  // the page jumping behind the scrim when the user wheels.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the panel for screen readers — small accessibility win
    setTimeout(() => panelRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthPx = width === 'sm' ? 320 : width === 'lg' ? 480 : 400;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ animation: 'sp-fade-in 0.15s ease-out' }}>
      {/* Scrim — click anywhere outside to close */}
      <div
        className="flex-1"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={typeof title === 'string' ? title : 'Details'}
        className="flex flex-col h-full outline-none"
        style={{
          width: widthPx,
          background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.98) 100%)',
          borderLeft: `1px solid rgba(255,255,255,0.08)`,
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(24px) saturate(180%)',
          animation: 'sp-slide-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Accent stripe down the left edge — uses the panel's accent
            colour as a quick visual link back to the thing that was clicked */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />

        {/* Header */}
        <div
          className="px-5 pt-4 pb-3 flex items-start justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="min-w-0 flex-1">
            {typeof title === 'string' ? (
              <div className="text-base font-medium text-slate-100 truncate">{title}</div>
            ) : title}
            {subtitle && (typeof subtitle === 'string' ? (
              <div className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</div>
            ) : <div className="mt-0.5">{subtitle}</div>)}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 ml-2"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: `${accent}55 transparent` }}>
          {children}
        </div>
      </div>
      <style>{`
        @keyframes sp-slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes sp-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
