import { JobsProvider } from "@/components/jobs-provider";

/**
 * The job store, for the hub's picker and a Job's start screen — the same store the board mounts,
 * so a Job opened here is the one the board already holds rather than a second fetch of it. Gates
 * nothing; see `(app)/layout.tsx`.
 */
export default function InterviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <JobsProvider>{children}</JobsProvider>;
}
