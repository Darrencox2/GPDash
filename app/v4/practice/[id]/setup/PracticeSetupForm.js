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

  const [postcode, setPostcode] = useState(initial.postcode);
  const [listSize, setListSize] = useState(initial.listSize);
  const [tool, setTool] = useState(initial.onlineConsultTool);
  const [region, setRegion] = useState(initial.region);
  const [lookup, setLookup] = useState(null); // { admin_district, region, country, ... }
  const [lookupBusy, setLookupBusy] = useState(false);
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
      return;
    }
    lookupTimer.current = setTimeout(async () => {
      setLookupBusy(true);
      const result = await lookupPostcode(postcode);
      setLookupBusy(false);
      setLookup(result);
      // Auto-fill region if it came back and we don't have one
      if (result?.region && !region) setRegion(result.region);
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

  async function saveTool(value) {
    setTool(value);
    await saveField('online consultation tool', 'online_consult_tool', value || null);
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
  const allRequired = postcode && listSize && tool;
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
            Fill in postcode, list size and tool to mark complete
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
