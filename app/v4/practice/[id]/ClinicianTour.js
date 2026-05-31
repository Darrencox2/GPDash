'use client';

// ClinicianTour — a gentle, non-blocking guided walkthrough for the
// clinicians screen. It highlights the next thing to do with a pulsing
// ring and a small callout, but never blocks the page: the user can click
// anywhere. The parent (QuickSetupTable) owns the step state machine and
// passes the current step + target refs; this component just renders the
// coach-mark for that step, anchored to its target via getBoundingClientRect
// (measured live, so it survives the dark-glass transformed ancestors).
//
// Props:
//   step      — 'quick' | 'sort' | 'days' | 'buddy' | null
//   targets   — { quick, days, grid, buddy } refs to the DOM nodes
//   stepIndex — 1-based number for the "Step N of 4" label
//   totalSteps
//   primaryLabel / onPrimary — main button
//   onSkip    — dismiss the whole tour

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const COPY = {
  quick: {
    title: 'Start here — sort everyone fast',
    body: 'Most of your team arrives without a role. Quick role setup walks you through them role by role so you can sort the whole list in a few taps.',
    place: 'below',
  },
  sort: {
    title: 'Finish off the rest',
    body: 'A few people still need a role. Set them here in the grid — click the role dropdown on each highlighted row, or tick several and use the bulk actions.',
    place: 'above',
  },
  days: {
    title: 'Check their working days',
    body: 'Everyone has a role now. Open the working days grid to confirm who works which days — this drives the buddy cover rota.',
    place: 'below',
  },
  buddy: {
    title: 'Confirm who is in the buddy system',
    body: 'Last thing: make sure the “In buddy system” toggle is on for the clinicians who receive lab results, since they are the ones who need cover arranging when away.',
    place: 'above',
  },
};

export default function ClinicianTour({ step, targets, stepIndex, totalSteps, primaryLabel, onPrimary, onSkip }) {
  const [rect, setRect] = useState(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const measure = useCallback(() => {
    const ref = step && targets[targetKey(step)];
    const node = ref && ref.current;
    if (!node) { setRect(null); return; }
    const r = node.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step, targets]);

  useEffect(() => {
    if (!step) return;
    // Bring the target into view, then measure (and keep measuring on
    // scroll/resize so the ring + callout track the target).
    const ref = targets[targetKey(step)];
    if (ref && ref.current) {
      try { ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    }
    measure();
    const t1 = setTimeout(measure, 120);
    const t2 = setTimeout(measure, 420);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [step, measure, targets]);

  if (!mounted || !step || !rect || typeof document === 'undefined') return null;
  const copy = COPY[step];
  if (!copy) return null;

  // Callout placement: below or above the target, clamped to the viewport.
  const calloutW = 320;
  const gap = 14;
  let calloutLeft = rect.left + rect.width / 2 - calloutW / 2;
  calloutLeft = Math.max(12, Math.min(calloutLeft, window.innerWidth - calloutW - 12));
  const below = copy.place === 'below';
  const calloutTop = below ? rect.top + rect.height + gap : null;
  const calloutBottom = below ? null : window.innerHeight - rect.top + gap;

  const layer = (
    <>
      <style>{`
        @keyframes ctRing { 0%,100% { box-shadow: 0 0 0 3px rgba(129,140,248,0.9), 0 0 0 6px rgba(99,102,241,0.35); } 50% { box-shadow: 0 0 0 3px rgba(129,140,248,0.9), 0 0 0 12px rgba(99,102,241,0); } }
        @keyframes ctIn { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {/* Pulsing highlight ring around the target — pointer-events: none so
          clicks pass straight through to the real button underneath. */}
      <div
        aria-hidden
        style={{
          position: 'fixed', zIndex: 1200, pointerEvents: 'none',
          top: rect.top - 5, left: rect.left - 5,
          width: rect.width + 10, height: rect.height + 10,
          borderRadius: 12, animation: 'ctRing 1.8s ease-in-out infinite',
        }}
      />

      {/* Callout */}
      <div
        role="dialog"
        style={{
          position: 'fixed', zIndex: 1201, width: calloutW, maxWidth: 'calc(100vw - 24px)',
          left: calloutLeft,
          ...(below ? { top: calloutTop } : { bottom: calloutBottom }),
          background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(129,140,248,0.45)',
          borderRadius: 14, padding: '15px 17px',
          boxShadow: '0 24px 60px -16px rgba(0,0,0,0.7)',
          animation: 'ctIn 0.3s ease-out',
        }}
      >
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#818cf8', fontWeight: 600, marginBottom: 6 }}>
          Step {stepIndex} of {totalSteps}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 5 }}>{copy.title}</div>
        <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 13 }}>{copy.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onPrimary && (
            <button
              type="button"
              onClick={onPrimary}
              style={{ border: 'none', background: '#6366f1', color: 'white', padding: '7px 14px', borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              {primaryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}
          >
            Skip tour
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(layer, document.body);
}

function targetKey(step) {
  if (step === 'quick') return 'quick';
  if (step === 'sort') return 'grid';
  if (step === 'days') return 'days';
  if (step === 'buddy') return 'buddy';
  return 'quick';
}
