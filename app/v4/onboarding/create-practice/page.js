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
  const [mode, setMode] = useState('name'); // 'name' | 'ods' | 'manual'
  const [error, setError] = useState('');
  // Asking to join a practice that already exists.
  const [joinState, setJoinState] = useState(null); // null | 'requested' | 'already_pending' | 'already_member'
  const [joinMessage, setJoinMessage] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState('');

  const askToJoin = async () => {
    setJoinBusy(true); setJoinError('');
    const { data, error: err } = await supabase.rpc('request_to_join_practice', {
      p_practice_id: dupCheck?.practice_id,
      p_message: joinMessage.trim() || null,
    });
    setJoinBusy(false);
    if (err) { setJoinError(err.message || 'Could not send that request. Try again in a moment.'); return; }
    setJoinState(data?.status || 'requested');
  };

  // Search-by-name state
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  // Search-by-ODS state (single result, lookup on submit)
  const [odsInput, setOdsInput] = useState('');
  const [odsLookupBusy, setOdsLookupBusy] = useState(false);

  // Manual-entry state — the fallback when the NHS lookup is unavailable
  // or a practice cannot be found. Name is required; ODS code and list
  // size are optional (the setup wizard can fill the rest later).
  const [manualName, setManualName] = useState('');
  const [manualOds, setManualOds] = useState('');
  const [manualListSize, setManualListSize] = useState('');

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
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(`/api/practice-lookup?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal });
        const json = await res.json();
        setSearchResults(json.practices || []);
        setError('');
      } catch (e) {
        setSearchResults([]);
        setError(e?.name === 'AbortError'
          ? 'The NHS practice lookup is taking too long to respond right now. Please try again in a moment, or use the ODS code option.'
          : 'Could not reach the NHS practice lookup. Please try again in a moment.');
      } finally {
        clearTimeout(to);
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [query, mode]);

  // ─── ODS direct lookup ───────────────────────────────────────────────
  // Hits the practice-lookup API, which tries OpenPrescribing first and
  // falls back to NHS ODS (which resolves the code exactly, not by substring).
  // The API treats ODS codes as a substring search (the user might type
  // "L83012" and we'd match practices whose code contains that string),
  // so we filter for an exact match below.
  const lookupByOds = async () => {
    const code = odsInput.trim().toUpperCase();
    if (!code) return;
    setError('');
    setOdsLookupBusy(true);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`/api/practice-lookup?q=${encodeURIComponent(code)}`, { signal: ctrl.signal });
      const json = await res.json();
      const exact = (json.practices || []).find(p => p.odsCode?.toUpperCase() === code);
      if (!exact) {
        setError(`No NHS practice found with ODS code "${code}". Try a name search instead.`);
      } else {
        await pickPractice(exact);
      }
    } catch (e) {
      setError(e?.name === 'AbortError'
        ? 'The NHS practice lookup is taking too long to respond right now. Please try again in a moment.'
        : 'Lookup failed. Try again or use the name search.');
    } finally {
      clearTimeout(to);
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

  // ─── Manual entry ────────────────────────────────────────────────────
  // Fallback path: the user types their own details, and we hand them to
  // the same pickPractice flow. If they supply an ODS code we still run
  // the duplicate check and best-effort postcode lookup; without one we
  // skip both (pickPractice handles that) and the setup wizard asks later.
  const submitManual = () => {
    const name = manualName.trim();
    if (!name) { setError('Please enter your practice name.'); return; }
    const ods = manualOds.trim().toUpperCase();
    const sizeNum = parseInt(manualListSize.replace(/[^0-9]/g, ''), 10);
    setError('');
    pickPractice({
      name,
      odsCode: ods || null,
      listSize: Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : null,
      existsInDatabase: false,
      manualEntry: true,
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
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--r-md)', marginBottom: 16 }}>
          <ModeButton active={mode === 'name'} onClick={() => setMode('name')}>Search by name</ModeButton>
          <ModeButton active={mode === 'ods'} onClick={() => setMode('ods')}>Enter ODS code</ModeButton>
          <ModeButton active={mode === 'manual'} onClick={() => setMode('manual')}>Enter manually</ModeButton>
        </div>

        {mode === 'name' && (
          <div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Winscombe & Banwell"
              style={f.input}
              autoFocus
            />
            {searching && <div className="text-caption text-slate-400 mt-2">Searching NHS Digital…</div>}
            {!searching && query.trim().length >= 2 && searchResults.length === 0 && (
              <div className="text-caption text-slate-400 mt-2">
                No NHS practices match "{query}". Try a different spelling, or{' '}
                <button type="button" onClick={() => { setManualName(query.trim()); setMode('manual'); }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--c-green-2)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>enter details manually</button>.
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {searchResults.slice(0, 8).map(p => (
                  <ResultButton key={p.odsCode} practice={p} onClick={() => pickPractice(p)} />
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'ods' && (
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
            <div className="text-caption text-slate-400 mt-2">
              Don't know your ODS code? Switch to "Search by name" above, or find it on{' '}
              <a href="https://www.odsportal.digital.nhs.uk/" target="_blank" rel="noopener noreferrer" className="text-emerald-400">NHS ODS Portal</a>.
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <div>
            <div className="text-meta text-slate-400 mb-3 leading-normal">
              Use this if the NHS lookup is not finding your practice or is unavailable. Only the
              name is required — you can add or correct the rest later in settings.
            </div>
            <label style={f.label}>Practice name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Winscombe & Banwell Family Practice"
              style={f.input}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }}
            />
            <label style={{ ...f.label, marginTop: 12 }}>ODS code <span className="text-slate-400">(optional)</span></label>
            <input
              type="text"
              value={manualOds}
              onChange={(e) => setManualOds(e.target.value.toUpperCase())}
              placeholder="e.g. L83012"
              style={f.input}
              maxLength={10}
            />
            <label style={{ ...f.label, marginTop: 12 }}>List size <span className="text-slate-400">(optional)</span></label>
            <input
              type="text"
              inputMode="numeric"
              value={manualListSize}
              onChange={(e) => setManualListSize(e.target.value)}
              placeholder="e.g. 11000"
              style={f.input}
              onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }}
            />
            <button
              type="button"
              onClick={submitManual}
              disabled={!manualName.trim()}
              style={{ ...f.button, marginTop: 14, opacity: manualName.trim() ? 1 : 0.5 }}
            >
              Continue
            </button>
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
        borderRadius: 'var(--r-md)',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 15, color: 'var(--g-text-hi)', fontWeight: 500, marginBottom: 4 }}>{picked.name}</div>
        {(picked.pcnName || picked.icbName) && (
          <div className="text-meta text-slate-300 mb-1">
            {[picked.pcnName, picked.icbName].filter(Boolean).join(' · ')}
          </div>
        )}
        {picked.odsCode && (
          <div className="text-meta text-slate-400">
            ODS: <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{picked.odsCode}</span>
            {picked.listSize ? <> · {picked.listSize.toLocaleString('en-GB')} patients</> : null}
          </div>
        )}
        {/* Postcode auto-lookup result. We don't block creation on it —
            it's purely informational: lets the user see the system
            already knows where they are, so the setup wizard won't
            need to ask. */}
        {postcodeBusy && (
          <div className="text-meta text-slate-400 mt-1">
            Looking up postcode…
          </div>
        )}
        {!postcodeBusy && postcodeLookup && (
          <div className="text-meta text-emerald-400 mt-1">
            ✓ Postcode: <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{postcodeLookup}</span>
          </div>
        )}
      </div>

      {dupCheckBusy && (
        <div className="text-meta text-slate-400 mb-4">Checking…</div>
      )}

      {!dupCheckBusy && dupCheck?.exists && (
        // Duplicate — explain and don't allow creation. Show the original
        // owner's name so the user knows who to contact, rather than the
        // generic "ask your practice owner".
        <div style={{
          padding: 14,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 'var(--r-md)',
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--c-sand)',
          lineHeight: 1.5,
        }}>
          <strong className="text-amber-400">This practice is already on GPDash.</strong>
          {' '}
          {joinState === 'requested' || joinState === 'already_pending' ? (
            <>Your request to join has been sent{dupCheck.owner_name ? <> to <strong style={{ color: 'var(--c-sand)' }}>{dupCheck.owner_name}</strong></> : null}.
              {' '}They will see it on their Users page and you will be let in once they approve it.</>
          ) : joinState === 'already_member' ? (
            <>You are already a member of this practice &mdash; <a href="/v4/dashboard" style={{ color: 'var(--c-sand)', textDecoration: 'underline' }}>go to your dashboard</a>.</>
          ) : (
            <>
              {dupCheck.owner_name
                ? <>It is run by <strong style={{ color: 'var(--c-sand)' }}>{dupCheck.owner_name}</strong>. Ask to join and they can approve you from the practice&rsquo;s Users page.</>
                : <>Ask to join and whoever set it up can approve you from the practice&rsquo;s Users page.</>}
              {/* Asking used to be impossible from here: the screen told
                  people to go and find the owner themselves, with no way
                  to make contact and nothing on the owner's side to see. */}
              <div style={{ marginTop: 10 }}>
                <textarea
                  value={joinMessage}
                  onChange={(e) => setJoinMessage(e.target.value)}
                  placeholder="Optional: say who you are, e.g. new salaried GP starting in October"
                  rows={2}
                  style={{ ...f.input, width: '100%', resize: 'vertical', marginBottom: 8 }}
                />
                <button
                  type="button"
                  onClick={askToJoin}
                  disabled={joinBusy || !dupCheck.practice_id}
                  style={{ ...f.button, opacity: joinBusy || !dupCheck.practice_id ? 0.6 : 1 }}
                >
                  {joinBusy ? 'Sending…' : 'Ask to join this practice'}
                </button>
                {!dupCheck.practice_id && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    Ask whoever set it up to invite you from the practice&rsquo;s Users page. They will need the email address you signed up with.
                  </div>
                )}
                {joinError && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--c-red)' }}>{joinError}</div>}
              </div>
            </>
          )}
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
          color: 'var(--g-text-soft)',
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
        color: active ? 'var(--g-text-max)' : 'var(--g-text-mid)',
        background: active ? 'rgba(34,211,238,0.15)' : 'transparent',
        border: active ? '1px solid rgba(34,211,238,0.3)' : '1px solid transparent',
        borderRadius: 'var(--r-sm)',
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
        borderRadius: 'var(--r-sm)',
        cursor: 'pointer',
        color: 'var(--g-text-hi)',
        fontSize: 13,
        fontFamily: 'inherit',
      }}
      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(34,211,238,0.08)'}
      onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
      <div className="font-medium">{practice.name}</div>
      {contextBits.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--g-text-soft)', marginTop: 3 }}>
          {contextBits.join(' · ')}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--g-text-mid)', marginTop: 3 }}>
        ODS: <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{practice.odsCode}</span>
        {practice.listSize ? <> · {practice.listSize.toLocaleString('en-GB')} patients</> : null}
        {practice.existsInDatabase && <span className="text-amber-400 ml-2">· Already on GPDash</span>}
      </div>
    </button>
  );
}
