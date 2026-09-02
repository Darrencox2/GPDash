// Unit tests for lib/report-schedules.js and lib/report-email.js — the
// cadence maths and email rendering behind scheduled report emails.
//
// The BST cases are the point of this file. A schedule stores a London
// wall clock and a resolved UTC instant, and getting that wrong sends the
// Monday morning report at 09:00 for half the year without anyone
// noticing until someone complains about the wrong half.
import { test, expect } from '@playwright/test';
import {
  nextSendAt, nextSends, describeReportSchedule, londonToUtc,
  normaliseLayout, DEFAULT_LAYOUT, MINUTE_OPTIONS,
  activeRecipients, unsubscribeUrls,
} from '../../lib/report-schedules.js';
import { renderUnsubscribeNotice } from '../../lib/report-email.js';
import { renderReportEmail } from '../../lib/report-email.js';
import { buildReportRows, reportRowsToCsv, reportInsight } from '../../lib/workload-report.js';

const iso = (d) => (d ? d.toISOString() : null);

test.describe('London wall clock to UTC', () => {
  test('GMT: 08:00 London is 08:00 UTC', () => {
    expect(iso(londonToUtc(2026, 12, 7, 8, 0))).toBe('2026-12-07T08:00:00.000Z');
  });
  test('BST: 08:00 London is 07:00 UTC', () => {
    expect(iso(londonToUtc(2026, 7, 6, 8, 0))).toBe('2026-07-06T07:00:00.000Z');
  });
  test('the hour that does not exist resolves to the instant clocks jump to', () => {
    // 28 Mar 2027, 01:00 GMT -> 02:00 BST. 01:30 never happens.
    expect(iso(londonToUtc(2027, 3, 28, 1, 30))).toBe('2027-03-28T01:30:00.000Z');
  });
  test('the hour that happens twice resolves to the GMT one', () => {
    // 25 Oct 2026, 02:00 BST -> 01:00 GMT. 01:30 happens twice.
    expect(iso(londonToUtc(2026, 10, 25, 1, 30))).toBe('2026-10-25T01:30:00.000Z');
  });
});

test.describe('nextSendAt', () => {
  const weekly = { cadence: 'weekly', day_of_week: 1, send_hour: 8, send_minute: 0 };

  test('finds the next matching weekday', () => {
    // Wed 3 Sep 2026 -> Mon 7 Sep.
    expect(iso(nextSendAt(weekly, new Date('2026-09-03T10:00:00Z')))).toBe('2026-09-07T07:00:00.000Z');
  });
  test('is strictly after, so asking at the send instant rolls to next week', () => {
    const at = londonToUtc(2026, 9, 7, 8, 0);
    expect(iso(nextSendAt(weekly, at))).toBe('2026-09-14T07:00:00.000Z');
  });
  test('holds the wall clock across the BST boundary', () => {
    // Late Oct 2026: the clocks go back on the 25th. Both sends are 08:00
    // in the room, which is two different UTC instants.
    const sends = nextSends(weekly, 3, new Date('2026-10-15T00:00:00Z')).map(iso);
    expect(sends).toEqual([
      '2026-10-19T07:00:00.000Z',   // BST
      '2026-10-26T08:00:00.000Z',   // GMT
      '2026-11-02T08:00:00.000Z',
    ]);
  });
  test('daily runs every day', () => {
    const sends = nextSends({ cadence: 'daily', send_hour: 7, send_minute: 30 }, 3, new Date('2026-09-01T00:00:00Z')).map(iso);
    expect(sends).toEqual([
      '2026-09-01T06:30:00.000Z',
      '2026-09-02T06:30:00.000Z',
      '2026-09-03T06:30:00.000Z',
    ]);
  });
  test('fortnightly keeps parity with its anchor', () => {
    const s = { cadence: 'fortnightly', day_of_week: 1, send_hour: 9, send_minute: 0, anchor_date: '2026-09-07' };
    const sends = nextSends(s, 3, new Date('2026-09-01T00:00:00Z')).map(d => d.toISOString().slice(0, 10));
    expect(sends).toEqual(['2026-09-07', '2026-09-21', '2026-10-05']);
  });
  test('fortnightly skips the off week even when asked mid-cycle', () => {
    const s = { cadence: 'fortnightly', day_of_week: 1, send_hour: 9, send_minute: 0, anchor_date: '2026-09-07' };
    // Tue 8 Sep: the next Monday (14th) is an off week, so 21st.
    expect(iso(nextSendAt(s, new Date('2026-09-08T00:00:00Z'))).slice(0, 10)).toBe('2026-09-21');
  });
  test('monthly on a fixed date', () => {
    const sends = nextSends({ cadence: 'monthly', day_of_month: 28, send_hour: 7, send_minute: 0 }, 3, new Date('2026-01-30T00:00:00Z'))
      .map(d => d.toISOString().slice(0, 10));
    expect(sends).toEqual(['2026-02-28', '2026-03-28', '2026-04-28']);
  });
  test('monthly_nth: second Wednesday', () => {
    const sends = nextSends({ cadence: 'monthly_nth', day_of_week: 3, week_of_month: 2, send_hour: 8, send_minute: 15 }, 3, new Date('2026-09-01T00:00:00Z'))
      .map(d => d.toISOString().slice(0, 10));
    expect(sends).toEqual(['2026-09-09', '2026-10-14', '2026-11-11']);
  });
  test('monthly_nth: week 5 means the LAST one, not a phantom fifth', () => {
    const sends = nextSends({ cadence: 'monthly_nth', day_of_week: 5, week_of_month: 5, send_hour: 16, send_minute: 30 }, 4, new Date('2026-09-01T00:00:00Z'))
      .map(d => d.toISOString().slice(0, 10));
    // Sept 2026 has 4 Fridays, Oct has 5 — both must yield the real last one.
    expect(sends).toEqual(['2026-09-25', '2026-10-30', '2026-11-27', '2026-12-25']);
  });
  test('an unknown cadence yields nothing rather than looping', () => {
    expect(nextSendAt({ cadence: 'hourly' }, new Date())).toBeNull();
    expect(nextSendAt(null, new Date())).toBeNull();
  });
});

test.describe('describeReportSchedule', () => {
  test('says what a person would say', () => {
    expect(describeReportSchedule({ cadence: 'daily', send_hour: 8, send_minute: 0 })).toBe('Every day at 08:00');
    expect(describeReportSchedule({ cadence: 'weekly', day_of_week: 1, send_hour: 8, send_minute: 30 })).toBe('Every Monday at 08:30');
    expect(describeReportSchedule({ cadence: 'fortnightly', day_of_week: 4, send_hour: 17, send_minute: 0 })).toBe('Every other Thursday at 17:00');
    expect(describeReportSchedule({ cadence: 'monthly', day_of_month: 1, send_hour: 9, send_minute: 0 })).toBe('The 1st of each month at 09:00');
    expect(describeReportSchedule({ cadence: 'monthly_nth', day_of_week: 3, week_of_month: 5, send_hour: 7, send_minute: 45 })).toBe('The last Wednesday of each month at 07:45');
  });
});

test.describe('layout', () => {
  test('the chart cannot be switched off', () => {
    expect(normaliseLayout({ chart: false }).chart).toBe(true);
  });
  test('topN is clamped to something drawable', () => {
    expect(normaliseLayout({ topN: 999 }).topN).toBe(40);
    expect(normaliseLayout({ topN: -5 }).topN).toBe(0);
  });
  test('an absent layout falls back to the defaults', () => {
    expect(normaliseLayout(null)).toEqual({ ...DEFAULT_LAYOUT, chart: true });
  });
  test('the dispatcher only wakes on quarter hours, so only those are offered', () => {
    expect(MINUTE_OPTIONS).toEqual([0, 15, 30, 45]);
  });
});

// ─── Email rendering ─────────────────────────────────────────────────────

// A hand-built result in the shape runReport returns, so these tests do
// not need a CSV.
function fakeResult({ isRatio = true, hasSplit = false, groups, series } = {}) {
  const gs = groups || [
    { key: 'a', label: 'Dr A', value: 60, numerator: 60, denominator: 100, cells: {} },
    { key: 'b', label: 'Dr B', value: 30, numerator: 30, denominator: 100, cells: {} },
    { key: 'c', label: 'Dr C', value: 10, numerator: 10, denominator: 100, cells: {} },
  ];
  const vals = gs.map(g => g.value);
  // totalValue is DERIVED from the rows, not hardcoded. It is the pooled
  // ratio the chart draws its reference line at, so a fixture that states it
  // independently of its own rows can assert a baseline the data does not
  // support — which is how a stale 33.3 here once hid a real mismatch.
  const totalNum = gs.reduce((a, g) => a + (g.numerator || 0), 0);
  const totalDenom = gs.reduce((a, g) => a + (g.denominator || 0), 0) || 300;
  return {
    groups: gs,
    series: series || [{ key: '_all', label: '' }],
    hasSplit, isRatio, denomMode: isRatio ? 'group' : 'none',
    totalNum, totalDenom, totalAll: totalDenom,
    totalValue: isRatio ? (totalNum / totalDenom) * 100 : totalNum,
    valueMin: Math.min(...vals), valueMax: Math.max(...vals),
    valueAvg: vals.reduce((a, b) => a + b, 0) / vals.length,
  };
}

// The bar tracks, and only those: the outer page tables also carry
// width="100%" and a background colour, so a looser match finds chrome.
const TRACK_RE = /vertical-align:middle;">\s*<table role="presentation" width="100%"[^>]*table-layout:fixed;"><tr>(.*?)<\/tr><\/table>/gs;
const tracksIn = (html) => [...html.matchAll(TRACK_RE)].map(m => m[1]);
const barsIn = (track) => [...track.matchAll(/width="([\d.]+)%"[^>]*background:#/gi)].map(m => parseFloat(m[1]));

const CONFIG = { grain: 'slots', num: { statuses: ['booked'] }, denomMode: 'group', groupBy: 'clinician', range: 'last8', colourMode: 'multi' };

const render = (over = {}) => renderReportEmail({
  reportName: 'Fill rate', practiceName: 'Test Practice',
  result: fakeResult(), config: CONFIG, layout: {}, siteUrl: 'https://gpdash.net',
  ...over,
});

test.describe('report email', () => {
  test('bar widths are percentages that always total the track', () => {
    const html = render().html;
    const tracks = tracksIn(html);
    expect(tracks).toHaveLength(3);
    for (const t of tracks) {
      const widths = [...t.matchAll(/width="([\d.]+)%"/g)].map(m => parseFloat(m[1]));
      expect(Math.abs(widths.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.05);
    }
  });

  test('a ratio chart is drawn against a 0-100 axis, so a bar reads as its own percentage', () => {
    const [track] = tracksIn(render().html);
    expect(barsIn(track)[0]).toBeCloseTo(60, 1);
  });

  test('a real but tiny value still gets a visible sliver', () => {
    const r = fakeResult({ groups: [
      { key: 'a', label: 'Big', value: 100, numerator: 100, denominator: 100, cells: {} },
      { key: 'b', label: 'Tiny', value: 0.2, numerator: 1, denominator: 500, cells: {} },
    ] });
    const tracks = tracksIn(render({ result: r }).html);
    expect(barsIn(tracks[0])[0]).toBeCloseTo(100, 1);   // the big one fills the axis
    expect(barsIn(tracks[1])[0]).toBeGreaterThanOrEqual(1.5);   // 0.2% still shows
  });

  test('the chart contains no svg or img, because Gmail would drop both', () => {
    const html = render().html;
    const chart = html.split('THE CHART')[1] || '';
    expect(chart).not.toMatch(/<svg/i);
    expect(chart).not.toMatch(/<img/i);
  });

  test('names with markup in them are escaped', () => {
    const r = fakeResult({ groups: [{ key: 'x', label: '<script>alert(1)</script>', value: 10, numerator: 10, denominator: 100, cells: {} }] });
    const { html } = render({ result: r, practiceName: 'A & B' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
  });

  test('an empty report says why instead of showing a blank card', () => {
    const r = fakeResult({ groups: [] });
    const { html } = render({ result: r });
    expect(html).toContain('No data matched this report');
    expect(html).not.toContain('>Overall<');
  });

  test('stale data is called out, fresh data is not', () => {
    const now = new Date('2026-09-10T09:00:00Z');
    expect(render({ dataUpdatedAt: '2026-09-09T09:00:00Z', now }).html).not.toContain('Heads up');
    expect(render({ dataUpdatedAt: '2026-09-01T09:00:00Z', now }).html).toContain('last uploaded 9 days ago');
  });

  test('the CSV keeps every row even when the chart is trimmed', () => {
    const groups = Array.from({ length: 20 }, (_, i) => ({
      key: `k${i}`, label: `Dr ${i}`, value: 100 - i, numerator: 100 - i, denominator: 100, cells: {},
    }));
    const out = render({ result: fakeResult({ groups }), layout: { topN: 5 } });
    const tracks = out.html.match(/vertical-align:middle;">\s*<table role="presentation" width="100%"[^>]*table-layout:fixed;">/g) || [];
    expect(tracks).toHaveLength(5);
    expect(out.csv.split('\n')).toHaveLength(21);           // header + 20
    expect(out.html).toContain('Showing the top 5 of 20');
  });

  test('turning the CSV off produces no attachment', () => {
    expect(render({ layout: { csv: false } }).csv).toBeNull();
  });

  test('the subject falls back to report and practice, and can be overridden', () => {
    expect(render().subject).toBe('Fill rate — Test Practice');
    expect(render({ subject: 'Monday numbers' }).subject).toBe('Monday numbers');
  });

  test('a plain-text alternative is always produced', () => {
    const { text } = render();
    expect(text).toContain('Fill rate — Test Practice');
    expect(text).toContain('Dr A');
    expect(text).toContain('gpdash.net/dashboard?section=reporting');
  });

  test('stacked segments never overflow their track', () => {
    const series = [{ key: 's1', label: 'Urgent' }, { key: 's2', label: 'Routine' }];
    const groups = [
      { key: 'a', label: 'Dr A', value: 0, numerator: 0, denominator: 0, cells: { s1: { value: 30 }, s2: { value: 50 } } },
      { key: 'b', label: 'Dr B', value: 0, numerator: 0, denominator: 0, cells: { s1: { value: 10 }, s2: { value: 0.1 } } },
    ];
    const { html } = render({ result: fakeResult({ hasSplit: true, series, groups, isRatio: false }) });
    const tracks = tracksIn(html);
    for (const t of tracks) {
      const widths = [...t.matchAll(/width="([\d.]+)%"/g)].map(m => parseFloat(m[1]));
      expect(Math.abs(widths.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.05);
    }
    expect(html).toContain('Urgent');
    expect(html).toContain('Routine');
  });
});

test.describe('bundled reports', () => {
  const mk = (name, vals) => ({
    reportName: name,
    config: CONFIG,
    result: fakeResult({ groups: vals.map(([l, v], i) => ({ key: `k${i}`, label: l, value: v, numerator: v, denominator: 100, cells: {} })) }),
  });
  const three = [mk('Fill rate', [['Dr A', 80], ['Dr B', 40]]), mk('Duty share', [['Dr C', 60]]), mk('Slots offered', [['Dr E', 30]])];
  const bundle = (reports, over = {}) => renderReportEmail({
    reports, practiceName: 'Test Practice', layout: {}, siteUrl: 'https://gpdash.net', ...over,
  });

  test('every report gets its own titled section', () => {
    const { html } = bundle(three);
    expect((html.match(/Report \d of 3/g) || [])).toHaveLength(3);
    for (const r of three) expect(html).toContain(r.reportName);
  });

  test('the header, CTA and footer appear exactly once', () => {
    const { html } = bundle(three);
    expect(html.match(/Open in GPDash<\/a>/g)).toHaveLength(1);
    expect(html.match(/do not forward it outside/g)).toHaveLength(1);
    expect(html.match(/DASH<\/span>/g)).toHaveLength(1);
  });

  test('a contents list names what is inside, so a digest can be triaged', () => {
    const { html } = bundle(three);
    expect(html).toContain('In this email');
    expect(html).toContain('1. Fill rate');
    expect(html).toContain('3. Slots offered');
  });

  test('one report keeps the solo layout, with no section labels', () => {
    const { html } = bundle([three[0]]);
    expect(html).not.toContain('In this email');
    expect(html).not.toMatch(/Report \d of/);
    expect(html).toContain('<h1');
  });

  test('the subject names the reports up to the point it would get silly', () => {
    expect(bundle([three[0]]).subject).toBe('Fill rate — Test Practice');
    expect(bundle(three.slice(0, 2)).subject).toBe('Fill rate and Duty share — Test Practice');
    expect(bundle(three).subject).toBe('Fill rate, Duty share and 1 more — Test Practice');
  });

  test('one CSV per report, named after it', () => {
    const { attachments } = bundle(three);
    expect(attachments.map(a => a.filename)).toEqual(['fill-rate.csv', 'duty-share.csv', 'slots-offered.csv']);
  });

  test('two reports with the same name still get distinct attachments', () => {
    const { attachments } = bundle([mk('Same', [['a', 1]]), mk('Same', [['b', 2]])]);
    expect(attachments.map(a => a.filename)).toEqual(['same.csv', 'same-2.csv']);
  });

  test('bar geometry holds across every section', () => {
    const tracks = tracksIn(bundle(three).html);
    expect(tracks).toHaveLength(4);            // 2 + 1 + 1
    for (const t of tracks) {
      const widths = [...t.matchAll(/width="([\d.]+)%"/g)].map(m => parseFloat(m[1]));
      expect(Math.abs(widths.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.05);
    }
  });

  test('one empty report explains itself without blanking the others', () => {
    const withEmpty = [three[0], mk('Nothing', []), three[2]];
    const { html } = bundle(withEmpty);
    expect(html).toContain('No data matched this report');
    expect(html).toContain('Dr A');            // the healthy sections still render
    expect(html).toContain('Slots offered');
  });

  test('the stale-data warning is stated once for the whole email', () => {
    const html = bundle(three, { dataUpdatedAt: '2026-09-01T09:00:00Z', now: new Date('2026-09-10T09:00:00Z') }).html;
    expect(html.match(/last uploaded 9 days ago/g)).toHaveLength(1);
    expect(html).toContain('behind these reports');
  });

  test('the plain-text alternative carries every report', () => {
    const { text } = bundle(three);
    expect(text).toContain('3 reports — Test Practice');
    expect(text).toContain('[1/3] Fill rate');
    expect(text).toContain('[3/3] Slots offered');
  });
});

test.describe('shared report rows', () => {
  test('a ratio report carries its numerator and denominator', () => {
    const rows = buildReportRows(fakeResult());
    expect(rows[0]).toEqual(['Group', 'Percentage', 'Numerator', 'Denominator']);
    expect(rows[1]).toEqual(['Dr A', '60.0', 60, 100]);
  });
  test('quotes in a name do not break the CSV', () => {
    const csv = reportRowsToCsv([['Group'], ['Dr "Bob" O\'Neil']]);
    expect(csv).toBe('"Group"\n"Dr ""Bob"" O\'Neil"');
  });
});

test.describe('reportInsight', () => {
  test('names a genuine outlier', () => {
    expect(reportInsight(fakeResult())).toContain('Dr A is highest at 60.0%');
  });

  // The regression this guards: the chart draws its reference line at
  // totalValue and calls it "fair share", so the sentence must not quietly
  // compare against valueAvg instead. The two only agree when everybody
  // carries the same denominator, which is exactly when a bug here hides.
  test('compares against the pooled fair share, not the mean of the rows', () => {
    // Mirrors real Winscombe data: 52 duty of 255 worked = 20.39% pooled,
    // while the mean of the eleven row percentages is 18.14%.
    const rows = [
      ['Darren Cox', 11, 32], ['Trudi Withey', 3, 10], ['Laura Walsh', 8, 29],
      ['Justin Grandison', 9, 34], ['Katie Ellison', 7, 28], ['Elizabeth Puntis', 6, 27],
      ['Alice Blackwell', 5, 24], ['Ruth Colson', 3, 23], ['Madeleine Edwards', 0, 17],
      ['Nicola Howard', 0, 21], ['Rosemarie Potts', 0, 10],
    ];
    const groups = rows.map(([label, n, d], i) => ({
      key: `k${i}`, label, numerator: n, denominator: d, value: (n / d) * 100, cells: {},
    }));
    const vals = groups.map(g => g.value);
    const totalNum = rows.reduce((a, [, n]) => a + n, 0);
    const totalDenom = rows.reduce((a, [, , d]) => a + d, 0);
    const result = {
      groups, series: [{ key: '_all', label: '' }], hasSplit: false, isRatio: true,
      denomMode: 'custom', totalNum, totalDenom, totalAll: totalDenom,
      totalValue: (totalNum / totalDenom) * 100,
      valueMin: Math.min(...vals), valueMax: Math.max(...vals),
      valueAvg: vals.reduce((a, b) => a + b, 0) / vals.length,
    };

    // Both statistics are real and they genuinely differ.
    expect(result.totalValue).toBeCloseTo(20.39, 1);
    expect(result.valueAvg).toBeCloseTo(18.14, 1);

    const line = reportInsight(result);
    expect(line).toContain('fair share of 20.4%');   // the chart's own number
    expect(line).toContain('1.7×');                  // 34.4 / 20.4, not 34.4 / 18.1
    expect(line).not.toContain('18.1');
    expect(line).not.toContain('group average');
  });
  test('says nothing when the group is level', () => {
    const level = fakeResult({ groups: [
      { key: 'a', label: 'A', value: 50, numerator: 50, denominator: 100, cells: {} },
      { key: 'b', label: 'B', value: 49, numerator: 49, denominator: 100, cells: {} },
    ] });
    expect(reportInsight(level)).toBeNull();
  });
  test('says nothing for split reports, where there is no single highest', () => {
    expect(reportInsight(fakeResult({ hasSplit: true }))).toBeNull();
  });
});


test.describe('unsubscribe', () => {
  const R = [
    { email: 'a@nhs.net', token: 't1' },
    { email: 'b@nhs.net', token: 't2', unsubscribedAt: '2026-09-02T10:00:00Z' },
    { email: 'c@example.org', token: 't3' },
  ];

  test('people who opted out of this schedule stop receiving it', () => {
    expect(activeRecipients(R).map(r => r.email)).toEqual(['a@nhs.net', 'c@example.org']);
  });

  test('the practice-wide suppression list wins even without a per-schedule opt-out', () => {
    const out = activeRecipients(R, new Set(['c@example.org']));
    expect(out.map(r => r.email)).toEqual(['a@nhs.net']);
  });

  test('suppression matching ignores case, because addresses are typed by hand', () => {
    const out = activeRecipients([{ email: 'Jane.Doe@NHS.net', token: 'x' }], new Set(['jane.doe@nhs.net']));
    expect(out).toHaveLength(0);
  });

  test('junk in the recipients array cannot crash a send', () => {
    expect(activeRecipients([null, {}, { email: '' }, 'nope', { email: 'ok@nhs.net' }]).map(r => r.email))
      .toEqual(['ok@nhs.net']);
    expect(activeRecipients(null)).toEqual([]);
  });

  test('the two links are distinct: a page for humans, an endpoint for one-click', () => {
    const u = unsubscribeUrls('https://gpdash.net/', 'tok123');
    expect(u.page).toBe('https://gpdash.net/r/unsubscribe/tok123');
    expect(u.post).toBe('https://gpdash.net/api/v4/public/unsubscribe/tok123');
    expect(u.page).not.toBe(u.post);
  });

  test('no address ever appears in an unsubscribe URL', () => {
    const u = unsubscribeUrls('https://gpdash.net', 'tok123');
    expect(u.page + u.post).not.toContain('@');
  });
});

test.describe('unsubscribe link in the email', () => {
  const withToken = (over = {}) => renderReportEmail({
    reportName: 'Fill rate', practiceName: 'Test Practice', result: fakeResult(),
    config: CONFIG, layout: {}, siteUrl: 'https://gpdash.net', unsubscribeToken: 'tok123', ...over,
  });

  test('the footer link carries only the token', () => {
    const { html } = withToken();
    expect(html).toContain('https://gpdash.net/r/unsubscribe/tok123');
    expect(html).toContain('Stop sending this to me');
  });

  test('mail clients get the RFC 8058 headers for their own unsubscribe button', () => {
    const { headers } = withToken();
    expect(headers['List-Unsubscribe']).toBe('<https://gpdash.net/api/v4/public/unsubscribe/tok123>');
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  test('the plain-text copy has a way out too', () => {
    expect(withToken().text).toContain('Stop sending this to me: https://gpdash.net/r/unsubscribe/tok123');
  });

  test('a preview with no recipient has no link and no headers', () => {
    const out = withToken({ unsubscribeToken: null });
    expect(out.headers).toBeUndefined();
    expect(out.html).not.toContain('/r/unsubscribe/');
    expect(out.html).toContain('ask an administrator');
  });
});

test.describe('the notice to whoever set the schedule up', () => {
  const notice = (over = {}) => renderUnsubscribeNotice({
    organiserName: 'Darren Cox', practiceName: 'Winscombe Surgery',
    recipientEmail: 'jane@example.org', recipientName: 'Jane Doe',
    reportNames: ['Fill rate', 'Duty share'], scheduleLabel: 'Every Monday at 08:00',
    scope: 'schedule', paused: false, siteUrl: 'https://gpdash.net', ...over,
  });

  test('names who left and what they left', () => {
    const { subject, html } = notice();
    expect(subject).toContain('Jane Doe (jane@example.org)');
    expect(html).toContain('Fill rate and Duty share');
    expect(html).toContain('every monday at 08:00');
  });

  test('says whether it was this email or everything', () => {
    expect(notice({ scope: 'schedule' }).html).toContain('this schedule only');
    expect(notice({ scope: 'practice' }).html).toContain('all</strong> report emails');
  });

  test('calls out a schedule that switched itself off', () => {
    expect(notice({ paused: false }).html).not.toContain('paused');
    expect(notice({ paused: true }).html).toContain('<strong>paused</strong>');
  });

  test('escapes a name with markup in it', () => {
    const { html } = notice({ recipientName: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
