import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

// /v4-test — confirms Supabase connection is wired up correctly.
// Server component: queries Supabase from the server, never exposes credentials.
// Once auth and tables exist, this page goes away.

export const dynamic = 'force-dynamic';

export default async function V4Test() {
  let connectionStatus = 'unknown';
  let authStatus = 'unknown';
  let envStatus = 'unknown';
  let dbStatus = 'unknown';
  let dbDetail = '';
  let detail = '';
  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '(not set)';

  // Mask the URL for display — show project ref but not full domain
  const maskedUrl = supabaseUrl !== '(not set)'
    ? supabaseUrl.replace(/https:\/\/([^.]{4}).*/, 'https://$1████.supabase.co')
    : supabaseUrl;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    envStatus = 'missing';
    detail = 'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in environment.';
  } else {
    envStatus = 'ok';
    try {
      const cookieStore = await cookies();
      const supabase = createClient(cookieStore);
      // Check auth (no user yet — that's expected, we just want it to not crash)
      const { data: { user } } = await supabase.auth.getUser();
      authStatus = user ? `signed in as ${user.email}` : 'no user signed in (expected)';
      connectionStatus = 'ok';

      // Try reading the practices table — confirms schema migration ran
      const { data: practices, error: dbErr } = await supabase
        .from('practices')
        .select('id, name')
        .limit(5);

      if (dbErr) {
        if (dbErr.code === '42P01') {
          // relation does not exist
          dbStatus = 'no schema';
          dbDetail = 'Tables not created yet. Run migration 001_practices_users_membership.sql in Supabase SQL editor.';
        } else {
          dbStatus = 'error';
          dbDetail = `${dbErr.code || 'unknown'}: ${dbErr.message}`;
        }
      } else {
        dbStatus = 'ok';
        dbDetail = `Read ${practices.length} practice row(s) — RLS working (anonymous user sees 0 rows).`;
      }
    } catch (err) {
      connectionStatus = 'failed';
      detail = err.message;
    }
  }

  const Pill = ({ status, children }) => {
    const colour =
      status === 'ok' ? '#10b981' :
      status === 'missing' || status === 'failed' ? '#ef4444' :
      '#f59e0b';
    return (
      <span style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: `${colour}22`,
        color: colour,
        border: `1px solid ${colour}55`,
      }}>{children}</span>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: '#e2e8f0',
      padding: 32,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 600, marginBottom: 8 }}>
          GPDash v4 — Supabase connection test
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 32 }}>
          Diagnostic page. Confirms Supabase is wired up before we build any features.
        </p>

        <div style={{
          background: 'rgba(15,23,42,0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: 24,
        }}>
          <Row label="Environment variables" status={envStatus}>
            <Pill status={envStatus}>{envStatus === 'ok' ? 'set' : 'missing'}</Pill>
          </Row>

          <Row label="Project URL" status={envStatus === 'ok' ? 'ok' : 'unknown'}>
            <code style={{ fontSize: 12, color: '#94a3b8' }}>{maskedUrl}</code>
          </Row>

          <Row label="Supabase connection" status={connectionStatus}>
            <Pill status={connectionStatus}>
              {connectionStatus === 'ok' ? 'connected' : connectionStatus === 'failed' ? 'failed' : 'not tested'}
            </Pill>
          </Row>

          <Row label="Auth state" status={authStatus.includes('signed in') ? 'ok' : 'unknown'}>
            <span style={{ fontSize: 13, color: '#cbd5e1' }}>{authStatus}</span>
          </Row>

          <Row label="Database (practices table)" status={dbStatus}>
            <Pill status={dbStatus}>
              {dbStatus === 'ok' ? 'reading' : dbStatus === 'no schema' ? 'no schema' : dbStatus === 'error' ? 'error' : 'not tested'}
            </Pill>
          </Row>

          {dbDetail && (
            <div style={{
              marginTop: 8,
              padding: 10,
              background: dbStatus === 'ok' ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${dbStatus === 'ok' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.25)'}`,
              borderRadius: 8,
              fontSize: 12,
              color: '#cbd5e1',
            }}>
              {dbDetail}
            </div>
          )}

          {detail && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              fontSize: 12,
              color: '#fca5a5',
              fontFamily: 'monospace',
            }}>
              {detail}
            </div>
          )}
        </div>

        <p style={{ color: '#64748b', fontSize: 11, marginTop: 24, textAlign: 'center' }}>
          v4-rebuild branch · this page never appears in production
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: 13, color: '#94a3b8' }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}
