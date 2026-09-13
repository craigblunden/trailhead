-- A third Plan between free and pro. Additive only: every existing "UserPlan" row keeps its Plan,
-- and the grants and policies on the table are unchanged (ADR-0001). BEFORE keeps the enum's order
-- the same as `PLANS` in `src/lib/plans.ts`.
ALTER TYPE "Plan" ADD VALUE 'basic' BEFORE 'pro';
