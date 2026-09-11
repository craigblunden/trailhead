/**
 * Which social sign-in providers this deployment offers (ticket 07).
 *
 * OAuth apps and their callback URLs cannot be created from this repository, so a clean clone has
 * no credentials — and must still work. A provider is offered only when BOTH its client id and its
 * secret are set: the same variables that feed `supabase/config.toml` locally and are entered in
 * the Auth dashboard on the hosted project. Their values are only ever tested for presence; what
 * leaves this module is an id and a display name.
 */

export const SOCIAL_PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
] as const;

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export type SocialProviderId = SocialProvider["id"];

type Env = Readonly<Record<string, string | undefined>>;

const isSet = (value: string | undefined) => typeof value === "string" && value.trim() !== "";

export function enabledSocialProviders(env: Env): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter(({ id }) => {
    const prefix = `SUPABASE_AUTH_EXTERNAL_${id.toUpperCase()}`;
    return isSet(env[`${prefix}_CLIENT_ID`]) && isSet(env[`${prefix}_SECRET`]);
  });
}
