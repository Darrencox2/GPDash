-- Auto-email invites: trigger on practice_invites INSERT -> pg_net async
-- POST to the send-invite-email Edge Function (deployed 2026-06-18).
-- Applied directly to production during go-live night; recorded here
-- idempotently. Requires Edge Function secrets: RESEND_API_KEY, SITE_URL,
-- FROM_EMAIL, FROM_NAME (set in dashboard, not in SQL).

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_invite_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
begin
  perform net.http_post(
    url := 'https://dvmfgxqqvyoifybwlnky.supabase.co/functions/v1/send-invite-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2bWZneHFxdnlvaWZ5Yndsbmt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MTA0NDksImV4cCI6MjA5MzM4NjQ0OX0.xyTd-uVnHlT56rZWpLBYMBc1mXRz4oOqiHcbLeXWOO0'
    ),
    body := jsonb_build_object('type', 'INSERT', 'table', 'practice_invites', 'schema', 'public', 'record', to_jsonb(NEW))
  );
  return NEW;
end;
$$;

drop trigger if exists on_practice_invite_created on public.practice_invites;
create trigger on_practice_invite_created
  after insert on public.practice_invites
  for each row execute function public.notify_invite_email();
