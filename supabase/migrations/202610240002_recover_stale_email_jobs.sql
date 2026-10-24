alter table public.transactional_email_outbox
  add column if not exists locked_by text;

create or replace function public.commerce_claim_email_job(p_worker_id text)
returns setof public.transactional_email_outbox
language plpgsql security definer set search_path=''
as $$
begin
  return query
  update public.transactional_email_outbox e
  set status='processing', attempts=e.attempts+1,
      locked_at=timezone('utc',now()), locked_by=p_worker_id
  where e.id=(
    select id from public.transactional_email_outbox
    where ((status in ('pending','failed') and available_at<=timezone('utc',now()))
       or (status='processing' and locked_at < timezone('utc',now())-interval '10 minutes'))
      and attempts<5
    order by created_at
    for update skip locked limit 1
  )
  returning e.*;
end;
$$;

create or replace function public.commerce_complete_email_job(p_id uuid,p_worker_id text,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_success then
    update public.transactional_email_outbox
      set status='sent',sent_at=timezone('utc',now()),locked_at=null,locked_by=null,last_error=null
      where id=p_id and status='processing' and locked_by=p_worker_id;
  else
    update public.transactional_email_outbox
      set status=case when attempts>=5 then 'failed' else 'pending' end,
          available_at=timezone('utc',now())+make_interval(secs=>least(3600,30*power(2,attempts))),
          locked_at=null,locked_by=null,last_error=left(coalesce(p_error,'delivery_failed'),500)
      where id=p_id and status='processing' and locked_by=p_worker_id;
  end if;
end;
$$;

revoke all on function public.commerce_claim_email_job(text),public.commerce_complete_email_job(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.commerce_claim_email_job(text),public.commerce_complete_email_job(uuid,text,boolean,text) to service_role;
