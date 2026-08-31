-- A saved signature, and a saved initial, per person.
--
-- NOT YET APPLIED. Run before merging the code that goes with it.
--
-- Staff sign the same forms over and over. Drawing a signature with a mouse
-- every time is both slow and inconsistent, and the signature on a submitted
-- form should look the same each time it is used.
--
-- Each person keeps their own, named, and can hold more than one: a full
-- signature and an initial are different marks, and somebody may keep a formal
-- and an informal version of each.

create table if not exists public.staff_signatures (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  /** What they call it: "Full signature", "Initials", "K.W." */
  label text not null,
  /** 'signature' or 'initial'. What it is, not what it looks like. */
  kind text not null default 'signature' check (kind in ('signature', 'initial')),
  /** Path in the signatures bucket. */
  image_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_signatures_profile_idx
  on public.staff_signatures (profile_id);

alter table public.staff_signatures enable row level security;

-- A signature belongs to the person who made it. Nobody else reads it, and no
-- administrator may sign as somebody else.
drop policy if exists "People manage their own signatures" on public.staff_signatures;
create policy "People manage their own signatures"
  on public.staff_signatures for all
  to authenticated
  using (profile_id = get_profile_id(auth.uid()))
  with check (profile_id = get_profile_id(auth.uid()));

-- The images themselves --------------------------------------------------
insert into storage.buckets (id, name, public)
values ('signatures', 'signatures', false)
on conflict (id) do nothing;

-- Filed under the signer's own auth id, which is what the policies check.
drop policy if exists "People read their own signature images" on storage.objects;
create policy "People read their own signature images"
  on storage.objects for select to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists "People add their own signature images" on storage.objects;
create policy "People add their own signature images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists "People remove their own signature images" on storage.objects;
create policy "People remove their own signature images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (auth.uid())::text);

-- Expect: table 1, policy 1, bucket 1, storage policies 3.
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='staff_signatures') as table_present,
  (select count(*) from pg_policies where schemaname='public' and tablename='staff_signatures') as row_policies,
  (select count(*) from storage.buckets where id='signatures') as bucket_present,
  (select count(*) from pg_policies where schemaname='storage'
     and policyname like 'People %own signature images') as storage_policies;
