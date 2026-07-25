import { JobsProvider } from "@/components/jobs-provider";

export default function BoardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <JobsProvider>{children}</JobsProvider>;
}
