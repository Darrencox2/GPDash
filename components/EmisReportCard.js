'use client';

// EmisReportCard — download button for the EMIS appointment data report
// XML, plus a collapsible "how to import and run" instructions block.
// Used in the practice setup wizard (first-time) and on the practice
// management page (ongoing access).
//
// The XML is a standard EMIS enquiry definition that practices import
// once. Once imported and run, it produces the CSV that GPDash expects
// to be uploaded each morning to the Today page.

import { useState } from 'react';

const XML_URL = '/emis-reports/GpDash_appointment_data.xml';
const XML_FILENAME = 'GpDash_appointment_data.xml';

export default function EmisReportCard({ variant = 'card' }) {
  const [showHowTo, setShowHowTo] = useState(false);

  const Wrapper = variant === 'inline' ? InlineWrapper : CardWrapper;

  return (
    <Wrapper>
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="text-body-sm font-semibold text-hi mb-1">
            EMIS appointment report
          </div>
          <p style={{ fontSize: 12, color: 'var(--g-text-mid)', lineHeight: 1.5, margin: 0 }}>
            Download this report definition and import it into EMIS. Run it each
            morning and upload the exported CSV to the Today page so GPDash can
            show your appointment capacity.
          </p>
        </div>
        <a
          href={XML_URL}
          download={XML_FILENAME}
          style={{
            padding: '7px 14px',
            background: '#0891b2',
            color: 'var(--g-text-max)',
            textDecoration: 'none',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          ↓ Download XML
        </a>
      </div>

      {/* Expandable how-to */}
      <div className="mt-3">
        <button
          onClick={() => setShowHowTo(!showHowTo)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--c-cyan)',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: showHowTo ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
          How to import and run this in EMIS
        </button>
        {showHowTo && (
          <div style={{
            marginTop: 10,
            padding: 14,
            background: 'var(--g-field)',
            border: '1px solid var(--g-border)',
            borderRadius: 'var(--r-md)',
            fontSize: 12,
            color: 'var(--g-text-hi)',
            lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--c-cyan)' }}>One-time setup (about 2 minutes)</div>
            <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Click <strong>Download XML</strong> above and save the file somewhere you can find it.</li>
              <li>In EMIS, open <strong>Appointment Reporting</strong> from the main menu.</li>
              <li>Right-click in the folder where you'd like the report to live, then choose <strong>Import</strong>.</li>
              <li>Browse to the XML file you downloaded and open it.</li>
              <li>The report appears as <em>"GpDash appointment data"</em>.</li>
              <li><strong>Tip:</strong> right-click the imported report → <strong>Properties</strong> → <strong>Schedule</strong> and set it to run automatically every morning.
                That way the data is fresh each day and you only need to export the result.
              </li>
            </ol>

            <div style={{ fontWeight: 600, marginTop: 14, marginBottom: 8, color: 'var(--c-cyan)' }}>Each morning (about 30 seconds)</div>
            <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Open <strong>Appointment Reporting</strong> and find <em>"GpDash appointment data"</em>.</li>
              <li>If you scheduled it: just open the latest result. Otherwise right-click → <strong>Run</strong> and wait a few seconds.</li>
              <li>Double-click the result to open it.</li>
              <li>Click <strong>Export</strong> → choose <strong>CSV</strong> → save to your computer.</li>
              <li>Open GPDash, go to the <strong>Today</strong> page, and drop the CSV onto the upload area.</li>
            </ol>

            <div style={{ marginTop: 14, padding: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--r-sm)', color: 'var(--c-amber)', fontSize: 11 }}>
              The report covers the previous 2 months by default — the date filter is built into the XML. You don't need to set anything else.
            </div>

            <div className="mt-2.5 text-caption text-slate-400">
              These instructions are based on standard EMIS Web. If your practice's EMIS layout
              differs, check with your IT lead or
              {' '}<a href="mailto:darren.cox2@nhs.net" style={{ color: 'var(--c-cyan)' }}>get in touch</a>.
            </div>
          </div>
        )}
      </div>
    </Wrapper>
  );
}

function CardWrapper({ children }) {
  return (
    <div style={{
      background: 'var(--g-tile-2)',
      border: '1px solid var(--g-border-2)',
      borderRadius: 'var(--r-lg)',
      padding: 18,
    }}>
      {children}
    </div>
  );
}

function InlineWrapper({ children }) {
  // For embedding inside another card (e.g. inside the setup wizard's existing
  // section structure). No background or border — just the content.
  return <div>{children}</div>;
}
