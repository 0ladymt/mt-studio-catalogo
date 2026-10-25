begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000001','authenticated','authenticated','verifier@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000002','authenticated','authenticated','blocked@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.staff_members(user_id,role,status) values('a1000000-0000-4000-8000-000000000001','catalog_manager','active');
insert into public.product_categories(id,slug,name,status) values('a2000000-0000-4000-8000-000000000001','verify-job','Verify Job','active');
insert into public.products(id,category_id,slug,name,description,status) values('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','verify-job','Verify Job','Teste','draft');
insert into public.product_versions(id,product_id,version_label,release_sequence,status) values('a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','1.0',1,'draft');
insert into public.product_files(id,product_version_id,display_name,storage_key,mime_type,size_bytes,checksum_sha256,status) values('a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','Pack.zip','private/placeholder','application/zip',100,repeat('a',64),'active');

set local role service_role;
select public.admin_begin_storage_upload('a1000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',now()+interval '10 minutes');
select lives_ok($$select public.admin_create_storage_verification_job('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001',(select id from public.storage_uploads where product_file_id='a5000000-0000-4000-8000-000000000001'))$$,'authorized staff creates job');
select is((select status from public.storage_verification_jobs),'pending','job begins pending');
select is((select count(*)::integer from public.admin_audit_log where action='catalog.storage_verification_requested' and entity_id='a5000000-0000-4000-8000-000000000001'),1,'request is audited');
select throws_ok($$select public.admin_create_storage_verification_job('a1000000-0000-4000-8000-000000000002',gen_random_uuid(),(select id from public.storage_uploads limit 1))$$,'42501',null,'non-staff cannot create job');

select lives_ok($$select public.admin_claim_storage_verification_job('a1000000-0000-4000-8000-000000000001',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000001',300)$$,'first worker claims job');
select is((select status from public.storage_verification_jobs),'verifying','claimed job is verifying');
select is((select attempts from public.storage_verification_jobs),1,'claim increments attempts');
select isnt((select lease_expires_at from public.storage_verification_jobs),null,'claim has lease');
select throws_ok($$select public.admin_claim_storage_verification_job('a1000000-0000-4000-8000-000000000001',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000002',300)$$,'55P03',null,'concurrent worker is blocked');
select lives_ok($$select public.admin_heartbeat_storage_verification_job('a1000000-0000-4000-8000-000000000001',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000001',300)$$,'lease owner heartbeats');
select ok((select lease_expires_at>now()+interval '4 minutes' from public.storage_verification_jobs),'heartbeat extends a long-running lease');
select throws_ok($$select public.admin_heartbeat_storage_verification_job('a1000000-0000-4000-8000-000000000001',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000002',300)$$,'55P03',null,'other worker cannot heartbeat');
update public.storage_verification_jobs set lease_expires_at=now()-interval '1 second';
select lives_ok($$select public.admin_claim_storage_verification_job('a1000000-0000-4000-8000-000000000001',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000002',300)$$,'new worker recovers an interrupted expired lease');
select throws_ok($$select public.admin_finish_storage_verification_job('a1000000-0000-4000-8000-000000000001',gen_random_uuid(),(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000001',false,null,null,'stream_interrupted')$$,'55P03',null,'stale worker cannot finish recovered job');

select lives_ok($$select public.admin_finish_storage_verification_job('a1000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000002',false,99,repeat('b',64),'checksum_mismatch')$$,'failed attempt is recorded');
select is((select status from public.storage_verification_jobs),'failed','failed job is not promoted');
select is((select storage_status from public.product_files where id='a5000000-0000-4000-8000-000000000001'),'metadata_only','failure leaves file metadata only');
select is((select count(*)::integer from public.admin_audit_log where action='catalog.storage_verification_finished' and entity_id='a5000000-0000-4000-8000-000000000001'),1,'failure is audited');
select lives_ok($$select public.admin_claim_storage_verification_job('a1000000-0000-4000-8000-000000000001',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000003',300)$$,'failed job can be retried');
select is((select attempts from public.storage_verification_jobs),3,'retry increments attempt');
select lives_ok($$select public.admin_finish_storage_verification_job('a1000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000003',true,100,repeat('a',64),null)$$,'matching full verification completes');
select is((select status from public.storage_verification_jobs),'completed','job completed');
select is((select storage_status from public.product_files where id='a5000000-0000-4000-8000-000000000001'),'verified','file advances only to verified');
select isnt((select storage_status from public.product_files where id='a5000000-0000-4000-8000-000000000001'),'ready','job never marks ready');
select is((select count(*)::integer from public.admin_audit_log where action='catalog.storage_verification_finished' and entity_id='a5000000-0000-4000-8000-000000000001'),2,'successful completion is audited');
select lives_ok($$select public.admin_finish_storage_verification_job('a1000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000003',true,100,repeat('a',64),null)$$,'completion replay is idempotent');
update public.storage_verification_jobs set status='failed',lease_owner=null,lease_expires_at=null where true;
select throws_ok($$select public.admin_claim_storage_verification_job('a1000000-0000-4000-8000-000000000001',(select id from public.storage_verification_jobs),'a8000000-0000-4000-8000-000000000004',300)$$,'55000',null,'three attempts is a hard retry limit');

reset role; set local role authenticated;
select throws_ok($$select * from public.storage_verification_jobs$$,'42501',null,'authenticated cannot inspect jobs');
select throws_ok($$select public.admin_claim_storage_verification_job('a1000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),300)$$,'42501',null,'authenticated cannot invoke privileged job RPC');
select * from finish();
rollback;
