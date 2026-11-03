import { PRIVACY_EMAIL, SUPPORT_EMAIL } from "../operator";

/**
 * The public support page, as Markdown. Rendered by `src/app/support/page.tsx`.
 *
 * This is the "Support URL" that App Store Connect, Microsoft Partner Center
 * and Google ask for, and it also opens inside the store apps. So it states no
 * prices, has no purchase or checkout link, and names the brand only: no
 * person and no postal address.
 */
export function supportMarkdown(): string {
  return `# Support

Write to [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}). We answer within two working days.

## Questions

### How do I sign in on the iPhone or Mac app?

Choose a sign-in method on the first screen. Sign-in opens in a system browser sheet: finish it there and the sheet closes and returns you to the app, signed in.

### How do I delete my account?

Open Settings → Account → Delete account. Deletion happens 7 days after you confirm, and you can cancel it in the same place until then. Export your data first if you want a copy.

### How do I export my data?

Open Settings → Data & privacy. The export covers your tasks, pages, habits and the rest of what you keep in Needt.

### How do I cancel a subscription started in the App Store?

Apple manages those subscriptions. On iPhone open Settings → your name (Apple ID) → Subscriptions, choose Needt and cancel there. You can also open [your Apple subscriptions](https://apps.apple.com/account/subscriptions) directly.

### I have a privacy question

Write to [${PRIVACY_EMAIL}](mailto:${PRIVACY_EMAIL}).

## More

- [Terms of Service](/terms)
- [Privacy Notice](/privacy)
`;
}
