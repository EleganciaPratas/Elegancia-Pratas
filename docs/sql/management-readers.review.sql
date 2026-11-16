-- Estrutura aditiva: homologar antes de publicar. Nenhum RPC antigo é alterado.
begin;
create table public.management_readers(
 user_id uuid primary key references auth.users(id) on delete cascade,
 owner_user_id uuid not null unique references auth.users(id),
 display_name text not null check(length(trim(display_name)) between 2 and 120),
 created_at timestamptz not null default now(),
 check(user_id<>owner_user_id)
);
alter table public.management_readers enable row level security;
revoke all on public.management_readers from public,anon,authenticated;
grant select on public.management_readers to authenticated;
create policy management_reader_self on public.management_readers for select to authenticated
 using(auth.jwt()->>'aal'='aal2' and (user_id=auth.uid() or owner_user_id=auth.uid()));
create function public.management_is_reader() returns boolean language sql stable security definer set search_path='' as $f$
 select coalesce(auth.jwt()->>'aal'='aal2',false)
 and exists(select 1 from public.management_readers where user_id=auth.uid())
 and not exists(select 1 from public.admin_users where user_id=auth.uid());
$f$;
revoke all on function public.management_is_reader() from public,anon;
grant execute on function public.management_is_reader() to authenticated;
create function public.management_account_context() returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v text;begin
 if public.has_staff_role(array['administrador'])then
  select display_name into v from public.admin_users where user_id=auth.uid();
  return jsonb_build_object('role','administrador','name',v);
 end if;
 if public.management_is_reader()then
  select display_name into v from public.management_readers where user_id=auth.uid();
  return jsonb_build_object('role','consulta','name',v);
 end if;
 raise exception 'Acesso negado';
end $f$;
create function public.management_linked_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v public.management_readers%rowtype;begin
 if not(public.management_is_reader() or public.has_staff_role(array['administrador']))then raise exception 'Acesso negado';end if;
 select * into v from public.management_readers where user_id=auth.uid()or owner_user_id=auth.uid();
 if not found then return '[]'::jsonb;end if;
 return (select jsonb_agg(jsonb_build_object('email',u.email,'name','Caio Amaral','role',case when u.id=v.user_id then 'consulta' else 'administrador'end,'current',u.id=auth.uid())order by u.id=v.user_id)
 from auth.users u where u.id in(v.user_id,v.owner_user_id));
end $f$;
revoke all on function public.management_account_context(),public.management_linked_accounts() from public,anon;
grant execute on function public.management_account_context(),public.management_linked_accounts() to authenticated;
create policy management_reader_select on public.products for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.product_variants for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.jewelry_intake for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.product_pricing for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.collections for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.stock_items for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.stock_movements for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.packaging_models for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.packaging_model_components for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.orders for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.order_items for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.finance_accounts for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.finance_entries for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.finance_sales for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.finance_months for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.finance_payouts for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.finance_partners for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.campaign_events for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.campaign_plans for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.campaign_ideas for select to authenticated using(public.management_is_reader());
create policy management_reader_select on public.campaign_ai_usage for select to authenticated using(public.management_is_reader());
create policy management_reader_identification on storage.objects for select to authenticated
 using(bucket_id='jewelry-identification' and public.management_is_reader() and exists(select 1 from public.jewelry_intake j where j.identification_image_path=name));
CREATE FUNCTION public.management_sales_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if not(public.has_staff_role(array['administrador'])or public.management_is_reader())then
    raise exception 'Acesso negado';
  end if;

  select jsonb_build_object(
    'paid_orders', (select count(*) from public.orders o where o.status in ('pago','em_preparacao','enviado','entregue')),
    'gross_revenue_cents', (select coalesce(sum(o.total_cents),0) from public.orders o where o.status in ('pago','em_preparacao','enviado','entregue')),
    'pending_orders', (select count(*) from public.orders o where o.status = 'aguardando_pagamento'),
    'months', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.month_start,'YYYY-MM'),
        'orders', coalesce(x.order_count,0), 'revenue_cents', coalesce(x.revenue_cents,0)) order by m.month_start), '[]'::jsonb)
      from generate_series(date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '5 months',
        date_trunc('month', now() at time zone 'America/Sao_Paulo'), interval '1 month') m(month_start)
      left join lateral (
        select count(*) as order_count, coalesce(sum(o.total_cents),0) as revenue_cents
        from public.orders o where o.status in ('pago','em_preparacao','enviado','entregue')
          and (o.created_at at time zone 'America/Sao_Paulo') >= m.month_start
          and (o.created_at at time zone 'America/Sao_Paulo') < m.month_start + interval '1 month'
      ) x on true
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'quantity', t.quantity,
        'revenue_cents', t.revenue_cents) order by t.quantity desc, t.revenue_cents desc), '[]'::jsonb)
      from (
        select max(i.product_name) as name, sum(i.quantity) as quantity,
          sum(i.quantity::bigint * i.unit_price_cents) as revenue_cents
        from public.order_items i join public.orders o on o.id = i.order_id
        where o.status in ('pago','em_preparacao','enviado','entregue')
        group by coalesce(i.product_id::text, i.product_name)
        order by quantity desc, revenue_cents desc limit 5
      ) t
    ),
    'recent_orders', (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status,
        'total_cents', r.total_cents, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
      from (
        select o.id, o.status, o.total_cents, o.created_at from public.orders o
        order by o.created_at desc limit 5
      ) r
    )
  ) into v_result;
  return v_result;
end;
$function$;

create function public.management_finance_summary(p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare m date:=date_trunc('month',p_month)::date;v_sales bigint;v_cost bigint;v_fees bigint;v_shipping bigint;v_expenses bigint;v_missing int;v_count int;begin
 if not(public.has_staff_role(array['administrador'])or public.management_is_reader())then raise exception 'Acesso negado';end if;
 select count(*),count(*)filter(where cost_cents is null),coalesce(sum(revenue_cents+shipping_collected_cents),0),coalesce(sum(cost_cents),0),coalesce(sum(fee_cents),0),coalesce(sum(shipping_paid_cents),0) into v_count,v_missing,v_sales,v_cost,v_fees,v_shipping from public.finance_sales where occurred_on>=m and occurred_on<(m+interval '1 month');
 select coalesce(sum(amount_cents),0)into v_expenses from public.finance_entries where occurred_on>=m and occurred_on<(m+interval '1 month') and impacts_profit;
 return jsonb_build_object('month',m,'sales_count',v_count,'missing_costs',v_missing,'revenue_cents',v_sales,'cost_cents',v_cost,'fee_cents',v_fees,'shipping_paid_cents',v_shipping,'expenses_cents',v_expenses,'profit_cents',case when v_missing=0 then v_sales-v_cost-v_fees-v_shipping-v_expenses else null end,'closed',exists(select 1 from public.finance_months where month=m));
end $f$;
revoke all on function public.management_sales_dashboard(),public.management_finance_summary(date) from public,anon;
grant execute on function public.management_sales_dashboard(),public.management_finance_summary(date) to authenticated;
create view public.management_account_balances with(security_invoker=true) as
select a.id,a.name,a.opening_cents,a.opening_cents+coalesce(sum(case when e.direction='entrada'then e.amount_cents else -e.amount_cents end),0)::bigint as balance_cents
from public.finance_accounts a left join public.finance_entries e on e.account_id=a.id group by a.id,a.name,a.opening_cents;
revoke all on public.management_account_balances from public,anon;
grant select on public.management_account_balances to authenticated;
create function public.management_finance_cash(p_month date) returns jsonb language plpgsql stable security invoker set search_path='' as $f$
declare m date:=date_trunc('month',p_month)::date;begin
 if not(public.has_staff_role(array['administrador'])or public.management_is_reader())then raise exception 'Acesso negado';end if;
 return jsonb_build_object(
 'balance_cents',(select coalesce(sum(balance_cents),0)from public.management_account_balances),
 'incoming_cents',(select coalesce(sum(amount_cents),0)from public.finance_entries where occurred_on>=m and occurred_on<m+interval '1 month'and direction='entrada'and category<>'transferencia'),
 'outgoing_cents',(select coalesce(sum(amount_cents),0)from public.finance_entries where occurred_on>=m and occurred_on<m+interval '1 month'and direction='saida'and category<>'transferencia'));
end $f$;
revoke all on function public.management_finance_cash(date)from public,anon;
grant execute on function public.management_finance_cash(date)to authenticated;

commit;
