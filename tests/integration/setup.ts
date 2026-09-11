import { loadLocalEnv } from "../load-env";

// Same file the developer runs the app with: `.env.local`, then `.env`.
loadLocalEnv();

for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
  if (!process.env[name]) {
    throw new Error(
      `${name} is not set. Integration tests need the local Supabase stack: ` +
        "run `npm run supabase:start` and copy `.env.example` to `.env.local`.",
    );
  }
}
