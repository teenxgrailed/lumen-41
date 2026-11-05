-- Needt AI on the person's own ChatGPT plan, PR 1. Expand only: one more
-- AIProvider value for AIOAuthConnection / AIOAuthState rows. Kept in its own
-- migration because ALTER TYPE ... ADD VALUE must not share a transaction
-- with any use of the new value. Behind the ai_chatgpt_plan flag (off).

ALTER TYPE "AIProvider" ADD VALUE 'CHATGPT_PLAN';
