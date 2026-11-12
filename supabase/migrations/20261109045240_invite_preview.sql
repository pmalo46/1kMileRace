-- What an invite link shows before the person tapping it has an account: the race's name,
-- who started it, how many are in, and when it starts. Nothing else about the race leaks.
create function invite_preview(p_invite_code text)
returns table (name text, organizer_name text, member_count integer, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.name,
         p.display_name,
         (select count(*)::integer from race_members m
           where m.race_id = r.id and m.status = 'active' and m.role <> 'supporter'),
         r.starts_at
  from races r
  join profiles p on p.id = r.created_by
  where r.invite_code = lower(trim(p_invite_code))
$$;

revoke execute on function invite_preview(text) from public;
grant execute on function invite_preview(text) to anon, authenticated;
