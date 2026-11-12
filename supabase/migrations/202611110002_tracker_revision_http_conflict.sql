-- A stale client revision is an application conflict, not a serialization failure.
-- PostgREST maps PT409 to HTTP 409. Keep the function's existing grants and body.
do $$
declare
  definition text := pg_get_functiondef('public.write_tracker(jsonb)'::regprocedure);
  updated text;
begin
  if definition ~ $pattern$errcode[[:space:]]*=[[:space:]]*'PT409'$pattern$ then
    return;
  end if;

  updated := regexp_replace(
    definition,
    $pattern$errcode[[:space:]]*=[[:space:]]*'40001'$pattern$,
    $replacement$errcode = 'PT409'$replacement$
  );
  if updated = definition then
    raise exception 'Expected tracker revision conflict in write_tracker';
  end if;

  execute updated;
end
$$;
