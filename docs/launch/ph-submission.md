# Product Hunt: submission pack, launch Tuesday 17.11.2026

Paste-ready. Prepared 2026-11-06; the owner checks it by 10.11. Nothing is submitted. English blocks are for pasting; the rest is instructions (RU).

## Rules checked 2026-11-06

| Rule | Value | Source |
| --- | --- | --- |
| Name | product name only, no description, no emoji | [Launch guide](https://www.producthunt.com/launch/preparing-for-launch), 06.11.26 |
| Tagline | max 60 characters, plain | same, 06.11.26 |
| Description | the guide and the "Build your product page" article say 500 max; an older form and third-party checklists say 260. We write to 260 so it fits both | [Build your product page](https://help.producthunt.com/en/articles/17834537-4-build-your-product-page), 06.11.26 |
| Gallery | 1270x760 recommended; the guide says at least 2 images for the gallery to show, the help article says at least 1 and recommends 3+; no maximum stated; drag to reorder; GIF allowed | both pages, 06.11.26 |
| Thumbnail | square, 240x240, under 3 MB, required | launch guide, 06.11.26 |
| Video | optional; YouTube link only (public, full URL, no shortener). Loom is suggested for recording but is not an accepted link type | launch guide, 06.11.26 |
| Topics | required, up to 3 | both pages, 06.11.26 |
| First comment | strongly recommended (70% of Product of the Day/Week/Month winners had one); can be added in the submit flow, all other comments only after launch; ask for feedback, not upvotes; humble tone | launch guide, 06.11.26 |
| Scheduling | up to 30 days ahead; the picker opens on "Schedule launch"; the date can be changed later; the day starts at midnight PT, guide recommends 12:01 AM PT | both pages, 06.11.26 |
| Hunter | not required; personal account only, company accounts cannot post | [Help: how to post](https://help.producthunt.com/en/articles/479557-how-to-post-a-product), 06.11.26 |
| Links | **UTM/tracking links and shorteners are NOT accepted** | launch guide, 06.11.26 |

Not found on any page: the date picker UI (is there a time field?) and a gallery maximum. Check in the form.

## 1. Name

```
Needt
```

## 2. Tagline (max 60)

Recommended first.

```
Your day, planned. Your AI agents, on one shared board
```
54 characters.

```
Tasks, calendar and docs in one place. Your day re-plans
```
56 characters.

```
One planner for you and your AI agents
```
38 characters.

## 3. Description (max 260)

```
Needt keeps tasks, calendars, docs and habits in one place and plans your day around the time you have. Move a meeting and only what's affected moves, each with a reason. Your AI agents share one board with you. Free plan, 14 days of Pro.
```
238 characters.

## 4. Gallery (1270x760)

Existing files in `marketing/product-hunt/` (from #600). All five are **2880x1800 (16:10)**, measured with `sips`. PH wants 1270x760 (about 5:3), so each needs a re-crop or resize; do not upload as is. They are landing screens: check each for personal data before upload.

| # | Path | Size | Shows | Status |
| --- | --- | --- | --- | --- |
| 1 | `marketing/product-hunt/02-cal-after.jpg` | 2880x1800 | Calendar after one meeting moved, rest re-slotted, Keep | Content OK; re-crop to 1270x760 |
| 2 | `marketing/product-hunt/01-today-light.jpg` | 2880x1800 | Today: what is next and why | Content OK; re-crop |
| 3 | `marketing/product-hunt/03-composer-light.jpg` | 2880x1800 | Quick-add parsing day and time | Content OK; re-crop |
| 4 | `marketing/product-hunt/04-ask-light.jpg` | 2880x1800 | Ask Needt AI (Pro only) | Optional; drop if the Agents Map takes its slot |
| 5 | `marketing/product-hunt/05-docs-light.jpg` | 2880x1800 | Docs next to the work | Content OK; re-crop |

How to re-crop: in Preview, Tools > Rectangular Selection at 5:3, copy to a new image, Tools > Adjust Size to 1270x760, export as PNG or JPG. Check that the caption text on the image is not cut.

**Missing, capture this:** the Agents Map (the headline feature; nothing in the gallery shows it). In prod: Agents > Map > fullscreen > **Presentation mode**, which hides real task titles. Capture at 5:3 and resize to 1270x760. No real agent names that identify clients, no mail addresses on screen. Agents is a dark screen; that is fine, but keep one dark image only.

Recommended order: 1 calendar re-slot, 2 Agents Map, 3 Today, 4 composer, 5 docs. Minimum to submit: items 1-3 (PH recommends 3+).

Also missing: the 240x240 square thumbnail. Export the Needt mark.

## 5. Video

```
[OWNER: public YouTube link to the Map clip from the Shorts lane]
```
Must be a public YouTube URL in full form (`https://www.youtube.com/watch?v=...`), not `youtu.be`. Upload the clip to YouTube first. Loom links are not accepted. Leave the field empty if the clip is not ready; it is optional.

## 6. First maker comment (about 190 words)

Brand-only voice, as in `docs/launch/product-hunt.md`: first person, no name, "made by one person".

```
Hi Product Hunt,

I kept rewriting my plan every morning. One meeting moved and the rest of the day was wrong until I fixed it by hand. Needt does that fix for you: move a meeting and only what's affected moves, each move says why, and nothing is saved until you press Keep. One Undo puts it all back.

It is also the place the rest of your work lives: calendars (Google, Outlook, iCloud), tasks, docs, habits and focus time.

The newest part is Agents. If you run AI agents, they share one board with you: a live Map of what they are doing, tasks in Waiting on you / In progress / Queued, and they stop for your tap before anything risky. It connects over MCP, an API and webhooks, and the free Needt Plugin adds /needt to Claude.

Pricing: a Free plan, 14 days of Pro with no card, then $7/month or $59/year. Lifetime is $149.

Needt is made by one person, so I read and answer every comment. What breaks your plan most often, and what would you want your agents to ask you before they act?
```

`[OWNER: confirm Lifetime $149 and the 14-day trial are live at checkout on 17.11. If Creem is not live, delete the Pricing paragraph.]`

Not advertised on purpose, because off or not live as of 06.11.26: Quit habits (`habits_quit` flag, gradual rollout), Needt AI on a ChatGPT plan (`ai_chatgpt_plan`, off), Mac and iPhone apps, Chrome extension. "Ten skills" in the Plugin could not be verified in the repo, so no count is stated.

## 7. Topics (up to 3)

1. Productivity
2. Task Management
3. Artificial Intelligence

Alternates if the form offers them: Calendar, Developer Tools. Pick the nearest existing name in the form's list.

## 8. Link

Product Hunt does not accept UTM links (rules above). Paste the clean URL:

```
https://needt.app
```

Use the landing (needt.app), not the app: the landing explains the product and leads to sign-up, use.needt.app asks for a login. The requested `https://needt.app/?utm_source=producthunt&utm_medium=launch&utm_campaign=ph_2026_11_17` is for links you post yourself (X, IG, email), never in the PH form. Only the first link shows on the launch page.

## 9. Steps

Create the draft by 10.11 (drafts autosave):

1. Log in at producthunt.com with your personal account.
2. Click **Submit** (top right), then **New Product**.
3. Paste `https://needt.app` and continue.
4. Fill name, tagline, description, up to 3 topics, thumbnail, X handle (optional, the product's).
5. Gallery: upload the 1270x760 images, drag into order. Video: YouTube link, or empty.
6. Mark yourself as maker. Pricing: free with a trial/paid plan.
7. First comment: paste block 6.
8. **Schedule launch**: pick 17.11.2026, 12:01 AM PT (09:01 Zurich). If the picker has no time field, the day starts at midnight PT. Confirm the preview, the date can be edited later.
9. No paid hunter; self-hunt.

Launch day, Tue 17.11 (Zurich time):

- [ ] 08:50 check the launch page is scheduled and the first comment is attached
- [ ] 09:01 live; answer the first comments within minutes
- [ ] 09:05 share the PH link: waitlist email, personal channels. Ask for feedback, not upvotes
- [ ] 09:15 X and 09:30 IG: handled by the Shorts lane
- [ ] Through the day: answer every comment
- [ ] Watch sign-up, checkout and the landing under traffic
- [ ] Evening: thank-you comment with what you learned
