'use client';

function GridIcon({ size = 32 }) {
  const s = size;
  const r = s * 0.21;
  const pad = s * 0.125;
  const gap = s * 0.04;
  const tile = (s - pad * 2 - gap * 2) / 3;
  const pos = (i) => pad + i * (tile + gap);
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect width={s} height={s} rx={r} fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
      <rect x={pos(0)} y={pos(0)} width={tile} height={tile} rx={r*0.4} fill="#10b981" />
      <rect x={pos(1)} y={pos(0)} width={tile} height={tile} rx={r*0.4} fill="#10b981" opacity="0.7" />
      <rect x={pos(2)} y={pos(0)} width={tile} height={tile} rx={r*0.4} fill="#334155" />
      <rect x={pos(0)} y={pos(1)} width={tile} height={tile} rx={r*0.4} fill="#10b981" opacity="0.7" />
      <rect x={pos(1)} y={pos(1)} width={tile} height={tile} rx={r*0.4} fill="#f59e0b" />
      <rect x={pos(2)} y={pos(1)} width={tile} height={tile} rx={r*0.4} fill="#334155" />
      <rect x={pos(0)} y={pos(2)} width={tile} height={tile} rx={r*0.4} fill="#ef4444" />
      <rect x={pos(1)} y={pos(2)} width={tile} height={tile} rx={r*0.4} fill="#f59e0b" opacity="0.5" />
      <rect x={pos(2)} y={pos(2)} width={tile} height={tile} rx={r*0.4} fill="#334155" />
    </svg>
  );
}

export default function GPDashLogo({ size = 'sidebar', className = '' }) {
  if (size === 'sidebar-collapsed') return <GridIcon size={36} />;
  const iconSize = size === 'large' ? 56 : 44;
  const fontSize = size === 'large' ? 26 : 20;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <GridIcon size={iconSize} />
      <div className="flex items-baseline" style={{lineHeight:1}}>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize,fontWeight:400,color:'#10b981',opacity:0.4}}>{'['}</span>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize,fontWeight:700,color:'white'}}>GP</span>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize,fontWeight:400,color:'#10b981',opacity:0.4}}>{']'}</span>
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:fontSize+1,fontWeight:200,color:'#10b981',letterSpacing:'3px',marginLeft:2}}>DASH</span>
      </div>
    </div>
  );
}

export { GridIcon };
