"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/**
 * Speaking an Answer (interview simulator ticket 06). The browser's own speech recognition does the
 * transcribing, in the page, and only the resulting text is ever sent: **no audio is recorded,
 * uploaded, or stored** at any point. There is no `MediaRecorder` here and no audio blob — the API
 * below hands back text and nothing else, which is the whole privacy claim, enforced by there being
 * no other code path.
 *
 * The API is prefixed in every browser that has it, and absent in the ones that don't (Firefox, and
 * Safari before 14.1). Where it is absent, `supported` is false from the first render and the page
 * offers no run at all — answers are spoken only (practice feedback ticket 02) — rather than failing
 * confusingly.
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
  /** The recogniser detected speech — not just sound — and stopped detecting it. */
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
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
 * of `false`: the server renders the unsupported note, and the browser swaps to the real set-up on hydration
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
  /**
   * The recogniser is detecting speech right now. Read from the API's own `speechstart` and
   * `speechend` events rather than a level meter: measuring loudness would mean opening a second
   * microphone stream alongside the recogniser, which is exactly the handling of raw audio this
   * feature promises not to do.
   */
  hearing: boolean;
  /** Everything recognised so far this question, final results only. */
  transcript: string;
  /**
   * What is being said right now, not yet settled. Kept through `stop()` rather than cleared, so the
   * last sentence spoken before Submit is sent too instead of being lost to the recogniser's lag.
   */
  interim: string;
  /** Set when recognition stopped for a reason worth telling the Tenant about — a refused mic, say. */
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Clears everything for the next question. */
  reset: () => void;
};

/** Stops lasting less than this count as the recogniser failing to start, not the Tenant pausing. */
const QUICK_END_MS = 1_000;

/** This many quick stops in a row and the page stops restarting it, rather than spin. */
const QUICK_ENDS_BEFORE_GIVING_UP = 3;

const STALLED = "The microphone keeps stopping, so this answer can’t be heard.";

const ERRORS: Record<string, string> = {
  "not-allowed": "This browser won’t let the page use your microphone. Allow it in your browser’s settings.",
  "service-not-allowed": "This browser won’t let the page use your microphone. Allow it in your browser’s settings.",
  "audio-capture": "No microphone was found. Plug one in.",
  network: "Speech recognition needs a connection and couldn’t reach it.",
};

/** What a running recogniser reaches back into: the hook's refs and state setters. */
type Recogniser = {
  recognition: React.RefObject<SpeechRecognitionLike | null>;
  /**
   * Whether the page wants the microphone on. Browsers end continuous recognition on their own after a
   * stretch of silence; while this is true, `run` starts it again straight from the `end` event, so a
   * Tenant pausing to think never comes back to a dead microphone. It follows the recogniser's own
   * events rather than React's renders: a recogniser that starts and ends within one render would
   * otherwise never be restarted at all.
   */
  wanted: React.RefObject<boolean>;
  /**
   * Ends in a row that came less than a second after a start. Restarting on every end is what keeps a
   * pause from killing the microphone — but a browser that ends it immediately, every time, would turn
   * that into a tight loop. After a few quick ends in a row, `run` gives up and says so.
   */
  quickEnds: React.RefObject<number>;
  setListening: (listening: boolean) => void;
  setHearing: (hearing: boolean) => void;
  setTranscript: React.Dispatch<React.SetStateAction<string>>;
  setInterim: (interim: string) => void;
  setError: (error: string | null) => void;
};

/** Stops wanting the microphone, and shows it off — with the reason, when there is one to tell. */
function giveUp(r: Recogniser, message: string | null) {
  r.wanted.current = false;
  r.recognition.current = null;
  if (message) r.setError(message);
  r.setListening(false);
  r.setHearing(false);
}

/** One recogniser, wired up and started. Starts another when the browser ends it, while still wanted. */
function run(r: Recogniser) {
  const Recognition = constructorFor();
  if (!Recognition || !r.wanted.current) return;
  // One recogniser at a time: every handler below ignores events from one that has been replaced, so
  // an old instance's late `end` can never mark the new one as not listening.
  r.recognition.current?.abort();
  const instance = new Recognition();
  const isLive = () => r.recognition.current === instance;
  const startedAt = Date.now();
  instance.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
  // An interview answer runs for a minute with pauses in it; without `continuous` the browser stops at
  // the first silence and the Tenant loses the rest of what they say.
  instance.continuous = true;
  instance.interimResults = true;
  instance.onresult = (event) => {
    if (!isLive()) return;
    let settled = "";
    let pending = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) settled += text;
      else pending += text;
    }
    if (settled) r.setTranscript((so) => `${so}${so && !so.endsWith(" ") ? " " : ""}${settled.trim()}`);
    r.setInterim(pending);
  };
  instance.onerror = (event) => {
    if (!isLive()) return;
    // "no-speech" and "aborted" are ordinary: the Tenant paused, or the page stopped it. Anything with
    // a message is a reason the Tenant needs to hear — and a reason not to restart.
    const message = event.error ? ERRORS[event.error] : undefined;
    if (message) giveUp(r, message);
  };
  instance.onspeechstart = () => isLive() && r.setHearing(true);
  instance.onspeechend = () => isLive() && r.setHearing(false);
  instance.onend = () => {
    if (!isLive()) return;
    r.setHearing(false);
    r.quickEnds.current = Date.now() - startedAt < QUICK_END_MS ? r.quickEnds.current + 1 : 0;
    if (r.quickEnds.current >= QUICK_ENDS_BEFORE_GIVING_UP) return giveUp(r, STALLED);
    // Still wanted: start again, staying "listening" throughout, so the soundwave doesn't flicker off
    // and on through every thinking pause.
    if (r.wanted.current) return run(r);
    r.recognition.current = null;
    r.setListening(false);
  };
  r.recognition.current = instance;
  try {
    instance.start();
    r.setListening(true);
  } catch {
    // Refused outright: not listening is the honest state to show.
    giveUp(r, null);
  }
}

export function useSpeech(): Speech {
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const wanted = useRef(false);
  const quickEnds = useRef(0);
  const [listening, setListening] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recogniser = useMemo<Recogniser>(
    () => ({ recognition, wanted, quickEnds, setListening, setHearing, setTranscript, setInterim, setError }),
    [],
  );

  // Torn down on unmount — so navigating away, or the countdown ending the Attempt, always stops the
  // microphone.
  useEffect(() => {
    return () => {
      wanted.current = false;
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (wanted.current) return;
    wanted.current = true;
    quickEnds.current = 0;
    setError(null);
    run(recogniser);
  }, [recogniser]);

  const stop = useCallback(() => {
    wanted.current = false;
    // Stopped rather than aborted, so a phrase the recogniser was still settling can arrive.
    recognition.current?.stop();
    setListening(false);
    setHearing(false);
  }, []);

  const reset = useCallback(() => {
    wanted.current = false;
    quickEnds.current = 0;
    recognition.current?.abort();
    recognition.current = null;
    setListening(false);
    setHearing(false);
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { listening, hearing, transcript, interim, error, start, stop, reset };
}
