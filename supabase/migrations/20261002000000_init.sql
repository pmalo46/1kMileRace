-- 1000-Mile Race: initial schema.
-- Units: distances in meters, durations in seconds, timestamps in UTC (timestamptz).
-- Activities are written only by the ingest-activity edge function (service role);
-- standings, race_activities, milestones, and feed items are derived by triggers.

-- ---------------------------------------------------------------------------
-- Units
-- ---------------------------------------------------------------------------
create function miles_to_m(p_miles double precision) returns double precision
language sql immutable as $$ select p_miles * 1609.344 $$;

create function m_to_miles(p_m double precision) returns double precision
language sql immutable as $$ select p_m / 1609.344 $$;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type activity_source as enum ('app_gps', 'healthkit', 'health_connect', 'file', 'treadmill_manual', 'polar');
create type activity_type as enum ('run', 'walk');
create type activity_environment as enum ('outdoor', 'treadmill');
create type verification_level as enum ('gps', 'device', 'photo', 'pending', 'rejected');
create type member_role as enum ('organizer', 'marshal', 'participant', 'supporter');
create type member_status as enum ('active', 'left', 'removed');
create type feed_item_type as enum ('activity', 'milestone', 'finish', 'joined');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  bio text check (char_length(bio) <= 280),
  units text not null default 'mi' check (units in ('mi', 'km')),
  created_at timestamptz not null default now()
);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'Runner'), '@', 1))
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Races and membership
-- ---------------------------------------------------------------------------
create table races (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 2000),
  cover_image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC',
  goal_m double precision not null default miles_to_m(1000) check (goal_m > 0),
  rules jsonb not null default '{}'::jsonb,
  visibility text not null default 'invite' check (visibility in ('invite', 'public')),
  invite_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table race_members (
  race_id uuid not null references races (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role member_role not null default 'participant',
  status member_status not null default 'active',
  division text,
  joined_at timestamptz not null default now(),
  primary key (race_id, user_id)
);
create index race_members_user_idx on race_members (user_id);

-- Membership helpers. security definer so RLS policies can call them without recursion.
create function is_race_member(p_race uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from race_members
    where race_id = p_race and user_id = p_user and status = 'active'
  )
$$;

create function has_race_role(p_race uuid, p_roles member_role[], p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from race_members
    where race_id = p_race and user_id = p_user and status = 'active' and role = any (p_roles)
  )
$$;

create function shares_race(p_other uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_other = p_user or exists (
    select 1 from race_members a join race_members b using (race_id)
    where a.user_id = p_user and b.user_id = p_other and a.status = 'active' and b.status = 'active'
  )
$$;

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------
create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  source activity_source not null,
  source_external_id text,
  type activity_type not null,
  environment activity_environment not null default 'outdoor',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_m double precision not null check (distance_m >= 0),
  moving_time_s integer not null check (moving_time_s > 0),
  elapsed_time_s integer not null check (elapsed_time_s > 0),
  elevation_gain_m double precision,
  avg_heart_rate double precision,
  device_name text,
  polyline text,
  splits jsonb,
  verification verification_level not null,
  flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (ended_at > started_at),
  unique (user_id, source, source_external_id)
);
create index activities_user_time_idx on activities (user_id, started_at);

create table activity_evidence (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities (id) on delete cascade,
  kind text not null check (kind in ('treadmill_console', 'watch_screen')),
  storage_path text not null,
  exif_taken_at timestamptz,
  created_at timestamptz not null default now()
);

create table activity_reviews (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities (id) on delete cascade,
  reviewer_id uuid not null references profiles (id),
  decision text not null check (decision in ('approve', 'reject')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Derived: what each activity counts for in each race, and standings
-- ---------------------------------------------------------------------------
create table race_activities (
  race_id uuid not null references races (id) on delete cascade,
  activity_id uuid not null references activities (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  counted_distance_m double precision not null,
  counted_moving_time_s double precision not null,
  primary key (race_id, activity_id)
);

create table race_standings (
  race_id uuid not null references races (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  -- All non-rejected miles in the window, including "bonus" miles past the goal.
  total_distance_m double precision not null default 0,
  total_moving_time_s double precision not null default 0,
  -- Miles toward the goal (capped at goal_m).
  counted_distance_m double precision not null default 0,
  counted_moving_time_s double precision not null default 0,
  activity_count integer not null default 0,
  last_activity_at timestamptz,
  -- When the goal-crossing activity ended (when the miles were run, not uploaded).
  finished_at timestamptz,
  -- Moving time for exactly goal_m, with the crossing activity prorated.
  finish_moving_time_s double precision,
  finish_rank integer,
  time_rank integer,
  updated_at timestamptz not null default now(),
  primary key (race_id, user_id)
);
create index race_standings_board_idx on race_standings (race_id, counted_distance_m desc);

create table milestones (
  race_id uuid not null references races (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  miles integer not null,
  reached_at timestamptz not null,
  primary key (race_id, user_id, miles)
);

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------
create table feed_items (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races (id) on delete cascade,
  actor_id uuid not null references profiles (id) on delete cascade,
  type feed_item_type not null,
  activity_id uuid references activities (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index feed_items_race_idx on feed_items (race_id, created_at desc);
create unique index feed_items_activity_once on feed_items (race_id, activity_id) where type = 'activity';
create unique index feed_items_milestone_once on feed_items (race_id, actor_id, ((payload ->> 'miles')))
  where type in ('milestone', 'finish');

create table cheers (
  feed_item_id uuid not null references feed_items (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  emoji text not null default '🔥' check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (feed_item_id, user_id, emoji)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  feed_item_id uuid not null references feed_items (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_item_idx on comments (feed_item_id, created_at);

create table push_tokens (
  token text primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Standings computation
-- ---------------------------------------------------------------------------
create function milestone_miles() returns integer[]
language sql immutable as $$ select array[1, 100, 250, 500, 750, 900, 1000] $$;

-- Rebuilds one runner's counted activities, standing, and milestones for one race.
create function recompute_standing(p_race uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r races%rowtype;
  a record;
  cum double precision := 0;
  cum_time double precision := 0;
  counted double precision;
  counted_time double precision;
  total double precision := 0;
  total_time double precision := 0;
  n integer := 0;
  last_at timestamptz;
  fin_at timestamptz;
  fin_time double precision;
  m integer;
  thr double precision;
  -- Summing many float distances can land a hair short of a round number;
  -- half a meter is far below GPS precision.
  eps constant double precision := 0.5;
begin
  select * into r from races where id = p_race;
  if not found then return; end if;

  delete from race_activities where race_id = p_race and user_id = p_user;

  if not is_race_member(p_race, p_user) or has_race_role(p_race, array['supporter']::member_role[], p_user) then
    delete from race_standings where race_id = p_race and user_id = p_user;
    delete from milestones where race_id = p_race and user_id = p_user;
    return;
  end if;

  for a in
    select id, ended_at, distance_m, moving_time_s
    from activities
    where user_id = p_user
      and verification <> 'rejected'
      and started_at >= r.starts_at
      and started_at < r.ends_at
    order by ended_at, started_at, id
  loop
    n := n + 1;
    total := total + a.distance_m;
    total_time := total_time + a.moving_time_s;
    last_at := a.ended_at;

    counted := least(a.distance_m, greatest(r.goal_m - cum, 0));
    counted_time := case when a.distance_m > 0 then a.moving_time_s * counted / a.distance_m else 0 end;

    insert into race_activities (race_id, activity_id, user_id, counted_distance_m, counted_moving_time_s)
    values (p_race, a.id, p_user, counted, counted_time);

    -- Milestones reached during this activity. The goal-sized milestone snaps to
    -- goal_m exactly so floating point can't leave a finisher just short of it.
    foreach m in array milestone_miles() loop
      thr := miles_to_m(m);
      if abs(thr - r.goal_m) < 1 then thr := r.goal_m; end if;
      if thr <= r.goal_m and cum < thr - eps and cum + counted >= thr - eps then
        insert into milestones (race_id, user_id, miles, reached_at)
        values (p_race, p_user, m, a.ended_at)
        on conflict (race_id, user_id, miles) do update set reached_at = excluded.reached_at;
      end if;
    end loop;

    if fin_at is null and cum + counted >= r.goal_m - eps then
      fin_at := a.ended_at;
      fin_time := cum_time + counted_time;
    end if;

    cum := cum + counted;
    cum_time := cum_time + counted_time;
  end loop;

  -- A rejected or deleted activity can take a runner back below a milestone,
  -- and rejected activities drop out of the feed.
  delete from milestones where race_id = p_race and user_id = p_user and miles_to_m(miles) > cum + 1;
  if fin_at is not null then cum := r.goal_m; end if;
  delete from feed_items f
  where f.race_id = p_race and f.actor_id = p_user and f.type = 'activity'
    and not exists (select 1 from race_activities ra where ra.race_id = p_race and ra.activity_id = f.activity_id);

  insert into race_standings as s (
    race_id, user_id, total_distance_m, total_moving_time_s, counted_distance_m, counted_moving_time_s,
    activity_count, last_activity_at, finished_at, finish_moving_time_s, updated_at
  ) values (p_race, p_user, total, total_time, cum, cum_time, n, last_at, fin_at, fin_time, now())
  on conflict (race_id, user_id) do update set
    total_distance_m = excluded.total_distance_m,
    total_moving_time_s = excluded.total_moving_time_s,
    counted_distance_m = excluded.counted_distance_m,
    counted_moving_time_s = excluded.counted_moving_time_s,
    activity_count = excluded.activity_count,
    last_activity_at = excluded.last_activity_at,
    finished_at = excluded.finished_at,
    finish_moving_time_s = excluded.finish_moving_time_s,
    updated_at = excluded.updated_at;

  perform recompute_race_ranks(p_race);
end $$;

-- Finish order (first winner) and moving-time order among finishers (second winner).
create function recompute_race_ranks(p_race uuid) returns void
language sql security definer set search_path = public as $$
  update race_standings s set
    finish_rank = ranked.fr,
    time_rank = ranked.tr
  from (
    select user_id,
      case when finished_at is not null
        then rank() over (order by finished_at nulls last) end as fr,
      case when finished_at is not null
        then rank() over (order by finish_moving_time_s nulls last) end as tr
    from race_standings
    where race_id = p_race
  ) ranked
  where s.race_id = p_race and s.user_id = ranked.user_id
    and (s.finish_rank is distinct from ranked.fr or s.time_rank is distinct from ranked.tr)
$$;

-- Recompute every race the runner belongs to whose window touches the given time.
create function recompute_for_activity(p_user uuid, p_started_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  for rid in
    select rm.race_id from race_members rm join races r on r.id = rm.race_id
    where rm.user_id = p_user and p_started_at >= r.starts_at and p_started_at < r.ends_at
  loop
    perform recompute_standing(rid, p_user);
  end loop;
end $$;

create function activities_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform recompute_for_activity(old.user_id, old.started_at);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT' or new.started_at is distinct from old.started_at or new.user_id is distinct from old.user_id then
      perform recompute_for_activity(new.user_id, new.started_at);
    end if;
  end if;
  return null;
end $$;

create trigger activities_recompute after insert or update or delete on activities
  for each row execute function activities_changed();

create function race_members_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_standing(old.race_id, old.user_id);
  else
    perform recompute_standing(new.race_id, new.user_id);
  end if;
  return null;
end $$;

create trigger race_members_recompute after insert or update of role, status or delete on race_members
  for each row execute function race_members_changed();

-- Re-ranking when a race's window or goal changes.
create function races_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  for uid in select user_id from race_members where race_id = new.id loop
    perform recompute_standing(new.id, uid);
  end loop;
  return null;
end $$;

create trigger races_recompute after update of starts_at, ends_at, goal_m on races
  for each row execute function races_changed();

-- ---------------------------------------------------------------------------
-- Feed generation
-- ---------------------------------------------------------------------------
create function feed_on_race_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into feed_items (race_id, actor_id, type, activity_id)
  values (new.race_id, new.user_id, 'activity', new.activity_id)
  on conflict do nothing;
  return null;
end $$;

create trigger race_activities_feed after insert on race_activities
  for each row execute function feed_on_race_activity();

create function feed_on_milestone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  goal_miles integer;
begin
  select round(m_to_miles(goal_m)) into goal_miles from races where id = new.race_id;
  insert into feed_items (race_id, actor_id, type, payload, created_at)
  values (
    new.race_id, new.user_id,
    case when new.miles >= goal_miles then 'finish'::feed_item_type else 'milestone'::feed_item_type end,
    jsonb_build_object('miles', new.miles),
    now()
  )
  on conflict do nothing;
  return null;
end $$;

create trigger milestones_feed after insert on milestones
  for each row execute function feed_on_milestone();

create function feed_on_milestone_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from feed_items
  where race_id = old.race_id and actor_id = old.user_id and type in ('milestone', 'finish')
    and payload ->> 'miles' = old.miles::text;
  return null;
end $$;

create trigger milestones_feed_removed after delete on milestones
  for each row execute function feed_on_milestone_removed();

create function feed_on_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into feed_items (race_id, actor_id, type) values (new.race_id, new.user_id, 'joined');
  return null;
end $$;

create trigger race_members_feed after insert on race_members
  for each row execute function feed_on_join();

-- ---------------------------------------------------------------------------
-- RPCs callable by signed-in users
-- ---------------------------------------------------------------------------
create function create_race(
  p_name text,
  p_slug text,
  p_starts_at timestamptz,
  p_timezone text default 'UTC',
  p_description text default null,
  p_goal_miles double precision default 1000,
  p_rules jsonb default '{}'::jsonb
) returns races
language plpgsql security definer set search_path = public as $$
declare
  r races;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into races (slug, name, description, starts_at, ends_at, timezone, goal_m, rules, created_by)
  values (p_slug, p_name, p_description, p_starts_at, p_starts_at + interval '365 days', p_timezone, miles_to_m(p_goal_miles), p_rules, auth.uid())
  returning * into r;
  insert into race_members (race_id, user_id, role) values (r.id, auth.uid(), 'organizer');
  return r;
end $$;

create function join_race(p_invite_code text, p_as_supporter boolean default false) returns races
language plpgsql security definer set search_path = public as $$
declare
  r races;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from races where invite_code = p_invite_code;
  if not found then raise exception 'invalid invite code'; end if;
  insert into race_members (race_id, user_id, role)
  values (r.id, auth.uid(), case when p_as_supporter then 'supporter'::member_role else 'participant'::member_role end)
  on conflict (race_id, user_id) do update set status = 'active'
    where race_members.status = 'left';
  return r;
end $$;

create function leave_race(p_race uuid) returns void
language sql security definer set search_path = public as $$
  update race_members set status = 'left' where race_id = p_race and user_id = auth.uid()
$$;

-- Marshals and organizers approve or reject an activity by a member of their race.
create function review_activity(p_activity uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  act activities%rowtype;
  allowed boolean;
begin
  select * into act from activities where id = p_activity;
  if not found then raise exception 'activity not found'; end if;
  if act.user_id = auth.uid() then raise exception 'cannot review your own activity'; end if;

  select exists (
    select 1 from race_members mine
    join race_members theirs on theirs.race_id = mine.race_id and theirs.user_id = act.user_id
    where mine.user_id = auth.uid() and mine.status = 'active'
      and mine.role in ('organizer', 'marshal')
  ) into allowed;
  if not allowed then raise exception 'not a marshal for this runner'; end if;

  insert into activity_reviews (activity_id, reviewer_id, decision, note)
  values (p_activity, auth.uid(), p_decision, p_note);

  update activities set verification = case
    when p_decision = 'reject' then 'rejected'::verification_level
    when environment = 'treadmill' then 'photo'::verification_level
    when polyline is not null or source = 'app_gps' then 'gps'::verification_level
    else 'device'::verification_level
  end
  where id = p_activity;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table races enable row level security;
alter table race_members enable row level security;
alter table activities enable row level security;
alter table activity_evidence enable row level security;
alter table activity_reviews enable row level security;
alter table race_activities enable row level security;
alter table race_standings enable row level security;
alter table milestones enable row level security;
alter table feed_items enable row level security;
alter table cheers enable row level security;
alter table comments enable row level security;
alter table push_tokens enable row level security;

create policy "profiles readable by signed-in users" on profiles for select to authenticated using (true);
create policy "update own profile" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "races visible to members or when public" on races for select to authenticated
  using (visibility = 'public' or is_race_member(id));
create policy "organizers edit races" on races for update to authenticated
  using (has_race_role(id, array['organizer']::member_role[]))
  with check (has_race_role(id, array['organizer']::member_role[]));

create policy "members see roster" on race_members for select to authenticated
  using (is_race_member(race_id));
create policy "organizers manage roster" on race_members for update to authenticated
  using (has_race_role(race_id, array['organizer']::member_role[]))
  with check (has_race_role(race_id, array['organizer']::member_role[]));

create policy "see own and racemates' activities" on activities for select to authenticated
  using (shares_race(user_id));
create policy "delete own activities" on activities for delete to authenticated
  using (user_id = auth.uid());

create policy "evidence visible to owner and marshals" on activity_evidence for select to authenticated
  using (exists (
    select 1 from activities a where a.id = activity_id and (
      a.user_id = auth.uid() or exists (
        select 1 from race_members rm
        where rm.user_id = a.user_id and has_race_role(rm.race_id, array['organizer', 'marshal']::member_role[])
      )
    )
  ));

create policy "reviews visible to racemates" on activity_reviews for select to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and shares_race(a.user_id)));

create policy "members see race activities" on race_activities for select to authenticated
  using (is_race_member(race_id));
create policy "members see standings" on race_standings for select to authenticated
  using (is_race_member(race_id));
create policy "members see milestones" on milestones for select to authenticated
  using (is_race_member(race_id));
create policy "members see feed" on feed_items for select to authenticated
  using (is_race_member(race_id));

create policy "members see cheers" on cheers for select to authenticated
  using (exists (select 1 from feed_items f where f.id = feed_item_id and is_race_member(f.race_id)));
create policy "members cheer" on cheers for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from feed_items f where f.id = feed_item_id and is_race_member(f.race_id)
  ));
create policy "remove own cheer" on cheers for delete to authenticated using (user_id = auth.uid());

create policy "members see comments" on comments for select to authenticated
  using (exists (select 1 from feed_items f where f.id = feed_item_id and is_race_member(f.race_id)));
create policy "members comment" on comments for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from feed_items f where f.id = feed_item_id and is_race_member(f.race_id)
  ));
create policy "delete own comment" on comments for delete to authenticated using (user_id = auth.uid());

create policy "own push tokens" on push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Internal functions are not part of the client API.
revoke execute on function recompute_standing(uuid, uuid) from public, anon, authenticated;
revoke execute on function recompute_race_ranks(uuid) from public, anon, authenticated;
revoke execute on function recompute_for_activity(uuid, timestamptz) from public, anon, authenticated;

-- Live updates for leaderboards and the feed (Realtime still applies the select policies above).
alter publication supabase_realtime add table race_standings, feed_items, cheers, comments;
