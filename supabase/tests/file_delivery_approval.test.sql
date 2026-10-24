begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','b1000000-0000-4000-8000-000000000001','authenticated','authenticated','publisher@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-4000-8000-000000000002','authenticated','authenticated','support@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-4000-8000-000000000003','authenticated','authenticated','inactive@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.staff_members(user_id,role,status) values
('b1000000-0000-4000-8000-000000000001','catalog_manager','active'),
('b1000000-0000-4000-8000-000000000002','support','active'),
('b1000000-0000-4000-8000-000000000003','admin','disabled');
insert into public.product_categories(id,slug,name,status) values('b2000000-0000-4000-8000-000000000001','ready-approval','Ready approval','active');
insert into public.products(id,category_id,slug,name,description,status) values('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','ready-approval','Ready approval','Teste','draft');
insert into public.product_versions(id,product_id,version_label,release_sequence,status) values
('b4000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','1.0',1,'draft'),
('b4000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001','2.0',2,'draft');
insert into public.product_files(id,product_version_id,display_name,storage_key,mime_type,size_bytes,checksum_sha256,status,storage_status,verified_at) values
('b5000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','Ready.zip','private/final/ready.bin','application/zip',100,repeat('a',64),'active','verified',now()),
('b5000000-0000-4000-8000-000000000002','b4000000-0000-4000-8000-000000000001','Metadata.zip','private/staging/metadata.bin','application/zip',100,repeat('b',64),'active','metadata_only',null),
('b5000000-0000-4000-8000-000000000003','b4000000-0000-4000-8000-000000000002','Bad.zip','private/final/bad.bin','application/zip',100,repeat('c',64),'active','verified',now());
insert into public.storage_uploads(id,product_file_id,object_key,status,expected_size_bytes,expected_checksum_sha256,observed_size_bytes,observed_checksum_sha256,initiated_by,request_id,expires_at,verified_at) values
('b6000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','private/final/ready.bin','verified',100,repeat('a',64),100,repeat('a',64),'b1000000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000001',now()+interval '1 hour',now()),
('b6000000-0000-4000-8000-000000000003','b5000000-0000-4000-8000-000000000003','private/final/bad.bin','verified',100,repeat('c',64),100,repeat('c',64),'b1000000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000003',now()+interval '1 hour',now());
insert into public.multipart_upload_sessions(id,storage_upload_id,provider_upload_id,initiated_by,request_id,status,part_size_bytes,total_parts,expires_at,completed_at) values
('b7000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','provider-ready','b1000000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001','completed',5242880,1,now()+interval '1 hour',now()),
('b7000000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000003','provider-bad','b1000000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000003','completed',5242880,1,now()+interval '1 hour',now());
insert into public.storage_verification_jobs(id,storage_upload_id,requested_by,idempotency_key,status,attempts,observed_size_bytes,observed_checksum_sha256,completed_at) values
('b8000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000001','completed',1,100,repeat('a',64),now()),
('b8000000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000003','completed',1,99,repeat('c',64),now());

set local role service_role;
select lives_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001')$$,'publisher approves consistent verified file');
select is((select storage_status from public.product_files where id='b5000000-0000-4000-8000-000000000001'),'ready','file becomes ready');
select is((select count(*)::integer from public.admin_audit_log where action='catalog.product_file_ready_approved' and entity_id='b5000000-0000-4000-8000-000000000001'),1,'approval is audited once');
select is((select status from public.products where id='b3000000-0000-4000-8000-000000000001'),'draft','approval does not publish product');
select is((select status from public.product_versions where id='b4000000-0000-4000-8000-000000000001'),'draft','approval does not publish version');
select lives_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001')$$,'same request replay is idempotent');
select is((select count(*)::integer from public.admin_audit_log where action='catalog.product_file_ready_approved' and entity_id='b5000000-0000-4000-8000-000000000001'),1,'replay creates no duplicate audit');
select lives_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000001',gen_random_uuid(),'b5000000-0000-4000-8000-000000000001')$$,'already ready remains idempotent');
select throws_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000001',gen_random_uuid(),'b5000000-0000-4000-8000-000000000002')$$,'55000',null,'metadata only file is rejected');
select throws_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000001',gen_random_uuid(),'b5000000-0000-4000-8000-000000000003')$$,'55000',null,'inconsistent verification job is rejected');
select throws_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000002',gen_random_uuid(),'b5000000-0000-4000-8000-000000000003')$$,'42501',null,'support cannot approve delivery');
select throws_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000003',gen_random_uuid(),'b5000000-0000-4000-8000-000000000003')$$,'42501',null,'inactive staff cannot approve delivery');
select is((select storage_status from public.product_files where id='b5000000-0000-4000-8000-000000000003'),'verified','failed approvals preserve verified state');
select is((select storage_key from public.product_files where id='b5000000-0000-4000-8000-000000000001'),'private/final/ready.bin','approval preserves immutable key');
select is((select checksum_sha256 from public.product_files where id='b5000000-0000-4000-8000-000000000001'),repeat('a',64),'approval preserves hash');
select is((select size_bytes from public.product_files where id='b5000000-0000-4000-8000-000000000001'),100::bigint,'approval preserves size');

reset role;
create function pg_temp.reject_ready_audit() returns trigger language plpgsql as $$begin if new.action='catalog.product_file_ready_approved' then raise exception 'forced audit failure'; end if; return new; end$$;
create trigger reject_ready_audit before insert on public.admin_audit_log for each row execute function pg_temp.reject_ready_audit();
set local role service_role;
update public.storage_verification_jobs set observed_size_bytes=100 where id='b8000000-0000-4000-8000-000000000003';
select throws_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000001',gen_random_uuid(),'b5000000-0000-4000-8000-000000000003')$$,'P0001',null,'audit failure aborts approval');
select is((select storage_status from public.product_files where id='b5000000-0000-4000-8000-000000000003'),'verified','audit failure rolls back ready transition');
reset role;
drop trigger reject_ready_audit on public.admin_audit_log;
drop function pg_temp.reject_ready_audit();
set local role service_role;
update public.product_versions set locked_at=now() where id='b4000000-0000-4000-8000-000000000002';
select throws_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000001',gen_random_uuid(),'b5000000-0000-4000-8000-000000000003')$$,'55000',null,'locked version is rejected');

reset role; set local role authenticated;
select throws_ok($$select public.admin_approve_product_file_ready('b1000000-0000-4000-8000-000000000001',gen_random_uuid(),'b5000000-0000-4000-8000-000000000003')$$,'42501',null,'authenticated cannot invoke privileged approval RPC');
select throws_ok($$select storage_status from public.product_files where id='b5000000-0000-4000-8000-000000000001'$$,'42501',null,'browser role cannot inspect private delivery metadata directly');
reset role; set local role service_role;
select is((select count(*)::integer from public.admin_audit_log where action='catalog.product_file_ready_approved' and entity_id='b5000000-0000-4000-8000-000000000003'),0,'rejected approvals create no success audit');
select is((select count(*)::integer from public.admin_audit_log where action='catalog.product_published' and entity_id='b3000000-0000-4000-8000-000000000001'),0,'approval creates no publication audit');
select is((select count(*)::integer from public.admin_audit_log where entity_type='download'),0,'approval creates no download rights');
select * from finish();
rollback;
