-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 010: rota_notes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Replaces: data.rotaNotes[clinician_id][iso_date] in Redis blob
--
-- Personal notes a clinician leaves for themselves on specific dates of
-- their rota (e.g. "covering 1A this morning", "MDT meeting"). One note
-- per (clinician, date). Visible to all practice members (so a colleague
-- can see "Dr Cox is at MDT this morning") but only the clinician
-- themselves and admins can write.
-- ═══════════════════════════════════════════════════════════════════════════


create table public.rota_notes (
  clinician_id  uuid not null references public.clinicians(id) on delete cascade,
  date          date not null,
  note          text not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),

  primary key (clinician_id, date)
);

create index rota_notes_clinician_date_idx
  on public.rota_notes (clinician_id, date desc);

create trigger rota_notes_set_updated_at
  before update on public.rota_notes
  for each row execute function public.set_updated_at();


-- ─── Row-level security ─────────────────────────────────────────────────
alter table public.rota_notes enable row level security;

-- Members can read all notes for clinicians of their practice
-- (so others can see "Dr Cox: MDT meeting")
create policy rota_notes_select_member
  on public.rota_notes for select
  using (public.clinician_in_my_practice(clinician_id));

-- Self-or-admin can write
create policy rota_notes_insert_self_or_admin
  on public.rota_notes for insert
  with check (
    public.clinician_admin_check(clinician_id)
    or exists (
      select 1 from public.clinicians c
      where c.id = clinician_id and c.linked_user_id = (select auth.uid())
    )
  );

create policy rota_notes_update_self_or_admin
  on public.rota_notes for update
  using (
    public.clinician_admin_check(clinician_id)
    or exists (
      select 1 from public.clinicians c
      where c.id = clinician_id and c.linked_user_id = (select auth.uid())
    )
  );

create policy rota_notes_delete_self_or_admin
  on public.rota_notes for delete
  using (
    public.clinician_admin_check(clinician_id)
    or exists (
      select 1 from public.clinicians c
      where c.id = clinician_id and c.linked_user_id = (select auth.uid())
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE.
-- A clinician (linked to a user) can manage their own notes; admins can
-- override. All members can read so notes are visible team-wide.
-- ═══════════════════════════════════════════════════════════════════════════
