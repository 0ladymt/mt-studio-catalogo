begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','70000000-0000-4000-8000-000000000001','authenticated','authenticated','media@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','70000000-0000-4000-8000-000000000002','authenticated','authenticated','support-media@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.staff_members(user_id,role,status) values('70000000-0000-4000-8000-000000000001','catalog_manager','active'),('70000000-0000-4000-8000-000000000002','support','active');
insert into public.product_categories(id,slug,name,status) values('71000000-0000-4000-8000-000000000001','midias','Mídias','active');
insert into public.products(id,category_id,slug,name,description,status) values('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','produto-midias','Produto mídias','Teste','draft');
insert into public.product_versions(id,product_id,version_label,release_sequence,status) values('73000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','1.0',1,'draft');
update public.products set current_version_id='73000000-0000-4000-8000-000000000001' where id='72000000-0000-4000-8000-000000000001';
insert into public.product_prices(product_version_id,amount_cents,currency,status,valid_from) values('73000000-0000-4000-8000-000000000001',10000,'BRL','active',now()-interval '1 minute');

set local role authenticated;
select throws_ok($$select public.admin_create_product_media('70000000-0000-4000-8000-000000000001',gen_random_uuid(),'72000000-0000-4000-8000-000000000001','x','x',0)$$,'42501',null,'clients cannot invoke media RPCs');
select throws_ok($$select public.admin_create_product_file('70000000-0000-4000-8000-000000000001',gen_random_uuid(),'73000000-0000-4000-8000-000000000001','x','x','application/zip',1,repeat('a',64),0)$$,'42501',null,'clients cannot invoke private file RPCs');
select throws_ok($$select storage_key from public.product_files$$,'42501',null,'clients cannot read private storage references');

reset role; set local role service_role;
select throws_ok($$select public.admin_create_product_media('70000000-0000-4000-8000-000000000002',gen_random_uuid(),'72000000-0000-4000-8000-000000000001','products/72000000-0000-4000-8000-000000000001/media/a.jpg','Capa',0)$$,'42501',null,'support cannot mutate media');
select throws_ok($$select public.admin_create_product_media('70000000-0000-4000-8000-000000000001',gen_random_uuid(),'72000000-0000-4000-8000-000000000001','https://evil.invalid/a.jpg','Capa',0)$$,'23514',null,'arbitrary public URLs are rejected');
select throws_ok($$select public.admin_create_product_media('70000000-0000-4000-8000-000000000001',gen_random_uuid(),'72000000-0000-4000-8000-000000000001','products/other/media/a.jpg','Capa',0)$$,'23514',null,'media keys must belong to the product');
select lives_ok($$select public.admin_create_product_media('70000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','products/72000000-0000-4000-8000-000000000001/media/a.jpg','Capa principal',0)$$,'valid media metadata is registered');
select is((select media_type from public.product_media where storage_key like '%/a.jpg'),'gallery','new media does not silently become cover');
select ok((select public.admin_product_publication_readiness('70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001')->'blockers' ? 'active_cover_missing'),'readiness reports a missing active cover');
select lives_ok($$select public.admin_set_product_cover('70000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002',(select id from public.product_media where storage_key like '%/a.jpg'))$$,'cover is selected explicitly');
select is((select count(*)::integer from public.product_media where media_type='cover' and status='active'),1,'only one active cover exists');
select throws_ok($$insert into public.product_media(product_id,media_type,storage_key,alt_text,status) values('72000000-0000-4000-8000-000000000001','cover','products/72000000-0000-4000-8000-000000000001/media/duplicate.jpg','Duplicada','active')$$,'23505',null,'database uniqueness rejects a duplicate active cover');
select throws_ok($$select public.admin_create_product_media('70000000-0000-4000-8000-000000000001',null,'72000000-0000-4000-8000-000000000001','products/72000000-0000-4000-8000-000000000001/media/rollback.jpg','Rollback',1)$$,'23502',null,'media audit failure aborts mutation');
select is((select count(*)::integer from public.product_media where storage_key like '%rollback.jpg'),0,'failed media audit rolls back metadata');

select throws_ok($$select public.admin_create_product_file('70000000-0000-4000-8000-000000000001',gen_random_uuid(),'73000000-0000-4000-8000-000000000001','Pack','products/wrong/files/a.zip','application/zip',100,repeat('a',64),0)$$,'23514',null,'private keys must match product and version');
select throws_ok($$select public.admin_create_product_file('70000000-0000-4000-8000-000000000001',gen_random_uuid(),'73000000-0000-4000-8000-000000000001','Pack','products/72000000-0000-4000-8000-000000000001/versions/73000000-0000-4000-8000-000000000001/files/a.zip','application/zip',0,repeat('a',64),0)$$,'23514',null,'invalid file size is rejected');
select throws_ok($$select public.admin_create_product_file('70000000-0000-4000-8000-000000000001',gen_random_uuid(),'73000000-0000-4000-8000-000000000001','Pack','products/72000000-0000-4000-8000-000000000001/versions/73000000-0000-4000-8000-000000000001/files/a.zip','application/zip',100,'bad',0)$$,'23514',null,'invalid checksum is rejected');
select lives_ok($$select public.admin_create_product_file('70000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','Pack.zip','products/72000000-0000-4000-8000-000000000001/versions/73000000-0000-4000-8000-000000000001/files/a.zip','application/zip',100,repeat('a',64),0)$$,'valid private file metadata is registered');
select is((select storage_status from public.product_files),'metadata_only','browser metadata cannot claim storage verification');
update public.product_prices set status='scheduled' where product_version_id='73000000-0000-4000-8000-000000000001';
select ok((select public.admin_product_publication_readiness('70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001')->'blockers' ? 'current_brl_price_missing'),'readiness reports a missing current BRL price');
update public.product_prices set status='active' where product_version_id='73000000-0000-4000-8000-000000000001';
select ok((select not (public.admin_product_publication_readiness('70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001')->>'ready')::boolean),'metadata-only file keeps product unready');
select ok((select public.admin_product_publication_readiness('70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001')->'blockers' ? 'verified_file_missing'),'readiness reports the exact missing verification');
select lives_ok($$update public.product_files set storage_status='ready',verified_at=now()$$,'a future trusted storage service can mark validation complete');
select ok((select (public.admin_product_publication_readiness('70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001')->>'ready')::boolean),'complete trusted metadata passes readiness');
select lives_ok($$update public.product_categories set status='inactive' where id='71000000-0000-4000-8000-000000000001'$$,'category can be disabled');
select ok((select public.admin_product_publication_readiness('70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001')->'blockers' ? 'category_inactive'),'readiness reports inactive category');
select lives_ok($$update public.product_categories set status='active' where id='71000000-0000-4000-8000-000000000001'$$,'category can be restored');
select lives_ok($$update public.product_versions set locked_at=now() where id='73000000-0000-4000-8000-000000000001'$$,'future order workflow locks version');
select throws_ok($$select public.admin_update_product_file('70000000-0000-4000-8000-000000000001',gen_random_uuid(),(select id from public.product_files),'Outro','application/zip',200,repeat('b',64),1)$$,'55000',null,'files of locked versions cannot be changed');
select throws_ok($$select public.admin_retire_product_file('70000000-0000-4000-8000-000000000001',gen_random_uuid(),(select id from public.product_files))$$,'55000',null,'files of locked versions cannot be retired');

select * from finish(); rollback;
