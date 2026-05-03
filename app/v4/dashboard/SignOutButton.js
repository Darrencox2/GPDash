'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push('/v4/login');
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      style={{
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 500,
        color: '#94a3b8',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      Sign out
    </button>
  );
}
