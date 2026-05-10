'use client';
export const dynamic = 'force-dynamic';

// /v4/onboarding/create-practice
//
// Smoother create-practice flow. The user either:
//   1. Types their practice name → live search via OpenPrescribing
//   2. Pastes their ODS code → direct lookup
//
// On selection we check the practices table (via the
// check_practice_exists_by_ods RPC, which bypasses RLS so the user
// learns about practices they're not a member of). If the practice
// is already on GPDash, we show "Contact your practice owner" and
// don't allow creation. Otherwise we auto-fill name + ODS + list size
// and one-click create.
//
// Region field has been dropped — it's not on the form because we
// don't have a reliable way to derive it cheaply, and it isn't used
// for any product feature except as a label. The setup wizard can
// fill it later if the user cares.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { AuthCard, formStyles as f } from '../../_lib/auth-ui';

export default function CreatePracticePage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState('name'); // 'name' | 'ods'
  const [error, setError] = useState('');

  // Search-by-name state
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  // Search-by-ODS state (single result, lookup on submit)
  const [odsInput, setOdsInput] = useState('');
  const [odsLookupBusy, setOdsLookupBusy] = useState(false);

  // Selected practice (after the user picks one from results or
  // completes an ODS lookup). null = nothing picked yet.
  const [picked, setPicked] = useState(null);
  // Result of the duplicate check on the picked practice. null means
  // "haven't checked yet" or "no practice picked"; { exists: bool, ... }
  // when we have a result.
  const [dupCheck, setDupCheck] = useState(null);
  const [dupCheckBusy, setDupCheckBusy] = useState(false);

  // Final create state
  const [creating, setCreating] = useState(false);

  // ─── Live search by name ─────────────────────────────────────────────
  // Debounced — fires 300ms after the user stops typing. < 2 chars is
  // a no-op since the API rejects short queries anyway.
  const searchTimer = useRef(null);
  useEffect(() => {
    if (mode !== 'name') return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/practice-lookup?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        setSearchResults(json.practices || []);
      } catch (e) {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [query, mode]);

  // ─── ODS direct lookup ───────────────────────────────────────────────
  // Hits the same OpenPrescribing endpoint via the practice-lookup API.
  // The API treats ODS codes as a substring search (the user might type
  // "L83012" and we'd match practices whose code contains that string),
  // so we filter for an exact match below.
  const lookupByOds = async () => {
    const code = odsInput.trim().toUpperCase();
    if (!code) return;
    setError('');
    setOdsLookupBusy(true);
    try {
      const res = await fetch(`/api/practice-lookup?q=${encodeURIComponent(code)}`);
      const json = await res.json();
      const exact = (json.practices || []).find(p => p.odsCode?.toUpperCase() === code);
      if (!exact) {
        setError(`No NHS practice found with ODS code "${code}". Try a name search instead.`);
      } else {
        await pickPractice(exact);
      }
    } catch (e) {
      setError('Lookup failed. Try again or use the name search.');
    } finally {
      setOdsLookupBusy(false);
    }
  };

  // Postcode lookup state. Runs in parallel with the duplicate check —
  // the user can hit Create as soon as the dup check returns; we'll
  // include whichever postcode we have at that moment (or null if it
  // hasn't returned yet, which is fine because the setup wizard will
  // still ask).
  const [postcodeLookup, setPostcodeLookup] = useState(null); // null = not started, '' = none found, 'BS25 1AA' = found
  const [postcodeBusy, setPostcodeBusy] = useState(false);

  // ─── User picks a practice from results ──────────────────────────────
  // Triggers TWO server-side calls in parallel:
  //   1. Duplicate check via check_practice_exists_by_ods (RLS-bypassing
  //      so the user learns about practices they're not a member of).
  //   2. Postcode reverse-geocode via /api/v4/lookup-practice-postcode
  //      (ODS → lat/lng via OpenPrescribing → postcode via postcodes.io).
  //      Spares the user from typing a postcode the system can already
  //      derive. Fails gracefully — we just create with postcode=null
  //      and the setup wizard asks like before.
  const pickPractice = async (practice) => {
    setPicked(practice);
    setError('');
    setDupCheck(null);
    setPostcodeLookup(null);
    if (!practice.odsCode) {
      setDupCheck({ exists: false });
      return;
    }

    // Fire both lookups in parallel and update state independently.
    setDupCheckBusy(true);
    setPostcodeBusy(true);

    // 1. Duplicate check
    supabase.rpc('check_practice_exists_by_ods', { ods: practice.odsCode })
      .then(({ data, error: err }) => {
        setDupCheckBusy(false);
        if (err) { setError(err.message); return; }
        setDupCheck(data || { exists: false });
      });

    // 2. Postcode lookup (best-effort, never blocks creation)
    fetch(`/api/v4/lookup-practice-postcode?ods=${encodeURIComponent(practice.odsCode)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        setPostcodeBusy(false);
        setPostcodeLookup(json?.postcode || '');
      })
      .catch(() => {
        setPostcodeBusy(false);
        setPostcodeLookup('');
      });
  };

  const reset = () => {
    setPicked(null);
    setDupCheck(null);
    setPostcodeLookup(null);
    setError('');
  };

  // ─── Create ──────────────────────────────────────────────────────────
  const create = async () => {
    if (!picked || !dupCheck || dupCheck.exists) return;
    setCreating(true);
    setError('');
    const { data: practiceId, error: err } = await supabase.rpc('create_practice_with_owner', {
      practice_name: picked.name,
      ods_code: picked.odsCode || null,
      region: null, // dropped from this form — setup wizard fills later if needed
      // Postcode reverse-geocoded from ODS via /api/v4/lookup-practice-postcode.
      // Empty string from the lookup means "tried but couldn't find" — pass null
      // so the setup wizard knows to ask.
      postcode: postcodeLookup || null,
      list_size: picked.listSize ?? null,
      online_consult_tool: null,
    });
    if (err) {
      setError(err.message);
      setCreating(false);
      return;
    }
    // New practices land in the setup wizard rather than the dashboard.
    // The wizard walks them through TeamNet, EMIS/CSV, demand, and
    // invites — only when they finish does it set setup_completed_at
    // and redirect them through to /p/<slug>. (The /p/[slug] server
    // component also enforces this redirect for owners/admins, so
    // even if they navigate away mid-wizard they'll be brought back.)
    router.push(`/v4/onboarding/setup/${practiceId}`);
    router.refresh();
  };

  // ─── Render: nothing picked yet → show search ────────────────────────
  if (!picked) {
    return (
      <AuthCard
        title="What's your practice?"
        subtitle="We'll match it against NHS Digital so you don't have to type it all in"
      >
        {error && <div style={f.errorBox}>{error}</div>}

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 8, marginBottom: 16 }}>
          <ModeButton active={mode === 'name'} onClick={() => setMode('name')}>Search by name</ModeButton>
          <ModeButton active={mode === 'ods'} onClick={() => setMode('ods')}>Enter ODS code</ModeButton>
        </div>

        {mode === 'name' ? (
          <div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Winscombe & Banwell"
              style={f.input}
              autoFocus
            />
            {searching && <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Searching NHS Digital…</div>}
            {!searching && query.trim().length >= 2 && searchResults.length === 0 && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                No NHS practices match "{query}". Try a different spelling.
              </div>
            )}
            {searchResults.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {searchResults.slice(0, 8).map(p => (
                  <ResultButton key={p.odsCode} practice={p} onClick={() => pickPractice(p)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <input
              type="text"
              value={odsInput}
              onChange={(e) => setOdsInput(e.target.value.toUpperCase())}
              placeholder="e.g. L83012"
              style={f.input}
              maxLength={10}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') lookupByOds(); }}
            />
            <button
              type="button"
              onClick={lookupByOds}
              disabled={!odsInput.trim() || odsLookupBusy}
              style={{
                ...f.button,
                marginTop: 12,
                opacity: (!odsInput.trim() || odsLookupBusy) ? 0.5 : 1,
              }}
            >
              {odsLookupBusy ? 'Looking up…' : 'Look up practice'}
            </button>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
              Don't know your ODS code? Switch to "Search by name" above, or find it on{' '}
              <a href="https://www.odsportal.digital.nhs.uk/" target="_blank" rel="noopener noreferrer" style={{ color: '#34d399' }}>NHS ODS Portal</a>.
            </div>
          </div>
        )}

        <div style={f.footerLink}>
          <Link href="/v4/dashboard" style={f.link}>← Back to dashboard</Link>
        </div>
      </AuthCard>
    );
  }

  // ─── Render: practice picked → show confirm or duplicate warning ─────
  return (
    <AuthCard title="Confirm your practice">
      {error && <div style={f.errorBox}>{error}</div>}

      {/* Practice card */}
      <div style={{
        padding: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 15, color: '#e2e8f0', fontWeight: 500, marginBottom: 4 }}>{picked.name}</div>
        {(picked.pcnName || picked.icbName) && (
          <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 4 }}>
            {[picked.pcnName, picked.icbName].filter(Boolean).join(' · ')}
          </div>
        )}
        {picked.odsCode && (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            ODS: <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{picked.odsCode}</span>
            {picked.listSize ? <> · {picked.listSize.toLocaleString('en-GB')} patients</> : null}
          </div>
        )}
        {/* Postcode auto-lookup result. We don't block creation on it —
            it's purely informational: lets the user see the system
            already knows where they are, so the setup wizard won't
            need to ask. */}
        {postcodeBusy && (
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Looking up postcode…
          </div>
        )}
        {!postcodeBusy && postcodeLookup && (
          <div style={{ fontSize: 12, color: '#34d399', marginTop: 4 }}>
            ✓ Postcode: <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{postcodeLookup}</span>
          </div>
        )}
      </div>

      {dupCheckBusy && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Checking…</div>
      )}

      {!dupCheckBusy && dupCheck?.exists && (
        // Duplicate — explain and don't allow creation. Show the original
        // owner's name so the user knows who to contact, rather than the
        // generic "ask your practice owner".
        <div style={{
          padding: 14,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          color: '#fde68a',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: '#fbbf24' }}>This practice is already on GPDash.</strong>
          {' '}
          {dupCheck.owner_name ? (
            <>Ask <strong style={{ color: '#fde68a' }}>{dupCheck.owner_name}</strong> to invite you from the practice's Users page.</>
          ) : (
            <>Ask whoever set it up to invite you from the practice's Users page.</>
          )}
          {' '}They'll need the email address you signed up with.
        </div>
      )}

      {!dupCheckBusy && dupCheck && !dupCheck.exists && (
        // New practice — confirm + create
        <button
          type="button"
          onClick={create}
          disabled={creating}
          style={{ ...f.button, marginBottom: 12, opacity: creating ? 0.5 : 1 }}
        >
          {creating ? 'Creating…' : 'Create this practice'}
        </button>
      )}

      <button
        type="button"
        onClick={reset}
        style={{
          ...f.button,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#cbd5e1',
        }}
      >
        ← Pick a different practice
      </button>
    </AuthCard>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────
function ModeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 12px',
        fontSize: 12,
        fontWeight: 500,
        color: active ? 'white' : '#94a3b8',
        background: active ? 'rgba(34,211,238,0.15)' : 'transparent',
        border: active ? '1px solid rgba(34,211,238,0.3)' : '1px solid transparent',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function ResultButton({ practice, onClick }) {
  // Practices already in the DB show greyed out — selecting one will
  // surface the "Already on GPDash, contact owner" message but the user
  // needs to click to find that out, hence we still allow the click.

  // Disambiguation line — handles the case where multiple practices
  // share a name (e.g. several "Horizon Health Centre"s across the
  // country). PCN is the most specific; ICB is broader; region broadest.
  // Show whichever is available, prefer PCN.
  const contextBits = [];
  if (practice.pcnName) contextBits.push(practice.pcnName);
  else if (practice.icbName) contextBits.push(practice.icbName);
  if (practice.regionName && !contextBits.length) contextBits.push(practice.regionName);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 6,
        cursor: 'pointer',
        color: '#e2e8f0',
        fontSize: 13,
        fontFamily: 'inherit',
      }}
      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(34,211,238,0.08)'}
      onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
      <div style={{ fontWeight: 500 }}>{practice.name}</div>
      {contextBits.length > 0 && (
        <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 3 }}>
          {contextBits.join(' · ')}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
        ODS: <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{practice.odsCode}</span>
        {practice.listSize ? <> · {practice.listSize.toLocaleString('en-GB')} patients</> : null}
        {practice.existsInDatabase && <span style={{ color: '#fbbf24', marginLeft: 8 }}>· Already on GPDash</span>}
      </div>
    </button>
  );
}
