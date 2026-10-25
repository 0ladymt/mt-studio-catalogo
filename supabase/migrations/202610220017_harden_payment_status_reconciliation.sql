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
 effective_status:=case
  when old_status in('refunded','charged_back') then old_status
  when old_status='approved' and p_provider_status not in('refunded','charged_back') then old_status
  else p_provider_status
 end;
 update public.order_payments set status=effective_status,provider_status_detail=case when effective_status=p_provider_status then p_status_detail else provider_status_detail end where id=p.id;
 target_order_status:=case when effective_status='approved' then 'paid' when effective_status='expired' then 'expired' when effective_status in('rejected','cancelled') then 'failed' when effective_status in('refunded','charged_back') then 'refunded' else o.status end;
 if target_order_status<>o.status then update public.orders set status=target_order_status,paid_at=case when target_order_status='paid' then coalesce(paid_at,timezone('utc',now())) else paid_at end where id=o.id;end if;
 insert into public.payment_events(payment_id,event_type,from_status,to_status,provider_event_id,request_id,details) values(p.id,'provider_status_reconciled',old_status,effective_status,p_provider_event_id,p_request_id,jsonb_build_object('orderStatus',target_order_status,'reportedStatus',p_provider_status)) on conflict do nothing;
 return jsonb_build_object('paymentId',p.id,'paymentStatus',effective_status,'reportedStatus',p_provider_status,'orderId',o.id,'orderStatus',target_order_status);
end;$$;

revoke all on function public.commerce_reconcile_mercado_pago_payment(text,text,bigint,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_reconcile_mercado_pago_payment(text,text,bigint,text,text,text,uuid,text) to service_role;
