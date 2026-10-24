begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-000000000001','authenticated','authenticated','download-one@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-000000000002','authenticated','authenticated','download-two@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.product_categories(id,slug,name,status) values('e2000000-0000-4000-8000-000000000001','download-test','Download test','active');
insert into public.products(id,category_id,slug,name,description,status) values('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','download-pack','Download Pack','Produto fictício','draft');
insert into public.product_versions(id,product_id,version_label,release_sequence,status,available_from) values('e4000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','1.0',1,'published',now()-interval '1 day');
update public.products set status='published',current_version_id='e4000000-0000-4000-8000-000000000001',published_at=now() where id='e3000000-0000-4000-8000-000000000001';
insert into public.product_prices(id,product_version_id,amount_cents,currency,status,valid_from) values('e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',26099,'BRL','active',now()-interval '1 day');
insert into public.product_files(id,product_version_id,display_name,storage_key,mime_type,size_bytes,checksum_sha256,status,storage_status,verified_at) values('e6000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','Pack 1.0.zip','private/final/download-pack-v1.zip','application/zip',273668096,repeat('a',64),'active','ready',now());

set local role service_role;
select lives_ok($$select public.commerce_add_cart_item('e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001')$$,'paid customer adds eligible product');
select lives_ok($$select public.commerce_checkout_cart('e1000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001')$$,'checkout creates snapshot');
select is((select count(*)::integer from public.download_entitlements),0,'pending order has no rights');
select lives_ok($$select public.commerce_prepare_pix_payment('e1000000-0000-4000-8000-000000000001',(select id from public.orders where user_id='e1000000-0000-4000-8000-000000000001'),'e8000000-0000-4000-8000-000000000001',now()+interval '30 minutes')$$,'Pix is prepared');
select lives_ok($$select public.commerce_record_pix_charge((select id from public.order_payments where order_id=(select id from public.orders where user_id='e1000000-0000-4000-8000-000000000001')),'99001','pending','000201TEST',null,null,'pending_waiting_transfer')$$,'Pix provider identity is recorded');
select lives_ok($$select public.commerce_reconcile_mercado_pago_payment('99001','mt-site:'||(select id from public.orders where user_id='e1000000-0000-4000-8000-000000000001')::text,26099,'BRL','approved','accredited','e9000000-0000-4000-8000-000000000001','download-approved')$$,'trusted approval grants rights transactionally');
select is((select count(*)::integer from public.download_entitlements),1,'exactly one entitlement is granted');
select is((select product_version_id from public.download_entitlements),'e4000000-0000-4000-8000-000000000001'::uuid,'exact purchased version is retained');
select is((select product_file_id from public.download_entitlements),'e6000000-0000-4000-8000-000000000001'::uuid,'exact snapshotted file is retained');
select is((public.commerce_list_order_history('e1000000-0000-4000-8000-000000000001')->0->>'downloadEligible')::boolean,true,'paid history exposes eligibility');
select lives_ok($$select public.commerce_authorize_download('e1000000-0000-4000-8000-000000000001',(select order_id from public.download_entitlements),(select id from public.download_entitlements),'ea000000-0000-4000-8000-000000000001')$$,'owner may request unlimited signed access');
select is((public.commerce_authorize_download('e1000000-0000-4000-8000-000000000001',(select order_id from public.download_entitlements),(select id from public.download_entitlements),'ea000000-0000-4000-8000-000000000001')->>'storageKey'),'private/final/download-pack-v1.zip','idempotent authorization returns snapshot key');
select is((select count(*)::integer from public.download_events where event_type='download_requested'),1,'repeated request id is audited once');
select throws_ok($$select public.commerce_authorize_download('e1000000-0000-4000-8000-000000000002',(select order_id from public.download_entitlements),(select id from public.download_entitlements),gen_random_uuid())$$,'P0002',null,'another customer cannot access the entitlement');
select lives_ok($$select public.commerce_reconcile_mercado_pago_payment('99001','mt-site:'||(select id from public.orders where user_id='e1000000-0000-4000-8000-000000000001')::text,26099,'BRL','refunded','refunded','eb000000-0000-4000-8000-000000000001','download-refunded')$$,'refund suspends rights without deletion');
select is((select status from public.download_entitlements),'suspended','refunded entitlement is suspended');
select is((select count(*)::integer from public.download_entitlements),1,'refund preserves entitlement history');
select throws_ok($$select public.commerce_authorize_download('e1000000-0000-4000-8000-000000000001',(select order_id from public.download_entitlements),(select id from public.download_entitlements),gen_random_uuid())$$,'55000',null,'refunded order cannot generate a download');
select throws_ok($$update public.download_entitlements set storage_key_snapshot='private/other.zip'$$,'55000',null,'commercial snapshot cannot be rewritten');
select throws_ok($$update public.download_entitlements set status='active',suspended_at=null$$,'55000',null,'suspended rights cannot be silently reactivated');

reset role;set local role authenticated;select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.download_entitlements where user_id <> 'e1000000-0000-4000-8000-000000000001'::uuid),0,'RLS hides other customers entitlements');
select throws_ok($$select public.commerce_authorize_download('e1000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),gen_random_uuid())$$,'42501',null,'browser cannot invoke privileged authorization RPC');
select * from finish();rollback;
