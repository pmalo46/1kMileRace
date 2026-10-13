-- More milestones: every hundred miles, the quarters, and a closing stretch
-- (950, 975, 990, 995) so the last miles have something to aim at.
-- Keep in step with MILESTONE_MILES in packages/core/src/quotes.ts.
create or replace function milestone_miles() returns integer[]
language sql immutable set search_path = '' as $$
  select array[1, 100, 200, 250, 300, 400, 500, 600, 700, 750, 800, 900, 950, 975, 990, 995, 1000]
$$;

-- Runners already past one of the new marks get it now.
select recompute_standing(race_id, user_id) from race_standings;
