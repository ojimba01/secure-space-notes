# Staging: a fake copy to test against

The production database holds real client health records. There is no second
copy in the cloud, so **testing by clicking around the app used to mean
clicking around real people's charts.** This is the fix.

`supabase start` runs a complete private copy of the whole system on your Mac —
database, sign-in, storage — filled with invented clients. Break it freely.
Nothing in it is real and nothing in it reaches production.

## Day to day

```bash
supabase start     # bring staging up (leave it running)
npm run dev        # the app, pointed at staging automatically
```

Open http://localhost:8081 and sign in:

| Account | Role | Password |
|---|---|---|
| `casemanager@supportivecm.org` | employee | `StagingOnly!2026` |
| `admin@supportivecm.org` | superadmin | `StagingOnly!2026` |

Those passwords are deliberately public. They only work on this machine.

```bash
supabase db reset  # wipe staging and rebuild it exactly as it was
supabase stop      # shut it down (data survives a stop)
colima stop        # release the memory the VM is using
```

`supabase db reset` is the escape hatch. However badly staging gets mangled,
one command puts it back.

## What makes the app point at staging

`.env.local` holds staging's address. Vite loads it after `.env`, so it wins
whenever you run `npm run dev`. It is excluded by `.gitignore`, so it never
leaves this Mac.

**Delete or rename `.env.local` and the dev server points at production
again** — real records, live. That is the only thing standing between the two,
so leave it alone unless you mean it.

## What's in there

Six invented clients, chosen to exercise every branch of the touchpoint queue:

| Client | State | Should show as |
|---|---|---|
| Alpha Testclient | Low level, cycle began 2026-08-20 | Active. Needs 2 per cycle, 1 in person |
| Bravo Testclient | High level, cycle began 2026-08-27 | Active. Needs 4 per cycle, 2 in person |
| Charlie Testclient | Low level, started 2026-05-01 | Cycles before go-live are reference only — never overdue |
| Delta Testclient | No level of need | Invisible to staff; Admin flags it |
| Echo Testclient | HSP not submitted | Invisible to staff; Admin flags it |
| Foxtrot Testclient | No start date | Invisible to staff; Admin flags it |

Delta, Echo and Foxtrot mirror the real gap: of 175 production clients on
2026-08-27, only 15 were complete enough for staff to see, and 119 had no
level of need recorded.

Edit `supabase/seed.sql` to change any of this, then `supabase db reset`.

> **No real client data in `supabase/seed.sql`.** It is committed to a public
> repository. Invented names only — never a real name, member ID, DOB or
> diagnosis.

## Verifying staging still matches production

Staging is rebuilt from `supabase/migrations/`, so it drifts if a migration is
applied to production by hand and never committed. This compares the two:

```sql
select md5(string_agg(sig, E'\n' order by sig)), count(*) from (
  select table_name || '.' || column_name || ':' || data_type as sig
  from information_schema.columns where table_schema = 'public'
) t;
```

Run it on both. On 2026-08-27 both returned
`3f3cb6da5b0a591d45bb775140cbf0f0` across 339 columns. If they ever disagree,
staging is lying to you — find the missing migration before trusting a test.

## First-time setup

Already done on this Mac. For a new machine:

```bash
brew install colima docker supabase/tap/supabase
colima start --cpu 4 --memory 6 --disk 40
supabase start
```

Colima runs the containers. It replaces Docker Desktop and needs no admin
password. `colima start` again after a reboot.
