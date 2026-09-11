# Putting your Case Notes calendar in Outlook, Google or Apple

Your touchpoints and appointments can appear in the calendar you already live
in, so you are reminded by the thing that already buzzes at you.

**It is a copy, not the record.** Your calendar app re-reads the link on its own
schedule and nothing can make it hurry: Google often takes most of a day,
Outlook a few hours, Apple can be set to five minutes. A touchpoint moved this
morning may not shift in Outlook until tonight. Anything that has to be right
now still has to be read in the app.

## Turning it on

Your account → **Calendar subscription** → **Create my calendar link**, then
**Copy link**.

| App | Where |
|---|---|
| Outlook on the web / Microsoft 365 | Calendar → **Add calendar** → **Subscribe from web** → paste |
| Outlook (desktop, classic) | **Account Settings** → **Internet Calendars** → **New** → paste |
| Google Calendar | Left sidebar → **Other calendars** → **+** → **From URL** → paste |
| Apple Calendar (Mac) | **File** → **New Calendar Subscription** → paste. Set *Auto-refresh* to 5 minutes |
| iPhone / iPad | Settings → Calendar → Accounts → **Add Account** → **Other** → **Add Subscribed Calendar** |

## The link is the password

There is no sign-in step, because a calendar app cannot do one. Whoever holds
the link can read your calendar. So:

- **Do not forward it.** Not to a colleague, not into a group chat. It carries
  client names. If someone else needs your calendar, they make their own link.
- **Replace it if it gets out.** One button. The old link dies immediately and
  every calendar subscribed to it stops updating.
- The section shows when your link was last read. A link nobody should have
  being fetched from somewhere is worth replacing.

## What an entry says

An entry names the client: **Touchpoint — Jane Doe (In person)**.

Subscribe with your work account — the agency's Workspace or Microsoft 365 —
and never a personal `gmail.com` or `outlook.com` one. The feed puts client
names into whatever calendar the link is pasted into, so that calendar has to
be one the agency controls.

Closed cases never appear.

## For whoever deploys it

Two parts, in this order:

1. Run `docs/a-calendar-you-can-subscribe-to.sql` (the subscription table and
   the rotate function).
2. Deploy the `calendar-feed` edge function, the same way `sheet-intake` was
   deployed. It is already declared `verify_jwt = false` in
   `supabase/config.toml`, which it has to be: the token in the URL is the
   authentication, and Supabase would otherwise demand a JWT no calendar app
   can send.

Optional: set an `APP_URL` environment variable on the function and each entry
carries a link back to the app.

Until both are done the Account section offers to create a link and says what
went wrong if you try.
