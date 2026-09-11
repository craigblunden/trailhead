import Link from "next/link";

import { Button } from "@/components/ui/button";

export const ReadyToHitTheTrail = () => {
  return (
    <section
      aria-labelledby="ready-heading"
      className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-14 text-center"
    >
      <h2 id="ready-heading" className="text-3xl font-heading">
        Ready to hit the trail?
      </h2>
      <Button asChild className="mt-6 h-11 px-6 text-base">
        <Link href="/signup">Create your account</Link>
      </Button>
      <p className="mt-6 text-sm text-muted-foreground">
        Trailhead — keep every application on the trail.
      </p>
    </section>
  );
};
