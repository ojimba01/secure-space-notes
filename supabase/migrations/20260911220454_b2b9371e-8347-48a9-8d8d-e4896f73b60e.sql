-- ---------------------------------------------------------------------------
-- 1. Fill the authorization columns from the HSP dates
-- ---------------------------------------------------------------------------
update public.clients
   set auth_150_start = hsp_150_date
 where deleted_at is null
   and auth_150_start is null
   and hsp_150_date is not null;

update public.clients
   set auth_180_start = hsp_180_date
 where deleted_at is null
   and auth_180_start is null
   and hsp_180_date is not null;

-- ---------------------------------------------------------------------------
-- 2. Give each period an authorization record
-- ---------------------------------------------------------------------------
insert into public.client_authorizations
  (client_id, authorization_type, sequence_number, start_date, end_date,
   authorization_number, status, mco, level_of_need, notes)
select c.id,
       'initial_30',
       1,
       c.auth_30_start,
       coalesce(c.auth_30_end, c.auth_30_start + 29),
       c.auth_30_number,
       case when c.auth_30_start > current_date then 'pending'
            when coalesce(c.auth_30_end, c.auth_30_start + 29) < current_date then 'expired'
            else 'active' end,
       c.insurance,
       c.level_of_need,
       'Backfilled from the client record'
  from public.clients c
 where c.deleted_at is null
   and c.auth_30_start is not null
   and not exists (
     select 1 from public.client_authorizations a
      where a.client_id = c.id and a.authorization_type = 'initial_30'
   );

insert into public.client_authorizations
  (client_id, authorization_type, sequence_number, start_date, end_date,
   authorization_number, status, mco, level_of_need, notes)
select c.id,
       'continuation_150',
       1,
       c.auth_150_start,
       coalesce(c.auth_150_end, c.auth_150_start + 149),
       c.auth_150_number,
       case when c.auth_150_start > current_date then 'pending'
            when coalesce(c.auth_150_end, c.auth_150_start + 149) < current_date then 'expired'
            else 'active' end,
       c.insurance,
       c.level_of_need,
       'Backfilled from the HSP 150-day date'
  from public.clients c
 where c.deleted_at is null
   and c.auth_150_start is not null
   and not exists (
     select 1 from public.client_authorizations a
      where a.client_id = c.id and a.authorization_type = 'continuation_150'
   );

insert into public.client_authorizations
  (client_id, authorization_type, sequence_number, start_date, end_date,
   authorization_number, status, mco, level_of_need, notes)
select c.id,
       'reauthorization_180',
       1,
       c.auth_180_start,
       coalesce(c.auth_180_end, c.auth_180_start + 179),
       c.auth_180_number,
       case when c.auth_180_start > current_date then 'pending'
            when coalesce(c.auth_180_end, c.auth_180_start + 179) < current_date then 'expired'
            else 'active' end,
       c.insurance,
       c.level_of_need,
       'Backfilled from the HSP 180-day date'
  from public.clients c
 where c.deleted_at is null
   and c.auth_180_start is not null
   and c.auth_180_approved is true
   and not exists (
     select 1 from public.client_authorizations a
      where a.client_id = c.id and a.authorization_type = 'reauthorization_180'
   );

-- ---------------------------------------------------------------------------
-- Did it land? Expect both zeros.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.clients
    where deleted_at is null
      and ((auth_150_start is null and hsp_150_date is not null)
        or (auth_180_start is null and hsp_180_date is not null)))  as dates_still_unmirrored,

  (select count(*) from public.clients c
    where c.deleted_at is null
      and c.auth_150_start is not null
      and not exists (select 1 from public.client_authorizations a
                       where a.client_id = c.id
                         and a.authorization_type = 'continuation_150')) as periods_still_unrecorded;