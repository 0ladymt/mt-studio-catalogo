create table public.storage_uploads (
  id uuid primary key default gen_random_uuid(),
  product_file_id uuid not null references public.product_files(id) on delete restrict,
  object_key text not null unique,
  provider text not null default 's3' check (provider = 's3'),
  status text not null default 'initiated' check (status in ('initiated', 'verified', 'failed', 'expired')),
  expected_size_bytes bigint not null check (expected_size_bytes > 0),
  expected_checksum_sha256 text not null check (expected_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  observed_size_bytes bigint check (observed_size_bytes is null or observed_size_bytes >= 0),
  observed_checksum_sha256 text check (observed_checksum_sha256 is null or observed_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  initiated_by uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  expires_at timestamptz not null,
  verified_at timestamptz,
  failure_code text check (failure_code is null or failure_code in ('object_missing', 'untrusted_integrity', 'size_mismatch', 'checksum_mismatch')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storage_upload_result_consistent check (
    (status = 'initiated' and observed_size_bytes is null and observed_checksum_sha256 is null and verified_at is null and failure_code is null)
    or (status = 'verified' and observed_size_bytes is not null and observed_checksum_sha256 is not null and verified_at is not null and failure_code is null)
    or (status = 'failed' and verified_at is null and failure_code is not null)
    or (status = 'expired' and verified_at is null)
  )
);

create index storage_uploads_file_created_idx on public.storage_uploads(product_file_id, created_at desc);
create index storage_uploads_actor_created_idx on public.storage_uploads(initiated_by, created_at desc);

alter table public.storage_uploads enable row level security;
revoke all on table public.storage_uploads from public, anon, authenticated;
grant select, insert, update on table public.storage_uploads to service_role;

create function public.admin_begin_storage_upload(
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

  if p_expires_at < now() + interval '1 minute' or p_expires_at > now() + interval '30 minutes' then
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

create function public.admin_confirm_storage_upload(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_upload_id uuid,
  p_object_exists boolean,
  p_observed_size_bytes bigint,
  p_observed_checksum_sha256 text,
  p_integrity_trusted boolean
) returns public.storage_uploads
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  upload_row public.storage_uploads;
  file_row public.product_files;
  version_row public.product_versions;
  prior_audit public.admin_audit_log;
  failure text;
begin
  select * into prior_audit from public.admin_audit_log where request_id = p_request_id;
  if found then
    select * into upload_row from public.storage_uploads where id = p_upload_id;
    if prior_audit.action = 'catalog.storage_upload_confirmed' and prior_audit.entity_id = upload_row.product_file_id then return upload_row; end if;
    raise exception 'request id already used' using errcode = '23505';
  end if;

  select * into upload_row from public.storage_uploads where id = p_upload_id for update;
  if not found then raise exception 'storage upload not found' using errcode = 'P0002'; end if;
  if upload_row.status <> 'initiated' then raise exception 'storage upload is no longer pending' using errcode = '55000'; end if;
  if upload_row.expires_at <= now() then
    update public.storage_uploads set status = 'expired', updated_at = now() where id = upload_row.id returning * into upload_row;
    insert into public.admin_audit_log(actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, after_data)
      values (p_actor_user_id, actor_role, 'catalog.storage_upload_confirmed', 'product_file', upload_row.product_file_id, p_request_id, 'failed', jsonb_build_object('upload_id', upload_row.id, 'failure_code', 'expired'));
    return upload_row;
  end if;

  select * into file_row from public.product_files where id = upload_row.product_file_id for update;
  select * into version_row from public.product_versions where id = file_row.product_version_id for share;
  if version_row.locked_at is not null or version_row.status <> 'draft' or file_row.status <> 'active' or file_row.storage_status <> 'metadata_only' then
    raise exception 'product file is no longer verifiable' using errcode = '55000';
  end if;

  failure := case
    when not p_object_exists then 'object_missing'
    when not p_integrity_trusted then 'untrusted_integrity'
    when p_observed_size_bytes is distinct from upload_row.expected_size_bytes then 'size_mismatch'
    when lower(p_observed_checksum_sha256) is distinct from upload_row.expected_checksum_sha256 then 'checksum_mismatch'
    else null
  end;

  if failure is null then
    update public.storage_uploads set status = 'verified', observed_size_bytes = p_observed_size_bytes,
      observed_checksum_sha256 = lower(p_observed_checksum_sha256), verified_at = now(), updated_at = now()
      where id = upload_row.id returning * into upload_row;
    update public.product_files set storage_key = upload_row.object_key, storage_status = 'verified', verified_at = upload_row.verified_at
      where id = file_row.id;
  else
    update public.storage_uploads set status = 'failed', observed_size_bytes = p_observed_size_bytes,
      observed_checksum_sha256 = lower(p_observed_checksum_sha256), failure_code = failure, updated_at = now()
      where id = upload_row.id returning * into upload_row;
  end if;

  insert into public.admin_audit_log(actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, after_data)
    values (p_actor_user_id, actor_role, 'catalog.storage_upload_confirmed', 'product_file', file_row.id, p_request_id,
      case when failure is null then 'succeeded' else 'failed' end,
      jsonb_build_object('upload_id', upload_row.id, 'provider', upload_row.provider, 'storage_status', case when failure is null then 'verified' else 'metadata_only' end, 'failure_code', failure));
  return upload_row;
end;
$$;

revoke all on function public.admin_begin_storage_upload(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_confirm_storage_upload(uuid,uuid,uuid,boolean,bigint,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_begin_storage_upload(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.admin_confirm_storage_upload(uuid,uuid,uuid,boolean,bigint,text,boolean) to service_role;

comment on table public.storage_uploads is 'Private, server-controlled upload transactions; no browser role can read or mutate them.';
comment on function public.admin_confirm_storage_upload(uuid,uuid,uuid,boolean,bigint,text,boolean) is 'Promotes metadata to verified only after a trusted full-object inspection matches size and SHA-256.';
