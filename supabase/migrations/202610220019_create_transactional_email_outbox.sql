create table public.transactional_email_outbox (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique,
 order_id uuid not null references public.orders(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 recipient_email text not null,
 template text not null check (template in ('payment_confirmed')),
 payload jsonb not null,
 status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
 attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
 available_at timestamptz not null default timezone('utc',now()),
 locked_at timestamptz,
 last_error text,
 sent_at timestamptz,
 created_at timestamptz not null default timezone('utc',now())
);
create index transactional_email_outbox_ready_idx on public.transactional_email_outbox(status,available_at);
alter table public.transactional_email_outbox enable row level security;
alter table public.transactional_email_outbox force row level security;
revoke all on public.transactional_email_outbox from anon,authenticated;

create or replace function public.commerce_enqueue_payment_email(p_order_id uuid,p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders; recipient text; payload jsonb;
begin
 select * into o from public.orders where id=p_order_id and status='paid';
 if o.id is null then return; end if;
 select email into recipient from auth.users where id=o.user_id;
 payload:=jsonb_build_object('orderId',o.id,'orderNumber',o.id::text,'totalCents',o.total_cents,'currency',o.currency,'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name_snapshot,'version',i.version_label_snapshot,'quantity',i.quantity,'totalCents',i.line_total_cents) order by i.created_at) from public.order_items i where i.order_id=o.id),'[]'::jsonb),'orderPath','/#conta');
 insert into public.transactional_email_outbox(event_key,order_id,user_id,recipient_email,template,payload)
 values('payment-confirmed:'||o.id::text,o.id,o.user_id,recipient,'payment_confirmed',payload)
 on conflict(event_key) do nothing;
end;$$;

create or replace function public.commerce_claim_email_job(p_worker_id text) returns setof public.transactional_email_outbox
language plpgsql security definer set search_path='' as $$
begin
 return query update public.transactional_email_outbox e set status='processing',attempts=e.attempts+1,locked_at=timezone('utc',now()) where e.id=(select id from public.transactional_email_outbox where status in ('pending','failed') and attempts<5 and available_at<=timezone('utc',now()) order by created_at for update skip locked limit 1) returning e.*;
end;$$;

create or replace function public.commerce_complete_email_job(p_id uuid,p_worker_id text,p_success boolean,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_success then update public.transactional_email_outbox set status='sent',sent_at=timezone('utc',now()),locked_at=null,last_error=null where id=p_id and status='processing';
 else update public.transactional_email_outbox set status=case when attempts>=5 then 'failed' else 'pending' end,available_at=timezone('utc',now())+make_interval(secs=>least(3600,30*power(2,attempts))),locked_at=null,last_error=left(coalesce(p_error,'delivery_failed'),500) where id=p_id and status='processing'; end if;
end;$$;

create or replace function public.commerce_reconcile_mercado_pago_payment(p_provider_payment_id text,p_external_reference text,p_amount_cents bigint,p_currency text,p_provider_status text,p_status_detail text,p_request_id uuid,p_provider_event_id text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.order_payments;o public.orders;old_status text;effective_status text;target_order_status text;
begin
 select * into p from public.order_payments where provider_payment_id=p_provider_payment_id for update; if p.id is null then raise exception 'payment unavailable' using errcode='P0002';end if;
 select * into o from public.orders where id=p.order_id for update; if p.external_reference<>p_external_reference or p.amount_cents<>p_amount_cents or p.currency<>p_currency or p_external_reference<>'mt-site:'||o.id::text then raise exception 'payment identity mismatch' using errcode='55000';end if;
 old_status:=p.status; if p_provider_status not in('pending','in_process','approved','rejected','cancelled','expired','refunded','charged_back') then raise exception 'unsupported provider status' using errcode='23514';end if;
 effective_status:=case when old_status in('refunded','charged_back') then old_status when old_status='approved' and p_provider_status not in('refunded','charged_back') then old_status else p_provider_status end;
 update public.order_payments set status=effective_status,provider_status_detail=case when effective_status=p_provider_status then p_status_detail else provider_status_detail end where id=p.id;
 target_order_status:=case when effective_status='approved' then 'paid' when effective_status='expired' then 'expired' when effective_status in('rejected','cancelled') then 'failed' when effective_status in('refunded','charged_back') then 'refunded' else o.status end;
 if target_order_status<>o.status then update public.orders set status=target_order_status,paid_at=case when target_order_status='paid' then coalesce(paid_at,timezone('utc',now())) else paid_at end where id=o.id;end if;
 perform public.commerce_sync_download_entitlements(o.id,p.id,p_request_id,effective_status);
 if effective_status='approved' then perform public.commerce_enqueue_payment_email(o.id,p_request_id); end if;
 insert into public.payment_events(payment_id,event_type,from_status,to_status,provider_event_id,request_id,details) values(p.id,'provider_status_reconciled',old_status,effective_status,p_provider_event_id,p_request_id,jsonb_build_object('orderStatus',target_order_status,'reportedStatus',p_provider_status)) on conflict do nothing;
 return jsonb_build_object('paymentId',p.id,'paymentStatus',effective_status,'reportedStatus',p_provider_status,'orderId',o.id,'orderStatus',target_order_status);
end;$$;

revoke all on function public.commerce_enqueue_payment_email(uuid,uuid),public.commerce_claim_email_job(text),public.commerce_complete_email_job(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.commerce_enqueue_payment_email(uuid,uuid),public.commerce_claim_email_job(text),public.commerce_complete_email_job(uuid,text,boolean,text) to service_role;
