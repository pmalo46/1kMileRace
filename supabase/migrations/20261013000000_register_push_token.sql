-- Saving a device's push token.
--
-- A token belongs to a device, not a person: when someone else signs in on the same
-- phone the row has to move to them, which the "own push tokens" policy can't allow
-- (the existing row isn't theirs to update). This function does the hand-over.
create function register_push_token(p_token text, p_platform text) returns void
language sql security definer set search_path = public as $$
  insert into push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at
$$;
revoke execute on function register_push_token(text, text) from public, anon;
grant execute on function register_push_token(text, text) to authenticated;
