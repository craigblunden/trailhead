import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ASK_START_MS, askGuardMs, primeSpeech, useAskAloud } from "@/components/interview/use-ask-aloud";

/**
 * Asking a question aloud (practice round ticket 02), against a stand-in for the browser's speech
 * synthesis. The hook's whole promise is when a question counts as asked: when the voice finishes, fails,
 * is skipped, or overruns its guard — and at once where there is no voice at all.
 */

type FakeUtterance = {
  text: string;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

let spoken: FakeUtterance[] = [];
const synth = { speaking: false, pending: false, speak: vi.fn(), cancel: vi.fn() };

function setSynthesisSupport(supported: boolean) {
  const holder = window as unknown as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown };
  if (!supported) {
    delete holder.speechSynthesis;
    delete holder.SpeechSynthesisUtterance;
    return;
  }
  holder.speechSynthesis = synth;
  holder.SpeechSynthesisUtterance = class implements FakeUtterance {
    lang = "";
    onstart: FakeUtterance["onstart"] = null;
    onend: FakeUtterance["onend"] = null;
    onerror: FakeUtterance["onerror"] = null;
    constructor(public text: string) {}
  };
}

const lastUtterance = () => spoken[spoken.length - 1];

beforeEach(() => {
  spoken = [];
  synth.speak.mockReset().mockImplementation((utterance: FakeUtterance) => spoken.push(utterance));
  synth.cancel.mockReset();
  setSynthesisSupport(true);
});

afterEach(() => {
  setSynthesisSupport(false);
  vi.useRealTimers();
});

describe("asking a question aloud (practice round ticket 02)", () => {
  it("PR-A1: reads the question in the page's language, not the browser's, and it is being asked until the voice finishes", () => {
    document.documentElement.lang = "en";
    const { result } = renderHook(() => useAskAloud("Tell me about yourself."));

    expect(result.current.asking).toBe(true);
    expect(lastUtterance().text).toBe("Tell me about yourself.");
    expect(lastUtterance().lang).toBe("en");

    act(() => lastUtterance().onend?.());

    expect(result.current.asking).toBe(false);
  });

  it("PR-A2: a voice that fails counts as asked, with nothing to tell the Tenant", () => {
    const { result } = renderHook(() => useAskAloud("Tell me about yourself."));

    act(() => lastUtterance().onerror?.());

    expect(result.current.asking).toBe(false);
  });

  it("PR-A3: skipping stops the voice and the question counts as asked at once", () => {
    const { result } = renderHook(() => useAskAloud("Tell me about yourself."));

    act(() => result.current.skip());

    expect(result.current.asking).toBe(false);
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("PR-A4: a voice that never finishes is cancelled by its guard, so the clock can never be frozen", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const text = "Tell me about yourself.";
    const { result } = renderHook(() => useAskAloud(text));
    act(() => lastUtterance().onstart?.());

    act(() => vi.advanceTimersByTime(askGuardMs(text) - 1));
    expect(result.current.asking).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.asking).toBe(false);
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("PR-A5: the guard is the question's length at 80 ms a character plus two seconds, and never more than twenty", () => {
    expect(askGuardMs("x".repeat(100))).toBe(10_000);
    expect(askGuardMs("x".repeat(1_000))).toBe(20_000);
  });

  it("PR-A6: a browser with no speech synthesis has asked the question already", () => {
    setSynthesisSupport(false);
    const { result } = renderHook(() => useAskAloud("Tell me about yourself."));

    expect(result.current.asking).toBe(false);
  });

  it("PR-A9: a voice that hasn't begun within a second and a half is given up on, so a silent browser doesn't hold the clock (practice feedback ticket 03)", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result } = renderHook(() => useAskAloud("Tell me about yourself."));

    act(() => vi.advanceTimersByTime(ASK_START_MS - 1));
    expect(result.current.asking).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.asking).toBe(false);
    expect(synth.cancel).toHaveBeenCalled();
    expect(ASK_START_MS).toBe(1_500);
  });

  it("PR-A10: a voice that has begun is not cut off at a second and a half", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result } = renderHook(() => useAskAloud("Tell me about yourself."));

    act(() => lastUtterance().onstart?.());
    act(() => vi.advanceTimersByTime(ASK_START_MS + 500));

    expect(result.current.asking).toBe(true);
  });

  it("PR-A11: priming speaks nothing, inside the tap, so a phone lets the question be read after the network (practice feedback ticket 03)", () => {
    primeSpeech();

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(lastUtterance().text).toBe("");
  });

  it("PR-A12: priming where there is no speech synthesis does nothing", () => {
    setSynthesisSupport(false);

    expect(() => primeSpeech()).not.toThrow();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("PR-A13: a primer still settling is not cancelled when the question is read — the question queues behind it", () => {
    primeSpeech();
    synth.pending = true;
    try {
      renderHook(() => useAskAloud("Tell me about yourself."));
      expect(synth.cancel).not.toHaveBeenCalled();
      expect(lastUtterance().text).toBe("Tell me about yourself.");
    } finally {
      synth.pending = false;
    }
  });

  it("PR-A8: a question that goes away mid-read stops the voice", () => {
    const { unmount } = renderHook(() => useAskAloud("Tell me about yourself."));
    synth.cancel.mockClear();

    unmount();

    expect(synth.cancel).toHaveBeenCalled();
  });
});
