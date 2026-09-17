"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * Asking a question aloud (practice round ticket 02). When a Tenant answers by speaking, the browser's
 * own voice reads each question as it comes up, and the question counts as **asked** — the moment its
 * clock and microphone start — only once the voice is done with it.
 *
 * Asked is a one-way latch per question: the voice finishing, failing, being skipped, or overrunning its
 * guard all end it, and nothing starts it again. So a Tenant who switches to speaking partway through a
 * question is never read it — its clock is already running. Where the browser has no speech synthesis,
 * the question is asked from the start, exactly as before there was a voice; no message, because there
 * is nothing the Tenant can do about it.
 */

/** Whether the browser can speak — a fact that cannot change while the page is open. */
const neverChanges = () => () => {};

function synthesisAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/**
 * Read as an external store with a server snapshot of `false`, like speech recognition's support
 * (`use-speech.ts`): no hydration mismatch, and no effect to set something that never changes.
 */
export function useSpeechSynthesisSupported(): boolean {
  return useSyncExternalStore(neverChanges, synthesisAvailable, () => false);
}

/** How long the voice is given, in ms, before the question counts as asked anyway: 80 ms a character plus 2 s, at most 20 s. */
export function askGuardMs(text: string): number {
  return Math.min(text.length * 80 + 2_000, 20_000);
}

export type AskAloud = {
  /** The voice is reading the question: its clock stands still and the microphone is off. */
  asking: boolean;
  /** Stops the voice; the question counts as asked at once. */
  skip: () => void;
};

/**
 * Reads `text` aloud once, on mount, when `speaking` and the browser can. Keyed by the caller to one
 * question, so the next question is a fresh read.
 */
export function useAskAloud(text: string, speaking: boolean): AskAloud {
  const supported = useSpeechSynthesisSupported();
  // Whether this question is still to be asked. Starts true only for a question that will be read —
  // `supported` is already the browser's answer by the time a question mounts after hydration.
  const [pending, setPending] = useState(() => speaking && synthesisAvailable());
  const asking = pending && speaking && supported;

  useEffect(() => {
    if (!asking) return;
    const synth = window.speechSynthesis;
    let settled = false;
    const asked = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(guard);
      setPending(false);
    };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || "en-US";
    utterance.onend = asked;
    utterance.onerror = asked;
    const guard = window.setTimeout(() => {
      synth.cancel();
      asked();
    }, askGuardMs(text));
    try {
      // Only cancel what is actually playing: Chrome can drop an utterance spoken straight after a cancel.
      if (synth.speaking || synth.pending) synth.cancel();
      synth.speak(utterance);
    } catch {
      asked();
    }
    return () => {
      // The question was skipped, answered, or left: the voice stops with it, and its own late `end` or
      // `error` from the cancel is ignored.
      settled = true;
      window.clearTimeout(guard);
      synth.cancel();
    };
  }, [asking, text]);

  const skip = useCallback(() => setPending(false), []);

  return { asking, skip };
}
