"use client";

import { createContext, useContext } from "react";

import type { Plan } from "@/lib/plans";

/** The signed-in user, for display. Comes from the server; nothing here is a secret. */
export type SessionUser = { name: string; email: string; plan: Plan };

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): SessionUser | null {
  return useContext(SessionContext);
}
