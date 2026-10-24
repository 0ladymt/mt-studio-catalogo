begin;create extension if not exists pgtap with schema extensions;select plan(28);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000001','authenticated','authenticated','pix-one@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000002','authenticated','authenticated','pix-two@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.orders(id,user_id,idempotency_key,status,subtotal_cents,total_cents,expires_at) values
('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000001','pending_payment',26099,26099,now()+interval '30 minutes'),
('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d2100000-0000-4000-8000-000000000002','pending_payment',990,990,now()+interval '30 minutes');
set local role service_role;
select lives_ok($$select public.commerce_prepare_pix_payment('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',now()+interval '30 minutes')$$,'customer prepares Pix');
select is((select amount_cents from public.order_payments where order_id='d2000000-0000-4000-8000-000000000001'),26099::bigint,'amount is copied from order');
select is((select external_reference from public.order_payments where order_id='d2000000-0000-4000-8000-000000000001'),'mt-site:d2000000-0000-4000-8000-000000000001','site reference is isolated');
select lives_ok($$select public.commerce_prepare_pix_payment('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',now()+interval '30 minutes')$$,'same prepare request is idempotent');
select is((select count(*)::integer from public.order_payments where order_id='d2000000-0000-4000-8000-000000000001'),1,'idempotency avoids duplicate charge rows');
select throws_ok($$select public.commerce_prepare_pix_payment('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',gen_random_uuid(),now()+interval '30 minutes')$$,'23505',null,'second concurrent Pix is rejected');
select throws_ok($$select public.commerce_prepare_pix_payment('d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001',gen_random_uuid(),now()+interval '30 minutes')$$,'P0002',null,'another customer cannot prepare payment');
select lives_ok($$select public.commerce_record_pix_charge((select id from public.order_payments where order_id='d2000000-0000-4000-8000-000000000001'),'9001','pending','000201TEST',null,null,'pending_waiting_transfer')$$,'provider Pix details are recorded');
select is((select status from public.orders where id='d2000000-0000-4000-8000-000000000001'),'pending_payment','creating Pix does not mark order paid');
select throws_ok($$select public.commerce_reconcile_mercado_pago_payment('9001','mt-site:d2000000-0000-4000-8000-000000000001',1,'BRL','approved',null,gen_random_uuid(),null)$$,'55000',null,'divergent provider amount is rejected');
select is((select status from public.orders where id='d2000000-0000-4000-8000-000000000001'),'pending_payment','mismatch preserves pending order');
select lives_ok($$select public.commerce_reconcile_mercado_pago_payment('9001','mt-site:d2000000-0000-4000-8000-000000000001',26099,'BRL','approved','accredited',gen_random_uuid(),'evt-approved')$$,'verified provider approval is applied');
select is((select status from public.orders where id='d2000000-0000-4000-8000-000000000001'),'paid','approved payment marks order paid');
select ok((select paid_at is not null from public.orders where id='d2000000-0000-4000-8000-000000000001'),'paid timestamp is server controlled');
select lives_ok($$select public.commerce_process_mercado_pago_webhook('evt-refund','9001','request-refund',repeat('a',64),'mt-site:d2000000-0000-4000-8000-000000000001',26099,'BRL','refunded','refunded',gen_random_uuid())$$,'refund webhook is processed transactionally');
select is((select status from public.orders where id='d2000000-0000-4000-8000-000000000001'),'refunded','refund updates order state');
select lives_ok($$select public.commerce_reconcile_mercado_pago_payment('9001','mt-site:d2000000-0000-4000-8000-000000000001',26099,'BRL','pending','delayed_notification',gen_random_uuid(),'evt-late-pending')$$,'late pending notification is accepted without regressing state');
select is((select status from public.order_payments where provider_payment_id='9001'),'refunded','terminal payment state does not regress');
select is((select status from public.orders where id='d2000000-0000-4000-8000-000000000001'),'refunded','terminal order state does not regress');
select lives_ok($$select public.commerce_process_mercado_pago_webhook('evt-refund','9001','request-refund',repeat('a',64),'mt-site:d2000000-0000-4000-8000-000000000001',26099,'BRL','refunded','refunded',gen_random_uuid())$$,'duplicate webhook is idempotent');
select is((select count(*)::integer from public.payment_webhook_receipts where provider_event_id='evt-refund'),1,'duplicate receipt is stored once');
select is((select count(*)::integer from public.payment_events where payment_id=(select id from public.order_payments where provider_payment_id='9001') and event_type='webhook_processed'),1,'webhook audit is append-only and unique');
select is((select details->>'reportedStatus' from public.payment_events where provider_event_id='evt-late-pending'),'pending','audit preserves the out-of-order provider report');
select is(public.commerce_get_order_payment('d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001'),null,'other customer cannot retrieve Pix');
reset role;set local role authenticated;select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.order_payments),0,'RLS hides other customer payments');
select throws_ok($$update public.orders set status='paid',paid_at=now() where id='d2000000-0000-4000-8000-000000000002'$$,'42501',null,'browser cannot mark an order paid');
select throws_ok($$select public.commerce_reconcile_mercado_pago_payment('9001','x',26099,'BRL','approved',null,gen_random_uuid(),null)$$,'42501',null,'authenticated role cannot invoke financial RPC');
reset role;set local role service_role;
select is((select count(*)::integer from public.order_item_files f join public.order_items i on i.id=f.order_item_id join public.orders o on o.id=i.order_id where o.status='pending_payment'),0,'pending orders receive no download manifest from payment flow');
select * from finish();rollback;
