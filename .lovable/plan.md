

## Auto-extract insurance from member_id (one-time backfill)

Goal: scan every client's `member_id`, fuzzy-detect which of the 5 insurance providers is mentioned, copy it into the `insurance` column (capitalized), and strip it out of `member_id`. Also normalize the dropdown values to uppercase.

### What you'll get

A one-time backfill script run against the database, plus a small UI tweak so the dropdown options match the new canonical casing.

### Matching rules

For each client where `insurance` is empty and `member_id` is set, search `member_id` (case-insensitive) for any of these patterns:

| Canonical value | Matches (case-insensitive, fuzzy) |
|---|---|
| `AETNA` | "aetna", "aet" |
| `HORIZON` | "horizon", "hor", "hbcbs", "horiz" |
| `WELLPOINT` | "wellpoint", "wellpt", "wp", "well point" |
| `UNITED HEALTH` | "united", "uhc", "unitedhealth", "united health", "uh" |
| `FIDELIS` | "fidelis", "fid" |

To avoid false positives on short tokens ("uh", "wp", "hor", "fid", "aet"), short tokens only match when they appear as a standalone word (surrounded by spaces, punctuation, or string boundaries) — not inside a longer alphanumeric run like a real ID number. Longer tokens ("aetna", "horizon", "wellpoint", "united", "fidelis") match anywhere.

When a match is found:
1. Set `insurance = <canonical uppercase value>`.
2. Remove the matched substring from `member_id`, then collapse extra whitespace, hyphens, and separators left behind (e.g., `"AETNA - 12345"` → `"12345"`).
3. If `member_id` becomes empty after stripping, set it to `NULL`.

If no match is found, leave the row untouched.

### Plan of action

1. **Preview first** — run a `SELECT` showing `id`, original `member_id`, detected insurance, and proposed cleaned `member_id` for every row that would change. You review the list before any writes.
2. **Apply backfill** — once you approve, run a single `UPDATE` (via migration) that performs the extraction in SQL using `regexp_match` / `regexp_replace` for each pattern. Only rows where `insurance IS NULL` and a match is found get updated.
3. **Update dropdown casing** — in `src/components/AddClientDialog.tsx` and `src/components/EditClientDialog.tsx`, change `INSURANCE_OPTIONS` from `['Aetna', 'Horizon', 'Wellpoint', 'United Health', 'Fidelis']` to `['AETNA', 'HORIZON', 'WELLPOINT', 'UNITED HEALTH', 'FIDELIS']` so new entries match the backfilled casing.
4. **Display** — `ClientDetails.tsx` already renders `client.insurance` as-is, so uppercase values will show correctly with no further changes.

### Files touched

- New SQL migration: backfill `clients.insurance` and clean `clients.member_id`.
- `src/components/AddClientDialog.tsx` — uppercase `INSURANCE_OPTIONS`.
- `src/components/EditClientDialog.tsx` — uppercase `INSURANCE_OPTIONS`.

### Notes / caveats

- Existing clients who already have `insurance` set will be left alone (no overwrites).
- Matching is conservative — when in doubt, the row is skipped rather than mis-tagged. The preview step lets you catch anything odd before the write.
- The `member_id` cleanup uses regex replace, then trims leading/trailing separators (`-`, `_`, `:`, whitespace).

