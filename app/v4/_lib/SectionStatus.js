// app/v4/_lib/SectionStatus.js
//
// Server-component-safe primitives for surfacing setup-completion at a
// glance:
//
//   <SectionStatusStripe complete hint="…" />
//     A 2px coloured bar that sits at the top of a section's content
//     pane. Green when complete, amber when not. Hint text shown below.
//
//   <TabStatusDot complete />
//     A small coloured dot for use inside a tab label. Green/amber.
//     Two pixels tall, four wide — visible but not obtrusive.
//
//   <DashboardCompletenessStrip statuses={...} />
//     Five-segment strip showing each section's state at a glance.
//     Used at the top of the main dashboard so the user can see "what
//     still needs my attention" without clicking through each tab.
//     Clickable — jumps to the relevant tab.
//
// All are pure SVG/divs, no hooks. Safe in both server and client
// components.

import Link from 'next/link';

const GREEN = '#10b981';
const AMBER = '#f59e0b';

/* ─── Per-section header stripe ──────────────────────────────────────── */

export function SectionStatusStripe({ complete, hint, label }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        role="status"
        aria-label={complete ? `${label || 'Section'} complete` : `${label || 'Section'} needs attention`}
        style={{
          height: 3,
          background: complete ? GREEN : AMBER,
          borderRadius: 2,
          boxShadow: `0 0 12px ${complete ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
          opacity: 0.85,
        }}
      />
      {hint && (
        <div style={{
          fontSize: 12,
          color: complete ? '#6ee7b7' : '#fcd34d',
          marginTop: 8,
          lineHeight: 1.4,
        }}>
          {complete ? '✓ ' : '⚠ '}{hint}
        </div>
      )}
    </div>
  );
}

/* ─── Small dot for inside a tab label ───────────────────────────────── */

export function TabStatusDot({ complete }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: complete ? GREEN : AMBER,
        marginRight: 6,
        verticalAlign: 'middle',
        boxShadow: `0 0 6px ${complete ? 'rgba(16,185,129,0.45)' : 'rgba(245,158,11,0.45)'}`,
      }}
    />
  );
}

/* ─── Dashboard-top "setup completeness" strip ───────────────────────── */

/**
 * @param {Object} props
 * @param {Object} props.statuses — output of getSectionStatuses()
 * @param {string} props.practicePath — e.g. "/v4/practice/<id>" for click-to-jump links
 */
export function DashboardCompletenessStrip({ statuses, practicePath }) {
  if (!statuses) return null;

  // Order matches the natural setup flow + the practice management tab order
  const items = [
    { key: 'details',    tab: 'details',     ...statuses.details },
    { key: 'clinicians', tab: 'clinicians',  ...statuses.clinicians },
    { key: 'teamnet',    tab: 'resources',   ...statuses.teamnet },
    { key: 'demand',     tab: 'demand',      ...statuses.demand },
    { key: 'team',       tab: 'users',       ...statuses.team },
  ];

  const completeCount = items.filter(i => i.complete).length;
  const allComplete = completeCount === items.length;

  // If everything's complete, render nothing — keeps the dashboard clean
  // once setup is fully resolved. The strip is only visible while
  // there's something the user could improve.
  if (allComplete) return null;

  return (
    <div style={{
      padding: '14px 16px',
      marginBottom: 20,
      background: 'rgba(245,158,11,0.06)',
      border: '1px solid rgba(245,158,11,0.18)',
      borderRadius: 10,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ fontSize: 13, color: '#fcd34d', fontWeight: 500 }}>
          Setup completeness — {completeCount} of {items.length} sections ready
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          Amber = something to do · Green = looks good
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        gap: 6,
      }}>
        {items.map((it) => {
          const inner = (
            <div style={{
              padding: '8px 10px',
              background: it.complete ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.10)',
              border: `1px solid ${it.complete ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.30)'}`,
              borderRadius: 6,
              cursor: practicePath ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: it.complete ? '#6ee7b7' : '#fcd34d',
                letterSpacing: 0.3,
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: it.complete ? GREEN : AMBER,
                }} />
                {it.label}
              </div>
              {it.hint && (
                <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.3 }}>
                  {it.hint}
                </div>
              )}
            </div>
          );
          if (!practicePath) return <div key={it.key}>{inner}</div>;
          return (
            <Link
              key={it.key}
              href={`${practicePath}?tab=${it.tab}`}
              style={{ textDecoration: 'none' }}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
