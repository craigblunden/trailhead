import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CoverLetterCard() {
  return (
    <section
      aria-labelledby="cover-letter-heading"
      className="rounded-lg bg-accent/70 p-5 ring-1 ring-primary/15"
    >
      <h2 id="cover-letter-heading" className="text-lg">
        Cover letter
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Generate a tailored draft from the job description and your resume.
      </p>
      <Button variant="outline" disabled className="mt-4 h-9 px-3.5">
        <Sparkles aria-hidden="true" />
        Generate — coming soon
      </Button>
    </section>
  );
}
