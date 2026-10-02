# Scoutmaster

Chrome extension for [ScoutBook+](https://advancements.scouting.org) that helps unit leaders email families about **missing RSVPs** and (experimentally) **outstanding balances**.

It runs only while you are logged into ScoutBook+ in your browser. It uses the same session and APIs the web app uses—no separate credentials are stored in the extension.

## Install (developer / unpacked)

1. Clone this repo.
2. Open `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** and select this folder.
4. Open ScoutBook+ and **refresh the tab** after installing or updating the extension.

## How it behaves (by page)

The popup switches tools based on where you are in ScoutBook+ (including hash routes like `#/unitPaymentLogs`):

| Page | Tool |
|------|------|
| Calendar **event** (`/calendar/event/{id}`) | **RSVP reminders** — scan invitees with no RSVP (`rsvpCode` empty); optional youth-only scan; resolves scout and parent emails when allowed. |
| **Unit Payment Logs** or **Balance Messaging** | **Balance reminders** — scan roster members with balance &gt; $0 (see warning below). |
| Other ScoutBook+ pages | Idle message — navigate to an event or payment screen. |

## Workflow

1. Edit and **save** the email template for that mode (placeholders are filled **per recipient** when sending).
2. Run the appropriate **scan**.
3. **Copy BCC**, **open mail one by one**, or use **send preview** to draft a message to yourself.

Templates support placeholders such as `{{firstName}}`, `{{eventName}}`, `{{eventUrl}}`, `{{balanceFormatted}}`, etc. Sign with your own name as plain text in the template body.

## ⚠️ Balance / payment feature (untested)

The **balance collection** path is a **best-effort, completely untested placeholder**:

- API calls were inferred from the ScoutBook+ front-end bundle, not from a verified spec or HAR on your unit’s payment screens.
- Delinquent logic is currently **balance &gt; $0** on `balanceDetails` merged with unit roster data—this may not match how your troop defines “owes” in the UI.
- Date ranges, permissions, and response shapes may differ by council, unit, or app version.

**Use RSVP mode for production workflows.** Treat balance mode as experimental until you validate results against ScoutBook+ and adjust the code if needed.

## Privacy

- Operates only on `advancements.scouting.org` with your existing login.
- Do not commit HAR files or session exports; they contain live tokens and member PII.

## Development

Manifest V3: `content.js` + page-injected `injected.js` for API calls, `popup.html` / `popup.js` for UI.

Push to GitHub (this repo uses a dedicated SSH key):

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/djrickyb -o IdentitiesOnly=yes' git push
```

## License

Private / troop use unless otherwise noted by the repository owner.
