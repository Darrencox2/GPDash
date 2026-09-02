// ═══════════════════════════════════════════════════════════════════════════
// Render every dashboard section with fixture data and fail if any throws.
// ═══════════════════════════════════════════════════════════════════════════
// The bugs that bite this app are wiring bugs - a helper that no longer
// exists, a prop shape that changed - and a unit test over lib/ cannot see
// them. This bundles each section with esbuild (real JSX, the @ alias, the
// router stubbed), renders it to a string with react-dom/server, and checks
// the output carries the text it should. No browser, no database, a few
// seconds. Run by tests/unit/render-sections.spec.js; or directly:
//   node tests/render/run.mjs
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);

// section id -> [import path, props builder, text the output must contain]
const ENTRY = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import { buildFixture } from '@/tests/render/fixture';
import HuddleToday from '@/components/huddle/HuddleToday';
import MorningBriefing from '@/components/huddle/MorningBriefing';
import HuddleForward from '@/components/huddle/HuddleForward';
import CapacityWeek from '@/components/huddle/CapacityWeek';
import MyRota from '@/components/huddle/MyRota';
import BuddyDaily from '@/components/buddy/BuddyDaily';
import StaffChanges from '@/components/workforce/StaffChanges';
import WorkloadAudit from '@/components/huddle/WorkloadAudit';
import SpendTracker from '@/components/workforce/SpendTracker';
import AccountSettings from '@/components/AccountSettings';
import Changelog from '@/components/Changelog';
import Sidebar from '@/components/Sidebar';
import CommandPalette from '@/components/CommandPalette';

const f = buildFixture();
const noop = () => {};
const monday = (() => { const m = new Date(); m.setHours(0,0,0,0); m.setDate(m.getDate() - ((m.getDay()+6)%7)); return m; })();
const helpers = (() => {
  const iso = (d) => { const x = new Date(d); x.setHours(12,0,0,0); return x.toISOString().slice(0,10); };
  const dayIdx = { Monday:0, Tuesday:1, Wednesday:2, Thursday:3, Friday:4 };
  const keyFor = (day) => { const m = new Date(monday); m.setDate(m.getDate() + (dayIdx[day] ?? 0)); return iso(m); };
  const ids = () => f.data.clinicians.map((c) => c.id);
  return {
    ensureArray: (x) => Array.isArray(x) ? x : [], getDateKey: () => iso(new Date()), getDateKeyForDay: keyFor, getTodayKey: () => iso(new Date()),
    isPastDate: () => false, isToday: (k) => k === iso(new Date()), isClosedDay: () => false, getClosedReason: () => null, toggleClosedDay: noop,
    hasPlannedAbsence: () => false, getPlannedAbsenceReason: () => null, getPresentClinicians: () => ids(), getAbsentClinicians: () => [], getDayOffClinicians: () => [],
    getClinicianStatus: () => 'present', togglePresence: noop, getCurrentAllocations: () => null, getClinicianById: (id) => f.data.clinicians.find((c) => c.id === id),
    getWeekAbsences: () => [], syncTeamNet: async () => {}, toggleRotaDay: noop, removeClinician: noop, updateClinicianField: noop, dataVersion: 1, setDataVersion: noop, setData: noop,
  };
})();
const common = { data: f.data, saveData: noop, toast: noop, huddleData: f.huddleData, setActiveSection: noop };

const SECTIONS = [
  ['Today', HuddleToday, { ...common, setHuddleData: noop, huddleMessages: [], setHuddleMessages: noop }, 'Urgent'],
  ['Morning briefing', MorningBriefing, { data: f.data, huddleData: f.huddleData, huddleMessages: [] }, 'Duty doctor'],
  ['Capacity planning · monthly', HuddleForward, { ...common, view: 'month' }, 'Capacity planning'],
  ['Capacity planning · weekly', HuddleForward, { ...common, view: 'week' }, 'Capacity planning'],
  ['Week view', CapacityWeek, { data: f.data, hs: f.data.huddleSettings, huddleData: f.huddleData, sites: f.sites, capacityStaffing: f.data.huddleSettings.capacityStaffing, teamClin: f.teamClin }, 'Winscombe'],
  ['My rota', MyRota, { ...common }, 'rota'],
  ['Buddy cover', BuddyDaily, { ...common, password: '', selectedWeek: monday, setSelectedWeek: noop, selectedDay: 'Wednesday', setSelectedDay: noop, syncStatus: '', setSyncStatus: noop, isGenerating: false, setIsGenerating: noop, helpers, onRevertChange: noop }, 'Buddy'],
  ['Staff changes', StaffChanges, { data: f.data, saveData: noop }, 'Staff changes'],
  ['Reporting', WorkloadAudit, { data: f.data, huddleData: f.huddleData }, 'Report'],
  ['Locum spend', SpendTracker, { ...common }, 'spend'],
  ['My account', AccountSettings, { data: f.data }, 'Account'],
  ['Changelog', Changelog, {}, 'Changelog'],
  ['Sidebar', Sidebar, { activeSection: 'huddle-today', setActiveSection: noop, sidebarOpen: true, setSidebarOpen: noop, data: f.data }, 'Capacity planning'],
  ['Command palette', CommandPalette, { data: f.data, activeSection: 'huddle-today' }, ''],
];

const results = [];
for (const [name, Comp, props, mustContain] of SECTIONS) {
  const t0 = Date.now();
  try {
    const html = renderToString(React.createElement(Comp, props));
    const ok = !mustContain || html.toLowerCase().includes(mustContain.toLowerCase());
    results.push({ name, ok, ms: Date.now() - t0, error: ok ? null : 'rendered, but the output does not mention "' + mustContain + '"', bytes: html.length });
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(e && e.message || e).split('\\n')[0] });
  }
}
process.stdout.write(JSON.stringify(results) + '\\n');
`;

// Inside the repo so the bundle's require('react') resolves from node_modules.
const cacheRoot = join(ROOT, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const dir = mkdtempSync(join(cacheRoot, 'gpdash-render-'));
const entry = join(dir, 'entry.mjs');
const out = join(dir, 'bundle.cjs');
writeFileSync(entry, ENTRY);
// Warnings from React about useLayoutEffect on the server are noise here.
const origWarn = console.error;
try {
  await build({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent',
    jsx: 'automatic', loader: { '.js': 'jsx' },
    alias: { '@': ROOT, 'next/navigation': join(ROOT, 'tests/render/stubs/next-navigation.js') },
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['react', 'react-dom', 'react-dom/server', '@supabase/ssr', '@supabase/supabase-js'],
    absWorkingDir: ROOT,
  });
  // The bundle prints one JSON line; run it in this process for the report.
  const { execFileSync } = await import('node:child_process');
  const stdout = execFileSync(process.execPath, [out], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const line = stdout.trim().split('\n').pop();
  const results = JSON.parse(line);
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(30)} ${String(r.ms).padStart(4)}ms${r.ok ? `  ${r.bytes} bytes` : `  ${r.error}`}`);
  }
  console.log(failed ? `${failed} of ${results.length} sections failed to render` : `all ${results.length} sections render`);
  process.exitCode = failed ? 1 : 0;
} finally {
  console.error = origWarn;
  rmSync(dir, { recursive: true, force: true });
}
