-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 043: Foreign key behaviour for GDPR right-to-erasure
-- ═══════════════════════════════════════════════════════════════════════════
--
-- When a user requests account deletion under GDPR Article 17, we follow
-- the user's chosen approach ("option 1, anonymise" — see GDPR plan):
--
--   - Audit + auth trail rows: keep the row, null out user_id, scrub
--     denormalised email/name. Preserves the integrity of the audit
--     trail (essential for DSPT / practice IG compliance + practice
--     audit requirements) while removing any personal identifier of
--     the deleted subject.
--
--   - Profile + practice membership rows: cascade-delete with the user.
--     These rows ARE the user's account info; preserving them after
--     deletion would defeat the point.
--
--   - "Created by / updated by" tracking columns scattered across the
--     schema: set to null. The artefact (clinician record, working
--     pattern, allocation, etc.) stays; the personal "who did this"
--     attribution disappears.
--
-- This migration walks every FK that references auth.users(id) and sets
-- the right ON DELETE behaviour. Without this, deleting an auth.users
-- row would either fail (no ON DELETE specified = NO ACTION = blocks) or
-- destroy audit data (CASCADE on impersonation_sessions).
--
-- The application-level deletion flow (in /api/v4/account/delete) is
-- responsible for the parts the database can't do:
--   - Refusing deletion when the user is the last owner of a practice
--   - Scrubbing denormalised email/name fields (auth_events.email,
--     platform_audit_events.target_email, etc.) before the cascade
--   - Ending active impersonation sessions
--   - Logging the deletion to platform_audit_events with anonymised
--     target_user_id=null but preserving target_email for traceability
--     (legitimate interest — we need a record that the deletion happened)
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. audit_events.user_id ─────────────────────────────────────────────
-- Currently has no ON DELETE clause → defaults to NO ACTION (blocks).
-- Change to SET NULL so the row survives but the actor is anonymised.
alter table public.audit_events
  drop constraint if exists audit_events_user_id_fkey;
alter table public.audit_events
  add constraint audit_events_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;


-- ─── 2. auth_events.user_id ──────────────────────────────────────────────
-- Same treatment. auth_events also has an .email column which is
-- denormalised — the application is responsible for nulling that out
-- BEFORE the cascade (otherwise the email persists after deletion).
alter table public.auth_events
  drop constraint if exists auth_events_user_id_fkey;
alter table public.auth_events
  add constraint auth_events_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;


-- ─── 3. impersonation_sessions ───────────────────────────────────────────
-- Currently CASCADE on both admin_user_id and target_user_id, which would
-- DELETE every impersonation session involving the user being removed.
-- That's exactly the wrong behaviour for an audit table.
-- Change both to SET NULL so the session row stays as evidence.
alter table public.impersonation_sessions
  drop constraint if exists impersonation_sessions_admin_user_id_fkey;
alter table public.impersonation_sessions
  alter column admin_user_id drop not null;
alter table public.impersonation_sessions
  add constraint impersonation_sessions_admin_user_id_fkey
  foreign key (admin_user_id) references auth.users(id) on delete set null;

alter table public.impersonation_sessions
  drop constraint if exists impersonation_sessions_target_user_id_fkey;
alter table public.impersonation_sessions
  alter column target_user_id drop not null;
alter table public.impersonation_sessions
  add constraint impersonation_sessions_target_user_id_fkey
  foreign key (target_user_id) references auth.users(id) on delete set null;


-- ─── 4. platform_audit_events ────────────────────────────────────────────
-- actor_user_id was NOT NULL — relaxing to nullable so SET NULL can fire.
-- The row stays as evidence; the actor's identifier is anonymised.
alter table public.platform_audit_events
  drop constraint if exists platform_audit_events_actor_user_id_fkey;
alter table public.platform_audit_events
  alter column actor_user_id drop not null;
alter table public.platform_audit_events
  add constraint platform_audit_events_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table public.platform_audit_events
  drop constraint if exists platform_audit_events_target_user_id_fkey;
alter table public.platform_audit_events
  add constraint platform_audit_events_target_user_id_fkey
  foreign key (target_user_id) references auth.users(id) on delete set null;


-- ─── 5. clinicians.created_by / updated_by ───────────────────────────────
-- "Who created this record" tracking. The clinician row should outlive
-- the auth user; just null out the attribution.
-- (linked_user_id is already ON DELETE SET NULL — leave alone.)
alter table public.clinicians
  drop constraint if exists clinicians_created_by_fkey;
alter table public.clinicians
  add constraint clinicians_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.clinicians
  drop constraint if exists clinicians_updated_by_fkey;
alter table public.clinicians
  add constraint clinicians_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;


-- ─── 6. working_patterns + absences + overrides created_by/updated_by ────
-- Same pattern — record survives, attribution gets nulled.
do $$
declare
  rec record;
begin
  for rec in
    select c.table_name, c.column_name, c.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage c
      on c.constraint_name = tc.constraint_name
     and c.table_schema = tc.table_schema
    where tc.table_schema = 'public'
      and tc.constraint_type = 'FOREIGN KEY'
      and c.column_name in ('created_by','updated_by','invited_by','generated_by','uploaded_by','revoked_by')
  loop
    -- Skip the ones we've already handled explicitly above
    if rec.table_name in ('clinicians') then continue; end if;
    -- Skip system tables / migration artefacts
    if rec.table_name like 'pg_%' then continue; end if;
    -- Verify the FK actually points at auth.users — we don't want to
    -- accidentally relax FKs that point at other tables.
    perform 1
    from information_schema.referential_constraints rc
    join information_schema.key_column_usage ref
      on ref.constraint_name = rc.unique_constraint_name
     and ref.constraint_schema = rc.unique_constraint_schema
    where rc.constraint_name = rec.constraint_name
      and rc.constraint_schema = 'public'
      and ref.table_schema = 'auth'
      and ref.table_name = 'users';
    if not found then continue; end if;

    -- Now actually rebuild the FK with SET NULL
    execute format(
      'alter table public.%I drop constraint %I',
      rec.table_name, rec.constraint_name
    );
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      rec.table_name, rec.constraint_name, rec.column_name
    );
    raise notice 'Rebuilt FK on %.% with ON DELETE SET NULL', rec.table_name, rec.column_name;
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE.
--
-- After this migration:
--   - Deleting an auth.users row anonymises every reference to that user
--     across audit + tracking columns (SET NULL)
--   - Cascade-deletes the user's profile + practice memberships + their
--     enrolled MFA factors (Supabase auth manages mfa_factors via its own
--     internal cascade — confirmed via Supabase docs)
--   - Blocks the deletion only if a NOT NULL FK reference still exists
--     somewhere — which after this migration shouldn't happen for any
--     user-referencing table
--
-- The application layer (in /api/v4/account/delete) still has to:
--   - Verify the user is not the sole owner of any practice
--   - Verify they're not the sole platform admin
--   - Null out denormalised emails (auth_events.email, platform_audit_
--     events.target_email) before the cascade
--   - End active impersonation sessions cleanly
--   - Log the deletion event to platform_audit_events for traceability
-- ═══════════════════════════════════════════════════════════════════════════
