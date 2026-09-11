-- Review fix to ticket 16's janitor. A signed upload URL stays valid for two hours whether or not
-- its Document row still exists, so a tombstone for an upload that never became `ready` must not be
-- forgotten while that URL can still be used: a late upload would land an object no row tracks and
-- no sweep would ever find. Such a tombstone is now kept until three hours after its row was
-- created (the same margin as abandoned uploads); ready Documents' tombstones are finished as before.
-- The owner's sweep (src/server/data/documents.ts) applies the same rule.

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
     and (d.ingestion = 'ready' or d."createdAt" < now() - interval '3 hours')
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
