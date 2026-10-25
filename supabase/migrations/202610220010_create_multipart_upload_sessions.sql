create table public.multipart_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  storage_upload_id uuid not null unique references public.storage_uploads(id) on delete restrict,
  provider_upload_id text not null unique check (char_length(provider_upload_id) between 1 and 500),
  initiated_by uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  status text not null default 'initiated' check (status in ('initiated','uploading','completed','cancelled','expired')),
  part_size_bytes integer not null check (part_size_bytes between 5242880 and 134217728),
  total_parts integer not null check (total_parts between 1 and 10000),
  expires_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.multipart_upload_parts (
  session_id uuid not null references public.multipart_upload_sessions(id) on delete restrict,
  part_number integer not null check (part_number between 1 and 10000),
  size_bytes integer not null check (size_bytes > 0),
  provider_etag text not null check (char_length(provider_etag) between 1 and 200),
  confirmed_at timestamptz not null default now(),
  primary key(session_id,part_number)
);
create index multipart_upload_sessions_status_expiry_idx on public.multipart_upload_sessions(status,expires_at);
alter table public.multipart_upload_sessions enable row level security;
alter table public.multipart_upload_parts enable row level security;
revoke all on table public.multipart_upload_sessions,public.multipart_upload_parts from public,anon,authenticated;
grant select,insert,update on table public.multipart_upload_sessions,public.multipart_upload_parts to service_role;

create function public.admin_begin_multipart_upload(p_actor_user_id uuid,p_request_id uuid,p_storage_upload_id uuid,p_provider_upload_id text,p_part_size_bytes integer)
returns public.multipart_upload_sessions language plpgsql security definer set search_path='' as $$
declare actor_role text:=public.require_catalog_writer(p_actor_user_id); upload_row public.storage_uploads; existing public.multipart_upload_sessions; result_row public.multipart_upload_sessions; parts integer;
begin
  select * into existing from public.multipart_upload_sessions where request_id=p_request_id;
  if found then if existing.initiated_by=p_actor_user_id and existing.storage_upload_id=p_storage_upload_id then return existing; end if; raise exception 'request id already used' using errcode='23505'; end if;
  select * into upload_row from public.storage_uploads where id=p_storage_upload_id for update;
  if not found then raise exception 'upload not found' using errcode='P0002'; end if;
  if upload_row.initiated_by<>p_actor_user_id or upload_row.status<>'initiated' or upload_row.expires_at<=now() then raise exception 'upload unavailable' using errcode='55000'; end if;
  if p_part_size_bytes<5242880 or p_part_size_bytes>134217728 or char_length(p_provider_upload_id) not between 1 and 500 then raise exception 'invalid multipart configuration' using errcode='22023'; end if;
  parts:=ceil(upload_row.expected_size_bytes::numeric/p_part_size_bytes)::integer;if parts>10000 then raise exception 'too many parts' using errcode='22023'; end if;
  insert into public.multipart_upload_sessions(storage_upload_id,provider_upload_id,initiated_by,request_id,part_size_bytes,total_parts,expires_at)
    values(upload_row.id,p_provider_upload_id,p_actor_user_id,p_request_id,p_part_size_bytes,parts,upload_row.expires_at) returning * into result_row;
  insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,after_data)
    values(p_actor_user_id,actor_role,'catalog.multipart_started','storage_upload',upload_row.id,p_request_id,'succeeded',jsonb_build_object('multipart_id',result_row.id,'parts',parts,'part_size_bytes',p_part_size_bytes));
  return result_row;
end;$$;

create function public.admin_record_multipart_part(p_actor_user_id uuid,p_session_id uuid,p_part_number integer,p_size_bytes integer,p_provider_etag text)
returns public.multipart_upload_parts language plpgsql security definer set search_path='' as $$
declare session_row public.multipart_upload_sessions; upload_row public.storage_uploads; expected_size bigint; result_row public.multipart_upload_parts;
begin
  perform public.require_catalog_writer(p_actor_user_id);select * into session_row from public.multipart_upload_sessions where id=p_session_id for update;
  if not found then raise exception 'multipart session not found' using errcode='P0002'; end if;
  if session_row.initiated_by<>p_actor_user_id or session_row.status not in('initiated','uploading') or session_row.expires_at<=now() then raise exception 'multipart session unavailable' using errcode='55000'; end if;
  select * into upload_row from public.storage_uploads where id=session_row.storage_upload_id for share;
  if p_part_number<1 or p_part_number>session_row.total_parts then raise exception 'invalid part' using errcode='22023'; end if;
  expected_size:=case when p_part_number<session_row.total_parts then session_row.part_size_bytes else upload_row.expected_size_bytes-(session_row.total_parts-1)::bigint*session_row.part_size_bytes end;
  if p_size_bytes<>expected_size or char_length(p_provider_etag) not between 1 and 200 then raise exception 'part does not match storage' using errcode='22023'; end if;
  insert into public.multipart_upload_parts(session_id,part_number,size_bytes,provider_etag) values(session_row.id,p_part_number,p_size_bytes,p_provider_etag)
    on conflict(session_id,part_number) do update set size_bytes=excluded.size_bytes,provider_etag=excluded.provider_etag,confirmed_at=now() returning * into result_row;
  update public.multipart_upload_sessions set status='uploading',updated_at=now() where id=session_row.id;return result_row;
end;$$;

create function public.admin_complete_multipart_upload(p_actor_user_id uuid,p_request_id uuid,p_session_id uuid)
returns public.multipart_upload_sessions language plpgsql security definer set search_path='' as $$
declare actor_role text:=public.require_catalog_writer(p_actor_user_id); result_row public.multipart_upload_sessions; upload_row public.storage_uploads;
begin
  if exists(select 1 from public.admin_audit_log where request_id=p_request_id) then select * into result_row from public.multipart_upload_sessions where id=p_session_id;return result_row;end if;
  select * into result_row from public.multipart_upload_sessions where id=p_session_id for update;if not found then raise exception 'multipart session not found' using errcode='P0002';end if;
  if result_row.initiated_by<>p_actor_user_id or result_row.status not in('initiated','uploading') or result_row.expires_at<=now() then raise exception 'multipart session unavailable' using errcode='55000';end if;
  select * into upload_row from public.storage_uploads where id=result_row.storage_upload_id for share;
  if (select count(*) from public.multipart_upload_parts where session_id=result_row.id)<>result_row.total_parts or (select coalesce(sum(size_bytes),0) from public.multipart_upload_parts where session_id=result_row.id)<>upload_row.expected_size_bytes then raise exception 'multipart parts incomplete' using errcode='55000';end if;
  update public.multipart_upload_sessions set status='completed',completed_at=now(),updated_at=now() where id=result_row.id returning * into result_row;
  insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,after_data) values(p_actor_user_id,actor_role,'catalog.multipart_completed','storage_upload',upload_row.id,p_request_id,'succeeded',jsonb_build_object('multipart_id',result_row.id,'parts',result_row.total_parts));return result_row;
end;$$;

create function public.admin_cancel_multipart_upload(p_actor_user_id uuid,p_request_id uuid,p_session_id uuid)
returns public.multipart_upload_sessions language plpgsql security definer set search_path='' as $$
declare actor_role text:=public.require_catalog_writer(p_actor_user_id); result_row public.multipart_upload_sessions;
begin select * into result_row from public.multipart_upload_sessions where id=p_session_id for update;if not found then raise exception 'multipart session not found' using errcode='P0002';end if;
if result_row.initiated_by<>p_actor_user_id or result_row.status='completed' then raise exception 'multipart session unavailable' using errcode='55000';end if;
if result_row.status='cancelled' then return result_row;end if;update public.multipart_upload_sessions set status='cancelled',cancelled_at=now(),updated_at=now() where id=result_row.id returning * into result_row;
insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,after_data) values(p_actor_user_id,actor_role,'catalog.multipart_cancelled','storage_upload',result_row.storage_upload_id,p_request_id,'succeeded',jsonb_build_object('multipart_id',result_row.id));return result_row;end;$$;

revoke all on function public.admin_begin_multipart_upload(uuid,uuid,uuid,text,integer),public.admin_record_multipart_part(uuid,uuid,integer,integer,text),public.admin_complete_multipart_upload(uuid,uuid,uuid),public.admin_cancel_multipart_upload(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_begin_multipart_upload(uuid,uuid,uuid,text,integer),public.admin_record_multipart_part(uuid,uuid,integer,integer,text),public.admin_complete_multipart_upload(uuid,uuid,uuid),public.admin_cancel_multipart_upload(uuid,uuid,uuid) to service_role;
