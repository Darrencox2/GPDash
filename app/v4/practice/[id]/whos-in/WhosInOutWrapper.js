'use client';
import { useState } from 'react';
import WhosInOut from '@/components/huddle/WhosInOut';

// Client wrapper for the v3 WhosInOut component. The actual component is
// unchanged — we just need a 'use client' boundary plus a stub saveData
// that warns if mutations are attempted (we'll wire writes in a later step).
//
// Reads work fully against v4 Postgres data passed in from the server.

export default function WhosInOutWrapper({ data: initialData, huddleData }) {
  const [data, setData] = useState(initialData);
  const [warned, setWarned] = useState(false);

  const saveData = (newData, _persist = true) => {
    // Optimistic local update (so the UI reacts) without persisting yet.
    setData(newData);
    if (!warned) {
      console.warn('v4 WhosInOut: mutations are not yet persisted. Local state only.');
      setWarned(true);
    }
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.96)',
      borderRadius: 12,
      padding: 16,
      color: '#1e293b',
    }}>
      {warned && (
        <div style={{
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: 8,
          padding: 10,
          fontSize: 12,
          color: '#92400e',
          marginBottom: 12,
        }}>
          ⚠ Read-only preview — changes are kept locally only. Mutation wiring comes next.
        </div>
      )}
      <WhosInOut data={data} saveData={saveData} huddleData={huddleData} />
    </div>
  );
}
