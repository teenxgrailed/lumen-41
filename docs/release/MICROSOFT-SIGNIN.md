# Sign in with Microsoft: setup

Owner decision 2026-11-22: Microsoft sign-in ("Continue with Microsoft"), not Apple. The code is shipped and dormant: the button and the provider appear only when the server has the two credentials below. Nothing here contains a secret; you create them in Azure and put them in Coolify yourself.

Provider id (NextAuth): `azure-ad`. Tenant: `common` (work, school and personal Microsoft accounts).
Portal wording is from memory of the 2026 Entra portal, not re-checked live; if a label differs, the intent is in the step.

If Needt already has an Outlook app registration (the Outlook calendar and mail connection uses one), reuse it: skip step 1, do steps 2 and 4 on that app, and reuse its client ID and secret.

## 1. App registration

1. Open <https://portal.azure.com> and sign in with the account that will own the app.
2. Search **Microsoft Entra ID** (top search bar) and open it.
3. Left menu: **Manage → App registrations**.
4. Click **+ New registration**.
5. **Name**: `Needt` (users see this on the consent screen).
6. **Supported account types**: choose **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**. This is the one that matches tenant `common`. Single tenant breaks sign-in for everyone outside your directory.
7. **Redirect URI (optional)**: platform dropdown **Web**, value exactly:

   ```
   https://use.needt.app/api/auth/callback/azure-ad
   ```

   The last segment is the NextAuth provider id, `azure-ad`. No trailing slash.

8. Click **Register**.
9. On the **Overview** page copy **Application (client) ID**. This is `AZURE_AD_CLIENT_ID` (not a secret, but keep it with the secret).

## 2. Redirect URI (if you skipped it, or to add more)

1. In the app: **Manage → Authentication**.
2. Under **Web → Redirect URIs** the URI above must be listed. Add it with **Add URI** if not, then **Save**.
3. Add a second URI only for local testing, if wanted: `http://localhost:3000/api/auth/callback/azure-ad`.
4. Do not enable "Implicit grant" or "Allow public client flows"; Needt uses the authorization-code flow with a client secret.

## 3. Client secret and its expiry

1. **Manage → Certificates & secrets → Client secrets → + New client secret**.
2. **Description**: `needt-signin`.
3. **Expires**: pick **730 days (24 months)**, the longest the portal offers. Write the expiry date in your calendar now with a reminder 30 days before.
4. Click **Add**.
5. Copy the **Value** column immediately (not **Secret ID**). It is shown once; if you lose it, create a new secret. This is `AZURE_AD_CLIENT_SECRET`.
6. When it expires, Microsoft sign-in silently stops working. Before then: create a new secret, update `AZURE_AD_CLIENT_SECRET` in Coolify, redeploy, then delete the old secret.

## 4. Claims and permissions (both required)

1. **Manage → Token configuration → + Add optional claim**.
2. **Token type: ID**. Tick **email** and **xms_edov**. Click **Add**. If the portal asks to turn on the Microsoft Graph `email` permission, tick the box and confirm.
   Needt takes the email from the ID token and keeps it only when `xms_edov` is true. Without these claims every Microsoft user still signs in, but as a new account with no email, and never joins an existing Needt account by email.
3. **Manage → API permissions**: the delegated Microsoft Graph permissions `openid`, `profile`, `email`, `User.Read` must be there (`User.Read` is added by default). Nothing else is needed for sign-in. Do not add calendar or mail scopes here for sign-in.
4. Ignore "Grant admin consent" for sign-in; these four are user-consentable.

## 5. Publisher verification

Without it, users from other organizations (not personal accounts) may see an "unverified" label, and some organizations block unverified apps. Basic sign-in scopes (`openid`, `profile`, `email`, `User.Read`) still work unverified, so this is not a launch blocker, but do it before promoting Microsoft sign-in.

1. You need a Cloud Partner Program (formerly MPN) account with a verified **Partner One ID**: <https://partner.microsoft.com> → Partner Center. Verification of the organization takes days; start early.
2. In Azure: your app → **Manage → Branding & properties**.
3. Set **Publisher domain** to a domain you own (`needt.app`); verify it if the portal asks (a file or DNS record).
4. In **Branding & properties → Publisher verification**, click **Add Partner One ID to verify publisher**, enter the Partner One ID, **Verify and save**.
5. The account doing this must be an owner of the app and a user in the Partner Center account with the Global Admin or Cloud Application Admin role.
6. Also fill in on the same page: logo (square, at least 215 x 215 px), **Home page URL** `https://needt.app`, **Terms of service URL** and **Privacy statement URL** (the live Needt legal pages).

## 6. Environment variables for Coolify

Set these on the app in Coolify (you do this; the code only reads them). Both are Runtime variables; mark the secret as such.

| Variable                 | Value                                           |
| ------------------------ | ----------------------------------------------- |
| `AZURE_AD_CLIENT_ID`     | Application (client) ID from step 1.9           |
| `AZURE_AD_CLIENT_SECRET` | the secret Value from step 3.5                  |
| `AZURE_AD_TENANT_ID`     | optional; leave unset (it defaults to `common`) |

Set them on the web service and on the worker only if the worker already carries the other sign-in variables. Redeploy the web service so it reads them. With both set, the next page load shows **Continue with Microsoft** under Google; with either missing, nothing is drawn.

Alternative without a deploy: System Settings (`https://use.needt.app/admin/system`) → _Outlook Calendar Integration_ → **Outlook Client ID** and **Outlook Client Secret**. A value there wins over the variable and reaches sign-in within ten minutes.

## 7. Check it

1. Open `https://use.needt.app/auth/signin`: **Continue with Microsoft** is there.
2. Sign in with a personal account (outlook.com) and with a work account. Both land in the app.
3. Error `AADSTS50011` (redirect URI mismatch): compare the URI in step 1.7 character by character.
4. Error `AADSTS700016` / `invalid_client`: wrong client ID or an expired or mistyped secret.
5. Error `AADSTS50194` or similar tenant error: the app is single tenant; fix the supported account types in **Authentication → Supported account types**.

How accounts join: `docs/operations/sign-in-providers.md`.
