-- One atomic document per work block. Cycles and intervals remain structured and authoritative.
create table public.tracker_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  avatar_path text,
  updated_at timestamptz not null default now()
);
create table public.tracker_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  revision bigint not null default 0,
  settings jsonb,
  checkpoint timestamptz not null default 'epoch'
);
create table public.work_blocks (
  user_id uuid not null references auth.users on delete cascade,
  id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  body jsonb not null,
  primary key (user_id, id),
  check (ended_at >= started_at),
  check ((body->>'id')::uuid = id)
);
create unique index work_blocks_one_open on public.work_blocks (user_id) where ended_at is null;
create index work_blocks_history on public.work_blocks (user_id, started_at);
create table public.activity_events (
  user_id uuid not null references auth.users on delete cascade,
  id uuid not null,
  revision bigint not null,
  position integer not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  body jsonb not null,
  primary key (user_id, id)
);
create index activity_events_history on public.activity_events (user_id, revision, position);
create table public.tracker_receipts (
  user_id uuid not null references auth.users on delete cascade,
  id uuid not null,
  revision bigint not null,
  primary key (user_id, id)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['tracker_profiles','tracker_accounts','work_blocks','activity_events','tracker_receipts']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create policy read_own on public.%I for select to authenticated using (user_id = (select auth.uid()))', table_name);
  end loop;
end
$$;

create function public.read_tracker() returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'revision', coalesce(a.revision, 0),
    'avatar', (select avatar_path from public.tracker_profiles where user_id = auth.uid()),
    'state', case when a.settings is not null then jsonb_build_object(
      'settings', a.settings, 'checkpoint', (extract(epoch from a.checkpoint) * 1000)::bigint,
      'blocks', coalesce((select jsonb_agg(body order by started_at, id) from public.work_blocks where user_id = auth.uid()), '[]'),
      'events', coalesce((select jsonb_agg(body order by revision, position) from public.activity_events where user_id = auth.uid()), '[]')
    ) end
  )
  from (select auth.uid() as uid) u left join public.tracker_accounts a on a.user_id = u.uid
$$;

create function public.write_tracker(batch jsonb) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  version bigint;
  receipt bigint;
  item jsonb;
  cycle jsonb;
  period jsonb;
  previous_end bigint;
  previous_cycle_end bigint;
  new_end bigint;
  event_position integer := 0;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  insert into public.tracker_accounts(user_id) values (owner_id) on conflict do nothing;
  select revision into version from public.tracker_accounts where user_id = owner_id for update;
  select revision into receipt from public.tracker_receipts where user_id = owner_id and id = (batch->>'id')::uuid;
  if found then return receipt; end if;
  if version is distinct from (batch->>'revision')::bigint then
    raise exception 'Tracker revision changed' using errcode = '40001';
  end if;

  for item in select value from jsonb_array_elements(batch->'blocks') order by (value->>'end')::bigint nulls last
  loop
    previous_cycle_end := (item->>'start')::bigint;
    for cycle in select value from jsonb_array_elements(item->'cycles')
    loop
      if previous_cycle_end is null or (cycle->>'start')::bigint < previous_cycle_end then
        raise exception 'Overlapping cycles';
      end if;
      previous_end := (cycle->>'start')::bigint;
      for period in select value from jsonb_array_elements(cycle->'intervals')
      loop
        new_end := (period->>'end')::bigint;
        if previous_end is null or previous_end <> (period->>'start')::bigint
           or new_end < (period->>'start')::bigint
           or period->>'kind' not in ('focus', 'manual_pause', 'system_interruption') then
          raise exception 'Invalid or overlapping focus interval';
        end if;
        previous_end := new_end;
      end loop;
      if previous_end is distinct from (cycle->>'end')::bigint then
        raise exception 'Focus end does not match its intervals';
      end if;
      if cycle ? 'rest' then
        if (cycle->'rest'->>'start')::bigint is distinct from previous_end
           or (cycle->'rest'->>'end')::bigint < previous_end then
          raise exception 'Invalid break interval';
        end if;
        previous_cycle_end := (cycle->'rest'->>'end')::bigint;
      else
        previous_cycle_end := previous_end;
      end if;
    end loop;
    if previous_cycle_end is distinct from (item->>'end')::bigint then
      raise exception 'Block end does not match its cycles';
    end if;
    insert into public.work_blocks(user_id, id, started_at, ended_at, body)
    values (owner_id, (item->>'id')::uuid, to_timestamp((item->>'start')::bigint / 1000.0),
            to_timestamp((item->>'end')::bigint / 1000.0), item)
    on conflict (user_id, id) do update set ended_at = excluded.ended_at, body = excluded.body
    where public.work_blocks.ended_at is null;
    if not found then raise exception 'Completed blocks are immutable'; end if;
  end loop;

  for item in select value from jsonb_array_elements(batch->'events')
  loop
    event_position := event_position + 1;
    insert into public.activity_events(user_id, id, revision, position, occurred_at, body)
    values (owner_id, (item->>'id')::uuid, version + 1, event_position, to_timestamp((item->>'at')::bigint / 1000.0), item)
    on conflict (user_id, id) do nothing;
  end loop;

  update public.tracker_accounts set revision = version + 1, settings = batch->'settings',
    checkpoint = to_timestamp((batch->>'checkpoint')::bigint / 1000.0) where user_id = owner_id;
  insert into public.tracker_receipts values (owner_id, (batch->>'id')::uuid, version + 1);
  return version + 1;
end
$$;

create function public.set_tracker_avatar(object_path text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or object_path is distinct from (auth.uid()::text || '/avatar') then
    raise insufficient_privilege;
  end if;
  insert into public.tracker_profiles(user_id, avatar_path) values (auth.uid(), object_path)
  on conflict (user_id) do update set avatar_path = excluded.avatar_path, updated_at = now();
end
$$;

revoke all on function public.read_tracker(), public.write_tracker(jsonb), public.set_tracker_avatar(text) from public, anon;
grant execute on function public.read_tracker(), public.write_tracker(jsonb), public.set_tracker_avatar(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2000000, array['image/jpeg', 'image/png', 'image/webp']);

create policy tracker_avatar_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');
create policy tracker_avatar_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');
create policy tracker_avatar_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');
