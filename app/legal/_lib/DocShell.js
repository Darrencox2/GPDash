// app/legal/_lib/DocShell.js
//
// Shared shell for the markdown-backed legal docs (/legal/dpa,
// /legal/dspt). Reads a markdown file from /docs/legal/ at module
// load time (so the file is included in Next.js's build trace and
// available at runtime), parses to HTML with marked, and renders
// inside a consistent shell.
//
// Dark glass theme matching /legal and /privacy.

import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';
import { marked } from 'marked';
import { LEGAL_META } from '@/lib/legal-meta';

marked.setOptions({ gfm: true, breaks: false });

export function loadAndRender(filename) {
  const path = join(process.cwd(), 'docs', 'legal', filename);
  const md = readFileSync(path, 'utf8');
  return marked.parse(md);
}

const PAGE_BG = 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)';
const inlineLink = { color: 'var(--link)', textDecoration: 'underline', textUnderlineOffset: 2 };

export default function DocShell({ title, html, breadcrumb }) {
  return (
    <main style={{ minHeight: '100vh', padding: '40px 24px 64px', background: PAGE_BG, color: '#e2e8f0' }}>
      <article style={{ maxWidth: 720, margin: '0 auto', lineHeight: 1.65 }}>
        <nav className="mb-4 text-meta text-slate-400">
          <Link href="/legal" style={inlineLink}>Legal &amp; compliance</Link>
          {breadcrumb && <> <span style={{ color: 'var(--meta)', margin: '0 6px' }}>·</span> <span className="text-slate-300">{breadcrumb}</span></>}
        </nav>

        <div className="legal-doc" dangerouslySetInnerHTML={{ __html: html }} />

        <footer style={{ marginTop: 48, paddingTop: 24, fontSize: 12, color: 'var(--meta)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="mb-2">
            Questions about this document? <a href={`mailto:${LEGAL_META.privacyContactEmail}`} style={inlineLink}>{LEGAL_META.privacyContactEmail}</a>
          </p>
          <p style={{ margin: 0 }}>
            <Link href="/legal" style={{ color: '#94a3b8', textDecoration: 'none' }}>← Back to Legal &amp; compliance</Link>
          </p>
        </footer>
      </article>

      {/* Scoped styles for the rendered markdown. Kept here rather than
          in globals.css so they only apply to legal doc pages and can't
          accidentally affect the rest of the app. Dark-theme palette
          matched to the rest of GPDash: slate-200 for body, slate-100
          for headings, cyan-300 for links, amber for blockquote-as-
          callout (the "DRAFT — requires legal review" header at the
          top of the DPA template ends up here). */}
      <style>{`
        .legal-doc {
          font-size: 14px;
          color: #cbd5e1;
        }
        .legal-doc h1 {
          font-family: 'Outfit', sans-serif;
          font-size: 30px;
          font-weight: 600;
          margin-bottom: 8px;
          margin-top: 0;
          color: #f1f5f9;
        }
        .legal-doc h2 {
          font-family: 'Outfit', sans-serif;
          font-size: 20px;
          font-weight: 600;
          margin-top: 36px;
          margin-bottom: 14px;
          color: #f1f5f9;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .legal-doc h2:first-of-type {
          padding-top: 0;
          border-top: none;
          margin-top: 24px;
        }
        .legal-doc h3 {
          font-family: 'Outfit', sans-serif;
          font-size: 16px;
          font-weight: 600;
          margin-top: 24px;
          margin-bottom: 10px;
          color: #e2e8f0;
        }
        .legal-doc h4 {
          font-size: 14px;
          font-weight: 600;
          margin-top: 18px;
          margin-bottom: 8px;
          color: #e2e8f0;
        }
        .legal-doc p {
          font-size: 14px;
          color: #cbd5e1;
          margin-bottom: 12px;
          line-height: 1.75;
        }
        .legal-doc ul, .legal-doc ol {
          font-size: 14px;
          color: #cbd5e1;
          margin-bottom: 12px;
          padding-left: 24px;
          line-height: 1.8;
        }
        .legal-doc li {
          margin-bottom: 6px;
        }
        .legal-doc strong { color: #f1f5f9; font-weight: 600; }
        .legal-doc em { color: #94a3b8; font-style: italic; }
        .legal-doc a {
          color: var(--link);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .legal-doc a:hover { color: #a5f3fc; }
        .legal-doc code {
          background: rgba(255,255,255,0.06);
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 12px;
          color: #f1f5f9;
          font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        }
        .legal-doc pre {
          background: rgba(0,0,0,0.4);
          color: #e2e8f0;
          padding: 14px 16px;
          border-radius: 8px;
          overflow-x: auto;
          font-size: 12px;
          margin-bottom: 14px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .legal-doc pre code {
          background: transparent;
          color: inherit;
          padding: 0;
          font-size: 12px;
        }
        .legal-doc blockquote {
          border-left: 4px solid #fbbf24;
          background: rgba(251,191,36,0.10);
          color: #fde68a;
          padding: 14px 18px;
          margin: 16px 0;
          border-radius: 0 8px 8px 0;
        }
        .legal-doc blockquote p {
          color: #fde68a;
          font-size: 13px;
          margin-bottom: 8px;
          line-height: 1.6;
        }
        .legal-doc blockquote p:last-child { margin-bottom: 0; }
        .legal-doc blockquote strong { color: #fcd34d; }
        .legal-doc blockquote code {
          background: rgba(251,191,36,0.15);
          color: #fde68a;
        }
        .legal-doc hr {
          margin: 32px 0;
          border: none;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .legal-doc table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          margin-bottom: 16px;
          background: rgba(255,255,255,0.02);
          border-radius: 8px;
          overflow: hidden;
        }
        .legal-doc th, .legal-doc td {
          border: 1px solid rgba(255,255,255,0.08);
          padding: 8px 12px;
          text-align: left;
          vertical-align: top;
        }
        .legal-doc th {
          background: rgba(255,255,255,0.05);
          font-weight: 600;
          color: #f1f5f9;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .legal-doc td {
          color: #cbd5e1;
        }
        .legal-doc input[type="checkbox"] {
          margin-right: 8px;
          accent-color: var(--link);
        }
      `}</style>
    </main>
  );
}
