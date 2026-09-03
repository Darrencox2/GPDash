'use client';

// BuddyOverrideModal — manually reassign a buddy cover allocation
// with a required reason. Opens when an admin clicks an allocation
// badge in the buddy table. Builds a fresh allocations entry where
// the absent/dayoff clinician moves from their original coverer to
// the newly-chosen one, appends a record to manualOverrides so the
// override is visible inline, and writes an audit_event for the
// permanent trail.
//
// Why a required reason: the algorithm tries to optimise across
// fairness, workload, and ability-to-cover constraints. Silent
// overrides accumulate and the model can't learn from them. With a
// reason captured, future iterations can mine the trail ("this
// person is consistently overridden when paired with X — is there
// something we should weight differently?").

import { useState, useMemo } from 'react';

export default function BuddyOverrideModal({
  open,
  onClose,
  dateKey,
  allocationEntry,            // { allocations, dayOffAllocations, presentIds, manualOverrides? }
  absentClinicianId,          // who's currently being covered
  coverType,                  // 'absent' or 'dayOff'
  currentCovererId,           // who's currently covering them
  cliniciansList,             // full list for name lookup
  onSave,                     // (newEntry, override) => Promise
}) {
  const [newCovererId, setNewCovererId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const getById = (id) => (cliniciansList || []).find(c => c.id === id);
  const absent = getById(absentClinicianId);
  const currentCoverer = getById(currentCovererId);

  // Eligible new coverers: clinicians who are present today, can
  // provide cover, are in the buddy system, and aren't the
  // absent person nor the current coverer.
  const eligibleCoverers = useMemo(() => {
    if (!allocationEntry) return [];
    const presentIds = new Set(allocationEntry.presentIds || []);
    return (cliniciansList || []).filter(c =>
      presentIds.has(c.id)
      && c.id !== absentClinicianId
      && c.id !== currentCovererId
      && c.canProvideCover !== false
      && c.buddyCover !== false
      && c.status !== 'left'
      && c.status !== 'administrative'
    );
  }, [allocationEntry, cliniciansList, absentClinicianId, currentCovererId]);

  if (!open) return null;

  const handleSave = async () => {
    if (!newCovererId) { setErr('Pick someone to reassign to.'); return; }
    if (!reason.trim()) { setErr('Reason is required — even a few words helps.'); return; }

    setBusy(true);
    setErr('');

    // Build the new allocations entry. Pull the absent person out of
    // the original coverer's array; push them into the new coverer's.
    const field = coverType === 'dayOff' ? 'dayOffAllocations' : 'allocations';
    const oldMap = { ...(allocationEntry[field] || {}) };
    // Remove from old coverer
    oldMap[currentCovererId] = (oldMap[currentCovererId] || []).filter(id => id !== absentClinicianId);
    if (oldMap[currentCovererId].length === 0) delete oldMap[currentCovererId];
    // Add to new coverer
    oldMap[newCovererId] = [...(oldMap[newCovererId] || []), absentClinicianId];

    const override = {
      absentId: absentClinicianId,
      type: coverType,
      fromCovererId: currentCovererId,
      toCovererId: newCovererId,
      reason: reason.trim(),
      at: new Date().toISOString(),
    };

    const newEntry = {
      ...allocationEntry,
      [field]: oldMap,
      manualOverrides: [...(allocationEntry.manualOverrides || []), override],
    };

    const res = await onSave(newEntry, override);
    if (res?.error) {
      setErr(res.error);
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
  };

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-solid)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: 24,
          maxWidth: 480, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
          Reassign buddy cover
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-2)' }}>{currentCoverer?.name || '—'}</strong> is currently covering{' '}
          <strong style={{ color: 'var(--text-2)' }}>{absent?.name || '—'}</strong>
          {' '}({coverType === 'dayOff' ? 'view-only — day off' : 'absent — file & action'}).
        </div>

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reassign to</label>
        <select
          value={newCovererId}
          onChange={(e) => setNewCovererId(e.target.value)}
          disabled={busy}
          style={{
            width: '100%', padding: '8px 10px', marginBottom: 14,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', color: 'var(--text-1)', fontSize: 14,
          }}
        >
          <option value="">— pick someone present today —</option>
          {eligibleCoverers.map(c => (
            <option key={c.id} value={c.id}>{c.name} {c.role ? `· ${c.role}` : ''}</option>
          ))}
        </select>
        {eligibleCoverers.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--c-amber-2)', marginBottom: 14, marginTop: -8 }}>
            No other eligible coverers available today.
          </div>
        )}

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          rows={2}
          placeholder="e.g. Sarah is already covering a separate clinic — swap to Tom"
          style={{
            width: '100%', padding: '8px 10px', marginBottom: 16,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', color: 'var(--text-1)', fontSize: 14,
            resize: 'vertical', fontFamily: 'inherit',
          }}
        />

        {err && (
          <div className="text-meta text-red-300 mb-3">{err}</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)', color: 'var(--text-3)', fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || eligibleCoverers.length === 0}
            style={{
              padding: '8px 14px',
              background: busy ? 'rgba(167, 139, 250, 0.3)' : '#a78bfa',
              border: 'none', borderRadius: 'var(--r-sm)', color: 'var(--g-text-max)',
              fontSize: 13, fontWeight: 500,
              cursor: busy ? 'wait' : (eligibleCoverers.length === 0 ? 'not-allowed' : 'pointer'),
              opacity: eligibleCoverers.length === 0 ? 0.5 : 1,
            }}
          >
            {busy ? 'Saving…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}
