-- What a restart replaced, so an admin can undo it: the round before it, the
-- authorization dates it cleared, and the authorizations it ended. Cleared
-- when the restart is undone.
alter table public.clients add column if not exists restart_undo jsonb;

comment on column public.clients.restart_undo is 'Snapshot taken when a restart began (previous round, cleared authorization columns, authorizations it ended), used to undo it.';
