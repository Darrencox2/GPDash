// The public buddy board is the only endpoint served without authentication.
// Everything it returns is world-readable, so its response shape is a
// security boundary rather than a formatting detail.
import { test, expect } from '@playwright/test';

// Fields that exist on the authenticated v3 clinician shape and must never
// cross the public boundary. `notes` is labelled "Internal notes about this
// clinician" in the admin panel; `windDown` is a long-term-absence / leaving
// marker; `linkedUserId` is an internal auth uuid.
const MUST_NEVER_LEAK = [
  'notes',
  'windDown',
  'linkedUserId',
  'aliases',
  'roomPreferences',
  'primaryBuddy',
  'secondaryBuddy',
];

test.describe('public buddy endpoint', () => {
  test('unknown slug 404s without leaking whether the practice exists', async ({ request }) => {
    const res = await request.get('/api/v4/public/buddy/definitely-not-a-real-practice');
    expect(res.status()).toBe(404);
    expect((await res.body()).length, '404 should carry no body').toBe(0);
  });

  test('an over-long slug is rejected rather than queried', async ({ request }) => {
    const res = await request.get(`/api/v4/public/buddy/${'x'.repeat(200)}`);
    expect(res.status()).toBe(404);
  });

  test('the public page itself renders for an unknown slug', async ({ page }) => {
    const res = await page.goto('/buddy/definitely-not-a-real-practice');
    expect(res.status()).toBe(404);
  });

  // Data-dependent guard. Set PLAYWRIGHT_PUBLIC_SLUG to a practice that has
  // opted into the public board and this asserts the real payload. Without
  // it there is nothing to inspect, so it skips rather than passing hollowly.
  test('a live public payload carries no internal clinician fields', async ({ request }) => {
    const slug = process.env.PLAYWRIGHT_PUBLIC_SLUG;
    test.skip(!slug, 'set PLAYWRIGHT_PUBLIC_SLUG to a practice with buddy_cover_public = true');

    const res = await request.get(`/api/v4/public/buddy/${slug}`);
    expect(res.status(), 'slug is not public — check buddy_cover_public').toBe(200);

    const json = await res.json();
    expect(Array.isArray(json.clinicians)).toBe(true);

    for (const c of json.clinicians) {
      for (const field of MUST_NEVER_LEAK) {
        expect(c, `clinician ${c.id} leaked '${field}'`).not.toHaveProperty(field);
      }
    }
    // And the fields the board genuinely needs are still there.
    if (json.clinicians.length) {
      expect(json.clinicians[0]).toHaveProperty('initials');
      expect(json.clinicians[0]).toHaveProperty('buddyCover');
    }
  });
});
