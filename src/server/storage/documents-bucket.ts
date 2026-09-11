import "server-only";

import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { createServerSupabase } from "@/server/auth/supabase";

/**
 * The private `documents` bucket, as the signed-in user. Every call made through it is checked by
 * Postgres against the policies on `storage.objects` (owner AND the user's key prefix), so this is
 * enforcement, not convention. It uses the publishable key and the user's session only: there is
 * no `service_role` key anywhere in this application, and a test fails if one appears.
 */
export async function documentsBucket() {
  const supabase = await createServerSupabase();
  return supabase.storage.from(DOCUMENTS_BUCKET);
}
