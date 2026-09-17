import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { askGuardMs, useAskAloud } from "@/components/interview/use-ask-aloud";

/**
 * Asking a question aloud (practice round ticket 02), against a stand-in for the browser's speech
 * synthesis. The hook's whole promise is when a question counts as asked: when the voice finishes, fails,
 * is skipped, or overruns its guard — and at once where there is no voice at all.
 */

type FakeUtterance = { text: string; lang: string; onend: (() => void) | null; onerror: (() => void) | null };

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
  it("PR-A1: reads the question in the page's language, and it is being asked until the voice finishes", () => {
    const { result } = renderHook(() => useAskAloud("Tell me about yourself.", true));

    expect(result.current.asking).toBe(true);
    expect(lastUtterance().text).toBe("Tell me about yourself.");
    expect(lastUtterance().lang).toBe(navigator.language);

    act(() => lastUtterance().onend?.());

    expect(result.current.asking).toBe(false);
  });

  it("PR-A2: a voice that fails counts as asked, with nothing to tell the Tenant", () => {
    const { result } = renderHook(() => useAskAloud("Tell me about yourself.", true));

    act(() => lastUtterance().onerror?.());

    expect(result.current.asking).toBe(false);
  });

  it("PR-A3: skipping stops the voice and the question counts as asked at once", () => {
    const { result } = renderHook(() => useAskAloud("Tell me about yourself.", true));

    act(() => result.current.skip());

    expect(result.current.asking).toBe(false);
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("PR-A4: a voice that never finishes is cancelled by its guard, so the clock can never be frozen", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const text = "Tell me about yourself.";
    const { result } = renderHook(() => useAskAloud(text, true));

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
    const { result } = renderHook(() => useAskAloud("Tell me about yourself.", true));

    expect(result.current.asking).toBe(false);
  });

  it("PR-A7: answering by typing never reads the question", () => {
    const { result } = renderHook(() => useAskAloud("Tell me about yourself.", false));

    expect(result.current.asking).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("PR-A8: a question that goes away mid-read stops the voice", () => {
    const { unmount } = renderHook(() => useAskAloud("Tell me about yourself.", true));
    synth.cancel.mockClear();

    unmount();

    expect(synth.cancel).toHaveBeenCalled();
  });
});
