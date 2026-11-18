-- Only runs that could put miles on the board that weren't run or walked now wait for a
-- reviewer: too fast for feet, a distance longer than the route, a treadmill photo from
-- another time or with no time on it at all, or a hand-entered run of 6 miles or more
-- (packages/core rules.ts, needsReview). Slow walks, stop-and-go outings, short hand-entered runs and treadmill photos
-- taken at the time count straight away, keeping their notes.
--
-- This releases the runs already waiting that the new rules wouldn't hold. They were
-- counting all along, so standings don't change.
update activities a
set verification = case
  when a.environment = 'treadmill' and a.source in ('manual', 'treadmill_manual') then 'photo'::verification_level
  when a.source = 'app_gps' or a.polyline is not null then 'gps'::verification_level
  else 'device'::verification_level
end
where a.verification = 'pending'
  and not exists (
    select 1 from jsonb_array_elements(a.flags) f
    where f ->> 'code' in ('pace_too_fast', 'distance_mismatch', 'photo_time_mismatch')
  )
  and not (a.source = 'manual' and a.distance_m >= 6 * 1609.344)
  -- A treadmill photo that doesn't say when it was taken still needs a person.
  and not (
    a.source = 'treadmill_manual'
    and not exists (select 1 from activity_evidence e where e.activity_id = a.id and e.exif_taken_at is not null)
  );

-- Treadmill photos show on the run's feed post, so everyone in the race can see them (and
-- still no one outside it). Before, only the runner and the race's organizers and marshals could.
alter policy "evidence visible to owner and marshals" on activity_evidence rename to "evidence visible to racemates";
alter policy "evidence visible to racemates" on activity_evidence
  using (exists (select 1 from activities a where a.id = activity_id and private.shares_race(a.user_id)));

-- Storage's tables belong to Supabase's storage service, so its existing rules can't be
-- changed from a migration; a new rule can be added, and either rule letting someone see a
-- photo is enough. The old one (owner, organizers, marshals) is a subset of this one.
create policy "evidence visible to racemates" on storage.objects for select to authenticated
  using (
    bucket_id = 'evidence' and case
      -- The folder is the uploader's id; anything else is nobody's to share.
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.shares_race(((storage.foldername(name))[1])::uuid)
      else false
    end
  );
