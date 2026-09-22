// A stand-in for the TypeSafe `systemOne` API, for the e2e suite (footing tickets 01, 04). Playwright
// starts it and points the app at it with TYPESAFE_BASE_URL, so no test spends money or needs a key.
//
// Wherever the real API answers with a position on each question's rubric, this answers with the same
// shape: one `{ type: "score", score, confidence, legend, probabilities }` per question asked, keyed
// by the question's name — which for the Footing is the dimension.
//
// What a request gets back is chosen by markers in the job description the state carries:
//   [[fstrong]]     every dimension at the top level, so the bands visibly move on a re-score
//   [[funclear]]    confidence below the app's threshold, so "Not clear-cut" shows
//   [[fslow]]       the ordinary answer, after 3 seconds
//   [[fhang]]       an answer after 30 seconds, past the app's footing timeout
//   [[foverload]]   HTTP 500
//   [[fratelimit]]  HTTP 429
//   [[fmalformed]]  a score outside the rubric, which the app must refuse to store
//   (none)          a middling answer, after 300 ms
//
// The markers mean something only here. The application sends the description as-is.

import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_TYPESAFE_PORT ?? 54398);

/** The app's rubrics have five levels, so a position runs 0–4. */
const TOP_LEVEL = 4;

/** Deliberately spread across bands, so a page showing five identical words would be a visible bug. */
const DEFAULT_LEVELS = { skills: 3, experience: 2, domain: 1, proof_of_work: 2, letter: 3 };

const probabilitiesFor = (level) =>
  Object.fromEntries(
    Array.from({ length: TOP_LEVEL + 1 }, (_, index) => [index, index === Math.round(level) ? 0.6 : 0.1]),
  );

const answerFor = (name, question, { level, confidence }) => ({
  type: "score",
  score: level,
  confidence,
  legend: Object.fromEntries((question?.criteria ?? []).map((entry, index) => [index, entry])),
  probabilities: probabilitiesFor(level),
});

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
      // A malformed request gets the 400 below.
    }
    const questions = body.questions ?? {};
    const description = String(body.state?.posting?.description ?? "");

    const send = (status, payload, delayMs) =>
      setTimeout(() => {
        if (response.destroyed) return;
        response.writeHead(status, {
          "content-type": "application/json",
          "x-typesafe-request-id": `req_fake_${Date.now()}`,
        });
        response.end(JSON.stringify(payload));
      }, delayMs);

    if (Object.keys(questions).length === 0) {
      return send(400, { error: { type: "invalid_request_error", message: "no questions" } }, 0);
    }
    if (description.includes("[[foverload]]")) {
      return send(500, { error: { type: "internal_error", message: "Overloaded" } }, 200);
    }
    if (description.includes("[[fratelimit]]")) {
      return send(429, { error: { type: "rate_limit_error", message: "Slow down" } }, 200);
    }

    const strong = description.includes("[[fstrong]]");
    const malformed = description.includes("[[fmalformed]]");
    const confidence = description.includes("[[funclear]]") ? 0.2 : 0.8;
    const delay = description.includes("[[fhang]]") ? 30_000 : description.includes("[[fslow]]") ? 3_000 : 300;

    const answers = Object.fromEntries(
      Object.entries(questions).map(([name, question]) => [
        name,
        answerFor(name, question, {
          level: malformed ? TOP_LEVEL + 3 : strong ? TOP_LEVEL : (DEFAULT_LEVELS[name] ?? 2),
          confidence,
        }),
      ]),
    );

    return send(
      200,
      { model: body.model ?? "jev-latest", answers, usage: { input_tokens: 4200, output_tokens: 0 } },
      delay,
    );
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`fake TypeSafe API on http://127.0.0.1:${PORT}`);
});
