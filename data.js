'use client';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';

// ─── Toast System ────────────────────────────────────────────────
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  
  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${
            t.type === 'success' ? 'bg-slate-900 text-white' :
            t.type === 'error' ? 'bg-red-600 text-white' :
            t.type === 'warning' ? 'bg-amber-500 text-white' :
            'bg-slate-900 text-white'
          }`}>
            {t.type === 'success' && '✓ '}{t.type === 'error' && '✕ '}{t.type === 'warning' && '⚠ '}{t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ─── Button ──────────────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', className = '', disabled, ...props }) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-500 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus:ring-slate-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-400 shadow-sm',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-400 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100 focus:ring-slate-400',
    upload_fresh: 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400 shadow-sm',
    upload_stale: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-400 shadow-sm',
  };
  const sizes = {
    xs: 'px-2 py-1 text-xs gap-1',
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-sm gap-2',
  };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled} {...props}>{children}</button>;
}

// ─── Card ────────────────────────────────────────────────────────
export function Card({ children, className = '', padding = true, ...props }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200/80 shadow-sm ${padding ? 'p-5' : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', accent }) {
  const accents = {
    amber: 'bg-gradient-to-r from-amber-400 to-orange-400',
    blue: 'bg-gradient-to-r from-blue-400 to-indigo-500',
    purple: 'bg-gradient-to-r from-purple-500 to-indigo-500',
    slate: 'bg-slate-50 border-b border-slate-100',
    info: 'bg-blue-50 border-b border-blue-100',
  };
  return <div className={`px-5 py-3 ${accents[accent] || accents.slate} ${accent && accent !== 'slate' && accent !== 'info' ? 'text-white' : ''} ${className}`}>{children}</div>;
}

// ─── Section Heading ─────────────────────────────────────────────
export function SectionHeading({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────
export function Skeleton({ className = '', variant = 'text' }) {
  const variants = {
    text: 'h-4 rounded',
    heading: 'h-6 w-48 rounded',
    card: 'h-32 rounded-xl',
    circle: 'h-10 w-10 rounded-full',
    button: 'h-9 w-24 rounded-lg',
  };
  return <div className={`bg-slate-200 animate-pulse ${variants[variant]} ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div className="space-y-2"><Skeleton variant="heading" /><Skeleton className="h-3 w-32" /></div>
        <Skeleton variant="button" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-48" />
      </div>
      <Skeleton variant="card" className="h-64" />
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action, onAction }) {
  return (
    <Card className="py-12 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
      {description && <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">{description}</p>}
      {action && <Button onClick={onAction}>{action}</Button>}
    </Card>
  );
}

// ─── Pill Toggle (multi-select filter buttons) ───────────────────
export function PillToggle({ options, selected, onChange, size = 'sm' }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(opt => {
        const isActive = selected.includes(opt.value);
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)} className={`rounded-full font-medium transition-all ${
            size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
          } ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {opt.icon && <span className="mr-1">{opt.icon}</span>}{opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────
export function StatCard({ label, value, accent = 'slate', sub }) {
  const colours = {
    amber: 'from-amber-400 to-orange-400',
    blue: 'from-blue-400 to-indigo-500',
    emerald: 'from-emerald-400 to-teal-500',
    slate: 'from-slate-600 to-slate-800',
  };
  return (
    <Card padding={false} className="overflow-hidden">
      <div className={`bg-gradient-to-r ${colours[accent]} px-5 py-3`}>
        <div className="flex items-center justify-between text-white">
          <div>
            <div className="text-lg font-bold">{label}</div>
            {sub && <div className="text-xs opacity-80">{sub}</div>}
          </div>
          <div className="text-3xl font-bold">{value}</div>
        </div>
      </div>
    </Card>
  );
}

// ─── Badge ───────────────────────────────────────────────────────
export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>{children}</span>;
}

// ─── Input ───────────────────────────────────────────────────────
export function Input({ className = '', size = 'md', ...props }) {
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
  };
  return <input className={`rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow ${sizes[size]} ${className}`} {...props} />;
}

export function Select({ className = '', size = 'md', children, ...props }) {
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3 py-2 text-sm' };
  return <select className={`rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent ${sizes[size]} ${className}`} {...props}>{children}</select>;
}
