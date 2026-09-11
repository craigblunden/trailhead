-- Second review of ticket 16's janitor. A signed upload URL can be used again after its Document is
-- deleted, even a Document that was ready: the same token puts a file back under the same key
-- (proven in tests/integration/documents.test.ts). So no tombstone is forgotten while its upload URL
-- can still be used, whatever the Document's state: rows are finished only three hours after they
-- were created (a signed upload token lives two). The owner's sweep applies the same rule.

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
     and d."createdAt" < now() - interval '3 hours'
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
