"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined;

/**
 * Per-request on the server — a shared client there would leak one user's data into another's
 * render — and a singleton in the browser, so navigations keep the cache.
 */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return new QueryClient();
  browserQueryClient ??= new QueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
