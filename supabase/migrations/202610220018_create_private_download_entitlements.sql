create table public.download_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  order_item_file_id uuid not null unique references public.order_item_files(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  product_file_id uuid not null references public.product_files(id) on delete restrict,
  display_name_snapshot text not null,
  storage_key_snapshot text not null,
  size_bytes_snapshot bigint not null check(size_bytes_snapshot>0),
  checksum_sha256_snapshot text not null check(checksum_sha256_snapshot ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check(status in('active','suspended')),
  granted_at timestamptz not null default timezone('utc',now()),
  suspended_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  check((status='active' and suspended_at is null) or (status='suspended' and suspended_at is not null)),
  unique(id,order_id), unique(id,user_id)
);
create index download_entitlements_user_order_idx on public.download_entitlements(user_id,order_id);

create table public.download_events (
  id bigint generated always as identity primary key,
  entitlement_id uuid not null references public.download_entitlements(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check(event_type in('entitlement_granted','entitlement_suspended','download_requested')),
  request_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  unique(entitlement_id,event_type,request_id)
);
create index download_events_entitlement_idx on public.download_events(entitlement_id,created_at desc);
create function public.reject_download_entitlement_mutation() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'download entitlement is immutable' using errcode='55000';end if;
 if new.user_id<>old.user_id or new.order_id<>old.order_id or new.order_item_id<>old.order_item_id or new.order_item_file_id<>old.order_item_file_id or new.product_id<>old.product_id or new.product_version_id<>old.product_version_id or new.product_file_id<>old.product_file_id or new.display_name_snapshot<>old.display_name_snapshot or new.storage_key_snapshot<>old.storage_key_snapshot or new.size_bytes_snapshot<>old.size_bytes_snapshot or new.checksum_sha256_snapshot<>old.checksum_sha256_snapshot or new.granted_at<>old.granted_at or new.created_at<>old.created_at then raise exception 'download entitlement snapshot is immutable' using errcode='55000';end if;
 if old.status='suspended' and new.status<>'suspended' then raise exception 'suspended entitlement cannot be reactivated' using errcode='55000';end if;
 return new;
end;$$;
create trigger download_entitlements_immutable before update or delete on public.download_entitlements for each row execute function public.reject_download_entitlement_mutation();
create trigger download_events_append_only before update or delete on public.download_events for each row execute function public.reject_order_snapshot_mutation();

alter table public.download_entitlements enable row level security;
alter table public.download_entitlements force row level security;
alter table public.download_events enable row level security;
alter table public.download_events force row level security;
revoke all on public.download_entitlements,public.download_events from anon,authenticated;
grant select on public.download_entitlements,public.download_events to authenticated;
create policy download_entitlements_owner_read on public.download_entitlements for select to authenticated using (user_id = auth.uid());
create policy download_events_owner_read on public.download_events for select to authenticated using (user_id = auth.uid());

create function public.commerce_sync_download_entitlements(p_order_id uuid,p_payment_id uuid,p_request_id uuid,p_provider_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_provider_status='approved' then
  with granted as (
   insert into public.download_entitlements(user_id,order_id,order_item_id,order_item_file_id,product_id,product_version_id,product_file_id,display_name_snapshot,storage_key_snapshot,size_bytes_snapshot,checksum_sha256_snapshot)
   select o.user_id,o.id,i.id,f.id,i.product_id,i.product_version_id,f.product_file_id,f.display_name_snapshot,f.storage_key_snapshot,f.size_bytes_snapshot,f.checksum_sha256_snapshot
   from public.orders o join public.order_items i on i.order_id=o.id join public.order_item_files f on f.order_item_id=i.id
   where o.id=p_order_id and o.status='paid'
   on conflict(order_item_file_id) do nothing returning id,order_id,user_id
  )
  insert into public.download_events(entitlement_id,order_id,user_id,event_type,request_id,details)
  select id,order_id,user_id,'entitlement_granted',p_request_id,jsonb_build_object('paymentId',p_payment_id) from granted;
 elsif p_provider_status in('refunded','charged_back') then
  with suspended as (
   update public.download_entitlements set status='suspended',suspended_at=timezone('utc',now()) where order_id=p_order_id and status='active' returning id,order_id,user_id
  )
  insert into public.download_events(entitlement_id,order_id,user_id,event_type,request_id,details)
  select id,order_id,user_id,'entitlement_suspended',p_request_id,jsonb_build_object('paymentId',p_payment_id,'providerStatus',p_provider_status) from suspended;
 end if;
end;$$;

create or replace function public.commerce_reconcile_mercado_pago_payment(p_provider_payment_id text,p_external_reference text,p_amount_cents bigint,p_currency text,p_provider_status text,p_status_detail text,p_request_id uuid,p_provider_event_id text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.order_payments;o public.orders;old_status text;effective_status text;target_order_status text;
begin
 select * into p from public.order_payments where provider_payment_id=p_provider_payment_id for update;
 if p.id is null then raise exception 'payment unavailable' using errcode='P0002';end if;
 select * into o from public.orders where id=p.order_id for update;
 if p.external_reference<>p_external_reference or p.amount_cents<>p_amount_cents or p.currency<>p_currency or p_external_reference<>'mt-site:'||o.id::text then raise exception 'payment identity mismatch' using errcode='55000';end if;
 old_status:=p.status;
 if p_provider_status not in('pending','in_process','approved','rejected','cancelled','expired','refunded','charged_back') then raise exception 'unsupported provider status' using errcode='23514';end if;
 effective_status:=case when old_status in('refunded','charged_back') then old_status when old_status='approved' and p_provider_status not in('refunded','charged_back') then old_status else p_provider_status end;
 update public.order_payments set status=effective_status,provider_status_detail=case when effective_status=p_provider_status then p_status_detail else provider_status_detail end where id=p.id;
 target_order_status:=case when effective_status='approved' then 'paid' when effective_status='expired' then 'expired' when effective_status in('rejected','cancelled') then 'failed' when effective_status in('refunded','charged_back') then 'refunded' else o.status end;
 if target_order_status<>o.status then update public.orders set status=target_order_status,paid_at=case when target_order_status='paid' then coalesce(paid_at,timezone('utc',now())) else paid_at end where id=o.id;end if;
 perform public.commerce_sync_download_entitlements(o.id,p.id,p_request_id,effective_status);
 insert into public.payment_events(payment_id,event_type,from_status,to_status,provider_event_id,request_id,details) values(p.id,'provider_status_reconciled',old_status,effective_status,p_provider_event_id,p_request_id,jsonb_build_object('orderStatus',target_order_status,'reportedStatus',p_provider_status)) on conflict do nothing;
 return jsonb_build_object('paymentId',p.id,'paymentStatus',effective_status,'reportedStatus',p_provider_status,'orderId',o.id,'orderStatus',target_order_status);
end;$$;

create function public.commerce_list_order_history(p_user_id uuid) returns jsonb language sql security definer set search_path='' stable as $$
select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'totalCents',o.total_cents,'currency',o.currency,'createdAt',o.created_at,'paidAt',o.paid_at,'downloadEligible',o.status='paid' and exists(select 1 from public.download_entitlements e where e.order_id=o.id and e.status='active'),'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.product_name_snapshot,'versionLabel',i.version_label_snapshot,'productVersionId',i.product_version_id,'unitPriceCents',i.unit_price_cents,'downloads',coalesce((select jsonb_agg(jsonb_build_object('entitlementId',e.id,'orderItemId',e.order_item_id,'productVersionId',e.product_version_id,'productFileId',e.product_file_id,'displayName',e.display_name_snapshot,'sizeBytes',e.size_bytes_snapshot,'status',e.status) order by e.display_name_snapshot) from public.download_entitlements e where e.order_item_id=i.id),'[]'::jsonb)) order by i.created_at) from public.order_items i where i.order_id=o.id),'[]'::jsonb)) order by o.created_at desc),'[]'::jsonb)
from public.orders o where o.user_id=p_user_id;
$$;

create function public.commerce_authorize_download(p_user_id uuid,p_order_id uuid,p_entitlement_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.download_entitlements;o public.orders;i public.order_items;f public.order_item_files;
begin
 perform public.commerce_assert_customer(p_user_id);
 select * into e from public.download_entitlements where id=p_entitlement_id and order_id=p_order_id and user_id=p_user_id for update;
 if e.id is null then raise exception 'download unavailable' using errcode='P0002';end if;
 select * into o from public.orders where id=e.order_id and user_id=p_user_id for share;
 if o.status<>'paid' or e.status<>'active' then raise exception 'download ineligible' using errcode='55000';end if;
 select * into i from public.order_items where id=e.order_item_id and order_id=o.id;
 select * into f from public.order_item_files where id=e.order_item_file_id and order_item_id=i.id;
 if i.id is null or f.id is null or i.product_version_id<>e.product_version_id or f.product_file_id<>e.product_file_id or f.storage_key_snapshot<>e.storage_key_snapshot or f.checksum_sha256_snapshot<>e.checksum_sha256_snapshot then raise exception 'download snapshot mismatch' using errcode='55000';end if;
 insert into public.download_events(entitlement_id,order_id,user_id,event_type,request_id,details) values(e.id,o.id,p_user_id,'download_requested',p_request_id,jsonb_build_object('productVersionId',e.product_version_id,'productFileId',e.product_file_id)) on conflict do nothing;
 return jsonb_build_object('entitlementId',e.id,'orderId',o.id,'displayName',e.display_name_snapshot,'storageKey',e.storage_key_snapshot,'sizeBytes',e.size_bytes_snapshot,'checksumSha256',e.checksum_sha256_snapshot);
end;$$;

insert into public.download_entitlements(user_id,order_id,order_item_id,order_item_file_id,product_id,product_version_id,product_file_id,display_name_snapshot,storage_key_snapshot,size_bytes_snapshot,checksum_sha256_snapshot)
select o.user_id,o.id,i.id,f.id,i.product_id,i.product_version_id,f.product_file_id,f.display_name_snapshot,f.storage_key_snapshot,f.size_bytes_snapshot,f.checksum_sha256_snapshot from public.orders o join public.order_items i on i.order_id=o.id join public.order_item_files f on f.order_item_id=i.id where o.status='paid' on conflict(order_item_file_id) do nothing;
insert into public.download_events(entitlement_id,order_id,user_id,event_type,request_id,details)
select e.id,e.order_id,e.user_id,'entitlement_granted',e.id,jsonb_build_object('source','migration_backfill') from public.download_entitlements e where not exists(select 1 from public.download_events d where d.entitlement_id=e.id and d.event_type='entitlement_granted');

revoke all on function public.commerce_sync_download_entitlements(uuid,uuid,uuid,text),public.commerce_reconcile_mercado_pago_payment(text,text,bigint,text,text,text,uuid,text),public.commerce_list_order_history(uuid),public.commerce_authorize_download(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.commerce_sync_download_entitlements(uuid,uuid,uuid,text),public.commerce_reconcile_mercado_pago_payment(text,text,bigint,text,text,text,uuid,text),public.commerce_list_order_history(uuid),public.commerce_authorize_download(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.reject_download_entitlement_mutation() from public,anon,authenticated;

comment on table public.download_entitlements is 'Permanent record of the exact purchased version and files. Eligibility is suspended, never deleted, after refund or chargeback.';
