-- The words a supervisor highlighted in an answer when commenting on it, as
-- Word does: shown highlighted with the comment.
alter table public.form_comments add column if not exists quote text;
