// /legal/dpa — renders the DPA template from /docs/legal/dpa-template.md.

import DocShell, { loadAndRender } from '../_lib/DocShell';

export const metadata = {
  title: 'Data Processing Agreement · GPDash',
  description: 'GPDash UK GDPR Article 28 data processing agreement template.',
  robots: { index: false, follow: false },
};

const html = loadAndRender('dpa-template.md');

export default function DpaPage() {
  return <DocShell title="Data Processing Agreement" html={html} breadcrumb="DPA template" />;
}
