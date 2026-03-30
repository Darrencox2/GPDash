import { NextResponse } from 'next/server';

export async function POST(request) {
  // Check password
  const password = request.headers.get('x-password');
  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { url, icsContent, clinicians } = await request.json();
    
    let icsText;
    
    if (icsContent) {
      // Direct ICS content provided (file upload)
      icsText = icsContent;
    } else if (url) {
      // Fetch from URL
      const response = await fetch(url);
      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
      }
      icsText = await response.text();
    } else {
      return NextResponse.json({ error: 'No ICS content or URL provided' }, { status: 400 });
    }
    
    // Parse ICS events
    const events = parseICS(icsText);
    
    // Match events to clinicians
    const absences = [];
    const clinicianNames = clinicians.map(c => ({
      id: c.id,
      initials: c.initials || '',
      ...extractNames(c.name)
    }));
    
    for (const event of events) {
      const summary = event.summary || '';
      const summaryLower = summary.toLowerCase();
      
      // Try to match clinician - MUST match surname OR initials
      for (const { id, initials, firstName, surname, fullName } of clinicianNames) {
        let matched = false;
        
        // Check if initials match (case-insensitive, but initials are typically uppercase)
        if (initials && initials.length >= 2) {
          // Look for initials as a standalone word or at start
          const initialsRegex = new RegExp(`\\b${initials}\\b`, 'i');
          if (initialsRegex.test(summary)) {
            matched = true;
          }
        }
        
        // Check surname match
        if (!matched && summaryLower.includes(surname.toLowerCase())) {
          // Check if first name also matches (for extra confidence) or if surname is unique enough
          const firstNameMatches = summaryLower.includes(firstName.toLowerCase());
          const fullNameMatches = summaryLower.includes(fullName.toLowerCase());
          
          // Accept if: full name matches, OR surname + first name both match, OR just surname (if it's 4+ chars)
          if (fullNameMatches || firstNameMatches || surname.length >= 4) {
            matched = true;
          }
        }
        
        if (matched) {
          // Extract absence reason: strip clinician name parts from summary, use remainder
          let reason = summary;
          // Remove known name parts (case-insensitive)
          [firstName, surname, fullName, initials].filter(Boolean).forEach(part => {
            if (part.length >= 2) {
              reason = reason.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
            }
          });
          // Remove common prefixes/titles
          reason = reason.replace(/\b(dr|mr|mrs|ms|miss|prof)\.?\b/gi, '');
          // Clean up: trim, collapse whitespace, remove leading/trailing punctuation
          reason = reason.replace(/[,\-–—:;]+/g, ' ').replace(/\s+/g, ' ').trim();
          // Title case
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
    
    // Remove duplicates (same clinician, same dates)
    const uniqueAbsences = [];
    const seen = new Set();
    for (const absence of absences) {
      const key = `${absence.clinicianId}-${absence.startDate}-${absence.endDate}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAbsences.push(absence);
      }
    }
    
    return NextResponse.json({ absences: uniqueAbsences });
    
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

function extractNames(fullName) {
  // Extract searchable name parts from "Dr. Ruth Colson" -> { firstName: "ruth", surname: "colson", fullName: "ruth colson" }
  const cleaned = fullName.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss)\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  
  return {
    firstName: parts[0] || '',
    surname: parts[parts.length - 1] || '',  // Last part is surname
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
    
    // Handle line continuations (lines starting with space or tab)
    if (line.startsWith(' ') || line.startsWith('\t')) {
      currentValue += line.substring(1);
      continue;
    }
    
    // Process previous key-value if we have one
    if (currentKey && currentEvent) {
      processKeyValue(currentEvent, currentKey, currentValue);
    }
    
    // Parse new line
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      currentKey = '';
      currentValue = '';
      continue;
    }
    
    const key = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);
    
    if (key === 'BEGIN' && value === 'VEVENT') {
      currentEvent = {};
    } else if (key === 'END' && value === 'VEVENT') {
      if (currentEvent && currentEvent.startDate && currentEvent.endDate) {
        events.push(currentEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      currentKey = key;
      currentValue = value;
    } else {
      currentKey = '';
      currentValue = '';
    }
  }
  
  return events;
}

function processKeyValue(event, key, value) {
  // Handle keys with parameters like DTSTART;VALUE=DATE:20260108
  const keyParts = key.split(';');
  const mainKey = keyParts[0];
  
  if (mainKey === 'SUMMARY') {
    event.summary = value;
  } else if (mainKey === 'DTSTART') {
    event.startDate = parseICSDate(value);
  } else if (mainKey === 'DTEND') {
    // For end dates, subtract one day if it's a DATE value (all-day event)
    // because ICS uses exclusive end dates
    const isDateOnly = key.includes('VALUE=DATE');
    let endDate = parseICSDate(value);
    if (isDateOnly && endDate) {
      // Subtract one day for exclusive end date
      const d = new Date(endDate + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    event.endDate = endDate;
  }
}

function parseICSDate(value) {
  // Parse formats like 20260108 or 20260108T000000
  if (!value) return null;
  const cleaned = value.replace(/[^0-9]/g, '').substring(0, 8);
  if (cleaned.length < 8) return null;
  
  const year = cleaned.substring(0, 4);
  const month = cleaned.substring(4, 6);
  const day = cleaned.substring(6, 8);
  
  return `${year}-${month}-${day}`;
}
