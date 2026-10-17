# Hosted AI provider (Ask)

Ask uses one deployment-wide key. The model is GLM 5.3 Flash (Z.ai / Zhipu); the
route to it is chosen by three env names. Nothing is hard-coded and no key is
ever written to code or logs.

| Env                          | Default                                        | Meaning                                                          |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `NEEDT_AI_API_KEY`           | unset (hosted AI off, only own keys work)      | The key for whichever host `NEEDT_AI_BASE_URL` names             |
| `NEEDT_AI_BASE_URL`          | `https://openrouter.ai/api/v1`                 | Any OpenAI-compatible base URL                                   |
| `NEEDT_AI_MODEL`             | `z-ai/glm-5.3-flash` (`glm-5.3-flash` on Z.ai) | The model id that host expects                                   |
| `NEEDT_AI_GATEWAY_PROVIDERS` | empty                                          | OpenRouter only: allow-list of hosts (US/EU rule, see below)     |
| `NEEDT_AI_*_ACTION_CAP`      | 20 / 300 / 300                                 | Hidden monthly action caps for Free / Pro / Lifetime (unchanged) |

The names existed before; this change keeps them and adds Z.ai as a first-class
target. A person's own key (Settings) still wins and is never metered.

## Two ways to reach GLM 5.3 Flash

1. **OpenRouter (default, nothing to change).** Base URL
   `https://openrouter.ai/api/v1`, model `z-ai/glm-5.3-flash`. Requests carry
   `provider.only` (US/EU hosts) and `data_collection: deny`, so the owner rule
   "served only from the US or the EU" holds.
2. **Z.ai directly.** Set
   `NEEDT_AI_BASE_URL=https://api.z.ai/api/paas/v4` and
   `NEEDT_AI_MODEL=glm-5.3-flash` (a `z-ai/` prefix is stripped for you). The
   OpenRouter routing field is not sent. **Z.ai is served from outside the US
   and the EU, so this breaks the US/EU rule.** Do it only after the owner
   accepts that, and after the legal step below.

## Before Z.ai/Zhipu is turned on in production

Add Zhipu AI (Z.ai) to the subprocessor list (`/subprocessors`) and to the
Privacy policy, and disclose the transfer. The owner does this together with the
ФОП data update. Until then keep the OpenRouter default. This note does not
change the legal pages.

## What the Z.ai docs say (checked 2026-10-17)

- Endpoint: `https://api.z.ai/api/paas/v4`, `POST /chat/completions`, bearer key.
  https://docs.z.ai/api-reference/introduction
- Model code `glm-5.3-flash` (and `glm-5.3-flashx`); 1M context; thinking is
  always on (`thinking.type` only supports `enabled`); function calling,
  streaming and `tool_stream` are supported.
  https://docs.z.ai/guides/vlm/glm-5.3-flash
- Function calling: `tools` + `tool_choice`, and `tool_choice` supports only
  `auto`. https://docs.z.ai/guides/capabilities/function-calling
- Streaming deltas carry `reasoning_content`, `content` and `tool_calls`;
  `tool_stream: true` streams tool arguments. Ask shows `content` only.
  https://docs.z.ai/guides/capabilities/stream-tool

Not verified: a live call against either host (no key in the build
environment).
