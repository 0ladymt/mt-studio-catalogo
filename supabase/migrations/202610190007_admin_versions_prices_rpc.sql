create or replace function public.protect_locked_product_price()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.locked_at is not null then
    raise exception 'locked product prices are immutable' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.locked_at is not null then
    if new.product_version_id = old.product_version_id
       and new.amount_cents = old.amount_cents
       and new.currency = old.currency
       and new.valid_from = old.valid_from
       and new.valid_until is not distinct from old.valid_until
       and new.locked_at = old.locked_at
       and old.status = 'active'
       and new.status = 'retired' then
      return new;
    end if;
    raise exception 'locked product prices are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function public.admin_create_product_version(
  p_actor_user_id uuid, p_request_id uuid, p_product_id uuid,
  p_version_label text, p_release_sequence integer, p_release_notes text,
  p_available_from timestamptz, p_available_until timestamptz
) returns public.product_versions
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  result_row public.product_versions;
begin
  if not exists (select 1 from public.products where id = p_product_id and status <> 'archived') then
    raise exception 'eligible product required' using errcode = '23503';
  end if;
  insert into public.product_versions (
    product_id, version_label, release_sequence, release_notes,
    status, available_from, available_until
  ) values (
    p_product_id, p_version_label, p_release_sequence, p_release_notes,
    'draft', p_available_from, p_available_until
  ) returning * into result_row;
  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.version_draft_created', 'product_version', result_row.id,
    p_request_id, 'succeeded', to_jsonb(result_row)
  );
  return result_row;
end;
$$;

create function public.admin_update_product_version(
  p_actor_user_id uuid, p_request_id uuid, p_version_id uuid,
  p_version_label text, p_release_sequence integer, p_release_notes text,
  p_available_from timestamptz, p_available_until timestamptz
) returns public.product_versions
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  before_row jsonb;
  result_row public.product_versions;
begin
  select to_jsonb(version) into before_row from public.product_versions version where id = p_version_id for update;
  if before_row is null then raise exception 'version not found' using errcode = 'P0002'; end if;
  if before_row ->> 'status' <> 'draft' or before_row ->> 'locked_at' is not null then
    raise exception 'only unlocked draft versions can be edited' using errcode = '55000';
  end if;
  update public.product_versions set
    version_label = p_version_label, release_sequence = p_release_sequence,
    release_notes = p_release_notes, available_from = p_available_from,
    available_until = p_available_until
  where id = p_version_id returning * into result_row;
  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.version_draft_updated', 'product_version', result_row.id,
    p_request_id, 'succeeded', before_row, to_jsonb(result_row)
  );
  return result_row;
end;
$$;

create function public.admin_retire_product_version(
  p_actor_user_id uuid, p_request_id uuid, p_version_id uuid
) returns public.product_versions
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  before_row jsonb;
  result_row public.product_versions;
begin
  select to_jsonb(version) into before_row from public.product_versions version where id = p_version_id for update;
  if before_row is null then raise exception 'version not found' using errcode = 'P0002'; end if;
  if before_row ->> 'locked_at' is not null then
    raise exception 'locked versions cannot be retired' using errcode = '55000';
  end if;
  if before_row ->> 'status' = 'retired' then
    raise exception 'version already retired' using errcode = '55000';
  end if;
  if exists (select 1 from public.products where current_version_id = p_version_id) then
    raise exception 'current versions cannot be retired' using errcode = '55000';
  end if;
  update public.product_versions set status = 'retired' where id = p_version_id returning * into result_row;
  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.version_retired', 'product_version', result_row.id,
    p_request_id, 'succeeded', before_row, to_jsonb(result_row)
  );
  return result_row;
end;
$$;

create function public.admin_create_product_price(
  p_actor_user_id uuid, p_request_id uuid, p_product_version_id uuid,
  p_amount_cents bigint, p_valid_from timestamptz, p_valid_until timestamptz
) returns public.product_prices
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  result_row public.product_prices;
begin
  if not exists (select 1 from public.product_versions where id = p_product_version_id and status <> 'retired') then
    raise exception 'eligible version required' using errcode = '23503';
  end if;
  insert into public.product_prices (
    product_version_id, amount_cents, currency, status, valid_from, valid_until
  ) values (
    p_product_version_id, p_amount_cents, 'BRL', 'scheduled', p_valid_from, p_valid_until
  ) returning * into result_row;
  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.price_created', 'product_price', result_row.id,
    p_request_id, 'succeeded', to_jsonb(result_row)
  );
  return result_row;
end;
$$;

create function public.admin_activate_product_price(
  p_actor_user_id uuid, p_request_id uuid, p_price_id uuid
) returns public.product_prices
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  target_before jsonb;
  previous_active jsonb;
  result_row public.product_prices;
  target_version_id uuid;
begin
  select to_jsonb(price), product_version_id into target_before, target_version_id
  from public.product_prices price where id = p_price_id for update;
  if target_before is null then raise exception 'price not found' using errcode = 'P0002'; end if;
  if target_before ->> 'status' <> 'scheduled' or target_before ->> 'locked_at' is not null then
    raise exception 'only unlocked scheduled prices can be activated' using errcode = '55000';
  end if;
  if (target_before ->> 'valid_from')::timestamptz > timezone('utc', now())
     or ((target_before ->> 'valid_until') is not null and (target_before ->> 'valid_until')::timestamptz <= timezone('utc', now())) then
    raise exception 'price is outside its validity window' using errcode = '23514';
  end if;
  select to_jsonb(price) into previous_active from public.product_prices price
  where product_version_id = target_version_id and status = 'active' for update;
  update public.product_prices set status = 'retired'
  where product_version_id = target_version_id and status = 'active';
  update public.product_prices set status = 'active'
  where id = p_price_id returning * into result_row;
  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.price_activated', 'product_price', result_row.id,
    p_request_id, 'succeeded',
    jsonb_build_object('target', target_before, 'previous_active', previous_active),
    to_jsonb(result_row)
  );
  return result_row;
end;
$$;

create function public.admin_retire_product_price(
  p_actor_user_id uuid, p_request_id uuid, p_price_id uuid
) returns public.product_prices
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  before_row jsonb;
  result_row public.product_prices;
begin
  select to_jsonb(price) into before_row from public.product_prices price where id = p_price_id for update;
  if before_row is null then raise exception 'price not found' using errcode = 'P0002'; end if;
  if before_row ->> 'status' = 'retired' then raise exception 'price already retired' using errcode = '55000'; end if;
  update public.product_prices set status = 'retired' where id = p_price_id returning * into result_row;
  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome, before_data, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.price_retired', 'product_price', result_row.id,
    p_request_id, 'succeeded', before_row, to_jsonb(result_row)
  );
  return result_row;
end;
$$;

revoke all on function public.admin_create_product_version(uuid, uuid, uuid, text, integer, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_update_product_version(uuid, uuid, uuid, text, integer, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_retire_product_version(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_create_product_price(uuid, uuid, uuid, bigint, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_activate_product_price(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_retire_product_price(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.admin_create_product_version(uuid, uuid, uuid, text, integer, text, timestamptz, timestamptz) to service_role;
grant execute on function public.admin_update_product_version(uuid, uuid, uuid, text, integer, text, timestamptz, timestamptz) to service_role;
grant execute on function public.admin_retire_product_version(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_create_product_price(uuid, uuid, uuid, bigint, timestamptz, timestamptz) to service_role;
grant execute on function public.admin_activate_product_price(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_retire_product_price(uuid, uuid, uuid) to service_role;

comment on function public.admin_activate_product_price(uuid, uuid, uuid) is
  'Atomically retires the prior active price, activates its successor and appends one audit event.';
comment on function public.protect_locked_product_price() is
  'Preserves every commercial field of locked prices; only the one-way active-to-retired lifecycle transition is allowed.';
