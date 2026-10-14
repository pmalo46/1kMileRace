-- A milestone at 50 miles, so the first badge after the opening mile isn't 99 miles away.
-- Keep in step with MILESTONE_MILES in packages/core/src/quotes.ts.
create or replace function milestone_miles() returns integer[]
language sql immutable set search_path = '' as $$
  select array[1, 50, 100, 200, 250, 300, 400, 500, 600, 700, 750, 800, 900, 950, 975, 990, 995, 1000]
$$;

-- Runners already past 50 get the badge now.
select recompute_standing(race_id, user_id) from race_standings;
