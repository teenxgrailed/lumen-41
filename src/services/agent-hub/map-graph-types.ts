/** The Agents Map's compact links and counts (`?graph=1` on the overview). */
export interface MapGraph {
  /** Start of the first day counted, UTC. */
  since: string;
  /** Agent id -> events per UTC day, oldest first, today last. */
  activity: Record<string, number[]>;
  /** Threads as links only: no subject, no text. */
  threads: { id: string; itemId: string | null; lastMessageAt: string }[];
  messagesThisWeek: number;
}
