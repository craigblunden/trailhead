import { stripInvisible } from "@/lib/invisible";

/**
 * How every piece of user text reaches a prompt: stripped of invisible characters (feedback issue
 * 02), inside a tag it cannot close.
 *
 * Both features that send a Tenant's own words to Claude — cover letters
 * (`src/server/generation/prompt.ts`) and the Interview Simulator (`src/server/interview/prompt.ts`)
 * — treat that text as material rather than instructions, and this is the mechanical half of that
 * claim: a resume, a posting, Feedback, or an Answer cannot close its own fence and address the
 * model from outside it. The other half is the system prompts, which say directions found inside
 * the material are ignored.
 *
 * One copy, so a hardening improvement lands on both features at once rather than on whichever one
 * someone remembered.
 */
export function fence(tag: string, text: string): string {
  return `<${tag}>\n${stripInvisible(text).trim().replaceAll(`</${tag}>`, `<\\/${tag}>`)}\n</${tag}>`;
}
