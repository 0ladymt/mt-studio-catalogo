create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 120),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text not null check (char_length(btrim(description)) between 1 and 5000),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'archived')),
  featured boolean not null default false,
  current_version_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (status <> 'published' or current_version_id is not null),
  check (status <> 'published' or published_at is not null)
);

create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  version_label text not null check (char_length(btrim(version_label)) between 1 and 40),
  release_sequence integer not null check (release_sequence > 0),
  release_notes text check (release_notes is null or char_length(release_notes) <= 5000),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  available_from timestamptz,
  available_until timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (product_id, version_label),
  unique (product_id, release_sequence),
  unique (product_id, id),
  check (available_until is null or available_from is null or available_until > available_from),
  check (status <> 'published' or available_from is not null)
);

alter table public.products
  add constraint products_current_version_same_product_fk
  foreign key (id, current_version_id)
  references public.product_versions (product_id, id)
  on delete restrict
  deferrable initially deferred;

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  media_type text not null default 'gallery' check (media_type in ('cover', 'gallery')),
  storage_key text not null check (
    char_length(storage_key) between 1 and 500
    and storage_key !~ '(^/|\.\.)'
  ),
  alt_text text not null check (char_length(btrim(alt_text)) between 1 and 240),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (product_id, storage_key)
);

create unique index product_media_one_active_cover_idx
  on public.product_media (product_id)
  where media_type = 'cover' and status = 'active';

create table public.product_files (
  id uuid primary key default gen_random_uuid(),
  product_version_id uuid not null references public.product_versions (id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 240),
  storage_key text not null unique check (
    char_length(storage_key) between 1 and 700
    and storage_key !~ '(^/|\.\.)'
  ),
  mime_type text not null check (char_length(btrim(mime_type)) between 3 and 150),
  size_bytes bigint not null check (size_bytes > 0),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (product_version_id, display_name)
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_version_id uuid not null references public.product_versions (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 999999999999),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'retired')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (valid_until is null or valid_until > valid_from)
);

create unique index product_prices_one_active_idx
  on public.product_prices (product_version_id)
  where status = 'active';

create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete restrict,
  role text not null check (role in ('owner', 'admin', 'catalog_manager', 'support')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (created_by is null or created_by <> user_id)
);

create index products_category_status_idx on public.products (category_id, status);
create index products_status_featured_idx on public.products (status, featured);
create index product_versions_product_status_idx on public.product_versions (product_id, status, release_sequence desc);
create index product_media_product_status_idx on public.product_media (product_id, status, sort_order);
create index product_files_version_status_idx on public.product_files (product_version_id, status, sort_order);
create index product_prices_version_status_idx on public.product_prices (product_version_id, status, valid_from desc);
create index staff_members_role_status_idx on public.staff_members (role, status);

create function public.validate_product_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'published' and not exists (
    select 1
    from public.product_versions as version
    where version.id = new.current_version_id
      and version.product_id = new.id
      and version.status = 'published'
  ) then
    raise exception 'published product requires its own published current version' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.protect_locked_product_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.locked_at is not null then
    raise exception 'commercialized product versions are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function public.protect_locked_product_file()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_version_id uuid := case when tg_op = 'DELETE' then old.product_version_id else new.product_version_id end;
begin
  if exists (
    select 1 from public.product_versions
    where id = target_version_id and locked_at is not null
  ) then
    raise exception 'files of commercialized product versions are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger products_validate_publication
before insert or update of status, current_version_id on public.products
for each row execute function public.validate_product_publication();

create trigger product_versions_protect_locked
before update or delete on public.product_versions
for each row execute function public.protect_locked_product_version();

create trigger product_files_protect_locked
before insert or update or delete on public.product_files
for each row execute function public.protect_locked_product_file();

create trigger product_categories_set_updated_at before update on public.product_categories
for each row execute function public.set_profile_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_profile_updated_at();
create trigger product_versions_set_updated_at before update on public.product_versions
for each row execute function public.set_profile_updated_at();
create trigger product_media_set_updated_at before update on public.product_media
for each row execute function public.set_profile_updated_at();
create trigger product_files_set_updated_at before update on public.product_files
for each row execute function public.set_profile_updated_at();
create trigger product_prices_set_updated_at before update on public.product_prices
for each row execute function public.set_profile_updated_at();
create trigger staff_members_set_updated_at before update on public.staff_members
for each row execute function public.set_profile_updated_at();

alter table public.product_categories enable row level security;
alter table public.product_categories force row level security;
alter table public.products enable row level security;
alter table public.products force row level security;
alter table public.product_versions enable row level security;
alter table public.product_versions force row level security;
alter table public.product_media enable row level security;
alter table public.product_media force row level security;
alter table public.product_files enable row level security;
alter table public.product_files force row level security;
alter table public.product_prices enable row level security;
alter table public.product_prices force row level security;
alter table public.staff_members enable row level security;
alter table public.staff_members force row level security;

revoke all on table public.product_categories, public.products, public.product_versions,
  public.product_media, public.product_files, public.product_prices, public.staff_members
  from anon, authenticated;

grant select on table public.product_categories, public.products, public.product_versions,
  public.product_media, public.product_prices
  to anon, authenticated;

create policy "Public reads active product categories"
  on public.product_categories for select to anon, authenticated
  using (status = 'active');

create policy "Public reads published products"
  on public.products for select to anon, authenticated
  using (status = 'published' and current_version_id is not null);

create policy "Public reads current published product versions"
  on public.product_versions for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.products as product
      where product.id = product_versions.product_id
        and product.status = 'published'
        and product.current_version_id = product_versions.id
    )
  );

create policy "Public reads active media of published products"
  on public.product_media for select to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1 from public.products as product
      where product.id = product_media.product_id
        and product.status = 'published'
    )
  );

create policy "Public reads active current prices"
  on public.product_prices for select to anon, authenticated
  using (
    status = 'active'
    and valid_from <= timezone('utc', now())
    and (valid_until is null or valid_until > timezone('utc', now()))
    and exists (
      select 1
      from public.product_versions as version
      join public.products as product on product.id = version.product_id
      where version.id = product_prices.product_version_id
        and version.status = 'published'
        and product.status = 'published'
        and product.current_version_id = version.id
    )
  );

revoke all on function public.validate_product_publication() from public;
revoke all on function public.protect_locked_product_version() from public;
revoke all on function public.protect_locked_product_file() from public;

comment on table public.product_files is
  'Private metadata for commercial files. No direct anon or authenticated access is granted.';
comment on table public.staff_members is
  'Server-authorized staff roles. Membership cannot be granted from editable Auth metadata.';
comment on column public.product_versions.locked_at is
  'Set by the trusted order workflow when a version is first commercialized; locked versions and their files become immutable.';
