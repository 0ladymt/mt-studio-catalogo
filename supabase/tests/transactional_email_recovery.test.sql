begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_column('public','transactional_email_outbox','locked_by','outbox records the owning worker');
select has_function('public','commerce_claim_email_job',array['text'::text],'claim function exists');
select has_function('public','commerce_complete_email_job',array['uuid'::text,'text'::text,'boolean'::text,'text'::text],'completion function exists');
select ok(has_function_privilege('service_role','public.commerce_claim_email_job(text)','EXECUTE'),'service role can claim');
select ok(not has_function_privilege('anon','public.commerce_claim_email_job(text)','EXECUTE'),'anon cannot claim');
select ok(not has_function_privilege('authenticated','public.commerce_claim_email_job(text)','EXECUTE'),'authenticated cannot claim');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000001','authenticated','authenticated','email-recovery@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.orders(id,user_id,idempotency_key,status,subtotal_cents,total_cents,expires_at)
values('b1200000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000001','b1300000-0000-4000-8000-000000000001','pending_payment',100,100,now()+interval '1 hour');
insert into public.transactional_email_outbox(id,event_key,order_id,user_id,recipient_email,template,payload,status,attempts,available_at,locked_at,locked_by)
values
('b1400000-0000-4000-8000-000000000001','recovery-fresh','b1200000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000001','email-recovery@example.invalid','payment_confirmed','{}','processing',1,now(),now()-interval '5 minutes','old-worker'),
('b1400000-0000-4000-8000-000000000002','recovery-stale','b1200000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000001','email-recovery@example.invalid','payment_confirmed','{}','processing',1,now(),now()-interval '11 minutes','old-worker'),
('b1400000-0000-4000-8000-000000000003','recovery-sent','b1200000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000001','email-recovery@example.invalid','payment_confirmed','{}','sent',1,now(),now()-interval '20 minutes','old-worker');

set local role service_role;
select is((select status from public.transactional_email_outbox where id='b1400000-0000-4000-8000-000000000001'),'processing','fresh processing job is not reclaimed');
select is((select id from public.commerce_claim_email_job('new-worker')),'b1400000-0000-4000-8000-000000000002'::uuid,'stale processing job is reclaimed');
select is((select locked_by from public.transactional_email_outbox where id='b1400000-0000-4000-8000-000000000002'),'new-worker','lease belongs to new worker');
select lives_ok($$select public.commerce_complete_email_job('b1400000-0000-4000-8000-000000000002','old-worker',true,null)$$,'old worker completion is harmless');
select is((select status from public.transactional_email_outbox where id='b1400000-0000-4000-8000-000000000002'),'processing','old worker cannot complete recovered job');
select lives_ok($$select public.commerce_complete_email_job('b1400000-0000-4000-8000-000000000002','new-worker',true,null)$$,'new worker can complete recovered job');
select is((select status from public.transactional_email_outbox where id='b1400000-0000-4000-8000-000000000002'),'sent','completed job is sent');
select is((select count(*)::int from public.commerce_claim_email_job('new-worker') where id in ('b1400000-0000-4000-8000-000000000002','b1400000-0000-4000-8000-000000000003')),0,'sent jobs are not claimed again');

select * from finish();
rollback;
