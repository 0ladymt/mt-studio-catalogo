create or replace function public.admin_product_publication_readiness(p_actor_user_id uuid, p_product_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare blockers jsonb := '[]'::jsonb; product_row public.products; version_row public.product_versions;
begin
  perform public.require_catalog_writer(p_actor_user_id);
  select * into product_row from public.products where id = p_product_id;
  if product_row.id is null then raise exception 'product not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.product_categories where id = product_row.category_id and status = 'active') then blockers := blockers || '"category_inactive"'::jsonb; end if;
  if product_row.status not in ('draft', 'unpublished') then blockers := blockers || '"product_state_invalid"'::jsonb; end if;
  if product_row.current_version_id is null then
    blockers := blockers || '"current_version_missing"'::jsonb;
  else
    select * into version_row from public.product_versions where id = product_row.current_version_id and product_id = product_row.id;
    if version_row.id is null then blockers := blockers || '"current_version_invalid"'::jsonb;
    elsif version_row.status not in ('draft', 'published') then blockers := blockers || '"version_state_invalid"'::jsonb; end if;
  end if;
  if not exists (select 1 from public.product_media where product_id = product_row.id and media_type = 'cover' and status = 'active') then blockers := blockers || '"active_cover_missing"'::jsonb; end if;
  if product_row.current_version_id is not null and not exists (
    select 1 from public.product_prices where product_version_id = product_row.current_version_id and currency = 'BRL' and status = 'active'
      and valid_from <= timezone('utc', now()) and (valid_until is null or valid_until > timezone('utc', now()))
  ) then blockers := blockers || '"current_brl_price_missing"'::jsonb; end if;
  if product_row.current_version_id is not null and not exists (
    select 1 from public.product_files where product_version_id = product_row.current_version_id and status = 'active' and storage_status = 'ready' and verified_at is not null
  ) then blockers := blockers || '"verified_file_missing"'::jsonb; end if;
  return jsonb_build_object('productId', product_row.id, 'ready', jsonb_array_length(blockers) = 0, 'blockers', blockers);
end; $$;
