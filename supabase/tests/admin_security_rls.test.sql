begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'staff-test@example.invalid', 'test-only', now(), '{}', '{"role":"owner"}', now(), now());

set local role anon;

select throws_ok(
  $$ select count(*) from public.admin_audit_log $$,
  '42501', null,
  'anonymous visitors cannot read administrative audit records'
);
select throws_ok(
  $$ insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, request_id, outcome) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'owner', 'catalog.read', 'product', gen_random_uuid(), 'succeeded') $$,
  '42501', null,
  'anonymous visitors cannot create administrative audit records'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select count(*) from public.admin_audit_log $$,
  '42501', null,
  'authenticated customers cannot read administrative audit records'
);
select throws_ok(
  $$ insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, request_id, outcome) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'owner', 'catalog.write', 'product', gen_random_uuid(), 'succeeded') $$,
  '42501', null,
  'authenticated customers cannot forge administrative audit records'
);
select throws_ok(
  $$ insert into public.staff_members (user_id, role) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'owner') $$,
  '42501', null,
  'editable authentication metadata cannot grant staff membership'
);

reset role;
set local role service_role;

insert into public.admin_audit_log (
  id, actor_user_id, actor_role, action, entity_type, entity_id, request_id, outcome,
  before_data, after_data
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'catalog_manager',
  'catalog.draft_created',
  'product',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'succeeded',
  null,
  '{"status":"draft"}'
);

select is(
  (select count(*)::integer from public.admin_audit_log where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  1,
  'the trusted server role can append a sanitized audit record'
);
select throws_ok(
  $$ update public.admin_audit_log set outcome = 'failed' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '42501', null,
  'the trusted server role has no permission to update administrative audit records'
);
select throws_ok(
  $$ delete from public.admin_audit_log where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '42501', null,
  'the trusted server role has no permission to delete administrative audit records'
);
select throws_ok(
  $$ insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, request_id, outcome, after_data) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'owner', 'catalog.write', 'product', gen_random_uuid(), 'succeeded', '[]') $$,
  '23514', null,
  'audit snapshots must be JSON objects'
);
select throws_ok(
  $$ insert into public.admin_audit_log (actor_user_id, actor_role, action, entity_type, request_id, outcome, after_data) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'owner', 'catalog.write', 'product', gen_random_uuid(), 'succeeded', jsonb_build_object('payload', repeat('x', 70000))) $$,
  '23514', null,
  'audit snapshots reject oversized payloads'
);

reset role;

select throws_ok(
  $$ update public.admin_audit_log set outcome = 'failed' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '55000', null,
  'the append-only trigger rejects updates even from a database owner'
);
select throws_ok(
  $$ delete from public.admin_audit_log where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '55000', null,
  'the append-only trigger rejects deletes even from a database owner'
);

select * from finish();
rollback;
