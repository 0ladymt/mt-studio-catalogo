begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'user-a@example.invalid', 'test-only', now(), '{}', '{"display_name":"Usuário A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'user-b@example.invalid', 'test-only', now(), '{}', '{"display_name":"Usuário B"}', now(), now());

select is(
  (select count(*)::integer from public.profiles where user_id in (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  )),
  2,
  'trigger creates one profile per auth user'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$ select user_id from public.profiles order by user_id $$,
  $$ values ('11111111-1111-4111-8111-111111111111'::uuid) $$,
  'user A reads only their own profile'
);

update public.profiles set display_name = 'Nome atualizado' where user_id = '11111111-1111-4111-8111-111111111111';
select is((select display_name from public.profiles), 'Nome atualizado', 'user A updates their editable field');

select throws_ok(
  $$ update public.profiles set status = 'disabled' where user_id = '11111111-1111-4111-8111-111111111111' $$,
  '42501',
  null,
  'authenticated users cannot update protected status'
);

select is(
  (select count(*)::integer from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'user A cannot read user B profile'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Tentativa cruzada' where user_id = '22222222-2222-4222-8222-222222222222' $$,
  'cross-user update is filtered without changing a row'
);

reset role;
select is(
  (select display_name from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'),
  'Usuário B',
  'user B data remains unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok(
  $$ insert into public.profiles (user_id, display_name) values ('33333333-3333-4333-8333-333333333333', 'Intruso') $$,
  '42501',
  null,
  'authenticated users cannot insert arbitrary profiles'
);
select throws_ok(
  $$ delete from public.profiles where user_id = '11111111-1111-4111-8111-111111111111' $$,
  '42501',
  null,
  'authenticated users cannot delete profiles'
);

set local role anon;
select throws_ok(
  $$ select count(*) from public.profiles $$,
  '42501',
  null,
  'anonymous users cannot read profiles'
);

reset role;
insert into public.profiles (user_id, display_name)
values ('11111111-1111-4111-8111-111111111111', 'Duplicado')
on conflict (user_id) do nothing;
select is(
  (select count(*)::integer from public.profiles where user_id in (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  )),
  2,
  'profile creation remains idempotent'
);

select * from finish();
rollback;
