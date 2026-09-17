import { act } from "@testing-library/react";

/**
 * A stand-in for the browser's speech recogniser, for component tests. Every instance the page makes is
 * kept, so a test can play the part of the browser: hear speech, return a transcript, end on its own, or
 * refuse. Answers are spoken only (practice feedback ticket 02), so any test that runs a question needs it.
 */
export type FakeRecognition = {
  started: boolean;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
};

export const speech = {
  recognisers: [] as FakeRecognition[],
  /** When set, the fake ends the moment it starts — a browser that won't keep a microphone open. */
  endsAtOnce: false,
};

/** Installs the fake (or removes speech recognition altogether), and forgets every earlier instance. */
export function setSpeechSupport(supported: boolean) {
  speech.recognisers = [];
  speech.endsAtOnce = false;
  const holder = window as unknown as { SpeechRecognition?: unknown };
  if (!supported) {
    delete holder.SpeechRecognition;
    return;
  }
  holder.SpeechRecognition = class implements FakeRecognition {
    lang = "";
    continuous = false;
    interimResults = false;
    started = false;
    onresult: FakeRecognition["onresult"] = null;
    onend: FakeRecognition["onend"] = null;
    onerror: FakeRecognition["onerror"] = null;
    onspeechstart: FakeRecognition["onspeechstart"] = null;
    onspeechend: FakeRecognition["onspeechend"] = null;
    constructor() {
      speech.recognisers.push(this);
    }
    start() {
      this.started = true;
      if (speech.endsAtOnce) queueMicrotask(() => this.onend?.());
    }
    stop() {
      this.started = false;
      this.onend?.();
    }
    abort() {
      this.started = false;
    }
  };
}

export const latestRecogniser = () => speech.recognisers[speech.recognisers.length - 1];

/** Plays the browser settling on some words. */
export function hear(text: string) {
  act(() => {
    latestRecogniser().onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
  });
}

/** Plays the browser refusing the microphone, or failing some other way the Tenant must hear about. */
export function refuse(error: string) {
  const recogniser = latestRecogniser();
  act(() => {
    recogniser.onerror?.({ error });
    // As in a browser, an error ends recognition.
    recogniser.started = false;
    recogniser.onend?.();
  });
}
