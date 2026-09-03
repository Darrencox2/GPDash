// /p/[slug]/setup-in-progress — friendly holding page shown to regular
// team members who arrive before the practice owner has finished the
// setup wizard. We don't want them to see a half-empty dashboard with
// no clinicians, list size, etc. — that's a poor first impression and
// a confusing one (they'd think the product is broken).
//
// Owners/admins land directly in /v4/onboarding/setup/[id] instead of
// here, via the redirect logic in /p/[id]/page.js. This route is for
// "I'm a regular user and my owner hasn't finished setup yet" only.
//
// Once setup completes, the dashboard becomes accessible and this
// route is effectively dead — the parent /p/[id]/page.js no longer
// redirects here. We don't actively bounce people away from it; they
// can refresh /p/<slug> and they'll land on the dashboard.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import BrandHeader from '@/app/v4/_lib/BrandHeader';

export const dynamic = 'force-dynamic';

export default async function SetupInProgressPage({ params }) {
  const { id } = await params;
  // cookies() is a Promise in Next 16 - the sync-access shim is gone, so
  // passing it unawaited made createClient call getAll() on a Promise and
  // threw a 500 on the one page every new practice owner is sent to.
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) redirect('/v4/login');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  // Resolve the practice from the slug.
  const { data: practice } = await supabase
    .from('practices')
    .select('id, name, slug, setup_completed_at')
    .eq('slug', id)
    .maybeSingle();

  if (!practice) redirect('/v4/dashboard');

  // If setup is already complete, stop showing the holding page —
  // bounce straight through to the dashboard.
  if (practice.setup_completed_at) {
    redirect(`/p/${practice.slug}`);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: 'var(--g-text-hi)',
      padding: 32,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 24,
    }}>
      <BrandHeader />
      <div style={{
        maxWidth: 480, width: '100%',
        background: 'rgba(15,23,42,0.7)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 'var(--r-lg)', padding: 28, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🛠️</div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, color: 'var(--g-text-max)', marginBottom: 10 }}>
          Setup in progress
        </h1>
        <p className="text-body text-slate-300 leading-body mb-[18px]">
          Your practice admin is still configuring{' '}
          <strong className="text-ink-max">{practice.name}</strong> on GPDash.
          Check back shortly — they'll have it ready soon.
        </p>
        <p className="text-meta text-slate-400 leading-body">
          Once setup is complete you'll be able to access the dashboard at this URL.
        </p>
      </div>
    </div>
  );
}
