create or replace function public.admin_record_multipart_part(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_part_number integer,
  p_size_bytes integer,
  p_provider_etag text
)
returns public.multipart_upload_parts
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.multipart_upload_sessions;
  upload_row public.storage_uploads;
  expected_size bigint;
  existing_part public.multipart_upload_parts;
  result_row public.multipart_upload_parts;
begin
  perform public.require_catalog_writer(p_actor_user_id);
  select * into session_row from public.multipart_upload_sessions where id = p_session_id for update;
  if not found then raise exception 'multipart session not found' using errcode = 'P0002'; end if;
  if session_row.initiated_by <> p_actor_user_id
     or session_row.status not in ('initiated', 'uploading')
     or session_row.expires_at <= now()
  then raise exception 'multipart session unavailable' using errcode = '55000'; end if;

  select * into upload_row from public.storage_uploads where id = session_row.storage_upload_id for share;
  if p_part_number < 1 or p_part_number > session_row.total_parts then
    raise exception 'invalid part' using errcode = '22023';
  end if;
  expected_size := case
    when p_part_number < session_row.total_parts then session_row.part_size_bytes
    else upload_row.expected_size_bytes - (session_row.total_parts - 1)::bigint * session_row.part_size_bytes
  end;
  if p_size_bytes <> expected_size or char_length(p_provider_etag) not between 1 and 200 then
    raise exception 'part does not match storage' using errcode = '22023';
  end if;

  select * into existing_part
  from public.multipart_upload_parts
  where session_id = session_row.id and part_number = p_part_number;
  if found then
    if existing_part.size_bytes = p_size_bytes and existing_part.provider_etag = p_provider_etag then
      return existing_part;
    end if;
    raise exception 'confirmed part cannot be replaced' using errcode = '55000';
  end if;

  insert into public.multipart_upload_parts(session_id, part_number, size_bytes, provider_etag)
  values(session_row.id, p_part_number, p_size_bytes, p_provider_etag)
  returning * into result_row;
  update public.multipart_upload_sessions set status = 'uploading', updated_at = now() where id = session_row.id;
  return result_row;
end;
$$;

revoke all on function public.admin_record_multipart_part(uuid,uuid,integer,integer,text) from public, anon, authenticated;
grant execute on function public.admin_record_multipart_part(uuid,uuid,integer,integer,text) to service_role;
