'use client';

// LinkClinicianSuggest — banner that pops up at the top of the practice
// dashboard for users who have a surname but no linked clinician record.
//
// We match the user's last_name against the practice's clinician records
// using a simple case-insensitive surname comparison that handles three
// common storage formats:
//
//   "Smith, Jane"           ← EMIS / TeamNet export
//   "Jane Smith"            ← typed by an admin in the Clinicians page
//   "Dr Jane Smith"         ← typed by an admin who included the title
//   "Smith, Jane (GP Partner)"  ← TeamNet with role suffix
//
// If exactly one candidate matches, we call it out by name. If multiple
// match (e.g. two Smiths in a practice — common), we list them so the
// user can pick the right one. If none match we render nothing — the
// user can still self-link via Account as before.
//
// Hidden conditions:
//   - User already has linkedClinicianId  → nothing to suggest
//   - User has no last_name on profile     → nothing to match against
//   - Candidate is already claimed by someone else (linked_user_id set
//     to anyone other than this user) → not eligible

import { useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// Pulls the surname out of a clinician.name field. Handles comma-format
// ("Smith, Jane") by taking everything before the first comma; otherwise
// strips a leading title and takes the last whitespace-delimited token.
function extractSurname(name) {
  if (!name) return '';
  const cleaned = name.replace(/\s*\([^)]*\)\s*$/, '').trim(); // drop trailing "(GP Partner)"
  if (cleaned.includes(',')) {
    return cleaned.split(',')[0].trim();
  }
  const noTitle = cleaned.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss)\s+/i, '').trim();
  const parts = noTitle.split(/\s+/);
  return parts[parts.length - 1] || '';
}

export default function LinkClinicianSuggest({ data }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [markingNonClinical, setMarkingNonClinical] = useState(false);

  const v4 = data?._v4 || {};
  const userLastName = v4.userLastName;
  const linkedClinicianId = v4.linkedClinicianId;
  const markedNonClinical = v4.markedNonClinical;
  const practiceId = v4.practiceId;

  // Find candidate clinicians: active, unlinked (or linked to nobody, since
  // already-linked records can't be claimed), and surname matches the user's.
  const candidates = useMemo(() => {
    if (!userLastName || linkedClinicianId) return [];
    const want = userLastName.trim().toLowerCase();
    if (!want) return [];
    const list = Array.isArray(data?.clinicians) ? data.clinicians : Object.values(data?.clinicians || {});
    return list.filter(c => {
      if (c.status === 'left' || c.status === 'administrative') return false;
      // linkedUserId is the camelCased version after adaptToV3Shape
      if (c.linkedUserId && c.linkedUserId !== v4.userId) return false;
      const surname = extractSurname(c.name);
      return surname && surname.toLowerCase() === want;
    });
  }, [data?.clinicians, userLastName, linkedClinicianId, v4.userId]);

  const claim = async (clinicianId) => {
    setBusy(clinicianId);
    setError('');
    const { error: rpcErr } = await supabase.rpc('claim_clinician_as_self', {
      target_clinician_id: clinicianId,
    });
    setBusy(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    // Reload so the data layer picks up the new linkage and the banner
    // disappears for the rest of the session.
    window.location.reload();
  };

  const markNonClinical = async () => {
    if (!practiceId || !v4.userId) return;
    if (!confirm("Mark yourself as non-clinical for this practice?\n\nThis hides the 'Is this you?' suggestion and the 'Not linked to a clinician' warning on the Users tab. You can switch back later from Account settings.")) return;
    setMarkingNonClinical(true);
    setError('');
    const { error: rpcErr } = await supabase.rpc('set_member_non_clinical_flag', {
      target_practice_id: practiceId,
      target_user_id: v4.userId,
      marked: true,
    });
    setMarkingNonClinical(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    window.location.reload();
  };

  // Suppress entirely if the user has explicitly said they're not a clinician
  // here. The banner only ever showed when there was a surname match against
  // an unlinked clinician, but even that's misleading for shared-surname
  // staff who happen to be non-clinical.
  if (markedNonClinical) return null;

  if (dismissed || candidates.length === 0) return null;

  return (
    <div style={{
      marginBottom: 20,
      padding: '14px 16px',
      background: 'rgba(16,185,129,0.08)',
      border: '1px solid rgba(16,185,129,0.2)',
      borderRadius: 10,
      lineHeight: 1.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: candidates.length > 0 ? 10 : 0 }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#cbd5e1' }}>
            <strong style={{ color: '#34d399' }}>
              {candidates.length === 1 ? 'Is this you?' : 'Are you one of these?'}
            </strong>
            {' · '}Linking your account to a clinician record gives you a personal rota, lets you add private notes, and shows your name on the huddle board.
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: 18,
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
          title="Dismiss for this session"
          aria-label="Dismiss"
        >×</button>
      </div>

      {error && (
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 6,
          fontSize: 12,
          color: '#fca5a5',
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {candidates.map(c => (
          <button
            key={c.id}
            onClick={() => claim(c.id)}
            disabled={busy === c.id}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 500,
              color: 'white',
              background: '#10b981',
              border: 'none',
              borderRadius: 6,
              cursor: busy === c.id ? 'wait' : 'pointer',
              opacity: busy === c.id ? 0.7 : 1,
            }}
          >
            {busy === c.id ? 'Linking…' : `Yes, I'm ${c.name}`}
          </button>
        ))}
        {/* "I'm not a clinician" — sets the persistent flag so this banner
            (and the matching Users-tab warning) stays away. Distinct from
            the × dismiss which is just session-local. */}
        <button
          onClick={markNonClinical}
          disabled={markingNonClinical}
          style={{
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 500,
            color: '#cbd5e1',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            cursor: markingNonClinical ? 'wait' : 'pointer',
            opacity: markingNonClinical ? 0.6 : 1,
          }}
        >
          {markingNonClinical ? 'Saving…' : "I'm not a clinician"}
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
        Wrong match? You can pick yourself manually in Account → "Your clinician record".
      </div>
    </div>
  );
}
