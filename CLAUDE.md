# Working on Clinical Notes

## Keep the Help guide in step with the app

Every change that affects what staff see or do must update the Help guide in
the same change. That includes renamed buttons, moved screens, new features
and removed ones.

- **Text:** `src/lib/helpGuides.ts` holds every guide. Update the steps and
  button names that the change affects. Add a guide for a new task, and remove
  the guide for a removed one. Use `audience: 'admins'` for anything only
  admins can do.
- **Screenshots:** `scripts/help-screenshots/capture.mjs` has one entry per
  step (same guide id, same number of steps). Update the entries for any
  screen that changed, then retake them:
  1. `npx vite --config scripts/help-screenshots/vite.config.ts` (the app over
     made-up data on port 5198; nothing touches the real database)
  2. `node scripts/help-screenshots/capture.mjs <guide ids>` (or no ids to
     retake them all)
  3. Look at the new images in `public/help/` before committing. The red ring
     must sit on the right control.
- New sample data for screenshots goes in `scripts/help-screenshots/mock/seed.ts`.
  Use made-up names only, never real clients or staff.

Who sees which guides: case managers see `everyone` guides, admins see all
guides, and superadmins also get the filter buttons.

## Clinical notes

- Notes are written from the case manager's selections only
  (`src/lib/clinicalNotes`). Never add wording that states a fact nobody
  selected (mood, cooperation, outcomes, names). `tests/clinical-notes.test.mjs`
  checks this; extend it with any new topic or option.
- The optional AI rewording (`supabase/functions/clinical-note-wording`) runs
  only when `ANTHROPIC_API_KEY` is set, and must stay under a HIPAA BAA. It
  rewords the app's draft and is rejected if it adds a name, number or date.

## Other conventions

- UI text is short, standard, professional UI language.
- Superadmins are not case managers: they never appear in staff lists or as
  assignable case managers.
- Database changes: give the full SQL so it can be pasted into Lovable.
