// ═══════════════════════════════════════════════════════════════════════════
// lib/api-helpers.js — input validation + safe error responses
// ═══════════════════════════════════════════════════════════════════════════
//
// Two concerns rolled into one module because they show up at the same
// point in every API handler (request → validate input → catch errors →
// respond):
//
//   1. Input validation. Most of our routes take `practiceId` or
//      `practice` UUIDs and pass them straight to Supabase. Supabase
//      rejects malformed UUIDs with a Postgres error like
//      'invalid input syntax for type uuid: "abc"' — which leaks
//      schema-level info and produces ugly 500-shaped responses for
//      what's really a client-side bug. Better: validate format
//      up-front, return a clean 400.
//
//   2. Safe error responses. When something genuinely unexpected goes
//      wrong (a try/catch hit), the natural thing to do is echo
//      `err.message` back to the client. That message frequently
//      contains internal-implementation detail. Better: generate a
//      request ID, log the full error against it server-side, return
//      "Something went wrong" + the ID so a user reporting an issue
//      can quote it back to us and we look up the real error in logs.

import { NextResponse } from 'next/server';

// ─── Shape validators ──────────────────────────────────────────────────

// Simple UUID v4 / v5 / general v1-v5 check. Doesn't care about the
// version digit — just that the structure is correct. Anything else
// is a client bug we can reject up-front rather than letting Postgres
// produce a 500-shaped error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Email shape check. The definition lives in lib/parse-emails.js, which
// has no next/server dependency, so client components can share it; this
// re-export keeps every existing server-side import working.
export { isEmail } from './parse-emails';

// Convenience: validate a UUID and return a 400 Response if invalid.
// Lets handlers write:
//   const bad = requireUuid(practiceId, 'practiceId');
//   if (bad) return bad;
// rather than repeating the same if-block everywhere.
export function requireUuid(value, fieldName) {
  if (!value) {
    return NextResponse.json(
      { error: `${fieldName} is required` },
      { status: 400 }
    );
  }
  if (!isUuid(value)) {
    return NextResponse.json(
      { error: `${fieldName} must be a valid UUID` },
      { status: 400 }
    );
  }
  return null;
}

// ─── Safe error response ───────────────────────────────────────────────

// Short, URL-safe request ID generator. Doesn't need to be cryptographic
// — just unique enough that a user reporting a bug can quote it and we
// can grep the log. 9 chars of base36 timestamp + 6 chars of random gives
// us ~50 bits of uniqueness, plenty for log correlation.
function makeRequestId() {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `${t}${r}`;
}

// Server-side log of the full error + return a sanitized response with
// a request ID the user can quote. Use this in catch-all blocks for
// unexpected errors:
//
//   try {
//     ...
//   } catch (e) {
//     return serverError('Could not import data', e, { context: { practiceId } });
//   }
//
// The full error (including stack) goes to console.error tagged with the
// request ID. The client only sees the safe message + ID.
export function serverError(safeMessage, err, options = {}) {
  const requestId = makeRequestId();
  const context = options.context || {};
  // Structured console.error so Vercel's log search can find it by ID.
  // Don't JSON.stringify the error object — its prototype chain
  // (Error.toString) doesn't serialise; explicitly grab message + stack.
  console.error(`[server-error] ${requestId}`, {
    safeMessage,
    error: {
      name: err?.name || 'Error',
      message: err?.message || String(err),
      stack: err?.stack,
    },
    context,
  });
  return NextResponse.json(
    {
      error: safeMessage,
      requestId,
    },
    { status: options.status || 500 }
  );
}
