'use client';
// The interactive half of the unsubscribe page.
//
// Nothing happens on load. The opt-out is a POST triggered by a button,
// because a link that acts on GET would be fired by mail scanners and Safe
// Links without anyone choosing to click it.
//
// After it succeeds, an Undo stays on screen. A misclick in an email footer
// is common and, without an undo, the only way back is to email the practice
// and ask an administrator to re-add you.

import { useState } from 'react';

const BTN = {
  display: 'inline-block', padding: '11px 20px', fontSize: 14, fontWeight: 600,
  borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
};
const H1 = { margin: '0 0 12px', fontSize: 22, fontWeight: 600, color: '#0f172a', lineHeight: 1.3 };
const P = { margin: '0 0 16px', fontSize: 14, lineHeight: 1.65, color: '#475569' };
const SMALL = { margin: '16px 0 0', fontSize: 12.5, lineHeight: 1.6, color: '#64748b' };

export default function UnsubscribeForm({ token, email, practiceName, reportNames, cadence, alreadyOff }) {
  const [state, setState] = useState(alreadyOff ? 'done' : 'idle');
  const [scope, setScope] = useState(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');

  const what = reportNames.length === 0 ? 'a report'
    : reportNames.length === 1 ? reportNames[0]
    : `${reportNames.slice(0, -1).join(', ')} and ${reportNames[reportNames.length - 1]}`;

  const post = async (chosenScope) => {
    setState('working'); setError('');
    try {
      const res = await fetch(`/api/v4/public/unsubscribe/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: chosenScope }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Something went wrong.');
      setScope(chosenScope); setPaused(!!json.paused); setState('done');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setState('idle');
    }
  };

  const undo = async () => {
    setState('working'); setError('');
    try {
      const res = await fetch(`/api/v4/public/unsubscribe/${encodeURIComponent(token)}/undo`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not undo that.');
      setState('idle'); setScope(null); setPaused(false);
    } catch (err) {
      setError(err.message || 'Could not undo that.');
      setState('done');
    }
  };

  if (state === 'done') {
    return (
      <>
        <h1 style={H1}>You have been unsubscribed</h1>
        <p style={P}>
          {scope === 'practice'
            ? <>We will stop sending <strong>all</strong> report emails from {practiceName} to <strong>{email}</strong>.</>
            : <>We will stop sending {what} to <strong>{email}</strong>.</>}
        </p>
        {scope !== 'practice' && (
          <p style={P}>
            If {practiceName} sends you other reports, those will still arrive.{' '}
            <button onClick={() => post('practice')} disabled={state === 'working'}
              style={{ background: 'none', border: 'none', padding: 0, color: '#0891b2', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
              Stop all report emails from {practiceName}
            </button>.
          </p>
        )}
        {paused && (
          <p style={{ ...P, padding: '11px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#475569' }}>
            You were the last person on that schedule, so it has been switched off.
          </p>
        )}
        <p style={SMALL}>
          Changed your mind?{' '}
          <button onClick={undo} disabled={state === 'working'}
            style={{ background: 'none', border: 'none', padding: 0, color: '#0891b2', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
            Undo and start receiving it again
          </button>.
        </p>
        {error && <p style={{ ...SMALL, color: '#b91c1c' }}>{error}</p>}
      </>
    );
  }

  return (
    <>
      <h1 style={H1}>Stop sending this to you?</h1>
      <p style={P}>
        <strong>{email}</strong> currently receives {what} from <strong>{practiceName}</strong>
        {cadence === 'daily' ? ' every day' : cadence === 'weekly' ? ' every week'
          : cadence === 'fortnightly' ? ' every two weeks' : cadence ? ' every month' : ''}.
      </p>
      <p style={P}>Nothing has changed yet. Press the button to stop it.</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
        <button onClick={() => post('schedule')} disabled={state === 'working'}
          style={{ ...BTN, background: '#0891b2', color: '#fff', opacity: state === 'working' ? 0.6 : 1 }}>
          {state === 'working' ? 'Working…' : 'Stop sending this'}
        </button>
        <button onClick={() => post('practice')} disabled={state === 'working'}
          style={{ ...BTN, background: '#fff', color: '#334155', border: '1px solid #cbd5e1', opacity: state === 'working' ? 0.6 : 1 }}>
          Stop all reports from {practiceName}
        </button>
      </div>

      {error && <p style={{ ...SMALL, color: '#b91c1c' }}>{error}</p>}
      <p style={SMALL}>
        Whoever set this report up will be told that you opted out, so they know the list changed.
        Your address is not shared with anyone else.
      </p>
    </>
  );
}
