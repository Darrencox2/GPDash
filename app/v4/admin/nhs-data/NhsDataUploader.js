'use client';

// NhsDataUploader — file picker + month selector + upload progress for
// monthly NHS OC submissions data. Sends multipart form-data to
// /api/admin/upload-nhs-oc-baseline.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseNhsOcBaseline } from '@/lib/nhs-oc-ingest';

export default function NhsDataUploader() {
  const router = useRouter();
  const [month, setMonth] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function handleFileChange(e) {
    const fileList = Array.from(e.target.files || []);
    setFiles(fileList);
    setError('');
    setResult(null);
  }

  async function handleUpload() {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      setError('Please pick a month');
      return;
    }
    if (files.length === 0) {
      setError('Please attach at least one CSV file');
      return;
    }
    setUploading(true);
    setError('');
    setResult(null);

    // Parse the (potentially very large) CSV files in the browser and send
    // only the compact aggregated rows as JSON. This avoids hitting the
    // serverless request-body limit (~4.5MB), which previously returned a
    // plain-text "Request Entity Too Large" page that broke JSON parsing.
    let payload;
    try {
      const texts = [];
      for (const f of files) texts.push(await f.text());
      const { rows, totalRowsParsed } = parseNhsOcBaseline(`${month}-01`, texts);
      if (!rows || rows.length === 0) {
        setError('Those files contained no parseable rows. Check you uploaded the NHS OC submissions CSV(s).');
        setUploading(false);
        return;
      }
      payload = { month: `${month}-01`, rows, totalRowsParsed };
    } catch (e) {
      setError(`Could not read the CSV file(s): ${e.message}`);
      setUploading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/upload-nhs-oc-baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Guard against non-JSON responses (e.g. a platform 413/502 HTML page)
      // so we show a clear message instead of a JSON-parse error.
      const ct = res.headers.get('content-type') || '';
      let data = null;
      if (ct.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (!res.ok) {
          setError(res.status === 413
            ? 'The upload was too large for the server. This should not happen now files are parsed in your browser — please report it.'
            : `Upload failed (${res.status}). ${text.slice(0, 120)}`);
          setUploading(false);
          return;
        }
      }
      if (!res.ok) {
        setError((data && (data.message || data.error)) || 'Upload failed');
        setResult(data);
      } else {
        setResult(data);
        setFiles([]);
        router.refresh();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{
      padding: 16,
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 'var(--r-lg)',
    }}>
      <div className="text-body-sm font-medium text-slate-300 mb-3">
        Upload a new month
      </div>
      <p className="text-caption text-slate-400 leading-normal mb-3.5">
        Download the ZIP from NHS Digital, extract the two CSVs (one for north,
        one for south regions), and select them below. Existing data for the
        same month will be replaced.
      </p>

      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-caption text-slate-400 mb-1">
            Month covered
          </label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={input}
          />
        </div>

        <div>
          <label className="block text-caption text-slate-400 mb-1">
            CSV file(s) — select both region files at once
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={handleFileChange}
            style={{ ...input, padding: 6 }}
          />
          {files.length > 0 && (
            <div className="text-caption text-slate-400 mt-1.5">
              {files.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`).join(' · ')}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            padding: 10,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color: 'var(--c-red)',
          }}>{error}</div>
        )}

        {result?.success && (
          <div style={{
            padding: 10,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color: 'var(--c-mint)',
            lineHeight: 1.5,
          }}>
            ✓ Uploaded {result.practicesUpserted.toLocaleString()} practices for
            {' '}{result.monthIso?.slice(0, 7)} ({result.totalRowsParsed.toLocaleString()} CSV
            rows parsed in {result.parseElapsedMs}ms).
          </div>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || files.length === 0 || !month}
          style={{
            padding: '10px 16px',
            background: uploading ? 'rgba(34,211,238,0.05)' : 'rgba(34,211,238,0.15)',
            border: '1px solid rgba(34,211,238,0.4)',
            color: 'var(--c-cyan-3)',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            fontWeight: 500,
            cursor: uploading || files.length === 0 || !month ? 'not-allowed' : 'pointer',
            opacity: uploading || files.length === 0 || !month ? 0.5 : 1,
          }}
        >
          {uploading ? 'Uploading & processing…' : 'Upload and process'}
        </button>
      </div>
    </div>
  );
}

const input = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--g-text-hi)',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
};
