import { registerBearerResolver } from "@/services/connectors/bearer";

import { resolveAgentToken } from "./tokens";

/**
 * Side-effect import: makes `authenticateBearer` understand `needt_agent_`
 * tokens. Imported by the MCP route and by `connectors/auth.ts`, which every
 * `/api/connect/*` route goes through.
 */
registerBearerResolver(resolveAgentToken);
