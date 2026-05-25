// app/legal/_lib/DocShell.js
//
// Shared shell for the markdown-backed legal docs (/legal/dpa,
// /legal/dspt). Reads a markdown file from /docs/legal/ at module
// load time (so the file is included in Next.js's build trace and
// available at runtime), parses to HTML with marked, and renders
// inside a consistent shell.
//
// Why server-side at module load rather than per-request:
//   - The markdown files don't change between deploys, so reading
//     them once is correct
//   - Reading at module load means Next.js's file tracing picks the
//     paths up automatically, no extra config needed
//   - No per-request file I/O overhead

import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';
import { marked } from 'marked';
import { LEGAL_META } from '@/lib/legal-meta';

// Configure marked: GitHub-flavoured markdown, tables enabled.
marked.setOptions({
  gfm: true,
  breaks: false,
});

export function loadAndRender(filename) {
  // process.cwd() at build time is the project root; the docs/legal
  // directory is at the root, alongside app/, lib/, etc.
  const path = join(process.cwd(), 'docs', 'legal', filename);
  const md = readFileSync(path, 'utf8');
  return marked.parse(md);
}

export default function DocShell({ title, html, breadcrumb }) {
  return (
    <main className="min-h-screen px-6 py-10" style={{ background: '#f8fafc', color: '#0f172a' }}>
      <article className="max-w-3xl mx-auto" style={{ lineHeight: 1.65 }}>
        <nav className="mb-4 text-xs text-slate-500">
          <Link href="/legal" className="text-cyan-700 hover:underline">Legal &amp; compliance</Link>
          {breadcrumb && <> · {breadcrumb}</>}
        </nav>

        <div
          className="legal-doc"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <footer className="mt-10 pt-6 text-xs text-slate-500" style={{ borderTop: '1px solid #e2e8f0' }}>
          <p>
            Questions about this document?{' '}
            <a href={`mailto:${LEGAL_META.privacyContactEmail}`} className="text-cyan-700 hover:underline">
              {LEGAL_META.privacyContactEmail}
            </a>
          </p>
          <p className="mt-2">
            <Link href="/legal" className="hover:underline">← Back to Legal &amp; compliance</Link>
          </p>
        </footer>
      </article>

      {/* Scoped styles for the rendered markdown. Kept here rather than in
          globals.css so they only apply to legal doc pages and can't
          accidentally affect the rest of the app. */}
      <style>{`
        .legal-doc h1 {
          font-size: 2rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #0f172a;
        }
        .legal-doc h2 {
          font-size: 1.4rem;
          font-weight: 600;
          margin-top: 2rem;
          margin-bottom: 0.8rem;
          color: #0f172a;
          padding-top: 0.5rem;
          border-top: 1px solid #e2e8f0;
        }
        .legal-doc h3 {
          font-size: 1.15rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.6rem;
          color: #1e293b;
        }
        .legal-doc h4 {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
          color: #1e293b;
        }
        .legal-doc p {
          font-size: 0.9rem;
          color: #334155;
          margin-bottom: 0.8rem;
        }
        .legal-doc ul, .legal-doc ol {
          font-size: 0.9rem;
          color: #334155;
          margin-bottom: 0.8rem;
          padding-left: 1.5rem;
        }
        .legal-doc li {
          margin-bottom: 0.3rem;
        }
        .legal-doc strong { color: #0f172a; }
        .legal-doc em { color: #475569; }
        .legal-doc a {
          color: #0e7490;
          text-decoration: underline;
        }
        .legal-doc a:hover { color: #155e75; }
        .legal-doc code {
          background: #f1f5f9;
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 0.85em;
          color: #334155;
        }
        .legal-doc pre {
          background: #0f172a;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 8px;
          overflow-x: auto;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }
        .legal-doc pre code {
          background: transparent;
          color: inherit;
          padding: 0;
        }
        .legal-doc blockquote {
          border-left: 4px solid #fbbf24;
          background: #fef3c7;
          color: #78350f;
          padding: 0.8rem 1rem;
          margin: 1rem 0;
          border-radius: 0 6px 6px 0;
        }
        .legal-doc blockquote p {
          color: #78350f;
          font-size: 0.9rem;
          margin-bottom: 0.4rem;
        }
        .legal-doc blockquote p:last-child {
          margin-bottom: 0;
        }
        .legal-doc blockquote strong {
          color: #78350f;
        }
        .legal-doc hr {
          margin: 2rem 0;
          border: none;
          border-top: 1px solid #e2e8f0;
        }
        .legal-doc table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
          margin-bottom: 1.2rem;
        }
        .legal-doc th, .legal-doc td {
          border: 1px solid #e2e8f0;
          padding: 0.5rem 0.75rem;
          text-align: left;
          vertical-align: top;
        }
        .legal-doc th {
          background: #f1f5f9;
          font-weight: 600;
          color: #0f172a;
        }
        .legal-doc td {
          color: #334155;
        }
        .legal-doc input[type="checkbox"] {
          margin-right: 0.5rem;
        }
      `}</style>
    </main>
  );
}
