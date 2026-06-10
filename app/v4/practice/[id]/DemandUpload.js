'use client';

// DemandUpload — drag-drop CSV upload for demand history.
// Auto-detects which online-consultation tool the file came from
// (AskMyGP, Anima, …), parses with the appropriate parser, upserts
// into demand_history with the right `source` tag, then recalibrates
// the model and writes to practice_settings.demand_settings. All in
// one go.

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { parseDemandFile, SUPPORTED_SOURCES } from '@/lib/demand-parsers';
import { recalibrateDemandModel } from '@/lib/demand-recalibration';
import { getSchoolHolidaysForLEA } from '@/lib/school-holidays-by-lea';
import DemandComparisonPanel from './DemandComparisonPanel';

export default function DemandUpload({ practiceId, demandSettings, history, onUploadSuccess, listSize }) {
  const supabase = createClient();
  const router = useRouter();
  const fileInput = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState(null); // { added, skipped, errors, totalRows, calibration, source }
  const [error, setError] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      // 1. Auto-detect format + parse
      const { source, sourceLabel, parsed } = await parseDemandFile(file);
      if (!source) {
        setError(parsed.errors[0] || 'Could not recognise this file format');
        setBusy(false);
        return;
      }
      if (!parsed.summary || parsed.rows.length === 0) {
        setError(parsed.errors[0] || 'No data rows found in file');
        setBusy(false);
        return;
      }

      // 2. Upsert into demand_history. Schema constraint is
      //    `unique (practice_id, date)` — one row per practice per
      //    date, regardless of source. A re-upload (even from a
      //    different tool) overwrites: the `source` column records
      //    who provided the winning data point. If a practice ever
      //    runs parallel pilots and needs to combine multiple
      //    sources per date, we'd drop the unique constraint and
      //    sum at read-time — not today's problem.
      const records = parsed.rows.map(r => ({
        practice_id: practiceId,
        date: r.date,
        request_count: r.count,
        source,
      }));
      // Chunk to avoid request size limits
      const chunkSize = 500;
      let inserted = 0;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error: upErr } = await supabase
          .from('demand_history')
          .upsert(chunk, { onConflict: 'practice_id,date' });
        if (upErr) throw upErr;
        inserted += chunk.length;
      }

      // 3. Re-fetch ALL demand_history for this practice (across sources) to recalibrate
      const { data: allRows, error: fetchErr } = await supabase
        .from('demand_history')
        .select('date, request_count')
        .eq('practice_id', practiceId)
        .order('date', { ascending: true });
      if (fetchErr) throw fetchErr;

      // 4. Recalibrate
      // Get the practice's LEA holiday ranges from existing demand_settings,
      // or fall back to England-average if not set
      const holidays = (demandSettings?.schoolHolidayRanges)
        ? demandSettings.schoolHolidayRanges
        : getSchoolHolidaysForLEA(demandSettings?.lea).ranges;
      const calibration = recalibrateDemandModel(
        (allRows || []).map(r => ({ date: r.date, count: r.request_count })),
        holidays
      );

      // 5. Save to demand_settings (preserve LEA + holiday ranges from previous)
      const newDemandSettings = {
        ...(demandSettings || {}),
        ...(calibration.sufficient ? {
          baseline: calibration.baseline,
          growthPerDay: calibration.growthPerDay,
          referenceDate: calibration.referenceDate,
          dowEffects: calibration.dowEffects,
          monthEffects: calibration.monthEffects,
          monthEffectsAvailable: calibration.monthEffectsAvailable,
          sampleSize: calibration.sampleSize,
          spanDays: calibration.spanDays,
          lastCalibratedAt: new Date().toISOString(),
        } : {
          insufficientData: true,
          sampleSize: calibration.sampleSize,
          lastUploadAt: new Date().toISOString(),
        }),
      };

      // We use upsert here too because practice_settings might not have a
      // row yet for new practices
      const { error: settingsErr } = await supabase
        .from('practice_settings')
        .upsert(
          { practice_id: practiceId, demand_settings: newDemandSettings },
          { onConflict: 'practice_id' }
        );
      if (settingsErr) throw settingsErr;

      // Snapshot of pre-upload settings for the comparison panel.
      // We need this BEFORE the upsert + recalibration overwrites
      // demand_settings, so the comparison answers the honest question
      // "how well did your existing model predict this new batch?"
      // rather than the incestuous "how well does the new model
      // (re-fit to include this batch) fit the batch it was just fit
      // to?". Captured here as a plain copy.
      const preUploadSettings = demandSettings ? { ...demandSettings } : null;

      setResult({
        rowsInFile: parsed.rows.length,
        rowsTotal: (allRows || []).length,
        earliest: parsed.summary.earliest,
        latest: parsed.summary.latest,
        parseErrors: parsed.errors,
        calibration,
        source,
        sourceLabel,
        // Anima parser also returns proxyEvents / directEvents for
        // info — surface them when present so users can see the mix.
        totalEvents: parsed.summary.totalEvents,
        proxyEvents: parsed.summary.proxyEvents,
        directEvents: parsed.summary.directEvents,
        // For the comparison panel
        uploadedRows: parsed.rows,
        preUploadSettings,
        schoolHolidayRanges: holidays,
      });
      // Tell the wizard (or any other parent that cares) we just uploaded
      // demand data — so it can flip its "step done" indicator without
      // waiting for a page refresh. No-op for the standard practice
      // management page since it doesn't pass this prop.
      onUploadSuccess?.();
      router.refresh();
    } catch (e) {
      setError(e?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      {/* Existing data summary */}
      {history && history.length > 0 && (
        <div style={{ padding: 10, background: 'var(--g-tile-2)', border: '1px solid var(--g-border)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--g-text-mid)', marginBottom: 12 }}>
          <strong style={{ color: 'var(--g-text-hi)' }}>Already uploaded:</strong>{' '}
          {history.length} day{history.length === 1 ? '' : 's'} of data
          {history[0]?.earliest_date && (
            <> · {formatDate(history[0].earliest_date)} → {formatDate(history[0].latest_date)}</>
          )}
          {history.length > 1 && <> · sources: {history.map(h => h.source).join(', ')}</>}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileInput.current?.click()}
        style={{
          padding: 24,
          background: drag ? 'rgba(34,211,238,0.08)' : 'rgba(0,0,0,0.2)',
          border: `2px dashed ${drag ? 'rgba(34,211,238,0.5)' : 'var(--g-line)'}`,
          borderRadius: 'var(--r-md)',
          textAlign: 'center',
          cursor: 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--g-text-hi)', marginBottom: 4 }}>
          {busy ? 'Uploading and recalibrating…' : 'Drop CSV here or click to browse'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--g-text-mid)' }}>
          Supports: {SUPPORTED_SOURCES.map(s => s.label).join(' · ')}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,text/csv"
          onChange={(e) => handleFile(e.target.files?.[0])}
          style={{ display: 'none' }}
        />
      </div>

      {/* Results */}
      {error && (
        <div style={{ marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 'var(--r-md)', fontSize: 12 }}>
          {error}
        </div>
      )}
      {result && !error && (
        <div style={{ marginTop: 12, padding: 14, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--g-text-hi)' }}>
          <div style={{ color: '#34d399', fontWeight: 600, marginBottom: 6 }}>
            ✓ Uploaded
            {result.sourceLabel && (
              <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--g-text-mid)', fontSize: 11 }}>
                detected as {result.sourceLabel}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 4, marginBottom: 8 }}>
            <span style={{ color: 'var(--g-text-mid)' }}>Days in this file</span><span>{result.rowsInFile.toLocaleString()}</span>
            <span style={{ color: 'var(--g-text-mid)' }}>Date range</span><span>{formatDate(result.earliest)} → {formatDate(result.latest)}</span>
            <span style={{ color: 'var(--g-text-mid)' }}>Total days on file</span><span>{result.rowsTotal.toLocaleString()}</span>
            {result.totalEvents != null && (
              <>
                <span style={{ color: 'var(--g-text-mid)' }}>Submissions</span>
                <span>
                  {result.totalEvents.toLocaleString()} total
                  {result.proxyEvents != null && result.directEvents != null && (
                    <span style={{ color: 'var(--g-text-mid)' }}>
                      {' '}— {result.directEvents.toLocaleString()} direct + {result.proxyEvents.toLocaleString()} via staff
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
          {result.calibration?.sufficient ? (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--g-border)' }}>
              <div style={{ color: '#67e8f9', fontWeight: 500, marginBottom: 6 }}>Calibration applied</div>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 4 }}>
                <span style={{ color: 'var(--g-text-mid)' }}>Baseline</span><span>{result.calibration.baseline} requests/day</span>
                <span style={{ color: 'var(--g-text-mid)' }}>Growth</span><span>{(result.calibration.growthPerDay * 365).toFixed(1)} requests/year</span>
                <span style={{ color: 'var(--g-text-mid)' }}>Day-of-week effects</span>
                <span>Mon {fmt(result.calibration.dowEffects[0])} · Tue {fmt(result.calibration.dowEffects[1])} · Wed {fmt(result.calibration.dowEffects[2])} · Thu {fmt(result.calibration.dowEffects[3])} · Fri {fmt(result.calibration.dowEffects[4])}</span>
                <span style={{ color: 'var(--g-text-mid)' }}>Seasonal effects</span>
                <span>{result.calibration.monthEffectsAvailable
                  ? '✓ Fitted (≥9 months data)'
                  : `Not yet (need ≥9 months — have ${(result.calibration.spanDays / 30).toFixed(0)} months)`}</span>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--g-border)', color: '#fcd34d' }}>
              Not enough data to calibrate yet — keep uploading. ({result.calibration?.reason})
            </div>
          )}
          {result.parseErrors.length > 0 && (
            <details style={{ marginTop: 8, fontSize: 11, color: 'var(--g-text-mid)' }}>
              <summary style={{ cursor: 'pointer' }}>{result.parseErrors.length} parse warning(s)</summary>
              <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                {result.parseErrors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                {result.parseErrors.length > 10 && <li>… and {result.parseErrors.length - 10} more</li>}
              </ul>
            </details>
          )}

          {/* Predict-vs-actual comparison using the pre-upload model.
              Skips itself silently on first-ever upload (no prior model
              to compare against) — DemandComparisonPanel renders an
              explanatory message in that case. */}
          <DemandComparisonPanel
            uploadedRows={result.uploadedRows}
            preUploadSettings={result.preUploadSettings}
            schoolHolidayRanges={result.schoolHolidayRanges}
            listSize={listSize}
          />
        </div>
      )}
    </div>
  );
}

function fmt(n) {
  if (n == null) return '—';
  return n > 0 ? `+${n}` : String(n);
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}
