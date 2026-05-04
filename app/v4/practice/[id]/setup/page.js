// /v4/practice/[id]/setup — redirected to the unified Practice page's
// Details tab. Kept as a redirect so old bookmarks / links keep working.

import { redirect } from 'next/navigation';

export default function PracticeSetupRedirect({ params }) {
  redirect(`/v4/practice/${params.id}?tab=details`);
}
