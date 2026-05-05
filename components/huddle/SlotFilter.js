'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────
// SlotFilter — gear icon + slide-out panel for selecting which appointment
// slot types count as urgent on the Today page. Also lets admins designate
// duty-doctor slot types so the duty clinician is highlighted in the
// session breakdown.
//
// Redesigned to match GPDash's dark glass aesthetic. Previously had
// light-mode residue (amber-900 text on dark, light hover backgrounds)
// which produced unreadable contrast.
// ─────────────────────────────────────────────────────────────────────────

// ── Gear icon button ─────────────────────────────────────────────────────
export function SlotFilterButton({ overrides, setOverrides, knownSlotTypes, show, setShow, variant = 'dark', initialOverrides }) {
  const selectedCount = overrides ? Object.values(overrides).filter(Boolean).length : 0;
  const hasFilter = selectedCount > 0;
  return (
    <button
      onClick={() => {
        if (!show && !overrides) {
          if (initialOverrides) {
            setOverrides(initialOverrides);
          } else {
            const o = {}; (knownSlotTypes || []).forEach(s => { o[s] = false; }); setOverrides(o);
          }
        }
        setShow(!show);
      }}
      className={`glass-cog ${show ? 'glass-cog-active' : ''} relative w-8 h-8 rounded-lg flex items-center justify-center`}
      title={`Filter slots${selectedCount > 0 ? ` (${selectedCount} selected)` : ''}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
      </svg>
      {hasFilter && !show && (
        <span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
          style={{ background: '#06b6d4', color: '#0f172a' }}
        >
          {selectedCount}
        </span>
      )}
    </button>
  );
}

// ── Slide-out panel ──────────────────────────────────────────────────────
//
// Optional `cardSettings` prop: when present, the panel renders a card-level
// editor block at the top (title, colour, duration, full-width toggle). Used
// by capacity cards on the Today page so all card configuration lives behind
// one cog. Caller passes { card, palette, onChange, onDelete } where palette
// is a list of {key, label, hex} colour options.
export function SlotFilterPanel({ overrides, setOverrides, knownSlotTypes, show, setShow, title, dutyDoctorSlot, setDutyDoctorSlot, cardSettings }) {
  const [search, setSearch] = useState('');
  // Same portal pattern as SidePanel — without it, position: fixed on this
  // panel ends up positioned relative to whichever .glass card hosts the
  // cog (because backdrop-filter creates a stacking context). Result: the
  // panel sits inside the card instead of sliding out from the viewport.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!show || !overrides || !mounted) return null;

  const slots = (knownSlotTypes || []).slice().sort();
  const filteredSlots = search ? slots.filter(s => s.toLowerCase().includes(search.toLowerCase())) : slots;
  const selectedCount = Object.values(overrides).filter(Boolean).length;
  const totalCount = slots.length;

  const dutySelectedSet = new Set(
    Array.isArray(dutyDoctorSlot) ? dutyDoctorSlot : (dutyDoctorSlot ? [dutyDoctorSlot] : [])
  );

  const panel = (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title || 'Slot filter'}>
      {/* Backdrop */}
      <div
        className="flex-1 transition-opacity"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
        onClick={() => setShow(false)}
      />

      {/* Panel */}
      <div
        className="w-96 max-w-full shadow-2xl flex flex-col h-full animate-slide-in-right"
        style={{
          background: 'linear-gradient(180deg, #111c33 0%, #0b1224 100%)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-base font-medium text-slate-100">{title || 'Slot filter'}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Choose which slot types count toward urgent capacity
              </div>
            </div>
            <button
              onClick={() => setShow(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Selection summary */}
          <div className="flex items-center gap-2 mt-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
              style={{ background: 'rgba(34,211,238,0.12)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.2)' }}
            >
              <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{selectedCount}</span>
              <span style={{ color: '#67e8f988' }}>of</span>
              <span style={{ fontFamily: "'Space Mono', monospace" }}>{totalCount}</span>
              <span>selected</span>
            </div>
            <button
              onClick={() => { const o = {}; slots.forEach(s => { o[s] = true; }); setOverrides(o); }}
              className="text-xs text-slate-400 hover:text-cyan-300 transition-colors px-2 py-1 rounded hover:bg-white/5"
            >
              All
            </button>
            <button
              onClick={() => { const o = {}; slots.forEach(s => { o[s] = false; }); setOverrides(o); }}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded hover:bg-white/5"
            >
              None
            </button>
          </div>
        </div>

        {/* Card-level settings — only rendered when cardSettings prop is
            provided. Lets editors change the card's title, accent colour,
            visible period, and full-width toggle without leaving the panel.
            All four were previously either un-editable, in a separate
            picker, or required delete-and-recreate. */}
        {cardSettings && (
          <div
            className="px-5 py-3 flex-shrink-0 space-y-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* Title */}
            <div>
              <label className="text-[11px] text-slate-500 uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={cardSettings.card.title}
                onChange={e => cardSettings.onChange({ title: e.target.value })}
                className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
              />
            </div>

            {/* Colour */}
            <div>
              <label className="text-[11px] text-slate-500 uppercase tracking-wider">Accent colour</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {cardSettings.palette.map(c => {
                  const isActive = cardSettings.card.colour === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => cardSettings.onChange({ colour: c.key })}
                      title={c.label}
                      className={`w-6 h-6 rounded-md transition-all ${isActive ? 'scale-110' : 'opacity-60 hover:opacity-100'}`}
                      style={{
                        background: c.hex,
                        boxShadow: isActive ? `0 0 0 2px rgba(255,255,255,0.4), 0 0 8px ${c.hex}88` : 'none',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Period */}
            <div>
              <label className="text-[11px] text-slate-500 uppercase tracking-wider">Period</label>
              <div className="flex gap-1 mt-1.5">
                {[7, 14, 21, 28].map(d => {
                  const isActive = (cardSettings.card.days || 14) === d;
                  return (
                    <button
                      key={d}
                      onClick={() => cardSettings.onChange({ days: d })}
                      className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${isActive ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
                      style={{
                        background: isActive ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.03)',
                        border: isActive ? '1px solid rgba(34,211,238,0.35)' : '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      {d} days
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Span (full-width toggle) */}
            <div>
              <label className="flex items-center justify-between cursor-pointer text-sm text-slate-300">
                <span>
                  <span className="block">Full-width card</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">Spans the full row instead of half</span>
                </span>
                <input
                  type="checkbox"
                  checked={!!cardSettings.card.fullWidth}
                  onChange={e => cardSettings.onChange({ fullWidth: e.target.checked })}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: '#06b6d4' }}
                />
              </label>
            </div>

            {/* Delete card */}
            {cardSettings.onDelete && (
              <button
                onClick={() => {
                  if (confirm(`Remove "${cardSettings.card.title}" card?`)) {
                    cardSettings.onDelete();
                    setShow(false);
                  }
                }}
                className="w-full px-2.5 py-1.5 rounded-lg text-xs text-red-400/80 hover:text-red-300 transition-colors"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                Remove card
              </button>
            )}
          </div>
        )}

        {/* Duty doctor block */}
        {setDutyDoctorSlot && (
          <div
            className="px-5 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(245,158,11,0.04)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                <path d="M12 2l2.39 7.36H22l-6.19 4.5L18.2 21 12 16.5 5.8 21l2.39-7.14L2 9.36h7.61L12 2z" />
              </svg>
              <span className="text-xs font-medium text-amber-300 uppercase tracking-wider">
                Duty doctor slot{dutySelectedSet.size > 1 ? 's' : ''}
              </span>
              {dutySelectedSet.size > 0 && (
                <span className="text-xs text-amber-400/70" style={{ fontFamily: "'Space Mono', monospace" }}>
                  {dutySelectedSet.size}
                </span>
              )}
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1 -mr-1" style={{ scrollbarWidth: 'thin' }}>
              {slots.map(s => {
                const selected = dutySelectedSet.has(s);
                return (
                  <label
                    key={s}
                    className="flex items-center gap-2 text-xs cursor-pointer rounded-md px-2 py-1.5 transition-colors"
                    style={{
                      background: selected ? 'rgba(245,158,11,0.12)' : 'transparent',
                      color: selected ? '#fde68a' : '#94a3b8',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={e => {
                        const current = Array.isArray(dutyDoctorSlot) ? dutyDoctorSlot : (dutyDoctorSlot ? [dutyDoctorSlot] : []);
                        setDutyDoctorSlot(e.target.checked ? [...current, s] : current.filter(x => x !== s));
                      }}
                      className="flex-shrink-0 w-3.5 h-3.5 cursor-pointer"
                      style={{ accentColor: '#f59e0b' }}
                    />
                    <span className="truncate" title={s}>{s}</span>
                  </label>
                );
              })}
            </div>
            <div className="text-[11px] text-amber-500/70 mt-2 leading-relaxed">
              Slot types that identify the duty doctor — used in the session breakdown
            </div>
          </div>
        )}

        {/* Search box (only when many slots) */}
        {slots.length > 8 && (
          <div className="px-5 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="relative">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search slot types"
                className="w-full pl-8 pr-2 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
              />
            </div>
          </div>
        )}

        {/* Slot list */}
        <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: 'thin' }}>
          {filteredSlots.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-500">
              No slot types match {search ? `"${search}"` : 'the filter'}.
            </div>
          )}
          <div className="space-y-0.5">
            {filteredSlots.map(slot => {
              const checked = !!overrides[slot];
              return (
                <label
                  key={slot}
                  className="flex items-center gap-2.5 text-sm cursor-pointer rounded-lg px-2.5 py-2 transition-colors"
                  style={{
                    background: checked ? 'rgba(34,211,238,0.08)' : 'transparent',
                    color: checked ? '#e0f2fe' : '#cbd5e1',
                  }}
                  onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => setOverrides({ ...overrides, [slot]: e.target.checked })}
                    className="flex-shrink-0 w-4 h-4 cursor-pointer"
                    style={{ accentColor: '#06b6d4' }}
                  />
                  <span className="truncate flex-1" title={slot}>{slot}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex-shrink-0 flex items-center justify-between"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <button
            onClick={() => { setOverrides(null); setShow(false); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Reset to defaults
          </button>
          <button
            onClick={() => setShow(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.3)', color: '#67e8f9' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

// ── Convenience export combining button + panel ──────────────────────────
export default function SlotFilter({ overrides, setOverrides, knownSlotTypes, title, variant = 'dark', initialOverrides, dutyDoctorSlot, setDutyDoctorSlot, readOnly, cardSettings }) {
  const [show, setShow] = useState(false);
  const noop = () => {};
  const setOverridesGated = readOnly ? noop : setOverrides;
  const setDutyDoctorSlotGated = readOnly ? noop : setDutyDoctorSlot;
  const cardSettingsGated = readOnly ? null : cardSettings;
  return (
    <>
      <SlotFilterButton
        overrides={overrides}
        setOverrides={setOverridesGated}
        knownSlotTypes={knownSlotTypes}
        show={show}
        setShow={setShow}
        variant={variant}
        initialOverrides={initialOverrides}
      />
      <SlotFilterPanel
        overrides={overrides}
        setOverrides={setOverridesGated}
        knownSlotTypes={knownSlotTypes}
        show={show}
        setShow={setShow}
        title={title}
        dutyDoctorSlot={dutyDoctorSlot}
        setDutyDoctorSlot={setDutyDoctorSlotGated}
        cardSettings={cardSettingsGated}
      />
    </>
  );
}
