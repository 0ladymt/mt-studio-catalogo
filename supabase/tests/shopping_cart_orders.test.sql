begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000001','authenticated','authenticated','buyer-one@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000002','authenticated','authenticated','buyer-two@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.product_categories(id,slug,name,status) values('c2000000-0000-4000-8000-000000000001','commerce-test','Commerce test','active');
insert into public.products(id,category_id,slug,name,description,status) values
('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','commerce-ready','Commerce Ready','Produto elegível','draft'),
('c3000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','commerce-not-ready','Commerce Not Ready','Produto inelegível','draft'),
('c3000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000001','commerce-second','Commerce Second','Segundo produto elegível','draft');
insert into public.product_versions(id,product_id,version_label,release_sequence,status,available_from) values
('c4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','1.0',1,'published',now()-interval '1 day'),
('c4000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002','1.0',1,'published',now()-interval '1 day'),
('c4000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000003','2.0',1,'published',now()-interval '1 day');
update public.products set status='published',current_version_id='c4000000-0000-4000-8000-000000000001',published_at=now() where id='c3000000-0000-4000-8000-000000000001';
update public.products set status='published',current_version_id='c4000000-0000-4000-8000-000000000002',published_at=now() where id='c3000000-0000-4000-8000-000000000002';
update public.products set status='published',current_version_id='c4000000-0000-4000-8000-000000000003',published_at=now() where id='c3000000-0000-4000-8000-000000000003';
insert into public.product_prices(id,product_version_id,amount_cents,currency,status,valid_from) values
('c5000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',26099,'BRL','active',now()-interval '1 day'),
('c5000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000002',990,'BRL','active',now()-interval '1 day'),
('c5000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000003',990,'BRL','active',now()-interval '1 day');
insert into public.product_files(id,product_version_id,display_name,storage_key,mime_type,size_bytes,checksum_sha256,status,storage_status,verified_at) values
('c6000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','Pack 1.0.zip','private/final/commerce-ready.zip','application/zip',273668096,repeat('a',64),'active','ready',now()),
('c6000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000002','Pack pending.zip','private/staging/commerce-pending.zip','application/zip',1024,repeat('b',64),'active','metadata_only',null),
('c6000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000003','Pack 2.0.zip','private/final/commerce-second.zip','application/zip',2048,repeat('c',64),'active','ready',now());

set local role service_role;
select is((public.commerce_get_cart('c1000000-0000-4000-8000-000000000001')->>'totalCents')::bigint,0::bigint,'empty cart has zero total');
select lives_ok($$select public.commerce_add_cart_item('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001')$$,'eligible product can be added');
select is((select count(*)::integer from public.shopping_cart_items),1,'cart item persists');
select lives_ok($$select public.commerce_add_cart_item('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001')$$,'duplicate addition is idempotent');
select is((select count(*)::integer from public.shopping_cart_items),1,'duplicate version is not inserted');
select is((public.commerce_get_cart('c1000000-0000-4000-8000-000000000001')->>'totalCents')::bigint,26099::bigint,'cart total comes from active server price');
select lives_ok($$select public.commerce_add_cart_item('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000003')$$,'cart accepts multiple distinct products');
select is(jsonb_array_length(public.commerce_get_cart('c1000000-0000-4000-8000-000000000001')->'items'),2,'cart contains both products');
select is((public.commerce_get_cart('c1000000-0000-4000-8000-000000000001')->>'totalCents')::bigint,27089::bigint,'multiple-product total remains integer cents');
select throws_ok($$select public.commerce_add_cart_item('c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002')$$,'55000',null,'product without ready file is rejected');
select throws_ok($$select public.commerce_remove_cart_item('c1000000-0000-4000-8000-000000000002',(select id from public.shopping_cart_items limit 1))$$,'P0002',null,'another customer cannot remove cart item');
select lives_ok($$select public.commerce_checkout_cart('c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001')$$,'eligible cart creates pending order');
select is((select status from public.orders where user_id='c1000000-0000-4000-8000-000000000001'),'pending_payment','new order is pending payment');
select is((select total_cents from public.orders where user_id='c1000000-0000-4000-8000-000000000001'),27089::bigint,'order total is server calculated');
select is((select product_name_snapshot from public.order_items where product_id='c3000000-0000-4000-8000-000000000001'),'Commerce Ready','commercial name is snapshotted');
select is((select version_label_snapshot from public.order_items where product_id='c3000000-0000-4000-8000-000000000001'),'1.0','exact version is snapshotted');
select is((select count(*)::integer from public.order_item_files),2,'ready delivery manifests are snapshotted');
select is((select checksum_sha256_snapshot from public.order_item_files where product_file_id='c6000000-0000-4000-8000-000000000001'),repeat('a',64),'file hash is snapshotted');
select is((select locked_at is not null from public.product_versions where id='c4000000-0000-4000-8000-000000000001'),true,'commercialized version is locked');
select is((select locked_at is not null from public.product_prices where id='c5000000-0000-4000-8000-000000000001'),true,'commercialized price is locked');
select is((select count(*)::integer from public.shopping_cart_items),0,'checkout clears purchased cart');
select lives_ok($$select public.commerce_checkout_cart('c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001')$$,'same checkout request is idempotent');
select is((select count(*)::integer from public.orders),1,'idempotent checkout does not duplicate order');
select is((select count(*)::integer from public.order_events where event_type='order_created'),1,'order creation is audited once');
select is((public.commerce_get_order('c1000000-0000-4000-8000-000000000001',(select id from public.orders))->>'downloadEligible')::boolean,false,'pending order grants no download right');
select is(public.commerce_get_order('c1000000-0000-4000-8000-000000000002',(select id from public.orders)),null,'other customer cannot access order through RPC');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.orders),0,'RLS hides another customer order');
select throws_ok($$insert into public.orders(user_id,idempotency_key,subtotal_cents,total_cents,expires_at) values('c1000000-0000-4000-8000-000000000002',gen_random_uuid(),1,1,now())$$,'42501',null,'browser cannot create orders directly');
select throws_ok($$update public.order_items set unit_price_cents=1$$,'42501',null,'browser cannot alter immutable snapshots');

select * from finish();
rollback;
