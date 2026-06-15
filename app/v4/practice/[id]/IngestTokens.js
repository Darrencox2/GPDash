'use client';

import { useState, useEffect, useCallback } from 'react';

// Manage tokens for automated demand-CSV import (Power Automate).
// Tokens are leadership-only and shown in full exactly once at creation.
export default function IngestTokens({ practiceId }) {
  const [tokens, setTokens] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('Power Automate');
  const [freshToken, setFreshToken] = useState(null); // { token, label } shown once
  const [copied, setCopied] = useState(false);

  const endpointUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v4/ingest/demand`
    : '/api/v4/ingest/demand';

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/v4/ingest/tokens?practice=${encodeURIComponent(practiceId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not load tokens');
      setTokens(data.tokens || []);
    } catch (e) { setError(e.message); setTokens([]); }
  }, [practiceId]);

  useEffect(() => { load(); }, [load]);

  const createToken = async () => {
    setCreating(true); setError(''); setFreshToken(null);
    try {
      const res = await fetch('/api/v4/ingest/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ practice_id: practiceId, label: label.trim() || 'Power Automate' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not create token');
      setFreshToken({ token: data.token, label: data.label });
      load();
    } catch (e) { setError(e.message); }
    setCreating(false);
  };

  const revoke = async (id) => {
    try {
      const res = await fetch(`/api/v4/ingest/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error || 'Could not revoke'); }
      load();
    } catch (e) { setError(e.message); }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ }
  };

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--g-text-hi)', margin: '0 0 4px' }}>Automated import</h3>
      <p style={{ fontSize: 13, color: 'var(--g-text-mid)', margin: '0 0 14px', maxWidth: 620 }}>
        Create a token so an automation (such as Power Automate) can send your demand CSV
        to GPDash automatically. The token is shown once — copy it somewhere safe.
        Re-importing a date replaces that day, so running it daily is safe.
      </p>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 13 }}>{error}</div>
      )}

      {/* Freshly created token — shown once */}
      {freshToken && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6ee7b7', marginBottom: 8 }}>
            Token created — copy it now, you will not see it again
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: 1, minWidth: 240, fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)', background: 'var(--g-field)', border: '1px solid var(--g-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--g-text-hi)', wordBreak: 'break-all' }}>
              {freshToken.token}
            </code>
            <button onClick={() => copy(freshToken.token)} style={primaryBtn}>{copied ? 'Copied' : 'Copy token'}</button>
          </div>
        </div>
      )}

      {/* Create */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--g-text-mid)', marginBottom: 5 }}>Token label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Power Automate" style={inputStyle} />
        </div>
        <button onClick={createToken} disabled={creating} style={primaryBtn}>{creating ? 'Creating…' : 'Create token'}</button>
      </div>

      {/* Endpoint reference */}
      <div style={{ marginBottom: 18, padding: 12, borderRadius: 8, background: 'var(--g-tile)', border: '1px solid var(--g-border)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-text-mid)', marginBottom: 6 }}>Send the CSV to this URL (HTTP POST)</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ flex: 1, minWidth: 240, fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)', color: 'var(--g-text-hi)', wordBreak: 'break-all' }}>{endpointUrl}</code>
          <button onClick={() => copy(endpointUrl)} style={ghostBtn}>Copy URL</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--g-text-mid)', marginTop: 8, lineHeight: 1.5 }}>
          Header <code style={codeInline}>X-Ingest-Token: your-token</code> · Body: the raw CSV file content ·
          Content-Type <code style={codeInline}>text/csv</code>
        </div>
      </div>

      {/* Existing tokens */}
      {tokens === null && <div style={{ fontSize: 13, color: 'var(--g-text-mid)' }}>Loading…</div>}
      {tokens && tokens.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--g-text-mid)' }}>No tokens yet.</div>
      )}
      {tokens && tokens.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tokens.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--g-card)', border: '1px solid var(--g-border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--g-text-hi)' }}>
                  {t.label || 'Token'} {!t.enabled && <span style={{ color: '#fca5a5', fontWeight: 400 }}>(disabled)</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--g-text-mid)', marginTop: 2 }}>
                  {t.last_used_at
                    ? `Last used ${new Date(t.last_used_at).toLocaleString('en-GB')}${t.last_used_count != null ? ` · ${t.last_used_count} rows` : ''}`
                    : 'Never used'}
                </div>
              </div>
              <button onClick={() => revoke(t.id)} style={{ ...ghostBtn, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}>Revoke</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: '8px 11px', borderRadius: 8, fontSize: 14, background: 'var(--g-field)', border: '1px solid var(--g-border)', color: 'var(--g-text-hi)', minWidth: 200 };
const primaryBtn = { padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
const ghostBtn = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--g-border)', background: 'transparent', color: 'var(--g-text-mid)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const codeInline = { fontSize: 11.5, fontFamily: 'var(--font-mono, monospace)', background: 'var(--g-field)', padding: '1px 5px', borderRadius: 4, color: 'var(--g-text-hi)' };
