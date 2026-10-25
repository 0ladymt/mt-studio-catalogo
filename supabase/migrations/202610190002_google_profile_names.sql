create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  candidate := case
    when jsonb_typeof(new.raw_user_meta_data -> 'display_name') = 'string'
      then new.raw_user_meta_data ->> 'display_name'
    when jsonb_typeof(new.raw_user_meta_data -> 'full_name') = 'string'
      then new.raw_user_meta_data ->> 'full_name'
    when jsonb_typeof(new.raw_user_meta_data -> 'name') = 'string'
      then new.raw_user_meta_data ->> 'name'
    else null
  end;

  if candidate is not null then
    candidate := normalize(candidate, NFC);
    candidate := regexp_replace(candidate, '[[:cntrl:]]', '', 'g');
    candidate := translate(candidate, chr(8203) || chr(8204) || chr(8205) || chr(8234) || chr(8235) || chr(8236) || chr(8237) || chr(8238) || chr(8288) || chr(8294) || chr(8295) || chr(8296) || chr(8297) || chr(65279), '');
    candidate := btrim(regexp_replace(candidate, '[[:space:]]+', ' ', 'g'));
    candidate := nullif(left(candidate, 80), '');
  end if;

  insert into public.profiles (user_id, display_name, password_configured_at)
  values (
    new.id,
    candidate,
    case when coalesce(new.encrypted_password, '') <> '' then timezone('utc', now()) else null end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

comment on function public.handle_new_auth_user() is
  'Creates one profile per auth user and derives a normalized display name from display_name, full_name or name metadata.';
