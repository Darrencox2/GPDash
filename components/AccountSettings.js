'use client';

// Account settings — accessed via the sidebar "Account" item.
// Reads from data._v4 which the dashboard injects with userId/email/etc.
// Renders bits relevant to the signed-in user (vs. the practice itself).

import { useState } from 'react';
import { confirmDialog } from '@/components/ui';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { roleLabel, isPlatformAdmin, isOwner, isAdmin, canEditPracticeData } from '@/lib/permissions';

export default function AccountSettings({ data }) {
  const supabase = createClient();
  const router = useRouter();
  const v4 = data?._v4 || {};
  const linkedName = v4.linkedClinicianName;
  const linkedId = v4.linkedClinicianId;
  const practiceId = v4.practiceId;
  const userId = v4.userId;
  const markedNonClinical = !!v4.markedNonClinical;

  const [signOutBusy, setSignOutBusy] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [nonClinicalBusy, setNonClinicalBusy] = useState(false);
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

  const setNonClinical = async (marked) => {
    if (marked && !(await confirmDialog({ message: "Mark yourself as non-clinical for this practice?\n\nThis hides the 'Is this you?' suggestion on the dashboard and the 'Not linked' warning on the Users tab. You can switch back here anytime.", danger: false }))) return;
    if (!marked && !(await confirmDialog({ message: "Unmark yourself as non-clinical?\n\nThe linking prompts will reappear until you pick a clinician record.", danger: false }))) return;
    setNonClinicalBusy(true); setError('');
    const { error: rpcErr } = await supabase.rpc('set_member_non_clinical_flag', {
      target_practice_id: practiceId,
      target_user_id: userId,
      marked,
    });
    setNonClinicalBusy(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    window.location.reload();
  };

  const unlinkSelf = async () => {
    if (!(await confirmDialog({ message: 'Unlink your account from this clinician? You can re-link later.', danger: false }))) return;
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
    // Audit logout BEFORE actually signing out — after signOut, auth.uid()
    // is null and the RPC rejects.
    await supabase.rpc('log_auth_event', {
      event_type: 'logout',
      details: null,
    }).then(null, () => {});
    await supabase.auth.signOut();
    router.push('/v4/login');
  };

  // If we're not in v4 mode (running on production v3 shell), show a message
  if (!v4.userId) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white" style={{fontFamily:"var(--font-heading)"}}>Account</h1>
        <div className="card p-5">
          <p className="text-sm text-slate-400">Account settings are not available in legacy mode.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white" style={{fontFamily:"var(--font-heading)"}}>Account</h1>
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
          <Row label="Role"><RoleBadge data={data} /></Row>
          <Row label="User ID"><span className="font-mono text-xs">{v4.userId}</span></Row>
        </div>
        <div className="mt-4 flex gap-2 flex-wrap">
          <a href="/v4/reset-password" className="px-3 py-1.5 text-sm rounded-md bg-slate-100 hover:bg-slate-200 text-slate-400">Change password</a>
          <button onClick={signOut} disabled={signOutBusy} className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{signOutBusy ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </div>

      {/* ─── Linked clinician ─── */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Your clinician record</h2>
        <p className="text-xs text-slate-400 mb-3">
          Linking your account to a clinician record lets My Rota and personal notes know which person you are.
          If you're not a clinician at this practice (e.g. practice manager, reception, IT), pick the
          "I'm not a clinician here" option instead.
        </p>
        {linkedId ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-400">
              Linked to <strong>{linkedName}</strong>
            </div>
            <button onClick={unlinkSelf} disabled={unlinkBusy} className="px-3 py-1.5 text-sm rounded-md bg-slate-100 hover:bg-slate-200 text-slate-400 disabled:opacity-50">
              {unlinkBusy ? 'Unlinking…' : 'Unlink'}
            </button>
          </div>
        ) : markedNonClinical ? (
          <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-slate-50 border border-slate-200">
            <div className="text-sm text-slate-400">
              You're marked as <strong>non-clinical</strong> at this practice.
              <div className="text-xs text-slate-400 mt-1">No clinician record will be linked. Linking prompts are suppressed.</div>
            </div>
            <button onClick={() => setNonClinical(false)} disabled={nonClinicalBusy} className="px-3 py-1.5 text-sm rounded-md bg-slate-100 hover:bg-slate-200 text-slate-400 disabled:opacity-50 whitespace-nowrap">
              {nonClinicalBusy ? '…' : 'I am clinical'}
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
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={linkSelf}
                disabled={!pickClinician}
                className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Link this clinician to me
              </button>
              <span className="text-xs text-slate-400">or</span>
              <button
                onClick={() => setNonClinical(true)}
                disabled={nonClinicalBusy}
                className="px-3 py-1.5 text-sm rounded-md bg-white border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-50"
              >
                {nonClinicalBusy ? '…' : "I'm not a clinician here"}
              </button>
            </div>
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
          {canEditPracticeData(data) && (
            <a href={`/v4/practice/${v4.practiceSlug || practiceId}`} className="px-3 py-1.5 text-sm rounded-md bg-slate-100 hover:bg-slate-200 text-slate-400">Manage practice (members, invites)</a>
          )}
          <a href="/v4/dashboard" className="px-3 py-1.5 text-sm rounded-md bg-slate-100 hover:bg-slate-200 text-slate-400">Switch practice</a>
        </div>
      </div>

      {/* ─── Calendar — placeholder for future ─── */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Calendar subscription</h2>
        <p className="text-xs text-slate-400">
          Subscribe your phone or computer calendar to your rota — coming soon.
          You'll be able to generate a private iCal URL so your working days, absences,
          and on-call commitments appear in Apple Calendar / Google Calendar / Outlook.
        </p>
      </div>

      {/* ─── Data & Privacy ─── */}
      <DataAndPrivacy userEmail={v4.userEmail} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Data & Privacy section — GDPR Article 15 (data export) + Article 17
// (right to erasure). The export endpoint streams a JSON archive; the
// delete flow walks a confirmation dialog with a typed-email guard and
// surfaces blockers (sole owner, sole platform admin) from the
// /api/v4/account/delete-check pre-flight before letting the user
// click the destructive button.
// ─────────────────────────────────────────────────────────────────────────
function DataAndPrivacy({ userEmail }) {
  const router = useRouter();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const exportData = async () => {
    setExportBusy(true); setExportError('');
    try {
      const res = await fetch('/api/v4/account/export');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setExportError(err.error || `Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use the filename suggested by the Content-Disposition header,
      // falling back to a sensible default if absent.
      const dispo = res.headers.get('content-disposition') || '';
      const m = /filename="([^"]+)"/.exec(dispo);
      a.download = m ? m[1] : `gpdash-account-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e?.message || 'Export failed');
    } finally {
      setExportBusy(false);
    }
  };

  const openDeleteModal = async () => {
    setShowDeleteModal(true);
    setCheckLoading(true);
    setCheckResult(null);
    setDeleteError('');
    setConfirmText('');
    try {
      const res = await fetch('/api/v4/account/delete-check');
      const json = await res.json();
      setCheckResult(json);
    } catch (e) {
      setCheckResult({ can_delete: false, blockers: [{ type: 'network', message: 'Could not run pre-flight check. Please try again.' }] });
    } finally {
      setCheckLoading(false);
    }
  };

  const doDelete = async () => {
    if (!checkResult?.can_delete) return;
    if (confirmText.trim().toLowerCase() !== (userEmail || '').trim().toLowerCase()) {
      setDeleteError('Type your account email exactly to confirm.');
      return;
    }
    setDeleteBusy(true); setDeleteError('');
    try {
      const res = await fetch('/api/v4/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_email: confirmText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDeleteError(json.error || `Deletion failed (${res.status})`);
        setDeleteBusy(false);
        return;
      }
      // Successful — bounce to /v4/goodbye via a full reload so all client
      // state is discarded and the now-invalid session is forgotten.
      window.location.href = json.redirect || '/v4/goodbye';
    } catch (e) {
      setDeleteError(e?.message || 'Deletion failed');
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Data &amp; privacy</h2>
        <p className="text-xs text-slate-400 mb-4">
          Your rights under UK GDPR. Export gives you a JSON archive of
          everything we hold about your account; deletion permanently
          removes your account and anonymises any audit log entries you
          appeared in.
        </p>

        <div className="space-y-3">
          {/* Export */}
          <div className="flex items-start justify-between gap-3 py-2">
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900">Export my data</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Download a JSON archive of your profile, practice memberships,
                MFA factors (metadata only), and all audit / auth events you
                appear in. Does not include practice-scoped data (clinicians,
                rotas, CSVs) — the practice is the controller for that data.
              </div>
            </div>
            <button
              onClick={exportData}
              disabled={exportBusy}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              style={{
                background: '#0e7490',
                color: 'white',
                border: 'none',
              }}
            >
              {exportBusy ? 'Preparing…' : 'Download JSON'}
            </button>
          </div>
          {exportError && (
            <div className="text-xs text-red-600 px-2 py-1.5 rounded-md" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              {exportError}
            </div>
          )}

          {/* Delete */}
          <div
            className="flex items-start justify-between gap-3 py-3 mt-3"
            style={{ borderTop: '1px solid #e2e8f0' }}
          >
            <div className="flex-1">
              <div className="text-sm font-medium text-red-700">Delete my account</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Permanent. Removes your profile, MFA factors, and practice
                memberships. Audit log entries you appeared in are anonymised
                but kept for practice integrity. Cannot be undone.
              </div>
            </div>
            <button
              onClick={openDeleteModal}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: 'white',
                color: '#b91c1c',
                border: '1px solid #fecaca',
              }}
            >
              Delete account…
            </button>
          </div>
        </div>
      </div>

      {/* ─── Delete modal ─── */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-xl"
            style={{ background: 'white', border: '1px solid #e2e8f0', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div className="px-5 py-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
              <div className="text-base font-semibold text-red-700">Delete your GPDash account</div>
              <div className="text-xs text-slate-400 mt-1">
                This action is permanent. Read carefully before proceeding.
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              {checkLoading ? (
                <div className="text-sm text-slate-400 py-4">Running pre-flight checks…</div>
              ) : checkResult?.can_delete === false ? (
                <>
                  <div className="text-sm font-medium text-slate-900 mb-1">
                    You can&apos;t delete your account yet:
                  </div>
                  {checkResult.blockers.map((b, i) => (
                    <div
                      key={i}
                      className="px-3 py-2.5 rounded-md text-xs"
                      style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#7f1d1d' }}
                    >
                      <div className="font-medium mb-1">{b.message}</div>
                      {b.action && <div className="opacity-80">{b.action}</div>}
                      {b.practices && b.practices.length > 0 && (
                        <ul className="mt-1.5 ml-3 list-disc opacity-80">
                          {b.practices.map(p => <li key={p.slug}>{p.name} <span className="opacity-60">({p.slug})</span></li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div
                    className="px-3 py-2.5 rounded-md text-xs"
                    style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#78350f' }}
                  >
                    <div className="font-medium mb-1">This will:</div>
                    <ul className="ml-4 list-disc space-y-0.5 opacity-90">
                      <li>Permanently delete your profile and MFA factors</li>
                      <li>Remove your practice memberships</li>
                      <li>Anonymise (not delete) audit log entries you appeared in</li>
                      <li>Sign you out and discard your session</li>
                    </ul>
                  </div>
                  <div className="text-xs text-slate-400 leading-relaxed">
                    To confirm, type your account email below:{' '}
                    <span className="font-mono font-medium text-slate-900">{userEmail}</span>
                  </div>
                  <input
                    type="email"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="your email"
                    autoComplete="off"
                    className="w-full px-3 py-2 rounded-md text-sm"
                    style={{ border: '1px solid #cbd5e1' }}
                  />
                </>
              )}

              {deleteError && (
                <div className="text-xs text-red-700 px-3 py-2 rounded-md" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                  {deleteError}
                </div>
              )}
            </div>

            <div
              className="px-5 py-3 flex items-center justify-end gap-2"
              style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', borderBottomLeftRadius: '0.75rem', borderBottomRightRadius: '0.75rem' }}
            >
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteBusy}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-400"
                style={{ background: 'white', border: '1px solid #cbd5e1' }}
              >
                Cancel
              </button>
              {checkResult?.can_delete && (
                <button
                  onClick={doDelete}
                  disabled={deleteBusy || confirmText.trim().toLowerCase() !== (userEmail || '').trim().toLowerCase()}
                  className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
                  style={{ background: '#b91c1c', color: 'white', border: 'none' }}
                >
                  {deleteBusy ? 'Deleting…' : 'Permanently delete my account'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-slate-900">{children}</span>
    </div>
  );
}

function RoleBadge({ data }) {
  const label = roleLabel(data);
  // Colour by role: cyan = platform admin, emerald = owner, amber = admin, slate = user
  const palette = isPlatformAdmin(data)
    ? { bg: '#cffafe', fg: '#0e7490', border: '#67e8f9' }
    : isOwner(data)
    ? { bg: '#d1fae5', fg: '#065f46', border: '#6ee7b7' }
    : isAdmin(data)
    ? { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' }
    : { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      background: palette.bg,
      color: palette.fg,
      border: `1px solid ${palette.border}`,
      borderRadius: 'var(--r-pill)',
      fontSize: 12,
      fontWeight: 500,
    }}>{label}</span>
  );
}
