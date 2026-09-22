import { describe, expect, it } from "vitest";

import { GET } from "@/app/llms.txt/route";

async function llmsTxt() {
  const response = GET();
  return { response, text: await response.text() };
}

describe("/llms.txt", () => {
  it("LLM-1: is plain text that opens with the product's name and a one-line summary", async () => {
    const { response, text } = await llmsTxt();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(text).toMatch(/^# Trail to Offer\n\n> .+/);
  });

  it("LLM-2: links the public pages absolutely, on the production domain", async () => {
    const { text } = await llmsTxt();

    expect(text).toContain("(https://www.trailtooffer.com/signup)");
    expect(text).toContain("(https://www.trailtooffer.com/login)");
  });

  it("LLM-3: tells an LLM what the forms accept — the Stages, the limits, and the Contact kinds", async () => {
    const { text } = await llmsTxt();

    for (const stage of ["Interested", "Applied", "Interviewing", "Offer", "Rejected"]) {
      expect(text).toContain(stage);
    }
    expect(text).toMatch(/Job description.*20,000 characters/);
    expect(text).toMatch(/Rejection letter.*20,000 characters/);
    expect(text).toMatch(/Company.*120 characters/);
    expect(text).toContain("PDF or DOCX, up to 5 MB");
    expect(text).toContain("Recruiter, Hiring manager, Referrer, Other");
  });

  it("LLM-4: describes the board, the job page, interview practice, Documents and Contacts", async () => {
    const { text } = await llmsTxt();

    for (const heading of [
      "## The board",
      "## A job's page",
      "## Interview Simulator",
      "## Documents",
      "## Contacts",
    ]) {
      expect(text).toContain(heading);
    }
  });

  /**
   * The user-facing half of footing ticket 06: an LLM helping someone use this product should know
   * that what they paste in reaches two named companies, and where to read the detail.
   */
  it("LLM-6: names both AI providers, links the disclosure pages, and never gives a footing as a number", async () => {
    const { text } = await llmsTxt();

    expect(text).toContain("(https://www.trailtooffer.com/privacy)");
    expect(text).toContain("(https://www.trailtooffer.com/terms)");
    expect(text).toContain("## What leaves the product");
    expect(text).toMatch(/Anthropic for cover letters, interview questions and interview scoring, and TypeSafe for a footing/);
    expect(text).toMatch(/never an uploaded file/);

    const footing = text.split("\n").find((line) => line.startsWith("- Your footing:"))!;
    expect(footing).toContain("Strong, Solid, Developing, or Not there yet");
    expect(footing).toMatch(/a word, not a number/);
    expect(footing).not.toMatch(/\d+\s*%/);
  });

  /**
   * The file is for a user's own LLM, so it says what the simulator needs from them and what it does
   * with what they say. Plan numbers stay out, as everywhere else here: they change with pricing.
   */
  it("LLM-5: says what interview practice needs, and that no audio is stored", async () => {
    const { text } = await llmsTxt();

    expect(text).toContain("15, 20, or 30 minutes");
    expect(text).toContain("personal, behavioural, stakeholder, technical, and design");
    expect(text).toMatch(/No audio is recorded, uploaded, or stored/);
    expect(text).toMatch(/doesn't pause between questions/);
    expect(text).toMatch(/each later one the moment the previous answer is submitted/);
    expect(text).toMatch(/once the browser has read it out/);
    // No Limit numbers: "10 a week" would go stale quietly.
    expect(text).not.toMatch(/d+ interviews a week/);
  });
});
