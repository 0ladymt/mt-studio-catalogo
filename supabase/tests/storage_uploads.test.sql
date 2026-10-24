begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','90000000-0000-4000-8000-000000000001','authenticated','authenticated','storage@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','90000000-0000-4000-8000-000000000002','authenticated','authenticated','storage-support@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.staff_members(user_id,role,status) values
('90000000-0000-4000-8000-000000000001','catalog_manager','active'),
('90000000-0000-4000-8000-000000000002','support','active');
insert into public.product_categories(id,slug,name,status) values('91000000-0000-4000-8000-000000000001','storage-poc','Storage POC','active');
insert into public.products(id,category_id,slug,name,description,status) values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','storage-poc','Storage POC','Teste','draft');
insert into public.product_versions(id,product_id,version_label,release_sequence,status) values('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','1.0',1,'draft');
insert into public.product_files(id,product_version_id,display_name,storage_key,mime_type,size_bytes,checksum_sha256,status) values
('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Bom.zip','products/92000000-0000-4000-8000-000000000001/versions/93000000-0000-4000-8000-000000000001/files/bom.zip','application/zip',100,repeat('a',64),'active'),
('94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001','Ruim.zip','products/92000000-0000-4000-8000-000000000001/versions/93000000-0000-4000-8000-000000000001/files/ruim.zip','application/zip',100,repeat('b',64),'active'),
('94000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000001','Não confiável.zip','products/92000000-0000-4000-8000-000000000001/versions/93000000-0000-4000-8000-000000000001/files/untrusted.zip','application/zip',100,repeat('c',64),'active');

set local role authenticated;
select throws_ok($$select * from public.storage_uploads$$,'42501',null,'customers cannot inspect upload transactions');
select throws_ok($$select public.admin_begin_storage_upload('90000000-0000-4000-8000-000000000001',gen_random_uuid(),'94000000-0000-4000-8000-000000000001',now()+interval '10 minutes')$$,'42501',null,'customers cannot invoke upload RPCs');
select throws_ok($$select public.admin_confirm_storage_upload('90000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),true,100,repeat('a',64),true)$$,'42501',null,'customers cannot invoke verification RPCs');

reset role; set local role service_role;
select throws_ok($$select public.admin_begin_storage_upload('90000000-0000-4000-8000-000000000002',gen_random_uuid(),'94000000-0000-4000-8000-000000000001',now()+interval '10 minutes')$$,'42501',null,'support cannot begin uploads');
select throws_ok($$select public.admin_begin_storage_upload('90000000-0000-4000-8000-000000000001',gen_random_uuid(),'94000000-0000-4000-8000-000000000001',now()+interval '25 hours')$$,'22023',null,'excessive authorization lifetime is rejected');

select lives_ok($$select public.admin_begin_storage_upload('90000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',now()+interval '24 hours')$$,'writer begins a private upload with a slow-network lifetime');
select is((select count(*)::integer from public.storage_uploads),1,'one upload transaction exists');
select matches((select object_key from public.storage_uploads),'^private/products/.+/versions/.+/files/.+/.+\.bin$','database generates a private unique object key');
select is((select count(*)::integer from public.admin_audit_log where request_id='95000000-0000-4000-8000-000000000001'),1,'upload initiation is audited atomically');
select lives_ok($$select public.admin_begin_storage_upload('90000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',now()+interval '10 minutes')$$,'idempotent initiation replay returns the original transaction');
select is((select count(*)::integer from public.storage_uploads),1,'idempotent replay creates no duplicate');
select throws_ok($$select public.admin_begin_storage_upload('90000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002',now()+interval '10 minutes')$$,'23505',null,'request id cannot be reused for another file');

select lives_ok($$select public.admin_confirm_storage_upload('90000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002',(select id from public.storage_uploads where product_file_id='94000000-0000-4000-8000-000000000001'),true,100,repeat('a',64),true)$$,'trusted matching full-object proof verifies upload');
select is((select status from public.storage_uploads where product_file_id='94000000-0000-4000-8000-000000000001'),'verified','upload transaction is verified');
select is((select storage_status from public.product_files where id='94000000-0000-4000-8000-000000000001'),'verified','file metadata advances only to verified');
select isnt((select storage_status from public.product_files where id='94000000-0000-4000-8000-000000000001'),'ready','verification never marks a file ready');
select is((select count(*)::integer from public.admin_audit_log where request_id='95000000-0000-4000-8000-000000000002'),1,'successful verification is audited once');
select lives_ok($$select public.admin_confirm_storage_upload('90000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002',(select id from public.storage_uploads where product_file_id='94000000-0000-4000-8000-000000000001'),true,100,repeat('a',64),true)$$,'confirmation replay is idempotent');

select lives_ok($$select public.admin_begin_storage_upload('90000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000003','94000000-0000-4000-8000-000000000002',now()+interval '10 minutes')$$,'second upload begins');
select lives_ok($$select public.admin_confirm_storage_upload('90000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000004',(select id from public.storage_uploads where product_file_id='94000000-0000-4000-8000-000000000002'),true,100,repeat('d',64),true)$$,'checksum mismatch is recorded without promotion');
select is((select failure_code from public.storage_uploads where product_file_id='94000000-0000-4000-8000-000000000002'),'checksum_mismatch','altered object receives explicit failure');
select is((select storage_status from public.product_files where id='94000000-0000-4000-8000-000000000002'),'metadata_only','checksum mismatch leaves file metadata unverified');

select lives_ok($$select public.admin_begin_storage_upload('90000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000005','94000000-0000-4000-8000-000000000003',now()+interval '10 minutes')$$,'third upload begins');
select lives_ok($$select public.admin_confirm_storage_upload('90000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000006',(select id from public.storage_uploads where product_file_id='94000000-0000-4000-8000-000000000003'),true,100,repeat('c',64),false)$$,'untrusted browser-equivalent checksum is recorded');
select is((select failure_code from public.storage_uploads where product_file_id='94000000-0000-4000-8000-000000000003'),'untrusted_integrity','untrusted integrity proof is rejected');
select is((select storage_status from public.product_files where id='94000000-0000-4000-8000-000000000003'),'metadata_only','untrusted proof cannot promote metadata');

update public.product_versions set locked_at=now() where id='93000000-0000-4000-8000-000000000001';
select throws_ok($$select public.admin_begin_storage_upload('90000000-0000-4000-8000-000000000001',gen_random_uuid(),'94000000-0000-4000-8000-000000000003',now()+interval '10 minutes')$$,'55000',null,'locked versions reject new upload transactions');

select * from finish();
rollback;
