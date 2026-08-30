-- An authorization number is the number the MCO issued, and nothing else.
--
-- NOT YET APPLIED.
--
-- 126 authorization numbers are stored as "#0024713705". The hash is
-- decoration somebody typed; Availity's Prior Authorization Number field will
-- not take it, so every claim carrying one has to be corrected by hand.
--
-- Letters are NOT decoration. 92 numbers are shaped UM85730060, where the
-- prefix is part of what the MCO issued. Stripping to digits would turn each
-- of those into a different number that no claim will match, which is why this
-- removes a leading hash and nothing else.

update public.client_authorizations
   set authorization_number = btrim(regexp_replace(authorization_number, '^#+\s*', ''))
 where authorization_number ~ '^#';

update public.clients
   set auth_30_number  = btrim(regexp_replace(auth_30_number,  '^#+\s*', '')),
       auth_150_number = btrim(regexp_replace(auth_150_number, '^#+\s*', '')),
       auth_180_number = btrim(regexp_replace(auth_180_number, '^#+\s*', ''))
 where auth_30_number ~ '^#' or auth_150_number ~ '^#' or auth_180_number ~ '^#';

-- Expect: both zero, and letters_kept still around 92.
select
  (select count(*) from public.client_authorizations where authorization_number ~ '^#') as auth_rows_with_hash,
  (select count(*) from public.clients
    where auth_30_number ~ '^#' or auth_150_number ~ '^#' or auth_180_number ~ '^#') as clients_with_hash,
  (select count(*) from public.client_authorizations
    where authorization_number ~ '^[A-Za-z]') as letters_kept;
