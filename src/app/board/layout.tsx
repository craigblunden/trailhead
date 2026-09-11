import { JobsProvider } from "@/components/jobs-provider";
import { Providers } from "@/components/providers";

/**
 * The shared layout hosts the query client and the job store. It does NOT check the session:
 * layouts do not re-render on client-side navigation, so a check here would not be evaluated
 * on every route change. Pages and the data layer own that.
 */
export default function BoardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Providers>
      <JobsProvider>{children}</JobsProvider>
    </Providers>
  );
}
