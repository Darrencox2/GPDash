'use client';
import { useState } from 'react';

// Generic client wrapper for read-only v3 components ported to v4.
// Hosts a 'use client' boundary, keeps local state for optimistic updates,
// and provides a no-op saveData stub that warns once.
//
// Usage:
//   <V4ReadOnlyWrapper data={v3Data} huddleData={...}>
//     {(data, saveData) => <YourV3Component data={data} saveData={saveData} ... />}
//   </V4ReadOnlyWrapper>

export default function V4ReadOnlyWrapper({ data: initialData, children }) {
  const [data, setData] = useState(initialData);
  const [warned, setWarned] = useState(false);

  const saveData = (newData) => {
    setData(newData);
    if (!warned) setWarned(true);
  };

  return (
    <>
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
          ⚠ Read-only preview — changes are kept locally only this session.
        </div>
      )}
      {children(data, saveData)}
    </>
  );
}
