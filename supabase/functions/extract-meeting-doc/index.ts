// Extracts structured meeting data from an uploaded .docx/.pdf using Claude.
// Heavy parsing libs are imported LAZILY inside the handler, AFTER the
// OPTIONS/CORS preflight is answered — a failed top-level import crashes the
// function at cold start (503 on every request incl. the preflight).
// Secret required: ANTHROPIC_API_KEY. Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

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

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const { default: JSZip } = await import('npm:jszip@3.10.1');
  const zip = await JSZip.loadAsync(bytes);
  const docFile = zip.file('word/document.xml');
  if (!docFile) return '';
  const xml = await docFile.async('string');
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('npm:unpdf@0.11.0');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (text || '').replace(/\n{3,}/g, '\n\n').trim();
}

const EXTRACTION_PROMPT = `You are extracting structured data from a UK GP practice meeting document (an agenda or minutes). Read the text and return ONLY a JSON object, no preamble, no markdown fences, with this exact shape:

{
  "meeting_date": "YYYY-MM-DD or null if not found",
  "meeting_type": "one of: partners, practice, clinical_governance, plt, other",
  "title": "a short title for the meeting, or null",
  "confidence": "high | medium | low",
  "agenda_items": [
    { "title": "item heading", "minute_note": "discussion/notes or null", "outcome": "one of: decision, noted, deferred, action, or null" }
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

async function structureWithClaude(text: string): Promise<unknown> {
  const clipped = text.length > 24000 ? text.slice(0, 24000) : text;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY as string,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: `${EXTRACTION_PROMPT}\n\n--- DOCUMENT TEXT ---\n${clipped}` }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI extraction failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const textOut = (data.content || [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim();
  const clean = textOut.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(clean);
}

Deno.serve(async (req) => {
 try {
  // Answer the CORS preflight FIRST, zero dependencies.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'Document AI is not configured. An administrator needs to add the ANTHROPIC_API_KEY secret.' }, 503);
  }

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

  try {
    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: lead, error: leadErr } = await supabase.rpc('is_practice_leadership', { target_practice_id: practiceId });
    if (leadErr) return json({ error: 'Access check failed: ' + leadErr.message }, 500);
    if (lead !== true) return json({ error: 'Meetings are restricted to the leadership team' }, 403);
  } catch (e) {
    return json({ error: 'Auth check error: ' + (e as Error).message }, 500);
  }

  let rawText = '';
  try {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.docx')) rawText = await extractDocxText(fileBytes);
    else if (lower.endsWith('.pdf')) rawText = await extractPdfText(fileBytes);
    else return json({ error: 'Only .docx and .pdf files are supported' }, 415);
  } catch (e) {
    return json({ error: `Could not read the document text: ${(e as Error).message}`, filename }, 422);
  }
  if (!rawText || rawText.length < 20) {
    return json({ error: 'No readable text found (the document may be a scanned image).', filename }, 422);
  }

  try {
    const structured = await structureWithClaude(rawText);
    return json({ ok: true, filename, structured });
  } catch (e) {
    return json({ error: (e as Error).message, filename }, 502);
  }
 } catch (outer) {
   // Guarantee a JSON body for ANY unexpected failure (e.g. a lazy npm import
   // failing on cold start) so the client never sees an empty response.
   return json({ error: 'Server error: ' + ((outer as Error)?.message || String(outer)) }, 500);
 }
});
