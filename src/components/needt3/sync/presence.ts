export interface Peer {
  name: string;
  color: string;
}

/**
 * The people in the room other than you. Awareness lists every client,
 * including this tab, so drop this tab's own state and any state that carries
 * your own name and colour (the same account open in another tab). Entries
 * without a name and colour are not people.
 */
export function otherPeers(
  states: ReadonlyArray<{ clientId?: number; user?: unknown }>,
  selfClientId: number,
  self: Peer | null
): Peer[] {
  return states.flatMap((state) => {
    if (state.clientId === selfClientId) return [];
    const user = state.user as { name?: unknown; color?: unknown } | undefined;
    if (typeof user?.name !== "string" || typeof user.color !== "string")
      return [];
    if (self && self.name === user.name && self.color === user.color) return [];
    return [{ name: user.name, color: user.color }];
  });
}
