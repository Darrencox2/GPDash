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

const ONLINE_CONSULT_TOOLS = [
  { value: 'askmygp', label: 'AskMyGP' },
  { value: 'anima', label: 'Anima' },
  { value: 'klinik', label: 'Klinik' },
  { value: 'patchs', label: 'PATCHS' },
  { value: 'accurx', label: 'AccuRx' },
  { value: 'other', label: 'Other / none' },
];

export default function PracticeSetupForm({ practiceId, practiceSlug, initial }) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(initial.name);
  const [odsCode, setOdsCode] = useState(initial.odsCode);
  const [postcode, setPostcode] = useState(initial.postcode);
  const [listSize, setListSize] = useState(initial.listSize);
  const [tool, setTool] = useState(initial.onlineConsultTool);
  const [region, setRegion] = useState(initial.region);
  const [lookup, setLookup] = useState(null); // postcodes.io result
  const [lookupBusy, setLookupBusy] = useState(false);
  const [practiceCandidates, setPracticeCandidates] = useState([]); // all GP practices at postcode
  const [practiceMatchBusy, setPracticeMatchBusy] = useState(false);
  const [practiceMatchReason, setPracticeMatchReason] = useState(null);
  const [practiceMatchDebug, setPracticeMatchDebug] = useState(null);
  const [savingField, setSavingField] = useState(null);
  const [savedField, setSavedField] = useState(null);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(!!initial.setupCompletedAt);

  // ─── Postcode lookup ──────────────────────────────────────────────
  // Trigger lookup when postcode is a valid format.
  const lookupTimer = useRef(null);
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (!postcode || !isValidPostcodeFormat(postcode)) {
      setLookup(null);
      setPracticeCandidates([]);
      setPracticeMatchReason(null);
      return;
    }
    lookupTimer.current = setTimeout(async () => {
      setLookupBusy(true);
      setPracticeMatchBusy(true);

      const [postcodeResult, practiceRes] = await Promise.all([
        lookupPostcode(postcode),
        fetch(`/api/practice-lookup?postcode=${encodeURIComponent(postcode)}&currentPracticeId=${encodeURIComponent(practiceId)}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ]);

      setLookupBusy(false);
      setPracticeMatchBusy(false);
      setLookup(postcodeResult);
      if (postcodeResult?.region && !region) setRegion(postcodeResult.region);

      const candidates = practiceRes?.practices || [];
      setPracticeCandidates(candidates);
      setPracticeMatchReason(practiceRes?.reason || null);
      setPracticeMatchDebug(practiceRes?.debug || null);
    }, 400);
    return () => clearTimeout(lookupTimer.current);
  }, [postcode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function saveTool(value) {
    setTool(value);
    await saveField('online consultation tool', 'online_consult_tool', value || null);
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
    setTimeout(() => setSavedField(null), 1500);
    // Force a router refresh so the page header (which shows practice.name)
    // updates without the user having to navigate away
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
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 12, borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Postcode */}
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
          We look up your local authority and region from this. Used for school holiday
          calendars in the demand model.
        </p>
        {lookupBusy && <div style={{ ...lookupBox, color: '#94a3b8' }}>Looking up…</div>}
        {lookup && !lookupBusy && (
          <div style={lookupBox}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 6, fontSize: 12 }}>
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

      {/* Practices found at this postcode (NHS Digital lookup) */}
      {(practiceMatchBusy || practiceCandidates.length > 0 || (lookup && !practiceMatchBusy && practiceCandidates.length === 0)) && (
        <Card title={`GP practices at this postcode${practiceCandidates.length > 1 ? ` (${practiceCandidates.length} found)` : ''}`} status={fieldStatus('practice', savingField, savedField)}>
          {practiceMatchBusy && <div style={{ color: '#94a3b8', fontSize: 12 }}>Looking up NHS Digital…</div>}
          {!practiceMatchBusy && practiceCandidates.length === 0 && lookup && (
            <>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                No active GP practice found at this postcode. Enter your practice name and list size manually below.
              </p>
              {practiceMatchDebug?.triedVariants?.length > 0 && (
                <details style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                  <summary style={{ cursor: 'pointer' }}>Show what was searched</summary>
                  <div style={{ marginTop: 6, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {practiceMatchDebug.triedVariants.map((t, i) => (
                      <div key={i}>
                        "{t.variant}" → {t.count} result{t.count === 1 ? '' : 's'}
                        {t.error && <span style={{ color: '#fca5a5' }}> · error: {t.error}</span>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
          {!practiceMatchBusy && practiceCandidates.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                Click your practice to apply its official name, ODS code, and list size.
                You can edit any of these afterwards.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                          <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500, marginBottom: 2 }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
                        <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 500, alignSelf: 'center', color: isSelected ? '#34d399' : unavailable ? '#fcd34d' : '#22d3ee' }}>
                          {isSelected ? '✓ Selected' : unavailable ? 'Already on GPDash' : 'Select →'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Practice name */}
      <Card title="Practice name" status={fieldStatus('practice name', savingField, savedField)}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => saveName(e.target.value)}
          placeholder="e.g. Winscombe & Banwell Family Practice"
          style={input}
        />
        {odsCode && (
          <p style={{ ...hint, color: '#64748b' }}>
            ODS code: <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#94a3b8' }}>{odsCode}</span>
            {practiceCandidates.find(p => p.odsCode === odsCode && p.name !== name) && (
              <button
                type="button"
                onClick={() => {
                  const official = practiceCandidates.find(p => p.odsCode === odsCode);
                  if (official) saveName(official.name);
                }}
                style={{
                  marginLeft: 10,
                  background: 'none',
                  border: 'none',
                  color: '#22d3ee',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >Use NHS official name</button>
            )}
          </p>
        )}
      </Card>

      {/* List size */}
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
        {odsCode && practiceCandidates.find(p => p.odsCode === odsCode && p.listSize != null) && (() => {
          const matched = practiceCandidates.find(p => p.odsCode === odsCode);
          const isUsing = String(listSize) === String(matched.listSize);
          return (
            <div style={{ marginTop: 8, fontSize: 11, color: isUsing ? '#34d399' : '#94a3b8' }}>
              {isUsing
                ? <>✓ Using NHS Digital figure ({matched.listSize.toLocaleString()}, {formatMonthYear(matched.listSizeAsOf)})</>
                : <>NHS Digital published {matched.listSize.toLocaleString()} ({formatMonthYear(matched.listSizeAsOf)}). <button type="button" onClick={() => { setListSize(matched.listSize); saveField('list size', 'list_size', matched.listSize); }} style={{ background: 'none', border: 'none', color: '#22d3ee', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Use this</button></>
              }
            </div>
          );
        })()}
      </Card>

      {/* Online consult tool */}
      <Card title="Online consultation tool" status={fieldStatus('online consultation tool', savingField, savedField)}>
        <select
          value={tool}
          onChange={(e) => saveTool(e.target.value)}
          style={input}
        >
          <option value="">Select…</option>
          {ONLINE_CONSULT_TOOLS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <p style={hint}>
          Which tool you use determines the format we accept for demand history uploads.
          You can change this anytime.
        </p>
      </Card>

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
            fontSize: 13,
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
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Skip for now
        </button>
        {!allRequired && (
          <span style={{ alignSelf: 'center', fontSize: 11, color: '#64748b' }}>
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
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>{title}</h3>
        {status === 'saving' && <span style={{ fontSize: 11, color: '#64748b' }}>Saving…</span>}
        {status === 'saved' && <span style={{ fontSize: 11, color: '#34d399' }}>✓ Saved</span>}
      </div>
      {children}
    </div>
  );
}

const input = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(0,0,0,0.2)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 14,
};
const hint = { fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.5 };
const lookupBox = {
  marginTop: 10,
  padding: 10,
  background: 'rgba(34,211,238,0.05)',
  border: '1px solid rgba(34,211,238,0.15)',
  borderRadius: 6,
  fontSize: 12,
};
