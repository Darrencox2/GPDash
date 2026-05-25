// Legal metadata used by /privacy and /privacy/processors.
// Centralised here so updating one field (e.g. controller name once
// formalised, last-updated date when the policy changes) doesn't require
// editing multiple pages.
//
// PLACEHOLDER FIELDS:
//   controllerName, controllerAddress
//   - Set to the proper legal entity name + registered address once
//     decided. Until then, leaving the engineering-team placeholder is
//     fine for preview but should be filled in before public launch.
//
//   privacyReviewedByLegal
//   - Flip to true after the lawyer's review is complete. That hides
//     the "Draft" banner at the top of /privacy.

export const LEGAL_META = {
  // Identity
  controllerName: 'GPDash (operated by Darren Cox, NHS GP practice administrator)',
  controllerAddress: null, // Set once a registered correspondence address is decided

  // Contact for privacy matters — kept distinct from security@ so subject
  // access requests don't get triaged through the vulnerability inbox.
  privacyContactEmail: 'privacy@gpdash.net',

  // Dates
  privacyLastUpdated: '2026-05-19',
  processorsLastUpdated: '2026-05-19',

  // Status flag — set to true after legal review removes the draft banner
  privacyReviewedByLegal: false,
  reviewedBy: null,       // e.g. 'Smith & Co Solicitors, London'
  reviewedOn: null,       // ISO date

  // Where to send complaints if a user is unhappy with our handling
  supervisoryAuthority: {
    name: "Information Commissioner's Office (ICO)",
    url: 'https://ico.org.uk/make-a-complaint/',
  },
};
