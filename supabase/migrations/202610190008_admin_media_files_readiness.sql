alter table public.product_files
  add column storage_status text not null default 'metadata_only'
    check (storage_status in ('metadata_only', 'verified', 'ready', 'failed')),
  add column verified_at timestamptz,
  add constraint product_files_verification_consistent check (
    (storage_status in ('metadata_only', 'failed') and verified_at is null)
    or (storage_status in ('verified', 'ready') and verified_at is not null)
  );

create function public.admin_create_product_media(
  p_actor_user_id uuid, p_request_id uuid, p_product_id uuid,
  p_storage_key text, p_alt_text text, p_sort_order integer
) returns public.product_media
language plpgsql security definer set search_path = '' as $$
declare actor_role text := public.require_catalog_writer(p_actor_user_id); result_row public.product_media;
begin
  if not exists (select 1 from public.products where id = p_product_id) then raise exception 'product not found' using errcode = '23503'; end if;
  if p_storage_key !~ ('^products/' || p_product_id::text || '/media/[A-Za-z0-9][A-Za-z0-9._/-]*\.(jpg|jpeg|png|webp|avif)$') then
    raise exception 'invalid product media key' using errcode = '23514';
  end if;
  insert into public.product_media (product_id, media_type, storage_key, alt_text, sort_order, status)
  values (p_product_id, 'gallery', p_storage_key, p_alt_text, p_sort_order, 'active') returning * into result_row;
  insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, after_data)
  values (p_actor_user_id, actor_role, 'catalog.media_created', 'product_media', result_row.id, p_request_id, 'succeeded', to_jsonb(result_row));
  return result_row;
end; $$;

create function public.admin_update_product_media(
  p_actor_user_id uuid, p_request_id uuid, p_media_id uuid, p_alt_text text, p_sort_order integer
) returns public.product_media
language plpgsql security definer set search_path = '' as $$
declare actor_role text := public.require_catalog_writer(p_actor_user_id); before_row jsonb; result_row public.product_media;
begin
  select to_jsonb(media) into before_row from public.product_media media where id = p_media_id for update;
  if before_row is null then raise exception 'media not found' using errcode = 'P0002'; end if;
  if before_row ->> 'status' <> 'active' then raise exception 'only active media can be edited' using errcode = '55000'; end if;
  update public.product_media set alt_text = p_alt_text, sort_order = p_sort_order where id = p_media_id returning * into result_row;
  insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data)
  values (p_actor_user_id, actor_role, 'catalog.media_updated', 'product_media', result_row.id, p_request_id, 'succeeded', before_row, to_jsonb(result_row));
  return result_row;
end; $$;

create function public.admin_set_product_cover(p_actor_user_id uuid, p_request_id uuid, p_media_id uuid)
returns public.product_media language plpgsql security definer set search_path = '' as $$
declare actor_role text := public.require_catalog_writer(p_actor_user_id); before_row jsonb; result_row public.product_media; target_product_id uuid;
begin
  select to_jsonb(media), product_id into before_row, target_product_id from public.product_media media where id = p_media_id for update;
  if before_row is null then raise exception 'media not found' using errcode = 'P0002'; end if;
  if before_row ->> 'status' <> 'active' then raise exception 'cover must be active' using errcode = '55000'; end if;
  update public.product_media set media_type = 'gallery' where product_id = target_product_id and media_type = 'cover' and status = 'active';
  update public.product_media set media_type = 'cover' where id = p_media_id returning * into result_row;
  insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data)
  values (p_actor_user_id, actor_role, 'catalog.media_cover_set', 'product_media', result_row.id, p_request_id, 'succeeded', before_row, to_jsonb(result_row));
  return result_row;
end; $$;

create function public.admin_deactivate_product_media(p_actor_user_id uuid, p_request_id uuid, p_media_id uuid)
returns public.product_media language plpgsql security definer set search_path = '' as $$
declare actor_role text := public.require_catalog_writer(p_actor_user_id); before_row jsonb; result_row public.product_media;
begin
  select to_jsonb(media) into before_row from public.product_media media where id = p_media_id for update;
  if before_row is null then raise exception 'media not found' using errcode = 'P0002'; end if;
  if before_row ->> 'status' <> 'active' then raise exception 'media already inactive' using errcode = '55000'; end if;
  update public.product_media set status = 'archived', media_type = 'gallery' where id = p_media_id returning * into result_row;
  insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data)
  values (p_actor_user_id, actor_role, 'catalog.media_archived', 'product_media', result_row.id, p_request_id, 'succeeded', before_row, to_jsonb(result_row));
  return result_row;
end; $$;

create function public.admin_create_product_file(
  p_actor_user_id uuid, p_request_id uuid, p_product_version_id uuid, p_display_name text,
  p_storage_key text, p_mime_type text, p_size_bytes bigint, p_checksum_sha256 text, p_sort_order integer
) returns public.product_files language plpgsql security definer set search_path = '' as $$
declare actor_role text := public.require_catalog_writer(p_actor_user_id); result_row public.product_files; target_product_id uuid; target_locked_at timestamptz;
begin
  select product_id, locked_at into target_product_id, target_locked_at from public.product_versions where id = p_product_version_id;
  if target_product_id is null then raise exception 'version not found' using errcode = '23503'; end if;
  if target_locked_at is not null then raise exception 'locked version files are immutable' using errcode = '55000'; end if;
  if p_storage_key !~ ('^products/' || target_product_id::text || '/versions/' || p_product_version_id::text || '/files/[A-Za-z0-9][A-Za-z0-9._/-]*$') then
    raise exception 'invalid private storage key' using errcode = '23514';
  end if;
  insert into public.product_files (product_version_id, display_name, storage_key, mime_type, size_bytes, checksum_sha256, sort_order, status)
  values (p_product_version_id, p_display_name, p_storage_key, p_mime_type, p_size_bytes, lower(p_checksum_sha256), p_sort_order, 'active') returning * into result_row;
  insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, after_data)
  values (p_actor_user_id, actor_role, 'catalog.file_metadata_created', 'product_file', result_row.id, p_request_id, 'succeeded', to_jsonb(result_row) - 'storage_key');
  return result_row;
end; $$;

create function public.admin_update_product_file(
  p_actor_user_id uuid, p_request_id uuid, p_file_id uuid, p_display_name text,
  p_mime_type text, p_size_bytes bigint, p_checksum_sha256 text, p_sort_order integer
) returns public.product_files language plpgsql security definer set search_path = '' as $$
declare actor_role text := public.require_catalog_writer(p_actor_user_id); before_row jsonb; result_row public.product_files;
begin
  select to_jsonb(file) into before_row from public.product_files file where id = p_file_id for update;
  if before_row is null then raise exception 'file not found' using errcode = 'P0002'; end if;
  if before_row ->> 'status' <> 'active' or before_row ->> 'storage_status' <> 'metadata_only' then
    raise exception 'only unverified active metadata can be edited' using errcode = '55000';
  end if;
  update public.product_files set display_name = p_display_name, mime_type = p_mime_type,
    size_bytes = p_size_bytes, checksum_sha256 = lower(p_checksum_sha256), sort_order = p_sort_order
  where id = p_file_id returning * into result_row;
  insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data)
  values (p_actor_user_id, actor_role, 'catalog.file_metadata_updated', 'product_file', result_row.id, p_request_id, 'succeeded', before_row - 'storage_key', to_jsonb(result_row) - 'storage_key');
  return result_row;
end; $$;

create function public.admin_retire_product_file(p_actor_user_id uuid, p_request_id uuid, p_file_id uuid)
returns public.product_files language plpgsql security definer set search_path = '' as $$
declare actor_role text := public.require_catalog_writer(p_actor_user_id); before_row jsonb; result_row public.product_files;
begin
  select to_jsonb(file) into before_row from public.product_files file where id = p_file_id for update;
  if before_row is null then raise exception 'file not found' using errcode = 'P0002'; end if;
  if before_row ->> 'status' <> 'active' then raise exception 'file already retired' using errcode = '55000'; end if;
  update public.product_files set status = 'retired' where id = p_file_id returning * into result_row;
  insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data)
  values (p_actor_user_id, actor_role, 'catalog.file_retired', 'product_file', result_row.id, p_request_id, 'succeeded', before_row - 'storage_key', to_jsonb(result_row) - 'storage_key');
  return result_row;
end; $$;

create function public.admin_product_publication_readiness(p_actor_user_id uuid, p_product_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare actor_role text := public.require_catalog_writer(p_actor_user_id); blockers jsonb := '[]'::jsonb; product_row public.products; version_row public.product_versions;
begin
  select * into product_row from public.products where id = p_product_id;
  if product_row.id is null then raise exception 'product not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.product_categories where id = product_row.category_id and status = 'active') then blockers := blockers || '"category_inactive"'::jsonb; end if;
  if product_row.status not in ('draft', 'unpublished') then blockers := blockers || '"product_state_invalid"'::jsonb; end if;
  if product_row.current_version_id is null then
    blockers := blockers || '"current_version_missing"'::jsonb;
  else
    select * into version_row from public.product_versions where id = product_row.current_version_id and product_id = product_row.id;
    if version_row.id is null then blockers := blockers || '"current_version_invalid"'::jsonb;
    elsif version_row.status not in ('draft', 'published') then blockers := blockers || '"version_state_invalid"'::jsonb; end if;
  end if;
  if not exists (select 1 from public.product_media where product_id = product_row.id and media_type = 'cover' and status = 'active') then blockers := blockers || '"active_cover_missing"'::jsonb; end if;
  if product_row.current_version_id is not null and not exists (
    select 1 from public.product_prices where product_version_id = product_row.current_version_id and currency = 'BRL' and status = 'active'
      and valid_from <= timezone('utc', now()) and (valid_until is null or valid_until > timezone('utc', now()))
  ) then blockers := blockers || '"current_brl_price_missing"'::jsonb; end if;
  if product_row.current_version_id is not null and not exists (
    select 1 from public.product_files where product_version_id = product_row.current_version_id and status = 'active' and storage_status = 'ready' and verified_at is not null
  ) then blockers := blockers || '"verified_file_missing"'::jsonb; end if;
  return jsonb_build_object('productId', product_row.id, 'ready', jsonb_array_length(blockers) = 0, 'blockers', blockers);
end; $$;

revoke all on function public.admin_create_product_media(uuid,uuid,uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.admin_update_product_media(uuid,uuid,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.admin_set_product_cover(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_deactivate_product_media(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_create_product_file(uuid,uuid,uuid,text,text,text,bigint,text,integer) from public, anon, authenticated;
revoke all on function public.admin_update_product_file(uuid,uuid,uuid,text,text,bigint,text,integer) from public, anon, authenticated;
revoke all on function public.admin_retire_product_file(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_product_publication_readiness(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_create_product_media(uuid,uuid,uuid,text,text,integer) to service_role;
grant execute on function public.admin_update_product_media(uuid,uuid,uuid,text,integer) to service_role;
grant execute on function public.admin_set_product_cover(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_deactivate_product_media(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_create_product_file(uuid,uuid,uuid,text,text,text,bigint,text,integer) to service_role;
grant execute on function public.admin_update_product_file(uuid,uuid,uuid,text,text,bigint,text,integer) to service_role;
grant execute on function public.admin_retire_product_file(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_product_publication_readiness(uuid,uuid) to service_role;

comment on column public.product_files.storage_status is 'Server-controlled storage verification lifecycle; browser catalog operations cannot promote this value.';
