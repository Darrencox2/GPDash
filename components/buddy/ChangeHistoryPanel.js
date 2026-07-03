'use client';
// Change history for buddy cover + rota edits. Reads data.changeLog
// (written by DashboardClient's withChange) and lets editors revert an
// entry. Reverts go through the normal edit paths, so they are logged
// as new entries themselves — the trail is never rewritten.
import SidePanel from '@/components/huddle/SidePanel';
import { Button, EmptyState } from '@/components/ui';

const STATUS_LABEL = { present: 'Present', dayoff: 'Day off', absent: 'Absent' };

function describe(e) {
  if (e.type === 'status') {
    return {
      main: `${e.clinician} — ${STATUS_LABEL[e.from] || e.from} → ${STATUS_LABEL[e.to] || e.to}`,
      sub: `${e.day}${e.dateKey ? ` ${new Date(e.dateKey).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''} attendance`,
    };
  }
  if (e.type === 'rota') {
    return {
      main: `${e.clinician} — ${e.to === 'working' ? 'added to' : 'removed from'} ${e.day}`,
      sub: 'Standing weekly pattern',
    };
  }
  return { main: 'Change', sub: '' };
}

export default function ChangeHistoryPanel({ open, onClose, changeLog, canEdit, onRevert }) {
  const entries = Array.isArray(changeLog) ? changeLog : [];
  return (
    <SidePanel open={open} onClose={onClose} title="Change history" subtitle="Cover and rota edits — newest first" accent="#8b5cf6">
      {entries.length === 0 ? (
        <EmptyState compact icon="🕐" title="No changes recorded yet" description="Attendance and rota edits will appear here with who made them and when, and can be reverted." />
      ) : (
        <div className="px-3 py-2">
          {entries.map((e, i) => {
            const d = describe(e);
            return (
              <div key={`${e.ts}-${i}`} className="flex items-start justify-between gap-2 py-2.5 px-2" style={{ borderBottom: '1px solid var(--g-border)' }}>
                <div className="min-w-0">
                  <div className="text-body-sm font-medium text-hi">{d.main}</div>
                  <div className="text-meta text-mid mt-0.5">
                    {d.sub} · {e.who || 'Unknown'} · {new Date(e.ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {canEdit && onRevert && (
                  <Button size="xs" variant="secondary" onClick={() => onRevert(e)} title="Apply the opposite change through the normal edit path">Revert</Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SidePanel>
  );
}
