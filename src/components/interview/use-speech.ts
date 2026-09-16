"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Speaking an Answer (interview simulator ticket 06). The browser's own speech recognition does the
 * transcribing, in the page, and only the resulting text is ever sent: **no audio is recorded,
 * uploaded, or stored** at any point. There is no `MediaRecorder` here and no audio blob — the API
 * below hands back text and nothing else, which is the whole privacy claim, enforced by there being
 * no other code path.
 *
 * The API is prefixed in every browser that has it, and absent in the ones that don't (Firefox, and
 * Safari before 14.1). Where it is absent, `supported` is false from the first render and the page
 * offers typing instead of failing confusingly.
 */

/** The slice of the Web Speech API this uses. Typed here because `lib.dom` still doesn't carry it. */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function constructorFor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

/** Whether the browser has the API — a fact that cannot change while the page is open. */
const neverChanges = () => () => {};

/**
 * Whether this browser can transcribe speech.
 *
 * Feature detection is a client-only fact, so it is read as an external store with a server snapshot
 * of `false`: the server renders the typing fallback, and the browser swaps to speaking on hydration
 * without the two disagreeing. Reading it during render instead would be a hydration mismatch, and
 * setting it from an effect a cascading render for something that never changes.
 */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => constructorFor() !== null,
    () => false,
  );
}

export type Speech = {
  listening: boolean;
  /** Everything recognised so far this question, final results only. */
  transcript: string;
  /** What is being said right now, not yet settled. Shown greyed, never submitted on its own. */
  interim: string;
  /** Set when recognition stopped for a reason worth telling the Tenant about — a refused mic, say. */
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Clears everything for the next question. */
  reset: () => void;
};

const ERRORS: Record<string, string> = {
  "not-allowed": "This browser won’t let the page use your microphone. Allow it, or type your answer instead.",
  "service-not-allowed": "This browser won’t let the page use your microphone. Allow it, or type your answer instead.",
  "audio-capture": "No microphone was found. Plug one in, or type your answer instead.",
  network: "Speech recognition needs a connection and couldn’t reach it. You can type your answer instead.",
};

export function useSpeech(): Speech {
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  // One recogniser for the life of the component, torn down on unmount — so navigating away, or the
  // countdown ending the Attempt, always stops the microphone.
  useEffect(() => {
    return () => {
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const Recognition = constructorFor();
    if (!Recognition) return;
    setError(null);
    const instance = new Recognition();
    instance.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    // An interview answer runs for a minute with pauses in it; without `continuous` the browser
    // stops at the first silence and the Tenant loses the rest of what they say.
    instance.continuous = true;
    instance.interimResults = true;
    instance.onresult = (event) => {
      let settled = "";
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) settled += text;
        else pending += text;
      }
      if (settled) setTranscript((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${settled.trim()}`);
      setInterim(pending);
    };
    instance.onerror = (event) => {
      // "no-speech" and "aborted" are ordinary: the Tenant paused, or we stopped it ourselves.
      const message = event.error ? ERRORS[event.error] : undefined;
      if (message) setError(message);
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
      // Already started, or refused outright: not listening is the honest state to show.
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const reset = useCallback(() => {
    recognition.current?.abort();
    recognition.current = null;
    setListening(false);
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { listening, transcript, interim, error, start, stop, reset };
}
