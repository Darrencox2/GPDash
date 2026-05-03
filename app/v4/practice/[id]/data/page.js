// /v4/practice/[id]/data — preview page showing the live Postgres data for
// this practice. Proof of concept that the v4 data layer works against
// real (imported) data. Will become the foundation for porting actual
// features.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { loadPracticeData, adaptToV3Shape } from '@/lib/v4-data';

export const dynamic = 'force-dynamic';

export default async function PracticeDataPage({ params }) {
  const { id: practiceId } = params;

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  // Load full practice data via the v4 data layer
  const v4Data = await loadPracticeData(supabase, practiceId);
  if (!v4Data?.practice) notFound();

  // Also adapt to v3 shape for porting reference
  const v3Shape = adaptToV3Shape(v4Data);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, color: 'white', marginBottom: 24 }}>
        Diagnostics
      </h1>

      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>
        This page reads live data from Postgres via the v4 data layer (lib/v4-data.js).
        It's the foundation for porting v3 features — every component being ported can
        use the same pattern: load practice data, optionally adapt to v3 shape, render.
      </p>

      <Section title="Practice">
        <Stat label="Name">{v4Data.practice.name}</Stat>
        <Stat label="ODS code">{v4Data.practice.ods_code || '—'}</Stat>
        <Stat label="Region">{v4Data.practice.region || '—'}</Stat>
        <Stat label="Members">{v4Data.members?.length || 0}</Stat>
      </Section>

      <Section title="Clinicians">
        <Stat label="Total">{v4Data.clinicians.length}</Stat>
        <Stat label="Active">{v4Data.clinicians.filter(c => c.status === 'active').length}</Stat>
        <Stat label="Left">{v4Data.clinicians.filter(c => c.status === 'left').length}</Stat>
        <Stat label="Administrative">{v4Data.clinicians.filter(c => c.status === 'administrative').length}</Stat>
        <Stat label="Buddy cover (active)">
          {v4Data.clinicians.filter(c => c.buddy_cover && c.status === 'active').length}
        </Stat>
        <Stat label="By group">
          {Object.entries(
            v4Data.clinicians.filter(c => c.status === 'active').reduce((acc, c) => {
              acc[c.group_id] = (acc[c.group_id] || 0) + 1;
              return acc;
            }, {})
          ).map(([g, n]) => `${g}=${n}`).join(', ')}
        </Stat>
      </Section>

      <Section title="Working patterns">
        <Stat label="Total patterns">{v4Data.workingPatterns.length}</Stat>
        <Stat label="Mon">{v3Shape.weeklyRota.Monday.length} clinicians</Stat>
        <Stat label="Tue">{v3Shape.weeklyRota.Tuesday.length} clinicians</Stat>
        <Stat label="Wed">{v3Shape.weeklyRota.Wednesday.length} clinicians</Stat>
        <Stat label="Thu">{v3Shape.weeklyRota.Thursday.length} clinicians</Stat>
        <Stat label="Fri">{v3Shape.weeklyRota.Friday.length} clinicians</Stat>
      </Section>

      <Section title="Absences">
        <Stat label="Total">{v4Data.absences.length}</Stat>
        <Stat label="Currently absent">
          {v4Data.absences.filter(a => {
            const today = new Date().toISOString().slice(0, 10);
            return a.start_date <= today && a.end_date >= today;
          }).length}
        </Stat>
      </Section>

      <Section title="Settings">
        <Stat label="Huddle settings">{v4Data.settings?.huddle_settings ? 'present' : '—'}</Stat>
        <Stat label="Buddy settings">{v4Data.settings?.buddy_settings ? 'present' : '—'}</Stat>
        <Stat label="Room allocation">{v4Data.settings?.room_allocation ? 'present' : '—'}</Stat>
        <Stat label="Closed days">{Object.keys(v4Data.settings?.closed_days || {}).length} entries</Stat>
        <Stat label="TeamNet URL">{v4Data.settings?.teamnet_url ? '✓ configured' : '—'}</Stat>
      </Section>

      <Section title="Huddle CSV data">
        <Stat label="Loaded">{v4Data.huddleCsvData ? '✓' : '—'}</Stat>
        <Stat label="Last updated">
          {v4Data.huddleCsvUpdatedAt
            ? new Date(v4Data.huddleCsvUpdatedAt).toLocaleString('en-GB')
            : '—'}
        </Stat>
        {v4Data.huddleCsvData?.rows && (
          <Stat label="Rows">{v4Data.huddleCsvData.rows.length || 0}</Stat>
        )}
        {v4Data.huddleCsvData?.dates && (
          <Stat label="Dates covered">{v4Data.huddleCsvData.dates.length || 0}</Stat>
        )}
      </Section>

      <p style={{ color: '#64748b', fontSize: 11, marginTop: 32, textAlign: 'center' }}>
        v4-rebuild branch · live Postgres data
      </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
    }}>
      <h2 style={{
        fontFamily: "'Outfit', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
      }}>{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      fontSize: 13,
    }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{children}</span>
    </div>
  );
}
