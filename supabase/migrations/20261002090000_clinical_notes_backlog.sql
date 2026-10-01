-- Backlog notes: a manual-entry note written for one 30-day cycle of a
-- client's authorization. Nothing is created ahead of time; these record which
-- cycle a note was written for, so the cycle list shows what is done.
alter table public.clinical_notes add column if not exists backlog_start date;
alter table public.clinical_notes add column if not exists backlog_cycle integer;
alter table public.clinical_notes add column if not exists backlog_extension boolean not null default false;

create index if not exists clinical_notes_backlog_idx
  on public.clinical_notes (created_by, backlog_start)
  where backlog_start is not null;
