'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ⌘K — jump anywhere
// ═══════════════════════════════════════════════════════════════════════════
// The same dozen people open GPDash every day. A palette lets them go to a
// section, a clinician's rota, a date on Today or a week in capacity
// planning without reaching for the mouse. `?` shows the shortcuts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NAV_ITEMS } from '@/components/Sidebar';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const iso = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };
const fmt = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

// What a typed phrase means as a date, if anything. "tuesday" is the next
// Tuesday including today; "next tuesday" skips this week's; "14 sep" and
// "14/9" are this year's, or next year's if that has passed.
export function parseDateQuery(q, now = new Date()) {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const today = new Date(now); today.setHours(12, 0, 0, 0);
  const add = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
  if (s === 'today') return { date: today, label: 'Today' };
  if (s === 'tomorrow') return { date: add(1), label: 'Tomorrow' };
  if (s === 'yesterday') return { date: add(-1), label: 'Yesterday' };
  let m = s.match(/^(next |last |this )?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/);
  if (m) {
    const target = DAYS.findIndex((d) => d.startsWith(m[2]));
    let delta = (target - today.getDay() + 7) % 7;
    if (m[1] === 'next ') delta = delta === 0 ? 7 : delta + 7;
    if (m[1] === 'last ') delta = delta === 0 ? -7 : delta - 7;
    return { date: add(delta), label: null };
  }
  m = s.match(/^(\d{1,2})[\s/\-]+([a-z]{3,}|\d{1,2})(?:[\s/\-]+(\d{2,4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const mon = /^\d+$/.test(m[2]) ? Number(m[2]) - 1 : MONTHS.findIndex((x) => m[2].startsWith(x));
    if (mon < 0 || mon > 11 || day < 1 || day > 31) return null;
    let year = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : today.getFullYear();
    let d = new Date(year, mon, day, 12);
    if (!m[3] && d < add(-120)) d = new Date(year + 1, mon, day, 12);
    if (isNaN(d)) return null;
    return { date: d, label: null };
  }
  return null;
}

export function parseWeekQuery(q) {
  const m = q.trim().toLowerCase().match(/^(?:week|wk|w)\s*(\d)$/);
  return m && Number(m[1]) >= 1 && Number(m[1]) <= 6 ? Number(m[1]) : null;
}

const SHORTCUTS = [
  ['⌘K / Ctrl K', 'Open this palette'],
  ['[  ]', 'Previous / next day on Today, previous / next week on Buddy cover'],
  ['Esc', 'Close a dialog or this palette'],
  ['?', 'Show these shortcuts'],
];

const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

export default function CommandPalette({ data, activeSection, onSection, onDate, onWeek, onClinician }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('search');   // 'search' | 'shortcuts'
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Global keys. ⌘K toggles; ? shows shortcuts. Neither fires from inside a
  // text field, so nobody loses a question mark they were typing.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setMode('search'); setOpen((v) => !v); return;
      }
      if (e.key === '?' && !isTyping(e) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); setMode('shortcuts'); setOpen(true); return;
      }
      if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) { setQ(''); setCursor(0); }
  }, [open, mode]);

  const sections = useMemo(() => {
    const out = [];
    for (const it of NAV_ITEMS) {
      if (it.id.startsWith('_') || !it.label) continue;
      if (it.requires === 'admin' && !data?._v4?.isAdmin && !data?._v4?.canEdit) { /* still list; the target page enforces */ }
      // An item with children lists its children only: the Monthly child
      // shares the parent's id, and two rows for one place is one too many.
      if (it.children?.length) {
        for (const c of it.children) out.push({ kind: 'section', id: c.id, label: `${it.label} · ${c.label}`, hint: it.section ? it.section.toLowerCase() : '' });
      } else {
        out.push({ kind: 'section', id: it.id, label: it.label, hint: it.section ? it.section.toLowerCase() : '' });
      }
    }
    out.push({ kind: 'section', id: 'account', label: 'My account', hint: 'personal' });
    out.push({ kind: 'section', id: 'changelog', label: 'Changelog', hint: 'what changed' });
    return out;
  }, [data]);

  const clinicians = useMemo(() => (Array.isArray(data?.clinicians) ? data.clinicians : Object.values(data?.clinicians || {}))
    .filter((c) => c && c.name && c.status !== 'left')
    .map((c) => ({ kind: 'clinician', id: c.id, initials: c.initials, label: c.name, hint: c.role || '' })), [data]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = [];
    const d = parseDateQuery(s);
    if (d) out.push({ kind: 'date', id: iso(d.date), label: `Today page · ${d.label || fmt(d.date)}`, hint: 'go to date' });
    const w = parseWeekQuery(s);
    if (w) out.push({ kind: 'week', id: w, label: `Capacity planning · Week ${w}`, hint: 'weekly view' });
    const score = (label, hint) => {
      if (!s) return 1;
      const l = label.toLowerCase();
      if (l.startsWith(s)) return 3;
      if (l.split(/[\s·]+/).some((word) => word.startsWith(s))) return 2;
      if (l.includes(s) || (hint || '').toLowerCase().includes(s)) return 1;
      return 0;
    };
    const rank = (items) => items.map((it) => ({ it, sc: score(it.label, it.hint) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).map((x) => x.it);
    out.push(...rank(sections));
    if (s.length >= 2) out.push(...rank(clinicians).slice(0, 8));
    return out.slice(0, 14);
  }, [q, sections, clinicians]);

  useEffect(() => { setCursor(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.children?.[cursor];
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [cursor]);

  const run = (item) => {
    if (!item) return;
    setOpen(false);
    if (item.kind === 'section') onSection?.(item.id);
    else if (item.kind === 'date') onDate?.(item.id);
    else if (item.kind === 'week') onWeek?.(item.id);
    else if (item.kind === 'clinician') onClinician?.(item);
  };

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[cursor]); }
  };

  if (!open) return null;
  const KIND_LABEL = { section: 'Go to', date: 'Date', week: 'Week', clinician: 'Rota' };

  return (
    <div role="presentation" onMouseDown={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483500, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div role="dialog" aria-modal="true" aria-label={mode === 'shortcuts' ? 'Keyboard shortcuts' : 'Jump to'} onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, calc(100vw - 32px))', background: 'var(--surface-solid)', border: '1px solid var(--g-border-2)', borderRadius: 'var(--r-lg)', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        {mode === 'shortcuts' ? (
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--g-text-hi)', marginBottom: 10 }}>Keyboard shortcuts</div>
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '6px 0', borderTop: '1px solid var(--g-border)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--g-text-hi)', background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', borderRadius: 'var(--r-sm)', padding: '2px 7px', whiteSpace: 'nowrap' }}>{k}</span>
                <span style={{ fontSize: 13, color: 'var(--g-text-mid)' }}>{v}</span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--meta)', marginTop: 12 }}>In the palette, type a section, a name, a date like <b>next tuesday</b> or <b>14 sep</b>, or <b>week 3</b>.</div>
          </div>
        ) : (
          <>
            <input ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey}
              placeholder="Jump to a section, a clinician, a date, or week 3…" aria-label="Jump to"
              style={{ width: '100%', padding: '14px 18px', fontSize: 15, background: 'transparent', color: 'var(--g-text-hi)', border: 'none', borderBottom: '1px solid var(--g-border)', outline: 'none' }} />
            <div ref={listRef} role="listbox" style={{ maxHeight: '52vh', overflowY: 'auto', padding: 6 }}>
              {results.length === 0 && <div style={{ padding: '14px 12px', fontSize: 13, color: 'var(--meta)' }}>Nothing matches. Try a section name, a clinician, a weekday, or week 3.</div>}
              {results.map((r, i) => (
                <div key={`${i}:${r.kind}:${r.id}`} role="option" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => run(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer', background: i === cursor ? 'var(--g-tile)' : 'transparent', boxShadow: i === cursor ? 'inset 2px 0 0 var(--accent)' : 'none' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--meta)', width: 44, flex: 'none' }}>{KIND_LABEL[r.kind]}</span>
                  <span style={{ fontSize: 14, color: 'var(--g-text-hi)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                  {r.hint && <span style={{ fontSize: 12, color: 'var(--meta)', flex: 'none' }}>{r.hint}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, padding: '8px 14px', borderTop: '1px solid var(--g-border)', fontSize: 11.5, color: 'var(--meta)' }}>
              <span>↑↓ move</span><span>↵ go</span><span>esc close</span><span style={{ marginLeft: 'auto' }}>? shortcuts</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
