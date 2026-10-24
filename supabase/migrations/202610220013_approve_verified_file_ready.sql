create function public.admin_approve_product_file_ready(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_file_id uuid
) returns public.product_files
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_publisher(p_actor_user_id);
  file_row public.product_files;
  version_row public.product_versions;
  product_row public.products;
  upload_row public.storage_uploads;
  job_row public.storage_verification_jobs;
  multipart_row public.multipart_upload_sessions;
  prior_audit public.admin_audit_log;
  before_state jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_file_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 1));

  select * into prior_audit from public.admin_audit_log where request_id = p_request_id;
  if found then
    if prior_audit.action <> 'catalog.product_file_ready_approved'
       or prior_audit.entity_id is distinct from p_file_id
       or prior_audit.actor_user_id is distinct from p_actor_user_id then
      raise exception 'request id already used' using errcode = '23505';
    end if;
    select * into file_row from public.product_files where id = p_file_id;
    return file_row;
  end if;

  select * into file_row from public.product_files where id = p_file_id for update;
  if not found then raise exception 'product file not found' using errcode = 'P0002'; end if;
  if file_row.storage_status = 'ready' then return file_row; end if;
  if file_row.status <> 'active' or file_row.storage_status <> 'verified' or file_row.verified_at is null then
    raise exception 'product file is not verified' using errcode = '55000';
  end if;

  select * into version_row from public.product_versions where id = file_row.product_version_id for update;
  if not found or version_row.status <> 'draft' or version_row.locked_at is not null then
    raise exception 'product version is not editable' using errcode = '55000';
  end if;
  select * into product_row from public.products where id = version_row.product_id for update;
  if not found or product_row.status not in ('draft', 'unpublished') then
    raise exception 'product is not eligible' using errcode = '55000';
  end if;

  select * into upload_row
    from public.storage_uploads
    where product_file_id = file_row.id and status = 'verified'
    order by verified_at desc, created_at desc limit 1 for update;
  if not found
     or upload_row.object_key is distinct from file_row.storage_key
     or upload_row.expected_size_bytes is distinct from file_row.size_bytes
     or upload_row.observed_size_bytes is distinct from file_row.size_bytes
     or upload_row.expected_checksum_sha256 is distinct from file_row.checksum_sha256
     or upload_row.observed_checksum_sha256 is distinct from file_row.checksum_sha256
     or upload_row.verified_at is null then
    raise exception 'verified upload evidence is inconsistent' using errcode = '55000';
  end if;

  select * into job_row from public.storage_verification_jobs
    where storage_upload_id = upload_row.id for update;
  if not found or job_row.status <> 'completed' or job_row.completed_at is null
     or job_row.failure_code is not null
     or job_row.observed_size_bytes is distinct from file_row.size_bytes
     or job_row.observed_checksum_sha256 is distinct from file_row.checksum_sha256 then
    raise exception 'verification job evidence is inconsistent' using errcode = '55000';
  end if;

  select * into multipart_row from public.multipart_upload_sessions
    where storage_upload_id = upload_row.id for update;
  if not found or multipart_row.status <> 'completed' or multipart_row.completed_at is null then
    raise exception 'multipart upload is not completed' using errcode = '55000';
  end if;

  before_state := jsonb_build_object(
    'storage_status', file_row.storage_status,
    'verified_at', file_row.verified_at,
    'upload_id', upload_row.id,
    'verification_job_id', job_row.id
  );
  update public.product_files set storage_status = 'ready', updated_at = now()
    where id = file_row.id returning * into file_row;
  insert into public.admin_audit_log(
    actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.product_file_ready_approved', 'product_file', file_row.id,
    p_request_id, 'succeeded', before_state,
    jsonb_build_object('storage_status', 'ready', 'verified_at', file_row.verified_at,
      'upload_id', upload_row.id, 'verification_job_id', job_row.id)
  );
  return file_row;
end;
$$;

revoke all on function public.admin_approve_product_file_ready(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_approve_product_file_ready(uuid,uuid,uuid) to service_role;

comment on function public.admin_approve_product_file_ready(uuid,uuid,uuid) is
  'Approves verified bytes for delivery using the immutable evidence recorded by the trusted streaming verifier; it never reads browser assertions or publishes a product.';
