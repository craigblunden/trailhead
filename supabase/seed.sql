-- Local development only. `supabase db reset` runs this after the migrations; `supabase db push`
-- never sends it to the hosted project. These passwords exist so a clean clone can connect as the
-- two application roles without a dashboard visit; `.env.example` carries the matching URLs.
alter role trailhead_migrator password 'trailhead_migrator';
alter role trailhead_app password 'trailhead_app';
