begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','80000000-0000-4000-8000-000000000001','authenticated','authenticated','publisher@example.invalid','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','80000000-0000-4000-8000-000000000002','authenticated','authenticated','support-publish@example.invalid','x',now(),'{}','{}',now(),now());
insert into public.staff_members(user_id,role,status) values('80000000-0000-4000-8000-000000000001','catalog_manager','active'),('80000000-0000-4000-8000-000000000002','support','active');
insert into public.product_categories(id,slug,name,status) values
('81000000-0000-4000-8000-000000000001','ativa-publicacao','Ativa','active'),('81000000-0000-4000-8000-000000000002','inativa-publicacao','Inativa','inactive');
insert into public.products(id,category_id,slug,name,description,status) values
('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','completo','Completo','Teste','draft'),
('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','sem-capa','Sem capa','Teste','draft'),
('82000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','sem-preco','Sem preço','Teste','draft'),
('82000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000001','sem-arquivo','Sem arquivo','Teste','draft'),
('82000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000002','categoria-inativa','Categoria inativa','Teste','draft'),
('82000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000001','rollback-publicacao','Rollback','Teste','draft');
insert into public.product_versions(id,product_id,version_label,release_sequence,status) values
('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','1',1,'draft'),
('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','1',1,'draft'),
('83000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000003','1',1,'draft'),
('83000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000004','1',1,'draft'),
('83000000-0000-4000-8000-000000000005','82000000-0000-4000-8000-000000000005','1',1,'draft'),
('83000000-0000-4000-8000-000000000006','82000000-0000-4000-8000-000000000006','1',1,'draft');
insert into public.product_prices(product_version_id,amount_cents,currency,status,valid_from) select id,10000,'BRL','active',now()-interval '1 minute' from public.product_versions where id<>'83000000-0000-4000-8000-000000000003';
insert into public.product_media(product_id,media_type,storage_key,alt_text,status) select id,'cover','products/'||id||'/media/capa.webp','Capa','active' from public.products where id<>'82000000-0000-4000-8000-000000000002';
insert into public.product_files(product_version_id,display_name,storage_key,mime_type,size_bytes,checksum_sha256,status,storage_status,verified_at)
select id,'Pack.zip','products/'||product_id||'/versions/'||id||'/files/pack.zip','application/zip',100,repeat('a',64),'active','ready',now() from public.product_versions where id<>'83000000-0000-4000-8000-000000000004';

set local role authenticated;
select throws_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001',gen_random_uuid(),'82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001')$$,'42501',null,'authenticated users cannot invoke publication RPC');
reset role;set local role service_role;
select throws_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000002',gen_random_uuid(),'82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001')$$,'42501',null,'support cannot publish');
select throws_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001',gen_random_uuid(),'82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002')$$,'23514',null,'product without cover is rejected');
select throws_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001',gen_random_uuid(),'82000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000003')$$,'23514',null,'product without current price is rejected');
select throws_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001',gen_random_uuid(),'82000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000004')$$,'23514',null,'product without ready file is rejected');
select throws_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001',gen_random_uuid(),'82000000-0000-4000-8000-000000000005','83000000-0000-4000-8000-000000000005')$$,'23514',null,'inactive category is rejected');
select throws_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001',gen_random_uuid(),'82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002')$$,'23514',null,'version from another product is rejected');

select lives_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001')$$,'complete product publishes atomically');
select is((select status from public.products where id='82000000-0000-4000-8000-000000000001'),'published','product becomes published');
select is((select status from public.product_versions where id='83000000-0000-4000-8000-000000000001'),'published','selected version becomes published');
select is((select current_version_id from public.products where id='82000000-0000-4000-8000-000000000001'),'83000000-0000-4000-8000-000000000001'::uuid,'current version is set by server');
select is((select count(*)::integer from public.admin_audit_log where request_id='84000000-0000-4000-8000-000000000001'),1,'publication writes one audit event');
select lives_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001')$$,'same request id is idempotent');
select is((select count(*)::integer from public.admin_audit_log where request_id='84000000-0000-4000-8000-000000000001'),1,'idempotent replay does not duplicate audit');
select throws_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001',gen_random_uuid(),'82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001')$$,'55000',null,'published product rejects a second logical publication');
select ok((select pg_get_functiondef('public.admin_publish_product(uuid,uuid,uuid,uuid)'::regprocedure) ilike '%for update%' and pg_get_functiondef('public.admin_publish_product(uuid,uuid,uuid,uuid)'::regprocedure) ilike '%for share%'),'publication locks mutable and readiness records');
select ok((select pg_get_functiondef('public.admin_publish_product(uuid,uuid,uuid,uuid)'::regprocedure) ilike '%pg_advisory_xact_lock%'),'same request id is serialized before idempotency lookup');

reset role;
create function pg_temp.fail_publication_audit() returns trigger language plpgsql as $$begin if new.request_id='84000000-0000-4000-8000-000000000006' then raise exception 'forced audit failure' using errcode='P0001';end if;return new;end$$;
create trigger fail_publication_audit before insert on public.admin_audit_log for each row execute function pg_temp.fail_publication_audit();
set local role service_role;
select throws_ok($$select public.admin_publish_product('80000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000006','82000000-0000-4000-8000-000000000006','83000000-0000-4000-8000-000000000006')$$,'P0001',null,'audit failure aborts publication');
select is((select status from public.products where id='82000000-0000-4000-8000-000000000006'),'draft','product rollback restores draft status');
select is((select status from public.product_versions where id='83000000-0000-4000-8000-000000000006'),'draft','version rollback restores draft status');
reset role;
drop trigger fail_publication_audit on public.admin_audit_log;

set local role service_role;
select lives_ok($$select public.admin_unpublish_product('80000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Correção temporária da vitrine')$$,'published product can be unpublished');
select is((select status from public.products where id='82000000-0000-4000-8000-000000000001'),'unpublished','product leaves public state');
select is((select current_version_id from public.products where id='82000000-0000-4000-8000-000000000001'),'83000000-0000-4000-8000-000000000001'::uuid,'unpublication preserves current version');
select is((select status from public.product_versions where id='83000000-0000-4000-8000-000000000001'),'published','unpublication does not retire version');
select lives_ok($$select public.admin_unpublish_product('80000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Correção temporária da vitrine')$$,'unpublication replay is idempotent');
set local role anon;
select is((select count(*)::integer from public.products where id='82000000-0000-4000-8000-000000000001'),0,'RLS hides unpublished product from public');

select * from finish();rollback;
