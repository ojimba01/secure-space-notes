-- Remember where a value on the client record came from.
--
-- Run this BEFORE merging the code that uses it. Idempotent.
--
-- WHY
-- ---
-- Most of what is on a client record was typed in by a person. Some of it is
-- about to be read out of the agency's own archive instead. Those are not the
-- same kind of fact and should not look the same on the screen: a date of
-- birth lifted off an approval letter is only as good as that letter, and the
-- person reading the record is the one who can tell.
--
-- So each field records where it came from, and the record shows it.
--
--   {
--     "date_of_birth": { "from": "document", "at": "2026-08-28T…",
--                        "document_type": "Approval Letter",
--                        "overwrote": "1981-11-22" }
--   }
--
-- A field absent from this object was entered by a person, which is the
-- default and needs no marking. `overwrote` is only present where the import
-- was told to override something already there — client names and
-- authorization dates — so what was displaced is never simply lost.

alter table public.clients
  add column if not exists field_sources jsonb;

comment on column public.clients.field_sources is
  'Per-field provenance: which values were read out of documents rather than entered by a person. Absent key = entered by a person.';

-- Cycles whose billing status came from a billing memo rather than from
-- somebody filing the claim in Availity.
--
-- The agency's memos record which 30-day periods were already billed, for 64
-- clients, and the app has no other record of that. Marking those cycles
-- billed stops the same work being filed twice. But a memo is a note somebody
-- typed, not a receipt from the MCO, so a cycle marked this way stays
-- distinguishable from one a person filed and confirmed — and can be put back.
alter table public.billing_cycles
  add column if not exists billed_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billing_cycles_billed_source_check') then
    alter table public.billing_cycles
      add constraint billing_cycles_billed_source_check
      check (billed_source is null or billed_source in ('billing_memo'));
  end if;
end $$;

comment on column public.billing_cycles.billed_source is
  'billing_memo = marked billed by importing the agency''s billing memo, not by anyone filing the claim. Null = filed in the app, or never billed.';

create index if not exists idx_billing_cycles_billed_source
  on public.billing_cycles (billed_source)
  where billed_source is not null;

-- Verify.
select column_name, data_type from information_schema.columns
 where table_schema='public'
   and ((table_name='clients' and column_name='field_sources')
     or (table_name='billing_cycles' and column_name='billed_source'));
