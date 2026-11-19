/**
 * The vocabulary shared by the channel core and every messenger adapter. Nothing
 * here names a messenger: a channel is an opaque string, a chat is an opaque id.
 */

/** What a person can ask for in a channel, after the adapter has read it. */
export type IncomingEvent =
  | { kind: "text"; text: string }
  /** A voice note; the adapter fetches the audio when the core asks for it. */
  | { kind: "voice"; voiceFileRef: string }
  | { kind: "action"; action: PlanActionKind; taskId: string }
  /** Link this chat to the account that made `code`. */
  | { kind: "link"; code: string }
  | { kind: "unlink" }
  /** Anything the bot does not understand, or a bare "start" without a code. */
  | { kind: "help" };

export type PlanActionKind = "done" | "later";

/** One planned task with the two things a person can do to it. */
export interface PlanAction {
  taskId: string;
  action: PlanActionKind;
  /** The task title, for the adapter to label its control. */
  title: string;
}

/**
 * What the core wants shown. `morning` and `evening` are the two daily touches;
 * `reply` answers a message; `update` replaces the message a control was
 * pressed on (when the adapter can) and otherwise is sent as a reply.
 */
export interface OutgoingMessage {
  kind: "morning" | "evening" | "reply" | "update";
  text: string;
  actions: PlanAction[];
}

/** An incoming update after an adapter translated it. */
export interface InboundUpdate {
  externalUpdateId: string;
  externalChatId: string;
  event: IncomingEvent;
  /**
   * An opaque handle the adapter wants back with the answer, for example the
   * message a control sits on. The core never looks inside it.
   */
  ref?: string;
}

/** Where a message goes. */
export interface ChannelTarget {
  channel: string;
  externalChatId: string;
}

export interface AudioPayload {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ChannelAdapter {
  readonly channel: string;
  /** True only for a request that carries the channel's own secret. */
  verify(request: Request): boolean;
  /** Reads the request body; null for an update the bot does not handle. */
  parseUpdate(request: Request): Promise<InboundUpdate | null>;
  send(
    target: ChannelTarget,
    message: OutgoingMessage,
    ref?: string
  ): Promise<void>;
  /** Acknowledges a control press that gets no message back (stops its spinner). */
  ack?(ref: string): Promise<void>;
  /** Fetches the audio of a voice note, when the channel has any. */
  loadVoice?(voiceFileRef: string): Promise<AudioPayload | null>;
}
