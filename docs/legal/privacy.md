# Needt Privacy Notice

Last updated: [[CHECK: publication date]] · Effective: [[CHECK: effective date, on or after publication]]

This notice explains what personal data Needt collects, why, who else handles it, how long it is kept, and what rights you have. It covers the Needt app at **use.needt.app**, the website and waitlist at **needt.app**, and the Needt personal API and webhooks.

If anything here is unclear, write to **privacy@needt.app**.

---

## 1. Who we are

Needt is run by an individual:

- **Controller:** Maksym A. [[CHECK: GDPR Art. 13(1)(a) and Creem's review usually expect the controller's full legal name and, if trading as a Ukrainian sole proprietor (FOP), that status and registration number.]]
- **Country:** Ukraine
- **Privacy and legal requests:** privacy@needt.app
- **Support:** support@needt.app
- **Postal address:** on request to privacy@needt.app [[CHECK: whether an address on request satisfies GDPR Art. 13, or a business address must be published.]]

"Needt", "we" and "us" mean the operator above. "You" means anyone who uses Needt or joins the waitlist.

### EU representative (GDPR Article 27)

We are established outside the European Union and offer Needt to people in it, so we appoint a representative in the EU. You can contact them instead of us about anything in this notice.

> **[[CHECK: EU REPRESENTATIVE — DataRep. Complete once the agreement is signed.]]**
>
> - Name: DataRep [[CHECK: exact legal entity name from the signed agreement]]
> - Address: [[CHECK: postal address for Needt requests]]
> - Contact: [[CHECK: email address or web form DataRep assigns to Needt]]

---

## 2. The short version

- Needt keeps the things you put in it, and copies of the calendars, task lists and mailboxes you choose to connect, in **our own database on a server in Finland (EU)**.
- We do not sell your data, we show no ads, and we use no advertising, analytics or tracking cookies.
- When you use the AI assistant, the text needed to answer your request is sent to an AI provider through OpenRouter, restricted to hosts in the US and EU that do not keep or train on it (Section 6).
- Payments are handled by **Creem** as merchant of record. We never see your card number.
- You can export your data and delete your account from Settings. Deletion takes effect after a 7-day grace period.

---

## 3. What we collect

### 3.1 Your account

- Name, email address, profile picture if your sign-in provider gives us one, and the colour and initials you choose.
- If you sign up with email and password: your password, stored only as a bcrypt hash.
- If you sign in with Google or Microsoft: your account identifier there and the sign-in tokens it issues.
- When you confirmed your email, when you last signed in, and short-lived records used to re-check your identity before sensitive actions such as deleting your account.
- Your plan (Free, Pro trial, Pro or Lifetime), its status and dates.

### 3.2 What you create in Needt

Everything you put in, so we can show it back to you: tasks and subtasks, projects, boards, saved views, tags, events you create, documents and databases (Pages), comments, page revisions, uploaded files and images, forms and their responses, moodboards, habits and their completions, focus sessions and time entries, work hours, scheduling and energy preferences, reminders, booking pages, and your settings. Uploaded files are stored in our database, not with a separate storage provider.

In a **shared workspace**, the other members can see and edit what you put there and see your name and avatar. If you **publish** a page, anyone with its link can read it.

### 3.3 Accounts you connect

Needt connects to another service only when you ask it to.

| You connect                             | What Needt stores                                                                                                                                         | What Needt does there                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Google Calendar                         | Your Google email, OAuth tokens, your calendars and their events (title, time, location, description, attendees, as Google provides them)                 | Reads your calendars; creates, changes and deletes events you manage through Needt                                             |
| Outlook / Microsoft 365 calendar, To Do | Your Microsoft email, OAuth tokens, calendars, events, task lists and tasks                                                                               | Reads them; creates, changes and deletes events and tasks you manage through Needt                                             |
| CalDAV or iCloud calendar               | Server address, username, the app-specific password you give us, calendars and events                                                                     | Reads and writes events                                                                                                        |
| Gmail                                   | Your address, OAuth tokens, and for each synced message: sender, recipients, subject, preview, date, labels, read and archive state, and the message body | Reads messages; marks them read or unread and archives them **at Google** when you do so in Needt. Never sends or deletes mail |
| Outlook mail                            | The same fields as Gmail                                                                                                                                  | The same as Gmail                                                                                                              |
| IMAP mail                               | Server settings, your credentials (encrypted), and the same message fields                                                                                | Reads messages; sets read or unread                                                                                            |
| Other tools through Composio            | Which tool you connected and the connection's identifier. The connection itself is held by Composio                                                       | Only the actions you, or the assistant on your request, run                                                                    |

You can disconnect each of these in Settings. Disconnecting stops syncing. [[CHECK: verify what disconnecting a single calendar account removes; `CalendarFeed.account` has no `onDelete`, so copied events may outlive the connection.]]

### 3.4 AI assistant

- Your conversations with the assistant, including its replies and the actions it proposed or took.
- **Memories**: short notes the assistant keeps about your preferences. You can see and delete them in Settings.
- A monthly count of AI actions and tokens used, to keep the service affordable.
- If you add your own AI provider key (Anthropic, OpenAI, xAI, Z.ai or a custom endpoint) or connect an AI account by OAuth, we store the key or token encrypted.

### 3.5 Personal API and webhooks

- If you create a personal API token, we store only a hash of it and a short preview so you can recognise it.
- If you set a webhook URL, we store it and send the events you chose to it.

### 3.6 Payments

Creem collects your payment details, billing name, address and tax information under its own privacy policy. From Creem we receive a customer ID, a subscription ID, the product, amount, billing interval, status, period end, and payment, refund and dispute events. We never receive your card number.

### 3.7 Trial

To give each person one 14-day Pro trial, we store a keyed hash of a normalised form of the email address that started it (lower case; for Gmail, without dots and "+" suffixes), the trial dates, and whether the day-11 and day-14 emails were sent. The hash cannot be turned back into your address. **We keep this record after you delete your account**, so the same address cannot start a second trial. [[CHECK: true only once PR #106 is merged and its backfill has run; on main today the normalised email is stored readable.]] [[CHECK: retention period for trial records, e.g. 24 months.]]

### 3.8 Waitlist

If you join the waitlist on needt.app, we store your email address, a referral code we generate, the referral code you arrived with, your place in the queue, and when you joined. We do not send a confirmation email.

### 3.9 Bookings and forms

If you book time with a Needt user through their booking page, we store your name, email, the time you chose and your time zone, and email you a confirmation. If you fill in a form a Needt user published, we store your answers for them. The Needt user decides how to use your booking or answers; we process them on that user's behalf.

### 3.10 Bug reports and support

If you send a bug report from inside Needt, we store what you wrote, any file you attach, and diagnostics (page, app version, screen size, theme, browser). The text of the report, not the attachments, is copied into an issue in our private GitHub issue tracker so we can track the fix. [[CHECK: set `GITHUB_BUG_REPORT_REPO` in production to a private repository; the code default `teenxgrails/needt` is public (issues are currently disabled there, so sync fails).]] If you email us, the conversation stays in our mailbox.

### 3.11 Technical data

- **Abuse protection.** We count requests per IP address and per account to limit abuse such as password guessing. These identifiers are stored only as keyed hashes, and the counters expire within minutes to hours.
- **Application logs.** Our servers log errors and events. Logs are kept for 3 to 30 days depending on severity.
- **Error monitoring.** When something breaks, an error report goes to Sentry. Reports are filtered before they leave: request bodies, local variables and breadcrumbs are removed, and Sentry's collection of personal data is turned off. [[CHECK: in Sentry project settings, "Prevent Storing of IP Addresses" is on, and which region (US or EU) the project uses.]]
- **Browser notifications.** If you allow notifications, we store your browser's push subscription (an endpoint address and keys) and its user-agent string.
- **Server access logs** kept by our reverse proxy may contain your IP address and browser user-agent. [[CHECK: retention of proxy and container logs on the Coolify host.]]

There is no analytics or tracking script in the app.

---

## 4. Why we use your data, and on what legal basis

| Purpose                                                                                                     | Legal basis (GDPR)                                                   |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Create and run your account; sign you in and keep you signed in                                             | Contract (Art. 6(1)(b))                                              |
| Store, sync and show your content and connected accounts; run auto-scheduling, reminders and focus features | Contract                                                             |
| Answer your requests to the AI assistant; keep Memories                                                     | Contract                                                             |
| Sell and manage paid plans; run trials; handle refunds and chargebacks                                      | Contract; legal obligation for accounting records                    |
| Allow one trial per person                                                                                  | Legitimate interest in keeping the trial available to everyone       |
| Service email: confirmation, password reset, export ready, trial ending, reminders, booking confirmations   | Contract                                                             |
| Push notifications                                                                                          | Consent, which you give in your browser and can withdraw in Settings |
| Security: rate limits, re-authentication, logs, error monitoring                                            | Legitimate interest in a secure and working service                  |
| Fix bugs you report                                                                                         | Legitimate interest; contract                                        |
| Run the waitlist and invite you                                                                             | Consent; you can withdraw it at any time                             |
| Comply with the law and defend legal claims                                                                 | Legal obligation; legitimate interest                                |

Under Ukraine's Law "On Personal Data Protection" the corresponding grounds are performance of a contract, legitimate interest, consent and legal obligation.

We make no automated decisions that have legal or similarly significant effects on you (GDPR Art. 22). Auto-scheduling and AI suggestions only arrange your own calendar and tasks, and you can change or undo them.

---

## 5. Google user data (Limited Use)

Needt's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

**What Needt asks Google for.** Each set is requested only when you start that connection:

| When you                | Scopes requested                                                                                                                                   | Why                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Sign in with Google     | `openid`, `email`, `profile`                                                                                                                       | To create and sign in to your account                                                                    |
| Connect Google Calendar | `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/userinfo.email`    | To list your calendars, sync their events, and create or change the events you manage in Needt           |
| Connect Gmail           | `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/userinfo.email` | To show your mail in Needt, and to mark messages read or unread and archive them when you do so in Needt |

Needt does not request Google Tasks access.

**How we use it.**

- Only to provide the features you can see in Needt: showing and syncing your calendar and mail, scheduling around your events, turning an email into a task, and letting the AI assistant answer questions about them when you ask.
- We transfer it only as needed to provide those features (for example to the AI provider handling your request, Section 6), to comply with the law, for security, or in a merger or acquisition with notice to you.
- We do not use it for advertising, and we do not sell it.
- We do not use it to train or improve general AI or machine-learning models, and the AI routing we use excludes providers that would.
- No person at Needt reads it unless you ask us to for a specific item, it is needed for security or to comply with the law, or it has been aggregated and anonymised for internal operations.

[[CHECK: `gmail.readonly` and `gmail.modify` are restricted scopes; Google requires OAuth verification and an annual CASA security assessment before the public can connect Gmail. Confirm status before publishing.]]

---

## 6. AI features

### 6.1 What is sent

When you use the assistant or another AI feature (daily briefing, brain-dump parsing, page suggestions), Needt sends the AI provider:

- your message and the conversation so far;
- a summary of today's tasks (titles, scheduled times, durations, deadlines), your work hours and scheduling preferences, and your saved Memories;
- and, only when the request needs it, what the assistant looks up for you through its tools: matching tasks and projects, pages, focus statistics, your settings, and **email messages** (sender, subject and text) when you ask it about your mail.

The assistant can create, change or delete tasks and other items for you. Destructive or bulk actions ask for your confirmation first.

Auto-scheduling, which decides where tasks fit in your calendar, runs on our own servers and does not use an AI provider.

### 6.2 Who processes it

- **Needt's included AI.** Requests go through **OpenRouter** (United States), an AI gateway, to the model we choose. We configure OpenRouter to route only to model hosts based in the United States or the European Union, and only to hosts that **do not retain or train on prompts** (`data_collection: deny`). [[CHECK: the US/EU host restriction ships in PR #106; on main only `data_collection: deny` is applied. Also confirm production `NEEDT_AI_BASE_URL` is OpenRouter: `.env.example` points to `api.deepseek.com`, which would bypass this routing entirely.]]
- **Your own AI key.** If you add your own key for Anthropic, OpenAI, xAI, Z.ai or a custom endpoint, your requests go to that provider under **your** agreement with them, and their terms decide how they handle the data.

### 6.3 Accuracy

AI output can be wrong, incomplete or out of date. Check anything important before you rely on it. See the Terms of Service.

---

## 7. Who receives your data

We share personal data only with the service providers we need to run Needt, and only what each one needs. We do not sell personal data or share it for advertising.

### 7.1 Our service providers (processors)

| Provider                                  | What for                                                                            | What they receive                                                                     | Where                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Hetzner Online GmbH                       | Server running the app, background worker, collaboration server, database and Redis | Everything stored in Needt                                                            | Helsinki, Finland (EU) [[CHECK: owner to confirm; not recorded in the repository's docs]] |
| Cloudflare, Inc.                          | DNS for our domains; R2 storage for encrypted database backups                      | Database backups                                                                      | [[CHECK: R2 bucket `needt-prod-backups` location or jurisdiction]]                        |
| Creem                                     | Merchant of record: checkout, payment, tax, invoices, billing portal                | Name, email, billing details, purchase and subscription records                       | [[CHECK: Creem legal entity and country]]                                                 |
| Resend                                    | Sending service email                                                               | Your email address and the email content (may include task titles or booking details) | United States [[CHECK: sending region]]                                                   |
| Functional Software, Inc. (Sentry)        | Error monitoring                                                                    | Filtered error reports (Section 3.11)                                                 | [[CHECK: US or EU region]]                                                                |
| OpenRouter, Inc.                          | Gateway for the included AI                                                         | What Section 6.1 lists                                                                | United States                                                                             |
| AI model hosts reached through OpenRouter | Running the model                                                                   | The same, processed transiently                                                       | United States or EU (Section 6.2)                                                         |
| Composio, Inc.                            | Connections to other tools, only if you connect one through it                      | Your Needt user ID, the tool connected, and the data passed in actions you run        | United States                                                                             |
| GitHub, Inc.                              | Issue tracker for bug reports                                                       | The text of bug reports and their diagnostics, not attachments                        | United States                                                                             |
| Google LLC (Google Fonts)                 | Fonts for the app's pages                                                           | Your IP address and browser details, when your browser downloads the fonts            | United States                                                                             |
| Zoho Corporation (Zoho Mail)              | Our support and privacy mailboxes                                                   | Whatever you write to us                                                              | EU data centre                                                                            |

### 7.2 Services you connect yourself

Google, Microsoft, Apple iCloud, your CalDAV server and your mail provider are not our processors. When you connect them, Needt exchanges data with them on your instruction, and you have your own agreement with each. The same applies to an AI provider whose key you add, and to the push service your browser uses (Google, Mozilla or Apple) to deliver notifications if you turn them on; notification content is encrypted for your browser.

### 7.3 Others

- **People you choose:** workspace members, people you share a page or moodboard with, anyone you give a published-page link to, and the webhook URLs and API clients you configure.
- **When the law requires it**, after we check that the request is lawful, or to protect someone's safety or the security of Needt.
- **In a sale or reorganisation** of Needt, in which case the new operator must honour this notice and we will tell you in advance.

---

## 8. How long we keep data

| Data                                       | How long                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Your account and content                   | Until you delete it or your account                                                                                                                                                                          |
| Copies of connected calendars, tasks, mail | While the connection exists; deleted with your account                                                                                                                                                       |
| AI conversations and Memories              | Until you delete them or your account                                                                                                                                                                        |
| Data export archive                        | 24 hours after it is ready                                                                                                                                                                                   |
| Database backups                           | Daily backups for 14 days, weekly backups for 8 weeks. Deleted data leaves the backups when they expire                                                                                                      |
| Application logs                           | 3 to 30 days depending on severity                                                                                                                                                                           |
| Rate-limit counters                        | Minutes to hours                                                                                                                                                                                             |
| Trial record                               | After account deletion, as a hash only (Section 3.7) [[CHECK: period]]                                                                                                                                       |
| Billing records                            | Creem keeps invoices and tax records as the law requires. We keep plan history while your account exists [[CHECK: whether Ukrainian tax law requires the operator to keep income records, and for how long]] |
| Waitlist entry                             | Until you create an account, ask us to remove it, or we close the waitlist [[CHECK: maximum period]]                                                                                                         |
| Bug reports                                | Deleted from our database with your account. Copies in the GitHub issue tracker are not deleted automatically [[CHECK: period]]                                                                              |
| Support email                              | [[CHECK: period, e.g. 2 years]]                                                                                                                                                                              |

**What account deletion does.** You request deletion in Settings after signing in again. For 7 days you can cancel. When the 7 days end, we cancel any active Pro subscription, revoke Needt's access at Google and remove your Composio connections, and then delete your personal workspace and everything in it, your connected accounts and their synced data, mail, AI conversations and Memories, tokens, settings, push subscriptions, any waitlist entry for your email, and log lines that mention you. Content you wrote in a **shared** workspace that others still use is anonymised: it is renamed, emptied and unlinked from you, so the workspace keeps its structure. Published links to your pages stop working. [[CHECK: revoking Google access and removing Composio connections on deletion ships in PR #106; on main only the local copies are deleted.]]

---

## 9. International transfers

Our server and database are in the **EU (Finland)**. Some providers in Section 7 are in the **United States**. Where data goes to a country without an EU adequacy decision, we rely on the provider's certification under the EU-US Data Privacy Framework where it has one, or on the European Commission's Standard Contractual Clauses in the provider's data-processing terms. [[CHECK: for each US provider, DPF certification or SCCs in its DPA.]]

Needt is operated from **Ukraine**, for which the European Commission has not adopted an adequacy decision. When we access the EU-hosted data from Ukraine, we do so as the controller, directly subject to the GDPR. [[CHECK: lawyer to confirm this description of the controller's own access from Ukraine.]]

You can ask privacy@needt.app for a copy of the safeguards that apply to a transfer.

---

## 10. Security

- All traffic to Needt uses HTTPS.
- Passwords are stored only as bcrypt hashes.
- Your AI provider keys, AI OAuth tokens and IMAP credentials are encrypted in the database with AES-256-GCM.
- OAuth tokens for Google and Microsoft, and CalDAV passwords, are encrypted in the database with AES-256-GCM. [[CHECK: ships in PR #107; on main these are stored in plain text. Do not publish this line before #107 is merged and its backfill has run.]]
- Personal API tokens, email-verification, password-reset and re-authentication tokens are stored only as hashes.
- IP addresses used for rate limiting are stored only as keyed hashes.
- Each account's data is scoped to that account and its workspaces. Deleting your account requires signing in again.
- Sessions last 30 days and are extended each time you use Needt; after 30 days without use you are signed out.
- Signing out clears Needt's data from your browser's storage and offline cache, after sending any changes still waiting to sync. [[CHECK: ships in PR #106; on main sign-out does not clear local storage or the offline cache.]]
- Error reports are filtered before they leave our servers.
- Database backups are taken daily and restored in a test environment every quarter. [[CHECK: confirm the server disk and the R2 backups are encrypted, then say so here.]]

No system is perfectly secure. If a personal-data breach is likely to put you at risk, we will tell you and the relevant authority as the law requires.

---

## 11. Cookies and storage on your device

We use only what is needed to run Needt: no advertising, analytics or cross-site tracking cookies, and so no cookie banner.

| Name                                                                          | Type                            | Purpose                                                                                  | Lifetime                                          |
| ----------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `__Secure-next-auth.session-token`                                            | Cookie, essential               | Keeps you signed in                                                                      | 30 days from your last use, or until you sign out |
| `__Host-next-auth.csrf-token`                                                 | Cookie, essential               | Protects forms against cross-site request forgery                                        | Browser session                                   |
| `__Secure-next-auth.callback-url`                                             | Cookie, essential               | Returns you to the right page after sign-in                                              | Browser session                                   |
| `needt-calendar-oauth-state-google`, `needt-calendar-oauth-state-outlook`     | Cookie, essential               | Protects the calendar connection flow                                                    | 10 minutes                                        |
| `needt-account-reauth`                                                        | Cookie, essential               | Confirms it is you before account deletion and similar actions                           | 15 minutes                                        |
| `theme` and interface settings (calendar, task list, focus timer and similar) | Local storage                   | Remembers your interface preferences                                                     | Until you sign out or clear site data             |
| `task-data-storage`, `project-store`, and the service worker's offline cache  | Local storage, cache, IndexedDB | Lets Needt open quickly and work offline; holds copies of your tasks, projects and pages | Until you sign out or clear site data             |

[[CHECK: the NextAuth cookie names are the defaults over HTTPS; confirm them in a production browser session.]]

**Fonts.** Needt's pages load fonts from Google Fonts, so your browser contacts Google's servers and Google receives your IP address.

---

## 12. Your rights

If you are in the EU or EEA, you have the right to:

- **access** the personal data we hold about you and get a copy;
- **rectify** data that is wrong;
- **erase** your data;
- **restrict** processing in certain cases;
- **portability**: receive your data in a machine-readable format;
- **object** to processing based on our legitimate interests;
- **withdraw consent** where we rely on it, without affecting what we did before;
- **complain** to a data protection authority, in particular in the EU country where you live or work or where you think the problem happened. The [European Data Protection Board](https://www.edpb.europa.eu/about-edpb/about-edpb/members_en) lists them.

If you are in Ukraine, the Law "On Personal Data Protection" gives you, among others, the right to know where your data is and who processes it, to access it, to object to its processing, to have unlawful or inaccurate data changed or destroyed, to withdraw consent, and to complain to the Ukrainian Parliament Commissioner for Human Rights ([ombudsman.gov.ua](https://ombudsman.gov.ua)) or a court. [[CHECK: confirm the current Ukrainian law and authority; draft law No. 8153 would replace them if enacted.]]

**How to use them.** Most you can use yourself in Settings:

- **Export:** in Settings, under Export. You get an email with a one-use download link to a compressed JSON archive of your data, valid for 24 hours.
- **Delete:** in Settings, Delete account. You sign in again to confirm; deletion happens after 7 days unless you cancel.
- **Correct, disconnect, forget:** edit your profile, disconnect accounts, and delete AI conversations and Memories in Settings.

For anything else, including leaving the waitlist, write to **privacy@needt.app** from the address on your account. We answer within one month, extendable by two more months for complex requests, in which case we tell you. We may ask you to confirm your identity. It is free unless a request is clearly unfounded or excessive.

---

## 13. Children

Needt is not for anyone under **16**. We do not knowingly collect data from children under 16. If you believe a child has given us data, write to privacy@needt.app and we will delete it.

---

## 14. Changes to this notice

We post any change here and update the date at the top. If a change materially affects how we use your data, we tell you by email or in the app at least 14 days before it takes effect.

---

## 15. Contact

- Privacy and legal: **privacy@needt.app**
- Support: **support@needt.app**
- EU representative: see Section 1
- Postal address: on request
