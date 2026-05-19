// lib/demand-parsers/index.js
//
// Dispatcher for demand-history file uploads. Detects which online
// consultation tool an uploaded CSV came from and routes to the
// appropriate parser. Adding a new tool means: write a parser, give it
// a `looksLike` detector, register it here. Everything downstream
// (DemandUpload UI, demand_history upsert, recalibration) stays
// untouched.
//
// Currently supported:
//   - AskMyGP "Crosstab — Demand data" (UTF-16 LE, tab-separated)
//   - Anima "ExportedAuditResults" (UTF-8, RFC 4180 CSV with JSON payload)
//
// Future: eConsult, Klinik, accuRx, etc. — each gets its own file in
// this directory plus an entry in the SOURCES array below.

import { parseAskMyGpCSV, readAskMyGpFile } from './askmygp';
import { parseAnimaCSV, readAnimaFile, looksLikeAnima } from './anima';

// Order matters: we try detectors top-to-bottom. Put the more
// distinctive formats first so we don't false-positive on a
// permissive detector.
const SOURCES = [
  {
    id: 'anima',
    label: 'Anima',
    fileHint: 'ExportedAuditResults_*.csv',
    detect: looksLikeAnima,
    read: readAnimaFile,
    parse: parseAnimaCSV,
  },
  {
    id: 'askmygp',
    label: 'AskMyGP',
    fileHint: 'Crosstab — Demand data (UTF-16)',
    detect: () => true, // fallback: assume AskMyGP if nothing else matched
    read: readAskMyGpFile,
    parse: parseAskMyGpCSV,
  },
];

/**
 * Public list of supported sources for the upload UI to render help
 * text or "we support these tools" prompts.
 */
export const SUPPORTED_SOURCES = SOURCES.map(({ id, label, fileHint }) => ({ id, label, fileHint }));

/**
 * Pick the parser for an uploaded file. The two parsers use different
 * decoders (AskMyGP is UTF-16, Anima is UTF-8) so we read TWICE:
 * once as UTF-8 to detect, then again with the source's own reader
 * to get correct text. The double-read is fine — these files are
 * small (a few hundred KB at most).
 *
 * Returns: { source: 'anima'|'askmygp'|null, parsed: {rows, errors, summary} }
 */
export async function parseDemandFile(file) {
  // Quick first read to sniff the format. UTF-8 decode works for any
  // ASCII-compatible content; UTF-16 files just look like garbled
  // bytes which won't trigger the Anima detector, so we'll fall
  // through to AskMyGP.
  const buf = await file.arrayBuffer();
  const sniffText = new TextDecoder('utf-8', { fatal: false }).decode(buf);

  for (const source of SOURCES) {
    if (source.detect(sniffText)) {
      // Use the source's own reader for proper decoding
      const text = await source.read(file);
      const parsed = source.parse(text);
      return { source: source.id, sourceLabel: source.label, parsed };
    }
  }

  return {
    source: null,
    sourceLabel: null,
    parsed: { rows: [], errors: ['File format not recognised — supported: ' + SOURCES.map(s => s.label).join(', ')], summary: null },
  };
}
