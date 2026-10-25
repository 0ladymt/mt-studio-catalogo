begin;

create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'catalog-admin@example.invalid', 'test-only', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'catalog-client@example.invalid', 'test-only', now(), '{}', '{}', now(), now());

insert into public.staff_members (user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'catalog_manager');

insert into public.product_categories (id, slug, name, sort_order) values
  ('10000000-0000-4000-8000-000000000001', 'packs', 'Packs', 1),
  ('10000000-0000-4000-8000-000000000002', 'interno', 'Interno', 2);

insert into public.products (id, category_id, slug, name, description, status) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'pack-publicado', 'Pack Publicado', 'Produto público fictício', 'draft'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'pack-rascunho', 'Pack Rascunho', 'Produto privado fictício', 'draft');

insert into public.product_versions (
  id, product_id, version_label, release_sequence, status, available_from
) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '1.0', 1, 'published', now() - interval '1 day'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '0.1', 1, 'draft', null);

update public.products
set status = 'published', current_version_id = '30000000-0000-4000-8000-000000000001', published_at = now()
where id = '20000000-0000-4000-8000-000000000001';

insert into public.product_media (
  id, product_id, media_type, storage_key, alt_text, status
) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'cover', 'catalog/publicado/cover.webp', 'Capa pública', 'active'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'cover', 'catalog/rascunho/cover.webp', 'Capa privada', 'active');

insert into public.product_files (
  id, product_version_id, display_name, storage_key, mime_type, size_bytes, checksum_sha256
) values
  ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'pack-v1.zip', 'private/pack-publicado/1.0/pack.zip', 'application/zip', 2048, repeat('a', 64));

insert into public.product_prices (
  id, product_version_id, amount_cents, status, valid_from
) values
  ('60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 14990, 'active', now() - interval '1 day'),
  ('60000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 9990, 'scheduled', now() + interval '1 day');

set local role anon;

select results_eq(
  $$ select slug from public.product_categories order by slug $$,
  $$ values ('interno'::text), ('packs'::text) $$,
  'anonymous users read active category labels only'
);
select results_eq(
  $$ select slug from public.products order by slug $$,
  $$ values ('pack-publicado'::text) $$,
  'anonymous users read only published products'
);
select results_eq(
  $$ select version_label from public.product_versions $$,
  $$ values ('1.0'::text) $$,
  'anonymous users read only the current published version'
);
select results_eq(
  $$ select storage_key from public.product_media $$,
  $$ values ('catalog/publicado/cover.webp'::text) $$,
  'anonymous users read only active media of published products'
);
select results_eq(
  $$ select amount_cents from public.product_prices $$,
  $$ values (14990::bigint) $$,
  'anonymous users read only the active current BRL price'
);
select throws_ok(
  $$ select count(*) from public.product_files $$,
  '42501', null,
  'commercial file metadata is private from anonymous users'
);
select throws_ok(
  $$ select count(*) from public.staff_members $$,
  '42501', null,
  'staff membership is private from anonymous users'
);
select throws_ok(
  $$ insert into public.products (category_id, slug, name, description) values ('10000000-0000-4000-8000-000000000001', 'intruso', 'Intruso', 'Sem autorização') $$,
  '42501', null,
  'anonymous users cannot create products'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.products), 1, 'customers receive the same published catalog visibility');
select throws_ok(
  $$ update public.product_prices set amount_cents = 1 where id = '60000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'customers cannot alter prices'
);
select throws_ok(
  $$ update public.product_versions set version_label = '2.0' where id = '30000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'customers cannot alter versions'
);
select throws_ok(
  $$ insert into public.staff_members (user_id, role) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner') $$,
  '42501', null,
  'customers cannot grant themselves staff access'
);
select throws_ok(
  $$ delete from public.products where id = '20000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'customers cannot delete products'
);
select throws_ok(
  $$ select count(*) from public.product_files $$,
  '42501', null,
  'commercial file metadata is private from authenticated customers'
);

reset role;

select throws_ok(
  $$ insert into public.product_categories (slug, name) values ('packs', 'Duplicada') $$,
  '23505', null,
  'category slugs are unique'
);
select throws_ok(
  $$ insert into public.product_prices (product_version_id, amount_cents, status, valid_from) values ('30000000-0000-4000-8000-000000000001', -1, 'scheduled', now()) $$,
  '23514', null,
  'prices reject non-positive cent values'
);
select throws_ok(
  $$ insert into public.product_prices (product_version_id, amount_cents, currency, status, valid_from) values ('30000000-0000-4000-8000-000000000001', 100, 'USD', 'scheduled', now()) $$,
  '23514', null,
  'catalog prices accept only BRL'
);
select throws_ok(
  $$ insert into public.product_files (product_version_id, display_name, storage_key, mime_type, size_bytes, checksum_sha256) values ('30000000-0000-4000-8000-000000000001', 'inválido.zip', 'private/invalido.zip', 'application/zip', 1, 'invalido') $$,
  '23514', null,
  'commercial files require a SHA-256 checksum'
);
select throws_ok(
  $$ update public.products set current_version_id = '30000000-0000-4000-8000-000000000002' where id = '20000000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'published products reject a draft current version from another product'
);

update public.product_versions
set locked_at = now()
where id = '30000000-0000-4000-8000-000000000001';

select isnt(
  (select locked_at from public.product_versions where id = '30000000-0000-4000-8000-000000000001'),
  null,
  'a trusted workflow can lock a version when it is first commercialized'
);
select throws_ok(
  $$ update public.product_versions set release_notes = 'Substituição silenciosa' where id = '30000000-0000-4000-8000-000000000001' $$,
  '55000', null,
  'locked commercialized versions cannot be modified'
);
select throws_ok(
  $$ delete from public.product_versions where id = '30000000-0000-4000-8000-000000000001' $$,
  '55000', null,
  'locked commercialized versions cannot be deleted'
);
select throws_ok(
  $$ insert into public.product_files (product_version_id, display_name, storage_key, mime_type, size_bytes, checksum_sha256) values ('30000000-0000-4000-8000-000000000001', 'novo.zip', 'private/pack-publicado/1.0/novo.zip', 'application/zip', 10, repeat('b', 64)) $$,
  '55000', null,
  'files cannot be appended to a locked commercialized version'
);
select throws_ok(
  $$ delete from public.product_files where id = '50000000-0000-4000-8000-000000000001' $$,
  '55000', null,
  'files cannot be removed from a locked commercialized version'
);
select throws_ok(
  $$ update public.product_files set product_version_id = '30000000-0000-4000-8000-000000000002' where id = '50000000-0000-4000-8000-000000000001' $$,
  '55000', null,
  'files cannot be moved out of a locked commercialized version'
);
select is(
  (select count(*)::integer from public.product_files where product_version_id = '30000000-0000-4000-8000-000000000001'),
  1,
  'locked version keeps its original private file set'
);

update public.product_prices
set locked_at = now()
where id = '60000000-0000-4000-8000-000000000001';

select isnt(
  (select locked_at from public.product_prices where id = '60000000-0000-4000-8000-000000000001'),
  null,
  'a trusted order workflow can lock a snapshotted price'
);
select throws_ok(
  $$ update public.product_prices set amount_cents = 1 where id = '60000000-0000-4000-8000-000000000001' $$,
  '55000', null,
  'locked snapshotted prices cannot be modified'
);
select throws_ok(
  $$ delete from public.product_prices where id = '60000000-0000-4000-8000-000000000001' $$,
  '55000', null,
  'locked snapshotted prices cannot be deleted'
);

select * from finish();
rollback;
