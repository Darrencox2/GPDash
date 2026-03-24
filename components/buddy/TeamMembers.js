'use client';
import { useState, useMemo } from 'react';
import { STAFF_GROUPS, guessGroupFromRole } from '@/lib/data';

const ROLE_OPTIONS = ['GP Partner', 'Salaried GP', 'GP Registrar', 'Locum', 'ANP', 'Paramedic Practitioner', 'Pharmacist', 'Physiotherapist', 'Practice Nurse', 'HCA', 'Admin'];
const GROUP_OPTIONS = Object.entries(STAFF_GROUPS).map(([k, v]) => ({ value: k, label: v.label }));

export default function TeamMembers({ data, saveData, toast }) {
  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const clinicians = ensureArray(data?.clinicians);

  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [newPerson, setNewPerson] = useState({ name: '', role: 'Salaried GP', initials: '', group: 'gp', sessions: 6 });

  const unconfirmedCount = clinicians.filter(c => !c.confirmed).length;
  const activeCount = clinicians.filter(c => c.status === 'active').length;
  const ltaCount = clinicians.filter(c => c.status === 'longTermAbsent').length;

  const filtered = useMemo(() => {
    return clinicians.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.role?.toLowerCase().includes(search.toLowerCase())) return false;
      if (groupFilter !== 'all' && groupFilter !== 'unconfirmed' && c.group !== groupFilter) return false;
      if (groupFilter === 'unconfirmed' && c.confirmed) return false;
      if (statusFilter === 'active' && c.status !== 'active') return false;
      if (statusFilter === 'lta' && c.status !== 'longTermAbsent') return false;
      if (statusFilter === 'left' && c.status !== 'left') return false;
      return true;
    });
  }, [clinicians, search, groupFilter, statusFilter]);

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

  const removePerson = (id) => {
    if (!confirm('Remove this person from the register?')) return;
    saveData({ ...data, clinicians: clinicians.filter(c => c.id !== id) });
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

  const buddyCoverPeople = clinicians.filter(c => c.buddyCover);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Staff Register</h1>
          <p className="text-sm text-slate-500 mt-1">{activeCount} active · {ltaCount} long-term absent{unconfirmedCount > 0 ? ` · ${unconfirmedCount} unconfirmed` : ''}</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">+ Add Person</button>
      </div>

      {unconfirmedCount > 0 && (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm font-medium text-amber-800">{unconfirmedCount} new staff discovered from CSV — review and confirm</span>
            <button onClick={() => setGroupFilter('unconfirmed')} className="ml-auto text-xs font-medium text-amber-700 hover:text-amber-900 underline">Show</button>
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

      <div className="flex gap-2 flex-wrap items-center">
        <input type="text" placeholder="Search by name or role..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
          <option value="all">All groups</option>
          {GROUP_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          {unconfirmedCount > 0 && <option value="unconfirmed">Unconfirmed ({unconfirmedCount})</option>}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="lta">Long-term absent</option>
          <option value="left">Left practice</option>
        </select>
      </div>

      <div className="text-xs text-slate-400">{filtered.length} of {clinicians.length} people</div>

      <div className="space-y-2">
        {filtered.map(c => {
          const isExpanded = expandedId === c.id;
          const groupLabel = STAFF_GROUPS[c.group]?.label || c.group;
          return (
            <div key={c.id} className={`card transition-colors ${!c.confirmed ? 'border-amber-300 bg-amber-50/30' : c.status === 'longTermAbsent' ? 'border-amber-200 bg-amber-50/50' : c.status === 'left' ? 'opacity-50' : ''}`}>
              <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${!c.confirmed ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{c.initials || '?'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{c.name}</span>
                    {!c.confirmed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Unconfirmed</span>}
                    {c.status === 'longTermAbsent' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">LTA</span>}
                    {c.status === 'left' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">Left</span>}
                  </div>
                  <div className="text-xs text-slate-500">{c.role} · {groupLabel}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {c.buddyCover && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Buddy</span>}
                  {c.showWhosIn && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 font-medium">Who's In</span>}
                  {c.source === 'csv' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">CSV</span>}
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{isExpanded ? '▾' : '›'}</span>
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
                    <div><label className="block text-xs text-slate-500 mb-1">Status</label><select value={c.status || 'active'} onChange={e => updateField(c.id, 'status', e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm"><option value="active">Active</option><option value="longTermAbsent">Long-term absent</option><option value="left">Left practice</option></select></div>
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
                    {c.confirmed && <button onClick={() => removePerson(c.id)} className="text-xs text-red-400 hover:text-red-600">Remove from register</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="card p-8 text-center text-sm text-slate-400">No staff match your filters</div>}
      </div>
    </div>
  );
}
