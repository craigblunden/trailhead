// A stand-in for the Anthropic Messages API, for the e2e suite (tickets 18, 19, 20; feedback issue
// 03). Playwright starts it and points the app at it with ANTHROPIC_BASE_URL, so no test spends money
// or needs a key.
//
// Wherever the real API answers with a letter, this answers with the structured object the app asks
// for: `{ letter, verdict, set_aside }` as the text of one content block.
//
// What a request gets back is chosen by markers in the job description the prompt carries:
//   [[slow]]      a letter, after 5 seconds — long enough to edit the page meanwhile
//   [[refuse]]    HTTP 200 with stop_reason "refusal" (and a scrap of text, which must not be shown)
//   [[overload]]  HTTP 529 overloaded_error
//   [[hang]]      a letter after 30 seconds, past the app's generation timeout
//   (none)        a letter, after 400 ms
//
// And by markers in the Feedback a Rewrite carries, since Feedback is what is new:
//   [[flag]]      verdict "feedback" — the Feedback read as directions to the writer (a Flag)
//   [[material]]  verdict "material" — the posting or resume carried directions to an AI
//   [[aside]]     set_aside true — a request beyond the resume was declined
//
// A Rewrite's letter opens with a line that quotes the Feedback, so a test can see it changed. The
// markers mean something only here. The application sends every input as-is.

import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 54397);

const message = (overrides) => ({
  id: `msg_fake_${Date.now()}`,
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5",
  content: [],
  stop_reason: "end_turn",
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 1200, output_tokens: 420 },
  ...overrides,
});

const letterFor = (company, feedback) =>
  [
    "Dear Hiring Team,",
    ...(feedback ? [`Rewritten as asked: ${feedback.replace(/\[\[\w+\]\]/g, "").trim()}`] : []),
    `I'm writing about the Product Designer role at ${company}. For eight years I have designed analytics and onboarding for B2B software, most recently leading the redesign of Meridian Labs' reporting surface.`,
    "I would welcome the chance to bring that work to your team.",
    "Sincerely,\nSam Rivera",
  ].join("\n\n");

/** The structured answer, as the app reads it. */
const answer = ({ letter, verdict = "none", setAside = false }) =>
  message({ content: [{ type: "text", text: JSON.stringify({ letter, verdict, set_aside: setAside }) }] });

const fenced = (prompt, tag) => new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(prompt)?.[1] ?? null;

/*
 * The Interview Simulator's two calls (interview simulator tickets 01, 03) are told apart by their
 * system prompts, and answered in the shape each one's schema asks for. The same description markers
 * above still apply — `[[refuse]]`, `[[overload]]`, `[[hang]]` — since they are matched on the whole
 * prompt, so a test can exercise a failed generation the same way it does for a letter.
 */

const isQuestions = (system) => system.startsWith("You prepare a mock interview");
const isScoring = (system) => system.startsWith("You score a job seeker's answers");

/** The Category counts the prompt asked for, as its "- personal: 2" lines give them. */
const requestedMix = (prompt) =>
  Array.from(prompt.matchAll(/^- (\w+): (\d+)$/gm), ([, category, count]) => ({
    category,
    count: Number(count),
  }));

/** Exactly the mix asked for: a set that is short of one is malformed to the app, by design. */
const questionsFor = (prompt, company) =>
  message({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          questions: requestedMix(prompt).flatMap(({ category, count }) =>
            Array.from({ length: count }, (_, index) => ({
              category,
              text: `A ${category} question ${index + 1} about working at ${company}?`,
            })),
          ),
        }),
      },
    ],
  });

/** One score per answer, in order, so the app can say which Answer each belongs to. */
const scoresFor = (prompt) => {
  const answers = prompt.match(/<answer index="\d+"/g)?.length ?? 0;
  return message({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          scores: Array.from({ length: answers }, (_, index) => ({
            score: 60 + ((index * 7) % 30),
            rationale: `Answer ${index + 1}: you named the work but not what came of it.`,
          })),
        }),
      },
    ],
  });
};

createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }

  let raw = "";
  request.on("data", (chunk) => (raw += chunk));
  request.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      // A malformed request gets a letter-less error below.
    }
    const prompt = String(body.messages?.[0]?.content ?? "");
    const system = String(body.system ?? "");
    const company = fenced(prompt, "company") ?? "your company";
    const feedback = fenced(prompt, "feedback");

    const send = (status, payload, delayMs) =>
      setTimeout(() => {
        if (response.destroyed) return;
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      }, delayMs);

    if (!prompt) {
      return send(400, { type: "error", error: { type: "invalid_request_error", message: "no messages" } }, 0);
    }
    if (prompt.includes("[[refuse]]")) {
      return send(
        200,
        message({
          stop_reason: "refusal",
          stop_details: { type: "refusal", category: null, explanation: "Declined by the fake." },
          content: [{ type: "text", text: "Dear Hiring" }],
        }),
        300,
      );
    }
    if (prompt.includes("[[overload]]")) {
      return send(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, 200);
    }
    const delay = prompt.includes("[[hang]]") ? 30_000 : prompt.includes("[[slow]]") ? 5_000 : 400;
    if (isQuestions(system)) return send(200, questionsFor(prompt, company), delay);
    if (isScoring(system)) return send(200, scoresFor(prompt), delay);
    const verdict = feedback?.includes("[[flag]]") ? "feedback" : feedback?.includes("[[material]]") ? "material" : "none";
    const setAside = Boolean(feedback?.includes("[[aside]]"));
    return send(200, answer({ letter: letterFor(company, feedback), verdict, setAside }), delay);
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`fake Anthropic API on http://127.0.0.1:${PORT}`);
});
