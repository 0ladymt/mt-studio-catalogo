create table public.local_verifier_authorizations (
  id uuid primary key default gen_random_uuid(),
  storage_upload_id uuid not null references public.storage_uploads(id) on delete restrict,
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','approved','consumed','revoked','expired')),
  approved_by uuid references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  approved_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint local_verifier_authorization_state check (
    (status='pending' and approved_by is null and approved_at is null and consumed_at is null and revoked_at is null)
    or (status='approved' and approved_by is not null and approved_at is not null and consumed_at is null and revoked_at is null)
    or (status='consumed' and approved_by is not null and approved_at is not null and consumed_at is not null and revoked_at is null)
    or (status='revoked' and consumed_at is null and revoked_at is not null)
    or (status='expired' and consumed_at is null)
  )
);
create index local_verifier_authorizations_expiry_idx on public.local_verifier_authorizations(status,expires_at);
alter table public.local_verifier_authorizations enable row level security;
revoke all on table public.local_verifier_authorizations from public,anon,authenticated;
grant select,insert,update on table public.local_verifier_authorizations to service_role;

create function public.create_local_verifier_authorization(p_storage_upload_id uuid,p_secret_hash text,p_expires_at timestamptz)
returns public.local_verifier_authorizations language plpgsql security definer set search_path='' as $$
declare upload_row public.storage_uploads; result_row public.local_verifier_authorizations;
begin
  if p_secret_hash !~ '^[0-9a-f]{64}$' or p_expires_at<now()+interval '1 minute' or p_expires_at>now()+interval '5 minutes' then raise exception 'invalid local authorization' using errcode='22023'; end if;
  select * into upload_row from public.storage_uploads where id=p_storage_upload_id for share;
  if not found or upload_row.status<>'initiated' then raise exception 'upload is not authorizable' using errcode='55000'; end if;
  insert into public.local_verifier_authorizations(storage_upload_id,secret_hash,expires_at) values(p_storage_upload_id,lower(p_secret_hash),p_expires_at) returning * into result_row;
  return result_row;
end; $$;

create function public.approve_local_verifier_authorization(p_actor_user_id uuid,p_request_id uuid,p_authorization_id uuid)
returns public.local_verifier_authorizations language plpgsql security definer set search_path='' as $$
declare actor_role text:=public.require_catalog_writer(p_actor_user_id); result_row public.local_verifier_authorizations; upload_row public.storage_uploads;
begin
  select * into result_row from public.local_verifier_authorizations where id=p_authorization_id for update;
  if not found then raise exception 'authorization not found' using errcode='P0002'; end if;
  if result_row.status='approved' and result_row.approved_by=p_actor_user_id then return result_row; end if;
  if result_row.status<>'pending' or result_row.expires_at<=now() then raise exception 'authorization is not approvable' using errcode='55000'; end if;
  select * into upload_row from public.storage_uploads where id=result_row.storage_upload_id for share;
  if upload_row.status<>'initiated' then raise exception 'upload is not verifiable' using errcode='55000'; end if;
  update public.local_verifier_authorizations set status='approved',approved_by=p_actor_user_id,approved_at=now(),updated_at=now() where id=result_row.id returning * into result_row;
  insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,after_data)
    values(p_actor_user_id,actor_role,'catalog.local_verifier_authorized','product_file',upload_row.product_file_id,p_request_id,'succeeded',jsonb_build_object('authorization_id',result_row.id,'upload_id',upload_row.id,'expires_at',result_row.expires_at));
  return result_row;
end; $$;

create function public.consume_local_verifier_authorization(p_authorization_id uuid,p_secret_hash text)
returns public.local_verifier_authorizations language plpgsql security definer set search_path='' as $$
declare result_row public.local_verifier_authorizations; actor_role text; upload_row public.storage_uploads;
begin
  select * into result_row from public.local_verifier_authorizations where id=p_authorization_id for update;
  if not found then raise exception 'authorization not found' using errcode='P0002'; end if;
  if result_row.expires_at<=now() and result_row.status in ('pending','approved') then update public.local_verifier_authorizations set status='expired',updated_at=now() where id=result_row.id returning * into result_row; return result_row; end if;
  if result_row.status<>'approved' or result_row.secret_hash<>lower(p_secret_hash) then raise exception 'authorization cannot be consumed' using errcode='42501'; end if;
  actor_role:=public.require_catalog_writer(result_row.approved_by);
  select * into upload_row from public.storage_uploads where id=result_row.storage_upload_id for share;
  if upload_row.status<>'initiated' then raise exception 'upload is not verifiable' using errcode='55000'; end if;
  update public.local_verifier_authorizations set status='consumed',consumed_at=now(),updated_at=now() where id=result_row.id returning * into result_row;
  insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,after_data)
    values(result_row.approved_by,actor_role,'catalog.local_verifier_authorization_consumed','product_file',upload_row.product_file_id,gen_random_uuid(),'succeeded',jsonb_build_object('authorization_id',result_row.id,'upload_id',upload_row.id));
  return result_row;
end; $$;

create function public.revoke_local_verifier_authorization(p_actor_user_id uuid,p_request_id uuid,p_authorization_id uuid)
returns public.local_verifier_authorizations language plpgsql security definer set search_path='' as $$
declare actor_role text:=public.require_catalog_writer(p_actor_user_id); result_row public.local_verifier_authorizations; upload_row public.storage_uploads;
begin
  select * into result_row from public.local_verifier_authorizations where id=p_authorization_id for update;
  if not found then raise exception 'authorization not found' using errcode='P0002'; end if;
  if result_row.status='consumed' then raise exception 'consumed authorization cannot be revoked' using errcode='55000'; end if;
  if result_row.status='revoked' then return result_row; end if;
  if result_row.approved_by is not null and result_row.approved_by<>p_actor_user_id then raise exception 'authorization belongs to another operator' using errcode='42501'; end if;
  update public.local_verifier_authorizations set status='revoked',revoked_at=now(),updated_at=now() where id=result_row.id returning * into result_row;
  select * into upload_row from public.storage_uploads where id=result_row.storage_upload_id;
  insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,after_data)
    values(p_actor_user_id,actor_role,'catalog.local_verifier_authorization_revoked','product_file',upload_row.product_file_id,p_request_id,'succeeded',jsonb_build_object('authorization_id',result_row.id));
  return result_row;
end; $$;

revoke all on function public.create_local_verifier_authorization(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.approve_local_verifier_authorization(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.consume_local_verifier_authorization(uuid,text) from public,anon,authenticated;
revoke all on function public.revoke_local_verifier_authorization(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_local_verifier_authorization(uuid,text,timestamptz) to service_role;
grant execute on function public.approve_local_verifier_authorization(uuid,uuid,uuid) to service_role;
grant execute on function public.consume_local_verifier_authorization(uuid,text) to service_role;
grant execute on function public.revoke_local_verifier_authorization(uuid,uuid,uuid) to service_role;
