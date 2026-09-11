-- Ticket 16: the database half of the document sweep. `pg_cron` calls this every 15 minutes (the
-- schedule lives in supabase/migrations/20260911000000_provision_trailhead.sql). It is a janitor,
-- not a queue, and it never deletes a storage row: an object is removed only through the Storage
-- API, by the application, as the object's owner (src/server/data/documents.ts).
--
-- What it does, both steps idempotent:
--   1. An upload still not `ready` three hours after its row was created was abandoned (a signed
--      upload token lives two hours). Tombstone it.
--   2. A tombstoned row whose object no longer exists in Storage has nothing left to orphan. Delete
--      the row. A tombstone whose object still exists is left for the owner's next sweep, which
--      removes the object through the Storage API and then the row.
--
-- It runs as `postgres` (BYPASSRLS), which only ever READS storage.objects.

create or replace function public.sweep_documents() returns integer
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  finished integer;
begin
  update public."Document" d
     set "deletedAt" = now()
   where d."deletedAt" is null
     and d.ingestion <> 'ready'
     and d."createdAt" < now() - interval '3 hours';

  delete from public."Document" d
   where d."deletedAt" is not null
     and not exists (
       select 1
         from storage.objects o
        where o.bucket_id = 'documents'
          and o.name = d."storageKey"
     );
  get diagnostics finished = row_count;
  return finished;
end;
$$;

revoke all on function public.sweep_documents() from public;
grant execute on function public.sweep_documents() to postgres;
grant update ("deletedAt") on "Document" to postgres;
