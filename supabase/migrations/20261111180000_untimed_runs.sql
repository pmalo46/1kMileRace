-- Runs added by hand without a time. The miles count in full; the ingest-activity function
-- sets the moving time to the race's slowest valid pace (30:00 a mile), so leaving the time
-- out can never help toward Fastest 1,000. time_recorded = false marks them so the app shows
-- "time not recorded" instead of a pace and leaves them out of pace stats.

alter table activities add column time_recorded boolean not null default true;

create or replace function ingest_activity(
  p_user uuid,
  p_activity jsonb,
  p_replaces uuid[] default '{}',
  p_evidence_path text default null,
  p_evidence_taken_at timestamptz default null
) returns activities
language plpgsql security definer set search_path = public as $$
declare
  a activities;
begin
  if p_evidence_path is not null and split_part(p_evidence_path, '/', 1) <> p_user::text then
    raise exception 'evidence must be in the uploader''s own folder';
  end if;

  delete from activities where user_id = p_user and id = any (p_replaces);

  insert into activities (
    user_id, source, source_external_id, type, environment, started_at, ended_at,
    distance_m, moving_time_s, elapsed_time_s, elevation_gain_m, avg_heart_rate,
    device_name, polyline, splits, verification, flags, time_recorded
  )
  select
    p_user, r.source, r.source_external_id, r.type, r.environment, r.started_at, r.ended_at,
    r.distance_m, r.moving_time_s, r.elapsed_time_s, r.elevation_gain_m, r.avg_heart_rate,
    r.device_name, r.polyline, r.splits, r.verification, coalesce(r.flags, '[]'::jsonb),
    coalesce((p_activity ->> 'time_recorded')::boolean, true)
  from jsonb_populate_record(null::activities, p_activity) r
  returning * into a;

  if p_evidence_path is not null then
    insert into activity_evidence (activity_id, kind, storage_path, exif_taken_at)
    values (a.id, 'treadmill_console', p_evidence_path, p_evidence_taken_at);
  end if;

  return a;
end $$;
