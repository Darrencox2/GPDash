'use client';
import { useState } from 'react';
import GPDashLogo from './GPDashLogo';
import { APP_VERSION } from '@/lib/version';

const NAV_ITEMS = [
  { id: 'huddle-today', section: null, label: 'Today', colour: '#10b981',
    icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { id: 'buddy-cover', section: null, label: 'Buddy cover', colour: '#a78bfa',
    icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },

  { id: '_planning', section: 'PLANNING' },
  { id: 'huddle-forward', section: 'PLANNING', label: 'Capacity planning', colour: '#818cf8',
    icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' },
  { id: 'workload-audit', section: 'PLANNING', label: 'Workload audit', colour: '#a78bfa',
    icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-5h2v5zm4 0h-2V7h2v10zm4 0h-2v-3h2v3z' },
  { id: 'qof-tracker', section: 'PLANNING', label: 'QOF tracker', colour: '#c084fc', badge: 'New',
    icon: 'M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z' },
  { id: 'room-dashboard', section: 'PLANNING', label: 'Rooms', colour: '#67e8f9',
    icon: 'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z' },

  { id: '_personal', section: 'PERSONAL' },
  { id: 'huddle-rota', section: 'PERSONAL', label: 'My rota', colour: '#60a5fa',
    icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5z' },

  { id: '_admin', section: 'ADMIN' },
  { id: 'team-members', section: 'ADMIN', label: 'Team', colour: '#fbbf24',
    icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
  { id: 'team-rota', section: 'ADMIN', label: 'Working patterns', colour: '#fbbf24',
    icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm4 4h2v2H9v-2zm4 0h2v2h-2v-2zm-4 4h2v2H9v-2zm4 0h2v2h-2v-2z' },
  { id: 'settings', section: 'ADMIN', label: 'Settings', colour: '#94a3b8',
    icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z' },
];

export default function Sidebar({ activeSection, setActiveSection, sidebarOpen, setSidebarOpen }) {
  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen z-40 lg:z-auto
        ${sidebarOpen ? 'w-60' : 'w-0 lg:w-14'}
        bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800
        flex-shrink-0 transition-all duration-200 overflow-hidden
        border-r border-white/5
      `}>
        <div className="h-full flex flex-col w-60 lg:w-auto">
          {/* Logo */}
          <div className="px-3 pt-3 pb-1">
            {sidebarOpen ? (
              <GPDashLogo size="sidebar" />
            ) : (
              <div className="flex justify-center">
                <GPDashLogo size="sidebar-collapsed" />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-1.5 py-3">
            {NAV_ITEMS.map(item => {
              // Section divider
              if (item.id.startsWith('_')) {
                if (!sidebarOpen) return <div key={item.id} className="mx-2 my-2" style={{height:1,background:'#1e293b'}} />;
                return (
                  <div key={item.id} className="flex items-center gap-2 mx-3 mt-4 mb-1.5">
                    <div className="flex-1 h-px" style={{background:'#1e293b'}} />
                    <span style={{fontSize:10,color:'#334155',letterSpacing:'1.5px'}}>{item.section}</span>
                    <div className="flex-1 h-px" style={{background:'#1e293b'}} />
                  </div>
                );
              }

              const isActive = activeSection === item.id;
              const activeStyle = isActive ? {
                background: `${item.colour}15`,
                borderLeft: `3px solid ${item.colour}`,
              } : {
                borderLeft: '3px solid transparent',
              };

              // Collapsed mode
              if (!sidebarOpen) {
                return (
                  <button key={item.id} onClick={() => { setActiveSection(item.id); setSidebarOpen(false); }}
                    className="w-full flex justify-center py-2 rounded-lg mb-0.5 transition-colors hover:bg-white/5"
                    style={activeStyle} title={item.label}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isActive ? item.colour : item.colour} style={{opacity: isActive ? 1 : 0.5}}>
                      <path d={item.icon} />
                    </svg>
                    {item.badge && <div style={{position:'absolute',top:2,right:4,width:6,height:6,borderRadius:'50%',background:item.colour}} />}
                  </button>
                );
              }

              // Expanded mode
              return (
                <button key={item.id} onClick={() => { setActiveSection(item.id); if (window.innerWidth < 1024) setSidebarOpen(false); }}
                  className="w-full flex items-center gap-2.5 rounded-lg mb-0.5 transition-colors hover:bg-white/5"
                  style={{...activeStyle, padding: '8px 10px'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={item.colour} style={{opacity: isActive ? 1 : 0.5, flexShrink: 0}}>
                    <path d={item.icon} />
                  </svg>
                  <span style={{fontSize:13, color: isActive ? '#e2e8f0' : '#64748b', fontWeight: isActive ? 500 : 400}}>{item.label}</span>
                  {item.badge && <span style={{fontSize:9,padding:'1px 6px',borderRadius:8,background:`${item.colour}20`,color:item.colour,marginLeft:'auto'}}>{item.badge}</span>}
                </button>
              );
            })}
          </nav>

          {/* Practice logo + version */}
          <div className="p-2 border-t border-white/5">
            {sidebarOpen ? (
              <div className="rounded-lg p-2.5 flex items-center gap-2.5" style={{background:'#1e293b'}}>
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                  <img src="/logo.png" alt="Practice" className="h-5 w-auto object-contain" onError={(e) => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:8px;font-weight:700;color:#0f172a;line-height:1">W&B</span>'; }} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-300 truncate">Winscombe & Banwell</div>
                  <div className="text-[10px] text-slate-600">Family Practice</div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                  <img src="/logo.png" alt="Practice" className="h-5 w-auto object-contain" onError={(e) => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:8px;font-weight:700;color:#0f172a;line-height:1">W&B</span>'; }} />
                </div>
              </div>
            )}
            {sidebarOpen && <div className="text-center mt-1.5 pb-0.5" style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:'#1e293b'}}>{APP_VERSION}</div>}
          </div>

          {/* Collapse toggle */}
          <div className="p-1.5 border-t border-white/5">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-full flex items-center justify-center py-1.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-white/5 text-xs transition-colors">
              {sidebarOpen ? '◂' : '▸'}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile toggle */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-3 left-3 z-50 lg:hidden bg-slate-900 text-white p-2 rounded-lg shadow-lg"
        style={{ display: sidebarOpen ? 'none' : 'flex' }}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </>
  );
}
