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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 4 }}>
            EMIS appointment report
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
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
            color: 'white',
            textDecoration: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          ↓ Download XML
        </a>
      </div>

      {/* Expandable how-to */}
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => setShowHowTo(!showHowTo)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: '#22d3ee',
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
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            fontSize: 12,
            color: '#cbd5e1',
            lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: '#67e8f9' }}>One-time setup (about 2 minutes)</div>
            <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Click <strong>Download XML</strong> above and save the file somewhere you can find it.</li>
              <li>In EMIS, open <strong>Population Reporting</strong> from the main menu.</li>
              <li>Right-click in the folder where you'd like the report to live, then choose <strong>Import</strong>.</li>
              <li>Browse to the XML file you downloaded and open it.</li>
              <li>The report appears as <em>"GpDash appointment data"</em>. You're done with the import.</li>
            </ol>

            <div style={{ fontWeight: 600, marginTop: 14, marginBottom: 8, color: '#67e8f9' }}>Each morning (about 30 seconds)</div>
            <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Find the <em>"GpDash appointment data"</em> report in Population Reporting.</li>
              <li>Right-click → <strong>Run</strong>. Wait for it to finish (a few seconds).</li>
              <li>Double-click the result to open it.</li>
              <li>Click <strong>Export</strong> → choose <strong>CSV</strong> → save to your computer.</li>
              <li>Open GPDash, go to the <strong>Today</strong> page, and drop the CSV onto the upload area.</li>
            </ol>

            <div style={{ marginTop: 14, padding: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, color: '#fcd34d', fontSize: 11 }}>
              The report covers the previous 2 months by default — the date filter is built into the XML. You don't need to set anything else.
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
              These instructions are based on standard EMIS Web. If your practice's EMIS layout
              differs, check with your IT lead or
              {' '}<a href="mailto:darren.cox2@nhs.net" style={{ color: '#22d3ee' }}>get in touch</a>.
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
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
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
