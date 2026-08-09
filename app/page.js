// / - the site root. The v3 single-tenant page that lived here (one shared
// password, KV-backed) was retired in the 2026-08 spring clean; v4 IS the
// site. Middleware already redirects / to /v4 - this page is the belt to
// that braces for any request that slips past the matcher.

import { redirect } from 'next/navigation';

export default function Root() {
  redirect('/v4');
}
