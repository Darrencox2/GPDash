// lib/demand-parsers/anima.js
//
// Parser for the Anima audit-export CSV ("ExportedAuditResults_*.csv").
//
// Format: standard RFC 4180 CSV, UTF-8, header row, ~11 columns:
//   Timestamp, User, Patient, ActionID, ActionDescription, RequestType,
//   RequestDate, RequestTime, Success, ErrorInfo, AdditionalInfo
//
// AdditionalInfo is a JSON blob (with the double-quote-escaping that
// RFC 4180 prescribes for embedded quotes — "" inside a quoted field).
// Each event_type=patient-review event_subtype=review_submit row
// represents one online consultation request, regardless of whether
// the submitter is the patient themselves or staff acting as a proxy
// (phone in → receptionist types it up). Both are real demand signals,
// so we count both.
//
// We aggregate by event_properties.review_date (the calendar date the
// review was submitted, in UTC). For UK practices, BST/UTC slippage at
// the day boundary is negligible for demand-modelling purposes — a
// handful of submissions on the wrong side of midnight doesn't move
// the per-day count meaningfully.
//
// Returns:
//   { rows: [{ date, count, proxyCount }], errors: [], summary }
//
// `proxyCount` is informational — the upsert path drops it on the
// floor, but the upload UI can use it to show "of N total, M were
// proxy submissions" so users see what's going on.

/**
 * Detect whether the given text looks like an Anima audit CSV.
 * Used by the dispatcher in lib/demand-parsers/index.js.
 *
 * Heuristic: first non-empty line is a comma-separated header
 * starting with "Timestamp,User,Patient,ActionID" (the column
 * names are stable across Anima exports — only the row count
 * varies).
 */
export function looksLikeAnima(rawText) {
  if (!rawText) return false;
  // Strip BOM and find first line
  let text = rawText;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  return /^Timestamp\s*,\s*User\s*,\s*Patient\s*,\s*ActionID/i.test(firstLine);
}

/**
 * Parse the Anima audit CSV from raw text.
 * Caller is responsible for decoding the file (UTF-8 is the format).
 */
export function parseAnimaCSV(rawText) {
  const errors = [];

  // Strip BOM if present
  let text = rawText;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // Parse CSV with proper quote handling (the AdditionalInfo field has
  // embedded commas + escaped quotes). Built-in: standard RFC 4180.
  const parsed = parseCSV(text);
  if (parsed.length < 2) {
    return { rows: [], errors: ['File has no data rows — empty audit export?'], summary: null };
  }

  const header = parsed[0].map(h => h.trim());
  const idxActionID = header.findIndex(h => h.toLowerCase() === 'actionid');
  const idxAdditional = header.findIndex(h => h.toLowerCase() === 'additionalinfo');
  if (idxActionID < 0 || idxAdditional < 0) {
    return { rows: [], errors: ['CSV header missing ActionID or AdditionalInfo column — does not look like an Anima audit export'], summary: null };
  }

  // Aggregate by date
  const totalByDate = new Map(); // date → { count, proxyCount }
  let skippedNonReview = 0;
  let skippedNoDate = 0;
  let skippedBadJson = 0;

  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    if (!row || row.length < header.length) continue;

    const action = (row[idxActionID] || '').trim();
    if (action !== 'patientReviewSubmit') {
      // Anima audit exports might include other actions; we only want
      // the review-submit events. Anything else is logged but skipped.
      skippedNonReview++;
      continue;
    }

    const additional = row[idxAdditional];
    if (!additional) { skippedNoDate++; continue; }

    let info;
    try {
      info = JSON.parse(additional);
    } catch (e) {
      skippedBadJson++;
      // Don't surface every malformed row — they're rare. One summary
      // error at the end is enough.
      continue;
    }

    const eventProps = info?.event_properties || {};
    const reviewDate = eventProps.review_date; // YYYY-MM-DD string

    // Filter to actual review_submit events. The action is
    // patientReviewSubmit but event_subtype confirms it's a real
    // submission vs some other patient-review action (saves,
    // resumes, abandons).
    if (eventProps.event_subtype !== 'review_submit') {
      skippedNonReview++;
      continue;
    }

    if (!reviewDate || !/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
      skippedNoDate++;
      continue;
    }

    const userRole = info?.user_properties?.role || 'unknown';
    const isProxy = userRole !== 'patient' || !!eventProps.proxy_request;

    let bucket = totalByDate.get(reviewDate);
    if (!bucket) {
      bucket = { count: 0, proxyCount: 0 };
      totalByDate.set(reviewDate, bucket);
    }
    bucket.count++;
    if (isProxy) bucket.proxyCount++;
  }

  if (skippedBadJson > 0) {
    errors.push(`${skippedBadJson} row(s) had malformed JSON in AdditionalInfo and were skipped`);
  }

  // Build sorted, deduped row list
  const rows = Array.from(totalByDate.entries())
    .map(([date, { count, proxyCount }]) => ({ date, count, proxyCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length === 0) {
    return {
      rows: [],
      errors: [...errors, 'No patientReviewSubmit events with a review_date were found in this file'],
      summary: null,
    };
  }

  const totalEvents = rows.reduce((sum, r) => sum + r.count, 0);
  const totalProxy = rows.reduce((sum, r) => sum + r.proxyCount, 0);

  return {
    rows,
    errors,
    summary: {
      count: rows.length,
      earliest: rows[0].date,
      latest: rows[rows.length - 1].date,
      totalEvents,
      proxyEvents: totalProxy,
      directEvents: totalEvents - totalProxy,
    },
  };
}

/**
 * Anima exports are UTF-8 with embedded JSON. Simple file read.
 * Kept as a separate helper so the upload UI can pick the right
 * decoder based on file format (AskMyGP uses UTF-16).
 */
export async function readAnimaFile(file) {
  const buffer = await file.arrayBuffer();
  return new TextDecoder('utf-8').decode(buffer);
}

/* ─── RFC 4180 CSV parser ────────────────────────────────────────────────
   The audit export's AdditionalInfo field contains JSON with commas and
   embedded quotes (escaped as "" inside the quoted field). The native
   split-on-comma approach would shred those rows; we need real CSV
   parsing. Implemented inline rather than depending on Papa Parse to
   keep the bundle lean. Handles:
     - quoted fields with embedded commas, newlines, and ""
     - bare fields
     - CRLF or LF line endings
*/
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote inside quoted field
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      // Treat CR or CRLF as end-of-row
      if (text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Final field/row if file doesn't end with newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
