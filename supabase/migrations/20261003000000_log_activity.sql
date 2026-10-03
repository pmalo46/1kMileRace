-- Logging runs: the ingest-activity edge function validates an activity with the
-- shared rules engine, then calls ingest_activity() here to write it atomically.
-- Treadmill photos go to the private `evidence` storage bucket.

-- Outdoor runs and walks typed in by hand, until GPS recording and health sync land.
alter type activity_source add value 'manual';

-- ---------------------------------------------------------------------------
-- Ingest (service role only)
-- ---------------------------------------------------------------------------
-- p_activity is an activities row as JSON (snake_case columns, without user_id).
-- p_replaces are the user's lower-quality copies of the same workout, found by dedup.
create function ingest_activity(
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
    device_name, polyline, splits, verification, flags
  )
  select
    p_user, r.source, r.source_external_id, r.type, r.environment, r.started_at, r.ended_at,
    r.distance_m, r.moving_time_s, r.elapsed_time_s, r.elevation_gain_m, r.avg_heart_rate,
    r.device_name, r.polyline, r.splits, r.verification, coalesce(r.flags, '[]'::jsonb)
  from jsonb_populate_record(null::activities, p_activity) r
  returning * into a;

  if p_evidence_path is not null then
    insert into activity_evidence (activity_id, kind, storage_path, exif_taken_at)
    values (a.id, 'treadmill_console', p_evidence_path, p_evidence_taken_at);
  end if;

  return a;
end $$;

revoke execute on function ingest_activity(uuid, jsonb, uuid[], text, timestamptz) from public, anon, authenticated;
grant execute on function ingest_activity(uuid, jsonb, uuid[], text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Evidence photos: <user id>/<file> in a private bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/heic']);

create policy "upload own evidence" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "remove own evidence" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Same audience as activity_evidence: the runner, and organizers or marshals of their races.
create policy "evidence visible to owner and marshals" on storage.objects for select to authenticated
  using (
    bucket_id = 'evidence' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from race_members rm
        where rm.user_id::text = (storage.foldername(name))[1]
          and private.has_race_role(rm.race_id, array['organizer', 'marshal']::member_role[])
      )
    )
  );
