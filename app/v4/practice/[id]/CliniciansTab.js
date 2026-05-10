// CliniciansTab — server component for the Practice page's Clinicians tab.
//
// Fetches the clinician list directly from the clinicians table, adapts
// the snake_case columns to the v3-shape camelCase fields that the rest
// of the app expects (so QuickSetupTable can post directly to /api/v4/data
// without further translation), and renders the editable table.
//
// Read-side: any practice member can see the list. The page-level guard
// already prevents non-admins from reaching this tab — the table itself
// doesn't repeat that check.

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import QuickSetupTable from './QuickSetupTable';

export default async function CliniciansTab({ practiceId }) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) {
    return <div style={{ color: '#fca5a5' }}>Configuration error.</div>;
  }

  const { data: rows, error } = await supabase
    .from('clinicians')
    .select('id, name, title, initials, role, group_id, status, sessions, buddy_cover, can_provide_cover, show_whos_in, aliases, linked_user_id, created_at')
    .eq('practice_id', practiceId)
    .order('name', { ascending: true });

  if (error) {
    return (
      <div style={{ padding: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#fca5a5', fontSize: 13 }}>
        Failed to load clinicians: {error.message}
      </div>
    );
  }

  // Adapt snake_case → v3-shape camelCase. Same shape used by /api/v4/data
  // mutation 6, so what we render is what we'd post back unchanged.
  const clinicians = (rows || []).map(c => ({
    id: c.id,
    name: c.name,
    title: c.title,
    initials: c.initials,
    role: c.role,
    group: c.group_id,
    status: c.status,
    sessions: c.sessions || 0,
    buddyCover: !!c.buddy_cover,
    canProvideCover: c.can_provide_cover !== false,
    showWhosIn: c.show_whos_in !== false, // default true if column missing pre-041
    aliases: c.aliases || [],
    linkedUserId: c.linked_user_id,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 22, fontWeight: 600, color: 'white', marginBottom: 6,
        }}>Clinicians</h2>
        <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
          Quick setup for everyone in your team. Edit roles, initials, sessions and status inline. Saves automatically as you go.
        </p>
      </div>
      <QuickSetupTable practiceId={practiceId} initialClinicians={clinicians} />
    </div>
  );
}
