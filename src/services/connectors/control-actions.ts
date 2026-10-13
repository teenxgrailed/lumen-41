/**
 * The single list of actions accepted by `POST /api/connect/control`.
 * The route rejects anything outside it, and the MCP `needt_control` tool
 * derives its action enum from it, so the two can never drift apart.
 */
export const CONNECTOR_CONTROL_ACTIONS = [
  "overview",
  "create_project",
  "update_project",
  "update_task",
  "complete_task",
  "create_calendar",
  "create_event",
  "update_event",
  "delete_task",
  "delete_project",
  "delete_event",
  "delete_calendar",
  "restore_task",
  "restore_project",
  "restore_event",
  "restore_calendar",
] as const;

export type ConnectorControlAction = (typeof CONNECTOR_CONTROL_ACTIONS)[number];

export function isConnectorControlAction(
  value: unknown
): value is ConnectorControlAction {
  return (
    typeof value === "string" &&
    (CONNECTOR_CONTROL_ACTIONS as readonly string[]).includes(value)
  );
}
