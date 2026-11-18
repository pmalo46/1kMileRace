-- Only runs that could put miles on the board that weren't run or walked now wait for a
-- reviewer: too fast for feet, a distance longer than the route, a treadmill photo from
-- another time, or a hand-entered run of 6 miles or more (packages/core rules.ts,
-- needsReview). Slow walks, stop-and-go outings, short hand-entered runs and treadmill photos
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
  and not (a.source = 'manual' and a.distance_m >= 6 * 1609.344);
