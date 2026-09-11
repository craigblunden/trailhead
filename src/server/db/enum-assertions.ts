import type {
  Accent as DbAccent,
  ContactKind as DbContactKind,
  Stage as DbStage,
} from "@/generated/prisma/enums";
import type { ContactKind } from "@/lib/contacts";
import type { Accent, Stage } from "@/lib/jobs";

/**
 * Compile-time proof that the database enums and the Phase-1 types are the same set, spelling
 * included. Drift fails `tsc` here rather than a runtime query. Nothing imports this module; the
 * typecheck covers it because it is in the project.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export const stageEnumsAgree: Same<DbStage, Stage> = true;
export const accentEnumsAgree: Same<DbAccent, Accent> = true;
export const contactKindEnumsAgree: Same<DbContactKind, ContactKind> = true;
