import {
  OPERATOR_COUNTRY,
  PRIVACY_EMAIL,
  SUPPORT_EMAIL,
  formatLegalDate,
  operatorName,
} from "../operator";

/** Creem's buyer-facing documents, checked 2026-10-12. */
export const CREEM_LINKS = {
  buyerTerms: "https://www.creem.io/buyer-terms",
  privacy: "https://www.creem.io/privacy",
  customerHelp: "https://docs.creem.io/for-customers/why-creem-charged-me",
  contact: "https://www.creem.io/contact",
} as const;

/** The Terms of Service, as Markdown. Rendered by `src/app/terms/page.tsx`. */
export function termsMarkdown(): string {
  const date = formatLegalDate();
  return `# Needt Terms of Service

Last updated and effective: ${date}

These terms are the agreement between you and the operator of Needt. By creating an account, joining the waitlist or using Needt, you accept them. If you do not accept them, do not use Needt.

How we handle personal data is described in the [Privacy Notice](/privacy), which forms part of these terms.

---

## 1. Who we are

Needt is operated by **${operatorName()}**, a private individual based in **${OPERATOR_COUNTRY}** ("Needt", "we", "us"). Our postal address is available on request to ${PRIVACY_EMAIL}.

- Support: **${SUPPORT_EMAIL}**
- Legal and privacy: **${PRIVACY_EMAIL}**

---

## 2. What Needt is

Needt is a web application at **use.needt.app** where you keep your tasks, projects, calendars, documents (Pages), habits, moodboards, mail and notes in one place. It includes automatic scheduling, an AI assistant, a personal API and webhooks, so you can connect Needt to other tools.

Needt connects to services you already use: Google, Microsoft, Apple iCloud and other CalDAV servers, mail providers, and apps you import from. Those services are run by other companies under their own terms. We are not responsible for them, for changes they make, or for their availability.

---

## 3. Who can use Needt

- You must be at least **16 years old**, and old enough to enter a contract where you live.
- If you use Needt for an organisation, you confirm that you may accept these terms for it, and "you" includes that organisation.
- You may not use Needt if you are the target of sanctions, or live in a country or territory under comprehensive sanctions, that prohibit us or our payment provider from dealing with you.

---

## 4. Your account

- Give accurate information and keep it up to date.
- Keep your password, sign-in accounts and API tokens secret. You are responsible for what happens under your account and tokens, unless we caused it.
- Tell ${SUPPORT_EMAIL} promptly if you think someone else has access to your account. **Sign out everywhere** in Settings ends every session and revokes your API tokens.
- One person per account. Shared workspaces are how you work with others.
- You stay signed in on a device for 30 days after you last used Needt there.

---

## 5. Plans, trial and payment

### 5.1 Plans

- **Free:** $0. The core features, with limits (for example on connected calendars, boards, habits and auto-scheduled tasks). The current limits are shown in the app.
- **Pro:** **$7 per month** or **$59 per year**.
- **Lifetime:** **$149, paid once**, offered to the first **300** buyers only. Lifetime gives you Pro for as long as Needt operates the service. It is not tied to your lifetime or ours, and it does not commit us to any particular future feature. If the 300th place is taken at the moment you pay, your paid purchase is still honoured.

Prices are in US dollars and are shown before you pay. VAT or sales tax may be added depending on where you live; the checkout shows the total before you confirm.

### 5.2 Free trial

A new account can try **Pro free for 14 days, without a card**. There is one trial per person; we check this by email address. When the trial ends, the account moves to Free by itself. Nothing is charged, and you keep all your data, but features and limits beyond Free stop working until you upgrade.

### 5.3 Who sells to you: Creem

Paid plans are sold by **Creem**, the trading name of **Armitage Labs OÜ**, a company registered in Estonia (registry code 16977866). Creem acts as **merchant of record**: it is the seller in the transaction, takes your payment, charges and remits VAT or sales tax, and issues your invoice. When you buy, [Creem's Buyer Terms](${CREEM_LINKS.buyerTerms}) apply to the purchase alongside these terms, and Creem handles your payment data under its [privacy notice](${CREEM_LINKS.privacy}). We provide Needt itself.

### 5.4 Renewal and cancellation

- Pro renews automatically at the end of each month or year until you cancel.
- You can cancel at any time in Settings → Billing → Manage billing, which opens Creem's customer portal. Cancelling stops the next renewal; you keep Pro until the end of the period you have paid for.
- If a renewal payment fails, you keep paid access until the end of the paid period while Creem retries. If it still fails, paid features stop until you update your payment method. Your data stays.
- If you **delete your account**, any Pro subscription is cancelled immediately. Deleting your account does **not** refund anything automatically; see 5.5.

### 5.5 Refunds and the right of withdrawal

- **Refunds on request.** We do not refund automatically. If you think you are owed a refund, write to **${SUPPORT_EMAIL}** with the email address of your account and what you bought. We look at each request, and if we agree, the refund is made through Creem. This does not limit any refund the law gives you. If we do not answer within 7 days, you can also contact Creem through its [contact page](${CREEM_LINKS.contact}), as its [help for buyers](${CREEM_LINKS.customerHelp}) describes.
- **Starting immediately (EU and UK consumers).** Needt is digital content and a digital service that starts as soon as you pay. When you buy, you ask for it to start immediately, before the 14-day withdrawal period ends, and you acknowledge that you lose your right of withdrawal once it has started. Creem's Buyer Terms record this consent and acknowledgment at purchase (section 8.2), and Creem's receipt confirms the purchase.
- **If the withdrawal right still applies to you**, for example because the law treats your plan as a service rather than digital content, you can withdraw within 14 days of the purchase by writing to ${SUPPORT_EMAIL} or to Creem. Creem refunds the amount within 14 days of the request (Buyer Terms section 8.4), less, where the law allows, a proportionate amount for the part of a subscription already provided. Your paid access ends when you withdraw.
- **Effect of a refund.** A full refund or a chargeback ends the paid plan it bought, and the account moves to Free. A partial refund does not change the plan. A refunded Lifetime purchase returns its place to the 300.

### 5.6 Price changes

We may change prices for future periods. We tell Pro subscribers at least 30 days before a new price applies to their next renewal, and you can cancel before then. The price you paid for Lifetime does not change.

---

## 6. AI features and fair use

- AI features are included in Needt, with a monthly **fair-use allowance** that depends on your plan. The Free allowance is small and lets you try the assistant; Pro and Lifetime are sized so that daily personal use of the assistant does not reach it. If you go over it, AI responses slow down, and well past it they pause until the next calendar month. Nothing else in Needt stops working, and you can add your own AI provider key to keep going without a limit from us. If we reduce the allowance for a plan you pay for, we tell you at least 30 days in advance, and you can cancel and ask for a refund of the unused prepaid period.
- **AI can be wrong.** Answers, summaries, schedules and suggestions are generated automatically and may be inaccurate, incomplete or out of date. Check anything important before you rely on it. Needt does not give legal, medical, financial or other professional advice.
- When you ask the assistant to act, for example to create, move or delete tasks, it acts on your behalf. Destructive or bulk actions ask for your confirmation first.
- If you use your own AI provider key, your use of that provider is governed by your agreement with them, and any charges they make are yours.
- What is sent to AI providers is described in the Privacy Notice.

---

## 7. Your content

- **It is yours.** You keep all rights to what you put into Needt and to data synced from your other accounts ("your content").
- **What you allow us to do with it.** You give us a worldwide, non-exclusive, royalty-free licence to host, store, copy, process, transmit and display your content **only as needed to run, secure and support Needt for you** and the people you share it with, including sending it to the service providers and AI providers described in the Privacy Notice. The licence ends when your content is deleted from Needt, except for copies in backups until they expire and content you put in a shared workspace that others still use, which is anonymised as the Privacy Notice describes.
- We do **not** use your content to train AI models, and we do not sell it.
- **You are responsible for your content.** You confirm you have the right to put it into Needt and to share it with the people you share it with. If you connect a mailbox or calendar, you confirm you may access it.
- **Sharing and publishing.** Members of a shared workspace can see and change what you add to it. Anyone with the link can read a page you publish. Bookings and form responses you receive contain other people's personal data; use it lawfully.
- **Keep your own copy.** Our backups exist to recover from failures, not to restore items you delete. Use the data export in Settings, available on every plan, if you want your own copy.

---

## 8. Acceptable use

Do not use Needt to:

- break the law, or infringe anyone's intellectual property, privacy or other rights;
- store or share content that is illegal, sexually exploits minors, incites violence or harasses others;
- send spam, including through webhooks, booking pages, forms or shared pages;
- upload malware, or try to reach accounts, data or systems you are not allowed to access;
- probe, scan or test Needt for vulnerabilities without our written permission (if you find a security problem, please report it to ${PRIVACY_EMAIL});
- overload Needt, get around rate limits, plan limits or the AI fair-use allowance, or open several accounts to get more trials or free allowance;
- resell or sublicense Needt, or copy it to build a competing product;
- use the AI features to produce content that is unlawful or that the AI provider's usage policies prohibit.

---

## 9. Personal API and webhooks

- Access works through **personal tokens you create** in Settings. A token acts as you, with access to your data. Treat it like a password, and revoke it in Settings if it may have leaked.
- You are responsible for the scripts, tools and AI agents you give a token to, and for what they do with your data.
- Webhooks send your data to the URL you choose. Make sure you control that URL.
- Respect rate limits, and do not use the API to get around plan limits. We may change or version the API, and we try to give notice before breaking changes to its stable parts.
- We may suspend a token or limit API access that threatens the stability or security of Needt.

---

## 10. Our intellectual property

Needt's software, design, name and logo belong to us or our licensors. These terms give you a personal, non-transferable right to use Needt as offered and no other rights in it. If you send us feedback or ideas, we may use them without obligation to you.

Parts of Needt are open-source software, used under their own licences. Those licences, not these terms, govern that software.

---

## 11. Availability, changes and shutdown

- We work to keep Needt available and your data safe, but we do not promise that it will always be available, uninterrupted or error-free. We may need downtime for maintenance and updates.
- Sync with other services depends on them and may be delayed or interrupted.
- We may change, add or remove features. If we remove a significant feature you pay for, we tell you in advance and, where appropriate, offer a pro-rata refund of the prepaid period that remains.
- **If we decide to shut Needt down, we give at least 90 days' notice** by email and in the app, and the data export stays available until the service closes. Lifetime ends when the service closes.

---

## 12. Suspension and termination

- **You** can stop using Needt at any time and delete your account in Settings. Deletion is final after a 7-day grace period, during which you can cancel it.
- **We** may suspend or close your account, or remove content, if you seriously or repeatedly break these terms, if the law requires it, or to protect Needt, other users or third parties. Where reasonable, we warn you first and give you a chance to export your data. If we close a paid account for a reason other than your breach, we refund the unused prepaid period.
- Sections 7 (until your content is deleted), 13, 14 and 16 survive termination.

---

## 13. Warranties

Needt is provided **"as is" and "as available"**. To the extent the law allows, we make no other promises, for example that Needt will meet every need you have or that AI output or automatic scheduling will be accurate.

**Nothing in these terms limits rights you have as a consumer that cannot be limited by contract**, including statutory guarantees for digital content and digital services under the law of the country where you live.

---

## 14. Liability

- To the extent the law allows, we are not liable for losses that were not reasonably foreseeable, for indirect or consequential losses, or for loss of profits, revenue or business.
- To the extent the law allows, our total liability to you for all claims relating to Needt is limited to what you paid for Needt in the 12 months before the event that gave rise to the claim, or **€100** if you paid nothing in that time.
- These limits do **not** apply to liability for death or personal injury caused by negligence, for fraud or wilful misconduct, for gross negligence, or to any other liability that cannot be limited by law.
- **If you are a consumer**, the limits in this section apply only as far as the mandatory law of the country where you live allows; where that law makes us liable for breaching an essential obligation of these terms, or sets a different limit, that law applies instead.
- If you use Needt for business, you agree to compensate us for claims by third parties that arise from your breach of Section 8 (Acceptable use). This does not apply to consumers.

---

## 15. Changes to these terms

We may update these terms. We post the new version here and update the date. If a change materially affects you, we tell you by email or in the app at least **30 days** before it applies. If you do not agree, you can stop using Needt and delete your account before the change takes effect, and if you have a Pro subscription, cancel it and ask for a refund of the unused prepaid period. Continuing to use Needt after the change takes effect means you accept it.

---

## 16. Governing law and disputes

- These terms are governed by the law of **Ukraine**.
- Disputes go to the competent courts of **Kyiv, Ukraine**.
- **If you are a consumer in the EU, the UK or another country with mandatory consumer protection**, you keep the protection of the mandatory law of the country where you live, and you may bring a claim in its courts. The two points above do not take that away.
- Before going to court, please write to ${SUPPORT_EMAIL}; most problems can be solved quickly.
- The European Commission's online dispute resolution platform was discontinued on 20 July 2025, so we do not link to it.

---

## 17. General

- If any part of these terms is found invalid, the rest stays in force.
- If we do not enforce a right straight away, we have not waived it.
- You may not transfer your account or these terms without our consent. We may transfer them to a successor operating Needt, and will tell you if we do.
- These terms, the Privacy Notice and the plan details shown at checkout are the whole agreement between us about Needt.
- These terms are written in English. If we provide a translation, the English version prevails unless consumer law where you live says otherwise.

---

## 18. Contact

- Support: **${SUPPORT_EMAIL}**
- Legal and privacy: **${PRIVACY_EMAIL}**
- Postal address: available on request
`;
}
