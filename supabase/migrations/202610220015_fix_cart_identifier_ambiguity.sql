create or replace function public.commerce_add_cart_item(p_user_id uuid,p_product_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare product_row public.products; target_cart_id uuid;
begin
  perform public.commerce_assert_customer(p_user_id);
  select * into product_row from public.products where id=p_product_id for share;
  if product_row.id is null then raise exception 'product unavailable' using errcode='P0002'; end if;
  if product_row.status<>'published' or product_row.current_version_id is null then raise exception 'product unavailable' using errcode='55000'; end if;
  if not exists(select 1 from public.product_versions v where v.id=product_row.current_version_id and v.status='published' and (v.available_from is null or v.available_from<=timezone('utc',now())) and (v.available_until is null or v.available_until>timezone('utc',now()))) then raise exception 'version unavailable' using errcode='55000'; end if;
  if not exists(select 1 from public.product_prices pr where pr.product_version_id=product_row.current_version_id and pr.status='active' and pr.currency='BRL' and pr.valid_from<=timezone('utc',now()) and (pr.valid_until is null or pr.valid_until>timezone('utc',now()))) then raise exception 'price unavailable' using errcode='55000'; end if;
  if not exists(select 1 from public.product_files f where f.product_version_id=product_row.current_version_id and f.status='active' and f.storage_status='ready' and f.verified_at is not null) then raise exception 'delivery unavailable' using errcode='55000'; end if;
  insert into public.shopping_carts(user_id) values(p_user_id) on conflict(user_id) do update set updated_at=timezone('utc',now()) returning id into target_cart_id;
  insert into public.shopping_cart_items(cart_id,product_id,product_version_id) values(target_cart_id,product_row.id,product_row.current_version_id) on conflict(cart_id,product_version_id) do nothing;
  return public.commerce_get_cart(p_user_id);
end; $$;
revoke all on function public.commerce_add_cart_item(uuid,uuid) from public, anon, authenticated;
grant execute on function public.commerce_add_cart_item(uuid,uuid) to service_role;
