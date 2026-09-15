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

  it("LLM-4: describes the board, the job page, Documents and Contacts", async () => {
    const { text } = await llmsTxt();

    for (const heading of ["## The board", "## A job's page", "## Documents", "## Contacts"]) {
      expect(text).toContain(heading);
    }
  });
});
