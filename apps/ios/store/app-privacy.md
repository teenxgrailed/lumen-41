# App Privacy answers (App Store Connect, "App Privacy")

Source: `src/lib/legal/documents/privacy.ts` at `origin/main` (notice effective 2026-11-03).
Every "Yes" quotes the line that makes it so. The Mac app (`apps/macos/store`) uses the
same answers: it loads the same server and the same notice.

If the notice changes, these answers change with it. Apple wants the label to match the
notice and what the app really does; the notice is the source of truth here.

## Answers for the three screens

| Question                                       | Answer                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Do you or your third-party partners collect data from this app? | Yes                                                                          |
| Is any data used to track the user?            | **No.** Nothing is shared with data brokers or used for ads; there is no ATT prompt and no `NSUserTrackingUsageDescription`. |
| Privacy Choices URL (optional)                 | none                                                                                                |
| Privacy Policy URL                             | `https://use.needt.app/privacy`                                                                     |

"Tracking" in Apple's sense: linking data with third-party data for advertising or sharing
it with data brokers. privacy.ts: "We do not sell your data, we show no ads, and we use no
advertising, analytics or tracking cookies." and "There is no analytics or tracking script in
the app or on needt.app".

## Data types

Purposes are Apple's list: App Functionality (AF), Analytics, Developer's Advertising,
Third-Party Advertising, Product Personalization, Other. Only **AF** is used anywhere.
"Linked" = tied to the person's account. Tracking is **No** on every row.

| Apple category / type                              | Collected | Linked | Purpose | Line in privacy.ts that makes it so                                                                                                                                        |
| -------------------------------------------------- | --------- | ------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info: Name                                 | Yes       | Yes    | AF      | 3.1 "Name, email address, profile picture if your sign-in provider gives us one, and the colour and initials you choose."                                                  |
| Contact Info: Email Address                        | Yes       | Yes    | AF      | 3.1 (same line). Also 3.7: "a keyed hash of a normalised form of the email address that started it" (trial limit; same purpose)                                            |
| Contact Info: Phone Number                         | No        |        |         | not in 3.x                                                                                                                                                                 |
| Contact Info: Physical Address                     | No        |        |         | not collected by the app. 3.6: payment details and billing address go to Creem on the website ("Creem collects your payment details, billing name, address and tax information") |
| Contact Info: Other User Contact Info              | No        |        |         | 3.9 bookings and form answers are visitors of a web page, not app users                                                                                                    |
| Health & Fitness: Health, Fitness                  | No        |        |         | Habits are free-form user content (3.2 "habits and their completions"); the app reads no HealthKit or motion data                                                          |
| Financial Info: Payment Info, Credit Info, Other   | No        |        |         | 3.6 "We never receive your card number." No purchase in the app                                                                                                            |
| Location: Precise, Coarse                          | No        |        |         | no location is collected. Event locations are text the person types (3.3, "title, time, location, description")                                                            |
| Sensitive Info                                     | No        |        |         | none asked for                                                                                                                                                             |
| Contacts                                           | No        |        |         | no address book access                                                                                                                                                     |
| User Content: Emails or Text Messages              | Yes       | Yes    | AF      | 3.3 (Gmail, Outlook, IMAP) "for each synced message: sender, recipients, subject, preview, date, labels, read and archive state, and the message body". Only when the person connects a mailbox |
| User Content: Photos or Videos                     | Yes       | Yes    | AF      | 3.2 "uploaded files and images ... Uploaded files are stored in our database, not with a separate storage provider."                                                        |
| User Content: Audio Data, Gameplay Content         | No        |        |         | not in 3.2                                                                                                                                                                 |
| User Content: Customer Support                     | Yes       | Yes    | AF      | 3.10 "If you send a bug report from inside Needt, we store what you wrote, any file you attach, and diagnostics (page, app version, screen size, theme, browser)"            |
| User Content: Other User Content                   | Yes       | Yes    | AF      | 3.2 "Everything you put in, so we can show it back to you: tasks and subtasks, projects, boards, saved views, tags, events you create, documents and databases (Pages), comments ..." plus 3.3 calendars and tasks copied from connected accounts, and 3.4 "Your conversations with the assistant ... Memories" |
| Browsing History                                   | No        |        |         | not in 3.x                                                                                                                                                                 |
| Search History                                     | No        |        |         | not in 3.x                                                                                                                                                                 |
| Identifiers: User ID                               | Yes       | Yes    | AF      | 3.1 "If you sign in with Google or Microsoft: your account identifier there and the sign-in tokens it issues, encrypted." and the Needt account itself                      |
| Identifiers: Device ID                             | Yes       | Yes    | AF      | 3.11 "If you allow notifications in the app, we store the device token Apple gives that install of the app ... is linked to your account so notifications reach you". Only after the person allows notifications. The IP counters (3.11 "stored only as keyed hashes") are not a Device ID |
| Purchases: Purchase History                        | Yes       | Yes    | AF      | 3.1 "Your plan (Free, Pro trial, Pro or Lifetime), its status and dates." and 3.6 "From Creem we receive a customer ID, a subscription ID, the product, amount, billing interval, status, period end, and payment, refund and dispute events." The purchase happens on the website, not in the app; declared because the app shows the plan from the same record (conservative) |
| Usage Data: Product Interaction                    | No        |        |         | "There is no analytics or tracking script in the app"                                                                                                                      |
| Usage Data: Advertising Data                       | No        |        |         | "we show no ads"                                                                                                                                                           |
| Usage Data: Other Usage Data                       | Yes       | Yes    | AF      | 3.4 "A monthly count of AI actions and tokens used, to keep the service affordable."                                                                                       |
| Diagnostics: Crash Data                            | Yes       | No     | AF      | 3.11 "When something breaks, an error report goes to Sentry. Reports are reduced before they leave to the error type, the place in our code and the app version: request data, messages, local variables, breadcrumbs and user details are removed" |
| Diagnostics: Performance Data                      | No        |        |         | not in 3.11                                                                                                                                                                |
| Diagnostics: Other Diagnostic Data                 | Yes       | Yes    | AF      | 3.11 "Our servers log errors and events. Logs are kept for 3 to 30 days depending on severity." and "Server access logs kept by our reverse proxy contain your IP address and browser user-agent, and are kept for up to 30 days." Section 8 says deleting the account removes "log lines that mention you", so the logs can be tied to the person: Linked = Yes |
| Body, Surroundings, Other Data Types               | No        |        |         | none                                                                                                                                                                       |

## Judgment calls (re-check before submitting)

1. **Purchase History = Yes.** The strict reading ("data collected from this app") could say
   No, because the app contains no purchase. Yes is the safe side: a label that says too much
   cannot be rejected, one that says too little can.
2. **Other Diagnostic Data = Linked.** Access logs alone (IP and user agent, no account id)
   would be unlinked; the application logs "that mention you" are what makes it linked.
3. **Crash Data = Not linked.** Rests on the notice's "user details are removed" and
   "Sentry's collection of personal data is turned off". Sentry sees the IP when a browser
   report arrives (3.11) but the report does not contain it. If that is judged to be a link,
   change to Linked.
4. **Emails or Text Messages** applies only to people who connect a mailbox. Apple has no
   "optional" flag; the type is declared because the app can collect it. Gmail is limited to
   test accounts until Google's verification (privacy.ts section 5, "Gmail availability").
5. **AI assistant.** Text sent to the assistant goes to OpenRouter (section 6.1) with "hosts
   ... that do not retain or train on prompts". That is a processor acting for Needt, so no
   extra row; it is covered by Other User Content.
6. Third-party processors (Hetzner, Cloudflare R2 backups, Resend, Sentry, OpenRouter, Zoho
   Mail; privacy.ts 7.1) act on Needt's behalf, so they add no purposes other than AF.

## Not collected, stated so nobody adds it by habit

No advertising ID (IDFA), no analytics SDK, no ads SDK, no social SDK, no location, no
contacts, no health data, no precise IP storage beyond logs, no cross-app tracking.
