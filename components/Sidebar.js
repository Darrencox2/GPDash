'use client';
import { useState } from 'react';
import GPDashLogo from './GPDashLogo';
import { APP_VERSION } from '@/lib/version';

const NAV_SECTIONS = [
  {
    id: 'huddle',
    iconPath: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
    label: 'Dashboard',
    colour: 'teal',
    items: [
      { id: 'huddle-today', label: 'Today' },
      { id: 'huddle-forward', label: 'Capacity Planning' },
    ],
  },
  {
    id: 'rota-section',
    iconPath: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5z',
    label: 'My Rota',
    colour: 'blue',
    items: [],
  },
  {
    id: 'buddy',
    iconPath: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    label: 'Buddy Cover',
    colour: 'purple',
    items: [
      { id: 'buddy-daily', label: 'Daily' },
      { id: 'buddy-week', label: 'Week View' },
    ],
  },
  {
    id: 'settings',
    iconPath: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    label: 'Settings',
    colour: 'slate',
    items: [
      { id: 'settings', label: 'General' },
      { id: 'team-members', label: 'Team Members' },
      { id: 'team-rota', label: 'Rota' },
    ],
  },
];

const ACCENT_COLOURS = {
  teal: { active: 'bg-teal-500/20 text-teal-200', hover: 'hover:bg-teal-500/10', dot: 'bg-teal-400' },
  purple: { active: 'bg-purple-500/20 text-purple-200', hover: 'hover:bg-purple-500/10', dot: 'bg-purple-400' },
  blue: { active: 'bg-blue-500/20 text-blue-200', hover: 'hover:bg-blue-500/10', dot: 'bg-blue-400' },
  slate: { active: 'bg-white/10 text-white', hover: 'hover:bg-white/5', dot: 'bg-slate-400' },
};

export default function Sidebar({ activeSection, setActiveSection, sidebarOpen, setSidebarOpen }) {
  const [expandedMenus, setExpandedMenus] = useState({ huddle: true, buddy: false, settings: false });

  const toggleMenu = (menu) => setExpandedMenus(prev => ({ ...prev, [menu]: !prev[menu] }));

  const isSectionActive = (sectionId) => {
    if (sectionId === 'rota-section') return activeSection === 'huddle-rota';
    const section = NAV_SECTIONS.find(s => s.id === sectionId);
    if (!section) return false;
    if (section.items.length === 0) return activeSection === sectionId;
    return section.items.some(item => item.id === activeSection);
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen z-40 lg:z-auto
        ${sidebarOpen ? 'w-60' : 'w-0 lg:w-16'} 
        bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800
        flex-shrink-0 transition-all duration-200 overflow-hidden
        border-r border-white/5
      `}>
        <div className="h-full flex flex-col w-60 lg:w-auto">
          {/* Logo */}
          <div className="px-3 pt-3 pb-2">
            {sidebarOpen ? (
              <div className="flex flex-col items-center gap-0.5">
                <GPDashLogo size="sidebar" className="w-full max-w-[200px]" />
                <div className="w-full bg-white rounded-2xl p-2 flex items-center justify-center">
                  <img src="/logo.png" alt="Practice" className="h-12 w-auto object-contain" />
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <GPDashLogo size="sidebar-collapsed" className="w-10 h-10" />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {NAV_SECTIONS.map(section => {
              const accent = ACCENT_COLOURS[section.colour];
              const isActive = isSectionActive(section.id);

              if (section.items.length === 0) {
                return (
                  <button key={section.id} onClick={() => setActiveSection(section.id === 'rota-section' ? 'huddle-rota' : section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? accent.active : `text-slate-400 ${accent.hover}`
                    }`}>
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d={section.iconPath}/></svg>
                    {sidebarOpen && <span>{section.label}</span>}
                  </button>
                );
              }

              return (
                <div key={section.id}>
                  <button onClick={() => toggleMenu(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'text-white' : `text-slate-400 ${accent.hover}`
                    }`}>
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d={section.iconPath}/></svg>
                    {sidebarOpen && (
                      <>
                        <span className="flex-1 text-left">{section.label}</span>
                        <span className="text-[10px] text-slate-500">{expandedMenus[section.id] ? '▾' : '›'}</span>
                      </>
                    )}
                  </button>
                  {expandedMenus[section.id] && sidebarOpen && (
                    <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                      {section.items.map(item => (
                        <button key={item.id} onClick={() => setActiveSection(item.id)}
                          className={`w-full text-left px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                            activeSection === item.id
                              ? `${accent.active} font-medium`
                              : `text-slate-500 hover:text-slate-300 ${accent.hover}`
                          }`}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Version */}
          {sidebarOpen && <div className="px-4 py-1 text-center text-[10px] text-slate-600">{APP_VERSION}</div>}

          {/* Collapse toggle */}
          <div className="p-3 border-t border-white/5">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 text-xs transition-colors">
              {sidebarOpen ? '◂ Collapse' : '▸'}
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
