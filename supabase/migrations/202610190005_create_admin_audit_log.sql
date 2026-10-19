create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_role text not null check (actor_role in ('owner', 'admin', 'catalog_manager', 'support')),
  action text not null check (
    char_length(action) between 3 and 100
    and action ~ '^[a-z][a-z0-9_.:-]+$'
  ),
  entity_type text not null check (
    char_length(entity_type) between 2 and 80
    and entity_type ~ '^[a-z][a-z0-9_.:-]+$'
  ),
  entity_id uuid,
  request_id uuid not null,
  outcome text not null check (outcome in ('succeeded', 'denied', 'failed')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  check (before_data is null or jsonb_typeof(before_data) = 'object'),
  check (after_data is null or jsonb_typeof(after_data) = 'object'),
  check (before_data is null or octet_length(before_data::text) <= 65536),
  check (after_data is null or octet_length(after_data::text) <= 65536)
);

create index admin_audit_log_actor_created_idx
  on public.admin_audit_log (actor_user_id, created_at desc);
create index admin_audit_log_entity_created_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);
create index admin_audit_log_request_idx
  on public.admin_audit_log (request_id);

create function public.prevent_admin_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'administrative audit records are append-only' using errcode = '55000';
end;
$$;

create trigger admin_audit_log_append_only
before update or delete on public.admin_audit_log
for each row execute function public.prevent_admin_audit_mutation();

alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;

revoke all on table public.admin_audit_log from anon, authenticated;
revoke all on table public.admin_audit_log from service_role;
grant select, insert on table public.admin_audit_log to service_role;

revoke all on function public.prevent_admin_audit_mutation() from public;

comment on table public.admin_audit_log is
  'Append-only server audit trail. Payloads must be sanitized and must never contain credentials, tokens, OTPs or complete private storage keys.';
comment on column public.admin_audit_log.actor_user_id is
  'Historical authenticated UUID. Deliberately not a foreign key so account removal cannot erase or block preservation of the audit trail.';
