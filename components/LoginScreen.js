'use client';
import GPDashLogo from '@/components/GPDashLogo';
import { APP_VERSION } from '@/lib/version';

export default function LoginScreen({ password, setPassword, onLogin, loading, error }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)'}}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <GPDashLogo size="large" />
        </div>

        {/* Login card */}
        <div className="rounded-2xl p-8" style={{background:'rgba(15,23,42,0.7)',border:'1px solid rgba(255,255,255,0.06)',backdropFilter:'blur(12px)'}}>
          <h2 className="text-lg font-medium text-slate-300 text-center mb-6" style={{fontFamily:"'Outfit',sans-serif"}}>Sign in to your practice</h2>

          <form onSubmit={onLogin}>
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-500 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}}
                placeholder="Enter practice password"
                autoFocus
              />
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg text-sm text-red-400" style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.15)'}}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{background:'linear-gradient(135deg, #10b981 0%, #059669 100%)',boxShadow:'0 4px 12px rgba(16,185,129,0.25)'}}
            >
              {loading ? 'Checking...' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <span className="text-xs text-slate-700" style={{fontFamily:"'Space Mono',monospace"}}>{APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}
