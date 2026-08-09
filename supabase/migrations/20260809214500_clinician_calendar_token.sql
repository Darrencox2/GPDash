-- Per-clinician calendar feed tokens.
-- Calendar apps cannot authenticate, so each clinician gets an unguessable
-- token that acts as the credential for their personal ICS feed at
-- /api/v4/calendar/<token>. Idempotent.

alter table clinicians
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists clinicians_calendar_token_idx
  on clinicians (calendar_token);
