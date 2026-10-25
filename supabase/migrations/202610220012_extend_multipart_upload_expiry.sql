create or replace function public.admin_begin_storage_upload(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_product_file_id uuid,
  p_expires_at timestamptz
) returns public.storage_uploads
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  file_row public.product_files;
  version_row public.product_versions;
  product_id uuid;
  existing public.storage_uploads;
  result_row public.storage_uploads;
  upload_id uuid := gen_random_uuid();
begin
  select * into existing from public.storage_uploads where request_id = p_request_id;
  if found then
    if existing.initiated_by = p_actor_user_id and existing.product_file_id = p_product_file_id then return existing; end if;
    raise exception 'request id already used' using errcode = '23505';
  end if;

  if p_expires_at < now() + interval '1 minute' or p_expires_at > now() + interval '24 hours 1 minute' then
    raise exception 'invalid upload expiry' using errcode = '22023';
  end if;

  select * into file_row from public.product_files where id = p_product_file_id for update;
  if not found then raise exception 'product file not found' using errcode = 'P0002'; end if;
  select * into version_row from public.product_versions where id = file_row.product_version_id for share;
  if version_row.locked_at is not null or version_row.status <> 'draft' then
    raise exception 'product version is locked' using errcode = '55000';
  end if;
  if file_row.status <> 'active' or file_row.storage_status <> 'metadata_only' then
    raise exception 'product file is not uploadable' using errcode = '55000';
  end if;
  product_id := version_row.product_id;

  insert into public.storage_uploads(
    id, product_file_id, object_key, expected_size_bytes, expected_checksum_sha256,
    initiated_by, request_id, expires_at
  ) values (
    upload_id,
    file_row.id,
    'private/products/' || product_id || '/versions/' || version_row.id || '/files/' || file_row.id || '/' || upload_id || '.bin',
    file_row.size_bytes,
    file_row.checksum_sha256,
    p_actor_user_id,
    p_request_id,
    p_expires_at
  ) returning * into result_row;

  insert into public.admin_audit_log(
    actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.storage_upload_started', 'product_file', file_row.id,
    p_request_id, 'succeeded', jsonb_build_object('upload_id', result_row.id, 'provider', result_row.provider, 'expires_at', result_row.expires_at)
  );
  return result_row;
end;
$$;

revoke all on function public.admin_begin_storage_upload(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_begin_storage_upload(uuid,uuid,uuid,timestamptz) to service_role;
