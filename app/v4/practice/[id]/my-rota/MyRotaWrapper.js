'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import MyRota from '@/components/huddle/MyRota';

// MyRota client wrapper. Notes are personal — anyone whose clinician
// record is linked to their user account can write notes for themselves.
// RLS in rota_notes enforces self-or-admin only.
//
// The v3 component calls saveData with { ...data, rotaNotes: {...} }
// We diff old vs new rotaNotes to figure out which keys changed and
// translate to upsert/delete on the rota_notes table.

export default function MyRotaWrapper({ data: initialData, huddleData }) {
  const supabase = createClient();
  const [data, setData] = useState(initialData);
  const [error, setError] = useState('');

  const saveData = async (newData, _persist = true) => {
    // Optimistic local update
    const oldNotes = data.rotaNotes || {};
    const newNotes = newData.rotaNotes || {};
    setData(newData);
    setError('');

    if (!supabase) {
      setError('Supabase not configured');
      return;
    }

    // Diff notes to decide what to persist
    // Iterate every (clinicianId, date) in both old and new
    const allClinicianIds = new Set([...Object.keys(oldNotes), ...Object.keys(newNotes)]);
    const ops = [];

    for (const cid of allClinicianIds) {
      const oldDates = oldNotes[cid] || {};
      const newDates = newNotes[cid] || {};
      const allDates = new Set([...Object.keys(oldDates), ...Object.keys(newDates)]);

      for (const date of allDates) {
        const oldText = (oldDates[date] || '').trim();
        const newText = (newDates[date] || '').trim();
        if (oldText === newText) continue;

        if (newText === '') {
          // Deletion
          ops.push({ kind: 'delete', clinician_id: cid, date });
        } else {
          // Upsert
          ops.push({ kind: 'upsert', clinician_id: cid, date, note: newText });
        }
      }
    }

    if (ops.length === 0) return;

    // Run them in parallel
    try {
      await Promise.all(ops.map(async op => {
        if (op.kind === 'delete') {
          const { error: delErr } = await supabase
            .from('rota_notes')
            .delete()
            .eq('clinician_id', op.clinician_id)
            .eq('date', op.date);
          if (delErr) throw delErr;
        } else {
          const { error: upErr } = await supabase
            .from('rota_notes')
            .upsert({
              clinician_id: op.clinician_id,
              date: op.date,
              note: op.note,
            });
          if (upErr) throw upErr;
        }
      }));
    } catch (err) {
      setError(`Note save failed: ${err.message}`);
      // Roll back on failure
      setData(data);
    }
  };

  return (
    <div>
      {error && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          padding: 10,
          fontSize: 12,
          color: '#991b1b',
          marginBottom: 12,
        }}>{error}</div>
      )}
      <MyRota data={data} saveData={saveData} huddleData={huddleData} standalone={true} setActiveSection={() => {}} />
    </div>
  );
}
