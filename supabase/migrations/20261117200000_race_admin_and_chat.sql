-- Race admin and group chat.
--
-- 1. Organizers stop editing races and rosters directly. The old policies let an organizer
--    update any column: the invite code, anyone's role, even another organizer's. Each power
--    is now its own function that changes exactly one thing.
-- 2. Reviews: the queue of runs waiting on an organizer or marshal, a tighter
--    review_activity scoped to one race, and one tap to approve plain hand-entered runs.
-- 3. messages: one group chat per race, plus organizer announcements.

-- ---------------------------------------------------------------------------
-- 1. Organizer powers
-- ---------------------------------------------------------------------------
drop policy "organizers edit races" on races;
drop policy "organizers manage roster" on race_members;

create function private.require_race_role(p_race uuid, p_roles member_role[]) returns void
language plpgsql stable security definer set search_path = public, private as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not private.has_race_role(p_race, p_roles) then
    raise exception 'not allowed in this race';
  end if;
end $$;
revoke execute on function private.require_race_role(uuid, member_role[]) from public, anon, authenticated;

-- Name and description only. The start date and goal shape everyone's standings, so they
-- stay as the race was created.
create function update_race_details(p_race uuid, p_name text, p_description text default null) returns races
language plpgsql security definer set search_path = public, private as $$
declare
  r races;
begin
  perform private.require_race_role(p_race, array['organizer']::member_role[]);
  update races set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_race
  returning * into r;
  return r;
end $$;

-- A fresh invite code. Links and codes shared before stop working.
create function replace_invite_code(p_race uuid) returns text
language plpgsql security definer set search_path = public, private as $$
declare
  code text;
begin
  perform private.require_race_role(p_race, array['organizer']::member_role[]);
  update races set invite_code = private.new_invite_code() where id = p_race returning invite_code into code;
  return code;
end $$;

-- Runner or marshal. Organizers are never changed here, and nobody changes their own role.
create function set_member_role(p_race uuid, p_user uuid, p_role member_role) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.require_race_role(p_race, array['organizer']::member_role[]);
  if p_role not in ('participant', 'marshal') then raise exception 'role must be participant or marshal'; end if;
  if p_user = auth.uid() then raise exception 'cannot change your own role'; end if;
  update race_members set role = p_role
  where race_id = p_race and user_id = p_user and status = 'active' and role in ('participant', 'marshal');
  if not found then raise exception 'not a runner or marshal in this race'; end if;
end $$;

-- Out of the race: their standing goes, and join_race won't let them back in.
create function remove_member(p_race uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.require_race_role(p_race, array['organizer']::member_role[]);
  if p_user = auth.uid() then raise exception 'cannot remove yourself'; end if;
  update race_members set status = 'removed'
  where race_id = p_race and user_id = p_user and status = 'active' and role <> 'organizer';
  if not found then raise exception 'not a runner or marshal in this race'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Reviews
-- ---------------------------------------------------------------------------
drop function review_activity(uuid, text, text);

-- Count it or don't, for a run in this race that's waiting on a review. Rejecting takes
-- its miles, milestones and feed post back off through the standings triggers.
create function review_activity(p_race uuid, p_activity uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  act activities%rowtype;
  r races%rowtype;
begin
  perform private.require_race_role(p_race, array['organizer', 'marshal']::member_role[]);
  if p_decision not in ('approve', 'reject') then raise exception 'decision must be approve or reject'; end if;

  select * into act from activities where id = p_activity;
  if not found then raise exception 'activity not found'; end if;
  if act.user_id = auth.uid() then raise exception 'cannot review your own activity'; end if;
  if act.verification <> 'pending' then raise exception 'already reviewed'; end if;

  select * into r from races where id = p_race;
  if not private.is_race_member(p_race, act.user_id) or act.started_at < r.starts_at or act.started_at >= r.ends_at then
    raise exception 'not a run in this race';
  end if;

  insert into activity_reviews (activity_id, reviewer_id, decision, note)
  values (p_activity, auth.uid(), p_decision, nullif(trim(coalesce(p_note, '')), ''));

  update activities set verification = case
    when p_decision = 'reject' then 'rejected'::verification_level
    when environment = 'treadmill' then 'photo'::verification_level
    when polyline is not null or source = 'app_gps' then 'gps'::verification_level
    else 'device'::verification_level
  end
  where id = p_activity;
end $$;

-- Runs waiting on a review in this race, oldest first, with what a reviewer needs to decide.
create function pending_reviews(p_race uuid)
returns table (
  activity_id uuid,
  user_id uuid,
  display_name text,
  source activity_source,
  type activity_type,
  environment activity_environment,
  started_at timestamptz,
  distance_m double precision,
  moving_time_s integer,
  time_recorded boolean,
  flags jsonb,
  evidence_paths text[],
  usual_pace_s double precision
)
language plpgsql stable security definer set search_path = public, private as $$
#variable_conflict use_column
begin
  perform private.require_race_role(p_race, array['organizer', 'marshal']::member_role[]);
  return query
  select a.id, a.user_id, p.display_name, a.source, a.type, a.environment, a.started_at, a.distance_m,
         a.moving_time_s, a.time_recorded, a.flags,
         coalesce((select array_agg(e.storage_path order by e.created_at) from activity_evidence e where e.activity_id = a.id), '{}'),
         -- The runner's pace over their last 10 other timed runs, for comparison.
         (select sum(o.moving_time_s) / nullif(sum(o.distance_m) / 1609.344, 0)
            from (select o2.moving_time_s, o2.distance_m from activities o2
                  where o2.user_id = a.user_id and o2.id <> a.id and o2.verification <> 'rejected'
                    and o2.time_recorded and o2.distance_m > 0
                  order by o2.started_at desc limit 10) o)
  from activities a
  join races r on r.id = p_race
  join race_members m on m.race_id = p_race and m.user_id = a.user_id and m.status = 'active'
  join profiles p on p.id = a.user_id
  where a.verification = 'pending'
    and a.user_id <> auth.uid()
    and a.started_at >= r.starts_at and a.started_at < r.ends_at
  order by a.started_at;
end $$;

-- Approves every waiting run in the race that was only flagged for being typed in by hand.
-- Returns how many.
create function approve_hand_entered(p_race uuid) returns integer
language plpgsql security definer set search_path = public, private as $$
declare
  n integer;
begin
  perform private.require_race_role(p_race, array['organizer', 'marshal']::member_role[]);

  with plain as (
    select a.id
    from activities a
    join races r on r.id = p_race
    join race_members m on m.race_id = p_race and m.user_id = a.user_id and m.status = 'active'
    where a.verification = 'pending'
      and a.source = 'manual'
      and a.user_id <> auth.uid()
      and a.started_at >= r.starts_at and a.started_at < r.ends_at
      and not exists (select 1 from jsonb_array_elements(a.flags) f where f ->> 'code' <> 'manual_entry')
  ), reviewed as (
    insert into activity_reviews (activity_id, reviewer_id, decision)
    select id, auth.uid(), 'approve' from plain
    returning activity_id
  )
  update activities set verification = 'device' where id in (select activity_id from reviewed);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Group chat and announcements
-- ---------------------------------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null default 'chat' check (kind in ('chat', 'announcement')),
  body text not null default '' check (char_length(body) <= 2000),
  gif_id text check (char_length(gif_id) between 1 and 100),
  gif_url text check (gif_url ~ '^https://media[0-9]*\.giphy\.com/' and char_length(gif_url) <= 500),
  gif_width integer check (gif_width > 0),
  gif_height integer check (gif_height > 0),
  created_at timestamptz not null default now(),
  constraint messages_gif_complete check (num_nulls(gif_id, gif_url, gif_width, gif_height) in (0, 4)),
  constraint messages_not_empty check (char_length(trim(body)) >= 1 or gif_url is not null)
);
create index messages_race_idx on messages (race_id, created_at desc);
create index messages_announcements_idx on messages (race_id, created_at desc) where kind = 'announcement';
alter table messages enable row level security;

create policy "members read chat" on messages for select to authenticated
  using (private.is_race_member(race_id));
create policy "members chat" on messages for insert to authenticated
  with check (user_id = (select auth.uid()) and kind = 'chat' and private.is_race_member(race_id));
create policy "delete own messages, organizers any" on messages for delete to authenticated
  using (user_id = (select auth.uid()) or private.has_race_role(race_id, array['organizer']::member_role[]));

grant select, insert, delete on messages to authenticated;

-- Pinned to the top of the feed and chat, and sent to everyone.
create function post_announcement(p_race uuid, p_body text) returns messages
language plpgsql security definer set search_path = public, private as $$
declare
  m messages;
begin
  perform private.require_race_role(p_race, array['organizer']::member_role[]);
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'announcement is empty'; end if;
  insert into messages (race_id, user_id, kind, body) values (p_race, auth.uid(), 'announcement', trim(p_body))
  returning * into m;
  return m;
end $$;

alter publication supabase_realtime add table messages;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------
grant execute on function
  update_race_details(uuid, text, text),
  replace_invite_code(uuid),
  set_member_role(uuid, uuid, member_role),
  remove_member(uuid, uuid),
  review_activity(uuid, uuid, text, text),
  pending_reviews(uuid),
  approve_hand_entered(uuid),
  post_announcement(uuid, text)
to authenticated;
