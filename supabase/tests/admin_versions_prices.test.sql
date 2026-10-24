begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'versions@example.invalid', 'test-only', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'support-versions@example.invalid', 'test-only', now(), '{}', '{}', now(), now());
insert into public.staff_members (user_id, role, status) values
  ('60000000-0000-4000-8000-000000000001', 'catalog_manager', 'active'),
  ('60000000-0000-4000-8000-000000000002', 'support', 'active');
insert into public.product_categories (id, slug, name, status)
values ('61000000-0000-4000-8000-000000000001', 'categoria-versoes', 'Categoria versões', 'active');
insert into public.products (id, category_id, slug, name, description, status)
values ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'produto-versoes', 'Produto versões', 'Produto fictício', 'draft');

set local role authenticated;
select throws_ok(
  $$ select public.admin_create_product_version('60000000-0000-4000-8000-000000000001', gen_random_uuid(), '62000000-0000-4000-8000-000000000001', '1.0', 1, null, null, null) $$,
  '42501', null, 'authenticated customers cannot invoke the privileged version RPC'
);
select throws_ok(
  $$ select public.admin_create_product_price('60000000-0000-4000-8000-000000000001', gen_random_uuid(), gen_random_uuid(), 1000, now(), null) $$,
  '42501', null, 'authenticated customers cannot invoke the privileged price RPC'
);

reset role;
set local role service_role;
select throws_ok(
  $$ select public.admin_create_product_version('60000000-0000-4000-8000-000000000002', gen_random_uuid(), '62000000-0000-4000-8000-000000000001', 'support', 99, null, null, null) $$,
  '42501', null, 'support cannot create versions through the trusted RPC'
);
select lives_ok(
  $$ select public.admin_create_product_version('60000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '1.0', 1, 'Inicial', null, null) $$,
  'catalog managers can create product versions'
);
select is((select status from public.product_versions where product_id = '62000000-0000-4000-8000-000000000001' and release_sequence = 1), 'draft', 'new versions are forced to draft');
select is((select product_id from public.product_versions where version_label = '1.0'), '62000000-0000-4000-8000-000000000001'::uuid, 'the version remains linked to the selected product');
select is((select count(*)::integer from public.admin_audit_log where request_id = '63000000-0000-4000-8000-000000000001'), 1, 'version creation is audited once');
select throws_ok(
  $$ select public.admin_create_product_version('60000000-0000-4000-8000-000000000001', gen_random_uuid(), '62000000-0000-4000-8000-000000000001', 'outra', 1, null, null, null) $$,
  '23505', null, 'release sequences are unique within a product'
);
select throws_ok(
  $$ select public.admin_create_product_version('60000000-0000-4000-8000-000000000001', null, '62000000-0000-4000-8000-000000000001', 'rollback', 20, null, null, null) $$,
  '23502', null, 'a failed version audit aborts the operation'
);
select is((select count(*)::integer from public.product_versions where version_label = 'rollback'), 0, 'failed audit leaves no version behind');

select lives_ok(
  $$ select public.admin_update_product_version('60000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000002', (select id from public.product_versions where version_label = '1.0'), '1.0.1', 1, 'Notas atualizadas', null, null) $$,
  'unlocked draft versions can be edited'
);
select is((select release_notes from public.product_versions where version_label = '1.0.1'), 'Notas atualizadas', 'version metadata is updated without changing its product');
select lives_ok(
  $$ update public.product_versions set locked_at = now() where version_label = '1.0.1' $$,
  'the future order workflow can lock a version'
);
select throws_ok(
  $$ select public.admin_update_product_version('60000000-0000-4000-8000-000000000001', gen_random_uuid(), (select id from public.product_versions where version_label = '1.0.1'), 'alterada', 1, null, null, null) $$,
  '55000', null, 'locked versions cannot be edited'
);
select throws_ok(
  $$ delete from public.product_versions where version_label = '1.0.1' $$,
  '55000', null, 'locked versions cannot be deleted'
);

select lives_ok(
  $$ select public.admin_create_product_price('60000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', (select id from public.product_versions where version_label = '1.0.1'), 12990, now() - interval '1 minute', null) $$,
  'catalog managers can create BRL price records'
);
select is((select status || ':' || currency from public.product_prices where amount_cents = 12990), 'scheduled:BRL', 'new prices are scheduled and fixed to BRL');
select is((select count(*)::integer from public.admin_audit_log where request_id = '64000000-0000-4000-8000-000000000001'), 1, 'price creation is audited once');
select throws_ok(
  $$ select public.admin_create_product_price('60000000-0000-4000-8000-000000000001', gen_random_uuid(), (select id from public.product_versions where version_label = '1.0.1'), -1, now(), null) $$,
  '23514', null, 'negative prices are rejected by database integrity checks'
);
select lives_ok(
  $$ select public.admin_activate_product_price('60000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000002', (select id from public.product_prices where amount_cents = 12990)) $$,
  'a scheduled price can become current'
);
select is((select count(*)::integer from public.product_prices where status = 'active'), 1, 'only one price is active for the version');

select lives_ok(
  $$ select public.admin_create_product_price('60000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000003', (select id from public.product_versions where version_label = '1.0.1'), 15990, now() - interval '1 minute', null) $$,
  'a successor price is stored as a separate history record'
);
select lives_ok(
  $$ update public.product_prices set locked_at = now() where amount_cents = 12990 $$,
  'the future order workflow can freeze the price used by an order'
);
select lives_ok(
  $$ select public.admin_activate_product_price('60000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000004', (select id from public.product_prices where amount_cents = 15990)) $$,
  'a successor can replace a locked current price without rewriting it'
);
select is((select status from public.product_prices where amount_cents = 12990), 'retired', 'the previous locked price is retired one way');
select is((select status from public.product_prices where amount_cents = 15990), 'active', 'the successor becomes the only current price');
select is((select amount_cents::bigint from public.product_prices where locked_at is not null), 12990::bigint, 'the locked monetary value remains unchanged');
select throws_ok(
  $$ update public.product_prices set amount_cents = 1 where locked_at is not null $$,
  '55000', null, 'locked monetary values cannot be edited'
);
select throws_ok(
  $$ delete from public.product_prices where locked_at is not null $$,
  '55000', null, 'locked prices cannot be deleted'
);
select throws_ok(
  $$ insert into public.product_prices (product_version_id, amount_cents, currency, status, valid_from) values ((select id from public.product_versions where version_label = '1.0.1'), 9990, 'BRL', 'active', now()) $$,
  '23505', null, 'database uniqueness rejects a second active price'
);

select lives_ok(
  $$ select public.admin_create_product_price('60000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000005', (select id from public.product_versions where version_label = '1.0.1'), 17990, now() - interval '1 minute', null) $$,
  'another scheduled price can be prepared'
);
select throws_ok(
  $$ select public.admin_activate_product_price('60000000-0000-4000-8000-000000000001', null, (select id from public.product_prices where amount_cents = 17990)) $$,
  '23502', null, 'an activation audit failure rolls back every price transition'
);
select is((select status from public.product_prices where amount_cents = 15990), 'active', 'the prior current price remains active after activation rollback');
select is((select status from public.product_prices where amount_cents = 17990), 'scheduled', 'the target remains scheduled after activation rollback');
select lives_ok(
  $$ select public.admin_retire_product_price('60000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000006', (select id from public.product_prices where amount_cents = 17990)) $$,
  'unused scheduled prices can be retired without deletion'
);
select is((select status from public.product_prices where amount_cents = 17990), 'retired', 'retired price history is preserved');

select lives_ok(
  $$ select public.admin_create_product_version('60000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000001', '2.0', 2, null, null, null) $$,
  'a second independent version can be prepared'
);
select lives_ok(
  $$ select public.admin_retire_product_version('60000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000004', (select id from public.product_versions where version_label = '2.0')) $$,
  'an unlocked non-current version can be retired'
);
select is((select status from public.product_versions where version_label = '2.0'), 'retired', 'retired versions remain in history');
select throws_ok(
  $$ select public.admin_update_product_version('60000000-0000-4000-8000-000000000001', gen_random_uuid(), (select id from public.product_versions where version_label = '2.0'), '2.0.1', 2, null, null, null) $$,
  '55000', null, 'retired versions cannot be edited'
);

select * from finish();
rollback;
