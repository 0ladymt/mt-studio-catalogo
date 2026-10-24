create or replace function public.admin_finish_storage_verification_job(
  p_actor_user_id uuid, p_request_id uuid, p_job_id uuid, p_worker_id uuid,
  p_succeeded boolean, p_observed_size_bytes bigint, p_observed_checksum_sha256 text, p_failure_code text
) returns public.storage_verification_jobs
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  result_row public.storage_verification_jobs;
  confirmation public.storage_uploads;
begin
  select * into result_row from public.storage_verification_jobs where id=p_job_id for update;
  if not found then raise exception 'verification job not found' using errcode='P0002'; end if;
  if result_row.status='completed' then return result_row; end if;
  if result_row.requested_by<>p_actor_user_id or result_row.status<>'verifying' or result_row.lease_owner<>p_worker_id or result_row.lease_expires_at<=now() then raise exception 'verification lease lost' using errcode='55P03'; end if;
  if p_succeeded then
    select * into confirmation from public.admin_confirm_storage_upload(p_actor_user_id,p_request_id,result_row.storage_upload_id,true,p_observed_size_bytes,lower(p_observed_checksum_sha256),true);
    if confirmation.status <> 'verified' then raise exception 'storage upload was not verified' using errcode='55000'; end if;
    update public.storage_verification_jobs set status='completed',observed_size_bytes=p_observed_size_bytes,observed_checksum_sha256=lower(p_observed_checksum_sha256),failure_code=null,completed_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now() where id=result_row.id returning * into result_row;
  else
    if p_failure_code not in ('object_missing','size_mismatch','checksum_mismatch','final_object_conflict','stream_interrupted','verification_timeout','storage_failure') then raise exception 'invalid failure code' using errcode='22023'; end if;
    update public.storage_verification_jobs set status='failed',observed_size_bytes=p_observed_size_bytes,observed_checksum_sha256=lower(p_observed_checksum_sha256),failure_code=p_failure_code,completed_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now() where id=result_row.id returning * into result_row;
    insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,after_data)
      select p_actor_user_id,actor_role,'catalog.storage_verification_finished','product_file',u.product_file_id,p_request_id,'failed',jsonb_build_object('job_id',result_row.id,'failure_code',p_failure_code,'attempts',result_row.attempts) from public.storage_uploads u where u.id=result_row.storage_upload_id;
  end if;
  return result_row;
end;
$$;
revoke all on function public.admin_finish_storage_verification_job(uuid,uuid,uuid,uuid,boolean,bigint,text,text) from public,anon,authenticated;
grant execute on function public.admin_finish_storage_verification_job(uuid,uuid,uuid,uuid,boolean,bigint,text,text) to service_role;
