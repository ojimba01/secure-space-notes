# Switch sign-up email domain back to supportivecm.org

## What changes

New accounts must use an `@supportivecm.org` email address. The old `@comprehensive-carenetwork.com` restriction is replaced, not kept alongside.

1. Sign-up validation on the auth page rejects any address that does not end in `@supportivecm.org`, with the error message naming the new domain.
2. The email field placeholder reads `yourname@supportivecm.org`.
3. The two hidden superadmin accounts (`ojimba01@gmail.com` and `admin@supportivecm.org`) are unaffected — they bypass the restriction as before.

## Existing accounts

Nothing is deleted or renamed. Anyone already signed up with a `@comprehensive-carenetwork.com` address can still sign in; only new sign-ups are affected. If you also want those existing accounts blocked or migrated, that is a separate step — say the word and I will handle it.

## Technical notes

- `src/pages/Auth.tsx`: change `ALLOWED_EMAIL_DOMAIN` from `'@comprehensive-carenetwork.com'` to `'@supportivecm.org'` and update the placeholder on the sign-up email input.
- No database or policy change: the restriction is client-side sign-up validation, matching how it works today.
