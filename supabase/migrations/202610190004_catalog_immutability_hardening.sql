create or replace function public.protect_locked_product_file()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from public.product_versions
    where id = old.product_version_id and locked_at is not null
  ) then
    raise exception 'files of commercialized product versions are immutable' using errcode = '55000';
  end if;

  if tg_op in ('INSERT', 'UPDATE') and exists (
    select 1 from public.product_versions
    where id = new.product_version_id and locked_at is not null
  ) then
    raise exception 'files of commercialized product versions are immutable' using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function public.protect_locked_product_price()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.locked_at is not null then
    raise exception 'locked product prices are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger product_prices_protect_locked
before update or delete on public.product_prices
for each row execute function public.protect_locked_product_price();

revoke all on function public.protect_locked_product_price() from public;

comment on column public.product_prices.locked_at is
  'Set by the trusted order workflow when a price is first snapshotted; locked price history becomes immutable.';
