"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictation for the chat's text fields, through the browser's Web Speech API
 * where there is one (Chrome, Edge, Safari). Nothing is sent by Needt: the
 * browser does the listening, and only its final words land in the field.
 * Where the API is missing `supported` is false and the mic is not drawn.
 */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(onWords: (words: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const words = useRef(onWords);
  words.current = onWords;

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => rec.current?.abort();
  }, []);

  const toggle = useCallback(() => {
    if (rec.current) {
      rec.current.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (event) => {
      let said = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) said += result[0].transcript;
      }
      if (said.trim()) words.current(said.trim());
    };
    const end = () => {
      rec.current = null;
      setListening(false);
    };
    r.onend = end;
    r.onerror = end;
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      end();
    }
  }, []);

  return { supported, listening, toggle };
}
