create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null default 'mercado_pago' check(provider='mercado_pago'),
  method text not null default 'pix' check(method='pix'),
  idempotency_key uuid not null,
  external_reference text not null unique check(external_reference ~ '^mt-site:[0-9a-f-]{36}$'),
  provider_payment_id text unique,
  status text not null default 'creating' check(status in ('creating','pending','in_process','approved','rejected','cancelled','expired','refunded','charged_back','failed')),
  amount_cents bigint not null check(amount_cents>0),
  currency text not null default 'BRL' check(currency='BRL'),
  qr_code text,
  qr_code_base64 text,
  ticket_url text,
  expires_at timestamptz not null,
  provider_status_detail text,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(order_id,idempotency_key)
);
alter table public.orders drop constraint orders_check1;
alter table public.orders add constraint orders_paid_timestamp_consistent check ((status in ('paid','refunded')) = (paid_at is not null));
create unique index one_open_pix_payment_per_order on public.order_payments(order_id)
where status in ('creating','pending','in_process');

create table public.payment_events (
 id bigint generated always as identity primary key,
 payment_id uuid not null references public.order_payments(id) on delete restrict,
 event_type text not null check(event_type in ('payment_created','provider_status_reconciled','webhook_processed')),
 from_status text,
 to_status text not null,
 provider_event_id text,
 request_id uuid not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default timezone('utc',now()),
 unique(payment_id,event_type,request_id)
);
create table public.payment_webhook_receipts (
 id uuid primary key default gen_random_uuid(),
 provider text not null default 'mercado_pago' check(provider='mercado_pago'),
 provider_event_id text not null,
 provider_payment_id text not null,
 request_id text not null,
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 signature_valid boolean not null,
 status text not null check(status in ('received','processed','rejected','failed')),
 failure_code text,
 received_at timestamptz not null default timezone('utc',now()),
 processed_at timestamptz,
 unique(provider,provider_event_id,provider_payment_id)
);
create index order_payments_order_idx on public.order_payments(order_id,created_at desc);
create index payment_events_payment_idx on public.payment_events(payment_id,created_at);

create trigger order_payments_set_updated_at before update on public.order_payments for each row execute function public.set_profile_updated_at();
create trigger payment_events_append_only before update or delete on public.payment_events for each row execute function public.reject_order_snapshot_mutation();
create trigger payment_webhook_receipts_append_only before update or delete on public.payment_webhook_receipts for each row execute function public.reject_order_snapshot_mutation();

alter table public.order_payments enable row level security; alter table public.order_payments force row level security;
alter table public.payment_events enable row level security; alter table public.payment_events force row level security;
alter table public.payment_webhook_receipts enable row level security; alter table public.payment_webhook_receipts force row level security;
revoke all on public.order_payments,public.payment_events,public.payment_webhook_receipts from anon,authenticated;
grant select on public.order_payments,public.payment_events to authenticated;
create policy "Customers read own payments" on public.order_payments for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid())));
create policy "Customers read own payment events" on public.payment_events for select to authenticated using(exists(select 1 from public.order_payments p join public.orders o on o.id=p.order_id where p.id=payment_id and o.user_id=(select auth.uid())));

create function public.commerce_prepare_pix_payment(p_user_id uuid,p_order_id uuid,p_request_id uuid,p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders;p public.order_payments;
begin
 perform public.commerce_assert_customer(p_user_id);
 perform pg_advisory_xact_lock(hashtextextended(p_order_id::text,0));
 select * into o from public.orders where id=p_order_id and user_id=p_user_id for update;
 if o.id is null then raise exception 'order unavailable' using errcode='P0002';end if;
 if o.status<>'pending_payment' then raise exception 'order not payable' using errcode='55000';end if;
 select * into p from public.order_payments where order_id=o.id and idempotency_key=p_request_id;
 if p.id is not null then return to_jsonb(p);end if;
 if exists(select 1 from public.order_payments x where x.order_id=o.id and x.status in('creating','pending','in_process')) then raise exception 'payment already active' using errcode='23505';end if;
 insert into public.order_payments(order_id,idempotency_key,external_reference,amount_cents,expires_at) values(o.id,p_request_id,'mt-site:'||o.id::text,o.total_cents,p_expires_at) returning * into p;
 insert into public.payment_events(payment_id,event_type,to_status,request_id) values(p.id,'payment_created','creating',p_request_id);
 return to_jsonb(p);
end;$$;

create function public.commerce_record_pix_charge(p_payment_id uuid,p_provider_payment_id text,p_status text,p_qr_code text,p_qr_code_base64 text,p_ticket_url text,p_status_detail text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.order_payments;
begin
 select * into p from public.order_payments where id=p_payment_id for update;
 if p.id is null then raise exception 'payment unavailable' using errcode='P0002';end if;
 if p.provider_payment_id is not null and p.provider_payment_id<>p_provider_payment_id then raise exception 'provider mismatch' using errcode='55000';end if;
 update public.order_payments set provider_payment_id=p_provider_payment_id,status=p_status,qr_code=p_qr_code,qr_code_base64=p_qr_code_base64,ticket_url=p_ticket_url,provider_status_detail=p_status_detail where id=p.id returning * into p;
 return to_jsonb(p);
end;$$;

create function public.commerce_reconcile_mercado_pago_payment(p_provider_payment_id text,p_external_reference text,p_amount_cents bigint,p_currency text,p_provider_status text,p_status_detail text,p_request_id uuid,p_provider_event_id text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.order_payments;o public.orders;old_status text;target_order_status text;
begin
 select * into p from public.order_payments where provider_payment_id=p_provider_payment_id for update;
 if p.id is null then raise exception 'payment unavailable' using errcode='P0002';end if;
 select * into o from public.orders where id=p.order_id for update;
 if p.external_reference<>p_external_reference or p.amount_cents<>p_amount_cents or p.currency<>p_currency or p_external_reference<>'mt-site:'||o.id::text then raise exception 'payment identity mismatch' using errcode='55000';end if;
 old_status:=p.status;
 if p_provider_status not in('pending','in_process','approved','rejected','cancelled','expired','refunded','charged_back') then raise exception 'unsupported provider status' using errcode='23514';end if;
 update public.order_payments set status=p_provider_status,provider_status_detail=p_status_detail where id=p.id;
 target_order_status:=case when p_provider_status='approved' then 'paid' when p_provider_status='expired' then 'expired' when p_provider_status in('rejected','cancelled') then 'failed' when p_provider_status in('refunded','charged_back') then 'refunded' else o.status end;
 if target_order_status<>o.status then update public.orders set status=target_order_status,paid_at=case when target_order_status='paid' then coalesce(paid_at,timezone('utc',now())) else paid_at end where id=o.id;end if;
 insert into public.payment_events(payment_id,event_type,from_status,to_status,provider_event_id,request_id,details) values(p.id,'provider_status_reconciled',old_status,p_provider_status,p_provider_event_id,p_request_id,jsonb_build_object('orderStatus',target_order_status)) on conflict do nothing;
 return jsonb_build_object('paymentId',p.id,'paymentStatus',p_provider_status,'orderId',o.id,'orderStatus',target_order_status);
end;$$;

create function public.commerce_get_order_payment(p_user_id uuid,p_order_id uuid) returns jsonb language sql security definer set search_path='' stable as $$
select jsonb_build_object('id',p.id,'orderId',p.order_id,'status',p.status,'amountCents',p.amount_cents,'currency',p.currency,'qrCode',p.qr_code,'qrCodeBase64',p.qr_code_base64,'ticketUrl',p.ticket_url,'expiresAt',p.expires_at)
from public.order_payments p join public.orders o on o.id=p.order_id where o.user_id=p_user_id and o.id=p_order_id order by p.created_at desc limit 1;$$;

create function public.commerce_process_mercado_pago_webhook(p_provider_event_id text,p_provider_payment_id text,p_webhook_request_id text,p_payload_sha256 text,p_external_reference text,p_amount_cents bigint,p_currency text,p_provider_status text,p_status_detail text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior public.payment_webhook_receipts;result jsonb;payment_uuid uuid;
begin
 select * into prior from public.payment_webhook_receipts where provider='mercado_pago' and provider_event_id=p_provider_event_id and provider_payment_id=p_provider_payment_id;
 if prior.id is not null then return jsonb_build_object('duplicate',true,'status',prior.status);end if;
 result:=public.commerce_reconcile_mercado_pago_payment(p_provider_payment_id,p_external_reference,p_amount_cents,p_currency,p_provider_status,p_status_detail,p_request_id,p_provider_event_id);
 payment_uuid:=(result->>'paymentId')::uuid;
 insert into public.payment_webhook_receipts(provider_event_id,provider_payment_id,request_id,payload_sha256,signature_valid,status,processed_at) values(p_provider_event_id,p_provider_payment_id,p_webhook_request_id,p_payload_sha256,true,'processed',timezone('utc',now()));
 insert into public.payment_events(payment_id,event_type,from_status,to_status,provider_event_id,request_id,details) values(payment_uuid,'webhook_processed',p_provider_status,p_provider_status,p_provider_event_id,p_request_id,jsonb_build_object('receipt','processed')) on conflict do nothing;
 return result||jsonb_build_object('duplicate',false);
end;$$;

revoke all on function public.commerce_prepare_pix_payment(uuid,uuid,uuid,timestamptz),public.commerce_record_pix_charge(uuid,text,text,text,text,text,text),public.commerce_reconcile_mercado_pago_payment(text,text,bigint,text,text,text,uuid,text),public.commerce_get_order_payment(uuid,uuid),public.commerce_process_mercado_pago_webhook(text,text,text,text,text,bigint,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.commerce_prepare_pix_payment(uuid,uuid,uuid,timestamptz),public.commerce_record_pix_charge(uuid,text,text,text,text,text,text),public.commerce_reconcile_mercado_pago_payment(text,text,bigint,text,text,text,uuid,text),public.commerce_get_order_payment(uuid,uuid),public.commerce_process_mercado_pago_webhook(text,text,text,text,text,bigint,text,text,text,uuid) to service_role;
