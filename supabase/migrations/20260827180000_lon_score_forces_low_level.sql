-- ============================================================
-- A LON score below the High threshold forces Low Level.
--
-- Level of need sets the billing rate ($640 vs $320 per 30-day period) and
-- the touchpoint minimum (4 vs 2). When the two disagree, billing High on a
-- score the form does not support is the direction that carries real risk,
-- so the score wins in that direction and only that direction.
--
-- Two live clients were in exactly that state on 2026-08-27: scores of 17 and
-- 10 sitting at High Level, with six unbilled cycles each at $640. Corrected
-- before anything reached an MCO.
--
-- Deliberately one-way. A score at or above the threshold does NOT promote a
-- client to High: eight clients scored 18+ while marked Low, and the agency
-- chose to leave those alone rather than raise anyone's billing automatically.
-- Under-billing is recoverable; over-billing is not.
--
-- This lives in the database rather than the UI because level_of_need is
-- written from several places -- the client edit screen, the panel that reads
-- a finished LON PDF, and bulk import -- and each would otherwise need its
-- own copy of the rule.
-- ============================================================

-- 1..17 = Low, 18+ = High. Matches the scoring on the LON assessment tool.
create or replace function public.enforce_lon_score_level()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.lon_score is not null
     and new.lon_score < 18
     and new.level_of_need = 'High Level' then
    new.level_of_need := 'Low Level';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_lon_score_level_before_save on public.clients;

-- BEFORE, so the corrected value is what gets stored and what the existing
-- AFTER trigger then rebuilds billing cycles from.
create trigger enforce_lon_score_level_before_save
before insert or update of lon_score, level_of_need on public.clients
for each row execute function public.enforce_lon_score_level();

-- Bring any existing rows into line. Idempotent: re-running changes nothing
-- once the trigger is in place.
update public.clients
set level_of_need = 'Low Level'
where lon_score is not null
  and lon_score < 18
  and level_of_need = 'High Level';
