// Shared TeamNet calendar (ICS) parsing — used by both the v3 password-gated
// /api/sync-teamnet endpoint and the v4 Supabase-authed /api/v4/sync-teamnet
// endpoint. Pure functions, no auth, no NextResponse — caller handles those.

export function parseTeamnetCalendar(icsText, clinicians) {
  const events = parseICS(icsText);

  const absences = [];
  const clinicianNames = (clinicians || []).map(c => ({
    id: c.id,
    initials: c.initials || '',
    ...extractNames(c.name)
  }));

  for (const event of events) {
    const summary = event.summary || '';
    const summaryLower = summary.toLowerCase();

    for (const { id, initials, firstName, surname, fullName } of clinicianNames) {
      let matched = false;

      if (initials && initials.length >= 2) {
        const initialsRegex = new RegExp(`\\b${initials}\\b`, 'i');
        if (initialsRegex.test(summary)) matched = true;
      }

      if (!matched && summaryLower.includes(surname.toLowerCase())) {
        const firstNameMatches = summaryLower.includes(firstName.toLowerCase());
        const fullNameMatches = summaryLower.includes(fullName.toLowerCase());
        if (fullNameMatches || firstNameMatches || surname.length >= 4) {
          matched = true;
        }
      }

      if (matched) {
        let reason = summary;
        [firstName, surname, fullName, initials].filter(Boolean).forEach(part => {
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
          clinicianId: id,
          startDate: event.startDate,
          endDate: event.endDate,
          reason,
          source: 'teamnet'
        });
        break;
      }
    }
  }

  // Deduplicate
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


function extractNames(fullName) {
  const cleaned = (fullName || '').replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss)\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  return {
    firstName: parts[0] || '',
    surname: parts[parts.length - 1] || '',
    fullName: cleaned
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
