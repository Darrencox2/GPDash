// ═══════════════════════════════════════════════════════════════════════════
// lib/setup-suggestions.js — pure decision logic lifted out of SetupWizard
// ═══════════════════════════════════════════════════════════════════════════
//
// These four functions decide how a practice's appointment data is
// classified during onboarding — which slot types count as urgent, which as
// routine, which are duty-doctor slots, and what urgent capacity to
// pre-fill. Getting them wrong skews the whole capacity model for that
// practice from day one.
//
// They were declared inside SetupWizard.js, a 3,751-line client component,
// which made them impossible to test. Nothing about their behaviour has
// changed; they are the same functions, moved.

import { buildFacts } from '@/lib/workload-report';

export function suggestSlotCategoryWithConfidence(name) {
  const n = (name || '').toLowerCase();
  // HIGH-confidence urgent — distinctive keywords with little ambiguity.
  // Note: "triage" and "call back" are deliberately NOT treated as urgent —
  // they are usually administrative/triage contacts rather than bookable
  // urgent appointments, so they default to "other" (uncategorised) and the
  // practice can opt them in manually if they really use them as urgent.
  // `otd` added alongside `ontd`: OTD is the standard general-practice
  // abbreviation for on-the-day, ONTD is not one — the original only matched
  // the typo, so a slot literally named "OTD" was never suggested as urgent.
  // Additive and safe: these are hints the user must confirm, never a commit.
  if (/\bsame[\s-]?day\b/.test(n) || /\burgent\b/.test(n) || /\botd\b/.test(n) || /\bontd\b/.test(n)
      || /\bon[\s-]?the[\s-]?day\b/.test(n) || /\bacute\b/.test(n)
      || /\bemergency\b/.test(n)) {
    return { category: 'urgent', confidence: 'high' };
  }
  // HIGH-confidence routine — explicit "routine" or "pre-book"
  if (/\broutine\b/.test(n) || /\bpre[\s-]?book\b/.test(n)) {
    return { category: 'routine', confidence: 'high' };
  }
  // MEDIUM-confidence routine — ambiguous "book"/"appt"/"f2f" markers
  // that ALMOST always mean routine in practice but could conceivably
  // be tagged on a same-day slot too
  if (/\bbook\b/.test(n) || /\bappt\b/.test(n) || /\bappointment\b/.test(n)
      || /\bf2f\b/.test(n) || /\bface[\s-]?to[\s-]?face\b/.test(n)) {
    return { category: 'routine', confidence: 'medium' };
  }
  return null;
}

export function suggestSlotCategory(name) {
  const r = suggestSlotCategoryWithConfidence(name);
  return r ? r.category : null;
}
export function suggestDuty(name) {
  return /\bduty\b/.test((name || '').toLowerCase());
}

export function computeExpectedUrgentFromCsv(parsedCsv, slotFilters) {
  if (!parsedCsv) return {};
  const hs = { savedSlotFilters: { urgent: slotFilters?.urgent || {}, routine: slotFilters?.routine || {} } };
  let facts = [];
  try { facts = buildFacts(parsedCsv, [], hs).facts || []; } catch { return {}; }
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const perDate = {};
  for (const f of facts) {
    if (f.category !== 'urgent') continue;
    const k = `${f.iso}|${f.session}`;
    if (!perDate[k]) perDate[k] = { dow: f.dow, urgent: 0 };
    perDate[k].urgent += (f.count || 0);
  }
  const agg = {};
  for (const k in perDate) {
    const { dow, urgent } = perDate[k];
    const session = k.split('|')[1];
    if (dow < 1 || dow > 5) continue;
    agg[dow] = agg[dow] || { am: { sum: 0, n: 0 }, pm: { sum: 0, n: 0 } };
    agg[dow][session].sum += urgent;
    agg[dow][session].n += 1;
  }
  const out = {};
  for (let dow = 1; dow <= 5; dow++) {
    const a = agg[dow];
    if (!a) continue;
    out[DAY_NAMES[dow]] = {
      am: a.am.n ? Math.round(a.am.sum / a.am.n) : 0,
      pm: a.pm.n ? Math.round(a.pm.sum / a.pm.n) : 0,
    };
  }
  return out;
}

export function isCliniciansReviewed(list) {
  const active = (list || []).filter(c => c.status === 'active');
  return active.length > 0 && active.every(c => c.role && String(c.role).trim());
}
