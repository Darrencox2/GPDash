'use client';

// RecentAccuracyCard — at-a-glance "is the model still tracking?" view
// on the practice settings → Demand tab. Fetches the most recent days
// of demand_history (default 30 weekdays), runs the CURRENT predictor
// over them, and renders the same comparison output we show after an
// upload — except labelled as recent-history rather than batch-specific.
//
// Fetches client-side rather than threading through the page load, so
// the tab is responsive even when the underlying table is large. Skips
// rendering if there's no prior calibration (the predictor would just
// fall back to the global Winscombe baseline and the comparison would
// be misleading).

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import DemandComparisonPanel from './DemandComparisonPanel';

export default function RecentAccuracyCard({
  practiceId,
  demandSettings,
  schoolHolidayRanges,
  listSize,
  // How many recent calendar days to pull. We pull a window then filter
  // to weekdays in the panel — so 60 calendar days roughly = ~42 weekdays.
  days = 60,
}) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!practiceId) return;
    if (!demandSettings || typeof demandSettings.baseline !== 'number') return;
    let cancelled = false;
    const supabase = createClient();
    const sinceIso = (() => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString().slice(0, 10);
    })();
    supabase
      .from('demand_history')
      .select('date, request_count')
      .eq('practice_id', practiceId)
      .gte('date', sinceIso)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setErr(error.message); return; }
        setRows((data || []).map(r => ({ date: r.date, count: r.request_count })));
      });
    return () => { cancelled = true; };
  }, [practiceId, days, demandSettings]);

  // Effective school-holiday ranges to feed the predictor. The predictor
  // accepts these via options; the comparison panel passes them through.
  const effectiveHolidays = useMemo(() => {
    if (schoolHolidayRanges) return schoolHolidayRanges;
    return demandSettings?.schoolHolidayRanges || null;
  }, [schoolHolidayRanges, demandSettings]);

  // Skip rendering entirely if there's no prior calibration — the panel
  // would otherwise compare against the hardcoded Winscombe baseline,
  // which gives misleading numbers for a practice that hasn't yet had
  // its own model fitted.
  if (!demandSettings || typeof demandSettings.baseline !== 'number') {
    return null;
  }

  if (err) {
    return (
      <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#fca5a5' }}>
        Couldn&apos;t load recent demand history: {err}
      </div>
    );
  }

  if (rows == null) {
    return (
      <div style={{ padding: 12, color: '#64748b', fontSize: 12 }}>
        Loading recent accuracy…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 12, color: '#94a3b8' }}>
        No demand history in the last {days} days yet.
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 8 }}>
        How the current model has been tracking against your actual demand
        for the last {rows.length} day{rows.length === 1 ? '' : 's'} on file.
        Filtered to weekdays only in the chart.
      </p>
      <DemandComparisonPanel
        uploadedRows={rows}
        settings={demandSettings}
        schoolHolidayRanges={effectiveHolidays}
        listSize={listSize}
        title="Model accuracy — recent history"
        firstTimeMode="hide"
      />
    </div>
  );
}
