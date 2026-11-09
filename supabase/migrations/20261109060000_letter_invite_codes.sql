-- Invite codes were 10 hex characters, so some came out all digits (or nearly) and phones
-- read them as phone numbers: tapping one in a message opened the dialer. Codes are now
-- eight letters, minus i, l and o so nothing gets misread. The app shows them as ABCD-EFGH;
-- lookups ignore case, spaces and dashes so a code typed either way still works.

create function private.new_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from races where invite_code = code);
  end loop;
  return code;
end $$;

revoke execute on function private.new_invite_code() from public, anon, authenticated;

create function private.normalize_invite_code(p_code text) returns text
language sql immutable as $$
  select lower(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'))
$$;


alter table races alter column invite_code set default private.new_invite_code();

-- Retire codes that a phone could take for a number.
update races set invite_code = private.new_invite_code() where invite_code ~ '[0-9]{5,}';

create or replace function join_race(p_invite_code text, p_as_supporter boolean default false) returns races
language plpgsql security definer set search_path = public as $$
declare
  r races;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from races where invite_code = private.normalize_invite_code(p_invite_code);
  if not found then raise exception 'invalid invite code'; end if;
  insert into race_members (race_id, user_id, role)
  values (r.id, auth.uid(), case when p_as_supporter then 'supporter'::member_role else 'participant'::member_role end)
  on conflict (race_id, user_id) do update set status = 'active'
    where race_members.status = 'left';
  return r;
end $$;

create or replace function invite_preview(p_invite_code text)
returns table (name text, organizer_name text, member_count integer, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.name,
         p.display_name,
         (select count(*)::integer from race_members m
           where m.race_id = r.id and m.status = 'active' and m.role <> 'supporter'),
         r.starts_at
  from races r
  join profiles p on p.id = r.created_by
  where r.invite_code = private.normalize_invite_code(p_invite_code)
$$;
