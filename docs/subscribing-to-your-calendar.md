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

- **Do not forward it.** Not to a colleague, not into a group chat. If someone
  else needs your calendar, they should make their own link.
- **Replace it if it gets out.** One button. The old link dies immediately and
  every calendar subscribed to it stops updating.
- The section shows when your link was last read. A link nobody should have
  being fetched from somewhere is worth replacing.

## Client names are off

By default an entry reads **Touchpoint (In person)** and names nobody. You will
know who it is from the app; the calendar just gets you there.

This is not caution for its own sake. Subscribing means Google's or Microsoft's
servers fetch the feed, and a personal `gmail.com` or `outlook.com` account is
covered by no business associate agreement at all — turning names on would put
client health information somewhere the agency has no agreement covering.

**Only turn names on if you are subscribing with the agency's own Workspace or
Microsoft 365 account,** and only if an administrator has said the BAA covers
it. The switch is in the same section.

Closed cases never appear in the feed, named or not.

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
