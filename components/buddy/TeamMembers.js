'use client';
import { useState, useMemo } from 'react';
import { STAFF_GROUPS, guessGroupFromRole } from '@/lib/data';

const ROLE_OPTIONS = ['GP Partner', 'Associate Partner', 'Salaried GP', 'GP Registrar', 'Locum', 'ANP', 'Paramedic Practitioner', 'Pharmacist', 'Physiotherapist', 'Practice Nurse', 'Nurse Associate', 'HCA', 'Medical Student', 'Admin'];
const GROUP_OPTIONS = Object.entries(STAFF_GROUPS).map(([k, v]) => ({ value: k, label: v.label }));
const GROUP_ORDER = ['gp', 'nursing', 'allied', 'admin'];
const GROUP_COLOURS = {
  gp: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  nursing: { bg: 'bg-teal-50', border: 'border-teal-200', badge: 'bg-teal-100 text-teal-700', dot: 'bg-teal-500' },
  allied: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  admin: { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};

export default function TeamMembers({ data, saveData, toast }) {
  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const clinicians = ensureArray(data?.clinicians);

  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: '', role: 'Salaried GP', initials: '', group: 'gp', sessions: 6 });

  const unconfirmedCount = clinicians.filter(c => !c.confirmed).length;
  const activeStaff = clinicians.filter(c => c.status === 'active' || c.status === 'longTermAbsent');
  const adminStaff = clinicians.filter(c => c.status === 'administrative');
  const leftStaff = clinicians.filter(c => c.status === 'left');

  // Group active staff by group, filtered by search
  const groupedActive = useMemo(() => {
    const filtered = activeStaff.filter(c => {
      if (!search) return true;
      const s = search.toLowerCase();
      return c.name.toLowerCase().includes(s) || c.role?.toLowerCase().includes(s);
    });
    const groups = {};
    GROUP_ORDER.forEach(g => { groups[g] = []; });
    filtered.forEach(c => {
      const g = c.group || 'admin';
      if (!groups[g]) groups[g] = [];
      groups[g].push(c);
    });
    // Sort each group: unconfirmed first, then LTA, then alphabetical
    Object.keys(groups).forEach(g => {
      groups[g].sort((a, b) => {
        if (!a.confirmed && b.confirmed) return -1;
        if (a.confirmed && !b.confirmed) return 1;
        if (a.status === 'longTermAbsent' && b.status !== 'longTermAbsent') return 1;
        if (a.status !== 'longTermAbsent' && b.status === 'longTermAbsent') return -1;
        return a.name.localeCompare(b.name);
      });
    });
    return groups;
  }, [activeStaff, search]);

  const updateField = (id, field, value) => {
    const updated = clinicians.map(c => {
      if (c.id !== id) return c;
      const u = { ...c, [field]: value };
      if (field === 'status') u.longTermAbsent = value === 'longTermAbsent';
      if (field === 'longTermAbsent') u.status = value ? 'longTermAbsent' : 'active';
      if (field === 'role') u.group = guessGroupFromRole(value);
      return u;
    });
    saveData({ ...data, clinicians: updated }, false);
  };

  // Soft-delete: set status to 'left' instead of removing
  const removePerson = (id) => {
    if (!confirm('Mark this person as left? They can be restored later.')) return;
    updateField(id, 'status', 'left');
    toast?.('Person marked as left', 'info', 1500);
  };

  // Hard delete (only from left section)
  const permanentlyDelete = (id) => {
    if (!confirm('Permanently delete this person? This cannot be undone.')) return;
    saveData({ ...data, clinicians: clinicians.filter(c => c.id !== id) });
    toast?.('Person permanently removed', 'success', 1500);
  };

  const restorePerson = (id) => {
    updateField(id, 'status', 'active');
    toast?.('Person restored to active', 'success', 1500);
  };

  const confirmPerson = (id) => {
    updateField(id, 'confirmed', true);
    toast?.('Person confirmed', 'success', 1500);
  };

  const addPerson = () => {
    if (!newPerson.name) return;
    const newId = Math.max(0, ...clinicians.map(c => c.id)) + 1;
    const initials = newPerson.initials || newPerson.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
    const person = {
      id: newId, name: newPerson.name, initials, role: newPerson.role, group: newPerson.group,
      sessions: newPerson.sessions || 6, primaryBuddy: null, secondaryBuddy: null,
      status: 'active', longTermAbsent: false, canProvideCover: true,
      buddyCover: false, showWhosIn: true, source: 'manual', confirmed: true, aliases: [],
    };
    saveData({ ...data, clinicians: [...clinicians, person] });
    setNewPerson({ name: '', role: 'Salaried GP', initials: '', group: 'gp', sessions: 6 });
    setShowAddForm(false);
    toast?.('Person added', 'success', 1500);
  };

  const addAlias = (id, alias) => {
    if (!alias) return;
    const c = clinicians.find(c => c.id === id);
    if (!c) return;
    updateField(id, 'aliases', [...(c.aliases || []), alias]);
  };

  const removeAlias = (id, aliasIdx) => {
    const c = clinicians.find(c => c.id === id);
    if (!c) return;
    updateField(id, 'aliases', (c.aliases || []).filter((_, i) => i !== aliasIdx));
  };

  const buddyCoverPeople = clinicians.filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');

  const removeAllUnconfirmed = () => {
    const unconfirmed = clinicians.filter(c => !c.confirmed);
    const count = unconfirmed.length;
    if (!confirm(`Mark all ${count} unconfirmed staff as left?`)) return;
    const updated = clinicians.map(c => !c.confirmed ? { ...c, status: 'left' } : c);
    saveData({ ...data, clinicians: updated });
    toast?.(`${count} unconfirmed staff marked as left`, 'success', 1500);
  };

  // ── Person card (shared by all sections) ──────────────────────
  const PersonRow = ({ c, compact = false, showRestore = false }) => {
    const isExpanded = expandedId === c.id;
    const gc = GROUP_COLOURS[c.group] || GROUP_COLOURS.admin;
    return (
      <div className={`card transition-colors ${!c.confirmed ? 'border-amber-300 bg-amber-50/30' : c.status === 'longTermAbsent' ? 'border-amber-200 bg-amber-50/50' : compact ? 'opacity-70 hover:opacity-100' : ''}`}>
        <div className="p-3 flex items-center gap-3">
          {!showRestore && (
            <button onClick={(e) => { e.stopPropagation(); removePerson(c.id); }} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0" title="Mark as left">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 cursor-pointer ${!c.confirmed ? 'bg-amber-100 text-amber-700' : gc.badge}`} onClick={() => setExpandedId(isExpanded ? null : c.id)}>{c.initials || '?'}</div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-900">{c.name}</span>
              {!c.confirmed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Unconfirmed</span>}
              {c.status === 'longTermAbsent' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">LTA</span>}
            </div>
            <div className="text-xs text-slate-500">{c.role}{c.source === 'csv' ? ' · from CSV' : ''}</div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {c.buddyCover && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Buddy</span>}
            {c.showWhosIn && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 font-medium">Who's In</span>}
          </div>
          {showRestore && (
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={() => restorePerson(c.id)} className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100">Restore</button>
              <button onClick={() => permanentlyDelete(c.id)} className="px-2.5 py-1 rounded-lg bg-red-50 text-red-500 text-xs font-medium hover:bg-red-100">Delete</button>
            </div>
          )}
          {!showRestore && <span className="text-xs text-slate-400 flex-shrink-0">{isExpanded ? '▾' : '›'}</span>}
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-4">
            {!c.confirmed && (
              <div className="flex gap-2">
                <button onClick={() => confirmPerson(c.id)} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600">Confirm person</button>
                <button onClick={() => removePerson(c.id)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100">Remove</button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Role</label><select value={c.role || ''} onChange={e => updateField(c.id, 'role', e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm">{ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              <div><label className="block text-xs text-slate-500 mb-1">Group</label><select value={c.group || 'gp'} onChange={e => updateField(c.id, 'group', e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm">{GROUP_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
              <div><label className="block text-xs text-slate-500 mb-1">Status</label><select value={c.status || 'active'} onChange={e => updateField(c.id, 'status', e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm"><option value="active">Active</option><option value="longTermAbsent">Long-term absent</option><option value="administrative">Administrative</option><option value="left">Left practice</option></select></div>
              <div><label className="block text-xs text-slate-500 mb-1">Sessions/week</label><input type="number" min="0" max="10" value={c.sessions || 0} onChange={e => updateField(c.id, 'sessions', parseInt(e.target.value) || 0)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm text-center" /></div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-2">Features</label>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => updateField(c.id, 'buddyCover', !c.buddyCover)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${c.buddyCover ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{c.buddyCover ? '✓ ' : ''}Buddy Cover</button>
                <button onClick={() => updateField(c.id, 'showWhosIn', !c.showWhosIn)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${c.showWhosIn ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{c.showWhosIn ? '✓ ' : ''}Who's In</button>
                <button onClick={() => updateField(c.id, 'canProvideCover', c.canProvideCover === false ? true : false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${c.canProvideCover !== false ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{c.canProvideCover !== false ? '✓ ' : ''}Can Cover Others</button>
              </div>
            </div>

            {c.buddyCover && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-slate-500 mb-1">Primary buddy</label><select value={c.primaryBuddy || ''} onChange={e => updateField(c.id, 'primaryBuddy', e.target.value ? parseInt(e.target.value) : null)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm"><option value="">None</option>{buddyCoverPeople.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.id}>{x.initials} — {x.name}</option>)}</select></div>
                <div><label className="block text-xs text-slate-500 mb-1">Secondary buddy</label><select value={c.secondaryBuddy || ''} onChange={e => updateField(c.id, 'secondaryBuddy', e.target.value ? parseInt(e.target.value) : null)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm"><option value="">None</option>{buddyCoverPeople.filter(x => x.id !== c.id && x.id !== c.primaryBuddy).map(x => <option key={x.id} value={x.id}>{x.initials} — {x.name}</option>)}</select></div>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-500 mb-1">Name aliases (for CSV/TeamNet matching)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(c.aliases || []).map((alias, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-xs text-slate-600">
                    {alias}<button onClick={() => removeAlias(c.id, i)} className="text-slate-400 hover:text-red-500">✕</button>
                  </span>
                ))}
                {(c.aliases || []).length === 0 && <span className="text-xs text-slate-400 italic">No aliases</span>}
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="Add alias..." id={`alias-${c.id}`} className="flex-1 px-2 py-1 rounded border border-slate-200 text-xs"
                  onKeyDown={e => { if (e.key === 'Enter') { addAlias(c.id, e.target.value); e.target.value = ''; } }} />
                <button onClick={() => { const el = document.getElementById(`alias-${c.id}`); addAlias(c.id, el.value); el.value = ''; }}
                  className="px-2 py-1 rounded bg-slate-100 text-xs text-slate-600 hover:bg-slate-200">Add</button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-[10px] text-slate-400">Source: {c.source || 'manual'} · ID: {c.id}</span>
              {c.confirmed && <button onClick={() => removePerson(c.id)} className="text-xs text-red-400 hover:text-red-600">Mark as left</button>}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Staff Register</h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeStaff.filter(c => c.status === 'active').length} active
            {activeStaff.filter(c => c.status === 'longTermAbsent').length > 0 ? ` · ${activeStaff.filter(c => c.status === 'longTermAbsent').length} LTA` : ''}
            {adminStaff.length > 0 ? ` · ${adminStaff.length} administrative` : ''}
            {leftStaff.length > 0 ? ` · ${leftStaff.length} left` : ''}
            {unconfirmedCount > 0 ? ` · ${unconfirmedCount} unconfirmed` : ''}
          </p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">+ Add Person</button>
      </div>

      {unconfirmedCount > 0 && (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm font-medium text-amber-800">{unconfirmedCount} new staff discovered from CSV — review and confirm</span>
            <div className="ml-auto flex gap-2">
              <button onClick={removeAllUnconfirmed} className="text-xs font-medium text-red-600 hover:text-red-800 underline">Remove all unconfirmed</button>
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="card p-4 bg-slate-50 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Add new person</div>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[180px]"><label className="block text-xs font-medium text-slate-600 mb-1">Name</label><input type="text" placeholder="Dr. Jane Smith" value={newPerson.name} onChange={e => setNewPerson(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" /></div>
            <div className="w-20"><label className="block text-xs font-medium text-slate-600 mb-1">Initials</label><input type="text" placeholder="JS" maxLength={4} value={newPerson.initials} onChange={e => setNewPerson(p => ({ ...p, initials: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm text-center uppercase focus:outline-none focus:ring-2 focus:ring-slate-900" /></div>
            <div className="w-40"><label className="block text-xs font-medium text-slate-600 mb-1">Role</label><select value={newPerson.role} onChange={e => setNewPerson(p => ({ ...p, role: e.target.value, group: guessGroupFromRole(e.target.value) }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm">{ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
            <div className="w-32"><label className="block text-xs font-medium text-slate-600 mb-1">Group</label><select value={newPerson.group} onChange={e => setNewPerson(p => ({ ...p, group: e.target.value }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm">{GROUP_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
            <button onClick={addPerson} className="btn-primary text-sm">Add</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input type="text" placeholder="Search by name or role..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
      </div>

      {/* Active staff grouped by role */}
      {GROUP_ORDER.map(groupKey => {
        const members = groupedActive[groupKey];
        if (!members || members.length === 0) return null;
        const gc = GROUP_COLOURS[groupKey];
        const groupLabel = STAFF_GROUPS[groupKey]?.label || groupKey;
        return (
          <div key={groupKey}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2.5 h-2.5 rounded-full ${gc.dot}`} />
              <span className="text-sm font-semibold text-slate-700">{groupLabel}</span>
              <span className="text-xs text-slate-400">{members.length}</span>
            </div>
            <div className="space-y-1.5">
              {members.map(c => <PersonRow key={c.id} c={c} />)}
            </div>
          </div>
        );
      })}

      {groupedActive && Object.values(groupedActive).every(g => g.length === 0) && search && (
        <div className="card p-8 text-center text-sm text-slate-400">No active staff match &quot;{search}&quot;</div>
      )}

      {/* Administrative section — collapsible */}
      {adminStaff.length > 0 && (
        <div>
          <button onClick={() => setShowAdmin(!showAdmin)} className="flex items-center gap-2 w-full text-left group">
            <span className="text-xs text-slate-400">{showAdmin ? '▾' : '›'}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="text-sm font-semibold text-slate-500">Administrative</span>
            <span className="text-xs text-slate-400">{adminStaff.length}</span>
            <span className="text-xs text-slate-400 ml-1">— hidden from all views</span>
          </button>
          {showAdmin && (
            <div className="space-y-1.5 mt-2 ml-5">
              {adminStaff.map(c => <PersonRow key={c.id} c={c} compact />)}
            </div>
          )}
        </div>
      )}

      {/* Left / removed section — collapsible */}
      {leftStaff.length > 0 && (
        <div>
          <button onClick={() => setShowLeft(!showLeft)} className="flex items-center gap-2 w-full text-left group">
            <span className="text-xs text-slate-400">{showLeft ? '▾' : '›'}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
            <span className="text-sm font-semibold text-slate-500">Left / Removed</span>
            <span className="text-xs text-slate-400">{leftStaff.length}</span>
            <span className="text-xs text-slate-400 ml-1">— can be restored</span>
          </button>
          {showLeft && (
            <div className="space-y-1.5 mt-2 ml-5">
              {leftStaff.map(c => <PersonRow key={c.id} c={c} compact showRestore />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
