-- Rename case_number column to member_id in clients table
ALTER TABLE public.clients RENAME COLUMN case_number TO member_id;