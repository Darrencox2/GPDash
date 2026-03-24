'use client';

// GPDash Logo — gauge + bars hybrid
// Sizes: 'full' (login/headers), 'sidebar' (nav), 'compact' (inline header), 'icon' (favicon-size)
export default function GPDashLogo({ size = 'full', className = '' }) {
  if (size === 'icon') {
    return (
      <svg viewBox="0 0 120 120" className={className} fill="none">
        <circle cx="60" cy="58" r="44" stroke="#334155" strokeWidth="4" />
        <circle cx="60" cy="58" r="44" stroke="#10b981" strokeWidth="4"
          strokeDasharray="276" strokeDashoffset="70" strokeLinecap="round"
          transform="rotate(-90 60 58)" />
        <rect x="24" y="62" width="8" height="18" rx="2.5" fill="#10b981" opacity="0.35" />
        <rect x="36" y="48" width="8" height="32" rx="2.5" fill="#10b981" opacity="0.55" />
        <rect x="48" y="30" width="8" height="50" rx="2.5" fill="#10b981" />
        <rect x="60" y="40" width="8" height="40" rx="2.5" fill="#f59e0b" opacity="0.9" />
        <rect x="72" y="26" width="8" height="54" rx="2.5" fill="#10b981" opacity="0.85" />
        <rect x="84" y="44" width="8" height="36" rx="2.5" fill="#10b981" opacity="0.5" />
      </svg>
    );
  }

  if (size === 'compact') {
    return (
      <svg viewBox="0 0 260 76" className={className} fill="none">
        <circle cx="32" cy="34" r="28" stroke="#e2e8f0" strokeWidth="3" />
        <circle cx="32" cy="34" r="28" stroke="#10b981" strokeWidth="3.5"
          strokeDasharray="176" strokeDashoffset="45" strokeLinecap="round"
          transform="rotate(-90 32 34)" />
        <rect x="10" y="36" width="5" height="14" rx="1.5" fill="#10b981" opacity="0.35" />
        <rect x="18" y="28" width="5" height="22" rx="1.5" fill="#10b981" opacity="0.55" />
        <rect x="26" y="16" width="5" height="34" rx="1.5" fill="#10b981" />
        <rect x="34" y="22" width="5" height="28" rx="1.5" fill="#f59e0b" opacity="0.9" />
        <rect x="42" y="14" width="5" height="36" rx="1.5" fill="#10b981" opacity="0.85" />
        <rect x="50" y="26" width="5" height="24" rx="1.5" fill="#10b981" opacity="0.5" />
        <text x="74" y="32" fill="#1e293b" style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'system-ui, sans-serif', letterSpacing: '-1.5px' }}>GP</text>
        <text x="128" y="32" fill="#10b981" style={{ fontSize: '28px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '0px' }}>Dash</text>
        <text x="74" y="50" fill="#94a3b8" style={{ fontSize: '7px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '3px' }}>PRACTICE DASHBOARD</text>
      </svg>
    );
  }

  if (size === 'sidebar') {
    return (
      <svg viewBox="0 0 180 110" className={className} fill="none">
        <circle cx="42" cy="42" r="36" stroke="#334155" strokeWidth="3.5" />
        <circle cx="42" cy="42" r="36" stroke="#10b981" strokeWidth="3.5"
          strokeDasharray="226" strokeDashoffset="58" strokeLinecap="round"
          transform="rotate(-90 42 42)" />
        <rect x="14" y="48" width="6" height="16" rx="2" fill="#10b981" opacity="0.35" />
        <rect x="24" y="38" width="6" height="26" rx="2" fill="#10b981" opacity="0.55" />
        <rect x="34" y="22" width="6" height="42" rx="2" fill="#10b981" />
        <rect x="44" y="30" width="6" height="34" rx="2" fill="#f59e0b" opacity="0.9" />
        <rect x="54" y="18" width="6" height="46" rx="2" fill="#10b981" opacity="0.85" />
        <rect x="64" y="34" width="6" height="30" rx="2" fill="#10b981" opacity="0.5" />
        <text x="90" y="38" fill="#ffffff" style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'system-ui, sans-serif', letterSpacing: '-1px' }}>GP</text>
        <text x="130" y="38" fill="#10b981" style={{ fontSize: '22px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '0px' }}>Dash</text>
        <text x="90" y="54" fill="#64748b" style={{ fontSize: '6px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '2.5px' }}>PRACTICE DASHBOARD</text>
      </svg>
    );
  }

  if (size === 'sidebar-collapsed') {
    return (
      <svg viewBox="0 0 56 56" className={className} fill="none">
        <circle cx="28" cy="28" r="24" stroke="#334155" strokeWidth="3" />
        <circle cx="28" cy="28" r="24" stroke="#10b981" strokeWidth="3"
          strokeDasharray="151" strokeDashoffset="38" strokeLinecap="round"
          transform="rotate(-90 28 28)" />
        <rect x="10" y="30" width="5" height="12" rx="1.5" fill="#10b981" opacity="0.35" />
        <rect x="18" y="22" width="5" height="20" rx="1.5" fill="#10b981" opacity="0.55" />
        <rect x="26" y="12" width="5" height="30" rx="1.5" fill="#10b981" />
        <rect x="34" y="18" width="5" height="24" rx="1.5" fill="#f59e0b" opacity="0.9" />
        <rect x="42" y="24" width="5" height="18" rx="1.5" fill="#10b981" opacity="0.6" />
      </svg>
    );
  }

  // Full size (login screen, large headers)
  return (
    <svg viewBox="0 0 480 140" className={className} fill="none">
      <circle cx="68" cy="68" r="60" stroke="#e2e8f0" strokeWidth="6" />
      <circle cx="68" cy="68" r="60" stroke="#10b981" strokeWidth="6"
        strokeDasharray="377" strokeDashoffset="96" strokeLinecap="round"
        transform="rotate(-90 68 68)" />
      <rect x="22" y="82" width="10" height="18" rx="2.5" fill="#10b981" opacity="0.35" />
      <rect x="36" y="64" width="10" height="36" rx="2.5" fill="#10b981" opacity="0.55" />
      <rect x="50" y="38" width="10" height="62" rx="2.5" fill="#10b981" />
      <rect x="64" y="52" width="10" height="48" rx="2.5" fill="#f59e0b" opacity="0.9" />
      <rect x="78" y="30" width="10" height="70" rx="2.5" fill="#10b981" opacity="0.85" />
      <rect x="92" y="56" width="10" height="44" rx="2.5" fill="#10b981" opacity="0.5" />
      <rect x="106" y="74" width="10" height="26" rx="2.5" fill="#10b981" opacity="0.3" />
      <text x="158" y="62" fill="#1e293b" style={{ fontSize: '52px', fontWeight: 800, fontFamily: 'system-ui, sans-serif', letterSpacing: '-2px' }}>GP</text>
      <text x="267" y="62" fill="#10b981" style={{ fontSize: '52px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '0px' }}>Dash</text>
      <text x="158" y="86" fill="#94a3b8" style={{ fontSize: '13px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '6px' }}>PRACTICE DASHBOARD</text>
    </svg>
  );
}

// Dark background variant for headers
export function GPDashLogoLight({ size = 'full', className = '' }) {
  if (size === 'compact') {
    return (
      <svg viewBox="0 0 260 76" className={className} fill="none">
        <circle cx="32" cy="34" r="28" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
        <circle cx="32" cy="34" r="28" stroke="#10b981" strokeWidth="3.5"
          strokeDasharray="176" strokeDashoffset="45" strokeLinecap="round"
          transform="rotate(-90 32 34)" />
        <rect x="10" y="36" width="5" height="14" rx="1.5" fill="#10b981" opacity="0.35" />
        <rect x="18" y="28" width="5" height="22" rx="1.5" fill="#10b981" opacity="0.55" />
        <rect x="26" y="16" width="5" height="34" rx="1.5" fill="#10b981" />
        <rect x="34" y="22" width="5" height="28" rx="1.5" fill="#f59e0b" opacity="0.9" />
        <rect x="42" y="14" width="5" height="36" rx="1.5" fill="#10b981" opacity="0.85" />
        <rect x="50" y="26" width="5" height="24" rx="1.5" fill="#10b981" opacity="0.5" />
        <text x="74" y="32" fill="#ffffff" style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'system-ui, sans-serif', letterSpacing: '-1.5px' }}>GP</text>
        <text x="128" y="32" fill="#10b981" style={{ fontSize: '28px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '0px' }}>Dash</text>
        <text x="74" y="50" fill="rgba(255,255,255,0.4)" style={{ fontSize: '7px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '3px' }}>PRACTICE DASHBOARD</text>
      </svg>
    );
  }

  // Full light version
  return (
    <svg viewBox="0 0 480 140" className={className} fill="none">
      <circle cx="68" cy="68" r="60" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
      <circle cx="68" cy="68" r="60" stroke="#10b981" strokeWidth="6"
        strokeDasharray="377" strokeDashoffset="96" strokeLinecap="round"
        transform="rotate(-90 68 68)" />
      <rect x="22" y="82" width="10" height="18" rx="2.5" fill="#10b981" opacity="0.35" />
      <rect x="36" y="64" width="10" height="36" rx="2.5" fill="#10b981" opacity="0.55" />
      <rect x="50" y="38" width="10" height="62" rx="2.5" fill="#10b981" />
      <rect x="64" y="52" width="10" height="48" rx="2.5" fill="#f59e0b" opacity="0.9" />
      <rect x="78" y="30" width="10" height="70" rx="2.5" fill="#10b981" opacity="0.85" />
      <rect x="92" y="56" width="10" height="44" rx="2.5" fill="#10b981" opacity="0.5" />
      <rect x="106" y="74" width="10" height="26" rx="2.5" fill="#10b981" opacity="0.3" />
      <text x="158" y="62" fill="#ffffff" style={{ fontSize: '52px', fontWeight: 800, fontFamily: 'system-ui, sans-serif', letterSpacing: '-2px' }}>GP</text>
      <text x="267" y="62" fill="#10b981" style={{ fontSize: '52px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '0px' }}>Dash</text>
      <text x="158" y="86" fill="rgba(255,255,255,0.4)" style={{ fontSize: '13px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '6px' }}>PRACTICE DASHBOARD</text>
    </svg>
  );
}
