begin;
create extension if not exists pgtap with schema extensions;
select plan(22);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000001','authenticated','authenticated','multipart@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000002','authenticated','authenticated','other@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000003','authenticated','authenticated','client@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.staff_members(user_id,role,status) values('c1000000-0000-4000-8000-000000000001','catalog_manager','active'),('c1000000-0000-4000-8000-000000000002','catalog_manager','active');
insert into public.product_categories(id,slug,name,status) values('c2000000-0000-4000-8000-000000000001','multipart-test','Multipart Test','active');
insert into public.products(id,category_id,slug,name,description,status) values('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','multipart-test','Multipart Test','Teste','draft');
insert into public.product_versions(id,product_id,version_label,release_sequence,status) values('c4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','1.0',1,'draft');
insert into public.product_files(id,product_version_id,display_name,storage_key,mime_type,size_bytes,checksum_sha256,status) values
('c5000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','Pack.bin','private/placeholder-a','application/octet-stream',10485760,repeat('a',64),'active'),
('c5000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000001','Cancel.bin','private/placeholder-b','application/octet-stream',5242880,repeat('b',64),'active');
set local role service_role;
select public.admin_begin_storage_upload('c1000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001',now()+interval '10 minutes');
select lives_ok($$select public.admin_begin_multipart_upload('c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001',(select id from public.storage_uploads where product_file_id='c5000000-0000-4000-8000-000000000001'),'provider-upload-a',5242880)$$,'writer begins multipart');
select is((select total_parts from public.multipart_upload_sessions),2,'server calculates total parts');
select is((select status from public.multipart_upload_sessions),'initiated','session begins initiated');
select is((select count(*)::integer from public.admin_audit_log where action='catalog.multipart_started' and entity_id=(select id from public.storage_uploads where product_file_id='c5000000-0000-4000-8000-000000000001')),1,'start is audited');
select lives_ok($$select public.admin_begin_multipart_upload('c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001',(select id from public.storage_uploads where product_file_id='c5000000-0000-4000-8000-000000000001'),'provider-upload-a',5242880)$$,'start replay is idempotent');
select throws_ok($$select public.admin_record_multipart_part('c1000000-0000-4000-8000-000000000002',(select id from public.multipart_upload_sessions),1,5242880,'etag-1')$$,'55000',null,'another administrator cannot mutate session');
select throws_ok($$select public.admin_record_multipart_part('c1000000-0000-4000-8000-000000000001',(select id from public.multipart_upload_sessions),3,1,'etag-x')$$,'22023',null,'out of range part rejected');
select throws_ok($$select public.admin_complete_multipart_upload('c1000000-0000-4000-8000-000000000001',gen_random_uuid(),(select id from public.multipart_upload_sessions))$$,'55000',null,'incomplete session cannot complete');
select lives_ok($$select public.admin_record_multipart_part('c1000000-0000-4000-8000-000000000001',(select id from public.multipart_upload_sessions),2,5242880,'etag-2')$$,'out of order part recorded');
select lives_ok($$select public.admin_record_multipart_part('c1000000-0000-4000-8000-000000000001',(select id from public.multipart_upload_sessions),1,5242880,'etag-1')$$,'first part recorded');
select is((select count(*)::integer from public.multipart_upload_parts),2,'confirmed parts persisted');
select lives_ok($$select public.admin_record_multipart_part('c1000000-0000-4000-8000-000000000001',(select id from public.multipart_upload_sessions),1,5242880,'etag-1')$$,'part confirmation replay is idempotent');
select throws_ok($$select public.admin_record_multipart_part('c1000000-0000-4000-8000-000000000001',(select id from public.multipart_upload_sessions),1,5242880,'etag-forged')$$,'55000',null,'confirmed part cannot be replaced');
select lives_ok($$select public.admin_complete_multipart_upload('c1000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000001',(select id from public.multipart_upload_sessions))$$,'complete after trusted part listing');
select is((select status from public.multipart_upload_sessions),'completed','session completed');
select is((select storage_status from public.product_files where id='c5000000-0000-4000-8000-000000000001'),'metadata_only','multipart completion does not verify commercial file');
select lives_ok($$select public.admin_complete_multipart_upload('c1000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000001',(select id from public.multipart_upload_sessions))$$,'completion replay is idempotent');
select is((select count(*)::integer from public.admin_audit_log where action='catalog.multipart_completed' and request_id='c8000000-0000-4000-8000-000000000001'),1,'completion is audited once');
select public.admin_begin_storage_upload('c1000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000002',now()+interval '10 minutes');
select public.admin_begin_multipart_upload('c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000002',(select id from public.storage_uploads where product_file_id='c5000000-0000-4000-8000-000000000002'),'provider-upload-b',5242880);
select lives_ok($$select public.admin_cancel_multipart_upload('c1000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000002',(select id from public.multipart_upload_sessions where provider_upload_id='provider-upload-b'))$$,'owner cancels multipart');
select is((select status from public.multipart_upload_sessions where provider_upload_id='provider-upload-b'),'cancelled','cancelled state persists');
reset role;set local role authenticated;
select throws_ok($$select * from public.multipart_upload_sessions$$,'42501',null,'customer cannot inspect multipart sessions');
select throws_ok($$select public.admin_begin_multipart_upload('c1000000-0000-4000-8000-000000000003',gen_random_uuid(),gen_random_uuid(),'forged',5242880)$$,'42501',null,'customer cannot invoke privileged multipart RPC');
select * from finish();rollback;
