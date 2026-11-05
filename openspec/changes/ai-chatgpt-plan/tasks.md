# Tasks

- [x] 1. Flag `ai_chatgpt_plan`, env `OPENAI_SIWC_CLIENT_ID` (+ optional secret and model), additive migrations.
- [x] 2. OAuth: PKCE, state, nonce, code exchange, ID token check, locked refresh, revoke.
- [x] 3. Responses request builder (param stripping, namespace tools).
- [x] 4. `ChatGptPlanProvider` with fallback before the first event.
- [x] 5. `provider` param in `/api/ai/chat`, `getConfiguredSchedulerAI`, `provider` metadata in `meta` and `done`, end-state responses.
- [x] 6. Routes: `GET/DELETE /api/ai/chatgpt-plan`, `/authorize`, `/callback`; 404 when off.
- [x] 7. Tests: PKCE/state, ID token, refresh lock and delete rule, param stripping, fallback before/after the first event, `charged`, invisibility.
- [ ] 8. Verify the namespace tool shape live; register the redirect URI and set the client id in production.
- [ ] 9. Turn the flag on for one account, then connect, chat, hit a limit.
- [ ] 10. UI (provider chip in Chat, settings card) in the screens that own them.
