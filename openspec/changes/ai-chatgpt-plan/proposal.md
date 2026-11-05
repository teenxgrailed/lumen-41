## Why

A person with a ChatGPT plan can run Needt AI on it instead of Needt's metered quota (Sign in with ChatGPT, "ChatGPT plan usage", OAuth scope `chatgpt.tokens.use.direct`). OpenAI has approved the Needt application; the feature still ships dark.

## What Changes

Behind the server flag `ai_chatgpt_plan` (default off) and the env `OPENAI_SIWC_CLIENT_ID` (absent means the feature does not exist). Usage counts against the limits of the user's own ChatGPT plan; when a limit is reached, Needt AI falls back to the user's Needt quota.

Status of this PR (foundation only, draft):
- Done: flag, additive migrations (`AIProvider.CHATGPT_PLAN`, `AIOAuthConnection.accountLabel`), config, error classification, OAuth (PKCE, state-derived nonce, code exchange, ID token check, locked refresh, revoke), Responses request builder.
- Not done: provider adapter with fallback, `provider` param on `/api/ai/chat`, connect/disconnect/status routes, tests, spec and design text.

## Source facts (checked 2026-11-05)

- Authorize `https://auth.openai.com/api/accounts/authorize`, token `.../api/accounts/oauth/token`, `resource=https://api.openai.com/v1`, scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, PKCE S256. Access token 1 h, refresh token 30 days and rotating.
- Responses: `store:false`, `stream:true`, `instructions` instead of system role; `temperature`, `max_output_tokens` and others are rejected; function tools only in a namespace; no hosted tools.
- Limit: 429 `subscription_sharing_usage_limit_exceeded`; may arrive as `response.failed` mid-stream. OpenAI never switches billing silently; Needt reports any fallback in response metadata (`charged`).
