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
  const [viewingDate, setViewingDate] = useState(() => new Date());

  const saveData = (newData, _persist = true) => {
    setData(newData);
    if (!warned) {
      console.warn('v4 WhosInOut: mutations are not yet persisted. Local state only.');
      setWarned(true);
    }
  };

  const navigateDay = (dir) => {
    const d = new Date(viewingDate);
    d.setDate(d.getDate() + dir);
    setViewingDate(d);
  };
  const goToday = () => setViewingDate(new Date());
  const goNextWorking = () => {
    const d = new Date(viewingDate);
    let i = 0;
    do {
      d.setDate(d.getDate() + 1);
      i++;
    } while ((d.getDay() === 0 || d.getDay() === 6) && i < 7);
    setViewingDate(d);
  };

  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][viewingDate.getDay()];
  const isWeekend = viewingDate.getDay() === 0 || viewingDate.getDay() === 6;
  const dateStr = viewingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const isToday = new Date().toDateString() === viewingDate.toDateString();

  return (
    <div>
      {/* Date navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
        <button onClick={() => navigateDay(-1)} style={navBtnStyle}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0', minWidth: 220 }}>{dateStr}</span>
        <button onClick={() => navigateDay(1)} style={navBtnStyle}>›</button>
        {!isToday && <button onClick={goToday} style={linkBtnStyle}>Today</button>}
        {isWeekend && <button onClick={goNextWorking} style={linkBtnStyle}>Skip to next weekday →</button>}
      </div>

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
        {isWeekend && (
          <div style={{
            background: '#dbeafe',
            border: '1px solid #93c5fd',
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            color: '#1e40af',
            textAlign: 'center',
          }}>
            🏠 Practice closed ({dayName}). Use 'Skip to next weekday' above to find a working day.
          </div>
        )}
        {!isWeekend && (
          <WhosInOut data={data} saveData={saveData} huddleData={huddleData} viewingDate={viewingDate} />
        )}
      </div>
    </div>
  );
}

const navBtnStyle = {
  padding: '4px 10px',
  fontSize: 14,
  fontWeight: 500,
  color: '#cbd5e1',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const linkBtnStyle = {
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 500,
  color: '#a78bfa',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
