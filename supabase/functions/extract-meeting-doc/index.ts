// supabase/functions/extract-meeting-doc/index.ts
//
// Receives an uploaded meeting document (.docx or .pdf), extracts its text,
// and uses Claude to return STRUCTURED meeting data: date, type, agenda items
// (with discussion/outcome) and actions. The Next.js client then shows this
// to the user for confirmation before anything is written to the database —
// nothing is auto-filed.
//
// Security: confidential leadership documents. The function verifies the
// caller's JWT and that they are leadership (owner/partner/practice_manager)
// of the practice via is_practice_leadership(). It does NOT write to the DB —
// it only reads the file and returns structured JSON. Filing happens
// client-side under the user's own RLS-scoped session after they confirm.
//
// Required secret (Supabase dashboard -> Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY   key from console.anthropic.com (pay-per-use)
// Auto-injected:
//   SUPABASE_URL, SUPABASE_ANON_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { unzip } from 'https://deno.land/x/zipjs@v2.7.32/index.js';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.11.0';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── Text extraction ────────────────────────────────────────────────────────

// .docx is a zip; the body text lives in word/document.xml. Strip tags,
// turn paragraph/break tags into newlines so structure survives roughly.
async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const { entries } = await unzip(new Blob([bytes]));
  const docEntry = entries.find((e: any) => e.filename === 'word/document.xml');
  if (!docEntry) return '';
  const xml = await docEntry.getData(new TextDecoder());
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (text || '').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Claude structured extraction ────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are extracting structured data from a UK GP practice meeting document (an agenda or minutes). Read the text and return ONLY a JSON object, no preamble, no markdown fences, with this exact shape:

{
  "meeting_date": "YYYY-MM-DD or null if not found",
  "meeting_type": "one of: partners, practice, clinical_governance, plt, other",
  "title": "a short title for the meeting, or null",
  "confidence": "high | medium | low — how confident you are about the date",
  "agenda_items": [
    { "title": "item heading", "minute_note": "discussion/notes for this item or null", "outcome": "one of: decision, noted, deferred, action, or null" }
  ],
  "actions": [
    { "description": "the action", "assignee_name": "who is responsible or null" }
  ]
}

Rules:
- meeting_date: find the date the meeting took place. UK format is common (DD/MM/YYYY). Convert to YYYY-MM-DD. If genuinely absent, use null and set confidence to low.
- If the document is an agenda with no minutes, leave minute_note and outcome null.
- Extract every distinct agenda item in order. Keep titles concise.
- Only include actions explicitly stated. Do not invent any.
- Return ONLY the JSON object.`;

async function structureWithClaude(text: string): Promise<any> {
  // Cap the text we send (very long minutes) to keep within limits.
  const clipped = text.length > 24000 ? text.slice(0, 24000) : text;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: `${EXTRACTION_PROMPT}\n\n--- DOCUMENT TEXT ---\n${clipped}` },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI extraction failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const textOut = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();
  // Strip any accidental code fences, then parse.
  const clean = textOut.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('AI returned an unparseable response');
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'Document AI is not configured. An administrator needs to add the ANTHROPIC_API_KEY secret.' }, 503);
  }

  // Verify caller + leadership access for the target practice.
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not authenticated' }, 401);

  let practiceId = '';
  let fileBytes: Uint8Array | null = null;
  let filename = '';
  try {
    const form = await req.formData();
    practiceId = String(form.get('practice_id') || '');
    const file = form.get('file');
    if (file && file instanceof File) {
      filename = file.name || 'document';
      fileBytes = new Uint8Array(await file.arrayBuffer());
    }
  } catch {
    return json({ error: 'Could not read the upload' }, 400);
  }
  if (!practiceId || !fileBytes) return json({ error: 'Missing practice_id or file' }, 400);

  // Auth: create a client AS the caller (their JWT) and check leadership.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: lead, error: leadErr } = await supabase.rpc('is_practice_leadership', { target_practice_id: practiceId });
  if (leadErr) return json({ error: 'Access check failed' }, 500);
  if (lead !== true) return json({ error: 'Meetings are restricted to the leadership team' }, 403);

  // Extract text by type.
  let rawText = '';
  try {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.docx')) rawText = await extractDocxText(fileBytes);
    else if (lower.endsWith('.pdf')) rawText = await extractPdfText(fileBytes);
    else return json({ error: 'Only .docx and .pdf files are supported' }, 415);
  } catch (e) {
    return json({ error: `Could not read the document text: ${(e as Error).message}` }, 422);
  }
  if (!rawText || rawText.length < 20) {
    return json({ error: 'No readable text found (the document may be a scanned image).', filename }, 422);
  }

  // Structure with Claude.
  try {
    const structured = await structureWithClaude(rawText);
    return json({ ok: true, filename, structured });
  } catch (e) {
    return json({ error: (e as Error).message, filename }, 502);
  }
});
