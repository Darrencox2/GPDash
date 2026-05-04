'use client';

// DemandUpload — drag-drop CSV upload for AskMyGP demand history.
// Parses, upserts into demand_history, then recalibrates the model and
// writes to practice_settings.demand_settings. All in one go.

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { parseAskMyGpCSV, readAskMyGpFile } from '@/lib/demand-parsers/askmygp';
import { recalibrateDemandModel } from '@/lib/demand-recalibration';
import { getSchoolHolidaysForLEA } from '@/lib/school-holidays-by-lea';

export default function DemandUpload({ practiceId, onlineConsultTool, demandSettings, history }) {
  const supabase = createClient();
  const router = useRouter();
  const fileInput = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState(null); // { added, skipped, errors, totalRows, calibration }
  const [error, setError] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      // 1. Parse
      const text = await readAskMyGpFile(file);
      const parsed = parseAskMyGpCSV(text);
      if (!parsed.summary || parsed.rows.length === 0) {
        setError(parsed.errors[0] || 'No data rows found in file');
        setBusy(false);
        return;
      }

      // 2. Upsert into demand_history (one row per date, last write wins)
      // Supabase handles upsert via .upsert() with onConflict
      const records = parsed.rows.map(r => ({
        practice_id: practiceId,
        date: r.date,
        request_count: r.count,
        source: 'askmygp',
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

      setResult({
        rowsInFile: parsed.rows.length,
        rowsTotal: (allRows || []).length,
        earliest: parsed.summary.earliest,
        latest: parsed.summary.latest,
        parseErrors: parsed.errors,
        calibration,
      });
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

  const showAskMyGpFlow = onlineConsultTool === 'askmygp' || !onlineConsultTool;

  return (
    <div>
      {!showAskMyGpFlow && (
        <div style={{ padding: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, color: '#fcd34d', fontSize: 12, marginBottom: 12 }}>
          Your practice is configured to use <strong>{onlineConsultTool}</strong> for online consultations.
          A parser for that tool isn't available yet — for now you can still upload AskMyGP-format CSVs below
          and we'll combine the data.
        </div>
      )}

      {/* Existing data summary */}
      {history && history.length > 0 && (
        <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
          <strong style={{ color: '#cbd5e1' }}>Already uploaded:</strong>{' '}
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
          border: `2px dashed ${drag ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 10,
          textAlign: 'center',
          cursor: 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>
          {busy ? 'Uploading and recalibrating…' : 'Drop CSV here or click to browse'}
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          AskMyGP "Crosstab — Demand data" export (UTF-16 tab-separated)
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
        <div style={{ marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 8, fontSize: 12 }}>
          {error}
        </div>
      )}
      {result && !error && (
        <div style={{ marginTop: 12, padding: 14, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, fontSize: 12, color: '#cbd5e1' }}>
          <div style={{ color: '#34d399', fontWeight: 600, marginBottom: 6 }}>✓ Uploaded</div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 4, marginBottom: 8 }}>
            <span style={{ color: '#64748b' }}>Days in this file</span><span>{result.rowsInFile.toLocaleString()}</span>
            <span style={{ color: '#64748b' }}>Date range</span><span>{formatDate(result.earliest)} → {formatDate(result.latest)}</span>
            <span style={{ color: '#64748b' }}>Total days on file</span><span>{result.rowsTotal.toLocaleString()}</span>
          </div>
          {result.calibration?.sufficient ? (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ color: '#67e8f9', fontWeight: 500, marginBottom: 6 }}>Calibration applied</div>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 4 }}>
                <span style={{ color: '#64748b' }}>Baseline</span><span>{result.calibration.baseline} requests/day</span>
                <span style={{ color: '#64748b' }}>Growth</span><span>{(result.calibration.growthPerDay * 365).toFixed(1)} requests/year</span>
                <span style={{ color: '#64748b' }}>Day-of-week effects</span>
                <span>Mon {fmt(result.calibration.dowEffects[0])} · Tue {fmt(result.calibration.dowEffects[1])} · Wed {fmt(result.calibration.dowEffects[2])} · Thu {fmt(result.calibration.dowEffects[3])} · Fri {fmt(result.calibration.dowEffects[4])}</span>
                <span style={{ color: '#64748b' }}>Seasonal effects</span>
                <span>{result.calibration.monthEffectsAvailable
                  ? '✓ Fitted (≥9 months data)'
                  : `Not yet (need ≥9 months — have ${(result.calibration.spanDays / 30).toFixed(0)} months)`}</span>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', color: '#fcd34d' }}>
              Not enough data to calibrate yet — keep uploading. ({result.calibration?.reason})
            </div>
          )}
          {result.parseErrors.length > 0 && (
            <details style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
              <summary style={{ cursor: 'pointer' }}>{result.parseErrors.length} parse warning(s)</summary>
              <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                {result.parseErrors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                {result.parseErrors.length > 10 && <li>… and {result.parseErrors.length - 10} more</li>}
              </ul>
            </details>
          )}
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
