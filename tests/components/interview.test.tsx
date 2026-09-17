import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { InterviewPanel } from "@/components/interview/interview-panel";
import type { PathJob } from "@/components/interview/interview-path";
import type { InterviewClient } from "@/components/interview/interview-client";
import { PastScorecard } from "@/components/interview/past-interviews";
import { ScoreStars } from "@/components/interview/score-stars";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  INTERVIEW_FAILURES,
  SPOKEN_ANSWERS,
  SPEAK_UNSUPPORTED,
  type Attempt,
  type KnownLength,
  type Category,
  type InterviewQuotaStatus,
  type PastAttempt,
} from "@/lib/interview";
import type { Job } from "@/lib/jobs";
import type { Plan } from "@/lib/plans";
import { hear, latestRecogniser, refuse, setSpeechSupport, speech as fakeSpeech } from "../fakes/speech-recognition";
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

/** App feedback's send, so the ask on the Scorecard can be followed through without a server. */
const feedback = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/server/actions/app-feedback", () => ({ sendAppFeedbackAction: feedback.send }));

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

/**
 * An Attempt of `length`, with one question per Category and `answered` of them answered. Scored, each
 * Answer carries what landed and Missed points and the Attempt a Takeaway — or, `legacy`, the single
 * rationale an Attempt scored before those carries instead.
 */
function attemptOf({
  length = 5,
  answered = 0,
  scored = false,
  legacy = false,
}: { length?: KnownLength; answered?: number; scored?: boolean; legacy?: boolean } = {}): Attempt {
  const newShape = scored && !legacy;
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
            whatLanded: newShape ? `The ${category} story landed.` : "",
            missedPoints: newShape ? [`The ${category} figure on your resume.`, "The referral loop the posting names."] : [],
            rationale: scored && legacy ? `Because of the ${category} thing.` : "",
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
    takeaway: newShape
      ? [
          { point: "Say what came of the work, not only what you did.", from: "every answer you gave" },
          { point: "Tie each answer to the referral loop the posting leads with.", from: "your personal and design answers" },
        ]
      : [],
    questions,
  };
}

function renderPanel({
  plan = "pro" as Plan,
  job: chosen = job as PathJob | null,
  jobs = SEED_JOBS as Job[],
  attempt = null as Attempt | null,
  remaining = 9,
  available = true,
  speech = true,
  history = [] as PastAttempt[],
} = {}) {
  setSpeechSupport(speech);
  return renderWithJobs(
    <InterviewPanel
      job={chosen}
      plan={plan}
      attempt={attempt}
      quota={quota(remaining)}
      available={available}
      history={history}
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
  feedback.send.mockReset();
  feedback.send.mockResolvedValue({ ok: true, data: null });
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

  it("IV-U9: offers 15, 20, and 30 minutes to a pro Tenant, and Go sends the chosen one", async () => {
    const { user } = renderPanel();
    client.start.mockResolvedValue({ ok: true, attempt: attemptOf({ length: 30 }), quota: quota(8) });

    for (const minutes of [15, 20, 30]) expect(lengthButton(minutes)).toBeEnabled();
    await user.click(lengthButton(30));
    await user.click(go());

    expect(client.start).toHaveBeenCalledWith(job.id, 30, false);
  });

  it("IV-U10: each length says what it asks across all five areas", async () => {
    const { user } = renderPanel();

    expect(screen.getByText(/1 personal, 1 behavioural, 1 stakeholder, 1 technical, 1 design/)).toBeInTheDocument();
    await user.click(lengthButton(20));
    expect(screen.getByText(/2 personal, 2 behavioural, 2 stakeholder, 1 technical, 1 design/)).toBeInTheDocument();
    await user.click(lengthButton(30));
    expect(screen.getByText(/2 personal, 3 behavioural, 3 stakeholder, 2 technical, 2 design/)).toBeInTheDocument();
  });

  it("IV-U11: answers are spoken — there is no choice of how, only the promise that no audio is kept (practice feedback ticket 02)", () => {
    renderPanel({ speech: true });

    expect(screen.queryByRole("button", { name: /Speaking/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Typing/ })).not.toBeInTheDocument();
    expect(screen.getByText(SPOKEN_ANSWERS)).toBeInTheDocument();
    expect(go()).toBeEnabled();
  });

  it("IV-U12: a browser that can't transcribe speech has no Go, and is told which browsers can (practice feedback ticket 02)", () => {
    renderPanel({ speech: false });

    expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
    expect(screen.getByText(SPEAK_UNSUPPORTED)).toBeInTheDocument();
    expect(SPEAK_UNSUPPORTED).not.toMatch(/type/i);
  });

  it("IV-U12b: nor can it resume an unfinished Attempt (practice feedback ticket 02)", () => {
    renderPanel({ attempt: attemptOf({ answered: 1 }), speech: false });

    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
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
      for (const minutes of [15, 20, 30]) expect(lengthButton(minutes)).toBeDisabled();
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

    for (const minutes of [15, 20, 30]) expect(lengthButton(minutes)).toBeDisabled();
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
    const { user } = renderPanel({ speech: true });
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
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const attempt = attemptOf();
    renderPanel({ attempt, speech: true });
    client.answer.mockResolvedValue({ ok: true, attempt: { ...attemptOf({ answered: 1 }), id: attempt.id } });

    await clicking.click(screen.getByRole("button", { name: "Resume" }));
    hear("I led the reporting redesign.");
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    await clicking.click(submitButton());

    expect(client.answer).toHaveBeenCalledWith(attempt.id, {
      questionId: "q0",
      transcript: "I led the reporting redesign.",
      elapsedSeconds: 20,
    });
    // The next question is up at once — there is nothing to press to begin it — and its clock runs.
    expect(await screen.findByRole("heading", { level: 1, name: "A behavioural question?" })).toBeInTheDocument();
    // Nothing said yet on this one: nothing to submit.
    expect(submitButton()).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByRole("timer")).toHaveTextContent("4:35 left");
  });

  it("IV-U17: the clock stands still while an answer is on its way to the server", async () => {
    // Only the test moves the clock: real time leaking in makes exact seconds flaky on a busy machine.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel({ attempt: attemptOf(), speech: true });
    client.answer.mockReturnValue(new Promise(() => {}));

    await clicking.click(screen.getByRole("button", { name: "Resume" }));
    hear("An answer.");
    await clicking.click(submitButton());
    const atSubmit = screen.getByRole("timer").textContent;
    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(screen.getByRole("button", { name: "Saving your answer…" })).toBeDisabled();
    expect(screen.getByRole("timer").textContent).toBe(atSubmit);
  });

  it("IV-U17b: under each question, how long to aim for in its Category — a guide, with the one countdown still running (interview second pass ticket 04)", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ length: 30 }), speech: true });
    client.answer.mockResolvedValue({ ok: true, attempt: { ...attemptOf({ length: 30, answered: 1 }) } });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByText("Aim for about 1½ min")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("30:00 left");

    hear("An answer.");
    await user.click(submitButton());

    expect(await screen.findByRole("heading", { level: 1, name: "A behavioural question?" })).toBeInTheDocument();
    expect(screen.getByText("Aim for about 2½ min")).toBeInTheDocument();
  });

  it("IV-U18: an empty answer cannot be submitted", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(submitButton()).toBeDisabled();
  });

  it("IV-U19: the last question says so, and answering it reaches scoring rather than another question", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 4 }), speech: true });
    client.answer.mockResolvedValue({ ok: true, attempt: attemptOf({ answered: 5 }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByText("This is the last question.")).toBeInTheDocument();
    hear("The last one.");
    await user.click(screen.getByRole("button", { name: "Submit final answer" }));

    expect(await screen.findByRole("button", { name: "Score my interview" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("IV-U20: the countdown reaching zero ends the Attempt, keeping what was typed as that question's Answer (interview second pass ticket 03)", async () => {
    // Only the test moves the clock: real time leaking in makes exact seconds flaky on a busy machine.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const nearlyOut: Attempt = { ...attemptOf(), activeSeconds: 299 };
    renderPanel({ attempt: nearlyOut, speech: true });
    client.timeUp.mockResolvedValue({ ok: true, attempt: { ...nearlyOut, completedAt: "2026-09-16T10:00:00.000Z" } });

    await clicking.click(screen.getByRole("button", { name: "Resume" }));
    hear("Half an answ");
    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() =>
      expect(client.timeUp).toHaveBeenCalledWith(nearlyOut.id, { questionId: "q0", transcript: "Half an answ" }),
    );
    expect(client.timeUp).toHaveBeenCalledTimes(1);
    expect(client.answer).not.toHaveBeenCalled();
  });

  it("IV-U20b: the countdown reaching zero with nothing said sends nothing to keep — the question is unreached", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const nearlyOut: Attempt = { ...attemptOf(), activeSeconds: 299 };
    renderPanel({ attempt: nearlyOut, speech: true });
    client.timeUp.mockResolvedValue({ ok: true, attempt: { ...nearlyOut, completedAt: "2026-09-16T10:00:00.000Z" } });

    await clicking.click(screen.getByRole("button", { name: "Resume" }));
    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() => expect(client.timeUp).toHaveBeenCalledWith(nearlyOut.id, undefined));
  });

  it("IV-U20c: spoken, what the browser had heard — the settled words and the phrase still settling — is what is kept", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const nearlyOut: Attempt = { ...attemptOf({ answered: 3 }), activeSeconds: 299 };
    renderPanel({ attempt: nearlyOut, speech: true });
    client.timeUp.mockResolvedValue({ ok: true, attempt: { ...nearlyOut, completedAt: "2026-09-16T10:00:00.000Z" } });

    await clicking.click(screen.getByRole("button", { name: "Resume" }));
    hear("I led the reporting redesign.");
    act(() => {
      latestRecogniser().onresult?.({
        resultIndex: 1,
        results: [
          Object.assign([{ transcript: "I led the reporting redesign." }], { isFinal: true }),
          Object.assign([{ transcript: "and then we" }], { isFinal: false }),
        ],
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() => expect(client.timeUp).toHaveBeenCalledTimes(1));
    expect(client.timeUp.mock.calls[0][1]).toEqual({
      questionId: "q3",
      transcript: "I led the reporting redesign. and then we",
    });
  });

  it("IV-U21: a failed submission keeps the answer and the seconds it cost, so a retry resumes rather than starts over", async () => {
    // Only the test moves the clock: real time leaking in makes exact seconds flaky on a busy machine.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel({ attempt: attemptOf(), speech: true });
    client.answer.mockResolvedValueOnce({ ok: false, error: "failed", message: INTERVIEW_FAILURES.failed });

    await clicking.click(screen.getByRole("button", { name: "Resume" }));
    hear("An answer.");
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    await clicking.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES.failed);
    expect(submitButton()).toBeEnabled();
    expect(screen.getByRole("timer")).toHaveTextContent("4:40 left");

    client.answer.mockResolvedValueOnce({ ok: true, attempt: attemptOf({ answered: 1 }) });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await clicking.click(submitButton());
    await waitFor(() => expect(client.answer).toHaveBeenCalledTimes(2));
    expect(client.answer.mock.calls[1][1].elapsedSeconds).toBe(25);
  });
});

describe("speaking an answer (ticket 06)", () => {
  it("IV-U22: the transcript shows by default as a ruled notepad — the only sign the microphone is hearing — and can be hidden (practice feedback ticket 04)", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    hear("I led the reporting redesign.");

    const toggle = screen.getByRole("button", { name: "Hide transcript" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("I led the reporting redesign.")).toHaveClass("notepad-paper");

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Show transcript" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("I led the reporting redesign.")).not.toBeInTheDocument();
  });

  it("IV-U23: the soundwave says whether the microphone is listening or hearing speech", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    const wave = () => document.querySelector("[data-mic]")!;

    expect(wave()).toHaveAttribute("data-mic", "listening");
    // Nothing heard yet: it is the Tenant's turn (practice feedback ticket 03).
    expect(screen.getByText("Your turn — start speaking")).toBeInTheDocument();

    act(() => latestRecogniser().onspeechstart?.());
    expect(wave()).toHaveAttribute("data-mic", "hearing");
    expect(screen.getByText("Hearing you")).toBeInTheDocument();

    hear("I led the redesign.");
    act(() => latestRecogniser().onspeechend?.());
    expect(wave()).toHaveAttribute("data-mic", "listening");
    expect(screen.getByText("Listening. Say your answer out loud.")).toBeInTheDocument();
  });

  it("IV-U24: a spoken answer is sent as the words the browser heard — and no audio is touched", async () => {
    const attempt = attemptOf();
    const { user } = renderPanel({ attempt, speech: true });
    client.answer.mockResolvedValue({ ok: true, attempt: { ...attemptOf({ answered: 1 }), id: attempt.id } });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    hear("I led the reporting redesign.");
    await user.click(submitButton());

    expect(client.answer.mock.calls[0][1]).toMatchObject({ transcript: "I led the reporting redesign." });
    expect((window as unknown as { MediaRecorder?: unknown }).MediaRecorder).toBeUndefined();
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
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });
    fakeSpeech.endsAtOnce = true;

    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/microphone keeps stopping/);
    const made = fakeSpeech.recognisers.length;
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(fakeSpeech.recognisers.length).toBe(made);
    expect(made).toBeLessThanOrEqual(4);
  });
});

describe("the microphone failing mid-question (practice feedback ticket 05)", () => {
  it("IV-U59: the clock stops, the page says why without offering typing, and what was heard stays and can still be submitted", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const attempt = attemptOf();
    renderPanel({ attempt });
    client.answer.mockReturnValue(new Promise(() => {}));

    await clicking.click(screen.getByRole("button", { name: "Resume" }));
    hear("I led the reporting redesign.");
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    refuse("not-allowed");
    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(screen.getByRole("timer")).toHaveTextContent("4:50 left");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/won’t let the page use your microphone/);
    expect(alert).not.toHaveTextContent(/type/i);
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Leave and resume later" })).toBeInTheDocument();
    expect(screen.getByText("I led the reporting redesign.")).toBeInTheDocument();

    await clicking.click(submitButton());
    expect(client.answer).toHaveBeenCalledWith(attempt.id, expect.objectContaining({ transcript: "I led the reporting redesign.", elapsedSeconds: 10 }));
  });

  it("IV-U60: Try again turns the microphone back on and the clock picks up where it stopped", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel({ attempt: attemptOf() });

    await clicking.click(screen.getByRole("button", { name: "Resume" }));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    refuse("audio-capture");
    const before = fakeSpeech.recognisers.length;
    await clicking.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fakeSpeech.recognisers.length).toBeGreaterThan(before);
    expect(latestRecogniser().started).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByRole("timer")).toHaveTextContent("4:45 left");
  });

  it("IV-U61b: Leave and resume later goes back to Resume, with nothing of this question kept", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 1 }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    hear("Half an answer.");
    refuse("not-allowed");
    await user.click(screen.getByRole("button", { name: "Leave and resume later" }));

    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByText(/1 of 5 answered, with 4:40 left/)).toBeInTheDocument();
    expect(client.answer).not.toHaveBeenCalled();
    expect(fakeSpeech.recognisers.every((recogniser) => !recogniser.started)).toBe(true);
  });

  it("IV-U61: a phone with dictation turned off is told to turn it on, or try another browser", async () => {
    const { user } = renderPanel({ attempt: attemptOf() });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    refuse("service-not-allowed");

    expect(screen.getByRole("alert")).toHaveTextContent(/dictation/i);
  });
});

describe("questions asked aloud (practice round ticket 02)", () => {
  type Utterance = { text: string; onstart: (() => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
  let utterances: Utterance[] = [];
  /** When set, the voice never begins — a phone that refused to speak outside a tap. */
  let silent = false;
  const voice = { speaking: false, pending: false, speak: vi.fn(), cancel: vi.fn() };
  const holder = window as unknown as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown };

  beforeEach(() => {
    utterances = [];
    silent = false;
    voice.speak.mockReset().mockImplementation((utterance: Utterance) => {
      utterances.push(utterance);
      // The primer is an empty utterance; only questions are kept as what was read.
      if (!utterance.text) utterances.pop();
      else if (!silent) utterance.onstart?.();
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
  });

  const finishReading = () => act(() => utterances[utterances.length - 1].onend?.());

  it("IV-U50: speaking, the question is read aloud first — its clock stands still and the microphone is off until the voice finishes", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel({ attempt: attemptOf(), speech: true });

    await clicking.click(screen.getByRole("button", { name: "Resume" }));

    expect(screen.getByRole("heading", { level: 1, name: "A personal question?" })).toBeInTheDocument();
    expect(utterances.map((utterance) => utterance.text)).toEqual(["A personal question?"]);
    expect(screen.getByText(/Reading the question aloud/)).toBeInTheDocument();
    expect(fakeSpeech.recognisers.some((recogniser) => recogniser.started)).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(screen.getByRole("timer")).toHaveTextContent("5:00 left");

    finishReading();
    expect(latestRecogniser().started).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(screen.getByRole("timer")).toHaveTextContent("4:56 left");
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
  });

  it("IV-U51: Skip stops the voice and starts the clock and the microphone at once", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(voice.cancel).toHaveBeenCalled();
    expect(latestRecogniser().started).toBe(true);
    expect(screen.queryByText(/Reading the question aloud/)).not.toBeInTheDocument();
  });

  it("IV-U52: the seconds spent being asked are not part of what an Answer cost", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const clicking = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const attempt = attemptOf();
    renderPanel({ attempt, speech: true });
    client.answer.mockResolvedValue({ ok: true, attempt: { ...attemptOf({ answered: 1 }), id: attempt.id } });

    await clicking.click(screen.getByRole("button", { name: "Resume" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    finishReading();
    hear("I led the reporting redesign.");
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    await clicking.click(submitButton());

    expect(client.answer.mock.calls[0][1]).toMatchObject({ elapsedSeconds: 20 });
    // The next question is read in its turn.
    expect(await screen.findByRole("heading", { level: 1, name: "A behavioural question?" })).toBeInTheDocument();
    expect(utterances.map((utterance) => utterance.text)).toEqual(["A personal question?", "A behavioural question?"]);
  });

  it("IV-U55: Go and Resume start the voice inside the tap, before anything waits on the network (practice feedback ticket 03)", async () => {
    const { user, unmount } = renderPanel();
    client.start.mockReturnValue(new Promise(() => {}));

    await user.click(go());
    expect(voice.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "" }));
    unmount();

    voice.speak.mockClear();
    const resumed = renderPanel({ attempt: attemptOf({ answered: 1 }) });
    await resumed.user.click(screen.getByRole("button", { name: "Resume" }));
    expect(voice.speak.mock.calls[0][0]).toMatchObject({ text: "" });
  });

  it("IV-U56: Submit starts the voice inside the tap too, for the question that comes after the server", async () => {
    const { user } = renderPanel({ attempt: attemptOf() });
    client.answer.mockReturnValue(new Promise(() => {}));

    await user.click(screen.getByRole("button", { name: "Resume" }));
    finishReading();
    hear("I led the reporting redesign.");
    voice.speak.mockClear();
    await user.click(submitButton());

    expect(voice.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "" }));
  });

  it("IV-U57: a voice that never begins is given up on after a second and a half — the clock and microphone start (practice feedback ticket 03)", async () => {
    silent = true;
    const { user } = renderPanel({ attempt: attemptOf() });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByText(/Reading the question aloud/)).toBeInTheDocument();

    // Real time: the page's own timers are what is under test.
    await waitFor(() => expect(screen.queryByText(/Reading the question aloud/)).not.toBeInTheDocument(), {
      timeout: 2_500,
    });
    expect(voice.cancel).toHaveBeenCalled();
    expect(latestRecogniser().started).toBe(true);
  });

  it("IV-U58: once the question has been asked, the page says it is the Tenant's turn, until they are heard (practice feedback ticket 03)", async () => {
    const { user } = renderPanel({ attempt: attemptOf() });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.queryByText("Your turn — start speaking")).not.toBeInTheDocument();

    finishReading();
    expect(screen.getByText("Your turn — start speaking")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((status) => /Your turn/.test(status.textContent ?? ""))).toBe(true);

    hear("I led the reporting redesign.");
    expect(screen.queryByText("Your turn — start speaking")).not.toBeInTheDocument();
  });
});

describe("resuming or starting over (ticket 04)", () => {
  it("IV-U28: an unfinished Attempt says where it got to, and Resume puts the next question up with its clock running", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 2 }), speech: true });

    expect(screen.getByText(/2 of 5 answered, with 4:20 left/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(screen.getByRole("heading", { level: 1, name: "A stakeholder question?" })).toBeInTheDocument();
    expect(screen.getByText("Question 3 of 5")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("4:20 left");
  });

  it("IV-U29: with Attempts left, starting over is offered and starts a fresh one", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ length: 20, answered: 1 }), remaining: 4 });
    client.start.mockResolvedValue({ ok: true, attempt: attemptOf(), quota: quota(3) });

    await user.click(screen.getByRole("button", { name: /Start over/ }));

    expect(client.start).toHaveBeenCalledWith(job.id, 20, true);
  });

  it("IV-U30: with no Attempts left, only resuming is offered", () => {
    renderPanel({ attempt: attemptOf({ answered: 1 }), remaining: 0 });

    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start over/ })).not.toBeInTheDocument();
    expect(screen.getByText(/this is the one to finish/)).toBeInTheDocument();
  });
});

describe("the Scorecard (ticket 03; interview second pass tickets 02, 03, 05)", () => {
  const answerCard = (question: string) => screen.getByRole("article", { name: question });

  it("IV-U31: scoring shows the overall stars, then For next time, then each area, then a card per Answer with what landed and its Missed points", async () => {
    const complete = attemptOf({ answered: 5 });
    const { user } = renderPanel({ attempt: complete });
    client.score.mockResolvedValue({
      ok: true,
      attempt: attemptOf({ scored: true }),
      scorecard: {
        overall: 70,
        categories: CATEGORIES.map((category, index) => ({
          category: category as Category,
          score: 60 + index * 5,
          questions: 1,
          unreached: 0,
        })),
      },
    });

    await user.click(screen.getByRole("button", { name: "Score my interview" }));

    const overall = await screen.findByRole("region", { name: "Overall" });
    expect(within(overall).getByRole("img", { name: "3½ of 5 stars, solid" })).toBeInTheDocument();
    expect(client.score).toHaveBeenCalledWith(complete.id);

    // The Takeaway comes first, each point saying what it is drawn from.
    const next = screen.getByRole("region", { name: "For next time" });
    expect(next).toHaveTextContent("Say what came of the work, not only what you did.");
    expect(next).toHaveTextContent("From every answer you gave");
    expect(within(next).getAllByRole("listitem")).toHaveLength(2);

    // 60, 65, 70, 75, 80: each area as stars and a band word.
    const labels = ["3 of 5 stars, solid", "3½ of 5 stars, solid", "3½ of 5 stars, solid", "4 of 5 stars, solid", "4 of 5 stars, strong"];
    const areas = screen.getByRole("region", { name: "By area" });
    for (const [index, category] of CATEGORIES.entries()) {
      const row = within(areas).getByText(CATEGORY_LABEL[category]).closest("li")!;
      expect(within(row).getByRole("img", { name: labels[index] })).toBeInTheDocument();
    }

    // A card per Answer: the question, its stars, what landed, and the Missed points to reach for.
    for (const [index, category] of CATEGORIES.entries()) {
      const card = answerCard(`A ${category} question?`);
      expect(within(card).getByRole("img", { name: labels[index] })).toBeInTheDocument();
      expect(card).toHaveTextContent(`The ${category} story landed.`);
      const missed = within(card).getByRole("list", { name: "Missed points" });
      expect(within(missed).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        `The ${category} figure on your resume.`,
        "The referral loop the posting names.",
      ]);
      expect(card).not.toHaveTextContent(`Because of the ${category} thing.`);
    }

    // Top to bottom: overall, For next time, areas, then the Answers.
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(overall, next)).toBe(true);
    expect(follows(next, areas)).toBe(true);
    expect(follows(areas, answerCard("A personal question?"))).toBe(true);

    // No score is shown as a number anywhere on the Scorecard.
    expect(document.body).not.toHaveTextContent(/\/ 100/);
    for (const score of [60, 65, 70, 75, 80]) expect(screen.queryByText(String(score))).not.toBeInTheDocument();
  });

  it("IV-U31e: an Attempt scored before Missed points shows its single rationale in their place, and no For next time", () => {
    renderPanel({ attempt: attemptOf({ scored: true, legacy: true }) });

    expect(screen.queryByRole("region", { name: "For next time" })).not.toBeInTheDocument();
    for (const category of CATEGORIES) {
      const card = answerCard(`A ${category} question?`);
      expect(card).toHaveTextContent(`Because of the ${category} thing.`);
      expect(within(card).queryByRole("list", { name: "Missed points" })).not.toBeInTheDocument();
      expect(card).not.toHaveTextContent("What landed");
    }
  });

  it("IV-U31d: an unreached question reads \"Not reached\" with no stars and no Missed points, and so does an area with nothing reached (interview second pass ticket 03)", () => {
    const scored = attemptOf({ scored: true });
    // The clock ran out on the technical question with nothing said, before the design one.
    const attempt: Attempt = {
      ...scored,
      questions: scored.questions.map((question) => (question.order >= 3 ? { ...question, answer: undefined } : question)),
    };
    renderPanel({ attempt });

    const areas = screen.getByRole("region", { name: "By area" });
    for (const category of ["technical", "design"] as const) {
      const row = within(areas).getByText(CATEGORY_LABEL[category]).closest("li")!;
      expect(row).toHaveTextContent("Not reached");
      expect(within(row).queryByRole("img")).not.toBeInTheDocument();

      const card = answerCard(`A ${category} question?`);
      expect(card).toHaveTextContent("Not reached");
      expect(within(card).queryByRole("img")).not.toBeInTheDocument();
      expect(within(card).queryByRole("list", { name: "Missed points" })).not.toBeInTheDocument();
    }
    // 60, 65, 70 answered; two unreached at half weight: 195 / 4 = 48.75.
    const overall = screen.getByRole("region", { name: "Overall" });
    expect(within(overall).getByRole("img", { name: "2½ of 5 stars, developing" })).toBeInTheDocument();
    expect(overall).toHaveTextContent("2 of which you didn’t get to");
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
    // Started at a retired length, it still says the length it ran for (interview second pass ticket 04).
    expect(screen.getByText(/in 5 minutes/)).toBeInTheDocument();
  });

  it("IV-U32b: starting over an Attempt at a retired length starts at a length offered now", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ length: 10, answered: 1 }) });
    client.start.mockReturnValue(new Promise(() => {}));

    await user.click(screen.getByRole("button", { name: /Start over/ }));

    expect(client.start).toHaveBeenCalledWith(job.id, 15, true);
  });

  it("IV-U33: a scoring failure says so and leaves the Attempt scorable again", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 5 }) });
    client.score.mockResolvedValue({ ok: false, error: "failed", message: INTERVIEW_FAILURES.failed });

    await user.click(screen.getByRole("button", { name: "Score my interview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES.failed);
    expect(screen.getByRole("button", { name: "Score my interview" })).toBeEnabled();
  });

  it("IV-U33b: when the clock ran out first, scoring says how many were answered before it is run", () => {
    renderPanel({ attempt: { ...attemptOf({ answered: 2 }), completedAt: "2026-09-16T10:00:00.000Z" } });

    expect(screen.getByText("Time’s up")).toBeInTheDocument();
    expect(screen.getByText("You reached 2 of 5 questions before the clock ran out.")).toBeInTheDocument();
    expect(screen.getByText(/The 3 questions you didn’t reach will show as Not reached/)).toHaveTextContent(
      "keep to the time shown under each one",
    );
    expect(screen.getByRole("button", { name: "Score my interview" })).toBeEnabled();
  });

  it("IV-U33c: an interview answered to the end says nothing about running out", () => {
    renderPanel({ attempt: attemptOf({ answered: 5 }) });

    expect(screen.getByText("That’s the interview")).toBeInTheDocument();
    expect(screen.queryByText(/before the clock ran out/)).not.toBeInTheDocument();
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
    expect(await axe(running.container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("past interviews (interview second pass ticket 06)", () => {
  const past = (overrides: Partial<PastAttempt>): PastAttempt => ({
    id: "attempt-scored",
    jobId: job.id,
    company: job.company,
    role: job.role,
    accent: job.accent,
    startedOn: "2026-09-14",
    length: 20,
    status: "scored",
    overall: 70,
    ...overrides,
  });

  it("IV-U40: the hub lists past interviews below the picker, newest first: each scored one opens its own Scorecard, the one in progress offers Resume", () => {
    renderPanel({
      job: null,
      history: [
        past({ id: "attempt-now", status: "in-progress", overall: null, startedOn: "2026-09-16", length: 30 }),
        past({ id: "attempt-before", company: "Harvest", role: "Senior UX Researcher", jobId: "job-2", length: 5 }),
      ],
    });

    const section = screen.getByRole("region", { name: "Past interviews" });
    const picker = screen.getByRole("searchbox", { name: "Search your jobs by role or company" });
    expect(Boolean(picker.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    const [resume, scored] = within(section).getAllByRole("link");
    expect(resume).toHaveAttribute("href", `/interview/${job.id}`);
    expect(resume).toHaveTextContent(job.role);
    expect(resume).toHaveTextContent("Sep 16");
    expect(resume).toHaveTextContent("30 min");
    expect(resume).toHaveTextContent("Resume");
    expect(within(resume).queryByRole("img")).not.toBeInTheDocument();

    expect(scored).toHaveAttribute("href", "/interview/job-2/attempt-before");
    expect(scored).toHaveTextContent("Senior UX Researcher");
    expect(scored).toHaveTextContent("Harvest");
    expect(scored).toHaveTextContent("Sep 14");
    expect(scored).toHaveTextContent("5 min");
    expect(within(scored).getByRole("img", { name: "3½ of 5 stars, solid" })).toBeInTheDocument();
  });

  it("IV-U41: with no past interviews there is no section at all", () => {
    renderPanel({ job: null, history: [] });

    expect(screen.queryByRole("region", { name: "Past interviews" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Past interviews/)).not.toBeInTheDocument();
  });

  it("IV-U42: the locked preview shows no history, and a chosen Job's page shows none either", () => {
    renderPanel({ job: null, plan: "free", history: [past({})] });
    expect(screen.queryByRole("region", { name: "Past interviews" })).not.toBeInTheDocument();
  });

  it("IV-U43: a past interview's Scorecard names the Job, is view-only, and leads back to the hub and to rehearsing that Job again", async () => {
    const { container } = render(<PastScorecard job={job} attempt={attemptOf({ length: 20, scored: true })} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${job.role} at ${job.company}`);
    expect(screen.getByRole("region", { name: "For next time" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All interviews/ })).toHaveAttribute("href", "/interview");
    expect(screen.getByRole("link", { name: "Rehearse this job again" })).toHaveAttribute("href", `/interview/${job.id}`);
    expect(screen.queryByRole("button", { name: "Score my interview" })).not.toBeInTheDocument();
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("IV-U44: the past interviews list has no accessibility violations", async () => {
    const { container } = renderPanel({ job: null, history: [past({ id: "a", status: "in-progress", overall: null }), past({})] });
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("asking how the Simulator is going (interview second pass ticket 08)", () => {
  const scoredResponse = (askForFeedback: boolean) => ({
    ok: true,
    attempt: attemptOf({ scored: true }),
    scorecard: {
      overall: 70,
      categories: CATEGORIES.map((category) => ({ category: category as Category, score: 70, questions: 1, unreached: 0 })),
    },
    askForFeedback,
  });
  const ask = () => screen.queryByRole("region", { name: "How’s the simulator going?" });

  async function scoreWith(askForFeedback: boolean) {
    const rendered = renderPanel({ attempt: attemptOf({ answered: 5 }) });
    client.score.mockResolvedValue(scoredResponse(askForFeedback));
    await rendered.user.click(screen.getByRole("button", { name: "Score my interview" }));
    await screen.findByRole("region", { name: "Overall" });
    return rendered;
  }

  it("IV-U45: told to ask, the Scorecard shows a small card below everything else, with no stars of its own", async () => {
    await scoreWith(true);

    const card = ask();
    expect(card).toHaveTextContent("Two interviews in — how’s the simulator working for you?");
    expect(within(card!).queryByRole("img")).not.toBeInTheDocument();
    const again = screen.getByRole("button", { name: "Rehearse this job again" });
    expect(Boolean(again.compareDocumentPosition(card!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("IV-U46: not told to ask — and on a Scorecard reopened later — there is no card", async () => {
    await scoreWith(false);
    expect(ask()).not.toBeInTheDocument();
  });

  it("IV-U46b: a Scorecard opened already scored never asks", () => {
    renderPanel({ attempt: attemptOf({ scored: true }) });
    expect(ask()).not.toBeInTheDocument();
  });

  it("IV-U47: its button opens App feedback about the Interview Simulator, and sending leaves the card dismissed", async () => {
    const { user } = await scoreWith(true);

    await user.click(within(ask()!).getByRole("button", { name: "Tell us" }));
    const dialog = await screen.findByRole("dialog", { name: /feedback/i });
    await user.click(within(dialog).getByRole("radio", { name: /4 stars/i }));
    await user.type(within(dialog).getByLabelText(/what.s on your mind/i), "Missed points are the useful part.");
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));
    await user.click(await within(dialog).findByRole("button", { name: "Back to the trail" }));

    expect(feedback.send).toHaveBeenCalledWith({
      rating: 4,
      message: "Missed points are the useful part.",
      context: "interview-simulator",
    });
    await waitFor(() => expect(ask()).not.toBeInTheDocument());
  });

  it("IV-U48: closing the form without sending leaves the card dismissed too", async () => {
    const { user } = await scoreWith(true);

    await user.click(within(ask()!).getByRole("button", { name: "Tell us" }));
    const dialog = await screen.findByRole("dialog", { name: /feedback/i });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(feedback.send).not.toHaveBeenCalled();
    await waitFor(() => expect(ask()).not.toBeInTheDocument());
  });
});

describe("a deployment with no key", () => {
  it("IV-U35: says the simulator is unavailable rather than offering a Go that cannot work", () => {
    renderPanel({ available: false });

    expect(screen.getByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES.unavailable);
    expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
  });
});
