## ADDED Requirements

### Requirement: Dark by default

The feature SHALL exist only when the server flag `ai_chatgpt_plan` is on for the account AND `OPENAI_SIWC_CLIENT_ID` is set. With either missing, `/api/ai/chatgpt-plan`, `/authorize` and `/callback` SHALL answer 404, `provider=chatgpt_plan` on `/api/ai/chat` SHALL behave exactly as `needt`, and no `provider` metadata SHALL appear in the response.

#### Scenario: Client id missing
- **WHEN** the flag is on and `OPENAI_SIWC_CLIENT_ID` is unset
- **THEN** every route answers 404 and chat ignores the param

### Requirement: Provider param

`/api/ai/chat` SHALL accept `provider`: `"needt"` (default) or `"chatgpt_plan"`. Any other value SHALL mean `needt`.

#### Scenario: Unknown value
- **WHEN** `provider` is `"CHATGPT_PLAN"`
- **THEN** the request runs on Needt AI

### Requirement: Connect with PKCE and state

Connecting SHALL use the authorization-code flow with PKCE S256, a one-use `state` stored as a hash, `resource=https://api.openai.com/v1` and the scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`. The callback SHALL reject an unknown, foreign, expired or reused state, SHALL verify the ID token (signature, issuer, audience, expiry, nonce) and SHALL store tokens only if `chatgpt.tokens.use.direct` was granted. Tokens SHALL be stored encrypted with the AI encryption key.

#### Scenario: Scope not granted
- **WHEN** the token response lacks `chatgpt.tokens.use.direct`
- **THEN** nothing is stored and the person returns to settings with `not_granted`

### Requirement: Refresh

Access tokens SHALL be refreshed a minute before expiry. Refreshes SHALL be serialized per person (advisory lock, row read again under the lock) because refresh tokens rotate. The connection SHALL be deleted only when the refresh token is unusable (`invalid_grant`, `invalid_refresh_token`, `token_expired`, `refresh_token_expired`, `refresh_token_invalidated`, `refresh_token_reused`); network and 5xx failures SHALL keep it.

#### Scenario: Temporary outage
- **WHEN** the token endpoint answers 503
- **THEN** the connection is kept and the request falls back

### Requirement: Request shape

Requests to `POST https://api.openai.com/v1/responses` SHALL send `store:false`, `stream:true`, system text in `instructions`, history in `input`, tools grouped in one namespace, and none of: background, conversation, max_output_tokens, max_tool_calls, metadata, moderation, multi_agent, prompt, prompt_cache_retention, safety_identifier, temperature, top_logprobs, top_p, truncation, user, previous_response_id. A turn SHALL count as successful only after `response.completed`.

#### Scenario: Strip
- **WHEN** a caller adds `temperature` to the body
- **THEN** it is removed before sending

### Requirement: Limits and fallback

Usage counts against the limits of the user's own ChatGPT plan; when a limit is reached, Needt AI falls back to the user's Needt quota. Fallback SHALL happen only before the first event of a request is yielded, for limit, ineligible, revoked, auth and unavailable failures. The response `provider` metadata SHALL state `used`, `fallback.reason` and `fallback.charged`; `charged` SHALL be true exactly when the answer counted against the metered Needt AI actions. Needt SHALL never charge the metered cap without saying so.

If nothing can answer, the end state (`plan_limit_reached`, `reconnect_required`, `plan_ineligible`, `plan_unavailable`) SHALL be returned (HTTP 429 for the limit, 409 otherwise) with the ChatGPT usage link and no charge. A limit that arrives mid-stream SHALL end the turn in that state without a fallback.

#### Scenario: Limit before any text, quota left
- **WHEN** the plan answers 429 `subscription_sharing_usage_limit_exceeded` and the person has Needt quota
- **THEN** Needt AI answers and the metadata says `fallback: {reason: "limit", charged: true}`

#### Scenario: Limit, no quota (for example Free)
- **WHEN** the plan limit is reached and the hosted quota allows nothing
- **THEN** the state is `plan_limit_reached` and no action is counted

### Requirement: Status API

`GET /api/ai/chatgpt-plan` SHALL return `{available, connected, account, planUsageEnabled, expiresAt, manageUsageUrl}`. `DELETE` SHALL revoke the session at OpenAI, delete the tokens either way and return `remoteRevoked`.
