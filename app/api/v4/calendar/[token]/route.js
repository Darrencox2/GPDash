// /api/v4/calendar/[token]
//
// Personal ICS calendar feed for one clinician, secured by their
// unguessable calendar_token (calendar apps cannot authenticate, so the
// token IS the credential - same model as the public buddy board).
//
// Each working session becomes one calendar event with the SITE in the
// title and real start/end times (so the duration is visible), derived
// from the clinician's EMIS appointment rows: rows are sorted by time and
// split into session blocks wherever there is a gap of 2+ hours; each
// block runs from its first appointment to its last (plus one slot), and
// the block's site is its most common EMIS location.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { checkRateLimit, getRateLimitIp } from '@/lib/rate-limit';
import { getSlotRowsForClinicianDate, parseHuddleDateStr } from '@/lib/huddle';
import { matchesStaffMember } from '@/lib/data';
import { buildBlocks, icsStamp, esc } from '@/lib/calendar-feed';

export const dynamic = 'force-dynamic';

const RATE_LIMIT = { prefix: 'rl:calendar-feed', limit: 60, window: '60 s' };

export async function GET(request, ctx) {
  try {
    const params = await ctx.params;
    const token = params?.token;
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
      return new NextResponse('Not found', { status: 404 });
    }

    const ip = getRateLimitIp(request);
    const rl = await checkRateLimit(RATE_LIMIT, `ip:${ip}`);
    if (rl && !rl.allowed) {
      return new NextResponse('Too many requests', {
        status: 429,
        headers: { ...rl.headers, 'Retry-After': String(rl.retryAfterSeconds ?? 60) },
      });
    }

    const admin = createAdminClient();
    const { data: clinician } = await admin
      .from('clinicians')
      .select('id, name, initials, practice_id')
      .eq('calendar_token', token)
      .maybeSingle();
    if (!clinician) return new NextResponse('Not found', { status: 404 });

    const { data: csvRow } = await admin
      .from('huddle_csv_data')
      .select('data')
      .eq('practice_id', clinician.practice_id)
      .maybeSingle();
    const blob = csvRow?.data;

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GPDash//Clinician Sessions//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(`GPDash - ${clinician.name}`)}`,
      'X-PUBLISHED-TTL:PT6H',
      'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    ];

    if (blob?.dates?.length) {
      const csvName = (blob.clinicians || []).find((n) => matchesStaffMember(n, clinician));
      if (csvName) {
        // Past 14 days + everything forward that the blob holds.
        const from = Date.now() - 14 * 86400000;
        for (const ds of blob.dates) {
          const d = parseHuddleDateStr(ds);
          if (!d || isNaN(d) || d.getTime() < from) continue;
          const rows = getSlotRowsForClinicianDate(blob, ds, csvName) || [];
          if (!rows.length) continue;
          for (const b of buildBlocks(rows)) {
            const start = new Date(d);
            start.setHours(Math.floor(b.startMins / 60), b.startMins % 60, 0, 0);
            const end = new Date(d);
            end.setHours(Math.floor(b.endMins / 60), b.endMins % 60, 0, 0);
            const summary = b.site ? `${b.session} session - ${b.site}` : `${b.session} session`;
            lines.push(
              'BEGIN:VEVENT',
              `UID:${clinician.id}-${ds}-${b.startMins}@gpdash.net`,
              `DTSTAMP:${icsStamp(new Date())}`,
              `DTSTART:${icsStamp(start)}`,
              `DTEND:${icsStamp(end)}`,
              `SUMMARY:${esc(summary)}`,
              ...(b.site ? [`LOCATION:${esc(b.site)}`] : []),
              `DESCRIPTION:${esc(`${b.total} appointment slots\n${b.slotSummary}\n\nFrom GPDash - updates as EMIS data is uploaded`)}`,
              'END:VEVENT'
            );
          }
        }
      }
    }

    lines.push('END:VCALENDAR');
    return new NextResponse(lines.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="gpdash-sessions.ics"',
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
      },
    });
  } catch (e) {
    console.error('[calendar-feed]', e?.message);
    return new NextResponse('Server error', { status: 500 });
  }
}
