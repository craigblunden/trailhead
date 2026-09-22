import { NOT_READY_LABEL, SCORE_BAND_LABEL, scoreBand, type ScoreBand } from "@/lib/interview";

/**
 * A **Footing**: how securely a Tenant stands against one Job (`CONTEXT.md`; **ADR-0007**). Pure, and
 * the one place every number and every word in this feature lives.
 *
 * A Footing scores the comparison between a Job's posting and its Application kit across five
 * **Footing dimensions**, each against its own ordered descriptions. It deliberately is **not** an
 * Analysis: it finds no Gaps, cites nothing, and cannot say why. What it can say is *where to look* —
 * the dimension reading lowest is the thing to work on — which is why there are five bands and never
 * only one.
 *
 * Two rules this module exists to keep:
 *
 * - **No new band vocabulary.** A dimension's 0–100 is banded with the Scorecard's own `scoreBand()`
 *   and `SCORE_BAND_LABEL`. The same 0–100 must not speak two languages in one application.
 * - **Never a bare number.** The 0–100 is computed here, banded here, and never rendered anywhere.
 */

/** The five things a Footing scores. */
export const FOOTING_DIMENSIONS = ["skills", "experience", "domain", "proof_of_work", "letter"] as const;

export type FootingDimension = (typeof FOOTING_DIMENSIONS)[number];

/**
 * The four that describe the Tenant, and make up the overall Footing.
 *
 * **Letter is not among them, and never will be.** A cover letter can be rewritten in a minute, so
 * folding it in would let a rewrite move a number that claims to be about the Tenant's history.
 */
export const OVERALL_DIMENSIONS = ["skills", "experience", "domain", "proof_of_work"] as const;

export type OverallDimension = (typeof OVERALL_DIMENSIONS)[number];

/** How a dimension is named wherever it is shown. */
export const FOOTING_DIMENSION_LABEL: Record<FootingDimension, string> = {
  skills: "Skills",
  experience: "Experience",
  domain: "Domain",
  proof_of_work: "Proof of work",
  letter: "Letter",
};

/** What each dimension asks, shown beside its band so a band word is never on its own. */
export const FOOTING_DIMENSION_BLURB: Record<FootingDimension, string> = {
  skills: "Whether your resume shows the specific skills this posting names.",
  experience: "Whether its depth and seniority match what the posting asks for.",
  domain: "Whether the industry, product and company context line up.",
  proof_of_work: "Whether there are shipped things and outcomes, not just titles held.",
  letter: "Whether your cover letter makes the case this posting asks for.",
};

/**
 * What each of the four contributes to the overall Footing.
 *
 * **These are a starting guess, not a measured result.** Nothing has been calibrated against
 * outcomes; they say that skills and experience matter more than domain and proof of work, which is a
 * hunch about hiring rather than a finding. They are here, in one place, so tuning them is an edit
 * rather than an archaeology — and the overall is derived at read time, so tuning them re-reads every
 * Footing already stored instead of leaving a number no formula explains.
 */
export const WEIGHTS: Record<OverallDimension, number> = {
  skills: 0.3,
  experience: 0.3,
  domain: 0.2,
  proof_of_work: 0.2,
};

/**
 * How many ordered levels each dimension is scored against.
 *
 * **Five rather than four is arithmetic.** Normalised through `scoreBand()`'s existing 80/60/40
 * thresholds, four levels put exact hits at 0 / 33 / 67 / 100 — which leaves `developing` almost no
 * territory and drops too much into the lowest band. Five land at 0 / 25 / 50 / 75 / 100 and give
 * every band a home. `tests/lib/footing.test.ts` pins exactly that.
 */
export const FOOTING_LEVELS = 5;

/**
 * How many of a Job's earlier Footings the page lists. Not a chart and not a trend line — a short
 * list, long enough to see a resume's revisions against one posting and short enough to stay a list.
 */
export const FOOTING_HISTORY_MAX = 20;

/** Below this, a dimension's score is shown with its band and marked "not clear-cut". */
export const LOW_CONFIDENCE = 0.4;

/**
 * One level of one dimension's rubric: a **description of a situation**, never a degree. "Names three
 * of the five tools in the posting, with recent use" — not "moderately matched". That is the
 * provider's own guidance, and it is also what makes the result legible to the person reading it.
 *
 * `examples` is what a resume at this level tends to look like, for the cases where the model would
 * otherwise sit between two levels.
 */
export type FootingLevel = { what: string; examples: string };

/** At least two levels, ordered low to high — the shape the provider's `score` question takes. */
export type FootingCriteria = readonly [FootingLevel, FootingLevel, ...FootingLevel[]];

/**
 * The five rubrics, low to high. Every level of one dimension carries the same fields, so nothing in
 * a rubric reads as more specified than the level beside it.
 */
export const FOOTING_CRITERIA: Record<FootingDimension, FootingCriteria> = {
  skills: [
    {
      what: "The resume names none of the skills, tools or methods the posting asks for.",
      examples: "A posting asking for Kubernetes, Terraform and Go against a resume about print design.",
    },
    {
      what: "Names one or two of them, in a list of technologies rather than in any work it describes.",
      examples: "A skills row ending “…, Go, SQL” with nothing in the roles above it doing either.",
    },
    {
      what: "Names several of them, and at least one appears in work the resume actually describes doing.",
      examples: "Three of five named, one of them in a bullet about a real project, the rest in a list.",
    },
    {
      what: "Names most of the posting's skills, with described work for the ones the posting leads with.",
      examples: "Four of five named; the two in the posting's first paragraph both carry recent work.",
    },
    {
      what: "Names nearly all of them, each in described, recent work with enough detail to see the depth.",
      examples: "All five named, three of them on one recent project described in its own paragraph.",
    },
  ],
  experience: [
    {
      what: "The span and seniority are far short of what the posting asks for, or in a different discipline.",
      examples: "A posting for a staff engineer with eight years, against two years of internships.",
    },
    {
      what: "Short of what the posting asks for, in the right discipline.",
      examples: "Three years against a posting asking for six, with no lead or ownership described.",
    },
    {
      what: "Roughly the span the posting asks for, but the scope described sits below the level it names.",
      examples: "Seven years of delivery against a posting whose responsibilities are team-wide.",
    },
    {
      what: "The span and the level both match, with work described at the scope the posting names.",
      examples: "A senior title, and bullets about owning a surface end to end, against a senior posting.",
    },
    {
      what: "Meets or exceeds both, with work described a level above what the posting asks for.",
      examples: "A posting for a senior engineer against a resume describing leading a team of five.",
    },
  ],
  domain: [
    {
      what: "No overlap: a different industry, a different kind of product, and a different kind of company.",
      examples: "An agency-side brand designer against an in-house infrastructure posting.",
    },
    {
      what: "Overlap in one of the three — industry, kind of product, or kind of company — and not the others.",
      examples: "Fintech on both sides, but consumer app against enterprise platform, startup against bank.",
    },
    {
      what: "Overlap in two of the three, with nothing in the resume speaking to the posting's own users.",
      examples: "B2B SaaS at a similar size, but for a different kind of user than the posting describes.",
    },
    {
      what: "Overlap in all three, with described work whose users or problems resemble the posting's.",
      examples: "Analytics for operations teams, against a posting about analytics for operations teams.",
    },
    {
      what: "Overlap in all three, and the resume describes the posting's specific problem being solved.",
      examples: "The posting names onboarding drop-off; the resume describes fixing onboarding drop-off.",
    },
  ],
  proof_of_work: [
    {
      what: "No work described beyond job titles and responsibilities.",
      examples: "“Senior Designer, 2021–2025. Responsible for the design system.” and nothing further.",
    },
    {
      what: "Describes duties in detail, but nothing said to have shipped or concluded.",
      examples: "Paragraphs about process, reviews and rituals, with no thing that went out the door.",
    },
    {
      what: "Names things delivered, without scale, outcome or the Tenant's own part in them.",
      examples: "“Worked on the checkout redesign and the mobile app.”",
    },
    {
      what: "Names delivered work with the Tenant's part in it clear, or with an outcome attached.",
      examples: "“Led the checkout redesign” or “the redesign cut abandonment by a fifth” — one, not both.",
    },
    {
      what: "Names delivered work with the Tenant's part, an outcome, and something a reader could go and look at.",
      examples: "“Led the checkout redesign; abandonment fell a fifth; it is the flow on shop.example.com.”",
    },
  ],
  letter: [
    {
      what: "The letter could have been sent to any company: nothing in it is about this posting or this role.",
      examples: "A template with the company name substituted and no sentence that could not be reused.",
    },
    {
      what: "Names the company and the role, and otherwise restates the resume.",
      examples: "Three paragraphs walking through the same jobs in the same order as the resume.",
    },
    {
      what: "Picks up something the posting asks for, and answers it with an assertion rather than an example.",
      examples: "“I am highly experienced in distributed systems”, with no system named.",
    },
    {
      what: "Answers what the posting leads with, using specific work from the resume as the evidence.",
      examples: "The posting's first requirement, met by a named project and what it did.",
    },
    {
      what: "Answers what the posting leads with from specific work, and says why this company in particular.",
      examples: "As above, plus a paragraph about this company's product that could not be sent elsewhere.",
    },
  ],
};

/**
 * A raw level position — which may fall between two levels, since the provider returns an expected
 * score — as 0–100. Clamped, because a score outside the rubric is not a position on it.
 */
export function normalise(score: number, levels: number = FOOTING_LEVELS): number {
  const top = Math.max(levels - 1, 1);
  return Math.round((Math.min(Math.max(score, 0), top) / top) * 100);
}

/** One dimension of one Footing, as it is stored and as the page reads it. */
export type FootingDimensionScore = {
  dimension: FootingDimension;
  /** 0–100, already normalised. Computed, banded, and never rendered. */
  score: number;
  /** The provider's own confidence in that position, 0–1. */
  confidence: number;
};

/** What has changed on the Job since a Footing ran. Empty means the Footing is current. */
export type FootingChange = "resume" | "letter" | "description";

/**
 * What a Footing saw when it ran: which Documents were attached, and the content of the three texts
 * as SHA-256 hashes. Hashes rather than copies — `Document.text` "doubles as the content hash for
 * later comparison" — and they outlive the Documents, so a Footing whose resume was later deleted is
 * kept and reads permanently stale rather than disappearing with it.
 */
export type FootingStamp = {
  resumeId: string | null;
  coverLetterId: string | null;
  resumeHash: string;
  descriptionHash: string;
  coverLetterHash: string;
};

/**
 * What changed between the Job a Footing saw and the Job as it stands — the **Stale** rule
 * (`CONTEXT.md`), which did not have to change to cover a Footing. A stale Footing is still shown,
 * with a line saying what moved, and is never silently recomputed: running it again is the Tenant's act.
 */
export function changedSince(stamp: FootingStamp, now: FootingStamp): FootingChange[] {
  const changes: FootingChange[] = [];
  if (stamp.resumeId !== now.resumeId || stamp.resumeHash !== now.resumeHash) changes.push("resume");
  if (stamp.coverLetterId !== now.coverLetterId || stamp.coverLetterHash !== now.coverLetterHash) {
    changes.push("letter");
  }
  if (stamp.descriptionHash !== now.descriptionHash) changes.push("description");
  return changes;
}

/** How each change reads in the line a stale Footing carries. */
export const FOOTING_CHANGE_LABEL: Record<FootingChange, string> = {
  resume: "your resume",
  letter: "your cover letter",
  description: "the job description",
};

/** "Your resume has changed since this ran." — the whole of what a stale Footing says. */
export function staleLine(changes: readonly FootingChange[]): string {
  if (changes.length === 0) return "";
  const parts = changes.map((change) => FOOTING_CHANGE_LABEL[change]);
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${parts.length === 1 ? "has" : "have"} changed since this ran.`;
}

/** One Footing as the job page holds it. The overall is not here: it is derived on read. */
export type Footing = {
  id: string;
  jobId: string;
  /** ISO timestamp. */
  scoredAt: string;
  dimensions: FootingDimensionScore[];
  /** What has changed on the Job since it ran. Empty when it is current. */
  changed: FootingChange[];
};

export function dimensionOf(footing: Footing, dimension: FootingDimension): FootingDimensionScore | null {
  return footing.dimensions.find((scored) => scored.dimension === dimension) ?? null;
}

/** The four that make up the overall, in the order they are shown. */
export function overallDimensionsOf(footing: Footing): FootingDimensionScore[] {
  return OVERALL_DIMENSIONS.flatMap((dimension) => {
    const scored = dimensionOf(footing, dimension);
    return scored ? [scored] : [];
  });
}

/**
 * The overall Footing, 0–100: the four weighted together. **Derived at read time, never stored**, so
 * changing `WEIGHTS` re-reads history correctly.
 *
 * The weights are renormalised over whatever is present, so a Footing missing a dimension reads as
 * the weighted average of the rest rather than as a lower score for a reason nothing explains. Null
 * when none of the four is there at all.
 */
export function overallScore(footing: Footing): number | null {
  const scored = overallDimensionsOf(footing);
  if (scored.length === 0) return null;
  const weight = scored.reduce((sum, item) => sum + WEIGHTS[item.dimension as OverallDimension], 0);
  if (weight === 0) return null;
  return Math.round(
    scored.reduce((sum, item) => sum + item.score * WEIGHTS[item.dimension as OverallDimension], 0) / weight,
  );
}

/** The overall as a band — the only form it is ever shown in. Null when there is nothing to band. */
export function overallBand(footing: Footing): ScoreBand | null {
  const overall = overallScore(footing);
  return overall === null ? null : scoreBand(overall);
}

/** A dimension the provider was not sure about: shown with its band, and marked "not clear-cut". */
export function isUnclear(scored: FootingDimensionScore): boolean {
  return scored.confidence < LOW_CONFIDENCE;
}

/** Mean confidence across the four that make up the overall. Null when none of them is present. */
export function meanConfidence(footing: Footing): number | null {
  const scored = overallDimensionsOf(footing);
  if (scored.length === 0) return null;
  return scored.reduce((sum, item) => sum + item.confidence, 0) / scored.length;
}

/**
 * Whether the whole reading is shaky. When it is, that is said **once** above the breakdown and the
 * dimensions themselves are left unmarked — saying it five times inside a breakdown that is already
 * uncertain is noise, not honesty.
 */
export function isOverallUnclear(footing: Footing): boolean {
  const mean = meanConfidence(footing);
  return mean !== null && mean < LOW_CONFIDENCE;
}

/** The copy for a reading the provider was not sure about, whole or in part. */
export const UNCLEAR_LABEL = "Not clear-cut";
export const OVERALL_UNCLEAR_LINE =
  "There wasn’t much to go on here, so treat this reading as a rough one. A fuller job description usually sharpens it.";

/**
 * How this Footing's overall band compares with the one before it (footing ticket 05) — **bands, not
 * numbers**. A three-point move inside one band is not a change worth a sentence, and saying so in
 * numbers would break the never-a-number rule anyway.
 */
export type BandMove = "stronger" | "weaker" | "steady";

export function bandMove(newer: Footing, older: Footing): BandMove | null {
  const [now, before] = [overallScore(newer), overallScore(older)];
  if (now === null || before === null) return null;
  const order: ScoreBand[] = ["not-there-yet", "developing", "solid", "strong"];
  const moved = order.indexOf(scoreBand(now)) - order.indexOf(scoreBand(before));
  return moved > 0 ? "stronger" : moved < 0 ? "weaker" : "steady";
}

/**
 * The one sentence the whole history exists for. Honest in all three directions: a fall is said as a
 * fall, and an unchanged band is not dressed up as progress.
 */
export function comparisonLine(move: BandMove, band: ScoreBand): string {
  const word = SCORE_BAND_LABEL[band].toLowerCase();
  switch (move) {
    case "stronger":
      return `Stronger than last time on this one — ${word} now.`;
    case "weaker":
      return `Weaker than last time on this one — ${word} now.`;
    case "steady":
      return `About where it was last time — still ${word}.`;
  }
}

/**
 * The sentence for a Job's newest Footing, given the one before it. Null when there is nothing to
 * compare against: a single Footing says nothing about a trend, and must not pretend to.
 */
export function comparisonFor(newest: Footing, previous: Footing | null): string | null {
  if (!previous) return null;
  const move = bandMove(newest, previous);
  const band = overallBand(newest);
  return move && band ? comparisonLine(move, band) : null;
}

/**
 * Every way a scoring request can end without a Footing, as codes the route returns and the page
 * explains. The two refusals a Job can earn before anything is spent are `readinessOf()`'s own, in
 * `NOT_READY_LABEL`'s own words — a second vocabulary for the same two refusals would be two places
 * to keep in step and no clearer to read.
 */
export const FOOTING_FAILURES = {
  unavailable: "Footing isn’t available on this deployment yet.",
  "no-resume": NOT_READY_LABEL["no-resume"],
  "no-description": NOT_READY_LABEL["no-description"],
  // Ours: the Tenant really has scored a great deal today. The only message here shaped like a quota,
  // and the only one a Tenant can reach by their own doing.
  "rate-limited": "You’ve scored a lot of jobs today. Try again tomorrow.",
  // Theirs: the provider's own limit is shared across this whole deployment, so telling the Tenant
  // anything about *their* usage here would be false.
  busy: "The scoring service is busy right now. Try again in a minute.",
  "timed-out": "Scoring took longer than it should, so we stopped waiting. Try again.",
  truncated: "The scoring came back with something missing. Try again.",
  failed: "The scoring service had a problem. It’s usually brief — try again in a minute.",
} as const;

export type FootingFailure = keyof typeof FOOTING_FAILURES;

/** What the scoring route returns. A failure stores nothing and costs the Tenant nothing. */
export type FootingResponse =
  | { ok: true; footing: Footing; previous: Footing | null }
  | { ok: false; error: FootingFailure | "unauthenticated" | "not-found"; message: string };

/** A Job's Footings: the newest one, and the earlier ones as a short list, newest first. */
export type FootingHistory = {
  /** Null until the Tenant has scored this Job once. */
  newest: Footing | null;
  /** Every Footing before the newest, newest first, bounded by `FOOTING_HISTORY_MAX`. */
  earlier: Footing[];
};

/**
 * What the job page is told about a Job's Footing. `available` is false when no provider key is
 * configured — the feature is then unavailable rather than broken, and the control is absent
 * entirely rather than offered and then refused.
 */
export type FootingPanel = FootingHistory & { available: boolean };

