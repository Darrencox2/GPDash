// Renders one or more workload reports as a single email.
//
// THE CHART IS THE POINT. A manager opening this on a phone at 08:00
// should see the shape of the week before reading a single number, so
// the chart is the hero and the detail goes in the CSV attachment.
//
// WHY THE CHART IS BUILT FROM TABLE CELLS
//
// The on-screen chart cannot be reused. Email clients run no JavaScript,
// Gmail strips <svg> entirely, and remote <img> is blocked by default in
// Gmail and Outlook until the reader clicks "display images" — which
// would make a hero element invisible on first open, which is the one
// thing it must never be. Nested tables with background-color and
// percentage widths are the only chart that renders unconditionally
// everywhere. So the bars here are <td> elements, sized in percent.
//
// This is the single place where the email deliberately differs from the
// screen: a trend report draws as ordered bars rather than a line,
// because a line needs vector drawing and there is no way to do that in
// an email that Gmail will show.
//
// BUNDLES. An email can carry several reports. They share one header,
// one CTA and one footer, and each gets its own titled section with its
// own chart; a contents line at the top names them so a four-report
// digest can be triaged from the first screenful. This exists so a
// practice gets one Monday email rather than four arriving at once.
//
// Everything numeric comes from runReport() in lib/workload-report.js —
// the same engine the dashboard uses — so the figures cannot drift.

import { buildReportRows, reportRowsToCsv, describeMeasure, rangeLabel, makeConditionalColour, reportInsight, REPORT_PALETTE, REPORT_SINGLE } from './workload-report';
import { normaliseLayout, unsubscribeUrls } from './report-schedules';

// ─── Helpers ─────────────────────────────────────────────────────────────

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

const LOGO = `<svg width="30" height="30" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="7.6" fill="#1e293b"/>
  <rect x="4.5" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981"/>
  <rect x="13.87" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
  <rect x="23.23" y="4.5" width="8.27" height="8.27" rx="3" fill="#334155"/>
  <rect x="4.5" y="13.87" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
  <rect x="13.87" y="13.87" width="8.27" height="8.27" rx="3" fill="#f59e0b"/>
  <rect x="23.23" y="13.87" width="8.27" height="8.27" rx="3" fill="#334155"/>
  <rect x="4.5" y="23.23" width="8.27" height="8.27" rx="3" fill="#ef4444"/>
  <rect x="13.87" y="23.23" width="8.27" height="8.27" rx="3" fill="#f59e0b" opacity="0.5"/>
  <rect x="23.23" y="23.23" width="8.27" height="8.27" rx="3" fill="#334155"/>
</svg>`;

// Empty cells collapse in Outlook unless they carry a zero-sized entity.
const FILLER = '<span style="font-size:0;line-height:0;">&nbsp;</span>';

function fmtValue(v, isRatio) {
  return isRatio ? `${v.toFixed(1)}%` : `${Math.round(v)}`;
}

// ─── The chart ───────────────────────────────────────────────────────────

// Horizontal bars. Three columns so every bar starts at the same x:
// label | bar track | value. Widths are percentages of the widest bar,
// which is what makes the rows comparable at a glance.
function renderBars({ result, layout, colourFor, refValue, refLabel }) {
  const isRatio = result.isRatio;
  let groups = result.groups;
  const limited = layout.topN > 0 && groups.length > layout.topN;
  if (limited) groups = groups.slice(0, layout.topN);

  // Scale: for ratios the axis runs to 100 so a percentage reads as a
  // percentage; for counts it runs to the largest bar.
  const maxVal = Math.max(
    ...groups.map(g => (result.hasSplit
      ? result.series.reduce((sum, s) => sum + (g.cells[s.key]?.value || 0), 0)
      : g.value)),
    isRatio ? 100 : 1,
  );

  const rows = groups.map((g, i) => {
    let track;
    if (result.hasSplit) {
      // Stacked: one cell per series. Each cell's width is that series'
      // share of the whole axis, so the total bar length still reads as
      // the group total while the segments stay proportional.
      // Segments under half a percent are dropped: at 640px wide they
      // would be sub-pixel, and Outlook rounds them up to a visible
      // sliver that misreads as a real share. The remainder is measured
      // from what was actually drawn, not from the underlying total, so
      // dropping one cannot leave the row short of 100%.
      let drawnPct = 0;
      const segs = result.series.map((s, si) => {
        const v = g.cells[s.key]?.value || 0;
        const pct = maxVal > 0 ? (v / maxVal) * 100 : 0;
        if (pct < 0.5) return '';
        drawnPct += pct;
        return `<td width="${pct.toFixed(2)}%" height="20" style="width:${pct.toFixed(2)}%;height:20px;background:${REPORT_PALETTE[si % REPORT_PALETTE.length]};font-size:0;line-height:0;">${FILLER}</td>`;
      }).join('');
      const rest = Math.max(0, 100 - drawnPct);
      track = `${segs}<td width="${rest.toFixed(2)}%" style="width:${rest.toFixed(2)}%;font-size:0;line-height:0;">${FILLER}</td>`;
    } else {
      const pct = maxVal > 0 ? Math.max(0, Math.min(100, (g.value / maxVal) * 100)) : 0;
      const colour = colourFor(g.value, i);
      // A real but tiny value still gets a visible sliver — a bar of
      // zero width reads as "no data", which is a different fact.
      const drawn = g.value > 0 ? Math.max(pct, 1.5) : 0;
      const rest = Math.max(0, 100 - drawn);
      track = (drawn > 0
        ? `<td width="${drawn.toFixed(2)}%" height="20" style="width:${drawn.toFixed(2)}%;height:20px;background:${colour};border-radius:3px;font-size:0;line-height:0;">${FILLER}</td>`
        : '')
        + `<td width="${rest.toFixed(2)}%" style="width:${rest.toFixed(2)}%;font-size:0;line-height:0;">${FILLER}</td>`;
    }

    const value = result.hasSplit
      ? fmtValue(result.series.reduce((sum, s) => sum + (g.cells[s.key]?.value || 0), 0), isRatio)
      : fmtValue(g.value, isRatio);

    return `<tr>
      <td width="34%" style="width:34%;padding:3px 10px 3px 0;font-family:${FONT};font-size:12px;color:#334155;text-align:right;vertical-align:middle;line-height:1.3;">${esc(g.label)}</td>
      <td width="52%" style="width:52%;padding:3px 0;vertical-align:middle;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;"><tr>${track}</tr></table>
      </td>
      <td width="14%" style="width:14%;padding:3px 0 3px 8px;font-family:${MONO};font-size:12px;font-weight:700;color:#0f172a;white-space:nowrap;vertical-align:middle;">${esc(value)}</td>
    </tr>`;
  }).join('');

  const legend = result.hasSplit
    ? `<div style="margin-top:12px;font-family:${FONT};font-size:11px;color:#64748b;line-height:1.9;">`
      + result.series.map((s, si) =>
          `<span style="white-space:nowrap;margin-right:12px;"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${REPORT_PALETTE[si % REPORT_PALETTE.length]};">${FILLER}</span> ${esc(s.label || 'Series')}</span>`
        ).join('')
      + `</div>`
    : '';

  // The reference line the screen draws across the bars has no email
  // equivalent, so it is stated instead of drawn.
  const ref = (!result.hasSplit && refValue != null)
    ? `<div style="margin-top:12px;font-family:${FONT};font-size:11px;color:#64748b;">${esc(refLabel)} across all ${result.groups.length} ${result.groups.length === 1 ? 'row' : 'rows'}</div>`
    : '';

  const more = limited
    ? `<div style="margin-top:8px;font-family:${FONT};font-size:11px;color:#94a3b8;">Showing the top ${layout.topN} of ${result.groups.length}. The attached CSV has every row.</div>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">${rows}</table>${legend}${ref}${more}`;
}

// ─── The optional inline table ───────────────────────────────────────────

function renderTable(result) {
  const rows = buildReportRows(result);
  if (rows.length < 2) return '';
  const [header, ...body] = rows;
  const th = header.map((h, i) =>
    `<th align="${i === 0 ? 'left' : 'right'}" style="padding:6px 8px;font-family:${FONT};font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${esc(h)}</th>`
  ).join('');
  const tr = body.map((r, ri) =>
    `<tr style="background:${ri % 2 ? '#f8fafc' : '#ffffff'};">`
    + r.map((c, i) =>
        `<td align="${i === 0 ? 'left' : 'right'}" style="padding:6px 8px;font-family:${i === 0 ? FONT : MONO};font-size:12px;color:${i === 0 ? '#334155' : '#0f172a'};border-bottom:1px solid #f1f5f9;">${esc(c)}</td>`
      ).join('')
    + `</tr>`
  ).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:8px;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

// ─── Plain-text alternative ──────────────────────────────────────────────

function renderText({ reports, practiceName, layout, intro, freshnessLine, url, unsubUrl }) {
  const blocks = reports.map((r, i) => {
    const rows = buildReportRows(r.result);
    const head = reports.length > 1 ? `\n[${i + 1}/${reports.length}] ${r.reportName}` : r.reportName;
    if (!r.result.groups.length) {
      return `${head}\n${describeMeasure(r.config)} · ${rangeLabel(r.config.range)}\n(No data matched this report.)`;
    }
    const widths = rows[0].map((_, c) => Math.max(...rows.map(row => String(row[c] ?? '').length)));
    const table = rows.map((row, ri) => {
      const line = row.map((c, ci) => ci === 0 ? String(c ?? '').padEnd(widths[ci]) : String(c ?? '').padStart(widths[ci])).join('  ');
      return ri === 0 ? `${line}\n${widths.map(w => '-'.repeat(w)).join('  ')}` : line;
    }).join('\n');
    const insight = layout.insight ? reportInsight(r.result) : null;
    return [
      head,
      `${describeMeasure(r.config)} · ${rangeLabel(r.config.range)}`,
      layout.headline ? `Overall: ${fmtValue(r.result.totalValue, r.result.isRatio)}` : '',
      insight ? `\n${insight}` : '',
      '',
      table,
    ].filter(Boolean).join('\n');
  });

  return [
    reports.length > 1 ? `${reports.length} reports — ${practiceName}` : `${reports[0]?.reportName ?? 'Report'} — ${practiceName}`,
    '',
    intro ? `${intro}\n` : '',
    blocks.join('\n\n'),
    '',
    freshnessLine || '',
    url ? `View in GPDash: ${url}` : '',
    unsubUrl ? `Stop sending this to me: ${unsubUrl}` : '',
  ].filter(Boolean).join('\n');
}

// ─── One report's section ────────────────────────────────────────────────

// The title, headline, insight and chart for a single report. Shared by
// the one-report and many-report cases so a bundled section and a solo
// email are rendered by the same code.
function renderSection({ report, layout, index, total }) {
  const { reportName, result, config } = report;
  const isRatio = result.isRatio;
  const empty = !result.groups || result.groups.length === 0;

  const refValue = !result.hasSplit ? (isRatio ? result.totalValue : result.valueAvg) : null;
  const refLabel = isRatio ? `Fair share ${fmtValue(result.totalValue, true)}` : `Average ${fmtValue(result.valueAvg, false)}`;

  const condColour = makeConditionalColour({
    result, refValue,
    mode: config.condMode || 'auto',
    low: config.condLow === '' || config.condLow == null ? null : parseFloat(config.condLow),
    high: config.condHigh === '' || config.condHigh == null ? null : parseFloat(config.condHigh),
    invert: !!config.colourInvert,
  });
  const mode = config.colourMode || 'conditional';
  const colourFor = (value, i) =>
    mode === 'single' ? REPORT_SINGLE
    : mode === 'conditional' ? condColour(value)
    : REPORT_PALETTE[i % REPORT_PALETTE.length];

  const insightLine = (layout.insight && !empty) ? reportInsight(result) : null;

  const chart = empty
    ? `<p style="margin:0;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-family:${FONT};font-size:13px;line-height:1.6;color:#92400e;">
         No data matched this report for ${esc(rangeLabel(config.range))}. That usually means no appointment CSV has been uploaded recently, or the filters exclude everything in range.
       </p>`
    : renderBars({ result, layout, colourFor, refValue, refLabel });

  // Sections after the first get a rule above them so the eye knows a new
  // report has started.
  const divider = index > 0
    ? `<tr><td style="padding:6px 28px 0;"><div style="border-top:1px solid #e2e8f0;">${FILLER}</div></td></tr>`
    : '';

  return `${divider}
  <tr>
    <td style="padding:${index > 0 ? '22px' : '26px'} 28px 0;">
      ${total > 1 ? `<div style="font-family:${FONT};font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px;">Report ${index + 1} of ${total}</div>` : ''}
      <h${index === 0 && total === 1 ? '1' : '2'} style="margin:0 0 6px;font-family:${FONT};font-size:${total > 1 ? '17px' : '21px'};font-weight:600;color:#0f172a;line-height:1.25;">${esc(reportName)}</h${index === 0 && total === 1 ? '1' : '2'}>
      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:#64748b;">
        ${esc(describeMeasure(config))} · ${esc(rangeLabel(config.range))}
      </p>
      ${(layout.headline && !empty) ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;">
        <tr>
          <td style="padding:${total > 1 ? '9px 14px' : '12px 18px'};background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <div style="font-family:${FONT};font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;">Overall</div>
            <div style="font-family:${MONO};font-size:${total > 1 ? '22px' : '28px'};font-weight:700;color:#0891b2;line-height:1.15;margin-top:2px;">${esc(fmtValue(result.totalValue, isRatio))}</div>
          </td>
        </tr>
      </table>` : ''}
    </td>
  </tr>
  ${insightLine ? `
  <tr>
    <td style="padding:16px 28px 0;">
      <p style="margin:0;padding:11px 14px;background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;font-family:${FONT};font-size:12px;line-height:1.6;color:#92400e;">${esc(insightLine)}</p>
    </td>
  </tr>` : ''}

  <!-- THE CHART -->
  <tr>
    <td style="padding:20px 28px 4px;">${chart}</td>
  </tr>

  ${(layout.table && !empty) ? `<tr><td style="padding:14px 28px 0;">${renderTable(result)}</td></tr>` : ''}`;
}

// ─── Subject ─────────────────────────────────────────────────────────────

// Named reports beat a generic label in a crowded inbox, so the subject
// says what is actually inside up to the point it would get silly.
function defaultSubject(reports, practiceName) {
  const names = reports.map(r => r.reportName);
  if (names.length === 1) return `${names[0]} — ${practiceName}`;
  if (names.length === 2) return `${names[0]} and ${names[1]} — ${practiceName}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more — ${practiceName}`;
}

// ─── Main entry ──────────────────────────────────────────────────────────

// Returns { subject, html, text, attachments }. Pure: hand it results
// from runReport and it does no I/O, which is what lets the setup screen
// preview the exact bytes that will be sent.
//
// `reports` is an array of { reportName, result, config }. A single
// report is just an array of one.
export function renderReportEmail({
  reports: rawReports,
  reportName, result, config,        // single-report shorthand
  practiceName,
  layout: rawLayout,
  intro = '',
  subject: rawSubject = '',
  siteUrl = 'https://gpdash.net',
  scheduleLabel = '',
  dataUpdatedAt = null,
  now = new Date(),
  // Per-recipient, so the link can only ever unsubscribe the person who
  // received that copy. Absent for the setup-screen preview, where there is
  // no recipient yet.
  unsubscribeToken = null,
}) {
  const reports = (rawReports && rawReports.length)
    ? rawReports
    : (result ? [{ reportName, result, config }] : []);
  const layout = normaliseLayout(rawLayout);
  const url = `${String(siteUrl).replace(/\/$/, '')}/dashboard?section=reporting`;
  const multi = reports.length > 1;

  // "Data last updated N days ago" — only worth saying when it is old
  // enough to change how you read the charts. A digest that quietly runs
  // on a stale CSV is the failure mode this exists to catch. It is stated
  // once for the whole email, because every report shares the one CSV.
  let freshnessLine = '';
  if (layout.freshness && dataUpdatedAt) {
    const days = Math.floor((now.getTime() - new Date(dataUpdatedAt).getTime()) / 86400000);
    if (days >= 3) {
      freshnessLine = `Heads up: the appointment data behind ${multi ? 'these reports' : 'this report'} was last uploaded ${days} days ago, so it may not reflect this week.`;
    }
  }

  const subject = (rawSubject || '').trim() || defaultSubject(reports, practiceName);
  const unsub = unsubscribeToken ? unsubscribeUrls(siteUrl, unsubscribeToken) : null;
  const sections = reports.map((r, i) => renderSection({ report: r, layout, index: i, total: reports.length })).join('\n');

  const contents = multi
    ? `<tr>
         <td style="padding:22px 28px 0;">
           <div style="font-family:${FONT};font-size:11px;color:#64748b;line-height:1.7;padding:11px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
             <strong style="color:#334155;">In this email</strong><br>
             ${reports.map((r, i) => `${i + 1}. ${esc(r.reportName)}`).join('<br>')}
           </div>
         </td>
       </tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:${FONT};color:#334155;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f8fafc;opacity:0;">
    ${multi ? esc(`${reports.length} reports: ${reports.map(r => r.reportName).join(', ')}`) : esc(reports[0] ? describeMeasure(reports[0].config) : '')}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:22px 28px 18px;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;width:30px;">${LOGO}</td>
                  <td style="vertical-align:middle;font-family:${MONO};font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                    <span style="color:#10b981;font-weight:400;opacity:0.5;">[</span>GP<span style="color:#10b981;font-weight:400;opacity:0.5;">]</span><span style="font-family:${FONT};font-weight:300;color:#10b981;letter-spacing:0.18em;margin-left:2px;">DASH</span>
                  </td>
                  <td align="right" style="vertical-align:middle;font-family:${FONT};font-size:11px;color:#94a3b8;">${esc(practiceName)}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${intro ? `<tr><td style="padding:22px 28px 0;"><p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.65;color:#475569;">${esc(intro).replace(/\n/g, '<br>')}</p></td></tr>` : ''}
          ${contents}
          ${sections}

          ${freshnessLine ? `
          <tr>
            <td style="padding:18px 28px 0;">
              <p style="margin:0;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-family:${FONT};font-size:12px;line-height:1.6;color:#92400e;">${esc(freshnessLine)}</p>
            </td>
          </tr>` : ''}

          <!-- CTA -->
          <tr>
            <td style="padding:24px 28px 26px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:8px;background:#0891b2;">
                    <a href="${esc(url)}" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Open in GPDash</a>
                  </td>
                </tr>
              </table>
              ${layout.csv ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:11px;color:#94a3b8;line-height:1.6;">The full figures are attached${multi ? `, one CSV per report` : ' as a CSV'}.</p>` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #f1f5f9;font-family:${FONT};font-size:11px;color:#94a3b8;line-height:1.6;">
              ${scheduleLabel ? `${esc(scheduleLabel)} · sent automatically by GPDash.` : 'Sent by GPDash.'}
              ${unsub
                ? `<a href="${esc(unsub.page)}" style="color:#64748b;text-decoration:underline;">Stop sending this to me</a>.`
                : `To stop these, ask an administrator at ${esc(practiceName)} to turn the schedule off in Reporting.`}
              <br><strong style="color:#64748b;">This email contains practice appointment data. Please do not forward it outside your organisation.</strong>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // One CSV per report, named after it. Duplicate names get a suffix so a
  // bundle cannot silently ship two attachments the mail client shows
  // under one name.
  const used = new Set();
  const attachments = layout.csv
    ? reports.map(r => {
        let base = String(r.reportName).replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') || 'report';
        let name = `${base}.csv`;
        let n = 2;
        while (used.has(name)) name = `${base}-${n++}.csv`;
        used.add(name);
        return { filename: name, content: reportRowsToCsv(buildReportRows(r.result)) };
      })
    : [];

  return {
    subject,
    html,
    // RFC 8058. Gmail and Outlook render their own Unsubscribe control from
    // these, which is both better for the reader and better for deliverability
    // than making them hunt for a link in the footer.
    headers: unsub ? {
      'List-Unsubscribe': `<${unsub.post}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    } : undefined,
    text: renderText({ reports, practiceName, layout, intro, freshnessLine, url, unsubUrl: unsub?.page }),
    attachments,
    // Single-report conveniences, kept so the preview pane and the tests
    // can talk about "the CSV" without unpacking the array.
    csv: attachments[0]?.content ?? null,
    csvFilename: attachments[0]?.filename ?? null,
  };
}

// ─── Notice to the organiser ─────────────────────────────────────────────

// Sent to whoever created a schedule when someone on it opts out. Short on
// purpose: it is an FYI, not a report. It says who left, what they left,
// whether the schedule is still running, and where to change it.
export function renderUnsubscribeNotice({
  organiserName, practiceName, recipientEmail, recipientName,
  reportNames = [], scheduleLabel = '', scope = 'schedule', paused = false,
  siteUrl = 'https://gpdash.net',
}) {
  const who = recipientName ? `${recipientName} (${recipientEmail})` : recipientEmail;
  const what = reportNames.length === 1
    ? reportNames[0]
    : reportNames.length > 1
      ? `${reportNames.slice(0, -1).join(', ')} and ${reportNames[reportNames.length - 1]}`
      : 'a scheduled report';
  const url = `${String(siteUrl).replace(/\/$/, '')}/dashboard?section=reporting`;

  const line = scope === 'practice'
    ? `They asked to stop receiving <strong>all</strong> report emails from ${esc(practiceName)}, so they have also been removed from any other schedules and will not be added back automatically.`
    : `They have been removed from this schedule only. Any other report emails they receive from ${esc(practiceName)} are unaffected.`;

  const pausedLine = paused
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-family:${FONT};font-size:13px;line-height:1.6;color:#92400e;">Nobody is left on this schedule, so it has been <strong>paused</strong>. It will not send again until you add a recipient and switch it back on.</p>`
    : '';

  const subject = `${who} unsubscribed from ${reportNames.length ? what : 'a GPDash report'}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:${FONT};color:#334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:22px 28px 18px;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">${LOGO}</td>
                  <td style="vertical-align:middle;font-family:${MONO};font-size:15px;font-weight:700;color:#0f172a;">
                    <span style="color:#10b981;font-weight:400;opacity:0.5;">[</span>GP<span style="color:#10b981;font-weight:400;opacity:0.5;">]</span><span style="font-family:${FONT};font-weight:300;color:#10b981;letter-spacing:0.18em;margin-left:2px;">DASH</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px 28px;">
              <h1 style="margin:0 0 14px;font-family:${FONT};font-size:19px;font-weight:600;color:#0f172a;line-height:1.3;">Someone opted out of a report you set up</h1>
              <p style="margin:0 0 14px;font-family:${FONT};font-size:14px;line-height:1.65;color:#475569;">
                ${organiserName ? `${esc(organiserName)}, ` : ''}<strong style="color:#0f172a;">${esc(who)}</strong> has unsubscribed from <strong style="color:#0f172a;">${esc(what)}</strong>${scheduleLabel ? `, which you had going out ${esc(scheduleLabel.toLowerCase())}` : ''}.
              </p>
              <p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:1.65;color:#475569;">${line}</p>
              ${pausedLine}
              <p style="margin:0 0 20px;font-family:${FONT};font-size:13px;line-height:1.65;color:#64748b;">
                No action is needed. This is just so the list does not change without you knowing.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:8px;background:#0891b2;">
                    <a href="${esc(url)}" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Manage this schedule</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #f1f5f9;font-family:${FONT};font-size:11px;color:#94a3b8;line-height:1.6;">
              Sent by GPDash because you created this schedule.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    '',
    `${who} has unsubscribed from ${what}${scheduleLabel ? `, which you had going out ${scheduleLabel.toLowerCase()}` : ''}.`,
    scope === 'practice'
      ? `They asked to stop receiving all report emails from ${practiceName}.`
      : `They have been removed from this schedule only.`,
    paused ? 'Nobody is left on this schedule, so it has been paused.' : '',
    '',
    `Manage this schedule: ${url}`,
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}
