import { formatTermsDate } from "@/lib/terms";

/**
 * The shared furniture of the two disclosure pages: a title, a dated line under it, and headings and
 * paragraphs that read at the same size on both. Kept here rather than repeated, so the pages differ
 * in what they say and not in how they look.
 */

export function PageTitle({ children, version }: { children: string; version: string }) {
  return (
    <header className="mb-10">
      <h1 className="text-4xl leading-tight tracking-tight text-balance sm:text-5xl">{children}</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Last updated <time dateTime={version}>{formatTermsDate(version)}</time>.
      </p>
    </header>
  );
}

export function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-0">
      <h2 id={id} className="text-2xl tracking-tight">
        {heading}
      </h2>
      <div className="mt-3 space-y-3 text-pretty">{children}</div>
    </section>
  );
}

export function Subheading({ children }: { children: string }) {
  return <h3 className="mt-6 font-sans text-base font-bold">{children}</h3>;
}

export function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed text-muted-foreground">{children}</p>;
}

export function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="ml-5 list-disc space-y-1.5 leading-relaxed text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
