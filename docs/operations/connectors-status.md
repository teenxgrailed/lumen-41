# Connectors: what each one needs

Written 2026-10-13, after the owner found that no connector on Connections
worked. Names only; no value is recorded here.

## Why every tile said "Not set up on this server yet."

`GET /api/integrations/catalog` marks a connector `configured` or not, and the
screen refuses to start one that is not.

- Google and Outlook calendars looked in the **environment only**, and Outlook
  looked for `OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_SECRET`, which nothing else
  in the code reads (the real names are `AZURE_AD_*`). A server configured in
  **System settings** (`/admin/system`) therefore reported nothing as set up.
  Fixed: the catalog now uses `getGoogleCredentials()` / `getOutlookCredentials()`,
  the lookup the OAuth start routes use (System settings first, environment
  second).
- Gmail and Outlook Mail were hard-coded as ready. They are now ready exactly
  when the calendar of the same provider is (same OAuth client).
- All 18 Composio apps need `COMPOSIO_API_KEY`. Production does not have it, so
  they are not set up. This is a credential, not a code fault.

Production environment names checked 2026-10-13 (Coolify `list_env_keys`, app
`needt`, names only): present are `NEXTAUTH_URL`, `DATABASE_URL`,
`CREEM_*`, `RESEND_*`, `NEEDT_AI_*` and the like. **Absent:** `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`,
`COMPOSIO_API_KEY`, `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`,
`TODOIST_CLIENT_ID`, `TODOIST_CLIENT_SECRET`. Google and Microsoft may still be
in System settings (stored encrypted in the database); that was **not
checked**. Open `https://use.needt.app/admin/system` to see.

## What a person sees

| Viewer                        | A connector the server cannot start                                              |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Admin                         | The tile is drawn. Connect says what to add: "Notion needs COMPOSIO_API_KEY ..." |
| Everyone else                 | The tile is not drawn (same as sign-in providers without credentials).           |
| Everyone, already connected   | The tile stays, so it can be reconnected or removed.                             |
| Everyone, tile pressed anyway | "Notion isn't available yet."                                                    |

`requires` (the words for an admin) is sent by the catalog route to admins only.

## Per connector

Status: **works** = the code path is complete and covered by tests, given the
credential; **needs credential** = nothing is wrong in code, the server lacks
the credential; **by design** = not a connection.

| Connector                                                                                                                                                                                   | Needs                                                                                                          | Callback to register                                               | Status                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Google Calendar                                                                                                                                                                             | Google OAuth client: System settings, or `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`; Calendar API on          | `<NEXTAUTH_URL>/api/calendar/google`                               | needs credential (not in prod env; System settings unchecked)                                            |
| Gmail (mailbox)                                                                                                                                                                             | Same Google client; Gmail API on; scope `gmail.readonly` only (read-only mail)                                 | `<NEXTAUTH_URL>/api/mail/oauth/google/callback`                    | needs credential, same as above                                                                          |
| Outlook Calendar                                                                                                                                                                            | Microsoft client: System settings, or `AZURE_AD_CLIENT_ID` + `AZURE_AD_CLIENT_SECRET` (+ `AZURE_AD_TENANT_ID`) | `<NEXTAUTH_URL>/api/calendar/outlook`                              | needs credential (catalog read the wrong env names until this change)                                    |
| Outlook Mail (mailbox)                                                                                                                                                                      | Same Microsoft client; Graph `Mail.Read`, `offline_access`                                                     | `<NEXTAUTH_URL>/api/mail/oauth/outlook/callback`                   | needs credential, same as above                                                                          |
| Apple / iCloud                                                                                                                                                                              | Nothing on the server. The person brings an Apple ID and an app-specific password                              | none                                                               | works (CalDAV login; not run against live iCloud in this change)                                         |
| Needt API                                                                                                                                                                                   | Nothing                                                                                                        | none                                                               | its tile opens a sheet: create a personal access token, copy the MCP URL, link to the connector API docs |
| Composio apps (Notion, Google Sheets, Google Drive, Slack, Microsoft Teams, Microsoft Outlook, Todoist, ClickUp, Asana, Linear, GitHub, GitLab, Dropbox, Airtable, Trello, Discord, OpenAI) | `COMPOSIO_API_KEY`; each toolkit enabled in the Composio project (Composio-managed auth is enough)             | Composio calls `<origin>/api/integrations/callback?toolkit=<slug>` | needs credential; code path unverified against the live Composio API                                     |
| Settings → Import → Todoist                                                                                                                                                                 | `TODOIST_CLIENT_ID` + `TODOIST_CLIENT_SECRET`; the `imports` feature flag on                                   | `<origin>/api/imports/todoist/callback`                            | needs credential                                                                                         |
| Settings → Import → Notion                                                                                                                                                                  | `NOTION_CLIENT_ID` + `NOTION_CLIENT_SECRET`; the `imports` feature flag on                                     | `<origin>/api/imports/notion/callback`                             | needs credential                                                                                         |

Gmail and Microsoft Outlook also exist as Composio toolkits. On Connections the
native mailbox card stands for them, so they are not listed twice.

## Fixed in code in this change

- Catalog `configured` for Google and Outlook (System settings, correct env names).
- Mailboxes no longer claim to be ready when the provider is not.
- A Google or Outlook start that the server refuses (calendar or mailbox limit,
  no credentials) shows a notice; before, the page navigated to a raw JSON body.
- The Composio callback no longer marks a toolkit connected when the person
  cancelled (`status=failed`).
- The Apple / iCloud dialog (see CHANGELOG).

## To turn them on (owner)

1. Google: create an OAuth client, add both redirect URIs above, enable the
   Calendar and Gmail APIs, then fill System settings. Takes effect at once for
   the catalog (the catalog reads it per request).
2. Microsoft: register an app, add both redirect URIs, grant the Graph
   permissions, fill System settings.
3. Composio: create a project, copy its API key to `COMPOSIO_API_KEY`
   (production and the worker need a restart to read it).
4. Notion / Todoist importers: create the OAuth apps, set the four variables,
   turn on the `imports` flag.
