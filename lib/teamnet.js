// Shared TeamNet calendar (ICS) parsing — used by both the v3 password-gated
// /api/sync-teamnet endpoint and the v4 Supabase-authed /api/v4/sync-teamnet
// endpoint. Pure functions, no auth, no NextResponse — caller handles those.
//
// Matching strategy:
//   1. Build a normalised name record for every clinician — handles both
//      "Firstname Surname" and "Surname, Firstname" CSV shapes by inverting
//      the latter so firstName and surname always resolve correctly.
//   2. For each event, score every clinician on what's present in the
//      event summary:
//        - Initials as a standalone word → strong match (score 3)
//        - Full name (firstname + surname) present → strong match (score 3)
//        - Both first name AND surname present as separate words → score 2
//        - Surname alone, with no other plausible candidate having that
//          surname OR first name in the summary → score 1
//        - Anything weaker → 0 (refused)
//   3. Pick the single highest-scoring candidate. If two candidates tie at
//      the top, refuse to attribute the event (ambiguous — better to flag
//      than to silently put a CPD day on the wrong clinician).
//
// Before this rewrite the matcher would treat "Ellison, Katie" as
// firstName="Ellison," surname="Katie" — so Katie Ellison and Katie
// Parkhouse both had surname="Katie" and every "Katie - CPD" event got
// attributed to whichever appeared first in the clinician list.

export function parseTeamnetCalendar(icsText, clinicians) {
  const events = parseICS(icsText);

  const records = (clinicians || []).map(c => ({
    id: c.id,
    initials: (c.initials || '').toUpperCase(),
    ...extractNames(c.name),
  }));

  const absences = [];

  for (const event of events) {
    const summary = event.summary || '';
    const summaryLower = summary.toLowerCase();
    // Word-tokenise the summary once so includes-style false positives
    // (e.g. "Ellis" inside "Ellison") can be avoided when we want strict
    // word-boundary checks.
    const summaryWords = new Set(
      summaryLower.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    );

    const candidates = [];
    for (const r of records) {
      const { initials, firstName, surname, fullName } = r;
      const fLow = firstName.toLowerCase();
      const sLow = surname.toLowerCase();
      const flLow = fullName.toLowerCase();

      let score = 0;

      // Initials standalone word — only counts if 2+ characters (avoid
      // single-letter false positives) and present as a whole word.
      if (initials && initials.length >= 2) {
        const initRe = new RegExp(`\\b${initials}\\b`);
        if (initRe.test(summary)) score = Math.max(score, 3);
      }

      // Full "firstname surname" present (in either order — handles
      // "Katie Ellison" and "Ellison Katie"). Use word boundaries.
      if (fLow && sLow) {
        if (summaryLower.includes(`${fLow} ${sLow}`) || summaryLower.includes(`${sLow} ${fLow}`)) {
          score = Math.max(score, 3);
        } else if (summaryWords.has(fLow) && summaryWords.has(sLow)) {
          // Both names present as words, not contiguous → still strong
          score = Math.max(score, 3);
        }
      }

      // First name + surname both present, even if not as whole words
      // (more permissive fallback)
      const fInSummary = fLow && fLow.length >= 3 && summaryWords.has(fLow);
      const sInSummary = sLow && sLow.length >= 3 && summaryWords.has(sLow);
      if (fInSummary && sInSummary) {
        score = Math.max(score, 3);
      }
      // Surname only — score 1. Requires word-boundary match AND ≥5 chars
      // (was 4 before; 4-char surnames are too common to be safe).
      // We collect these but ultimately reject if there's another candidate
      // with a stronger match.
      else if (sLow && sLow.length >= 5 && summaryWords.has(sLow)) {
        score = Math.max(score, 1);
      }
      // First name only — never accepted alone. Too many people share
      // first names, especially in a GP practice.

      if (score > 0) {
        candidates.push({ ...r, score });
      }
    }

    if (candidates.length === 0) continue;
    candidates.sort((a, b) => b.score - a.score);
    const topScore = candidates[0].score;
    const top = candidates.filter(c => c.score === topScore);

    // Ambiguity guard: if two clinicians tie at the top score, refuse.
    // It's safer to miss an absence than to put it on the wrong person.
    if (top.length > 1) {
      // Could surface this to the caller in future for a "review needed" list
      continue;
    }

    const matched = top[0];

    // Extract absence reason: strip name parts from summary, use remainder
    let reason = summary;
    [matched.firstName, matched.surname, matched.fullName, matched.initials].filter(Boolean).forEach(part => {
      if (part.length >= 2) {
        reason = reason.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
      }
    });
    reason = reason.replace(/\b(dr|mr|mrs|ms|miss|prof)\.?\b/gi, '');
    reason = reason.replace(/[,\-–—:;]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (reason.length > 0) {
      reason = reason.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
    } else {
      reason = 'Leave';
    }

    absences.push({
      clinicianId: matched.id,
      startDate: event.startDate,
      endDate: event.endDate,
      reason,
      source: 'teamnet',
    });
  }

  // Deduplicate (same clinician + date range)
  const uniqueAbsences = [];
  const seen = new Set();
  for (const absence of absences) {
    const key = `${absence.clinicianId}-${absence.startDate}-${absence.endDate}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueAbsences.push(absence);
    }
  }
  return uniqueAbsences;
}


// Extract first/surname/fullName from a clinician record's stored name.
// Handles both formats:
//   "Katie Ellison"     → firstName=katie, surname=ellison
//   "Ellison, Katie"    → firstName=katie, surname=ellison  (CSV/EMIS shape)
//   "Dr. Katie Ellison" → firstName=katie, surname=ellison  (title stripped)
function extractNames(fullName) {
  let cleaned = (fullName || '').replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss|Prof\.?)\s*/i, '').trim();
  // "Surname, Firstname" → "Firstname Surname". Stripping any trailing
  // role parenthesis first ("Smith, John (Salaried GP)").
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map(s => s.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      cleaned = `${parts[1]} ${parts[0]}`;
    }
  }
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return {
    firstName: (tokens[0] || '').toLowerCase(),
    surname: (tokens[tokens.length - 1] || '').toLowerCase(),
    fullName: cleaned,
  };
}

function parseICS(icsText) {
  const events = [];
  const lines = icsText.split(/\r?\n/);
  let currentEvent = null;
  let currentKey = '';
  let currentValue = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.startsWith(' ') || line.startsWith('\t')) {
      currentValue += line.substring(1);
      continue;
    }
    if (currentKey && currentEvent) processKeyValue(currentEvent, currentKey, currentValue);
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) { currentKey = ''; currentValue = ''; continue; }
    const key = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);
    if (key === 'BEGIN' && value === 'VEVENT') currentEvent = {};
    else if (key === 'END' && value === 'VEVENT') {
      if (currentEvent && currentEvent.startDate && currentEvent.endDate) events.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent) {
      currentKey = key; currentValue = value;
    } else {
      currentKey = ''; currentValue = '';
    }
  }
  return events;
}

function processKeyValue(event, key, value) {
  const keyParts = key.split(';');
  const mainKey = keyParts[0];
  if (mainKey === 'SUMMARY') {
    event.summary = value;
  } else if (mainKey === 'DTSTART') {
    event.startDate = parseICSDate(value);
  } else if (mainKey === 'DTEND') {
    const isDateOnly = key.includes('VALUE=DATE');
    let endDate = parseICSDate(value);
    if (isDateOnly && endDate) {
      const d = new Date(endDate + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    event.endDate = endDate;
  }
}

function parseICSDate(value) {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9]/g, '').substring(0, 8);
  if (cleaned.length < 8) return null;
  const year = cleaned.substring(0, 4);
  const month = cleaned.substring(4, 6);
  const day = cleaned.substring(6, 8);
  return `${year}-${month}-${day}`;
}
