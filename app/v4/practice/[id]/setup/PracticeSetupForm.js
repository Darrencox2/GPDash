'use client';

// PracticeSetupForm — single-page form for the four setup fields. Postcode
// triggers a live lookup against postcodes.io that shows detected LEA + region
// inline. Each field saves on blur (auto-save) so half-completed setup
// doesn't lose progress.

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { lookupPostcode, isValidPostcodeFormat, formatPostcode } from '@/lib/postcode-lookup';
import { getSchoolHolidaysForLEA } from '@/lib/school-holidays-by-lea';
import EmisReportCard from '@/components/EmisReportCard';
import SlugEditor from '../SlugEditor';

// (Online consultation tool field was removed — it wasn't actually used
// for any logic, only stored. Demand upload always shows the AskMyGP
// flow regardless. The column is still in the schema but no longer
// surfaced in the UI.)

export default function PracticeSetupForm({ practiceId, practiceSlug, initial }) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(initial.name);
  const [odsCode, setOdsCode] = useState(initial.odsCode);
  const [postcode, setPostcode] = useState(initial.postcode);
  const [listSize, setListSize] = useState(initial.listSize);
  const [region, setRegion] = useState(initial.region);
  const [lookup, setLookup] = useState(null); // postcodes.io result
  const [lookupBusy, setLookupBusy] = useState(false);
  // Practice name-search (separate from postcode lookup)
  const [practiceQuery, setPracticeQuery] = useState('');
  const [practiceCandidates, setPracticeCandidates] = useState([]);
  const [practiceMatchBusy, setPracticeMatchBusy] = useState(false);
  const [practiceMatchReason, setPracticeMatchReason] = useState(null);
  const [practiceMatchDebug, setPracticeMatchDebug] = useState(null);
  const [nhsSeedResult, setNhsSeedResult] = useState(null);
  // Show the search input only when no practice is currently selected, or
  // when the user clicks "Change practice"
  const [showSearch, setShowSearch] = useState(!initial.odsCode);
  // Extra context fetched from nhs_oc_baseline once we have an ODS code:
  // PCN/ICB/region/supplier — used in the rich "Your practice" display
  const [nhsDetails, setNhsDetails] = useState(null);
  // Manual-override mode: when true, postcode + list size become inline-editable
  // inside the "Your practice" card. Otherwise they're shown as read-only text.
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingField, setSavingField] = useState(null);
  const [savedField, setSavedField] = useState(null);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(!!initial.setupCompletedAt);

  // ─── Fetch NHS context (PCN/ICB/supplier) when ODS code is set ──
  useEffect(() => {
    if (!odsCode) {
      setNhsDetails(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('nhs_oc_baseline')
        .select('practice_name, supplier, pcn_name, icb_name, region_name, total, days_with_data, month')
        .eq('ods_code', odsCode)
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle();
      setNhsDetails(data || null);
    })();
  }, [odsCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Postcode lookup (only postcodes.io for region/LEA) ──────────
  const lookupTimer = useRef(null);
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (!postcode || !isValidPostcodeFormat(postcode)) {
      setLookup(null);
      return;
    }
    lookupTimer.current = setTimeout(async () => {
      setLookupBusy(true);
      const result = await lookupPostcode(postcode);
      setLookupBusy(false);
      setLookup(result);
      if (result?.region && !region) setRegion(result.region);
    }, 400);
    return () => clearTimeout(lookupTimer.current);
  }, [postcode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Practice name search via OpenPrescribing ────────────────────
  const practiceSearchTimer = useRef(null);
  useEffect(() => {
    if (practiceSearchTimer.current) clearTimeout(practiceSearchTimer.current);
    if (!practiceQuery || practiceQuery.trim().length < 2) {
      setPracticeCandidates([]);
      setPracticeMatchReason(null);
      return;
    }
    practiceSearchTimer.current = setTimeout(async () => {
      setPracticeMatchBusy(true);
      const res = await fetch(
        `/api/practice-lookup?q=${encodeURIComponent(practiceQuery.trim())}&currentPracticeId=${encodeURIComponent(practiceId)}`
      ).then(r => r.ok ? r.json() : null).catch(() => null);
      setPracticeMatchBusy(false);
      setPracticeCandidates(res?.practices || []);
      setPracticeMatchReason(res?.reason || null);
      setPracticeMatchDebug(res?.debug || null);
    }, 350);
    return () => clearTimeout(practiceSearchTimer.current);
  }, [practiceQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Save helpers ─────────────────────────────────────────────────
  async function saveField(fieldKey, dbColumn, value) {
    setSavingField(fieldKey);
    setError('');
    const { error: err } = await supabase
      .from('practices')
      .update({ [dbColumn]: value })
      .eq('id', practiceId);
    setSavingField(null);
    if (err) {
      setError(`Couldn't save ${fieldKey}: ${err.message}`);
      return false;
    }
    setSavedField(fieldKey);
    setTimeout(() => setSavedField(null), 1500);
    return true;
  }

  async function savePostcode() {
    const formatted = formatPostcode(postcode);
    setPostcode(formatted);
    await saveField('postcode', 'postcode', formatted || null);
    if (lookup?.region && lookup.region !== region) {
      setRegion(lookup.region);
      await saveField('region', 'region', lookup.region);
    }
    // Also persist the geographic context derived from the postcode lookup —
    // these are needed by the demand predictor (weather location) and the
    // school holiday lookup. Saved once during setup so the dashboard
    // doesn't need to re-fetch postcodes.io on every load.
    if (lookup) {
      const updates = {};
      if (lookup.latitude != null) updates.latitude = lookup.latitude;
      if (lookup.longitude != null) updates.longitude = lookup.longitude;
      if (lookup.admin_district) updates.admin_district = lookup.admin_district;
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('practices')
          .update(updates)
          .eq('id', practiceId);
      }
    }
  }

  async function saveListSize() {
    const n = parseInt(listSize, 10);
    if (Number.isNaN(n) || n <= 0) return;
    await saveField('list size', 'list_size', n);
  }

  async function saveName(value) {
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    setName(trimmed);
    await saveField('practice name', 'name', trimmed);
  }

  // Apply NHS practice details to the form fields. One click = name + ODS +
  // list size (if available) all at once. User can still edit any of them
  // afterwards.
  async function selectPractice(p) {
    setSavingField('practice');
    setError('');
    const updates = {
      name: p.name,
      ods_code: p.odsCode,
    };
    if (p.listSize != null) updates.list_size = p.listSize;
    const { error: err } = await supabase
      .from('practices')
      .update(updates)
      .eq('id', practiceId);
    setSavingField(null);
    if (err) {
      setError(`Couldn't apply practice details: ${err.message}`);
      return;
    }
    setName(p.name);
    setOdsCode(p.odsCode);
    if (p.listSize != null) setListSize(p.listSize);
    setSavedField('practice');
    setShowSearch(false); // hide search now that one is selected
    setPracticeQuery('');
    setPracticeCandidates([]);
    setTimeout(() => setSavedField(null), 1500);

    // Try to pre-seed demand predictions from NHS data (fire-and-forget —
    // no need to block the UI; result shows up in the demand banner below)
    fetch('/api/v4/seed-demand-from-nhs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practiceId }),
    })
      .then(r => r.json())
      .then(result => {
        if (result.seeded) {
          setNhsSeedResult(result);
        } else if (result.reason && result.reason !== 'existing_settings_not_overwritten') {
          console.log('NHS seed:', result.reason, result.message);
          setNhsSeedResult({ seeded: false, reason: result.reason, message: result.message });
        }
      })
      .catch(e => console.warn('NHS seed call failed:', e));

    // Auto-fill postcode from OpenPrescribing's location data + postcodes.io
    // reverse-geocoding. Best-effort — falls back to manual entry if either
    // hop fails. Skip if we already have a postcode (don't trample existing).
    if (!postcode) {
      fetch(`/api/v4/lookup-practice-postcode?ods=${encodeURIComponent(p.odsCode)}`)
        .then(r => r.json())
        .then(async result => {
          if (result?.postcode) {
            // Save to DB and update local state — postcodes.io useEffect will
            // then run and populate the LEA / region info panel below.
            const { error: pcErr } = await supabase
              .from('practices')
              .update({ postcode: result.postcode })
              .eq('id', practiceId);
            if (!pcErr) {
              setPostcode(result.postcode);
            }
          }
        })
        .catch(e => console.warn('Postcode auto-fill failed:', e));
    }

    router.refresh();
  }

  /**
   * Clear all practice-identifying data (ODS, name, list size, demand seed).
   * Used when the user wants to pick a different practice.
   */
  async function clearPractice() {
    if (!confirm('Clear practice details? You\'ll need to pick a practice again, and any pre-seeded demand predictions will be removed.')) {
      return;
    }
    setSavingField('practice');
    setError('');
    // Clear practice fields (keep postcode/region — those are still useful)
    const { error: err1 } = await supabase
      .from('practices')
      .update({ name: '', ods_code: null, list_size: null })
      .eq('id', practiceId);
    if (err1) {
      setError(`Couldn't clear practice: ${err1.message}`);
      setSavingField(null);
      return;
    }
    // Also clear any NHS-seeded demand_settings so the next pick re-seeds
    await supabase
      .from('practice_settings')
      .update({ demand_settings: null })
      .eq('practice_id', practiceId);

    setName('');
    setOdsCode('');
    setListSize('');
    setNhsSeedResult(null);
    setShowSearch(true);
    setPracticeQuery('');
    setPracticeCandidates([]);
    setSavingField(null);
    router.refresh();
  }

  async function markComplete() {
    setSavingField('done');
    setError('');
    const { error: err } = await supabase
      .from('practices')
      .update({ setup_completed_at: new Date().toISOString() })
      .eq('id', practiceId);
    setSavingField(null);
    if (err) {
      setError(`Couldn't mark setup complete: ${err.message}`);
      return;
    }
    setCompleted(true);
    router.push(`/p/${practiceSlug}`);
  }

  // ─── Render ───────────────────────────────────────────────────────
  const allRequired = name && postcode && listSize && tool;
  const holidays = lookup?.admin_district ? getSchoolHolidaysForLEA(lookup.admin_district) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 12, borderRadius: 8, fontSize: 15 }}>
          {error}
        </div>
      )}

      {/* ── 1. Selected practice OR search ───────────────────────────── */}
      {odsCode && !showSearch ? (
        <Card title="Your practice" status={fieldStatus('practice', savingField, savedField)}>
          {/* Header: name + action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
            <h2 style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 22,
              fontWeight: 600,
              color: 'white',
              margin: 0,
              lineHeight: 1.3,
              flex: 1,
              minWidth: 0,
            }}>{name || '(no name)'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                style={{
                  background: 'rgba(34,211,238,0.08)',
                  border: '1px solid rgba(34,211,238,0.25)',
                  color: '#22d3ee',
                  padding: '8px 14px',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >Change practice</button>
              <button
                type="button"
                onClick={clearPractice}
                disabled={savingField === 'practice'}
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#fca5a5',
                  padding: '8px 14px',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: savingField === 'practice' ? 'wait' : 'pointer',
                }}
              >Clear details</button>
              <button
                type="button"
                onClick={() => setEditingDetails(!editingDetails)}
                style={{
                  background: editingDetails ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: editingDetails ? '#22d3ee' : '#94a3b8',
                  padding: '8px 14px',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >{editingDetails ? '✓ Done editing' : 'Edit details'}</button>
            </div>
          </div>

          {/* Big stats row: ODS · List size · Postcode */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
            marginBottom: 18,
          }}>
            <Stat label="ODS code" value={odsCode} mono />
            <Stat
              label="Patient list"
              value={listSize ? Number(listSize).toLocaleString() : '—'}
              editable={editingDetails}
              inputType="number"
              inputValue={listSize}
              onInputChange={setListSize}
              onInputBlur={() => saveListSize(listSize)}
            />
            <Stat
              label="Postcode"
              value={postcode || '—'}
              editable={editingDetails}
              inputValue={postcode}
              onInputChange={(v) => setPostcode(v.toUpperCase())}
              onInputBlur={savePostcode}
            />
          </div>

          {/* Location context (from postcodes.io lookup) */}
          {(lookup || lookupBusy) && (
            <div style={{
              fontSize: 14,
              color: '#cbd5e1',
              padding: 10,
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 6,
              marginBottom: 12,
              lineHeight: 1.6,
            }}>
              {lookupBusy && <span style={{ color: '#94a3b8' }}>Looking up location…</span>}
              {lookup && (
                <>
                  <div>
                    <span style={{ color: '#64748b' }}>Local authority:</span>{' '}
                    <span>{lookup.admin_district || '—'}</span>
                    {lookup.region && <>
                      {' · '}
                      <span style={{ color: '#64748b' }}>NHS region:</span>{' '}
                      <span>{lookup.region}</span>
                    </>}
                  </div>
                  {holidays && (
                    <div>
                      <span style={{ color: '#64748b' }}>Holiday calendar:</span>{' '}
                      <span style={{ color: holidays.isFallback ? '#fcd34d' : '#cbd5e1' }}>
                        {holidays.name}{holidays.isFallback && ' (fallback — no specific data for your LEA)'}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* NHS organisational context (from nhs_oc_baseline) */}
          {nhsDetails && (
            <div style={{
              fontSize: 14,
              color: '#cbd5e1',
              padding: 10,
              background: 'rgba(34, 211, 238, 0.04)',
              border: '1px solid rgba(34, 211, 238, 0.12)',
              borderRadius: 6,
              marginBottom: 12,
              lineHeight: 1.6,
            }}>
              <div style={{ fontSize: 14, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                NHS England — {formatMonthYear(nhsDetails.month)}
              </div>
              {nhsDetails.pcn_name && (
                <div><span style={{ color: '#64748b' }}>PCN:</span> {nhsDetails.pcn_name}</div>
              )}
              {nhsDetails.icb_name && (
                <div><span style={{ color: '#64748b' }}>ICB:</span> {nhsDetails.icb_name}</div>
              )}
              {nhsDetails.total != null && (
                <div><span style={{ color: '#64748b' }}>Submissions that month:</span> {nhsDetails.total.toLocaleString()} across {nhsDetails.days_with_data} days</div>
              )}
            </div>
          )}

          {/* Practice URL (slug) — sits inside the Your practice card so all
              identity-level info lives together. SlugEditor handles its own
              save state. */}
          <div style={{
            marginTop: 12,
            padding: 12,
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.04)',
            borderRadius: 6,
          }}>
            <div style={{
              fontSize: 12,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 8,
            }}>Practice URL</div>
            <SlugEditor
              practiceId={practiceId}
              currentSlug={practiceSlug}
              canEdit={true}
            />
          </div>
        </Card>
      ) : (
        <Card title="Find your practice" status={fieldStatus('practice', savingField, savedField)}>
          <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
            Type your practice name to search NHS Digital and pre-fill its official
            name, ODS code, and list size in one click.
          </p>
          <input
            type="text"
            value={practiceQuery}
            onChange={(e) => setPracticeQuery(e.target.value)}
            placeholder="e.g. Winscombe, Banwell, or any partial name"
            style={input}
            autoFocus={showSearch && !!odsCode}
          />
          {practiceMatchBusy && <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 10 }}>Searching…</div>}
          {!practiceMatchBusy && practiceQuery.trim().length >= 2 && practiceCandidates.length === 0 && (
            <>
              <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 10 }}>
                No matches. Try a different word — names are matched in order, so "Banwell" might find practices that "Winscombe" doesn't.
              </p>
              {practiceMatchDebug?.attempts?.length > 0 && (
                <details style={{ marginTop: 8, fontSize: 15, color: '#64748b' }}>
                  <summary style={{ cursor: 'pointer' }}>Show what was searched (debug)</summary>
                  <div style={{ marginTop: 6, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6, fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap', fontSize: 12 }}>
                    {practiceMatchDebug.attempts.map((a, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ wordBreak: 'break-all' }}>{a.url}</div>
                        <div>status: {a.status ?? 'fetch failed'} · matches: {a.matchCount ?? 'n/a'}</div>
                        {a.contentType && <div>content-type: {a.contentType}</div>}
                        {a.bodyPreview && <div style={{ color: '#94a3b8' }}>body: {a.bodyPreview}</div>}
                        {a.errorBody && <div style={{ color: '#fca5a5' }}>error body: {a.errorBody}</div>}
                        {a.fetchError && <div style={{ color: '#fca5a5' }}>fetch error: {a.fetchError}</div>}
                        {a.parseError && <div style={{ color: '#fca5a5' }}>parse error: {a.parseError}</div>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
          {!practiceMatchBusy && practiceCandidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {practiceCandidates.map(p => {
                const isSelected = odsCode && p.odsCode === odsCode;
                const unavailable = p.unavailable && !isSelected;
                return (
                  <button
                    key={p.odsCode}
                    type="button"
                    onClick={() => !isSelected && !unavailable && selectPractice(p)}
                    disabled={isSelected || unavailable || savingField === 'practice'}
                    style={{
                      textAlign: 'left',
                      padding: 12,
                      background: isSelected
                        ? 'rgba(16,185,129,0.08)'
                        : unavailable
                        ? 'rgba(255,255,255,0.02)'
                        : 'rgba(0,0,0,0.2)',
                      border: `1px solid ${
                        isSelected
                          ? 'rgba(16,185,129,0.3)'
                          : unavailable
                          ? 'rgba(255,255,255,0.04)'
                          : 'rgba(255,255,255,0.08)'
                      }`,
                      borderRadius: 8,
                      cursor: isSelected || unavailable ? 'not-allowed' : 'pointer',
                      opacity: unavailable ? 0.5 : 1,
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, color: '#e2e8f0', fontWeight: 500, marginBottom: 2 }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 15, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{p.odsCode}</span>
                          {p.listSize != null ? (
                            <span>
                              {p.listSize.toLocaleString()} patients
                              {p.listSizeAsOf && <span style={{ marginLeft: 4 }}>· NHS Digital, {formatMonthYear(p.listSizeAsOf)}</span>}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>No list size data</span>
                          )}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, fontSize: 15, fontWeight: 500, alignSelf: 'center', color: isSelected ? '#34d399' : unavailable ? '#fcd34d' : '#22d3ee' }}>
                        {isSelected ? '✓ Selected' : unavailable ? 'Already on GPDash' : 'Select →'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {odsCode && (
            <button
              type="button"
              onClick={() => { setShowSearch(false); setPracticeQuery(''); setPracticeCandidates([]); }}
              style={{ marginTop: 12, background: 'none', border: 'none', color: '#94a3b8', fontSize: 15, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >Cancel — keep current practice</button>
          )}
        </Card>
      )}

      {/* NHS seed result banner — shown after a practice has been picked */}
      {nhsSeedResult?.seeded && (
        <div style={{
          padding: '12px 14px',
          background: 'rgba(34, 211, 238, 0.07)',
          border: '1px solid rgba(34, 211, 238, 0.25)',
          borderRadius: 10,
          fontSize: 14,
          color: '#a5f3fc',
          lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            ✨ Demand predictions pre-seeded from NHS data
          </div>
          <div>
            Your practice's submission patterns from {nhsSeedResult.sourceMonth?.slice(0, 7)} have been used
            to bootstrap your demand model: baseline {Math.round(nhsSeedResult.summary?.baseline)} submissions per weekday,
            with day-of-week effects calibrated to your real data. Upload your AskMyGP history later to refine it further.
          </div>
        </div>
      )}

      {/* Standalone Postcode + List size cards — only shown as fallback
          when no practice is selected. When a practice IS selected, these
          fields live inside the rich "Your practice" card above (inline
          edit via the "Edit details manually" toggle). */}
      {!odsCode && (
        <>
          <Card title="Postcode" status={fieldStatus('postcode', savingField, savedField)}>
            <input
              type="text"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value.toUpperCase())}
              onBlur={savePostcode}
              placeholder="e.g. BS25 1HZ"
              style={input}
              maxLength={10}
            />
            <p style={hint}>
              Auto-filled when you pick a practice above. Used for school holiday
              calendars in the demand model — edit if it's wrong.
            </p>
            {lookupBusy && <div style={{ ...lookupBox, color: '#94a3b8' }}>Looking up…</div>}
            {lookup && !lookupBusy && (
              <div style={lookupBox}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 6, fontSize: 14 }}>
                  <span style={{ color: '#64748b' }}>Local authority</span>
                  <span style={{ color: '#cbd5e1' }}>{lookup.admin_district || '—'}</span>
                  <span style={{ color: '#64748b' }}>Region</span>
                  <span style={{ color: '#cbd5e1' }}>{lookup.region || '—'}</span>
                  <span style={{ color: '#64748b' }}>Country</span>
                  <span style={{ color: '#cbd5e1' }}>{lookup.country || '—'}</span>
                  {holidays && (
                    <>
                      <span style={{ color: '#64748b' }}>Holiday calendar</span>
                      <span style={{ color: holidays.isFallback ? '#fcd34d' : '#cbd5e1' }}>
                        {holidays.name}{holidays.isFallback && ' (fallback — no specific data for your LEA)'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
            {postcode && !isValidPostcodeFormat(postcode) && !lookupBusy && (
              <div style={{ ...lookupBox, color: '#fcd34d', borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)' }}>
                That doesn't look like a valid UK postcode.
              </div>
            )}
          </Card>

          <Card title="Patient list size" status={fieldStatus('list size', savingField, savedField)}>
            <input
              type="number"
              value={listSize}
              onChange={(e) => setListSize(e.target.value)}
              onBlur={saveListSize}
              placeholder="e.g. 11000"
              style={input}
              min={1}
              max={199999}
            />
            <p style={hint}>
              Approximate registered list size. Used to scale demand predictions while we
              collect enough of your own data to calibrate.
            </p>
          </Card>
        </>
      )}

      {/* EMIS appointment report — download XML + how-to */}
      <EmisReportCard />

      {/* Done button */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={markComplete}
          disabled={!allRequired || savingField === 'done'}
          style={{
            padding: '10px 20px',
            background: allRequired ? '#0891b2' : 'rgba(255,255,255,0.05)',
            color: allRequired ? 'white' : '#64748b',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 500,
            cursor: allRequired ? 'pointer' : 'not-allowed',
          }}
        >
          {savingField === 'done' ? 'Saving…' : completed ? 'Update and return' : 'Mark setup complete'}
        </button>
        <button
          onClick={() => router.push(`/p/${practiceSlug}`)}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            color: '#94a3b8',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Skip for now
        </button>
        {!allRequired && (
          <span style={{ alignSelf: 'center', fontSize: 15, color: '#64748b' }}>
            Fill in name, postcode, list size and tool to mark complete
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────
function fieldStatus(field, savingField, savedField) {
  if (savingField === field) return 'saving';
  if (savedField === field) return 'saved';
  return null;
}

// "2025-03-01" → "March 2025"
function formatMonthYear(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function Card({ title, status, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#cbd5e1' }}>{title}</h3>
        {status === 'saving' && <span style={{ fontSize: 15, color: '#64748b' }}>Saving…</span>}
        {status === 'saved' && <span style={{ fontSize: 15, color: '#34d399' }}>✓ Saved</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Stat — labelled big-number display, optionally inline-editable.
 * Used in the "Your practice" card to show ODS code, list size, postcode.
 */
function Stat({ label, value, mono, editable, inputType, inputValue, onInputChange, onInputBlur }) {
  return (
    <div>
      <div style={{
        fontSize: 14,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
      }}>{label}</div>
      {editable && onInputChange ? (
        <input
          type={inputType || 'text'}
          value={inputValue ?? ''}
          onChange={(e) => onInputChange(e.target.value)}
          onBlur={onInputBlur}
          style={{
            width: '100%',
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(34,211,238,0.3)',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: 22,
            fontWeight: 600,
            fontFamily: mono ? 'ui-monospace, Menlo, monospace' : "'Outfit', sans-serif",
            outline: 'none',
          }}
        />
      ) : (
        <div style={{
          fontSize: 22,
          fontWeight: 600,
          color: '#e2e8f0',
          fontFamily: mono ? 'ui-monospace, Menlo, monospace' : "'Outfit', sans-serif",
        }}>{value}</div>
      )}
    </div>
  );
}

const input = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(0,0,0,0.2)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 15,
};
const hint = { fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 1.6 };
const lookupBox = {
  marginTop: 10,
  padding: 12,
  background: 'rgba(34,211,238,0.05)',
  border: '1px solid rgba(34,211,238,0.15)',
  borderRadius: 6,
  fontSize: 14,
};
