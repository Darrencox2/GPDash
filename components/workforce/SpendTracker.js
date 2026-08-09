'use client';
// Locum spend tracker.
//
// Month-on-month locum spend from two sources: actual locums (sessions x
// per-locum rate) and regular GPs doing confirmed extra sessions (review
// queue - the human confirms or denies each candidate; a swap is not an
// extra). Session detection uses the three-zone M/A/E model in lib/spend.js
// with deliberate buffer gaps so duty overlaps never misclassify.
//
// Rates: per-locum, plus a practice-wide default for GP extras with
// optional per-GP overrides. Monthly totals are live - the review queue is
// the human control, so months need no separate sign-off.

import { useMemo, useState } from 'react';
import { PageHeader, EmptyState } from '@/components/ui';
import { canEditPracticeData } from '@/lib/permissions';
import { logEvent } from '@/lib/data';
import {
  findCandidateExtras, computeMonthlySpend, availableMonths,
  isLocum, SLOT_LABELS,
} from '@/lib/spend';

const gbp = (n) => `\u00a3${(Number(n) || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
const monthLabel = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

export default function SpendTracker({ data, saveData, huddleData }) {
  const canEdit = canEditPracticeData(data);
  const months = useMemo(() => availableMonths(huddleData), [huddleData]);
  const [month, setMonth] = useState(months[0]);
  const [showRates, setShowRates] = useState(false);

  const rates = data?.spendRates || {};
  const clinicians = Array.isArray(data?.clinicians) ? data.clinicians : [];
  const locums = clinicians.filter((c) => c.status !== 'left' && isLocum(c));

  const candidates = useMemo(
    () => (huddleData ? findCandidateExtras({ huddleData, data }) : []),
    [huddleData, data]
  );
  const spend = useMemo(
    () => (huddleData && month ? computeMonthlySpend({ huddleData, data, month }) : null),
    [huddleData, data, month]
  );

  const decide = (cand, verdict) => {
    if (!canEdit) return;
    const decisions = { ...(data.spendDecisions || {}) };
    decisions[cand.key] = {
      verdict, // 'extra' | 'not'
      name: cand.name,
      slotLabel: cand.slotLabel,
      date: cand.date,
      by: data?._v4?.userDisplayName || null,
      at: new Date().toISOString(),
    };
    const next = { ...data, spendDecisions: decisions };
    saveData(logEvent(next, 'settings',
      `Locum spend: ${cand.name} ${cand.slotLabel.toLowerCase()} session on ${cand.date} marked ${verdict === 'extra' ? 'as a PAID EXTRA' : 'as NOT an extra (e.g. a swap)'}`));
  };

  // Undo a decision - the candidate returns to the review queue. Audited.
  const undoDecision = (key) => {
    if (!canEdit) return;
    const decisions = { ...(data.spendDecisions || {}) };
    const dec = decisions[key];
    if (!dec) return;
    delete decisions[key];
    const next = { ...data, spendDecisions: decisions };
    saveData(logEvent(next, 'settings',
      `Locum spend: decision UNDONE for ${dec.name || key} (${dec.date || ''} ${dec.slotLabel || ''}) - back in the review queue`));
  };

  const setRate = (path, id, value) => {
    if (!canEdit) return;
    const next = { ...(data.spendRates || {}) };
    if (path === 'gpExtraDefault') {
      next.gpExtraDefault = Number(value) || 0;
    } else {
      next[path] = { ...(next[path] || {}) };
      const n = Number(value);
      if (!n) delete next[path][id];
      else next[path][id] = n;
    }
    const who = path === 'gpExtraDefault' ? 'practice-wide GP extra default'
      : `${(clinicians.find((c) => c.id === id) || {}).name || id} (${path === 'locums' ? 'locum' : 'GP extra'})`;
    saveData(logEvent({ ...data, spendRates: next }, 'settings',
      `Locum spend: session rate for ${who} set to £${Number(value) || 0}`));
  };

  if (!huddleData?.dates?.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Locum spend" subtitle="Month-on-month spend on locums and extra GP sessions" />
        <EmptyState title="No EMIS data" description="Upload a CSV on the Today page first - spend is calculated from EMIS sessions." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Locum spend" subtitle="Month-on-month spend on locums and extra GP sessions">
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="rounded-md px-2 py-1.5 text-sm"
            style={{ background: 'var(--g-tile)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0' }}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          {canEdit && (
            <button onClick={() => setShowRates((v) => !v)}
              className="px-3 py-1.5 rounded-md text-sm font-medium"
              style={{ background: showRates ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: showRates ? '#a5b4fc' : '#94a3b8' }}>
              Rates
            </button>
          )}
        </div>
      </PageHeader>

      {/* Totals */}
      {spend && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: 'Locum sessions', value: spend.locumTotal, sub: `${spend.locumLines.reduce((s, l) => s + l.sessions, 0)} sessions` },
            { label: 'GP extra sessions', value: spend.extraTotal, sub: `${spend.extraLines.length} confirmed` },
            { label: `Total - ${monthLabel(month)}`, value: spend.grandTotal, sub: 'locums + confirmed extras', big: true },
          ].map((t) => (
            <div key={t.label} className="rounded-xl p-4" style={{ background: 'var(--g-panel)', border: `1px solid ${t.big ? '#f59e0b50' : 'rgba(255,255,255,0.08)'}` }}>
              <div className="text-xs text-slate-500">{t.label}</div>
              <div className="text-2xl font-bold font-mono-data mt-1" style={{ color: t.big ? '#fbbf24' : '#e2e8f0' }}>{gbp(t.value)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{t.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Rates editor */}
      {showRates && canEdit && (
        <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--g-panel)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-sm font-semibold text-slate-200">Session rates</div>
          <div className="space-y-2">
            <div className="text-xs text-slate-500">Locums (per session)</div>
            {locums.length === 0 && <div className="text-xs text-slate-600">No locums on the staff register (role containing Locum).</div>}
            {locums.map((lc) => (
              <div key={lc.id} className="flex items-center gap-3">
                <span className="text-sm text-slate-300 flex-1 truncate">{lc.name}</span>
                <span className="text-xs text-slate-500">\u00a3</span>
                <input type="number" min="0" defaultValue={rates.locums?.[lc.id] || ''}
                  onBlur={(e) => setRate('locums', lc.id, e.target.value)}
                  className="w-24 rounded-md px-2 py-1 text-sm text-right font-mono-data"
                  style={{ background: 'var(--g-tile)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0' }} />
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-xs text-slate-500">GP extra sessions - default rate (per session)</div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-300 flex-1">Practice-wide default</span>
              <span className="text-xs text-slate-500">\u00a3</span>
              <input type="number" min="0" defaultValue={rates.gpExtraDefault || ''}
                onBlur={(e) => setRate('gpExtraDefault', null, e.target.value)}
                className="w-24 rounded-md px-2 py-1 text-sm text-right font-mono-data"
                style={{ background: 'var(--g-tile)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0' }} />
            </div>
            <div className="text-[11px] text-slate-600">Used for every confirmed extra unless a GP has their own rate below.</div>
            {clinicians.filter((c) => (rates.gpExtra || {})[c.id] || spend?.extraLines.some((l) => l.id === c.id)).map((gp) => (
              <div key={gp.id} className="flex items-center gap-3">
                <span className="text-sm text-slate-300 flex-1 truncate">{gp.name}</span>
                <span className="text-xs text-slate-500">\u00a3</span>
                <input type="number" min="0" defaultValue={rates.gpExtra?.[gp.id] || ''}
                  placeholder="default"
                  onBlur={(e) => setRate('gpExtra', gp.id, e.target.value)}
                  className="w-24 rounded-md px-2 py-1 text-sm text-right font-mono-data"
                  style={{ background: 'var(--g-tile)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review queue */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--g-panel)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-sm font-semibold text-slate-200">Review queue</span>
          <span className="text-xs text-slate-500">sessions outside a GP's usual pattern - confirm or deny each one</span>
          {candidates.length > 0 && (
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f59e0b25', border: '1px solid #f59e0b50', color: '#fbbf24' }}>{candidates.length}</span>
          )}
        </div>
        {candidates.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">Nothing to review - no sessions outside anyone's usual pattern.</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {candidates.slice(0, 30).map((c) => (
              <div key={c.key} className="px-4 py-3 flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <div className="text-sm font-medium text-slate-200">
                    {c.name} - {c.slotLabel.toLowerCase()} session, {new Date(c.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Usual {c.dayName}: {c.expectedThatDay.length ? c.expectedThatDay.map((s) => SLOT_LABELS[s].toLowerCase()).join(' + ') : 'not normally in'}.
                    {' '}This week: {c.weekTotal} sessions vs usual {c.expectedWeekly}.
                  </div>
                  <div className="text-xs mt-1 font-medium" style={{ color: c.likelySwap ? '#60a5fa' : '#fbbf24' }}>
                    {c.likelySwap
                      ? 'Weekly total matches their normal - probably a swap, not a paid extra.'
                      : 'Weekly total is above their normal - looks like a genuine extra.'}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => decide(c, 'extra')}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold"
                      style={{ background: '#f59e0b25', border: '1px solid #f59e0b60', color: '#fbbf24' }}>
                      Yes - paid extra
                    </button>
                    <button onClick={() => decide(c, 'not')}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8' }}>
                      No - not an extra
                    </button>
                  </div>
                )}
              </div>
            ))}
            {candidates.length > 30 && (
              <div className="px-4 py-2 text-[11px] text-slate-600">Showing the 30 most recent - decide these and older ones will surface.</div>
            )}
          </div>
        )}
      </div>

      {/* Recent decisions - undo lives here so errors are recoverable */}
      {(() => {
        const recent = Object.entries(data?.spendDecisions || {})
          .map(([key, d]) => ({ key, ...d }))
          .sort((a, b) => (a.at < b.at ? 1 : -1))
          .slice(0, 12);
        if (!recent.length) return null;
        return (
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--g-panel)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-sm font-semibold text-slate-200">Recent decisions</span>
              <span className="text-xs text-slate-500">undo returns a session to the review queue</span>
            </div>
            {recent.map((d) => (
              <div key={d.key} className="px-4 py-2 flex items-center gap-3 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="flex-1 text-slate-300 truncate">
                  {d.name || d.key} - {d.date || ''} {String(d.slotLabel || '').toLowerCase()}
                </span>
                <span className="text-xs font-semibold" style={{ color: d.verdict === 'extra' ? '#fbbf24' : '#94a3b8' }}>
                  {d.verdict === 'extra' ? 'Paid extra' : 'Not an extra'}
                </span>
                {d.by && <span className="text-[11px] text-slate-600">by {d.by}</span>}
                {canEdit && (
                  <button onClick={() => undoDecision(d.key)}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8' }}>
                    Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Month detail */}
      {spend && (spend.locumLines.length > 0 || spend.extraLines.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--g-panel)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-4 py-3 text-sm font-semibold text-slate-200" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Locums - {monthLabel(month)}</div>
            {spend.locumLines.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">No locum sessions this month.</div>
            ) : spend.locumLines.map((l) => (
              <div key={l.id} className="px-4 py-2.5 flex items-center gap-3 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="flex-1 text-slate-300 truncate">{l.name}</span>
                <span className="text-xs text-slate-500">{l.sessions} x {l.rateMissing ? 'no rate set' : gbp(l.rate)}</span>
                <span className="font-mono-data font-semibold" style={{ color: l.rateMissing ? '#f87171' : '#e2e8f0' }}>{gbp(l.total)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--g-panel)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-4 py-3 text-sm font-semibold text-slate-200" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Confirmed GP extras - {monthLabel(month)}</div>
            {spend.extraLines.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">No confirmed extras this month.</div>
            ) : spend.extraLines.map((l) => (
              <div key={`${l.id}-${l.date}-${l.slot}`} className="px-4 py-2.5 flex items-center gap-3 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="flex-1 text-slate-300 truncate">{l.name}</span>
                <span className="text-xs text-slate-500">{new Date(l.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {l.slotLabel.toLowerCase()}{l.rateMissing ? ' - no rate set' : ''}</span>
                <span className="font-mono-data font-semibold" style={{ color: l.rateMissing ? '#f87171' : '#e2e8f0' }}>{gbp(l.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
