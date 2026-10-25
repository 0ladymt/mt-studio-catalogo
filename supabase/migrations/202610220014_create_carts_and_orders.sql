create table public.shopping_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.shopping_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.shopping_carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (cart_id, product_version_id),
  foreign key (product_id, product_version_id)
    references public.product_versions(product_id, id) on delete restrict
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment','paid','expired','failed','refunded')),
  currency text not null default 'BRL' check (currency = 'BRL'),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents >= 0 and total_cents = subtotal_cents - discount_cents),
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key),
  check ((status = 'paid') = (paid_at is not null))
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  product_name_snapshot text not null,
  version_label_snapshot text not null,
  unit_price_cents bigint not null check (unit_price_cents > 0),
  quantity integer not null default 1 check (quantity = 1),
  line_total_cents bigint not null check (line_total_cents = unit_price_cents * quantity),
  currency text not null default 'BRL' check (currency = 'BRL'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (order_id, product_version_id)
);

create table public.order_item_files (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  product_file_id uuid not null references public.product_files(id) on delete restrict,
  display_name_snapshot text not null,
  storage_key_snapshot text not null,
  size_bytes_snapshot bigint not null check (size_bytes_snapshot > 0),
  checksum_sha256_snapshot text not null check (checksum_sha256_snapshot ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (order_item_id, product_file_id)
);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('order_created','payment_confirmed','payment_expired','payment_failed','payment_refunded')),
  from_status text,
  to_status text not null,
  request_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (order_id, request_id, event_type)
);

create index shopping_cart_items_cart_idx on public.shopping_cart_items(cart_id, created_at);
create index orders_user_created_idx on public.orders(user_id, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index order_item_files_item_idx on public.order_item_files(order_item_id);
create index order_events_order_idx on public.order_events(order_id, created_at);

create trigger shopping_carts_set_updated_at before update on public.shopping_carts
for each row execute function public.set_profile_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_profile_updated_at();

create function public.reject_order_snapshot_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'order snapshots are immutable' using errcode = '55000';
end;
$$;
create trigger order_items_immutable before update or delete on public.order_items
for each row execute function public.reject_order_snapshot_mutation();
create trigger order_item_files_immutable before update or delete on public.order_item_files
for each row execute function public.reject_order_snapshot_mutation();
create trigger order_events_append_only before update or delete on public.order_events
for each row execute function public.reject_order_snapshot_mutation();

alter table public.shopping_carts enable row level security;
alter table public.shopping_carts force row level security;
alter table public.shopping_cart_items enable row level security;
alter table public.shopping_cart_items force row level security;
alter table public.orders enable row level security;
alter table public.orders force row level security;
alter table public.order_items enable row level security;
alter table public.order_items force row level security;
alter table public.order_item_files enable row level security;
alter table public.order_item_files force row level security;
alter table public.order_events enable row level security;
alter table public.order_events force row level security;

revoke all on public.shopping_carts, public.shopping_cart_items, public.orders,
  public.order_items, public.order_item_files, public.order_events from anon, authenticated;
grant select on public.shopping_carts, public.shopping_cart_items, public.orders,
  public.order_items, public.order_item_files, public.order_events to authenticated;

create policy "Customers read own cart" on public.shopping_carts for select to authenticated
using (user_id = (select auth.uid()));
create policy "Customers read own cart items" on public.shopping_cart_items for select to authenticated
using (exists (select 1 from public.shopping_carts c where c.id=cart_id and c.user_id=(select auth.uid())));
create policy "Customers read own orders" on public.orders for select to authenticated
using (user_id = (select auth.uid()));
create policy "Customers read own order items" on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid())));
create policy "Customers read own purchased file manifests" on public.order_item_files for select to authenticated
using (exists (select 1 from public.order_items i join public.orders o on o.id=i.order_id where i.id=order_item_id and o.user_id=(select auth.uid())));
create policy "Customers read own order events" on public.order_events for select to authenticated
using (exists (select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid())));

create function public.commerce_assert_customer(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where user_id=p_user_id and status='active') then
    raise exception 'customer unavailable' using errcode='42501';
  end if;
end; $$;

create function public.commerce_get_cart(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.commerce_assert_customer(p_user_id);
  insert into public.shopping_carts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select jsonb_build_object(
    'id', c.id,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', ci.id, 'productId', p.id, 'productVersionId', v.id,
      'name', p.name, 'versionLabel', v.version_label,
      'amountCents', price.amount_cents, 'currency', price.currency,
      'coverKey', media.storage_key, 'available',
        (p.status='published' and p.current_version_id=v.id and v.status='published'
         and price.id is not null and exists(select 1 from public.product_files f where f.product_version_id=v.id and f.status='active' and f.storage_status='ready' and f.verified_at is not null))
    ) order by ci.created_at) filter(where ci.id is not null), '[]'::jsonb),
    'totalCents', coalesce(sum(price.amount_cents),0)
  ) into result
  from public.shopping_carts c
  left join public.shopping_cart_items ci on ci.cart_id=c.id
  left join public.products p on p.id=ci.product_id
  left join public.product_versions v on v.id=ci.product_version_id
  left join lateral (select pr.id,pr.amount_cents,pr.currency from public.product_prices pr where pr.product_version_id=v.id and pr.status='active' and pr.valid_from<=timezone('utc',now()) and (pr.valid_until is null or pr.valid_until>timezone('utc',now())) order by pr.valid_from desc limit 1) price on true
  left join lateral (select m.storage_key from public.product_media m where m.product_id=p.id and m.media_type='cover' and m.status='active' limit 1) media on true
  where c.user_id=p_user_id group by c.id;
  return result;
end; $$;

create function public.commerce_add_cart_item(p_user_id uuid,p_product_id uuid) returns jsonb
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

create function public.commerce_remove_cart_item(p_user_id uuid,p_item_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.commerce_assert_customer(p_user_id);
  delete from public.shopping_cart_items i using public.shopping_carts c where i.id=p_item_id and c.id=i.cart_id and c.user_id=p_user_id;
  if not found then raise exception 'cart item unavailable' using errcode='P0002'; end if;
  return public.commerce_get_cart(p_user_id);
end; $$;

create function public.commerce_checkout_cart(p_user_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cart_row public.shopping_carts; existing public.orders; new_order public.orders; cart_item record; price_row public.product_prices; item_id uuid; subtotal bigint:=0; item_count integer:=0;
begin
  perform public.commerce_assert_customer(p_user_id);
  select * into existing from public.orders where user_id=p_user_id and idempotency_key=p_request_id;
  if existing.id is not null then return jsonb_build_object('id',existing.id,'status',existing.status,'totalCents',existing.total_cents,'currency',existing.currency,'expiresAt',existing.expires_at); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into cart_row from public.shopping_carts where user_id=p_user_id for update;
  if cart_row.id is null then raise exception 'cart empty' using errcode='P0002'; end if;
  for cart_item in
    select i.*,p.name,p.status product_status,p.current_version_id,v.version_label,v.status version_status,v.available_from,v.available_until,c.status category_status
    from public.shopping_cart_items i join public.products p on p.id=i.product_id join public.product_versions v on v.id=i.product_version_id join public.product_categories c on c.id=p.category_id
    where i.cart_id=cart_row.id order by i.id for update of i,p,v
  loop
    item_count:=item_count+1;
    if cart_item.product_status<>'published' or cart_item.category_status<>'active' or cart_item.current_version_id<>cart_item.product_version_id or cart_item.version_status<>'published' or (cart_item.available_from is not null and cart_item.available_from>timezone('utc',now())) or (cart_item.available_until is not null and cart_item.available_until<=timezone('utc',now())) then raise exception 'cart product unavailable' using errcode='55000'; end if;
    select * into price_row from public.product_prices where product_version_id=cart_item.product_version_id and status='active' and currency='BRL' and valid_from<=timezone('utc',now()) and (valid_until is null or valid_until>timezone('utc',now())) order by valid_from desc limit 1 for share;
    if price_row.id is null then raise exception 'cart price unavailable' using errcode='55000'; end if;
    if not exists(select 1 from public.product_files f where f.product_version_id=cart_item.product_version_id and f.status='active' and f.storage_status='ready' and f.verified_at is not null) then raise exception 'cart delivery unavailable' using errcode='55000'; end if;
    subtotal:=subtotal+price_row.amount_cents;
  end loop;
  if item_count=0 then raise exception 'cart empty' using errcode='P0002'; end if;
  insert into public.orders(user_id,idempotency_key,subtotal_cents,total_cents,expires_at) values(p_user_id,p_request_id,subtotal,subtotal,timezone('utc',now())+interval '30 minutes') returning * into new_order;
  for cart_item in select i.*,p.name,v.version_label from public.shopping_cart_items i join public.products p on p.id=i.product_id join public.product_versions v on v.id=i.product_version_id where i.cart_id=cart_row.id order by i.id
  loop
    select * into price_row from public.product_prices where product_version_id=cart_item.product_version_id and status='active' and currency='BRL' and valid_from<=timezone('utc',now()) and (valid_until is null or valid_until>timezone('utc',now())) order by valid_from desc limit 1;
    insert into public.order_items(order_id,product_id,product_version_id,product_name_snapshot,version_label_snapshot,unit_price_cents,line_total_cents) values(new_order.id,cart_item.product_id,cart_item.product_version_id,cart_item.name,cart_item.version_label,price_row.amount_cents,price_row.amount_cents) returning id into item_id;
    insert into public.order_item_files(order_item_id,product_file_id,display_name_snapshot,storage_key_snapshot,size_bytes_snapshot,checksum_sha256_snapshot)
      select item_id,f.id,f.display_name,f.storage_key,f.size_bytes,f.checksum_sha256 from public.product_files f where f.product_version_id=cart_item.product_version_id and f.status='active' and f.storage_status='ready' and f.verified_at is not null order by f.sort_order,f.id;
    update public.product_versions set locked_at=coalesce(locked_at,timezone('utc',now())) where id=cart_item.product_version_id;
    update public.product_prices set locked_at=coalesce(locked_at,timezone('utc',now())) where id=price_row.id;
  end loop;
  insert into public.order_events(order_id,actor_user_id,event_type,to_status,request_id,details) values(new_order.id,p_user_id,'order_created','pending_payment',p_request_id,jsonb_build_object('totalCents',new_order.total_cents,'currency','BRL'));
  delete from public.shopping_cart_items where cart_id=cart_row.id;
  return jsonb_build_object('id',new_order.id,'status',new_order.status,'totalCents',new_order.total_cents,'currency',new_order.currency,'expiresAt',new_order.expires_at);
end; $$;

create function public.commerce_get_order(p_user_id uuid,p_order_id uuid) returns jsonb
language sql security definer set search_path='' stable as $$
select jsonb_build_object('id',o.id,'status',o.status,'totalCents',o.total_cents,'currency',o.currency,'expiresAt',o.expires_at,'createdAt',o.created_at,'downloadEligible',false,
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'productVersionId',i.product_version_id,'name',i.product_name_snapshot,'versionLabel',i.version_label_snapshot,'unitPriceCents',i.unit_price_cents,'quantity',i.quantity,'lineTotalCents',i.line_total_cents) order by i.created_at) from public.order_items i where i.order_id=o.id),'[]'::jsonb))
from public.orders o where o.id=p_order_id and o.user_id=p_user_id;
$$;

revoke all on function public.commerce_assert_customer(uuid), public.commerce_get_cart(uuid), public.commerce_add_cart_item(uuid,uuid), public.commerce_remove_cart_item(uuid,uuid), public.commerce_checkout_cart(uuid,uuid), public.commerce_get_order(uuid,uuid) from public, anon, authenticated;
grant execute on function public.commerce_get_cart(uuid), public.commerce_add_cart_item(uuid,uuid), public.commerce_remove_cart_item(uuid,uuid), public.commerce_checkout_cart(uuid,uuid), public.commerce_get_order(uuid,uuid) to service_role;

comment on table public.order_item_files is 'Immutable delivery manifest for the exact product version acquired. Access rights require a paid order and are not implemented by pending checkout.';
