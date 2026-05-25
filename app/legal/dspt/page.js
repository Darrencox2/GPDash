// /legal/dspt — renders the DSPT evidence pack from
// /docs/legal/dspt-evidence.md.

import DocShell, { loadAndRender } from '../_lib/DocShell';

export const metadata = {
  title: 'DSPT evidence pack · GPDash',
  description: 'GPDash technical and organisational controls mapped against the NHS Data Security and Protection Toolkit.',
  robots: { index: false, follow: false },
};

const html = loadAndRender('dspt-evidence.md');

export default function DsptPage() {
  return <DocShell title="DSPT evidence pack" html={html} breadcrumb="DSPT evidence pack" />;
}
