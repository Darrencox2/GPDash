'use client';

// NhsDataUploader — file picker + month selector + upload progress for
// monthly NHS OC submissions data. Sends multipart form-data to
// /api/admin/upload-nhs-oc-baseline.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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

    const formData = new FormData();
    formData.append('month', `${month}-01`); // YYYY-MM-01
    for (const f of files) formData.append('csv', f);

    try {
      const res = await fetch('/api/admin/upload-nhs-oc-baseline', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
        setResult(data);
      } else {
        setResult(data);
        setFiles([]);
        // Refresh the parent to show the newly-added month
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
      borderRadius: 12,
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1', marginBottom: 12 }}>
        Upload a new month
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, marginBottom: 14 }}>
        Download the ZIP from NHS Digital, extract the two CSVs (one for north,
        one for south regions), and select them below. Existing data for the
        same month will be replaced.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
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
          <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
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
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              {files.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`).join(' · ')}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            padding: 10,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            fontSize: 12,
            color: '#fca5a5',
          }}>{error}</div>
        )}

        {result?.success && (
          <div style={{
            padding: 10,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 6,
            fontSize: 12,
            color: '#6ee7b7',
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
            color: '#22d3ee',
            borderRadius: 8,
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
  borderRadius: 6,
  color: '#e2e8f0',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
};
