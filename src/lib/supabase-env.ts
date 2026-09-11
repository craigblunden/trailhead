/**
 * The two public Supabase values, read once and checked. Both are `NEXT_PUBLIC_` because the
 * browser needs them for social sign-in (ticket 07); the publishable key is safe to expose by
 * design. The secret / `service_role` key is never read anywhere in this application.
 */
export function supabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set — see .env.example",
    );
  }
  return { url, publishableKey };
}
