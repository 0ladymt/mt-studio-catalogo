create or replace function public.admin_publish_product(p_actor_user_id uuid,p_request_id uuid,p_product_id uuid,p_version_id uuid)
returns public.products language plpgsql security definer set search_path = '' as $$
declare actor_role text:=public.require_catalog_publisher(p_actor_user_id); product_before jsonb; result_row public.products; version_row public.product_versions;
begin
  if p_request_id is null then raise exception 'request id required' using errcode='23502'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  if exists(select 1 from public.admin_audit_log where request_id=p_request_id and action='catalog.product_published' and entity_id=p_product_id) then
    select * into result_row from public.products where id=p_product_id; return result_row;
  elsif exists(select 1 from public.admin_audit_log where request_id=p_request_id) then raise exception 'request id already used' using errcode='23505'; end if;

  select * into result_row from public.products where id=p_product_id for update;
  product_before:=to_jsonb(result_row);
  if result_row.id is null then raise exception 'product not found' using errcode='P0002'; end if;
  if result_row.status not in ('draft','unpublished') then raise exception 'product is not publishable' using errcode='55000'; end if;
  perform 1 from public.product_categories where id=result_row.category_id and status='active' for share;
  if not found then raise exception 'active category required' using errcode='23514'; end if;

  select * into version_row from public.product_versions where id=p_version_id and product_id=p_product_id for update;
  if version_row.id is null then raise exception 'eligible product version required' using errcode='23514'; end if;
  if version_row.status not in ('draft','published') then raise exception 'version is not publishable' using errcode='55000'; end if;
  if version_row.locked_at is not null and version_row.status <> 'published' then raise exception 'locked draft version cannot be published' using errcode='55000'; end if;

  perform 1 from public.product_prices where product_version_id=p_version_id and currency='BRL' and status='active'
    and valid_from<=timezone('utc',now()) and (valid_until is null or valid_until>timezone('utc',now())) for share;
  if not found then raise exception 'current BRL price required' using errcode='23514'; end if;
  perform 1 from public.product_media where product_id=p_product_id and media_type='cover' and status='active' for share;
  if not found then raise exception 'active cover required' using errcode='23514'; end if;
  perform 1 from public.product_files where product_version_id=p_version_id and status='active' and storage_status='ready' and verified_at is not null for share;
  if not found then raise exception 'verified ready file required' using errcode='23514'; end if;

  if version_row.status='draft' then
    update public.product_versions set status='published',available_from=coalesce(available_from,timezone('utc',now())) where id=p_version_id;
  end if;
  update public.products set current_version_id=p_version_id,status='published',published_at=timezone('utc',now()) where id=p_product_id returning * into result_row;
  insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,before_data,after_data)
  values(p_actor_user_id,actor_role,'catalog.product_published','product',p_product_id,p_request_id,'succeeded',product_before,to_jsonb(result_row));
  return result_row;
end; $$;

create or replace function public.admin_unpublish_product(p_actor_user_id uuid,p_request_id uuid,p_product_id uuid,p_reason text)
returns public.products language plpgsql security definer set search_path = '' as $$
declare actor_role text:=public.require_catalog_publisher(p_actor_user_id); product_before jsonb; result_row public.products;
begin
  if p_request_id is null then raise exception 'request id required' using errcode='23502'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  if exists(select 1 from public.admin_audit_log where request_id=p_request_id and action='catalog.product_unpublished' and entity_id=p_product_id) then
    select * into result_row from public.products where id=p_product_id; return result_row;
  elsif exists(select 1 from public.admin_audit_log where request_id=p_request_id) then raise exception 'request id already used' using errcode='23505'; end if;
  select * into result_row from public.products where id=p_product_id for update;
  product_before:=to_jsonb(result_row);
  if result_row.id is null then raise exception 'product not found' using errcode='P0002'; end if;
  if result_row.status<>'published' then raise exception 'only published products can be unpublished' using errcode='55000'; end if;
  update public.products set status='unpublished' where id=p_product_id returning * into result_row;
  insert into public.admin_audit_log(actor_user_id,actor_role,action,entity_type,entity_id,request_id,outcome,before_data,after_data)
  values(p_actor_user_id,actor_role,'catalog.product_unpublished','product',p_product_id,p_request_id,'succeeded',product_before,to_jsonb(result_row)||jsonb_build_object('reason',p_reason));
  return result_row;
end; $$;

revoke all on function public.admin_publish_product(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_unpublish_product(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_publish_product(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.admin_unpublish_product(uuid,uuid,uuid,text) to service_role;
