-- The finish clock stops at the line, not at the end of the run that crossed it.
--
-- finished_at used to be the crossing activity's ended_at, so a runner who kept going
-- for bonus miles could lose "first to 1,000" to someone who crossed later but stopped
-- sooner. It is now the moment within that activity when the goal was reached, placed
-- by distance the same way the crossing activity's moving time is already prorated.
-- Milestones get the same treatment so "hit 1,000 miles" and the finish agree.

-- When, during an activity, the runner had covered p_into_m of its distance.
create function crossed_at(p_started_at timestamptz, p_ended_at timestamptz, p_distance_m double precision, p_into_m double precision)
returns timestamptz
language sql immutable set search_path = '' as $$
  select case
    when p_distance_m > 0
      then p_started_at + (p_ended_at - p_started_at) * least(greatest(p_into_m / p_distance_m, 0), 1)
    else p_ended_at
  end
$$;
revoke execute on function crossed_at(timestamptz, timestamptz, double precision, double precision) from public, anon, authenticated;

create or replace function recompute_standing(p_race uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, private as $$
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
    select id, started_at, ended_at, distance_m, moving_time_s
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
        values (p_race, p_user, m, crossed_at(a.started_at, a.ended_at, a.distance_m, thr - cum))
        on conflict (race_id, user_id, miles) do update set reached_at = excluded.reached_at;
      end if;
    end loop;

    if fin_at is null and cum + counted >= r.goal_m - eps then
      fin_at := crossed_at(a.started_at, a.ended_at, a.distance_m, r.goal_m - cum);
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

-- Bring existing finish and milestone times in line.
select recompute_standing(race_id, user_id) from race_standings;
