alter table public.profiles
  add column password_configured_at timestamptz;

comment on column public.profiles.password_configured_at is
  'Server-managed marker set only after Supabase Auth has a password for this user.';

update public.profiles as profile
set password_configured_at = coalesce(profile.password_configured_at, timezone('utc', now()))
from auth.users as auth_user
where auth_user.id = profile.user_id
  and coalesce(auth_user.encrypted_password, '') <> '';

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, password_configured_at)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 120), ''),
    case when coalesce(new.encrypted_password, '') <> '' then timezone('utc', now()) else null end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create function public.mark_own_password_configured()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  configured_at timestamptz;
begin
  if authenticated_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = authenticated_user_id
      and coalesce(encrypted_password, '') <> ''
  ) then
    raise exception 'password not configured' using errcode = '42501';
  end if;

  update public.profiles
  set password_configured_at = coalesce(password_configured_at, timezone('utc', now()))
  where user_id = authenticated_user_id
  returning password_configured_at into configured_at;

  return configured_at;
end;
$$;

revoke all on function public.mark_own_password_configured() from public;
grant execute on function public.mark_own_password_configured() to authenticated;
