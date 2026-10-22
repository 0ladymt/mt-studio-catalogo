create table public.storage_verification_jobs (
  id uuid primary key default gen_random_uuid(),
  storage_upload_id uuid not null unique references public.storage_uploads(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null unique,
  status text not null default 'pending' check (status in ('pending','verifying','completed','failed','expired')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_owner uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  observed_size_bytes bigint check (observed_size_bytes is null or observed_size_bytes >= 0),
  observed_checksum_sha256 text check (observed_checksum_sha256 is null or observed_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  failure_code text check (failure_code is null or failure_code in ('object_missing','size_mismatch','checksum_mismatch','final_object_conflict','stream_interrupted','verification_timeout','storage_failure')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint storage_verification_job_lease_consistent check (
    (status = 'verifying' and lease_owner is not null and lease_expires_at is not null and heartbeat_at is not null)
    or (status <> 'verifying' and lease_owner is null and lease_expires_at is null)
  )
);

create index storage_verification_jobs_claim_idx
  on public.storage_verification_jobs(status, lease_expires_at, created_at);
alter table public.storage_verification_jobs enable row level security;
revoke all on table public.storage_verification_jobs from public, anon, authenticated;
grant select, insert, update on table public.storage_verification_jobs to service_role;

create function public.admin_create_storage_verification_job(
  p_actor_user_id uuid, p_idempotency_key uuid, p_storage_upload_id uuid
) returns public.storage_verification_jobs
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  existing public.storage_verification_jobs;
  result_row public.storage_verification_jobs;
begin
  select * into existing from public.storage_verification_jobs where idempotency_key = p_idempotency_key;
  if found then
    if existing.requested_by = p_actor_user_id and existing.storage_upload_id = p_storage_upload_id then return existing; end if;
    raise exception 'idempotency key already used' using errcode = '23505';
  end if;
  select * into upload_row from public.storage_uploads where id = p_storage_upload_id for update;
  if not found then raise exception 'storage upload not found' using errcode = 'P0002'; end if;
  if upload_row.status = 'verified' then
    select * into existing from public.storage_verification_jobs where storage_upload_id = upload_row.id;
    if found then return existing; end if;
    raise exception 'verified upload has no reusable job' using errcode = '55000';
  end if;
  if upload_row.status <> 'initiated' then raise exception 'storage upload is not verifiable' using errcode = '55000'; end if;
  insert into public.storage_verification_jobs(storage_upload_id,requested_by,idempotency_key)
    values(upload_row.id,p_actor_user_id,p_idempotency_key)
    on conflict(storage_upload_id) do nothing returning * into result_row;
  if result_row.id is null then select * into result_row from public.storage_verification_jobs where storage_upload_id=upload_row.id; end if;
  insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,after_data)
    values(p_actor_user_id,actor_role,'catalog.storage_verification_requested','product_file',upload_row.product_file_id,p_idempotency_key,'succeeded',jsonb_build_object('job_id',result_row.id,'upload_id',upload_row.id))
    on conflict(request_id) do nothing;
  return result_row;
end;
$$;

create function public.admin_claim_storage_verification_job(
  p_actor_user_id uuid, p_job_id uuid, p_worker_id uuid, p_lease_seconds integer default 300
) returns public.storage_verification_jobs
language plpgsql security definer set search_path = '' as $$
declare result_row public.storage_verification_jobs;
begin
  perform public.require_catalog_writer(p_actor_user_id);
  if p_lease_seconds < 30 or p_lease_seconds > 900 then raise exception 'invalid lease' using errcode='22023'; end if;
  select * into result_row from public.storage_verification_jobs where id=p_job_id for update;
  if not found then raise exception 'verification job not found' using errcode='P0002'; end if;
  if result_row.requested_by <> p_actor_user_id then raise exception 'job belongs to another operator' using errcode='42501'; end if;
  if result_row.status='completed' then return result_row; end if;
  if result_row.status='verifying' and result_row.lease_expires_at > now() and result_row.lease_owner <> p_worker_id then
    raise exception 'verification job already leased' using errcode='55P03';
  end if;
  if result_row.attempts >= 3 then raise exception 'verification attempts exhausted' using errcode='55000'; end if;
  update public.storage_verification_jobs set status='verifying',attempts=attempts+1,lease_owner=p_worker_id,
    lease_expires_at=now()+make_interval(secs=>p_lease_seconds),heartbeat_at=now(),started_at=coalesce(started_at,now()),failure_code=null,updated_at=now()
    where id=result_row.id returning * into result_row;
  return result_row;
end;
$$;

create function public.admin_heartbeat_storage_verification_job(
  p_actor_user_id uuid, p_job_id uuid, p_worker_id uuid, p_lease_seconds integer default 300
) returns public.storage_verification_jobs
language plpgsql security definer set search_path = '' as $$
declare result_row public.storage_verification_jobs;
begin
  perform public.require_catalog_writer(p_actor_user_id);
  if p_lease_seconds < 30 or p_lease_seconds > 900 then raise exception 'invalid lease' using errcode='22023'; end if;
  update public.storage_verification_jobs set heartbeat_at=now(),lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
    where id=p_job_id and requested_by=p_actor_user_id and status='verifying' and lease_owner=p_worker_id and lease_expires_at>now()
    returning * into result_row;
  if not found then raise exception 'verification lease lost' using errcode='55P03'; end if;
  return result_row;
end;
$$;

create function public.admin_finish_storage_verification_job(
  p_actor_user_id uuid, p_request_id uuid, p_job_id uuid, p_worker_id uuid,
  p_succeeded boolean, p_observed_size_bytes bigint, p_observed_checksum_sha256 text, p_failure_code text
) returns public.storage_verification_jobs
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  result_row public.storage_verification_jobs;
  upload_row public.storage_uploads;
begin
  select * into result_row from public.storage_verification_jobs where id=p_job_id for update;
  if not found then raise exception 'verification job not found' using errcode='P0002'; end if;
  if result_row.status='completed' then return result_row; end if;
  if result_row.requested_by<>p_actor_user_id or result_row.status<>'verifying' or result_row.lease_owner<>p_worker_id or result_row.lease_expires_at<=now() then
    raise exception 'verification lease lost' using errcode='55P03';
  end if;
  if p_succeeded then
    perform public.admin_confirm_storage_upload(p_actor_user_id,p_request_id,result_row.storage_upload_id,true,p_observed_size_bytes,lower(p_observed_checksum_sha256),true);
    update public.storage_verification_jobs set status='completed',observed_size_bytes=p_observed_size_bytes,
      observed_checksum_sha256=lower(p_observed_checksum_sha256),failure_code=null,completed_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now()
      where id=result_row.id returning * into result_row;
  else
    if p_failure_code not in ('object_missing','size_mismatch','checksum_mismatch','final_object_conflict','stream_interrupted','verification_timeout','storage_failure') then
      raise exception 'invalid failure code' using errcode='22023';
    end if;
    update public.storage_verification_jobs set status='failed',observed_size_bytes=p_observed_size_bytes,
      observed_checksum_sha256=lower(p_observed_checksum_sha256),failure_code=p_failure_code,completed_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now()
      where id=result_row.id returning * into result_row;
  end if;
  insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,after_data)
    select p_actor_user_id,actor_role,'catalog.storage_verification_finished','product_file',u.product_file_id,p_request_id,
      case when p_succeeded then 'succeeded' else 'failed' end,jsonb_build_object('job_id',result_row.id,'failure_code',p_failure_code,'attempts',result_row.attempts)
      from public.storage_uploads u where u.id=result_row.storage_upload_id;
  return result_row;
end;
$$;

revoke all on function public.admin_create_storage_verification_job(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_claim_storage_verification_job(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.admin_heartbeat_storage_verification_job(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.admin_finish_storage_verification_job(uuid,uuid,uuid,uuid,boolean,bigint,text,text) from public,anon,authenticated;
grant execute on function public.admin_create_storage_verification_job(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_claim_storage_verification_job(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.admin_heartbeat_storage_verification_job(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.admin_finish_storage_verification_job(uuid,uuid,uuid,uuid,boolean,bigint,text,text) to service_role;

comment on table public.storage_verification_jobs is 'Private leased jobs for trusted full-object verification; browser roles have no access.';
