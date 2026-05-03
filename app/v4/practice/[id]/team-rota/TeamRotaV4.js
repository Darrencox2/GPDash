'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { DAYS } from '@/lib/data';

// v4 TeamRota — fully ported, with real Postgres mutation wiring.
//
// Reads working_patterns + clinicians from props (loaded server-side).
// Writes go directly to Supabase via the client (RLS enforces admin-only).

export default function TeamRotaV4({ data: initialData, practiceId }) {
  const router = useRouter();
  const supabase = createClient();
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const ensureArray = (v) => Array.isArray(v) ? v : [];

  // Toggle: when clicked, optimistically update local state then persist.
  const toggleRotaDay = async (clinicianId, dayName) => {
    setError('');
    const currentList = ensureArray(data.weeklyRota[dayName]);
    const isCurrentlyWorking = currentList.includes(clinicianId);
    const newList = isCurrentlyWorking
      ? currentList.filter(id => id !== clinicianId)
      : [...currentList, clinicianId];

    // Optimistic local update
    setData({
      ...data,
      weeklyRota: { ...data.weeklyRota, [dayName]: newList },
    });

    // Persist: read existing pattern, modify, write back
    if (!supabase) {
      setError('Supabase not configured');
      return;
    }

    startTransition(async () => {
      try {
        // 1. Get the current pattern row (only the "current" effective_to=null row)
        const { data: existing, error: fetchErr } = await supabase
          .from('working_patterns')
          .select('id, pattern')
          .eq('clinician_id', clinicianId)
          .is('effective_to', null)
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        const newPattern = { ...(existing?.pattern || {}) };
        if (isCurrentlyWorking) {
          delete newPattern[dayName];
        } else {
          newPattern[dayName] = { am: 'in', pm: 'in' };
        }

        if (existing) {
          // Update existing pattern
          const { error: updErr } = await supabase
            .from('working_patterns')
            .update({ pattern: newPattern })
            .eq('id', existing.id);
          if (updErr) throw updErr;
        } else {
          // Create a new pattern row
          const { error: insErr } = await supabase
            .from('working_patterns')
            .insert({
              clinician_id: clinicianId,
              effective_from: '1970-01-01',
              effective_to: null,
              pattern: newPattern,
            });
          if (insErr) throw insErr;
        }

        // Audit
        await supabase.rpc('log_audit_event', {
          target_practice_id: practiceId,
          event_type: 'working_pattern_changed',
          description: `Toggled ${dayName} for clinician ${clinicianId} (${isCurrentlyWorking ? 'off' : 'on'})`,
          details: { clinician_id: clinicianId, day: dayName, action: isCurrentlyWorking ? 'removed' : 'added' },
        });
      } catch (err) {
        setError(err.message);
        // Roll back optimistic update on failure
        setData({
          ...data,
          weeklyRota: { ...data.weeklyRota, [dayName]: currentList },
        });
      }
    });
  };

  const visibleClinicians = ensureArray(data.clinicians).filter(c =>
    c.buddyCover && c.status !== 'left' && c.status !== 'administrative'
  );

  return (
    <div style={{ background: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: 20, color: '#1e293b' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
          Clinician Rota
        </h2>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          Standard weekly working pattern — click any cell to toggle. Changes persist immediately.
        </p>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Clinician</th>
              {DAYS.map(d => (
                <th key={d} style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, width: 80 }}>
                  {d.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleClinicians.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 6,
                      background: '#e2e8f0', color: '#475569',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                    }}>{c.initials}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{c.role}</div>
                    </div>
                  </div>
                </td>
                {DAYS.map(d => {
                  const isWorking = ensureArray(data.weeklyRota[d]).includes(c.id);
                  return (
                    <td key={d} style={{ textAlign: 'center', padding: '10px 12px' }}>
                      <button
                        onClick={() => toggleRotaDay(c.id, d)}
                        disabled={isPending}
                        style={{
                          width: 32, height: 32, borderRadius: 6, border: 'none',
                          background: isWorking ? '#d1fae5' : '#f1f5f9',
                          color: isWorking ? '#059669' : '#94a3b8',
                          fontSize: 14, fontWeight: 600, cursor: 'pointer',
                          opacity: isPending ? 0.5 : 1,
                          transition: 'background 0.1s',
                        }}
                      >{isWorking ? '✓' : '—'}</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, color: '#64748b' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#d1fae5' }}></span>
          Working
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#f1f5f9' }}></span>
          Day off
        </span>
        {isPending && <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>Saving...</span>}
      </div>
    </div>
  );
}
