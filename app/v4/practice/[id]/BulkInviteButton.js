'use client';

// BulkInviteButton — modal flow for inviting many people at once.
//
// Two-stage:
//   1. Paste anything (Outlook contact list, comma-separated emails,
//      "Name <email>" pairs, line-separated, mixed). Click "Parse".
//      lib/parse-emails extracts emails and (where available) display
//      names.
//   2. Show extracted list, each with a role dropdown (default: User).
//      Admin can adjust per row, remove rows, see counts. Click "Send N
//      invites" → calls bulk_invite_users_to_practice RPC. Result panel
//      shows per-row outcome (created / already a member / already
//      invited / error).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { parseEmails } from '@/lib/parse-emails';

export default function BulkInviteButton({ practiceId, canMakeOwner }) {
  const router = useRouter();
  const supabase = createClient();
  const [showModal, setShowModal] = useState(false);
  const [stage, setStage] = useState('paste'); // 'paste' | 'review' | 'submitting' | 'done'
  const [rawInput, setRawInput] = useState('');
  const [rows, setRows] = useState([]); // [{ email, displayName?, role }]
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const close = () => {
    setShowModal(false);
    // Reset after the close animation would complete
    setTimeout(() => {
      setStage('paste');
      setRawInput('');
      setRows([]);
      setResults(null);
      setError('');
    }, 200);
  };

  const parse = () => {
    const parsed = parseEmails(rawInput);
    if (parsed.length === 0) {
      setError("Couldn't find any email addresses in that. Try pasting again or check the format.");
      return;
    }
    setError('');
    setRows(parsed.map(p => ({ ...p, role: 'user' })));
    setStage('review');
  };

  const updateRole = (idx, role) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, role } : r));
  };
  const removeRow = (idx) => {
    setRows(rs => rs.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (rows.length === 0) return;
    setStage('submitting');
    setError('');
    const { data, error: err } = await supabase.rpc('bulk_invite_users_to_practice', {
      target_practice_id: practiceId,
      invitees: rows.map(r => ({ email: r.email, role: r.role })),
    });
    if (err) {
      setError(err.message);
      setStage('review');
      return;
    }
    setResults(data);
    setStage('done');
    router.refresh(); // pull fresh invites for the page
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          padding: '7px 14px',
          fontSize: 12,
          color: '#cbd5e1',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        + Bulk invite
      </button>

      {showModal && (
        <div style={overlay}>
          <div style={modal}>
            {/* Close button */}
            <button onClick={close} aria-label="Close" style={closeBtn}>×</button>

            {/* ─── Stage: paste ──────────────────────────────────── */}
            {stage === 'paste' && (
              <>
                <h3 style={modalTitle}>Bulk invite</h3>
                <p style={modalDesc}>
                  Paste a list of emails — anything goes. Plain emails, name-and-email pairs,
                  comma-separated, line-separated, or copied straight from Outlook contacts.
                  We'll extract the addresses; you assign roles in the next step.
                </p>
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={'sarah@example.com\nJohn Smith <john@example.com>\nrachel@example.com, mark@example.com'}
                  rows={8}
                  autoFocus
                  style={textarea}
                />
                {error && <div style={errorBox}>{error}</div>}
                <div style={buttonRow}>
                  <button onClick={close} style={btnSubtle}>Cancel</button>
                  <button onClick={parse} disabled={!rawInput.trim()} style={{ ...btnPrimary, opacity: rawInput.trim() ? 1 : 0.5 }}>
                    Parse →
                  </button>
                </div>
              </>
            )}

            {/* ─── Stage: review ─────────────────────────────────── */}
            {stage === 'review' && (
              <>
                <h3 style={modalTitle}>
                  Review {rows.length} invite{rows.length === 1 ? '' : 's'}
                </h3>
                <p style={modalDesc}>
                  Adjust roles if needed. Click an X to remove someone.
                </p>
                <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                  {rows.map((r, idx) => (
                    <div key={r.email} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderBottom: idx < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.email}
                        </div>
                        {r.displayName && (
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{r.displayName}</div>
                        )}
                      </div>
                      <select
                        value={r.role}
                        onChange={(e) => updateRole(idx, e.target.value)}
                        style={roleSelect}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        {canMakeOwner && <option value="owner">Owner</option>}
                      </select>
                      <button
                        onClick={() => removeRow(idx)}
                        title="Remove"
                        aria-label="Remove from list"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#64748b',
                          fontSize: 18,
                          cursor: 'pointer',
                          padding: 4,
                          lineHeight: 1,
                        }}
                      >×</button>
                    </div>
                  ))}
                </div>
                {error && <div style={errorBox}>{error}</div>}
                <div style={buttonRow}>
                  <button onClick={() => { setStage('paste'); setError(''); }} style={btnSubtle}>← Back</button>
                  <button onClick={submit} disabled={rows.length === 0} style={btnPrimary}>
                    Send {rows.length} invite{rows.length === 1 ? '' : 's'}
                  </button>
                </div>
              </>
            )}

            {/* ─── Stage: submitting ─────────────────────────────── */}
            {stage === 'submitting' && (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: '#94a3b8' }}>Sending invites…</div>
              </div>
            )}

            {/* ─── Stage: done ───────────────────────────────────── */}
            {stage === 'done' && results && (
              <>
                <h3 style={modalTitle}>Done</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  <SummaryStat label="Created" value={results.created} colour="#34d399" />
                  {results.skipped > 0 && <SummaryStat label="Skipped" value={results.skipped} colour="#94a3b8" />}
                  {results.errored > 0 && <SummaryStat label="Errored" value={results.errored} colour="#fca5a5" />}
                </div>
                {(results.skipped > 0 || results.errored > 0) && (
                  <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 14, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                    {results.results.filter(r => r.status !== 'created').map((r, idx) => (
                      <div key={idx} style={{
                        padding: '8px 12px',
                        fontSize: 12,
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <span style={{ color: '#cbd5e1' }}>{r.email}</span>
                        {' · '}
                        <span style={{ color: r.status === 'error' ? '#fca5a5' : '#94a3b8' }}>
                          {r.message || r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
                  Invite emails aren't sent automatically yet — copy each link from the
                  Pending invites list and forward it to the recipient.
                </div>
                <div style={buttonRow}>
                  <button onClick={close} style={btnPrimary}>Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SummaryStat({ label, value, colour }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 12px' }}>
      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: colour, fontFamily: "'Outfit', sans-serif" }}>{value}</div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 20,
};
const modal = {
  background: '#0f172a',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  padding: 24,
  maxWidth: 520,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  position: 'relative',
};
const closeBtn = {
  position: 'absolute', top: 14, right: 14,
  background: 'transparent', border: 'none', color: '#64748b',
  fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: 4,
};
const modalTitle = { fontSize: 16, fontWeight: 600, color: 'white', marginBottom: 8, fontFamily: "'Outfit', sans-serif" };
const modalDesc = { fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 };
const textarea = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 13,
  fontFamily: 'ui-monospace, Menlo, monospace',
  resize: 'vertical',
  minHeight: 140,
  marginBottom: 12,
};
const roleSelect = {
  padding: '4px 8px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  color: '#cbd5e1',
  fontSize: 12,
  cursor: 'pointer',
};
const errorBox = {
  padding: '8px 12px',
  background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.3)',
  color: '#fca5a5',
  fontSize: 12,
  borderRadius: 6,
  marginBottom: 12,
};
const buttonRow = { display: 'flex', gap: 8, justifyContent: 'flex-end' };
const btnPrimary = { padding: '8px 16px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSubtle = { padding: '8px 16px', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
