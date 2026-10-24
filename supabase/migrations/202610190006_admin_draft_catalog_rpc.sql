create function public.require_catalog_writer(p_actor_user_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  actor_role text;
begin
  select role into actor_role
  from public.staff_members
  where user_id = p_actor_user_id
    and status = 'active'
    and role in ('owner', 'admin', 'catalog_manager');

  if actor_role is null then
    raise exception 'catalog administration denied' using errcode = '42501';
  end if;
  return actor_role;
end;
$$;

create function public.admin_create_category(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_sort_order integer,
  p_status text
)
returns public.product_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  result_row public.product_categories;
begin
  insert into public.product_categories (slug, name, description, sort_order, status)
  values (p_slug, p_name, p_description, p_sort_order, p_status)
  returning * into result_row;

  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id,
    request_id, outcome, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.category_created', 'product_category', result_row.id,
    p_request_id, 'succeeded', to_jsonb(result_row)
  );
  return result_row;
end;
$$;

create function public.admin_update_category(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_category_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_sort_order integer,
  p_status text
)
returns public.product_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  before_row jsonb;
  result_row public.product_categories;
begin
  select to_jsonb(category) into before_row
  from public.product_categories as category
  where category.id = p_category_id;
  if before_row is null then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  update public.product_categories
  set slug = p_slug,
      name = p_name,
      description = p_description,
      sort_order = p_sort_order,
      status = p_status
  where id = p_category_id
  returning * into result_row;

  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id,
    request_id, outcome, before_data, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.category_updated', 'product_category', result_row.id,
    p_request_id, 'succeeded', before_row, to_jsonb(result_row)
  );
  return result_row;
end;
$$;

create function public.admin_create_draft_product(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_category_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_featured boolean
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  result_row public.products;
begin
  if not exists (
    select 1 from public.product_categories
    where id = p_category_id and status = 'active'
  ) then
    raise exception 'active category required' using errcode = '23503';
  end if;

  insert into public.products (category_id, slug, name, description, featured, status)
  values (p_category_id, p_slug, p_name, p_description, p_featured, 'draft')
  returning * into result_row;

  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id,
    request_id, outcome, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.product_draft_created', 'product', result_row.id,
    p_request_id, 'succeeded', to_jsonb(result_row)
  );
  return result_row;
end;
$$;

create function public.admin_update_draft_product(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_product_id uuid,
  p_category_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_featured boolean
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  before_row jsonb;
  result_row public.products;
begin
  select to_jsonb(product) into before_row
  from public.products as product
  where product.id = p_product_id;
  if before_row is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if before_row ->> 'status' <> 'draft' then
    raise exception 'only draft products can be edited' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.product_categories
    where id = p_category_id and status = 'active'
  ) then
    raise exception 'active category required' using errcode = '23503';
  end if;

  update public.products
  set category_id = p_category_id,
      slug = p_slug,
      name = p_name,
      description = p_description,
      featured = p_featured
  where id = p_product_id and status = 'draft'
  returning * into result_row;

  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id,
    request_id, outcome, before_data, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.product_draft_updated', 'product', result_row.id,
    p_request_id, 'succeeded', before_row, to_jsonb(result_row)
  );
  return result_row;
end;
$$;

create function public.admin_archive_draft_product(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_product_id uuid
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.require_catalog_writer(p_actor_user_id);
  before_row jsonb;
  result_row public.products;
begin
  select to_jsonb(product) into before_row
  from public.products as product
  where product.id = p_product_id;
  if before_row is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if before_row ->> 'status' <> 'draft' then
    raise exception 'only draft products can be archived by this operation' using errcode = '55000';
  end if;

  update public.products
  set status = 'archived'
  where id = p_product_id and status = 'draft'
  returning * into result_row;

  insert into public.admin_audit_log (
    actor_user_id, actor_role, action, entity_type, entity_id,
    request_id, outcome, before_data, after_data
  ) values (
    p_actor_user_id, actor_role, 'catalog.product_draft_archived', 'product', result_row.id,
    p_request_id, 'succeeded', before_row, to_jsonb(result_row)
  );
  return result_row;
end;
$$;

revoke all on function public.require_catalog_writer(uuid) from public, anon, authenticated;
revoke all on function public.admin_create_category(uuid, uuid, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.admin_update_category(uuid, uuid, uuid, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.admin_create_draft_product(uuid, uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_update_draft_product(uuid, uuid, uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_archive_draft_product(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.require_catalog_writer(uuid) to service_role;
grant execute on function public.admin_create_category(uuid, uuid, text, text, text, integer, text) to service_role;
grant execute on function public.admin_update_category(uuid, uuid, uuid, text, text, text, integer, text) to service_role;
grant execute on function public.admin_create_draft_product(uuid, uuid, uuid, text, text, text, boolean) to service_role;
grant execute on function public.admin_update_draft_product(uuid, uuid, uuid, uuid, text, text, text, boolean) to service_role;
grant execute on function public.admin_archive_draft_product(uuid, uuid, uuid) to service_role;

comment on function public.require_catalog_writer(uuid) is
  'Revalidates active server-side catalog authorization inside every privileged catalog transaction.';
