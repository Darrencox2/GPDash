'use client';

// Account settings — accessed via the sidebar "Account" item.
// Reads from data._v4 which the dashboard injects with userId/email/etc.
// Renders bits relevant to the signed-in user (vs. the practice itself).

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export default function AccountSettings({ data }) {
  const supabase = createClient();
  const router = useRouter();
  const v4 = data?._v4 || {};
  const linkedName = v4.linkedClinicianName;
  const linkedId = v4.linkedClinicianId;
  const practiceId = v4.practiceId;

  const [signOutBusy, setSignOutBusy] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [error, setError] = useState('');

  // Allow self-link via dropdown if not currently linked
  const activeUnlinkedClinicians = (data?.clinicians || []).filter(
    c => c.status === 'active' && !c.linkedUserId
  );

  const [pickClinician, setPickClinician] = useState('');

  const linkSelf = async () => {
    if (!pickClinician) return;
    setError('');
    const { error: rpcErr } = await supabase.rpc('claim_clinician_as_self', {
      target_clinician_id: pickClinician,
    });
    if (rpcErr) { setError(rpcErr.message); return; }
    window.location.reload();
  };

  const unlinkSelf = async () => {
    if (!confirm('Unlink your account from this clinician? You can re-link later.')) return;
    setUnlinkBusy(true); setError('');
    try {
      const { error: updErr } = await supabase
        .from('clinicians')
        .update({ linked_user_id: null })
        .eq('id', linkedId);
      if (updErr) throw updErr;
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Unlink failed');
    } finally {
      setUnlinkBusy(false);
    }
  };

  const signOut = async () => {
    setSignOutBusy(true);
    await supabase.auth.signOut();
    router.push('/v4/login');
  };

  // If we're not in v4 mode (running on production v3 shell), show a message
  if (!v4.userId) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white" style={{fontFamily:"'Outfit',sans-serif"}}>Account</h1>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Account settings are not available in legacy mode.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white" style={{fontFamily:"'Outfit',sans-serif"}}>Account</h1>
        <p className="text-sm text-slate-400 mt-1">Settings for your sign-in, your linked clinician record, and personal preferences.</p>
      </div>

      {error && (
        <div className="card p-3 bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      {/* ─── Sign-in details ─── */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Sign-in</h2>
        <div className="space-y-2 text-sm">
          <Row label="Email">{v4.userEmail}</Row>
          <Row label="User ID"><span className="font-mono text-xs">{v4.userId}</span></Row>
        </div>
        <div className="mt-4 flex gap-2 flex-wrap">
          <a href="/v4/reset-password" className="px-3 py-1.5 text-sm rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700">Change password</a>
          <button onClick={signOut} disabled={signOutBusy} className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{signOutBusy ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </div>

      {/* ─── Linked clinician ─── */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Your clinician record</h2>
        <p className="text-xs text-slate-500 mb-3">
          Linking your account to a clinician record lets My Rota and personal notes know which person you are.
        </p>
        {linkedId ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              Linked to <strong>{linkedName}</strong>
            </div>
            <button onClick={unlinkSelf} disabled={unlinkBusy} className="px-3 py-1.5 text-sm rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50">
              {unlinkBusy ? 'Unlinking…' : 'Unlink'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <select
              value={pickClinician}
              onChange={e => setPickClinician(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
            >
              <option value="">— Pick yourself from the active list —</option>
              {activeUnlinkedClinicians.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.initials ? `(${c.initials})` : ''}{c.role ? ` — ${c.role}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={linkSelf}
              disabled={!pickClinician}
              className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Link this clinician to me
            </button>
          </div>
        )}
      </div>

      {/* ─── Practice ─── */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Practice</h2>
        <div className="space-y-2 text-sm">
          <Row label="Current practice">{v4.practiceName}</Row>
        </div>
        <div className="mt-4 flex gap-2 flex-wrap">
          <a href={`/v4/practice/${practiceId}`} className="px-3 py-1.5 text-sm rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700">Manage practice (members, invites)</a>
          <a href="/v4/dashboard" className="px-3 py-1.5 text-sm rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700">Switch practice</a>
        </div>
      </div>

      {/* ─── Calendar — placeholder for future ─── */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Calendar subscription</h2>
        <p className="text-xs text-slate-500">
          Subscribe your phone or computer calendar to your rota — coming soon.
          You'll be able to generate a private iCal URL so your working days, absences,
          and on-call commitments appear in Apple Calendar / Google Calendar / Outlook.
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-slate-900">{children}</span>
    </div>
  );
}
