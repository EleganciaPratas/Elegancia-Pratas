-- SOMENTE PostgreSQL descartável em nuvem. Relógio sintético não é implantado.
create table public.management_readers(user_id uuid primary key);
insert into public.management_readers values('00000000-0000-0000-0000-000000000003');
CREATE OR REPLACE FUNCTION public.management_finance_summary(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m date:=date_trunc('month',p_month)::date;v_sales bigint;v_cost bigint;v_fees bigint;v_shipping bigint;v_expenses bigint;v_missing int;v_count int;begin
 if not(public.has_staff_role(array['administrador'])or public.management_is_reader())then raise exception 'Acesso negado';end if;
 select count(*),count(*)filter(where cost_cents is null),coalesce(sum(revenue_cents+shipping_collected_cents),0),coalesce(sum(cost_cents),0),coalesce(sum(fee_cents),0),coalesce(sum(shipping_paid_cents),0) into v_count,v_missing,v_sales,v_cost,v_fees,v_shipping from public.finance_sales where occurred_on>=m and occurred_on<(m+interval '1 month');
 select coalesce(sum(amount_cents),0)into v_expenses from public.finance_entries where occurred_on>=m and occurred_on<(m+interval '1 month') and impacts_profit;
 return jsonb_build_object('month',m,'sales_count',v_count,'missing_costs',v_missing,'revenue_cents',v_sales,'cost_cents',v_cost,'fee_cents',v_fees,'shipping_paid_cents',v_shipping,'expenses_cents',v_expenses,'profit_cents',case when v_missing=0 then v_sales-v_cost-v_fees-v_shipping-v_expenses else null end,'closed',exists(select 1 from public.finance_months where month=m));
end $function$
;
CREATE OR REPLACE FUNCTION public.management_is_reader()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(auth.jwt()->>'aal'='aal2',false)
 and exists(select 1 from public.management_readers where user_id=auth.uid())
 and not exists(select 1 from public.admin_users where user_id=auth.uid());
$function$
;
create or replace function public.finance_today() returns date language sql stable security invoker set search_path='' as $$select date '2027-07-02'$$;
