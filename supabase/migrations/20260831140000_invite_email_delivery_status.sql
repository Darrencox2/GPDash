-- Invite email delivery status.
--
-- The UI told admins an invite email was "on its way" the moment the row
-- was inserted. The actual send happens afterwards, asynchronously, in
-- the send-invite-email Edge Function via pg_net - so a rejected address
-- or a provider outage was invisible to everyone, and the admin sat back
-- believing the person had been emailed.
--
-- These columns let the Edge Function report back what really happened,
-- so the pending-invites card can say sent, failed, or still sending,
-- and offer the copyable link when sending did not work.
--
-- email_status: 'pending' until the function reports | 'sent' | 'failed'

alter table public.practice_invites
  add column if not exists email_status text not null default 'pending',
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text,
  add column if not exists email_provider_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'practice_invites_email_status_check'
  ) then
    alter table public.practice_invites
      add constraint practice_invites_email_status_check
      check (email_status in ('pending', 'sent', 'failed'));
  end if;
end $$;

-- Rows that predate this column were sent under the old behaviour and we
-- genuinely do not know their fate. 'unknown' is not an allowed value, so
-- leave them 'pending' but stamp the ones already accepted as sent: the
-- person clearly received their link.
update public.practice_invites
set email_status = 'sent', email_sent_at = coalesce(email_sent_at, invited_at)
where accepted_at is not null and email_status = 'pending';

comment on column public.practice_invites.email_status is
  'pending | sent | failed - written back by the send-invite-email Edge Function';
