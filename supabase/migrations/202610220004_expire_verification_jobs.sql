create or replace function public.admin_claim_storage_verification_job(
  p_actor_user_id uuid, p_job_id uuid, p_worker_id uuid, p_lease_seconds integer default 300
) returns public.storage_verification_jobs
language plpgsql security definer set search_path = '' as $$
declare result_row public.storage_verification_jobs; upload_expires_at timestamptz;
begin
  perform public.require_catalog_writer(p_actor_user_id);
  if p_lease_seconds < 30 or p_lease_seconds > 900 then raise exception 'invalid lease' using errcode='22023'; end if;
  select j.* into result_row
    from public.storage_verification_jobs j where j.id=p_job_id for update;
  if not found then raise exception 'verification job not found' using errcode='P0002'; end if;
  select expires_at into upload_expires_at from public.storage_uploads where id=result_row.storage_upload_id;
  if result_row.requested_by <> p_actor_user_id then raise exception 'job belongs to another operator' using errcode='42501'; end if;
  if result_row.status='completed' then return result_row; end if;
  if upload_expires_at<=now() then
    update public.storage_verification_jobs set status='expired',lease_owner=null,lease_expires_at=null,failure_code=null,completed_at=now(),updated_at=now()
      where id=result_row.id returning * into result_row;
    return result_row;
  end if;
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
revoke all on function public.admin_claim_storage_verification_job(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.admin_claim_storage_verification_job(uuid,uuid,uuid,integer) to service_role;
