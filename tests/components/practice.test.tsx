import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { InterviewPanel } from "@/components/interview/interview-panel";
import type { InterviewClient } from "@/components/interview/interview-client";
import { PracticePanel } from "@/components/interview/practice-panel";
import { SavedPracticeRound } from "@/components/interview/practice-rounds";
import type { PracticeClient } from "@/components/interview/practice-client";
import type { Job } from "@/lib/jobs";
import type { Plan } from "@/lib/plans";
import { PRACTICE_FAILURES, type PracticeCategory, type PracticeRound } from "@/lib/practice";
import { SEED_JOBS } from "../fixtures/jobs";
import { renderWithJobs, screen, userEvent, within } from "../test-utils";

/**
 * The Practice round's screens (practice round ticket 03), against a faked client — the seam the page
 * takes to its Route Handlers. The run screen itself is the Attempt's, tested in `interview.test.tsx`;
 * what is tested here is that a Practice round reaches it, and everything around it.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/interview/practice",
  useSelectedLayoutSegment: () => null,
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const client = vi.hoisted(() => ({ start: vi.fn(), answer: vi.fn(), timeUp: vi.fn() }));

const CATEGORIES: PracticeCategory[] = ["personal", "personal", "behavioural", "behavioural"];

/** A round with `answered` of its four questions answered, `activeSeconds` spent, and ended when `completed`. */
function roundOf({ answered = 0, activeSeconds = 0, completed = false, id = "round-1" } = {}): PracticeRound {
  return {
    id,
    countdownSeconds: 480,
    activeSeconds,
    startedAt: "2026-09-17T10:00:00.000Z",
    completedAt: completed ? "2026-09-17T10:08:00.000Z" : null,
    questions: CATEGORIES.map((category, order) => ({
      id: `${id}-q${order}`,
      category,
      order,
      text: `Practice ${category} question ${order + 1}?`,
      ...(order < answered ? { answer: { transcript: `My answer ${order + 1}.` } } : {}),
    })),
  };
}

function renderPractice({ round = null as PracticeRound | null } = {}) {
  return renderWithJobs(<PracticePanel round={round} client={client as unknown as PracticeClient} />, {
    initialJobs: SEED_JOBS as Job[],
  });
}

const go = () => screen.getByRole("button", { name: "Go" });

beforeEach(() => {
  for (const mock of Object.values(client)) mock.mockReset();
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the hub offers a Practice round (practice round ticket 03)", () => {
  const renderHub = (plan: Plan, practice: { unfinished: boolean } | null) =>
    renderWithJobs(
      <InterviewPanel
        job={null}
        plan={plan}
        attempt={null}
        quota={null}
        available
        practice={practice}
        client={{} as InterviewClient}
      />,
      { initialJobs: SEED_JOBS as Job[] },
    );

  it.each(["free", "basic"] as const)("PR-U1: a %s Tenant is offered a Practice round beside the locked preview", (plan) => {
    renderHub(plan, { unfinished: false });

    const offer = screen.getByRole("region", { name: "Try a practice round" });
    expect(offer).toHaveTextContent(/4 general questions · 8 minutes · not scored/);
    expect(screen.getByRole("link", { name: "Start a practice round" })).toHaveAttribute("href", "/interview/practice");
    expect(screen.getByText(/Interview Simulator is a Pro feature/)).toBeInTheDocument();
  });

  it("PR-U2: with a round unfinished, the offer is to resume it", () => {
    renderHub("free", { unfinished: true });

    expect(screen.getByRole("link", { name: "Resume your practice round" })).toHaveAttribute("href", "/interview/practice");
  });

  it("PR-U3: a pro Tenant is offered none", () => {
    renderHub("pro", null);

    expect(screen.queryByRole("region", { name: "Try a practice round" })).not.toBeInTheDocument();
  });
});

describe("taking a Practice round (practice round ticket 03)", () => {
  it("PR-U4: the set-up says what a round is, and Go puts its first question up on the eight-minute clock", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], shouldAdvanceTime: false });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPractice();
    client.start.mockResolvedValue({ ok: true, round: roundOf() });

    expect(screen.getByRole("heading", { level: 1, name: "Practice round" })).toBeInTheDocument();
    expect(screen.getByText(/4 general questions · 8 minutes · not scored/)).toBeInTheDocument();
    await user.click(go());

    expect(client.start).toHaveBeenCalledWith(false);
    expect(await screen.findByRole("heading", { level: 1, name: "Practice personal question 1?" })).toBeInTheDocument();
    expect(screen.getByText("Practice round")).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 4/)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("8:00 left");
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole("timer")).toHaveTextContent("7:50 left");
  });

  it("PR-U5: an Answer goes to the round's own route, and the next question comes up", async () => {
    const round = roundOf();
    const { user } = renderPractice({ round });
    client.answer.mockResolvedValue({ ok: true, round: roundOf({ answered: 1, activeSeconds: 12 }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.type(screen.getByRole("textbox"), "I like building things.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(client.answer).toHaveBeenCalledWith(round.id, expect.objectContaining({ questionId: "round-1-q0", transcript: "I like building things." }));
    expect(await screen.findByRole("heading", { level: 1, name: "Practice personal question 2?" })).toBeInTheDocument();
  });

  it("PR-U6: an unfinished round says where it got to; Resume picks it up, and Start over begins a fresh one", async () => {
    const { user } = renderPractice({ round: roundOf({ answered: 1, activeSeconds: 30 }) });
    client.start.mockResolvedValue({ ok: true, round: roundOf({ id: "round-2" }) });

    expect(screen.getByText(/1 of 4 answered, with 7:30 left/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start over" }));

    expect(client.start).toHaveBeenCalledWith(true);
    expect(await screen.findByRole("heading", { level: 1, name: "Practice personal question 1?" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("8:00 left");
  });

  it("PR-U7: a round already in progress elsewhere is offered to resume rather than reported as a failure", async () => {
    const { user } = renderPractice();
    client.start.mockResolvedValue({
      ok: false,
      error: "in-progress",
      message: PRACTICE_FAILURES["in-progress"],
      round: roundOf({ answered: 2, activeSeconds: 200 }),
    });

    await user.click(go());

    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("PR-U8: a refusal is shown in the page's own words, and nothing starts", async () => {
    const { user } = renderPractice();
    client.start.mockResolvedValue({ ok: false, error: "has-simulator", message: PRACTICE_FAILURES["has-simulator"] });

    await user.click(go());

    expect(await screen.findByRole("alert")).toHaveTextContent(PRACTICE_FAILURES["has-simulator"]);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("PR-U9: the set-up and a resumable round have no accessibility violations", async () => {
    const setUp = renderPractice();
    expect(await axe(setUp.container, AXE_OPTIONS)).toHaveNoViolations();
    setUp.unmount();

    const resumable = renderPractice({ round: roundOf({ answered: 1 }) });
    expect(await axe(resumable.container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("the end of a Practice round (practice round ticket 04)", () => {
  /** A round the clock ran out on: two answered, the third half-said and kept, the fourth unreached. */
  const timedOut = (): PracticeRound => {
    const round = roundOf({ answered: 3, activeSeconds: 480 });
    return { ...round, completedAt: "2026-09-17T10:08:00.000Z" };
  };

  it("PR-U10: answering the last question ends the round, and every answer is read back in order", async () => {
    const round = roundOf({ answered: 3, activeSeconds: 300 });
    const { user } = renderPractice({ round });
    client.answer.mockResolvedValue({ ok: true, round: roundOf({ answered: 4, activeSeconds: 360, completed: true }) });

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.type(screen.getByRole("textbox"), "My answer 4.");
    await user.click(screen.getByRole("button", { name: "Submit final answer" }));

    expect(await screen.findByRole("heading", { level: 2, name: "That’s the practice round" })).toBeInTheDocument();
    const answers = screen.getAllByRole("article");
    expect(answers).toHaveLength(4);
    for (const [index, answer] of answers.entries()) {
      expect(within(answer).getByRole("heading", { level: 3 })).toHaveTextContent(`question ${index + 1}?`);
      expect(answer).toHaveTextContent(`My answer ${index + 1}.`);
    }
    expect(answers[0]).toHaveTextContent("Personal");
    expect(answers[3]).toHaveTextContent("Behavioural");
  });

  it("PR-U11: when the clock ran out, it says so, and a question never reached reads Not reached", () => {
    renderPractice({ round: timedOut() });

    expect(screen.getByRole("heading", { level: 2, name: "Time’s up" })).toBeInTheDocument();
    const answers = screen.getAllByRole("article");
    expect(answers[2]).toHaveTextContent("My answer 3.");
    expect(answers[3]).toHaveTextContent("Not reached");
  });

  it("PR-U11b: a round the clock ran out on mid-way through the last question is still Time's up, though every question kept an answer", () => {
    renderPractice({ round: { ...roundOf({ answered: 4, activeSeconds: 480 }), completedAt: "2026-09-17T10:08:00.000Z" } });

    expect(screen.getByRole("heading", { level: 2, name: "Time’s up" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")[3]).toHaveTextContent("My answer 4.");
  });

  it("PR-U12: where a Scorecard would be, scoring is shown as part of Pro — no scores, and a way to see the plans", () => {
    renderPractice({ round: roundOf({ answered: 4, completed: true }) });

    const locked = screen.getByRole("region", { name: "Scoring comes with Pro" });
    expect(locked).toHaveTextContent(/stars/);
    expect(locked).toHaveTextContent(/what landed/);
    expect(locked).toHaveTextContent(/what you missed/);
    expect(locked).toHaveTextContent(/what to change next time/);
    expect(within(locked).getByRole("link", { name: "Compare plans" })).toHaveAttribute("href", "/account#plans");
    expect(screen.queryByRole("img", { name: /of 5 stars/ })).not.toBeInTheDocument();
    expect(screen.getByText(/full Interview Simulator/)).toBeInTheDocument();
  });

  it("PR-U13: Practise again starts a fresh round, straight onto its first question", async () => {
    const { user } = renderPractice({ round: roundOf({ answered: 4, completed: true }) });
    client.start.mockResolvedValue({ ok: true, round: roundOf({ id: "round-2" }) });

    await user.click(screen.getByRole("button", { name: "Practise again" }));

    expect(client.start).toHaveBeenCalledWith(false);
    expect(await screen.findByRole("heading", { level: 1, name: "Practice personal question 1?" })).toBeInTheDocument();
  });

  it("PR-U14: the end of a round has no accessibility violations", async () => {
    const { container } = renderPractice({ round: timedOut() });

    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("saved Practice rounds (practice round ticket 05)", () => {
  const saved = [
    { id: "round-9", startedOn: "2026-09-17", answered: 4 },
    { id: "round-8", startedOn: "2026-09-15", answered: 2 },
  ];

  const renderHub = (plan: Plan, practiceRounds: typeof saved) =>
    renderWithJobs(
      <InterviewPanel
        job={null}
        plan={plan}
        attempt={null}
        quota={null}
        available
        practice={plan === "pro" ? null : { unfinished: false }}
        practiceRounds={practiceRounds}
        client={{} as InterviewClient}
      />,
      { initialJobs: SEED_JOBS as Job[] },
    );

  it.each(["free", "pro"] as const)("PR-U15: a %s Tenant's hub lists finished rounds, newest first, each opening its own page", (plan) => {
    renderHub(plan, saved);

    const list = screen.getByRole("region", { name: "Practice rounds" });
    const rows = within(list).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/interview/practice/round-9", "/interview/practice/round-8"]);
    expect(rows[0]).toHaveTextContent("Practice round");
    expect(rows[0]).toHaveTextContent("Not scored");
    expect(rows[1]).toHaveTextContent("2 of 4 answered");
  });

  it("PR-U16: with no saved rounds there is no section at all", () => {
    renderHub("free", []);

    expect(screen.queryByRole("region", { name: "Practice rounds" })).not.toBeInTheDocument();
  });

  it("PR-U17: a saved round reads back view-only, with the way back, scoring on Pro, and another round", async () => {
    const { container } = renderWithJobs(<SavedPracticeRound round={roundOf({ answered: 4, completed: true })} plan="free" />, {
      initialJobs: SEED_JOBS as Job[],
    });

    expect(screen.getByRole("heading", { level: 1, name: "Practice round" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Interview Simulator" })).toHaveAttribute("href", "/interview");
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByRole("region", { name: "Scoring comes with Pro" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Practise again" })).toHaveAttribute("href", "/interview/practice");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("PR-U18: a Tenant now on pro reads it back, and is offered no scoring or another round", () => {
    renderWithJobs(<SavedPracticeRound round={roundOf({ answered: 4, completed: true })} plan="pro" />, {
      initialJobs: SEED_JOBS as Job[],
    });

    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.queryByRole("region", { name: "Scoring comes with Pro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Practise again" })).not.toBeInTheDocument();
    expect(screen.getByText(/not scored/i)).toBeInTheDocument();
  });
});
