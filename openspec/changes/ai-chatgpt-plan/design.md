## Sources (checked 2026-11-05)

- Cookbook: https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
- Sign-in: https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- Limitations: https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- Errors: https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery
- Help: https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites
- Devkit `packages/local/src/oauth.ts`, `responses.ts`

What was relied on, in the docs' words where short:
- "Set `store` to `false` and `stream` to `true` on each HTTP inference request."
- "Use `instructions` or developer messages; explicit `{type: "message", role: "system"}` items are rejected."
- Unsupported fields: background, conversation, max_output_tokens, max_tool_calls, metadata, moderation, multi_agent, prompt, prompt_cache_retention, safety_identifier, temperature, top_logprobs, top_p, truncation, user; omit `previous_response_id` over HTTP.
- "Group function/custom tools in namespaces or supply them through `additional_tools` input items." Hosted tools and `tool_search` are unsupported.
- Access token 1 hour; refresh token 30 days, replaced on every refresh; "serialize refreshes for the same session".
- `subscription_sharing_usage_limit_exceeded` (429), `subscription_sharing_user_not_eligible` (403), `subscription_sharing_usage_unavailable` (503), `subscription_sharing_unsupported_capability` (400). A limit "can arrive as `response.failed` ... after streaming has begun."
- "OpenAI does not silently switch the request to another billing path."
- Hosted paid apps need OpenAI's approval (obtained). The open-source flow (`dynamic_agent_client`, loopback redirect) does not apply to a hosted web app.

## Decisions

1. **One seam, one param.** `provider` (`needt` | `chatgpt_plan`) on `/api/ai/chat`; `getConfiguredSchedulerAI(userId, {provider})` returns today's result unless the plan is asked for and available. `ChatGptPlanProvider` implements `SchedulerAI` (`streamTurn`, `streamChat`), so the agent loop is unchanged. Other AI routes keep Needt AI.
2. **Fallback only before the first event.** Text already shown cannot be unsaid and tool calls only come after `response.completed`, so a failure after the first yielded event ends the turn in a clear state. Before it, the fallback is the person's own key (free to Needt, `charged:false`) else the hosted quota (`claimHostedAiAction`, `charged:true`). The wait lane for slow mode is kept.
3. **Free.** Production sets `NEEDT_AI_FREE_ACTION_CAP` so Free has no hosted AI; the fallback just asks the hosted quota, so Free sees `plan_limit_reached`.
4. **Tokens** reuse `AIOAuthConnection` (new `CHATGPT_PLAN` provider, `accountLabel`) and `AIOAuthState`, encrypted with `AI_ENCRYPTION_KEY`. The nonce is derived from the one-use `state`, so no state column is needed.
5. **No `jose`.** It is not a declared dependency, so the ID token is checked with Node `crypto` against the JWKS from OpenID discovery (cached 10 minutes).
6. **Plan is not plan-gated.** It costs Needt nothing, like a bring-your-own key.

## To confirm with OpenAI

- The redirect URI registered for the client must be exactly `${NEXTAUTH_URL}/api/ai/chatgpt-plan/callback`.
- Whether the hosted client gets a secret. `OPENAI_SIWC_CLIENT_SECRET` is optional and sent only if set.
- The hosted-client authorize parameters (`ext_agent_host_id`, `agent_name_hint` are open-source only and are not sent).

## Unverified

- **The namespace tool shape** (`{type:"namespace", name:"needt", tools:[{type:"function",...}]}`, with `namespace` on echoed `function_call` items) follows the public function-calling guide; the limitations page gives no schema. Not tested against the plan route. If it answers `subscription_sharing_unsupported_capability` with param `tools`, switch to `additional_tools` input items (see the //todo in `request.ts`). Until verified live, expect agent tool calls on the plan to be the first thing to check.
