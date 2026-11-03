# Age rating (App Store Connect, App Information, Age Ratings)

Checked against Apple's "Age ratings values and definitions" and "Set an app age rating" on
2026-11-03. The questionnaire gained social media questions on 2026-07-09 and answers are
required for new apps and updates from September 2026. Apple computes the rating from the
answers; the wording of an option can move, so read each question once in App Store Connect
before ticking.

## Result

**Expected calculation from the honest answers below: 4+** (nothing in the app is
objectionable and no capability that raises the rating is present; Apple's 4+ definition
lists user-generated content, messaging and advertising as allowed). Unverified: App Store
Connect does the calculation, nobody has run it yet.
**Displayed rating: 16+, set with "Override to higher age rating".** Reason: the Privacy
Notice, section 13, says "Needt is not for anyone under **16**." Apple added the override
for exactly this case ("your app's policy requires users to be 16 or older"). The App Store
then shows 16+ while the content descriptions still show the real answers.

So the honest answers do **not** produce 16+ on their own. Do not answer any question "up"
to reach 16+; use the override. Optional: put `https://use.needt.app/privacy` (section 13)
in the "Age suitability URL" field.

Mac: the same answers and the same override.

## Answers

| Section                  | Question                                                  | Answer                      | Why                                                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| In-App Controls          | Parental controls                                         | No                          | none in the app                                                                                                                                                                                                                      |
| In-App Controls          | Age assurance                                             | No                          | the Declared Age Range API is not used and sign-up does not verify age; the 16+ rule is a term, not a gate                                                                                                                           |
| Capabilities             | Unrestricted web access                                   | **No**                      | The WebView only keeps `needt.app` hosts in the app (`allowNavigation` in `apps/ios/capacitor.config.json`; the Mac app has the same "Navigation lock"). Any other link opens in Safari / the default browser. There is no address bar |
| Capabilities             | User-generated content                                    | **No**                      | Apple's definition is "the broad distribution of content created by users". Everything is private to the account. Shared workspaces are invite-only and a published page is readable only by whoever has its link; there is no feed, search or discovery of other people's content |
| Capabilities             | Messaging and chat                                        | **No**                      | no user-to-user messaging. Members of a shared workspace can comment on items; that is annotation of shared work, not a chat. If a reviewer disagrees, answer Yes: the rating still stays 4+ before the override                       |
| Capabilities             | Social media (new 2026-07-09)                             | No                          | no social feed, no redistribution or amplification of other people's content                                                                                                                                                         |
| Capabilities             | Advertising                                               | No                          | "we show no ads" (privacy.ts section 2)                                                                                                                                                                                              |
| Medical or Wellness      | Medical or treatment information                          | None                        | the app gives none                                                                                                                                                                                                                   |
| Medical or Wellness      | Health or wellness topics                                 | None                        | Habits are whatever the person types; the app gives no diet, exercise or health advice                                                                                                                                               |
| Mature Themes            | Profanity or crude humor; horror or fear; alcohol, tobacco, drugs | None                | the app ships no such content. See the assistant note below                                                                                                                                                                          |
| Sexuality or Nudity      | Mature or suggestive themes; sexual content or nudity; graphic | None                  | none                                                                                                                                                                                                                                 |
| Violence                 | Cartoon / realistic violence, guns or weapons, prolonged graphic | None                | none                                                                                                                                                                                                                                 |
| Chance-Based Activities  | Simulated gambling, real gambling, contests, loot boxes   | None / No                   | none                                                                                                                                                                                                                                 |

## The two places where the honest answer needs a caveat

1. **The built-in assistant is a language model** (OpenRouter, privacy.ts section 6). Apple
   asks developers to count assistants and chatbots in the frequency of sensitive content.
   It is a planner assistant with tools for tasks, pages and settings, not an open chat, and
   the app ships no sensitive content, so the answers above are "None". It can still produce
   text the person asked for. This is why the 16+ override is the right display value and
   not a cosmetic one. If App Review pushes back, the fallback is "Infrequent" on profanity
   or crude humor, which can only raise the calculated value; the 16+ display stays.
2. **"Unrestricted web access" is No only while the navigation lock holds.** Published pages
   can contain links; they leave the app. If the app ever embeds a browser for external
   sites, change this to Yes (16+ calculated by itself).

## Not part of the rating

- Made for Kids: Not Applicable. Age Categories and Override: choose the 16+ override.
- Regional ratings (Australia, Brazil, Korea) are calculated by Apple from the same answers.
