'use client';
import { useState } from 'react';
import GPDashLogo from './GPDashLogo';

const NAV_SECTIONS = [
  {
    id: 'huddle',
    icon: '📊',
    label: 'Huddle',
    colour: 'teal',
    items: [
      { id: 'huddle-today', label: 'Today' },
      { id: 'huddle-forward', label: 'Capacity Planning' },
      { id: 'huddle-history', label: 'History' },
      { id: 'huddle-settings', label: 'Settings' },
    ],
  },
  {
    id: 'buddy',
    icon: '🤝',
    label: 'Buddy Cover',
    colour: 'purple',
    items: [
      { id: 'buddy-daily', label: 'Daily' },
      { id: 'buddy-week', label: 'Week View' },
    ],
  },
  {
    id: 'settings',
    icon: '⚙️',
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
          <div className="px-3 pt-4 pb-3">
            {sidebarOpen ? (
              <div className="flex justify-center">
                <GPDashLogo size="sidebar" className="w-full max-w-[200px]" />
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
                  <button key={section.id} onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? accent.active : `text-slate-400 ${accent.hover}`
                    }`}>
                    <span className="text-base flex-shrink-0">{section.icon}</span>
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
                    <span className="text-base flex-shrink-0">{section.icon}</span>
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
