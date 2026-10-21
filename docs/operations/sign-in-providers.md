# Sign-in providers: owner setup

Owner decision 2026-10-12. The sign-in and sign-up screens (desktop and
phone) show **Google, Apple and GitHub**; a **More ways to sign in** control
reveals **Microsoft, Sign in with ChatGPT, Discord, X and LinkedIn**. A
provider appears only when every value it needs is filled in; an
unconfigured one is not drawn at all. If none of Google, Apple and GitHub is
configured, the others show directly.

Where the values go: **System Settings** (`https://use.needt.app/admin/system`,
admin only), section _Sign-in providers_ (Google and Microsoft: their own
sections above it, shared with the calendar connections). Secrets are stored
encrypted (`enc:v1`) and the page only ever shows them masked. Environment
variables are a fallback (`.env.example`); a value in System Settings wins.
A change reaches sign-in within ten minutes (the auth handler is rebuilt every
ten minutes), no deploy needed.

Every provider's callback URL has the same shape:

```
https://use.needt.app/api/auth/callback/<id>
```

| Provider             | id         | Callback URL                                       |
| -------------------- | ---------- | -------------------------------------------------- |
| Google               | `google`   | `https://use.needt.app/api/auth/callback/google`   |
| Apple                | `apple`    | `https://use.needt.app/api/auth/callback/apple`    |
| GitHub               | `github`   | `https://use.needt.app/api/auth/callback/github`   |
| Microsoft            | `azure-ad` | `https://use.needt.app/api/auth/callback/azure-ad` |
| Sign in with ChatGPT | `openai`   | `https://use.needt.app/api/auth/callback/openai`   |
| Discord              | `discord`  | `https://use.needt.app/api/auth/callback/discord`  |
| X                    | `twitter`  | `https://use.needt.app/api/auth/callback/twitter`  |
| LinkedIn             | `linkedin` | `https://use.needt.app/api/auth/callback/linkedin` |

## How accounts are joined (read once)

- A provider sign-in joins an existing Needt account **only** when the
  provider vouches that the email is verified and it equals the account's
  email (case ignored): Google and Apple `email_verified`, GitHub's primary
  _and_ verified address from `/user/emails`, Discord's `verified` flag,
  LinkedIn and ChatGPT `email_verified`, and Microsoft `xms_edov` (any
  tenant, personal accounts included: Microsoft documents the plain `email`
  claim as not guaranteed correct).
- Anything else that matches an existing email is refused with "This email
  already belongs to a Needt account. Sign in using the method you used
  before." The person signs in the old way.
- **X never joins an existing account.** X shares no verified email, so an X
  sign-in is always its own account.
- An unverified email is never stored on a new account either.
- Closed registration (`signups_open` off) blocks a new account from every
  provider; people who already have an account still sign in.
- Code: `src/lib/auth/account-linking.ts`, `src/lib/auth/sign-in-providers.ts`.

Scopes are sign-in only. Sign-in never asks for calendar, mail or task access;
those stay in Connections.

---

## Google (main)

Already set up for the calendar connection; sign-in reuses the same client.

1. <https://console.cloud.google.com> → the Needt project → **APIs & Services
   → Credentials** → the existing **OAuth 2.0 Client ID** (type _Web
   application_).
2. **Authorized redirect URIs**: make sure
   `https://use.needt.app/api/auth/callback/google` is listed (next to the
   calendar one, `https://use.needt.app/api/calendar/google`).
3. **OAuth consent screen**: sign-in uses only `openid`, `email`, `profile`
   (non-sensitive). Button: "Continue with Google".
4. System Settings → _Google Calendar Integration_: **Google Client ID**,
   **Google Client Secret** (already filled if calendar works).

Env fallback: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Apple (main)

Needs a paid Apple Developer account. Apple does not allow `localhost`; test
on `use.needt.app`.

1. <https://developer.apple.com/account/resources/identifiers/list> →
   **Identifiers → +** → **App IDs** → _App_ → description "Needt", bundle
   ID e.g. `app.needt` → tick **Sign in with Apple** → Continue → Register.
   (Skip if a Needt App ID exists; just make sure Sign in with Apple is on.)
2. **Identifiers → +** → **Services IDs** → description "Needt", identifier
   e.g. `app.needt.signin` → Register. Open it → tick **Sign in with Apple**
   → **Configure**:
   - Primary App ID: the App ID from step 1
   - Domains and Subdomains: `use.needt.app`
   - Return URLs: `https://use.needt.app/api/auth/callback/apple`
   - Next → Done → Continue → **Save**.
3. **Keys → +** → name "Needt Sign in with Apple" → tick **Sign in with
   Apple** → Configure → Primary App ID from step 1 → Save → Continue →
   Register → **Download** the `.p8` file (Apple lets you download it once)
   and note the **Key ID**.
4. **Team ID**: top right of the developer site, or _Membership details_.
5. System Settings → _Sign-in providers → Apple_:
   - **Services ID** = the identifier from step 2 (`app.needt.signin`)
   - **Team ID**
   - **Key ID**
   - **Private key (.p8 contents)** = open the `.p8` in a text editor and
     paste all of it (the BEGIN/END lines may be included or not).
6. Optional but recommended: people who hide their email get a
   `@privaterelay.appleid.com` address. For Needt's mail to reach them,
   register the sending domain under **Services → Sign in with Apple for
   Email Communication → Configure** (the domain and the from-address Resend
   sends from).

Needt signs the client secret Apple requires (an ES256 JWT) from the key
itself, for 30 days at a time, and re-signs it daily, so the six-month limit
never comes up. Nothing to rotate by hand unless the key is revoked.
Button: "Sign in with Apple", black on light / white on dark, per Apple's HIG.
Scopes: `name email`.

Env fallback: `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`,
`APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (newlines may be written as `\n`).

## GitHub (main)

1. <https://github.com/settings/developers> → **OAuth Apps → New OAuth App**
   (or the organisation's _Settings → Developer settings → OAuth Apps_).
   Use an OAuth App, not a GitHub App.
2. Application name "Needt", Homepage URL `https://needt.app`,
   **Authorization callback URL**
   `https://use.needt.app/api/auth/callback/github` → Register application.
3. Copy the **Client ID**; **Generate a new client secret** and copy it.
4. System Settings → _GitHub_: **Client ID**, **Client secret**.

Scopes requested at sign-in: `read:user user:email` (the second one is what
lets Needt read which address is primary and verified). Button: "Continue
with GitHub".

Env fallback: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.

## Microsoft (More ways)

Already set up for the Outlook connection; sign-in reuses the same app
registration.

1. <https://portal.azure.com> → **Microsoft Entra ID → App registrations** →
   the Needt app.
2. **Authentication → Web → Redirect URIs**: add
   `https://use.needt.app/api/auth/callback/azure-ad` (next to the calendar
   one, `https://use.needt.app/api/calendar/outlook`). Supported account
   types: _any organizational directory and personal Microsoft accounts_;
   tenant `common`.
3. **Token configuration → Add optional claim → ID** → tick `email` and
   `xms_edov` → Add. **Required for an email at all**: Needt reads the
   Microsoft profile from the ID token and keeps the email only when
   `xms_edov` is true. Without it every Microsoft account still signs in,
   but as a new account with no email address (no trial, no mail), and never
   joins an existing Needt account.
4. **API permissions**: sign-in needs only `openid`, `profile`, `email`,
   `User.Read` (delegated). The calendar permissions stay for Connections.
5. System Settings → _Outlook Calendar Integration_: **Outlook Client ID**,
   **Outlook Client Secret**, Tenant ID (empty = `common`).

Sign-in now asks for `openid profile email User.Read` only. It used to ask for
the calendar and task scopes too; those belong to the Outlook connection.
Button: "Sign in with Microsoft".

Env fallback: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`,
`AZURE_AD_TENANT_ID`.

## Sign in with ChatGPT (More ways)

OpenAI offers it to selected partners in a limited trial
(<https://developers.openai.com/siwc/request-client-id>).

1. Fill in the interest form:
   <https://openai.com/form/sign-in-with-chatgpt-interest/>.
2. When OpenAI provisions the client, give them:
   - redirect URI, exact: `https://use.needt.app/api/auth/callback/openai`
   - scopes: `openid profile email` (identity only)
   - client type: **confidential** with `client_secret_basic` preferred; a
     public client (no secret) also works.
3. You receive a **client ID** (starts with `oaiapp_`) and, for a
   confidential client, a **client secret**.
4. System Settings → _Sign in with ChatGPT_: **Client ID**, and **Client
   secret** only if you got one.

Needt uses OpenAI's discovery document
(`https://auth.openai.com/.well-known/openid-configuration`), authorization
code with PKCE, state and nonce, and verifies the ID token. Button: "Sign in
with ChatGPT" (one of OpenAI's four approved labels).
Later option, not requested now: the ChatGPT plan-usage scopes, which would
let a person's AI requests in Needt run on their own ChatGPT plan
(<https://developers.openai.com/siwc/token-sharing-open-source>).

Env fallback: `OPENAI_SIWC_CLIENT_ID`, `OPENAI_SIWC_CLIENT_SECRET`.

## Discord (More ways)

1. <https://discord.com/developers/applications> → **New Application** →
   name "Needt".
2. **OAuth2** → copy **Client ID**; **Reset Secret** → copy **Client
   Secret**.
3. **OAuth2 → Redirects → Add Redirect**:
   `https://use.needt.app/api/auth/callback/discord` → Save Changes.
4. System Settings → _Discord_: **Client ID**, **Client secret**.

Scopes: `identify email`. Button: "Continue with Discord".

Env fallback: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.

## X (More ways)

1. <https://developer.x.com/en/portal/dashboard> → create a Project and an
   App in it (the Free tier is enough for sign-in; unverified).
2. App → **User authentication settings → Set up**:
   - App permissions: **Read**
   - Type of App: **Web App, Automated App or Bot** (confidential client)
   - Callback URI / Redirect URL:
     `https://use.needt.app/api/auth/callback/twitter`
   - Website URL: `https://needt.app`
   - Save.
3. Copy the **OAuth 2.0 Client ID** and **Client Secret** shown after saving
   (Keys and tokens → OAuth 2.0 Client ID and Client Secret; regenerate if
   lost). Not the API Key / API Secret (that is OAuth 1.0a).
4. System Settings → _X_: **OAuth 2.0 Client ID**, **OAuth 2.0 Client
   secret**.

Scopes: `users.read tweet.read` (X's minimum for `/2/users/me`). X gives no
verified email, so an X sign-in always makes its own account. Button: "Sign
in with X".

Env fallback: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`.

## LinkedIn (More ways)

1. <https://www.linkedin.com/developers/apps> → **Create app**: name "Needt",
   LinkedIn Page = the Needt company page (required; a page admin verifies
   the app), logo, privacy policy URL `https://needt.app/privacy`.
2. **Products** → **Sign In with LinkedIn using OpenID Connect** → Request
   access (granted at once).
3. **Auth** → **Authorized redirect URLs for your app** → add
   `https://use.needt.app/api/auth/callback/linkedin`. Copy **Client ID** and
   **Primary Client Secret**.
4. System Settings → _LinkedIn_: **Client ID**, **Client secret**.

Scopes: `openid profile email`. Button: "Sign in with LinkedIn".

Env fallback: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.

---

## Checking a provider

1. Fill the values, wait up to ten minutes.
2. Open `https://use.needt.app/auth/signin` in a private window: the button
   is there (Google/Apple/GitHub directly, the rest under _More ways to sign
   in_).
3. Sign in with a provider account whose verified email matches an existing
   Needt account: it lands in that account. With a different email and
   registration closed: "Needt isn't open for new accounts yet".
4. `redirect_uri_mismatch` or similar from the provider means the callback URL
   in its console differs from the table above (check `https`, the host
   `use.needt.app`, and no trailing slash).

## The iOS app (apps/ios)

The app does not sign in inside its WebView (Google refuses embedded
WebViews, and Sign in with Apple needs the system sheet). Its own screen shows
**Sign in with Apple → Continue with Google → Continue with email**. Apple and
Google open `/auth/signin?provider=<id>` in an `ASWebAuthenticationSession`
(the `NeedtAuth` plugin), the person signs in the normal way, the confirmation
page `/auth/desktop?client=ios` hands a one-time code back as
`needt://auth?code=…`, and the app trades code + PKCE verifier for the session
cookie at `/auth/desktop-complete`. It is the same handoff, endpoints and
guarantees as the desktop app (`src/lib/auth/desktop-handoff.ts`: 60 s, single
use, bound to the user and the challenge). Email stays the web form inside the
app.

Nothing extra to configure for Google. For Apple, the web Services ID above is
the one used: the sheet runs the web flow, so the iOS app id does not need its
own Sign in with Apple credentials. Until the provider is configured the app
still shows the Apple button; pressing it shows "Apple sign-in is not set up
yet. Use Google or email." instead of leaving the app.
