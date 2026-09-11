import { JobsProvider } from "@/components/jobs-provider";

/** The job store, for the board and the job pages. Gates nothing; see `(app)/layout.tsx`. */
export default function BoardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <JobsProvider>{children}</JobsProvider>;
}
