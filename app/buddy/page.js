// /buddy — landing for the multi-tenant buddy cover URL space.
//
// The v3-era /buddy page was a single-tenant public view tied to Winscombe.
// In v4 the per-practice URL is /buddy/<slug>, so this page is now just a
// "not found" landing (since a bare /buddy with no slug doesn't identify
// a practice). When v3 is retired and gpdash.net/buddy historically points
// at Winscombe, this can be turned into a redirect to /buddy/wbfp.

import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Buddy cover · GPDash',
  robots: { index: false, follow: false },
};

export default function BuddyLanding() {
  notFound();
}
