import type {
  Accent as DbAccent,
  Category as DbCategory,
  ContactKind as DbContactKind,
  Dimension as DbDimension,
  Plan as DbPlan,
  Stage as DbStage,
} from "@/generated/prisma/enums";
import type { ContactKind } from "@/lib/contacts";
import type { FootingDimension } from "@/lib/footing";
import type { Category } from "@/lib/interview";
import type { Accent, Stage } from "@/lib/jobs";
import type { Plan } from "@/lib/plans";

/**
 * Compile-time proof that the database enums and the Phase-1 types are the same set, spelling
 * included. Drift fails `tsc` here rather than a runtime query. Nothing imports this module; the
 * typecheck covers it because it is in the project.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export const stageEnumsAgree: Same<DbStage, Stage> = true;
export const accentEnumsAgree: Same<DbAccent, Accent> = true;
export const contactKindEnumsAgree: Same<DbContactKind, ContactKind> = true;
export const planEnumsAgree: Same<DbPlan, Plan> = true;
export const categoryEnumsAgree: Same<DbCategory, Category> = true;
// The schema calls it `Dimension`: the table that holds one scored dimension is already named
// `FootingDimension`. Same set, either way round, or this line stops compiling.
export const footingDimensionEnumsAgree: Same<DbDimension, FootingDimension> = true;
