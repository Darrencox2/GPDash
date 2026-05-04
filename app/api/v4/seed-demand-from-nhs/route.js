// /api/v4/seed-demand-from-nhs
//
// Called after a practice picks their ODS code in the setup wizard.
// Looks up the practice's row in nhs_oc_baseline and seeds the
// practice_settings.demand_settings JSONB with computed dow effects,
// baseline, and hour pattern. Does not overwrite existing settings unless
// ?force=true is passed.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { seedDemandFromBaseline } from '@/lib/demand-seed-from-nhs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const practiceId = body?.practiceId;
  if (!practiceId) {
    return NextResponse.json({ error: 'practice_id_required' }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) {
    return NextResponse.json({ error: 'no_supabase_client' }, { status: 500 });
  }

  // Authorize: user must be a member of this practice with admin role
  // (we're modifying demand settings — not just any user)
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  const { data: membership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();
  // Platform admin can also seed
  const { data: adminCheck } = await supabase.rpc('is_platform_admin');
  const isAdmin = membership?.role === 'admin' || membership?.role === 'owner' || adminCheck === true;
  if (!isAdmin) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }

  // Get the practice's ODS code
  const { data: practice, error: practiceErr } = await supabase
    .from('practices')
    .select('id, ods_code')
    .eq('id', practiceId)
    .maybeSingle();
  if (practiceErr || !practice) {
    return NextResponse.json({ error: 'practice_not_found' }, { status: 404 });
  }
  if (!practice.ods_code) {
    return NextResponse.json({
      seeded: false,
      reason: 'no_ods_code',
      message: 'Practice has no ODS code yet — set one via the practice search first.',
    });
  }

  // Look up the latest NHS baseline row for this ODS code
  const { data: baseline, error: baselineErr } = await supabase
    .from('nhs_oc_baseline')
    .select('*')
    .eq('ods_code', practice.ods_code)
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (baselineErr) {
    return NextResponse.json({ error: 'baseline_lookup_failed', detail: baselineErr.message }, { status: 500 });
  }
  if (!baseline) {
    return NextResponse.json({
      seeded: false,
      reason: 'no_baseline_for_ods',
      message: `No NHS data found for ${practice.ods_code}. The practice may be Welsh/Scottish/NI, or too new to be in the dataset yet.`,
    });
  }

  // Check existing demand_settings — don't overwrite unless forced
  const { data: settingsRow } = await supabase
    .from('practice_settings')
    .select('demand_settings')
    .eq('practice_id', practiceId)
    .maybeSingle();
  const existing = settingsRow?.demand_settings;
  if (existing && existing.sufficient && !force) {
    // Existing settings present — only overwrite if it was an NHS seed too
    // (so we'd be replacing one seed with a fresher one), or if forced
    if (existing.source !== 'nhs_oc_baseline') {
      return NextResponse.json({
        seeded: false,
        reason: 'existing_settings_not_overwritten',
        message: 'Existing demand settings present (from your own AskMyGP upload). Pass ?force=true to overwrite.',
        existing: { source: existing.source, baseline: existing.baseline },
      });
    }
  }

  // Compute the seed
  const seed = seedDemandFromBaseline(baseline);
  if (!seed) {
    return NextResponse.json({
      seeded: false,
      reason: 'baseline_too_thin',
      message: 'NHS baseline row exists but has insufficient weekday data to seed predictions.',
    });
  }

  // Upsert into practice_settings
  const { error: upsertErr } = await supabase
    .from('practice_settings')
    .upsert({
      practice_id: practiceId,
      demand_settings: seed,
    }, { onConflict: 'practice_id' });
  if (upsertErr) {
    return NextResponse.json({ error: 'upsert_failed', detail: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    seeded: true,
    odsCode: practice.ods_code,
    sourceMonth: baseline.month,
    practiceName: baseline.practice_name,
    pcn: baseline.pcn_name,
    summary: {
      baseline: seed.baseline,
      dowEffects: seed.dowEffects,
      sourceTotal: seed.sourceTotal,
    },
  });
}
