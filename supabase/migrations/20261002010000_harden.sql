-- Hardening after the first Supabase advisor run.
-- 1. Only the four app RPCs are callable through the API, and only when signed in.
-- 2. Membership helpers move to a schema the API doesn't expose: RLS policies still
--    call them (policies reference functions by OID), but nobody can probe
--    arbitrary users' memberships via /rest/v1/rpc.
-- 3. RLS policies evaluate auth.uid() once per query instead of once per row.
-- 4. Indexes on foreign keys (account deletion cascades and per-user lookups).

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
create schema private;
grant usage on schema private to authenticated;

alter function is_race_member(uuid, uuid) set schema private;
alter function has_race_role(uuid, member_role[], uuid) set schema private;
alter function shares_race(uuid, uuid) set schema private;
revoke execute on function private.is_race_member(uuid, uuid) from public, anon;
revoke execute on function private.has_race_role(uuid, member_role[], uuid) from public, anon;
revoke execute on function private.shares_race(uuid, uuid) from public, anon;
grant execute on function private.is_race_member(uuid, uuid) to authenticated;
grant execute on function private.has_race_role(uuid, member_role[], uuid) to authenticated;
grant execute on function private.shares_race(uuid, uuid) to authenticated;

-- recompute_standing calls the helpers by name.
alter function recompute_standing(uuid, uuid) set search_path = public, private;

-- Trigger functions are never called directly (triggers don't check EXECUTE when they fire).
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function activities_changed() from public, anon, authenticated;
revoke execute on function race_members_changed() from public, anon, authenticated;
revoke execute on function races_changed() from public, anon, authenticated;
revoke execute on function feed_on_race_activity() from public, anon, authenticated;
revoke execute on function feed_on_milestone() from public, anon, authenticated;
revoke execute on function feed_on_milestone_removed() from public, anon, authenticated;
revoke execute on function feed_on_join() from public, anon, authenticated;

-- App RPCs: signed-in users only.
revoke execute on function create_race(text, text, timestamptz, text, text, double precision, jsonb) from public, anon;
revoke execute on function join_race(text, boolean) from public, anon;
revoke execute on function leave_race(uuid) from public, anon;
revoke execute on function review_activity(uuid, text, text) from public, anon;
grant execute on function create_race(text, text, timestamptz, text, text, double precision, jsonb) to authenticated;
grant execute on function join_race(text, boolean) to authenticated;
grant execute on function leave_race(uuid) to authenticated;
grant execute on function review_activity(uuid, text, text) to authenticated;

-- New functions start out uncallable by signed-out users; grant explicitly when needed.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

alter function miles_to_m(double precision) set search_path = '';
alter function m_to_miles(double precision) set search_path = '';
alter function milestone_miles() set search_path = '';

-- ---------------------------------------------------------------------------
-- RLS: evaluate auth.uid() once per query
-- ---------------------------------------------------------------------------
alter policy "update own profile" on profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter policy "delete own activities" on activities
  using (user_id = (select auth.uid()));

alter policy "evidence visible to owner and marshals" on activity_evidence
  using (exists (
    select 1 from activities a where a.id = activity_id and (
      a.user_id = (select auth.uid()) or exists (
        select 1 from race_members rm
        where rm.user_id = a.user_id and private.has_race_role(rm.race_id, array['organizer', 'marshal']::member_role[])
      )
    )
  ));

alter policy "members cheer" on cheers
  with check (user_id = (select auth.uid()) and exists (
    select 1 from feed_items f where f.id = feed_item_id and private.is_race_member(f.race_id)
  ));
alter policy "remove own cheer" on cheers using (user_id = (select auth.uid()));

alter policy "members comment" on comments
  with check (user_id = (select auth.uid()) and exists (
    select 1 from feed_items f where f.id = feed_item_id and private.is_race_member(f.race_id)
  ));
alter policy "delete own comment" on comments using (user_id = (select auth.uid()));

alter policy "own push tokens" on push_tokens
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Foreign key indexes
-- ---------------------------------------------------------------------------
create index races_created_by_idx on races (created_by);
create index activity_evidence_activity_idx on activity_evidence (activity_id);
create index activity_reviews_activity_idx on activity_reviews (activity_id);
create index activity_reviews_reviewer_idx on activity_reviews (reviewer_id);
create index race_activities_activity_idx on race_activities (activity_id);
create index race_activities_user_idx on race_activities (user_id);
create index race_standings_user_idx on race_standings (user_id);
create index milestones_user_idx on milestones (user_id);
create index feed_items_actor_idx on feed_items (actor_id);
create index feed_items_activity_idx on feed_items (activity_id);
create index cheers_user_idx on cheers (user_id);
create index comments_user_idx on comments (user_id);
create index push_tokens_user_idx on push_tokens (user_id);
