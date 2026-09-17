import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { InterviewPanel } from "@/components/interview/interview-panel";
import type { PathJob } from "@/components/interview/interview-path";
import type { InterviewClient } from "@/components/interview/interview-client";
import { ScoreStars } from "@/components/interview/score-stars";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  INTERVIEW_FAILURES,
  SPEAK_RECOMMENDED,
  SPEAK_UNSUPPORTED,
  type Attempt,
  type AttemptLength,
  type Category,
  type InterviewQuotaStatus,
} from "@/lib/interview";
import type { Job } from "@/lib/jobs";
import type { Plan } from "@/lib/plans";
import { SEED_JOBS } from "../fixtures/jobs";
import { render, renderWithJobs, screen, userEvent, waitFor, within } from "../test-utils";

/**
 * The Interview Simulator's screens (interview simulator tickets 02–08), against a faked client —
 * the seam the page takes to the Route Handlers — and a faked speech recogniser. Everything else is
 * real: the phase the page is in comes from the Attempt it was handed, exactly as it does in the app.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/interview",
  useSelectedLayoutSegment: () => null,
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const fixtureJob: Job = SEED_JOBS.find((candidate) => candidate.id === "fernwood-product-designer-growth")!;

/** The chosen job, as the page hands it to the path. Ready unless a test says otherwise. */
const job: PathJob = {
  id: fixtureJob.id,
  company: fixtureJob.company,
  role: fixtureJob.role,
  accent: fixtureJob.accent,
  stage: fixtureJob.stage,
  readiness: "ready",
};

/** The seam the page takes to the Route Handlers. Cast at the render site, so each keeps its `Mock` type. */
const client = vi.hoisted(() => ({
  start: vi.fn(),
  answer: vi.fn(),
  timeUp: vi.fn(),
  score: vi.fn(),
}));

const quota = (remaining: number): InterviewQuotaStatus => ({
  limit: 10,
  used: 10 - remaining,
  remaining,
  resetsOn: "2026-09-21",
});

let nextId = 0;

/** An Attempt of `length`, with one question per Category and `answered` of them answered. */
function attemptOf({
  length = 5,
  answered = 0,
  scored = false,
}: { length?: AttemptLength; answered?: number; scored?: boolean } = {}): Attempt {
  const questions = CATEGORIES.map((category, order) => ({
    id: `q${order}`,
    category: category as Category,
    order,
    text: `A ${category} question?`,
    ...(order < answered || scored
      ? {
          answer: {
            transcript: order < answered ? `My ${category} answer.` : "",
            score: scored ? 60 + order * 5 : null,
            rationale: scored ? `Because of the ${category} thing.` : "",
          },
        }
      : {}),
  }));
  return {
    id: `attempt-${(nextId += 1)}`,
    jobId: job.id,
    length,
    activeSeconds: answered * 20,
    completedAt: scored || answered === questions.length ? "2026-09-16T10:00:00.000Z" : null,
    overallScore: scored ? 70 : null,
    questions,
  };
}

/**
 * A stand-in for the browser's speech recogniser. Every instance the page makes is kept, so a test
 * can play the part of the browser: hear speech, return a transcript, end on its own.
 */
type FakeRecognition = {
  started: boolean;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
};

let recognisers: FakeRecognition[] = [];
/** When set, the fake ends the moment it starts — a browser that won't keep a microphone open. */
let endsAtOnce = false;

function setSpeechSupport(supported: boolean) {
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
      recognisers.push(this);
    }
    start() {
      this.started = true;
      if (endsAtOnce) queueMicrotask(() => this.onend?.());
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

const latestRecogniser = () => recognisers[recognisers.length - 1];

/** Plays the browser settling on some words. */
function hear(text: string) {
  act(() => {
    latestRecogniser().onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
  });
}

function renderPanel({
  plan = "pro" as Plan,
  job: chosen = job as PathJob | null,
  jobs = SEED_JOBS as Job[],
  attempt = null as Attempt | null,
  remaining = 9,
  available = true,
  speech = true,
} = {}) {
  setSpeechSupport(speech);
  return renderWithJobs(
    <InterviewPanel
      job={chosen}
      plan={plan}
      attempt={attempt}
      quota={quota(remaining)}
      available={available}
      client={client as unknown as InterviewClient}
    />,
    { initialJobs: jobs },
  );
}

const go = () => screen.getByRole("button", { name: "Go" });
const lengthButton = (minutes: number) => screen.getByRole("button", { name: new RegExp(`^${minutes}\\s*minutes`) });
const submitButton = () => screen.getByRole("button", { name: /^Submit (final )?answer$/ });

beforeEach(() => {
  for (const mock of Object.values(client)) mock.mockReset();
  recognisers = [];
  endsAtOnce = false;
  setSpeechSupport(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("step one: which job (ticket 07)", () => {
  const board = [
    { ...fixtureJob, id: "ready-1", company: "Fernwood", role: "Product Designer, Growth" },
    { ...fixtureJob, id: "no-resume-1", company: "Harvest", role: "Senior UX Researcher", resume: null },
    { ...fixtureJob, id: "no-posting-1", company: "Meridian Labs", role: "Design Systems Lead", description: "  " },
  ];

  it("IV-U1: searches by role or company, and each result is a link to that job's path", async () => {
    const { user } = renderPanel({ job: null, jobs: board });
    const box = screen.getByRole("searchbox", { name: "Search your jobs by role or company" });

    await user.type(box, "harvest");
    const byCompany = within(screen.getByRole("list", { name: "Matching jobs" })).getAllByRole("link");
    expect(byCompany).toHaveLength(1);
    expect(byCompany[0]).toHaveAttribute("href", "/interview/no-resume-1");

    await user.clear(box);
    await user.type(box, "design");
    const byRole = within(screen.getByRole("list", { name: "Matching jobs" })).getAllByRole("link");
    expect(byRole.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Product Designer, Growth"),
      expect.stringContaining("Design Systems Lead"),
    ]);
  });

  it("IV-U2: a search that matches nothing says so, and offers no rows", async () => {
    const { user } = renderPanel({ job: null, jobs: board });

    await user.type(screen.getByRole("searchbox"), "zzzzz");

    expect(screen.getByRole("status")).toHaveTextContent("No matching jobs.");
    expect(screen.queryByRole("list", { name: "Matching jobs" })).not.toBeInTheDocument();
  });

  it("IV-U3: says which jobs can't be rehearsed yet, and why, before one is chosen", () => {
    renderPanel({ job: null, jobs: board });

    const rows = within(screen.getByRole("list", { name: "Matching jobs" })).getAllByRole("link");
    expect(rows[0]).not.toHaveTextContent(/Needs/);
    expect(rows[1]).toHaveTextContent("Needs a resume");
    expect(rows[2]).toHaveTextContent("Needs the posting");
  });

  it("IV-U4: the list is short and ungrouped, and says how many more there are", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ ...fixtureJob, id: `job-${index}`, role: `Role ${index}` }));
    renderPanel({ job: null, jobs: many });

    expect(within(screen.getByRole("list", { name: "Matching jobs" })).getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 6 of 9 jobs. Type to narrow it down.");
  });

  it("IV-U5: with no job chosen, the next steps are named but closed — there is no Go yet", () => {
    renderPanel({ job: null, jobs: board });

    expect(screen.getByRole("heading", { level: 2, name: "How do you want to rehearse?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Ready when you are" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /minutes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
  });

  it("IV-U6: a chosen job is shown as done, with a way back to choose another", () => {
    renderPanel();

    expect(screen.getByText(job.role)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change job" })).toHaveAttribute("href", "/interview");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("IV-U7: a chosen job that can't be rehearsed says why, links to fixing it, and keeps the rest closed", () => {
    renderPanel({ job: { ...job, readiness: "no-resume" } });

    expect(screen.getByText(INTERVIEW_FAILURES["no-resume"])).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open this job" })).toHaveAttribute("href", `/board/${job.id}`);
    expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
  });
});

describe("steps two and three: set up and Go (tickets 05, 06)", () => {
  it("IV-U8: says up front that the clock doesn't pause between questions", () => {
    renderPanel();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Interview Simulator");
    expect(screen.getByText(/doesn’t pause between them/)).toBeInTheDocument();
  });

  it("IV-U9: offers 5, 10, and 30 minutes to a pro Tenant, and Go sends the chosen one", async () => {
    const { user } = renderPanel();
    client.start.mockResolvedValue({ ok: true, attempt: attemptOf({ length: 30 }), quota: quota(8) });

    for (const minutes of [5, 10, 30]) expect(lengthButton(minutes)).toBeEnabled();
    await user.click(lengthButton(30));
    await user.click(go());

    expect(client.start).toHaveBeenCalledWith(job.id, 30, false);
  });

  it("IV-U10: each length says what it asks across all five areas", async () => {
    const { user } = renderPanel();

    expect(screen.getByText(/1 personal, 1 behavioural, 1 stakeholder, 1 technical, 1 design/)).toBeInTheDocument();
    await user.click(lengthButton(10));
    expect(screen.getByText(/2 personal, 2 behavioural, 2 stakeholder, 2 technical, 2 design/)).toBeInTheDocument();
    await user.click(lengthButton(30));
    expect(screen.getByText(/2 personal, 3 behavioural, 3 stakeholder, 4 technical, 3 design/)).toBeInTheDocument();
  });

  it("IV-U11: speaking is the default where the browser can transcribe, with the reason shown", () => {
    renderPanel({ speech: true });

    expect(screen.getByRole("button", { name: /Speaking/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Typing/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(SPEAK_RECOMMENDED)).toBeInTheDocument();
  });

  it("IV-U12: a browser without speech recognition is offered typing only, with a note saying why", () => {
    renderPanel({ speech: false });

    expect(screen.queryByRole("button", { name: /Speaking/ })).not.toBeInTheDocument();
    expect(screen.getByText(SPEAK_UNSUPPORTED)).toBeInTheDocument();
  });

  it("IV-U13: what is left this week is shown, and nothing left stops Go", () => {
    const { unmount } = renderPanel({ remaining: 3 });
    expect(screen.getByText("3 interviews left this week.")).toBeInTheDocument();
    unmount();

    renderPanel({ remaining: 0 });
    expect(screen.getByText(/You’ve used this week’s interviews/)).toBeInTheDocument();
    expect(go()).toBeDisabled();
  });

  it("IV-U14: while the questions are written, the step says the clock starts straight after", async () => {
    const { user } = renderPanel();
    let finish!: (value: unknown) => void;
    client.start.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    await user.click(go());

    expect(screen.getByRole("status")).toHaveTextContent("Writing your questions…");
    expect(screen.getByText(/with the clock running/)).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    await act(async () => finish({ ok: true, attempt: attemptOf(), quota: quota(8) }));
  });

  it("IV-U15: a refusal is shown in the page's own words, and nothing starts", async () => {
    const { user } = renderPanel();
    client.start.mockResolvedValue({ ok: false, error: "no-resume", message: INTERVIEW_FAILURES["no-resume"], refunded: false });

    await user.click(go());

    expect(await screen.findByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES["no-resume"]);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});

describe("the locked preview (ticket 08)", () => {
  it.each(["free", "basic"] as const)(
    "IV-U16: a %s Tenant sees the real set-up, locked, with no Go and no quota promised",
    (plan) => {
      renderPanel({ plan });

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pro");
      for (const minutes of [5, 10, 30]) expect(lengthButton(minutes)).toBeDisabled();
      expect(screen.getByText(/1 personal, 1 behavioural/)).toBeInTheDocument();
      expect(screen.getByText(/Interview Simulator is a Pro feature/)).toBeInTheDocument();
      // Not a disabled Go — no Go at all.
      expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
      // Their real remaining count is not something they can spend, so it isn't shown.
      expect(screen.queryByText(/interviews? left this week/)).not.toBeInTheDocument();
    },
  );

  it("IV-U17: locked, the set-up is shown before a job is chosen too — the preview is the point", () => {
    renderPanel({ plan: "free", job: null });

    for (const minutes of [5, 10, 30]) expect(lengthButton(minutes)).toBeDisabled();
    expect(screen.getByText(/Interview Simulator is a Pro feature/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
  });

  it("IV-U18: a pro Tenant's path carries no Pro mark", () => {
    renderPanel();

    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("Pro");
  });

  it("IV-U19: the locked preview has no accessibility violations", async () => {
    const { container } = renderPanel({ plan: "basic" });

    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("the interview runs without a pause (ticket 02)", () => {
  it("IV-U15: Go puts the first question up with its clock already running — no second press", async () => {
    // Only the test moves the clock: real time leaking in makes exact seconds flaky on a busy machine.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const { user } = renderPanel({ speech: false });
    client.start.mockResolvedValue({ ok: true, attempt: attemptOf(), quota: quota(8) });

    await user.click(go());

    expect(await screen.findByRole("heading", { level: 1, name: "A personal question?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start answering/ })).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("5:00 left");
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole("timer")).toHaveTextContent("4:50 left");
  });

  it("IV-U16: submitting puts the next question up with the clock still running, and sends what the first cost", async () => {
    // Only the test moves the clock: real time leaking in makes exact seconds flaky on a busy machine.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const typing = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const attempt = attemptOf();
    renderPanel({ attempt, speech: false });
    client.answer.mockResolvedValue({ ok: true, attempt: { ...attemptOf({ answered: 1 }), id: attempt.id } });

    await typing.click(screen.getByRole("button", { name: "Resume" }));
    await typing.type(screen.getByRole("textbox"), "I led the reporting redesign.");
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    await typing.click(submitButton());

    expect(client.answer).toHaveBeenCalledWith(attempt.id, {
      questionId: "q0",
      transcript: "I led the reporting redesign.",
      elapsedSeconds: 20,
    });
    // The next question is up at once — there is nothing to press to begin it — and its clock runs.
    expect(await screen.findByRole("heading", { level: 1, name: "A behavioural question?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByRole("timer")).toHaveTextContent("4:35 left");
  });

  it("IV-U17: the clock stands still while an answer is on its way to the server", async () => {
    // Only the test moves the clock: real time leaking in makes exact seconds flaky on a busy machine.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const typing = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel({ attempt: attemptOf(), speech: false });
    client.answer.mockReturnValue(new Promise(() => {}));

    await typing.click(screen.getByRole("button", { name: "Resume" }));
    await typing.type(screen.getByRole("textbox"), "An answer.");
    await typing.click(submitButton());
    const atSubmit = screen.getByRole("timer").textContent;
    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(screen.getByRole("button", { name: "Saving your answer…" })).toBeDisabled();
    expect(screen.getByRole("timer").textContent).toBe(atSubmit);
  });

  it("IV-U18: an empty answer cannot be submitted", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: false });

    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(submitButton()).toBeDisabled();
  });

  it("IV-U19: the last question says so, and answering it reaches scoring rather than another question", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 4 }), speech: false });
    client.answer.mockResolvedValue({ ok: true, attempt: attemptOf({ answered: 5 }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByText("This is the last question.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "The last one.");
    await user.click(screen.getByRole("button", { name: "Submit final answer" }));

    expect(await screen.findByRole("button", { name: "Score my interview" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("IV-U20: the countdown reaching zero ends the Attempt, and what was typed is never sent", async () => {
    // Only the test moves the clock: real time leaking in makes exact seconds flaky on a busy machine.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const typing = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const nearlyOut: Attempt = { ...attemptOf(), activeSeconds: 299 };
    renderPanel({ attempt: nearlyOut, speech: false });
    client.timeUp.mockResolvedValue({ ok: true, attempt: { ...nearlyOut, completedAt: "2026-09-16T10:00:00.000Z" } });

    await typing.click(screen.getByRole("button", { name: "Resume" }));
    await typing.type(screen.getByRole("textbox"), "Half an answ");
    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() => expect(client.timeUp).toHaveBeenCalledWith(nearlyOut.id));
    expect(client.answer).not.toHaveBeenCalled();
  });

  it("IV-U21: a failed submission keeps the answer and the seconds it cost, so a retry resumes rather than starts over", async () => {
    // Only the test moves the clock: real time leaking in makes exact seconds flaky on a busy machine.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const typing = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel({ attempt: attemptOf(), speech: false });
    client.answer.mockResolvedValueOnce({ ok: false, error: "failed", message: INTERVIEW_FAILURES.failed });

    await typing.click(screen.getByRole("button", { name: "Resume" }));
    await typing.type(screen.getByRole("textbox"), "An answer.");
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    await typing.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES.failed);
    expect(screen.getByRole("textbox")).toHaveValue("An answer.");
    expect(screen.getByRole("timer")).toHaveTextContent("4:40 left");

    client.answer.mockResolvedValueOnce({ ok: true, attempt: attemptOf({ answered: 1 }) });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await typing.click(submitButton());
    await waitFor(() => expect(client.answer).toHaveBeenCalledTimes(2));
    expect(client.answer.mock.calls[1][1].elapsedSeconds).toBe(25);
  });
});

describe("speaking an answer (ticket 06)", () => {
  it("IV-U22: the transcript is hidden by default while speaking, and opens as a ruled notepad", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    hear("I led the reporting redesign.");

    const toggle = screen.getByRole("button", { name: "Show transcript" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("I led the reporting redesign.")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide transcript" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("I led the reporting redesign.")).toHaveClass("notepad-paper");
  });

  it("IV-U23: the soundwave says whether the microphone is listening or hearing speech", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    const wave = () => document.querySelector("[data-mic]")!;

    expect(wave()).toHaveAttribute("data-mic", "listening");
    expect(screen.getByText("Listening. Say your answer out loud.")).toBeInTheDocument();

    act(() => latestRecogniser().onspeechstart?.());
    expect(wave()).toHaveAttribute("data-mic", "hearing");
    expect(screen.getByText("Hearing you")).toBeInTheDocument();

    act(() => latestRecogniser().onspeechend?.());
    expect(wave()).toHaveAttribute("data-mic", "listening");
  });

  it("IV-U24: a spoken answer goes to the same transcript field a typed one does — and no audio is touched", async () => {
    const attempt = attemptOf();
    const { user } = renderPanel({ attempt, speech: true });
    client.answer.mockResolvedValue({ ok: true, attempt: { ...attemptOf({ answered: 1 }), id: attempt.id } });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    hear("I led the reporting redesign.");
    await user.click(submitButton());

    expect(client.answer.mock.calls[0][1]).toMatchObject({ transcript: "I led the reporting redesign." });
    expect((window as unknown as { MediaRecorder?: unknown }).MediaRecorder).toBeUndefined();
  });

  it("IV-U25: switching to typing carries what was said onto the notepad, and turns the microphone off", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    hear("I led the redesign.");
    await user.click(screen.getByRole("button", { name: /Type instead/ }));

    expect(screen.getByRole("textbox")).toHaveValue("I led the redesign.");
    expect(document.querySelector("[data-mic]")).toBeNull();
    expect(recognisers.every((recogniser) => !recogniser.started)).toBe(true);
  });

  it("IV-U26: a browser that ends recognition on its own is restarted, so a thinking pause doesn't kill the microphone", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    const first = latestRecogniser();
    // A long silence: the browser ends recognition itself, well after it started.
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(Date.now() + 10_000);
    act(() => first.onend?.());

    await waitFor(() => expect(latestRecogniser()).not.toBe(first));
    expect(latestRecogniser().started).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("IV-U27: a microphone that stops the moment it starts gives up and says so, rather than spin", async () => {
    endsAtOnce = true;
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/microphone keeps stopping/);
    const made = recognisers.length;
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(recognisers.length).toBe(made);
    expect(made).toBeLessThanOrEqual(4);
  });
});

describe("resuming or starting over (ticket 04)", () => {
  it("IV-U28: an unfinished Attempt says where it got to, and Resume puts the next question up with its clock running", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 2 }), speech: false });

    expect(screen.getByText(/2 of 5 answered, with 4:20 left/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(screen.getByRole("heading", { level: 1, name: "A stakeholder question?" })).toBeInTheDocument();
    expect(screen.getByText("Question 3 of 5")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("4:20 left");
  });

  it("IV-U29: with Attempts left, starting over is offered and starts a fresh one", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 1 }), remaining: 4 });
    client.start.mockResolvedValue({ ok: true, attempt: attemptOf(), quota: quota(3) });

    await user.click(screen.getByRole("button", { name: /Start over/ }));

    expect(client.start).toHaveBeenCalledWith(job.id, 5, true);
  });

  it("IV-U30: with no Attempts left, only resuming is offered", () => {
    renderPanel({ attempt: attemptOf({ answered: 1 }), remaining: 0 });

    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start over/ })).not.toBeInTheDocument();
    expect(screen.getByText(/this is the one to finish/)).toBeInTheDocument();
  });
});

describe("the Scorecard (ticket 03)", () => {
  it("IV-U31: scoring shows every Answer's score and rationale, by Category, with each rollup and the overall", async () => {
    const complete = attemptOf({ answered: 5 });
    const { user } = renderPanel({ attempt: complete });
    client.score.mockResolvedValue({
      ok: true,
      attempt: attemptOf({ scored: true }),
      scorecard: {
        overall: 70,
        categories: CATEGORIES.map((category, index) => ({ category: category as Category, score: 60 + index * 5, questions: 1 })),
      },
    });

    await user.click(screen.getByRole("button", { name: "Score my interview" }));

    const overall = await screen.findByRole("region", { name: "Overall" });
    expect(within(overall).getByRole("img", { name: "3½ of 5 stars, solid" })).toBeInTheDocument();
    expect(client.score).toHaveBeenCalledWith(complete.id);
    // 60, 65, 70, 75, 80: the Category rollup and its one Answer read the same, as stars and a band word.
    const labels = ["3 of 5 stars, solid", "3½ of 5 stars, solid", "3½ of 5 stars, solid", "4 of 5 stars, solid", "4 of 5 stars, strong"];
    for (const [index, category] of CATEGORIES.entries()) {
      const section = screen.getByRole("region", { name: CATEGORY_LABEL[category] });
      expect(within(section).getAllByRole("img", { name: labels[index] })).toHaveLength(2);
      expect(section).toHaveTextContent(`Because of the ${category} thing.`);
    }
    // No score is shown as a number anywhere on the Scorecard.
    expect(document.body).not.toHaveTextContent(/\/ 100/);
    for (const score of [60, 65, 70, 75, 80]) expect(screen.queryByText(String(score))).not.toBeInTheDocument();
  });

  it("IV-U31b: stars fill in half-steps beside the band word, and only the whole is announced", () => {
    render(<ScoreStars score={70} />);

    const stars = screen.getByRole("img", { name: "3½ of 5 stars, solid" });
    expect(stars).toHaveTextContent("Solid");
    expect(stars.querySelectorAll('[data-star="full"]')).toHaveLength(3);
    expect(stars.querySelectorAll('[data-star="half"]')).toHaveLength(1);
    expect(stars.querySelectorAll('[data-star="empty"]')).toHaveLength(1);
    // The stars and the word are one image to assistive technology, never five separate marks.
    for (const child of Array.from(stars.children)) expect(child).toHaveAttribute("aria-hidden", "true");
  });

  it("IV-U31c: the lowest band is \"Not there yet\", in the warning colour", () => {
    render(<ScoreStars score={20} />);

    const stars = screen.getByRole("img", { name: "1 of 5 stars, not there yet" });
    expect(stars).toHaveTextContent("Not there yet");
    expect(stars).toHaveClass("text-destructive");
  });

  it("IV-U32: an Attempt already scored opens on its Scorecard, with no scoring to do again", () => {
    renderPanel({ attempt: attemptOf({ scored: true }) });

    expect(screen.getByText("Overall")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Score my interview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("IV-U33: a scoring failure says so and leaves the Attempt scorable again", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 5 }) });
    client.score.mockResolvedValue({ ok: false, error: "failed", message: INTERVIEW_FAILURES.failed });

    await user.click(screen.getByRole("button", { name: "Score my interview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES.failed);
    expect(screen.getByRole("button", { name: "Score my interview" })).toBeEnabled();
  });

  it("IV-U34: the Scorecard, the briefing, and the running interview have no accessibility violations", async () => {
    const scored = renderPanel({ attempt: attemptOf({ scored: true }) });
    expect(await axe(scored.container, AXE_OPTIONS)).toHaveNoViolations();
    scored.unmount();

    const briefing = renderPanel();
    expect(await axe(briefing.container, AXE_OPTIONS)).toHaveNoViolations();
    briefing.unmount();

    const running = renderPanel({ attempt: attemptOf({ answered: 1 }), speech: true });
    await running.user.click(screen.getByRole("button", { name: "Resume" }));
    await running.user.click(screen.getByRole("button", { name: "Show transcript" }));
    expect(await axe(running.container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("a deployment with no key", () => {
  it("IV-U35: says the simulator is unavailable rather than offering a Go that cannot work", () => {
    renderPanel({ available: false });

    expect(screen.getByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES.unavailable);
    expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
  });
});
