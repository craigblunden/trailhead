import { stripInvisible } from "@/lib/invisible";

/**
 * App feedback: what the user tells the people who make Trailhead — a rating and their own words
 * about an issue, an idea, or how it is going. Emailed to the owner and stored nowhere. Not to be
 * confused with Feedback, which is about a letter (`CONTEXT.md`). Pure; shared by both sides.
 */

/** Room for a bug report with steps, and a bound on what one submission can put in an inbox. */
export const APP_FEEDBACK_MAX_CHARS = 2000;

export const APP_FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;

export type AppFeedbackRating = (typeof APP_FEEDBACK_RATINGS)[number];

export function isAppFeedbackRating(value: unknown): value is AppFeedbackRating {
  return APP_FEEDBACK_RATINGS.includes(value as AppFeedbackRating);
}

/**
 * Where App feedback was asked for, when not from the header's button — so the email says what it is
 * about (interview second pass ticket 08).
 */
export const APP_FEEDBACK_CONTEXTS = ["interview-simulator"] as const;

export type AppFeedbackContext = (typeof APP_FEEDBACK_CONTEXTS)[number];

/** How a context is named in the email and in the form's question. */
export const APP_FEEDBACK_CONTEXT_LABEL: Record<AppFeedbackContext, string> = {
  "interview-simulator": "Interview Simulator",
};

/** The words as they are sent and read: invisible characters gone, trimmed. */
export function appFeedbackWords(text: string): string {
  return stripInvisible(text).trim();
}

/** What the form and validation both say when a part is missing. */
export const APP_FEEDBACK_REFUSALS = {
  rating: "Choose a rating",
  message: "Tell us a little about it",
} as const;

/** What each rating says, for its accessible name and the line under the stars. */
export const APP_FEEDBACK_RATING_LABELS: Record<AppFeedbackRating, string> = {
  1: "Frustrating",
  2: "Needs work",
  3: "It's okay",
  4: "Good",
  5: "Love it",
};
