import type { AudioPayload } from "./types";

export type TranscribeResult = { text: string } | { unavailable: true };

/**
 * Speech to text for voice replies. Only the interface exists today: no
 * provider is approved, so `defaultTranscriber` always answers `unavailable`
 * and the bot asks for text. A provider plugs in by replacing the default.
 *
 * `load` fetches the audio lazily, so with no provider nothing is downloaded.
 */
export interface Transcriber {
  transcribe(audio: {
    load: () => Promise<AudioPayload | null>;
  }): Promise<TranscribeResult>;
}

//todo: choose a speech-to-text provider with the owner (cost per minute, where
// the audio is processed, retention) and implement Transcriber behind the AI
// settings layer. Until then voice replies are answered with "send text".
export const defaultTranscriber: Transcriber = {
  async transcribe() {
    return { unavailable: true };
  },
};
