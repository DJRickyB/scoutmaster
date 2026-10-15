# Scoutmaster

A Chrome extension for [ScoutBook+](https://advancements.scouting.org) that helps unit leaders send reminder emails about **missing or tentative RSVPs** and, experimentally, **outstanding unit balances**.

Scoutmaster is an **unofficial** community tool. It is not affiliated with, endorsed by, or supported by the Boy Scouts of America or ScoutBook+.

## What it does

- Reads event and roster data from ScoutBook+ using **your existing browser session** (no separate login or stored passwords).
- Finds invitees who have not answered **Yes** or **No** (including blank RSVPs and **Maybe**).
- Resolves parent/guardian emails for youths and the member’s own email for adults when ScoutBook+ allows contact.
- Lets you customize subject and body templates with placeholders, then open drafts in your mail client (one at a time or BCC lists).

All processing happens in your browser while you are on ScoutBook+.

## Requirements

- Google Chrome (or another Chromium browser that supports Manifest V3 extensions)
- A ScoutBook+ account with permission to view the event or unit data you are working with
- You must be **logged in** on [advancements.scouting.org](https://advancements.scouting.org)

## Install

Scoutmaster is distributed as source you load as an **unpacked** extension:

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the project folder.
5. Open ScoutBook+ and **refresh the tab** after installing or updating.

## Using Scoutmaster

Click the Scoutmaster icon in the toolbar. The popup shows different tools depending on which ScoutBook+ page is active (including hash routes such as `#/unitPaymentLogs`).

| Where you are in ScoutBook+ | What you can do |
| --- | --- |
| Calendar **event** (`/calendar/event/{id}`) | **RSVP reminders** — scan invitees without a firm Yes/No; optional youth-only scan; emails go to parents/guardians for youths and to the adult member for adults. |
| **Unit Payment Logs** or **Balance Messaging** | **Balance reminders** — scan members with balance &gt; $0 (experimental; see below). |
| Any other ScoutBook+ page | Open an event or payment screen first. |

Typical workflow:

1. Edit the email template for that mode and click **Save**.
2. Run **Scan youths**, **Scan all**, or the balance scan as appropriate.
3. Use **Copy BCC**, **Open mail one by one**, or **Send preview** (draft to yourself) to send from your own email account.

Placeholders such as `{{firstName}}`, `{{eventName}}`, `{{eventUrl}}`, and `{{balanceFormatted}}` are filled **per recipient** when you send. Add your name as plain text in the template body.

### RSVP template placeholders

`{{firstName}}`, `{{lastName}}`, `{{fullName}}`, `{{nickName}}`, `{{email}}`, `{{eventName}}`, `{{eventDate}}`, `{{eventLocation}}`, `{{eventId}}`, `{{eventUrl}}`

### Balance template placeholders

`{{firstName}}`, `{{lastName}}`, `{{fullName}}`, `{{email}}`, `{{unitName}}`, `{{balanceAmount}}`, `{{balanceFormatted}}`

## Balance reminders (experimental)

The balance feature is **best-effort and lightly tested**. It may not match how your unit defines “owes money” in ScoutBook+.

- API usage is inferred from the ScoutBook+ web app, not from a published API specification.
- Delinquent members are currently anyone with **balance &gt; $0** in the merged roster/balance response.
- Councils, units, roles, and app versions can change behavior or permissions.

**Prefer RSVP mode for day-to-day use.** Validate balance scan results against ScoutBook+ before emailing families, and adjust templates or code if your unit needs different rules.

## Privacy and security

- Scoutmaster only runs on `advancements.scouting.org` and related ScoutBook+ API hosts while you use the extension.
- Session tokens stay in your browser’s ScoutBook+ storage, same as the website.
- Email content is composed locally; sending uses your normal mail client.
- Do not publish HAR captures, screenshots of API responses, or exports that contain live tokens or youth/adult PII.

## Contributing

Issues and pull requests are welcome. After cloning, load the folder as an unpacked extension to test changes, bump the version in `manifest.json` when you ship an update, and refresh ScoutBook+ in the browser.

## License

No license file is included yet; treat the repository as all rights reserved unless the owner adds an open-source license.
