'use client';

// GPDash Logo — gauge + bars hybrid with load animation
// Bars are inset from circle edge. Gauge ring sweeps green. Bars drift up.
// PRACTICE / DASHBOARD on separate lines, larger. GP+Dash tighter.

const keyframeStyle = `
@keyframes gpd-gauge { from { stroke-dashoffset: var(--gpd-circ); } }
@keyframes gpd-bar { from { opacity: 0; transform: translateY(6px); } to { opacity: var(--gpd-op); transform: translateY(0); } }
`;

function Keyframes() {
  return <style>{keyframeStyle}</style>;
}

function BarSet({ cx, cy, r, barWidth, gap, count = 7, heights, opacities, animate = true }) {
  // Centre the bars horizontally inside the circle with clearance
  const innerR = r - 8;
  const totalW = count * barWidth + (count - 1) * gap;
  const startX = cx - totalW / 2;
  const baseY = cy + innerR * 0.55;

  return heights.map((h, i) => {
    const x = startX + i * (barWidth + gap);
    const scaledH = h * innerR * 1.1;
    const y = baseY - scaledH;
    const fill = i === 3 ? '#f59e0b' : '#10b981';
    const op = opacities[i];
    const delay = 0.3 + i * 0.08;
    return (
      <rect key={i} x={x} y={y} width={barWidth} height={scaledH} rx={barWidth / 3} fill={fill}
        style={animate
          ? { '--gpd-op': op, animation: `gpd-bar 0.5s ease-out ${delay}s both` }
          : { opacity: op }} />
    );
  });
}

export default function GPDashLogo({ size = 'full', className = '', animate = true }) {
  const heights = [0.3, 0.5, 0.85, 0.65, 0.95, 0.6, 0.4];
  const opacities = [0.35, 0.55, 1, 0.9, 0.85, 0.5, 0.3];

  if (size === 'icon') {
    const r = 40, cx = 50, cy = 50, sw = 4, circ = 2 * Math.PI * r;
    return (
      <svg viewBox="0 0 100 100" className={className} fill="none">
        {animate && <Keyframes />}
        <circle cx={cx} cy={cy} r={r} stroke="#334155" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} stroke="#10b981" strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={circ * 0.25} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={animate ? { '--gpd-circ': circ, animation: 'gpd-gauge 0.9s ease-out forwards' } : {}} />
        <BarSet cx={cx} cy={cy} r={r} barWidth={6} gap={2} heights={heights} opacities={opacities} animate={animate} />
      </svg>
    );
  }

  if (size === 'sidebar-collapsed') {
    const r = 20, cx = 24, cy = 24, sw = 3, circ = 2 * Math.PI * r;
    return (
      <svg viewBox="0 0 48 48" className={className} fill="none">
        {animate && <Keyframes />}
        <circle cx={cx} cy={cy} r={r} stroke="#334155" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} stroke="#10b981" strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={circ * 0.25} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={animate ? { '--gpd-circ': circ, animation: 'gpd-gauge 0.8s ease-out forwards' } : {}} />
        <BarSet cx={cx} cy={cy} r={r} barWidth={3.5} gap={1} count={5} heights={[0.4, 0.7, 0.95, 0.75, 0.55]} opacities={[0.4, 0.6, 1, 0.9, 0.5]} animate={animate} />
      </svg>
    );
  }

  if (size === 'sidebar') {
    const r = 32, cx = 38, cy = 40, sw = 3.5, circ = 2 * Math.PI * r;
    return (
      <svg viewBox="0 0 175 120" className={className} fill="none">
        {animate && <Keyframes />}
        <circle cx={cx} cy={cy} r={r} stroke="#334155" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} stroke="#10b981" strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={circ * 0.25} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={animate ? { '--gpd-circ': circ, animation: 'gpd-gauge 1s ease-out forwards' } : {}} />
        <BarSet cx={cx} cy={cy} r={r} barWidth={5} gap={1.5} heights={heights} opacities={opacities} animate={animate} />
        <text x="82" y="34" fill="#ffffff" style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'system-ui, sans-serif', letterSpacing: '-1.5px' }}>GP</text>
        <text x="115" y="34" fill="#10b981" style={{ fontSize: '20px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.5px' }}>Dash</text>
        <text x="82" y="54" fill="#94a3b8" style={{ fontSize: '9px', fontWeight: 400, fontFamily: 'system-ui, sans-serif', letterSpacing: '2.5px' }}>PRACTICE</text>
        <text x="82" y="68" fill="#64748b" style={{ fontSize: '9px', fontWeight: 400, fontFamily: 'system-ui, sans-serif', letterSpacing: '2.5px' }}>DASHBOARD</text>
      </svg>
    );
  }

  if (size === 'compact') {
    const r = 24, cx = 28, cy = 30, sw = 3, circ = 2 * Math.PI * r;
    return (
      <svg viewBox="0 0 230 68" className={className} fill="none">
        {animate && <Keyframes />}
        <circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} stroke="#10b981" strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={circ * 0.25} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={animate ? { '--gpd-circ': circ, animation: 'gpd-gauge 0.8s ease-out forwards' } : {}} />
        <BarSet cx={cx} cy={cy} r={r} barWidth={4} gap={1} heights={heights} opacities={opacities} animate={animate} />
        <text x="62" y="28" fill="#ffffff" style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'system-ui, sans-serif', letterSpacing: '-1.5px' }}>GP</text>
        <text x="100" y="28" fill="#10b981" style={{ fontSize: '24px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.5px' }}>Dash</text>
        <text x="62" y="44" fill="rgba(255,255,255,0.5)" style={{ fontSize: '7px', fontWeight: 400, fontFamily: 'system-ui, sans-serif', letterSpacing: '2.5px' }}>PRACTICE</text>
        <text x="62" y="54" fill="rgba(255,255,255,0.35)" style={{ fontSize: '7px', fontWeight: 400, fontFamily: 'system-ui, sans-serif', letterSpacing: '2.5px' }}>DASHBOARD</text>
      </svg>
    );
  }

  // Full size (login screen)
  const r = 54, cx = 62, cy = 62, sw = 6, circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 420 140" className={className} fill="none">
      {animate && <Keyframes />}
      <circle cx={cx} cy={cy} r={r} stroke="#e2e8f0" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} stroke="#10b981" strokeWidth={sw}
        strokeDasharray={circ} strokeDashoffset={circ * 0.25} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={animate ? { '--gpd-circ': circ, animation: 'gpd-gauge 1s ease-out forwards' } : {}} />
      <BarSet cx={cx} cy={cy} r={r} barWidth={8} gap={2} heights={heights} opacities={opacities} animate={animate} />
      <text x="135" y="52" fill="#1e293b" style={{ fontSize: '46px', fontWeight: 800, fontFamily: 'system-ui, sans-serif', letterSpacing: '-2px' }}>GP</text>
      <text x="228" y="52" fill="#10b981" style={{ fontSize: '46px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.5px' }}>Dash</text>
      <text x="135" y="78" fill="#94a3b8" style={{ fontSize: '14px', fontWeight: 400, fontFamily: 'system-ui, sans-serif', letterSpacing: '5px' }}>PRACTICE</text>
      <text x="135" y="98" fill="#b0b8c4" style={{ fontSize: '14px', fontWeight: 300, fontFamily: 'system-ui, sans-serif', letterSpacing: '5px' }}>DASHBOARD</text>
    </svg>
  );
}

// Light-on-dark variant for dark headers
export function GPDashLogoLight({ size = 'compact', className = '', animate = false }) {
  return <GPDashLogo size={size} className={className} animate={animate} />;
}
