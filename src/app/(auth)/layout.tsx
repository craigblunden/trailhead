import { BrandLogo } from "@/components/brand-logo";
import { LegalLinks } from "@/components/site-footer";
import { TrailScene } from "@/components/trail-scene";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="scene-wash flex flex-1 flex-col">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <BrandLogo href="/" size="lg" />
        <div className="mt-8 w-full max-w-md">{children}</div>
        <p className="mt-8 max-w-sm text-center text-sm text-pretty text-muted-foreground">
          Keep every application on the trail, and see what&rsquo;s working.
        </p>
        <LegalLinks className="mt-4" />
      </main>

      <TrailScene variant="hero" />
    </div>
  );
}
