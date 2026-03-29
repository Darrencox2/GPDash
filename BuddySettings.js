'use client';
import { Button, Card } from '@/components/ui';
import GPDashLogo from '@/components/GPDashLogo';

export default function LoginScreen({ password, setPassword, onLogin, loading, error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <Card className="p-8 w-full max-w-md">
        <div className="flex justify-center mb-8">
          <GPDashLogo size="full" className="w-full max-w-[320px]" />
        </div>
        <form onSubmit={onLogin}>
          <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent mb-4 text-sm"
            placeholder="Enter practice password" autoFocus />
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <Button variant="primary" className="w-full" disabled={loading} onClick={onLogin}>
            {loading ? 'Checking...' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
