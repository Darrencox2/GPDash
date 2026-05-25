// /privacy — public privacy notice. No auth required.
// Content is structured prose; styled to match the marketing surface.
//
// IMPORTANT: this notice is a DRAFT pending legal review. The
// "DRAFT" banner at the top stays visible until removed by the
// reviewer. Once reviewed and signed off, remove the banner block
// (`<DraftBanner />`) and stamp the review date in lib/legal-meta.js
// (created alongside this file).

import Link from 'next/link';
import { LEGAL_META } from '@/lib/legal-meta';

export const metadata = {
  title: 'Privacy Notice · GPDash',
  description: 'How GPDash collects, uses, and protects your personal data.',
};

export default function PrivacyNoticePage() {
  return (
    <main className="min-h-screen px-6 py-10" style={{ background: '#f8fafc', color: '#0f172a' }}>
      <article className="max-w-3xl mx-auto" style={{ lineHeight: 1.65 }}>
        <DraftBanner />

        <header className="mb-8">
          <h1 className="text-3xl font-semibold mb-2" style={{ color: '#0f172a' }}>Privacy Notice</h1>
          <p className="text-sm text-slate-500">
            Last updated: <time dateTime={LEGAL_META.privacyLastUpdated}>{LEGAL_META.privacyLastUpdated}</time>
            {' · '}
            <Link href="/privacy/processors" className="text-cyan-700 hover:underline">Sub-processors</Link>
          </p>
        </header>

        <Section title="Who we are">
          <p>
            GPDash is a practice management dashboard for UK GP practices,
            operated by {LEGAL_META.controllerName}. This notice describes
            how we handle personal data about people who use GPDash — usually
            practice staff (administrators, owners, and clinicians) and our
            platform admins.
          </p>
          <p>
            If you&apos;re a <strong>patient</strong> of a GP practice using
            GPDash: this notice doesn&apos;t describe your data. GPDash
            doesn&apos;t store patient-level information. We hold aggregate
            appointment counts (e.g. &quot;Dr Smith had 12 routine slots on
            Tuesday morning&quot;), not anything that identifies an individual
            patient. Your GP practice is responsible for your patient data
            and has its own privacy notice.
          </p>
          <Contact />
        </Section>

        <Section title="Controller vs processor">
          <p>
            GPDash plays two roles, depending on the data:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1.5">
            <li>
              For your <strong>account</strong> (your email, name, audit log
              of your actions, MFA factors, etc.) we are the{' '}
              <strong>controller</strong>. This notice covers that data.
            </li>
            <li>
              For <strong>operational data uploaded by your practice</strong>{' '}
              (slot counts, working patterns, sync data from TeamNet) we
              are a <strong>processor</strong> acting on the practice&apos;s
              instructions. Your practice is the controller for that data
              and you should refer to their privacy notice for details.
            </li>
          </ul>
        </Section>

        <Section title="What we collect, why, and on what basis">
          <SubSection title="Account information">
            <p>
              When you sign up, we collect your email address, your name,
              and a hashed password (we never see your actual password —
              that&apos;s handled by Supabase Auth). Optionally you also
              choose a role and link yourself to a clinician record.
            </p>
            <Basis>
              <strong>Lawful basis:</strong> (b) Performance of a contract —
              we need this to provide the service you signed up for.
            </Basis>
          </SubSection>

          <SubSection title="Multi-factor authentication">
            <p>
              If you enrol MFA (mandatory for platform admins), we store the
              factor metadata — when you enrolled, the name you gave it, and
              when it was last verified. The TOTP secret itself is held by
              Supabase Auth and is never readable by GPDash application code,
              even to us.
            </p>
            <Basis>
              <strong>Lawful basis:</strong> (b) Contract, (f) Legitimate
              interest in account security.
            </Basis>
          </SubSection>

          <SubSection title="Authentication events">
            <p>
              Every sign-in, sign-out, password change, MFA enrolment, and
              failed sign-in attempt is recorded with the event type, your
              user ID (where known), IP address, user-agent, and timestamp.
            </p>
            <Basis>
              <strong>Lawful basis:</strong> (c) Legal obligation (under the
              UK Data Protection Act and your practice&apos;s DSPT
              requirements), (f) Legitimate interest in detecting and
              investigating unauthorised access.
            </Basis>
          </SubSection>

          <SubSection title="Audit logs">
            <p>
              When you change practice configuration — e.g. updating slot
              filters, adjusting working patterns, removing a member — we
              log what changed, who changed it, when, and (where useful)
              what the value was before and after. This is the audit trail
              your practice can review in Settings.
            </p>
            <p className="mt-2">
              We also keep a platform-level audit log for actions performed
              by GPDash platform admins (suspending users, providing support
              via the impersonation feature, etc.) — including the reason
              given by the admin and a timestamped record of the session.
            </p>
            <Basis>
              <strong>Lawful basis:</strong> (f) Legitimate interest in audit
              and accountability; (c) where the practice has a regulatory
              record-keeping obligation.
            </Basis>
          </SubSection>

          <SubSection title="Practice membership">
            <p>
              We record which practices you belong to and your role within
              each (owner, admin, or user). This is what controls what data
              you can see and edit.
            </p>
            <Basis>
              <strong>Lawful basis:</strong> (b) Contract.
            </Basis>
          </SubSection>

          <SubSection title="Service-operation data">
            <p>
              We keep short-lived rate-limit counters (typically a one-minute
              sliding window) to throttle abusive request patterns; these
              are keyed by your user ID or IP address but contain no content
              beyond a request count. We also collect Content Security
              Policy violation reports from your browser if it ever flags
              one — these don&apos;t include personal identifiers.
            </p>
            <Basis>
              <strong>Lawful basis:</strong> (f) Legitimate interest in
              service availability and security.
            </Basis>
          </SubSection>
        </Section>

        <Section title="Where we don't process">
          <ul className="list-disc pl-6 space-y-1.5">
            <li>We don&apos;t profile you, target ads, or share your data with advertisers — there are no ads in GPDash.</li>
            <li>We don&apos;t sell personal data.</li>
            <li>We don&apos;t use cookies for tracking. The only cookies we set are strictly necessary: an HTTP-only session cookie, a CSRF protection cookie, and (during platform-admin impersonation) a cookie identifying the impersonation session.</li>
            <li>We don&apos;t run any third-party analytics tied to your identity.</li>
            <li>We don&apos;t use your data to train AI models.</li>
          </ul>
        </Section>

        <Section title="Who we share data with">
          <p>
            We work with a small set of <strong>sub-processors</strong> who
            host or operate parts of the service on our behalf. Each is
            bound by a data processing agreement and acts only on our
            instructions. The full list, including the country each
            operates from, is at{' '}
            <Link href="/privacy/processors" className="text-cyan-700 hover:underline font-medium">
              /privacy/processors
            </Link>
            .
          </p>
          <p>
            We don&apos;t share your personal data with anyone else unless
            (a) you ask us to, (b) we&apos;re required by law (e.g. a court
            order, an ICO investigation), or (c) it&apos;s necessary to
            investigate or prevent fraud or a security incident affecting
            users.
          </p>
        </Section>

        <Section title="Where your data is stored">
          <p>
            Account data and audit logs live in a Supabase database hosted
            in London (eu-west-2). The GPDash application runs on Vercel
            with the Frankfurt region as our default. Rate-limit counters
            live on Upstash in an EU region. We do not transfer personal
            data outside the UK / EEA in the normal course of business; if
            that ever changes (e.g. a sub-processor migrates), we&apos;ll
            update this notice and the sub-processor list, and rely on
            UK&nbsp;IDTA / EU&nbsp;SCCs as the transfer mechanism.
          </p>
        </Section>

        <Section title="How long we keep your data">
          <ul className="list-disc pl-6 space-y-1.5">
            <li><strong>Account profile + practice memberships</strong> — for the life of your account. On deletion, removed within seconds.</li>
            <li><strong>MFA factors</strong> — until you remove them, or until account deletion.</li>
            <li><strong>Authentication events</strong> — 1 year for routine events; up to 7 years for events flagged in a security incident investigation.</li>
            <li><strong>In-practice audit log</strong> — 7 years (NHS records retention standard for operational records).</li>
            <li><strong>Platform-level audit log</strong> — 7 years.</li>
            <li><strong>Rate-limit counters</strong> — sliding window of up to 1 hour, automatically evicted.</li>
            <li><strong>CSP violation reports</strong> — 30 days (Vercel log retention).</li>
          </ul>
          <p className="mt-3">
            When you delete your account, the rows containing your personal
            data are <em>deleted</em> for: profile, MFA, practice
            memberships. For <em>audit logs</em>, the row is preserved
            (audit integrity matters) but your user ID is set to NULL and
            denormalised mirrors of your email are removed — so the row no
            longer identifies you. This is sometimes called &quot;pseudonymisation&quot;
            or &quot;anonymisation in place.&quot;
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under UK GDPR you have the following rights. The ones marked
            &quot;built-in&quot; can be exercised yourself in the app; the
            others require you to contact us.
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1.5">
            <li>
              <strong>Access</strong> (Article 15) —{' '}
              <span className="text-emerald-700 font-medium">built-in</span>.
              Account Settings → Data &amp; privacy → Download JSON.
            </li>
            <li>
              <strong>Rectification</strong> (Article 16) —{' '}
              <span className="text-emerald-700 font-medium">built-in</span>.
              Edit your profile in Account Settings.
            </li>
            <li>
              <strong>Erasure</strong> (Article 17) —{' '}
              <span className="text-emerald-700 font-medium">built-in</span>.
              Account Settings → Data &amp; privacy → Delete my account.
            </li>
            <li>
              <strong>Portability</strong> (Article 20) —{' '}
              <span className="text-emerald-700 font-medium">built-in</span>.
              The export above is a machine-readable JSON archive.
            </li>
            <li>
              <strong>Restriction</strong> (Article 18) — contact us.
            </li>
            <li>
              <strong>Object</strong> (Article 21) — contact us.
            </li>
            <li>
              <strong>Withdraw consent</strong> (Article 7) — not applicable;
              we don&apos;t process your personal data on the basis of
              consent.
            </li>
            <li>
              <strong>Complain to a supervisory authority</strong> — the UK
              regulator is the{' '}
              <a
                href="https://ico.org.uk/make-a-complaint/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-700 hover:underline"
              >
                Information Commissioner&apos;s Office (ICO)
              </a>. We&apos;d appreciate the chance to address things first,
              but you don&apos;t have to come to us before complaining to
              the ICO.
            </li>
          </ul>
        </Section>

        <Section title="Security">
          <p>
            We use HTTPS with HSTS preload on all traffic; a strict Content
            Security Policy; per-row Row-Level Security on every database
            table; enforced TOTP MFA for platform admins; per-endpoint rate
            limiting; and an append-only audit trail for every change to
            practice data. The full set of security headers is documented
            in our <a
              href="/.well-known/security.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-700 hover:underline"
            >security.txt</a> file, which also tells security researchers
            how to report vulnerabilities.
          </p>
          <p>
            If we ever detect a personal data breach that&apos;s likely to
            result in risk to your rights and freedoms, we&apos;ll report
            it to the ICO within 72 hours and tell affected users without
            undue delay.
          </p>
        </Section>

        <Section title="Children">
          <p>
            GPDash is for practice staff, not for children. We don&apos;t
            knowingly collect data from anyone under 18.
          </p>
        </Section>

        <Section title="Changes to this notice">
          <p>
            We&apos;ll update this notice as the service evolves. The
            &quot;Last updated&quot; date at the top reflects the latest
            substantive change. For any change that affects your rights or
            how we process your data materially, we&apos;ll let you know
            by email before the change takes effect.
          </p>
        </Section>

        <Section title="Get in touch">
          <Contact />
        </Section>

        <footer className="mt-12 pt-6 text-xs text-slate-500" style={{ borderTop: '1px solid #e2e8f0' }}>
          <p>
            <Link href="/" className="hover:underline">← Back to GPDash</Link>
          </p>
        </footer>
      </article>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helper components — kept here rather than in a separate file because
// this page is the only place they're used and the contents matter as
// much as the layout.
// ─────────────────────────────────────────────────────────────────────

function DraftBanner() {
  if (LEGAL_META.privacyReviewedByLegal) return null;
  return (
    <div
      className="mb-8 px-4 py-3 rounded-lg text-sm"
      style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#78350f' }}
    >
      <div className="font-semibold mb-1">⚠ Draft — pending legal review</div>
      <div className="text-xs leading-relaxed">
        This notice has been drafted by GPDash&apos;s engineering team and
        accurately reflects current processing. It hasn&apos;t yet been
        formally reviewed by a qualified data protection professional. We
        treat it as our binding statement of practice; the legal review will
        formalise the wording.
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3" style={{ color: '#0f172a' }}>{title}</h2>
      <div className="text-sm text-slate-700 space-y-3">{children}</div>
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <div className="mt-4">
      <h3 className="text-base font-medium mb-2" style={{ color: '#1e293b' }}>{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Basis({ children }) {
  return (
    <p className="text-xs px-3 py-2 rounded-md mt-2" style={{ background: '#f1f5f9', color: '#475569' }}>
      {children}
    </p>
  );
}

function Contact() {
  return (
    <div
      className="mt-3 px-4 py-3 rounded-lg text-sm"
      style={{ background: 'white', border: '1px solid #e2e8f0' }}
    >
      <div className="font-medium text-slate-900 mb-1">Contact</div>
      <div className="text-slate-700">
        For any data protection question — including subject access requests
        that you&apos;d rather not handle yourself in-app — email{' '}
        <a href={`mailto:${LEGAL_META.privacyContactEmail}`} className="text-cyan-700 hover:underline font-medium">
          {LEGAL_META.privacyContactEmail}
        </a>.
      </div>
      <div className="text-xs text-slate-500 mt-2">
        Controller: {LEGAL_META.controllerName}
        {LEGAL_META.controllerAddress && <><br/>{LEGAL_META.controllerAddress}</>}
      </div>
    </div>
  );
}
