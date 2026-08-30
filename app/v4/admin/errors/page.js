// /v4/admin/errors — recent client crash reports.
//
// The other half of app_errors: capture is worthless if nobody looks.
// Platform admins only, enforced twice — the RPC guards on
// is_platform_admin() inside its own query, and RLS on the table has no
// broad select policy.
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import AdminNav from '../AdminNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Errors · GPDash admin' };

const SOURCE_STYLE = {
  boundary:  { bg: 'rgba(239,68,68,0.14)',  bd: 'rgba(239,68,68,0.38)',  fg: '#fca5a5', label: 'Section crash' },
  unhandled: { bg: 'rgba(245,158,11,0.14)', bd: 'rgba(245,158,11,0.38)', fg: '#fcd34d', label: 'Unhandled' },
  client:    { bg: 'rgba(148,163,184,0.12)',bd: 'rgba(148,163,184,0.3)', fg: '#94a3b8', label: 'Reported' },
};

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function AdminErrorsPage() {
  const supabase = createClient(await cookies());
  if (!supabase) redirect('/v4/login');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const { data: profile } = await supabase
    .from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_platform_admin) redirect('/v4/dashboard');

  const { data: errors, error } = await supabase.rpc('list_app_errors', { limit_count: 100 });

  return (
    <div style={{ minHeight: '100vh' }}>
      <AdminNav active="errors" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 64px' }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, color: '#f1f5f9', margin: '0 0 6px' }}>
          Errors
        </h1>
        <p style={{ fontSize: 14, color: 'var(--meta)', margin: '0 0 24px' }}>
          Crashes reported by browsers in the last 90 days, newest first. Cleared automatically by the retention job.
        </p>

        {error && (
          <div style={{ padding: 14, borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13 }}>
            Could not load errors: {error.message}
          </div>
        )}

        {!error && (!errors || errors.length === 0) && (
          <div style={{ padding: 28, textAlign: 'center', borderRadius: 'var(--r-lg)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 15, color: '#e2e8f0', marginBottom: 4 }}>No crashes reported</div>
            <div style={{ fontSize: 13, color: 'var(--meta)' }}>Which is the result you want. Reports appear here within seconds of happening.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(errors || []).map((e) => {
            const s = SOURCE_STYLE[e.source] || SOURCE_STYLE.client;
            return (
              <div key={e.id} style={{ padding: 16, borderRadius: 'var(--r-lg)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 'var(--r-pill)', background: s.bg, border: `1px solid ${s.bd}`, color: s.fg }}>
                    {s.label}
                  </span>
                  {e.path && <code style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: '#cbd5e1' }}>{e.path}</code>}
                  {e.app_version && <span style={{ fontSize: 12, color: 'var(--meta)' }}>{e.app_version}</span>}
                  <span style={{ fontSize: 12, color: 'var(--meta)', marginLeft: 'auto' }}>{timeAgo(e.created_at)}</span>
                </div>
                <div style={{ fontSize: 14, color: '#f1f5f9', marginBottom: 8, wordBreak: 'break-word' }}>{e.message}</div>
                {(e.stack || e.component_stack) && (
                  <details>
                    <summary style={{ fontSize: 12, color: 'var(--link)', cursor: 'pointer' }}>Stack</summary>
                    <pre style={{ fontSize: 11, color: '#cbd5e1', whiteSpace: 'pre-wrap', marginTop: 8, background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 'var(--r-md)', overflowX: 'auto' }}>
                      {[e.stack, e.component_stack].filter(Boolean).join('\n\n')}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
