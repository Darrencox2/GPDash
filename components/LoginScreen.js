'use client';
import { Button, Card } from '@/components/ui';
import GPDashLogo from '@/components/GPDashLogo';

export default function LoginScreen({ password, setPassword, onLogin, loading, error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <Card className="p-12 w-full max-w-2xl">
        <div className="flex justify-center mb-12">
          <GPDashLogo size="full" className="w-full max-w-[560px]" />
        </div>
        <form onSubmit={onLogin} className="max-w-md mx-auto">
          <label className="block text-base font-medium text-slate-700 mb-3">Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent mb-5 text-base"
            placeholder="Enter practice password" autoFocus />
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <Button variant="primary" className="w-full text-base py-3" disabled={loading} onClick={onLogin}>
            {loading ? 'Checking...' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
