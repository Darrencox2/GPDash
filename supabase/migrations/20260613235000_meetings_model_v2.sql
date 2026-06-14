-- ============================================================================
-- Meetings model v2 — first-class action register + agenda contributions
-- ============================================================================
-- Evolves the model toward: (1) a standing cross-meeting action register with
-- real owners and deadlines, and (2) staff-contributed agenda points that move
-- from "proposed" to "confirmed". Additive only — no data migration needed.
--
-- meeting_actions:
--   assignee_user_id  — optionally link an action to a real practice member
--                       (for "my actions" + accountability). assignee_name is
--                       KEPT for people who do not use the app. Link when you
--                       can, free-text otherwise.
--   priority          — light prioritisation for the register view.
--
-- agenda_items:
--   added_by_user_id  — who proposed the item (staff contribution feature).
--   added_by_name     — display fallback.
--   item_status       — 'proposed' (someone suggested it) vs 'confirmed' (on
--                       the agenda). Imported/owner-created items default to
--                       confirmed; staff contributions default to proposed.
-- ============================================================================

-- ─── meeting_actions: real owner + priority ──────────────────────────────
alter table public.meeting_actions
  add column if not exists assignee_user_id uuid references auth.users(id) on delete set null;
alter table public.meeting_actions
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high'));

create index if not exists meeting_actions_assignee_idx
  on public.meeting_actions (assignee_user_id) where assignee_user_id is not null;
-- Register queries hit (practice, status, due_date) constantly.
create index if not exists meeting_actions_register_idx
  on public.meeting_actions (practice_id, status, due_date);

-- ─── agenda_items: contribution provenance + proposed/confirmed ───────────
alter table public.agenda_items
  add column if not exists added_by_user_id uuid references auth.users(id) on delete set null;
alter table public.agenda_items
  add column if not exists added_by_name text check (char_length(added_by_name) <= 120);
alter table public.agenda_items
  add column if not exists item_status text not null default 'confirmed'
    check (item_status in ('proposed', 'confirmed'));
