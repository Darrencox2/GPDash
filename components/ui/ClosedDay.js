// The one closed-day treatment, shared.
//
// Before this existed the concept had four dialects: a house icon on Today,
// an emoji then a house on Buddy, an amber dashed box on Capacity, and
// amber text in Rooms. Same fact, four languages. Every surface that says
// "the practice is closed" renders one of these two.

export function ClosedDayIcon({ size = 30, color = 'var(--meta)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

// Full-size card for a page or panel body.
export function ClosedDayCard({ reason, children, className = '' }) {
  return (
    <div className={`glass rounded-xl p-8 text-center ${className}`}>
      <div className="mb-3 flex justify-center"><ClosedDayIcon /></div>
      <div className="text-lg font-medium text-white mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Practice closed</div>
      {reason && <div className="text-sm" style={{ color: 'var(--meta)' }}>{reason}</div>}
      {children}
    </div>
  );
}

// Compact inline strip for tiles and rows.
export function ClosedDayInline({ label = 'Bank holiday' }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--meta)' }}>
      <ClosedDayIcon size={14} />
      <span className="text-sm">{label}</span>
    </span>
  );
}
