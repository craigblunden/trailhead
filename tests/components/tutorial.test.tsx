import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { InterviewPanel } from "@/components/interview/interview-panel";
import type { InterviewClient } from "@/components/interview/interview-client";
import { PracticePanel } from "@/components/interview/practice-panel";
import type { PracticeClient } from "@/components/interview/practice-client";
import { TutorialPanel } from "@/components/interview/tutorial-panel";
import { SPEAK_UNSUPPORTED } from "@/lib/interview";
import type { Job } from "@/lib/jobs";
import type { Plan } from "@/lib/plans";
import { TUTORIAL_QUESTION, TUTORIAL_SEEN_KEY } from "@/lib/tutorial";
import { allowMicrophone, hear, latestRecogniser, refuse, setSpeechSupport, speech } from "../fakes/speech-recognition";
import { SEED_JOBS } from "../fixtures/jobs";
import { renderWithJobs, screen, userEvent, waitFor, within } from "../test-utils";

/**
 * The Tutorial (practice feedback ticket 06): one guided question on the real run screen, kept nowhere,
 * and the offer of it to a Tenant new to the Simulator. Against a faked speech recogniser and synthesis;
 * there is no client to fake, because a Tutorial never reaches the server.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/interview/tutorial",
  useSelectedLayoutSegment: () => null,
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

type Utterance = { text: string; onstart: (() => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
let utterances: Utterance[] = [];
const voice = { speaking: false, pending: false, speak: vi.fn(), cancel: vi.fn() };
const holder = window as unknown as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown };

beforeEach(() => {
  window.localStorage.clear();
  setSpeechSupport(true);
  utterances = [];
  voice.speak.mockReset().mockImplementation((utterance: Utterance) => {
    utterances.push(utterance);
    utterance.onstart?.();
  });
  voice.cancel.mockReset();
  holder.speechSynthesis = voice;
  holder.SpeechSynthesisUtterance = class {
    onstart = null;
    onend = null;
    onerror = null;
    constructor(public text: string) {}
  };
});

afterEach(() => {
  delete holder.speechSynthesis;
  delete holder.SpeechSynthesisUtterance;
  vi.useRealTimers();
});

const renderTutorial = (plan: Plan = "free") => renderWithJobs(<TutorialPanel plan={plan} />, { initialJobs: SEED_JOBS as Job[] });
const next = () => screen.getByRole("button", { name: "Next" });
const questionRead = () => utterances.find((utterance) => utterance.text === TUTORIAL_QUESTION);

/** Clicks through the two steps before the microphone. */
async function throughToMicrophone(user: ReturnType<typeof userEvent.setup>) {
  await user.click(next());
  await user.click(next());
}

/** Everything up to the Tenant's turn: the steps, the microphone allowed, the question read. */
async function throughToAnswering(user: ReturnType<typeof userEvent.setup>) {
  await throughToMicrophone(user);
  await user.click(screen.getByRole("button", { name: "Turn on my microphone" }));
  allowMicrophone();
  act(() => questionRead()!.onend?.());
}

describe("the Tutorial's steps (practice feedback ticket 06)", () => {
  it("TU-U1: before any clock runs, it points out how many questions there are, then the clock, then the microphone", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderTutorial();

    expect(screen.getByText("Question 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/one at a time/);
    await user.click(next());
    expect(screen.getByRole("note")).toHaveTextContent(/one countdown/);
    await user.click(next());
    expect(screen.getByRole("note")).toHaveTextContent(/microphone/);
    expect(screen.getByRole("button", { name: "Turn on my microphone" })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(screen.getByRole("timer")).toHaveTextContent("1:00 left");
    expect(questionRead()).toBeUndefined();
    expect(speech.recognisers).toHaveLength(0);
  });

  it("TU-U2: turning the microphone on asks the browser for it inside the tap, and once allowed the question is read and it is the Tenant's turn", async () => {
    const user = userEvent.setup();
    renderTutorial();
    await throughToMicrophone(user);

    await user.click(screen.getByRole("button", { name: "Turn on my microphone" }));
    // The voice is primed in the same tap, so a phone lets the question be read after the prompt.
    expect(voice.speak.mock.calls[0][0]).toMatchObject({ text: "" });
    expect(latestRecogniser().started).toBe(true);
    expect(screen.getByText(/Allow the microphone when your browser asks/)).toBeInTheDocument();

    allowMicrophone();
    expect(screen.getByRole("heading", { level: 1, name: TUTORIAL_QUESTION })).toBeInTheDocument();
    expect(questionRead()).toBeDefined();
    act(() => questionRead()!.onend?.());
    expect(screen.getByText("Your turn — start speaking")).toBeInTheDocument();
  });

  it("TU-U3: a refused microphone says why, and can be tried again", async () => {
    const user = userEvent.setup();
    renderTutorial();
    await throughToMicrophone(user);

    await user.click(screen.getByRole("button", { name: "Turn on my microphone" }));
    refuse("not-allowed");

    expect(screen.getByRole("alert")).toHaveTextContent(/won’t let the page use your microphone/);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(latestRecogniser().started).toBe(true);
  });

  it("TU-U4: Submit is pointed out once there are words to submit, not before", async () => {
    const user = userEvent.setup();
    renderTutorial();
    await throughToAnswering(user);

    expect(screen.queryByText("Press Submit when you’ve finished answering.")).not.toBeInTheDocument();
    hear("A design lead at a small studio.");
    expect(screen.getByText("Press Submit when you’ve finished answering.")).toBeInTheDocument();
  });

  it("TU-U5: the end reads back what was said, and remembers the Tutorial is done on this device", async () => {
    const user = userEvent.setup();
    renderTutorial();
    await throughToAnswering(user);
    hear("A design lead at a small studio.");

    await user.click(screen.getByRole("button", { name: "Submit final answer" }));

    expect(await screen.findByText("That’s how every question works.")).toBeInTheDocument();
    expect(screen.getByText("A design lead at a small studio.")).toBeInTheDocument();
    expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).not.toBeNull();
  });

  it.each([
    ["free", "Start a practice round", "/interview/practice"],
    ["basic", "Start a practice round", "/interview/practice"],
    ["pro", "Choose a job", "/interview"],
  ] as const)("TU-U6: on %s, the end leads to %s", async (plan, name, href) => {
    const user = userEvent.setup();
    renderTutorial(plan);
    await throughToAnswering(user);
    hear("An answer.");
    await user.click(screen.getByRole("button", { name: "Submit final answer" }));

    expect(await screen.findByRole("link", { name })).toHaveAttribute("href", href);
  });

  it("TU-U7: Go through it again starts from the first step", async () => {
    const user = userEvent.setup();
    renderTutorial();
    await throughToAnswering(user);
    hear("An answer.");
    await user.click(screen.getByRole("button", { name: "Submit final answer" }));

    await user.click(await screen.findByRole("button", { name: "Go through it again" }));

    expect(screen.getByRole("note")).toHaveTextContent(/one at a time/);
  });

  it("TU-U8: the clock running out ends it the same way", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderTutorial();
    await throughToAnswering(user);
    hear("Half an");

    await act(() => vi.advanceTimersByTimeAsync(61_000));

    await waitFor(() => expect(screen.getByText("That’s how every question works.")).toBeInTheDocument());
    expect(screen.getByText("Half an")).toBeInTheDocument();
  });

  it("TU-U9: skipping it remembers it on this device, and leads on as the end does", async () => {
    const user = userEvent.setup();
    renderTutorial("free");

    const skip = screen.getByRole("link", { name: "Skip the tutorial" });
    expect(skip).toHaveAttribute("href", "/interview/practice");
    await user.click(skip);

    expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).not.toBeNull();
  });

  it("TU-U10: a browser that can't transcribe speech is told so, with nothing to start", () => {
    setSpeechSupport(false);
    renderTutorial();

    expect(screen.getByText(SPEAK_UNSUPPORTED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("TU-U11: its steps and its run have no accessibility violations", async () => {
    const user = userEvent.setup();
    const { container } = renderTutorial();
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();

    await throughToAnswering(user);
    hear("An answer.");
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("offering the Tutorial (practice feedback ticket 06)", () => {
  const renderHub = (plan: Plan, newToSimulator: boolean) =>
    renderWithJobs(
      <InterviewPanel
        job={null}
        plan={plan}
        attempt={null}
        quota={null}
        available
        practice={plan === "pro" ? null : { unfinished: false }}
        newToSimulator={newToSimulator}
        client={{} as InterviewClient}
      />,
      { initialJobs: SEED_JOBS as Job[] },
    );

  it.each(["free", "pro"] as const)("TU-U12: a %s Tenant new to the Simulator is offered it on the hub, and can skip it for good", async (plan) => {
    const user = userEvent.setup();
    const { unmount } = renderHub(plan, true);

    const offer = screen.getByRole("region", { name: "New to the Interview Simulator?" });
    expect(within(offer).getByRole("link", { name: "Take the tutorial" })).toHaveAttribute("href", "/interview/tutorial");
    await user.click(within(offer).getByRole("button", { name: "Skip" }));

    expect(screen.queryByRole("region", { name: "New to the Interview Simulator?" })).not.toBeInTheDocument();
    unmount();
    renderHub(plan, true);
    expect(screen.queryByRole("region", { name: "New to the Interview Simulator?" })).not.toBeInTheDocument();
  });

  it("TU-U13: a Tenant who has finished a run is not offered it — but the Tutorial is always a link away", () => {
    renderHub("free", false);

    expect(screen.queryByRole("region", { name: "New to the Interview Simulator?" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Take the tutorial" })).toHaveAttribute("href", "/interview/tutorial");
  });

  it("TU-U14: the Practice round's set-up offers it above Go", () => {
    renderWithJobs(<PracticePanel round={null} newToSimulator client={{} as PracticeClient} />, {
      initialJobs: SEED_JOBS as Job[],
    });

    expect(screen.getByRole("region", { name: "New to the Interview Simulator?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("TU-U15: a browser that can't transcribe speech is offered nothing", () => {
    setSpeechSupport(false);
    renderHub("free", true);

    expect(screen.queryByRole("region", { name: "New to the Interview Simulator?" })).not.toBeInTheDocument();
  });
});
