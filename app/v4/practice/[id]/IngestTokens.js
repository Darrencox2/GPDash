'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui';

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
    <div className="mt-7">
      <h3 className="text-subhead font-semibold text-hi m-0 mb-1">Automated import</h3>
      <p className="text-body-sm text-mid mt-0 mb-3.5 max-w-[620px]">
        Create a token so an automation (such as Power Automate) can send your demand CSV
        to GPDash automatically. The token is shown once — copy it somewhere safe.
        Re-importing a date replaces that day, so running it daily is safe.
      </p>

      {error && (
        <div className="mb-3 px-3.5 py-2.5 rounded-lg text-body-sm" style={statusError}>{error}</div>
      )}

      {/* Freshly created token — shown once */}
      {freshToken && (
        <div className="mb-4 p-3.5 rounded-xl" style={statusSuccess}>
          <div className="text-body-sm font-semibold mb-2" style={{ color: '#6ee7b7' }}>
            Token created — copy it now, you will not see it again
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <code className="flex-1 min-w-[240px] text-body-sm font-mono bg-field border border-edge rounded-md px-2.5 py-2 text-hi break-all">
              {freshToken.token}
            </code>
            <Button size="sm" onClick={() => copy(freshToken.token)}>{copied ? 'Copied' : 'Copy token'}</Button>
          </div>
        </div>
      )}

      {/* Create */}
      <div className="flex gap-2 items-end flex-wrap mb-4">
        <div>
          <label className="block text-body-sm font-semibold text-mid mb-1">Token label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Power Automate"
            className="px-3 py-2 rounded-lg text-body bg-field border border-edge text-hi min-w-[200px]"
          />
        </div>
        <Button size="sm" onClick={createToken} disabled={creating}>{creating ? 'Creating…' : 'Create token'}</Button>
      </div>

      {/* Endpoint reference */}
      <div className="mb-4 p-3 rounded-lg bg-tile border border-edge">
        <div className="text-meta font-semibold text-mid mb-1.5">Send the CSV to this URL (HTTP POST)</div>
        <div className="flex gap-2 items-center flex-wrap">
          <code className="flex-1 min-w-[240px] text-body-sm font-mono text-hi break-all">{endpointUrl}</code>
          <Button size="sm" variant="ghost" onClick={() => copy(endpointUrl)}>Copy URL</Button>
        </div>
        <div className="text-meta text-mid mt-2 leading-normal">
          Header <code className="text-caption font-mono bg-field px-1 rounded text-hi">X-Ingest-Token: your-token</code> · Body: the raw CSV file content ·
          Content-Type <code className="text-caption font-mono bg-field px-1 rounded text-hi">text/csv</code>
        </div>
      </div>

      {/* Existing tokens */}
      {tokens === null && <div className="text-body-sm text-mid">Loading…</div>}
      {tokens && tokens.length === 0 && (
        <div className="text-body-sm text-mid">No tokens yet.</div>
      )}
      {tokens && tokens.length > 0 && (
        <div className="flex flex-col gap-2">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-card border border-edge">
              <div className="min-w-0">
                <div className="text-body font-semibold text-hi">
                  {t.label || 'Token'} {!t.enabled && <span className="font-normal" style={{ color: '#fca5a5' }}>(disabled)</span>}
                </div>
                <div className="text-meta text-mid mt-0.5">
                  {t.last_used_at
                    ? `Last used ${new Date(t.last_used_at).toLocaleString('en-GB')}${t.last_used_count != null ? ` · ${t.last_used_count} rows` : ''}`
                    : 'Never used'}
                </div>
              </div>
              <Button size="sm" variant="danger" onClick={() => revoke(t.id)}>Revoke</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// Status colours (semantic red/green alphas) stay inline — the one sanctioned
// use of inline style in the unified system is dynamic/status values.
const statusError = { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' };
const statusSuccess = { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' };
