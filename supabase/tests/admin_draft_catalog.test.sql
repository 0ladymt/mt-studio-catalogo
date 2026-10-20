begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'manager@example.invalid', 'test-only', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'support@example.invalid', 'test-only', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner@example.invalid', 'test-only', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin@example.invalid', 'test-only', now(), '{}', '{}', now(), now());

insert into public.staff_members (user_id, role, status) values
  ('10000000-0000-4000-8000-000000000001', 'catalog_manager', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'support', 'active'),
  ('10000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('10000000-0000-4000-8000-000000000004', 'admin', 'active');

set local role anon;
select throws_ok(
  $$ select public.admin_create_category('10000000-0000-4000-8000-000000000001', gen_random_uuid(), 'blocked', 'Blocked', null, 0, 'active') $$,
  '42501', null, 'anonymous callers cannot invoke privileged catalog functions'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.admin_create_category('10000000-0000-4000-8000-000000000001', gen_random_uuid(), 'blocked', 'Blocked', null, 0, 'active') $$,
  '42501', null, 'authenticated callers cannot invoke privileged catalog functions directly'
);
select throws_ok(
  $$ select public.require_catalog_writer('10000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'the internal authorization helper is not client-invocable'
);

reset role;
set local role service_role;

select throws_ok(
  $$ select public.admin_create_category('10000000-0000-4000-8000-000000000002', gen_random_uuid(), 'support-blocked', 'Support blocked', null, 0, 'active') $$,
  '42501', null, 'support staff cannot mutate the catalog through the trusted RPC'
);
select is(public.require_catalog_writer('10000000-0000-4000-8000-000000000001'), 'catalog_manager', 'catalog managers are authorized inside the transaction');
select is(public.require_catalog_writer('10000000-0000-4000-8000-000000000003'), 'owner', 'owners are authorized inside the transaction');
select is(public.require_catalog_writer('10000000-0000-4000-8000-000000000004'), 'admin', 'admins are authorized inside the transaction');

select lives_ok(
  $$ select public.admin_create_category('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'roupas-teste', 'Roupas teste', null, 10, 'active') $$,
  'an authorized manager creates a category'
);
select is((select status from public.product_categories where slug = 'roupas-teste'), 'active', 'the category is stored with its requested state');
select is((select count(*)::integer from public.admin_audit_log where request_id = '20000000-0000-4000-8000-000000000001'), 1, 'category creation writes exactly one audit record');
select throws_ok(
  $$ select public.admin_create_category('10000000-0000-4000-8000-000000000001', gen_random_uuid(), 'roupas-teste', 'Duplicada', null, 0, 'active') $$,
  '23505', null, 'duplicate category slugs are rejected'
);

select throws_ok(
  $$ select public.admin_create_category('10000000-0000-4000-8000-000000000001', null, 'rollback-auditoria', 'Rollback', null, 0, 'active') $$,
  '23502', null, 'an audit failure aborts category creation'
);
select is((select count(*)::integer from public.product_categories where slug = 'rollback-auditoria'), 0, 'commercial mutation rolls back when its audit insert fails');

select lives_ok(
  $$ select public.admin_create_draft_product('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', (select id from public.product_categories where slug = 'roupas-teste'), 'pack-teste', 'Pack teste', 'Descrição fictícia', false) $$,
  'an authorized manager creates a draft product'
);
select is((select status from public.products where slug = 'pack-teste'), 'draft', 'new products are forced to draft by the database function');
select is((select count(*)::integer from public.admin_audit_log where request_id = '20000000-0000-4000-8000-000000000002'), 1, 'draft creation writes exactly one audit record');
select throws_ok(
  $$ select public.admin_create_draft_product('10000000-0000-4000-8000-000000000001', gen_random_uuid(), gen_random_uuid(), 'categoria-invalida', 'Categoria inválida', 'Descrição', false) $$,
  '23503', null, 'products require an active existing category'
);

select lives_ok(
  $$ select public.admin_update_draft_product('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', (select id from public.products where slug = 'pack-teste'), (select id from public.product_categories where slug = 'roupas-teste'), 'pack-teste-editado', 'Pack teste editado', 'Descrição atualizada', true) $$,
  'draft products can be edited atomically'
);
select is((select featured from public.products where slug = 'pack-teste-editado'), true, 'the authorized draft update persists its fields');
select is((select count(*)::integer from public.admin_audit_log where request_id = '20000000-0000-4000-8000-000000000003'), 1, 'draft update writes exactly one audit record');

select lives_ok(
  $$ select public.admin_archive_draft_product('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', (select id from public.products where slug = 'pack-teste-editado')) $$,
  'draft products can be archived without deletion'
);
select is((select status from public.products where slug = 'pack-teste-editado'), 'archived', 'archiving preserves the commercial product record');
select throws_ok(
  $$ select public.admin_update_draft_product('10000000-0000-4000-8000-000000000001', gen_random_uuid(), (select id from public.products where slug = 'pack-teste-editado'), (select id from public.product_categories where slug = 'roupas-teste'), 'pack-alterado', 'Pack alterado', 'Descrição', false) $$,
  '55000', null, 'archived products cannot be edited through the draft operation'
);

select * from finish();
rollback;
