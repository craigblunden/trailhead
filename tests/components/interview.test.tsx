import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { InterviewHub } from "@/components/interview/interview-hub";
import { InterviewPanel } from "@/components/interview/interview-panel";
import type { InterviewClient } from "@/components/interview/interview-client";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  INTERVIEW_FAILURES,
  SPEAK_RECOMMENDED,
  SPEAK_UNSUPPORTED,
  attemptSeconds,
  type Attempt,
  type AttemptLength,
  type Category,
  type InterviewQuotaStatus,
} from "@/lib/interview";
import type { Plan } from "@/lib/plans";
import { SEED_JOBS } from "../fixtures/jobs";
import { renderWithJobs, screen, userEvent, waitFor, within } from "../test-utils";

/**
 * The Interview Simulator's screens (interview simulator tickets 02–08), against a faked client —
 * the seam the page takes to the Route Handlers. Everything else is real: the phase the page is in
 * comes from the Attempt it was handed, exactly as it does in the app.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/interview",
  useSelectedLayoutSegment: () => null,
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const job = SEED_JOBS.find((candidate) => candidate.id === "fernwood-product-designer-growth")!;

/** The seam the page takes to the Route Handlers, faked. Cast at the render site, so each mock
 *  keeps its own `Mock` type here. */
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
  completedAt = null,
}: { length?: AttemptLength; answered?: number; scored?: boolean; completedAt?: string | null } = {}): Attempt {
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
    completedAt: scored || answered === questions.length ? (completedAt ?? "2026-09-16T10:00:00.000Z") : completedAt,
    overallScore: scored ? 70 : null,
    questions,
  };
}

function renderPanel({
  plan = "pro" as Plan,
  attempt = null as Attempt | null,
  remaining = 9,
  available = true,
  speech = true,
} = {}) {
  setSpeechSupport(speech);
  return renderWithJobs(
    <InterviewPanel
      job={{ id: job.id, company: job.company, role: job.role }}
      plan={plan}
      attempt={attempt}
      quota={quota(remaining)}
      available={available}
      client={client as unknown as InterviewClient}
    />,
  );
}

/** Stands in for the browser's speech recognition, so the feature-detection branch is testable. */
function setSpeechSupport(supported: boolean) {
  const holder = window as unknown as { SpeechRecognition?: unknown };
  if (!supported) {
    delete holder.SpeechRecognition;
    return;
  }
  holder.SpeechRecognition = class {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start() {}
    stop() {
      this.onend?.();
    }
    abort() {}
  };
}

const startButton = () => screen.getByRole("button", { name: "Start interview" });
const lengthButton = (minutes: number) => screen.getByRole("button", { name: new RegExp(`^${minutes} minutes`) });

beforeEach(() => {
  for (const mock of Object.values(client)) mock.mockReset();
  setSpeechSupport(true);
});

describe("the Job picker (ticket 07)", () => {
  it("IV-U1: searches by role or company, and each result links to that Job's interview", async () => {
    const { user } = renderWithJobs(<InterviewHub plan="pro" />);
    const box = screen.getByRole("searchbox", { name: /Which job/ });

    await user.type(box, "fernwood");

    const list = screen.getByRole("list", { name: "Matching jobs" });
    const rows = within(list).getAllByRole("link");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toHaveTextContent(/Fernwood/i);
    expect(rows[0]).toHaveAttribute("href", expect.stringMatching(/^\/interview\//));

    // The same box finds a role rather than a company: every row now matches on the role.
    await user.clear(box);
    await user.type(box, "designer");
    const byRole = within(screen.getByRole("list", { name: "Matching jobs" })).getAllByRole("link");
    expect(byRole.length).toBeGreaterThan(0);
    for (const row of byRole) expect(row).toHaveTextContent(/designer/i);
  });

  it("IV-U2: a search that matches nothing says so, and offers no rows to click", async () => {
    const { user } = renderWithJobs(<InterviewHub plan="pro" />);

    await user.type(screen.getByRole("searchbox", { name: /Which job/ }), "zzzzz");

    expect(screen.getByRole("status")).toHaveTextContent("No matching jobs.");
    expect(screen.queryByRole("list", { name: "Matching jobs" })).not.toBeInTheDocument();
  });

  it("IV-U3: the hub is a flat searchable list, not the board's grouped columns, and is capped", async () => {
    renderWithJobs(<InterviewHub plan="pro" />);

    // One list, ungrouped: no Stage headings, no column per Stage.
    expect(screen.getAllByRole("list", { name: "Matching jobs" })).toHaveLength(1);
    const shown = within(screen.getByRole("list", { name: "Matching jobs" })).getAllByRole("link");
    expect(shown.length).toBeLessThanOrEqual(8);
  });

  it("IV-U4: every Plan reaches the hub; only the Plans that cannot start one see it marked Pro", () => {
    const { unmount } = renderWithJobs(<InterviewHub plan="free" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pro");
    unmount();

    renderWithJobs(<InterviewHub plan="pro" />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("Pro");
  });
});

describe("the start screen (tickets 05, 06)", () => {
  it("IV-U5: offers 5, 10, and 30 minutes to a pro Tenant, and starting sends the chosen one", async () => {
    const { user } = renderPanel();
    client.start.mockResolvedValue({ ok: true, attempt: attemptOf({ length: 30 }), quota: quota(8) });

    for (const minutes of [5, 10, 30]) expect(lengthButton(minutes)).toBeEnabled();

    await user.click(lengthButton(30));
    await user.click(startButton());

    expect(client.start).toHaveBeenCalledWith(job.id, 30, false);
  });

  it("IV-U6: each length shows its own Category breakdown, always across all five areas", async () => {
    const { user } = renderPanel();

    const counts = (): string[] =>
      CATEGORIES.map((category) => {
        const item = screen.getByText(CATEGORY_LABEL[category]).closest("li")!;
        return within(item).getByText(/question/).textContent ?? "";
      });

    expect(counts()).toEqual(CATEGORIES.map(() => "1 question"));

    await user.click(lengthButton(10));
    expect(counts()).toEqual(CATEGORIES.map(() => "2 questions"));

    await user.click(lengthButton(30));
    // The 30-minute mix is uneven but still spans all five.
    expect(counts()).toEqual(["2 questions", "3 questions", "3 questions", "4 questions", "3 questions"]);
  });

  it("IV-U7: speaking is the default where the browser can transcribe, with the reason shown", () => {
    renderPanel({ speech: true });

    expect(screen.getByRole("button", { name: /Speak my answers/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Type my answers/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(SPEAK_RECOMMENDED)).toBeInTheDocument();
  });

  it("IV-U8: a browser without speech recognition is offered typing only, with a note saying why", () => {
    renderPanel({ speech: false });

    expect(screen.queryByRole("button", { name: /Speak my answers/ })).not.toBeInTheDocument();
    expect(screen.getByText(SPEAK_UNSUPPORTED)).toBeInTheDocument();
  });

  it("IV-U9: what is left this week is shown, and nothing left stops the start", async () => {
    const { unmount } = renderPanel({ remaining: 3 });
    expect(screen.getByText("3 interviews left this week.")).toBeInTheDocument();
    unmount();

    renderPanel({ remaining: 0 });
    expect(screen.getByText(/You’ve used this week’s interviews/)).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
  });

  it("IV-U10: a refusal from the server is shown in the page's own words, and nothing starts", async () => {
    const { user } = renderPanel();
    client.start.mockResolvedValue({
      ok: false,
      error: "no-resume",
      message: INTERVIEW_FAILURES["no-resume"],
      refunded: false,
    });

    await user.click(startButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES["no-resume"]);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});

describe("the locked preview (ticket 08)", () => {
  it.each(["free", "basic"] as const)(
    "IV-U11: a %s Tenant sees the real start screen, locked, with no way into a real Attempt",
    async (plan) => {
      renderPanel({ plan });

      // The real screen: every length, and the real Category breakdown.
      for (const minutes of [5, 10, 30]) expect(lengthButton(minutes)).toBeDisabled();
      for (const category of CATEGORIES) expect(screen.getByText(CATEGORY_LABEL[category])).toBeInTheDocument();
      expect(screen.getByText(/interview simulator is a Pro feature/i)).toBeInTheDocument();

      // Not a disabled start button — no start action at all.
      expect(screen.queryByRole("button", { name: /Start interview/ })).not.toBeInTheDocument();
      expect(client.start).not.toHaveBeenCalled();
    },
  );

  it("IV-U12: the locked state cannot be clicked into a start: every control refuses", async () => {
    const { user } = renderPanel({ plan: "free" });

    await user.click(lengthButton(30));
    await user.click(screen.getByText(CATEGORY_LABEL.technical));

    expect(client.start).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Start interview/ })).not.toBeInTheDocument();
  });

  it("IV-U13: the locked preview has no accessibility violations", async () => {
    const { container } = renderPanel({ plan: "basic" });

    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("answering an Attempt (ticket 02)", () => {
  it("IV-U14: the countdown is stopped between questions and runs once answering begins", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: true });
    try {
      const attempt = attemptOf();
      const { user } = renderPanel({ attempt });
      await user.click(screen.getByRole("button", { name: "Resume" }));

      const clock = () => screen.getByRole("timer").textContent;
      const full = `${attemptSeconds(5) / 60}:00 left`;
      expect(clock()).toBe(full);

      // The pause is untimed: ten seconds of it move nothing.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(clock()).toBe(full);

      await user.click(screen.getByRole("button", { name: "Start answering" }));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(clock()).toBe("4:50 left");
    } finally {
      vi.useRealTimers();
    }
  });

  it("IV-U15: typing and submitting sends the transcript, the question, and the seconds it took", async () => {
    const attempt = attemptOf();
    const { user } = renderPanel({ attempt, speech: false });
    client.answer.mockResolvedValue({ ok: true, attempt: attemptOf({ answered: 1 }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Start answering" }));
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "I led the reporting redesign.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));

    await waitFor(() => expect(client.answer).toHaveBeenCalled());
    expect(client.answer).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({ questionId: "q0", transcript: "I led the reporting redesign." }),
    );
    expect(client.answer.mock.calls[0][1].elapsedSeconds).toBeGreaterThanOrEqual(0);
  });

  it("IV-U16: an empty answer cannot be submitted", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: false });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Start answering" }));

    expect(screen.getByRole("button", { name: "Submit answer" })).toBeDisabled();
    expect(client.answer).not.toHaveBeenCalled();
  });

  it("IV-U17: answering the last question reaches completion, and the page offers scoring rather than another question", async () => {
    const nearlyDone = attemptOf({ answered: 4 });
    const { user } = renderPanel({ attempt: nearlyDone, speech: false });
    client.answer.mockResolvedValue({ ok: true, attempt: attemptOf({ answered: 5 }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    // Four already answered, so the pause offers the next question rather than the first.
    await user.click(screen.getByRole("button", { name: "Next question" }));
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "The last one.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(await screen.findByRole("button", { name: "Score my interview" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("IV-U18: the countdown reaching zero ends the Attempt, and what was typed is never sent", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: true });
    try {
      // One second left on the budget.
      const nearlyOut: Attempt = { ...attemptOf(), activeSeconds: attemptSeconds(5) - 1 };
      const { user } = renderPanel({ attempt: nearlyOut, speech: false });
      client.timeUp.mockResolvedValue({ ok: true, attempt: { ...nearlyOut, completedAt: "2026-09-16T10:00:00.000Z" } });

      await user.click(screen.getByRole("button", { name: "Resume" }));
      await user.click(screen.getByRole("button", { name: "Start answering" }));
      await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Half an answ");
      await vi.advanceTimersByTimeAsync(2_000);

      await waitFor(() => expect(client.timeUp).toHaveBeenCalledWith(nearlyOut.id));
      // Nothing half-typed was recorded, and no question was force-submitted.
      expect(client.answer).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("IV-U19: a failed submission says so and leaves the Tenant on the same question", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: false });
    client.answer.mockResolvedValue({ ok: false, error: "failed", message: INTERVIEW_FAILURES.failed });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Start answering" }));
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "An answer.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES.failed);
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  /**
   * The server only banks an Answer's time when the Answer lands. So a failed submission has to
   * carry its seconds into the retry — otherwise retrying a question would hand the time back, and
   * a Tenant whose connection kept dropping would rehearse against a clock that never moved.
   */
  it("IV-U20: a retry after a failed submission keeps the seconds the first try spent", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: true });
    try {
      const { user } = renderPanel({ attempt: attemptOf(), speech: false });
      const act = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      client.answer.mockResolvedValue({ ok: false, error: "failed", message: INTERVIEW_FAILURES.failed });

      await act.click(screen.getByRole("button", { name: "Resume" }));
      await act.click(screen.getByRole("button", { name: "Start answering" }));
      await act.type(screen.getByRole("textbox", { name: "Your answer" }), "An answer.");
      await vi.advanceTimersByTimeAsync(20_000);
      await act.click(screen.getByRole("button", { name: "Submit answer" }));
      await screen.findByRole("alert");

      // Twenty seconds gone, and still gone when the question is opened again.
      expect(screen.getByRole("timer")).toHaveTextContent("4:40 left");
      await act.click(screen.getByRole("button", { name: "Start answering" }));
      expect(screen.getByRole("timer")).toHaveTextContent("4:40 left");
      // And what they already typed is still there to resend, rather than having to be retyped.
      expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue("An answer.");

      // The retry tells the server everything this question has cost, not just this try.
      client.answer.mockResolvedValue({ ok: true, attempt: attemptOf({ answered: 1 }) });
      await vi.advanceTimersByTimeAsync(5_000);
      await act.click(screen.getByRole("button", { name: "Submit answer" }));

      await waitFor(() => expect(client.answer).toHaveBeenCalledTimes(2));
      expect(client.answer.mock.calls[1][1].elapsedSeconds).toBe(25);
      void user;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("speaking an answer (ticket 06)", () => {
  it("IV-U21: with speech supported, answering listens rather than showing a box — and no audio is touched", async () => {
    const { user } = renderPanel({ attempt: attemptOf(), speech: true });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Start answering" }));

    expect(screen.getByText(/Listening/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Your answer" })).not.toBeInTheDocument();
    // The page never reaches for the microphone itself: the browser transcribes, and only text
    // is ever held. There is no recorder to have started.
    expect((window as unknown as { MediaRecorder?: unknown }).MediaRecorder).toBeUndefined();
  });

  it("IV-U22: the Tenant can switch to typing mid-question, and the typed answer goes to the same field", async () => {
    const attempt = attemptOf();
    const { user } = renderPanel({ attempt, speech: true });
    client.answer.mockResolvedValue({ ok: true, attempt: attemptOf({ answered: 1 }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Start answering" }));
    await user.click(screen.getByRole("button", { name: /Type this answer instead/ }));

    const box = screen.getByRole("textbox", { name: "Your answer" });
    await user.type(box, "Typed instead.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));

    await waitFor(() => expect(client.answer).toHaveBeenCalled());
    // The same `transcript` field either way: scoring cannot tell which mode produced it.
    expect(client.answer.mock.calls[0][1]).toMatchObject({ transcript: "Typed instead." });
  });
});

describe("resuming or resetting (ticket 04)", () => {
  it("IV-U22: an unfinished Attempt offers Resume, and resumes on the question that was not answered", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 2 }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(screen.getByText("A stakeholder question?")).toBeInTheDocument();
    expect(screen.getByText(/Question 3 of 5/)).toBeInTheDocument();
  });

  it("IV-U23: the remaining budget is what was left, not the whole length", async () => {
    // Two answers at 20 seconds each already banked against a five-minute budget.
    const { user } = renderPanel({ attempt: attemptOf({ answered: 2 }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(screen.getByRole("timer")).toHaveTextContent("4:20 left");
  });

  it("IV-U24: with Attempts left, resetting is offered and starts a fresh one", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 1 }), remaining: 4 });
    client.start.mockResolvedValue({ ok: true, attempt: attemptOf(), quota: quota(3) });

    await user.click(screen.getByRole("button", { name: /Start over/ }));

    expect(client.start).toHaveBeenCalledWith(job.id, 5, true);
  });

  it("IV-U25: with no Attempts left, only resuming is offered — reset is not there to click", () => {
    renderPanel({ attempt: attemptOf({ answered: 1 }), remaining: 0 });

    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start over/ })).not.toBeInTheDocument();
    expect(screen.getByText(/this is the one to finish/)).toBeInTheDocument();
  });
});

describe("the Scorecard (ticket 03)", () => {
  it("IV-U26: scoring a completed Attempt shows every Answer's score and rationale, by Category, with each rollup and the overall", async () => {
    const complete = attemptOf({ answered: 5 });
    const scored = attemptOf({ scored: true });
    const { user } = renderPanel({ attempt: complete });
    client.score.mockResolvedValue({
      ok: true,
      attempt: scored,
      scorecard: {
        overall: 70,
        categories: CATEGORIES.map((category, index) => ({
          category: category as Category,
          score: 60 + index * 5,
          questions: 1,
        })),
      },
    });

    await user.click(screen.getByRole("button", { name: "Score my interview" }));

    // The overall sits under its own heading, so it is not one number among the Category rollups.
    const overall = (await screen.findByText("Overall")).closest("div")!;
    expect(overall).toHaveTextContent("70");
    expect(client.score).toHaveBeenCalledWith(complete.id);

    for (const [index, category] of CATEGORIES.entries()) {
      const section = screen.getByRole("region", { name: CATEGORY_LABEL[category] });
      // The Category's own rollup, and the Answer's score and rationale under it.
      expect(section).toHaveTextContent(`${60 + index * 5} / 100`);
      expect(section).toHaveTextContent(`Because of the ${category} thing.`);
    }
  });

  it("IV-U27: an Attempt already scored opens on its Scorecard, with no scoring to do again", () => {
    renderPanel({ attempt: attemptOf({ scored: true }) });

    expect(screen.getByText("Overall")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Score my interview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("IV-U28: a scoring failure says so and leaves the Attempt scorable again", async () => {
    const { user } = renderPanel({ attempt: attemptOf({ answered: 5 }) });
    client.score.mockResolvedValue({ ok: false, error: "failed", message: INTERVIEW_FAILURES.failed });

    await user.click(screen.getByRole("button", { name: "Score my interview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES.failed);
    expect(screen.getByRole("button", { name: "Score my interview" })).toBeEnabled();
  });

  it("IV-U29: the Scorecard has no accessibility violations", async () => {
    const { container } = renderPanel({ attempt: attemptOf({ scored: true }) });

    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("a deployment with no key", () => {
  it("IV-U30: says the simulator is unavailable rather than offering a start that cannot work", () => {
    renderPanel({ available: false });

    expect(screen.getByRole("alert")).toHaveTextContent(INTERVIEW_FAILURES.unavailable);
    expect(screen.queryByRole("button", { name: "Start interview" })).not.toBeInTheDocument();
  });
});
