# Pinterest (moodboard import)

Pro feature. A person connects Pinterest (read-only), picks one of their boards,
and its Pins are copied onto a moodboard as pictures that keep a link back to
the Pin. "Keep in sync" lets the worker add new Pins once a day; it only
appends and never removes or edits anything on the Needt board.

## What the owner registers

1. Pinterest **business** account (the account that administers the app), email
   verified. https://developers.pinterest.com/docs/getting-started/connect-app/
2. https://developers.pinterest.com/apps/ -> accept the Developer Terms ->
   **Connect app**. The app name needs 3+ Latin letters/digits and must not
   contain "Pinterest". Request **Trial access**; Pinterest reviews each
   business day and emails the result.
3. On the app's **Configure** tab add the redirect URI. It must match exactly
   and must not itself redirect:

   ```
   https://<APP ORIGIN>/api/pinterest/callback
   ```

   `<APP ORIGIN>` is `NEXTAUTH_URL` (production: the public Needt origin). Add a
   second entry for local development: `http://localhost:3000/api/pinterest/callback`.

4. Copy the **App ID** and **App secret** into the server environment (web and
   worker), then redeploy:

   ```
   PINTEREST_CLIENT_ID=<App ID>
   PINTEREST_CLIENT_SECRET=<App secret>
   ```

   Without both, the Connections tile is hidden from everyone but admins (who
   see "needs PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET") and the Add menu
   row is hidden/disabled the same way. Credentials are environment-only; they
   are not in System settings (unlike Google/Outlook).

## Scopes

`boards:read,pins:read` only (public boards and Pins). Secret boards would need
`boards:read_secret` / `pins:read_secret`; they are not requested.

## Limits that matter

- **Trial access is 1,000 API calls per day for the whole app**, shared by all
  users (`rate-limits`). Standard access is 1,000/minute/user. The daily sync
  spends one call per synced board (first page of 50 Pins) plus token
  refreshes, and the pass stops at 200 calls or on the first HTTP 429.
- Tokens: access token 30 days; **continuous refresh token** 60 days, renewed on
  each refresh (apps created on/after 2025-09-25 always use it). If Pinterest
  revokes or the refresh token lapses, the connection is marked "needs
  reconnect", sync pauses, and the Connections tile shows "Needs attention".
- **Apps registered on or after 2026-09-14** may get HTTP 403
  `PINNER_DATA_ACCESS_DENIED` when reading boards/Pins of **non-business**
  accounts until Pinterest authorizes the app for that ("changelog"). The UI
  shows "Pinterest has not approved this app to read your boards yet."
  Remedy: ask Pinterest (your account manager / the developer support form) for
  the board/Pin read authorization, or apply for Standard access.
- Moving past Trial: Standard access needs a screen recording of the OAuth flow
  completing an action, and compliance with the Developer Guidelines
  (`access-tiers`). Trial-access apps can read boards and Pins; they cannot be
  used by the public at scale.

## Where things are

| What                | Where                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| API client, tokens  | `src/services/pinterest/client.ts`, `connection.ts`                                                                               |
| Import + daily sync | `src/services/pinterest/import.ts` (called from the worker's hourly lifecycle pass in `src/worker/index.ts`)                      |
| Routes              | `/api/pinterest/{status,authorize,callback,boards,disconnect}`, `/api/moodboards/:id/pinterest` (POST import, PATCH keep-in-sync) |
| Storage             | `PinterestConnection` (tokens `enc:v1`), `Moodboard.pinterest*` columns                                                           |
| Pictures            | `safeDownload` from `pinimg.com` only, https, public IPs, the moodboard picture limit (1.5 MB) and sniffed type                   |

## Sources

- https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
- https://developers.pinterest.com/docs/getting-started/connect-app/
- https://developers.pinterest.com/docs/key-concepts/access-tiers/
- https://developers.pinterest.com/docs/reference/rate-limits/
- https://developers.pinterest.com/docs/changelog/changelog/#pinner-data-access-denial-error
