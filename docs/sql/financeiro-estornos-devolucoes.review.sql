-- Estornos e devoluções aditivos. Primeiro homologação, depois backup e produção.
-- Não substitui definições de RPCs existentes nem modifica registros históricos.
begin;
create table public.finance_adjustments(
 id uuid primary key,
 kind text not null check(kind in('sale_refund','entry_reversal','transfer_reversal')),
 occurred_on date not null,
 sale_id uuid references public.finance_sales(id),
 entry_id uuid references public.finance_entries(id),
 transfer_id uuid,
 amount_cents bigint not null default 0 check(amount_cents between 0 and 999999999999),
 revenue_refund_cents bigint not null default 0 check(revenue_refund_cents between 0 and 999999999999),
 shipping_refund_cents bigint not null default 0 check(shipping_refund_cents between 0 and 999999999999),
 cost_recovered_cents bigint not null default 0 check(cost_recovered_cents between 0 and 999999999999),
 fee_recovered_cents bigint not null default 0 check(fee_recovered_cents between 0 and 999999999999),
 shipping_recovered_cents bigint not null default 0 check(shipping_recovered_cents between 0 and 999999999999),
 expense_recovered_cents bigint not null default 0 check(expense_recovered_cents between 0 and 999999999999),
 profit_delta_cents bigint generated always as(-revenue_refund_cents-shipping_refund_cents+cost_recovered_cents+fee_recovered_cents+shipping_recovered_cents+expense_recovered_cents) stored,
 reason text not null check(length(trim(reason)) between 10 and 240),
 evidence text not null check(length(trim(evidence)) between 3 and 240),
 request_data jsonb not null,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 check(
  (kind='sale_refund' and sale_id is not null and entry_id is null and transfer_id is null and amount_cents=0 and expense_recovered_cents=0 and revenue_refund_cents+shipping_refund_cents+cost_recovered_cents+fee_recovered_cents+shipping_recovered_cents>0)
  or(kind='entry_reversal' and entry_id is not null and sale_id is null and transfer_id is null and amount_cents>0 and expense_recovered_cents<=amount_cents and revenue_refund_cents+shipping_refund_cents+cost_recovered_cents+fee_recovered_cents+shipping_recovered_cents=0)
  or(kind='transfer_reversal' and transfer_id is not null and sale_id is null and entry_id is null and amount_cents>0 and expense_recovered_cents+revenue_refund_cents+shipping_refund_cents+cost_recovered_cents+fee_recovered_cents+shipping_recovered_cents=0)
 )
);
create unique index finance_adjustment_transfer_once on public.finance_adjustments(transfer_id) where kind='transfer_reversal';
create index finance_adjustments_month on public.finance_adjustments(occurred_on);
create index finance_adjustments_sale on public.finance_adjustments(sale_id) where sale_id is not null;
create index finance_adjustments_entry on public.finance_adjustments(entry_id) where entry_id is not null;
create table public.finance_adjustment_links(
 entry_id uuid primary key references public.finance_entries(id) deferrable initially deferred,
 adjustment_id uuid not null references public.finance_adjustments(id)
);
create index finance_adjustment_links_event on public.finance_adjustment_links(adjustment_id);
alter table public.finance_adjustments enable row level security;
alter table public.finance_adjustment_links enable row level security;
revoke all on public.finance_adjustments,public.finance_adjustment_links from public,anon,authenticated;
grant select on public.finance_adjustments,public.finance_adjustment_links to authenticated;
create policy finance_adjustments_read on public.finance_adjustments for select to authenticated using(public.has_staff_role(array['administrador']) or public.management_is_reader());
create policy finance_adjustment_links_read on public.finance_adjustment_links for select to authenticated using(public.has_staff_role(array['administrador']) or public.management_is_reader());

create function public.finance_adjustment_replay(p_request uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $f$
declare existing public.finance_adjustments;
begin
 if not coalesce(public.has_staff_role(array['administrador']),false) then raise exception 'Acesso financeiro negado';end if;
 if p_request is null then raise exception 'Identificador da operação obrigatório';end if;
 perform pg_advisory_xact_lock(83023,hashtext(p_request::text));
 select * into existing from public.finance_adjustments where id=p_request;
 if found then
  if existing.created_by<>auth.uid() or existing.request_data<>p_payload then raise exception 'Identificador já usado com dados diferentes';end if;
  return existing.id;
 end if;
 return null;
end $f$;

create function public.finance_adjustment_cash(p_adjustment uuid,p_day date,p_account uuid,p_direction text,p_amount bigint,p_description text,p_transfer uuid default null)
returns void language plpgsql security definer set search_path='' as $f$
declare entry uuid:=gen_random_uuid();
begin
 if p_amount=0 then return;end if;
 if p_account is null then raise exception 'Selecione a conta de cada valor efetivamente movimentado';end if;
 insert into public.finance_adjustment_links(entry_id,adjustment_id)values(entry,p_adjustment);
 insert into public.finance_entries(id,occurred_on,account_id,direction,category,description,amount_cents,impacts_profit,transfer_id)
 values(entry,p_day,p_account,p_direction,case when p_transfer is null then 'ajuste_financeiro' else 'transferencia' end,p_description,p_amount,false,p_transfer);
end $f$;

create function public.finance_refund_sale(p_request uuid,p_sale uuid,p_day date,p_revenue bigint,p_shipping_refund bigint,p_cost_recovered bigint,p_fee_recovered bigint,p_shipping_recovered bigint,p_refund_account uuid,p_fee_account uuid,p_shipping_account uuid,p_reason text,p_evidence text)
returns uuid language plpgsql security definer set search_path='' as $f$
declare payload jsonb:=jsonb_build_object('kind','sale_refund','sale',p_sale,'day',p_day,'revenue',p_revenue,'shipping_refund',p_shipping_refund,'cost',p_cost_recovered,'fee',p_fee_recovered,'shipping',p_shipping_recovered,'refund_account',p_refund_account,'fee_account',p_fee_account,'shipping_account',p_shipping_account,'reason',trim(p_reason),'evidence',trim(p_evidence));existing uuid;s public.finance_sales;totals record;
begin
 existing:=public.finance_adjustment_replay(p_request,payload);if existing is not null then return existing;end if;
 perform public.finance_lock_open(p_day);
 if p_revenue is null or p_shipping_refund is null or p_cost_recovered is null or p_fee_recovered is null or p_shipping_recovered is null or least(p_revenue,p_shipping_refund,p_cost_recovered,p_fee_recovered,p_shipping_recovered)<0 or greatest(p_revenue,p_shipping_refund,p_cost_recovered,p_fee_recovered,p_shipping_recovered)>999999999999 then raise exception 'Valores devem ser centavos não negativos dentro do limite';end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 240 or length(trim(coalesce(p_evidence,''))) not between 3 and 240 then raise exception 'Informe motivo e referência de conferência';end if;
 select * into s from public.finance_sales where id=p_sale for update;
 if not found then raise exception 'Venda inexistente';end if;
 if p_day<s.occurred_on then raise exception 'O ajuste não pode ser anterior à venda';end if;
 select coalesce(sum(revenue_refund_cents),0) revenue,coalesce(sum(shipping_refund_cents),0) freight,coalesce(sum(cost_recovered_cents),0) cost,coalesce(sum(fee_recovered_cents),0) fee,coalesce(sum(shipping_recovered_cents),0) shipping into totals from public.finance_adjustments where sale_id=p_sale;
 if totals.revenue+p_revenue>s.revenue_cents or totals.freight+p_shipping_refund>s.shipping_collected_cents or totals.cost+p_cost_recovered>coalesce(s.cost_cents,0) or totals.fee+p_fee_recovered>s.fee_cents or totals.shipping+p_shipping_recovered>s.shipping_paid_cents then raise exception 'O ajuste supera o saldo comprovado da venda; confira devoluções anteriores e custo registrado';end if;
 insert into public.finance_adjustments(id,kind,occurred_on,sale_id,revenue_refund_cents,shipping_refund_cents,cost_recovered_cents,fee_recovered_cents,shipping_recovered_cents,reason,evidence,request_data)
 values(p_request,'sale_refund',p_day,p_sale,p_revenue,p_shipping_refund,p_cost_recovered,p_fee_recovered,p_shipping_recovered,trim(p_reason),trim(p_evidence),payload);
 perform public.finance_adjustment_cash(p_request,p_day,p_refund_account,'saida',p_revenue+p_shipping_refund,'Devolução: '||s.reference);
 perform public.finance_adjustment_cash(p_request,p_day,p_fee_account,'entrada',p_fee_recovered,'Taxa ressarcida: '||s.reference);
 perform public.finance_adjustment_cash(p_request,p_day,p_shipping_account,'entrada',p_shipping_recovered,'Frete ressarcido: '||s.reference);
 return p_request;
end $f$;

create function public.finance_reverse_entry(p_request uuid,p_entry uuid,p_day date,p_amount bigint,p_account uuid,p_reason text,p_evidence text)
returns uuid language plpgsql security definer set search_path='' as $f$
declare payload jsonb:=jsonb_build_object('kind','entry_reversal','entry',p_entry,'day',p_day,'amount',p_amount,'account',p_account,'reason',trim(p_reason),'evidence',trim(p_evidence));existing uuid;e public.finance_entries;leg public.finance_entries;used numeric;pair_count int;pair_sum numeric;new_transfer uuid:=gen_random_uuid();
begin
 existing:=public.finance_adjustment_replay(p_request,payload);if existing is not null then return existing;end if;
 perform public.finance_lock_open(p_day);
 if length(trim(coalesce(p_reason,''))) not between 10 and 240 or length(trim(coalesce(p_evidence,''))) not between 3 and 240 then raise exception 'Informe motivo e referência de conferência';end if;
 select * into e from public.finance_entries where id=p_entry;
 if not found then raise exception 'Movimentação inexistente';end if;
 if e.transfer_id is not null then
  perform id from public.finance_entries where transfer_id=e.transfer_id order by id for update;
  select count(*),sum(case when direction='entrada' then amount_cents else -amount_cents end) into pair_count,pair_sum from public.finance_entries where transfer_id=e.transfer_id;
  if pair_count<>2 or pair_sum<>0 or exists(select 1 from public.finance_entries where transfer_id=e.transfer_id and (category<>'transferencia' or impacts_profit or sale_id is not null or related_sale_id is not null or payout_id is not null)) or p_amount is distinct from e.amount_cents or p_account is not null then raise exception 'A transferência precisa ser estornada integralmente nas duas contas originais';end if;
  if exists(select 1 from public.finance_entries a join public.finance_adjustment_links l on l.entry_id=a.id where a.transfer_id=e.transfer_id) or exists(select 1 from public.finance_adjustments where transfer_id=e.transfer_id) then raise exception 'Transferência já estornada ou originada por um ajuste';end if;
  if exists(select 1 from public.finance_entries where transfer_id=e.transfer_id and occurred_on>p_day) then raise exception 'Data anterior à transferência';end if;
  insert into public.finance_adjustments(id,kind,occurred_on,transfer_id,amount_cents,reason,evidence,request_data)values(p_request,'transfer_reversal',p_day,e.transfer_id,p_amount,trim(p_reason),trim(p_evidence),payload);
  for leg in select * from public.finance_entries where transfer_id=e.transfer_id order by id loop
   perform public.finance_adjustment_cash(p_request,p_day,leg.account_id,case when leg.direction='entrada' then 'saida' else 'entrada' end,leg.amount_cents,'Estorno: '||left(leg.description,220),new_transfer);
  end loop;
 else
  select * into e from public.finance_entries where id=p_entry for update;
  if e.sale_id is not null or e.related_sale_id is not null or e.payout_id is not null or e.category in('venda','taxa_venda','frete_venda','transferencia','repasse_societario','ajuste_financeiro') or exists(select 1 from public.finance_adjustment_links where entry_id=e.id) then raise exception 'Use o fluxo específico da venda; pagamentos de sócios e ajustes não podem ser estornados por esta operação';end if;
  if p_day<e.occurred_on then raise exception 'Data anterior à movimentação original';end if;
  select coalesce(sum(amount_cents),0) into used from public.finance_adjustments where entry_id=e.id;
  if p_amount is null or p_amount<=0 or used+p_amount>e.amount_cents then raise exception 'Valor superior ao saldo ainda não estornado';end if;
  insert into public.finance_adjustments(id,kind,occurred_on,entry_id,amount_cents,expense_recovered_cents,reason,evidence,request_data)
  values(p_request,'entry_reversal',p_day,e.id,p_amount,case when e.impacts_profit then p_amount else 0 end,trim(p_reason),trim(p_evidence),payload);
  perform public.finance_adjustment_cash(p_request,p_day,p_account,case when e.direction='entrada' then 'saida' else 'entrada' end,p_amount,'Estorno: '||left(e.description,220));
 end if;
 return p_request;
end $f$;

create function public.finance_guard_adjustment()
returns trigger language plpgsql security definer set search_path='' as $f$
declare first_day date;
begin
 if tg_op<>'INSERT' then raise exception 'Ajustes financeiros preservam histórico e não permitem edição ou exclusão';end if;
 perform public.finance_lock_open(new.occurred_on);
 select first_month into first_day from public.finance_closing_setup where singleton;
 if first_day is not null and new.occurred_on<first_day then raise exception 'Data anterior ao início confirmado da apuração';end if;
 return new;
end $f$;
create trigger finance_adjustment_immutable before insert or update or delete on public.finance_adjustments for each row execute function public.finance_guard_adjustment();
create trigger finance_adjustment_audit after insert on public.finance_adjustments for each row execute function public.finance_audit_change();

create function public.finance_guard_adjustment_entry()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
 if new.category='ajuste_financeiro' and not exists(select 1 from public.finance_adjustment_links where entry_id=new.id) then raise exception 'Use o fluxo específico de estorno e devolução';end if;
 return new;
end $f$;
create trigger finance_adjustment_entry_guard before insert on public.finance_entries for each row execute function public.finance_guard_adjustment_entry();

create function public.finance_guard_adjusted_sale()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
 if exists(select 1 from public.finance_adjustments where sale_id=old.id) and new is distinct from old then
  if old.cost_cents is not null or new.cost_cents is null or (to_jsonb(new)-'cost_cents'-'cost_evidence') is distinct from (to_jsonb(old)-'cost_cents'-'cost_evidence') then raise exception 'Venda com ajustes preserva seu histórico; somente o custo ainda ausente pode ser comprovado';end if;
 end if;
 return new;
end $f$;
create trigger finance_adjusted_sale_guard before update on public.finance_sales for each row execute function public.finance_guard_adjusted_sale();

create function public.finance_adjusted_summary(p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare m date:=date_trunc('month',p_month)::date;s jsonb;a record;profit bigint;saved boolean;calc jsonb;
begin
 if not coalesce(public.has_staff_role(array['administrador'])or public.management_is_reader(),false) then raise exception 'Acesso negado';end if;
 s:=public.finance_closing_summary(m);
 select count(*) n,coalesce(sum(revenue_refund_cents+shipping_refund_cents),0)::bigint refunded,coalesce(sum(cost_recovered_cents),0)::bigint cost,coalesce(sum(fee_recovered_cents),0)::bigint fee,coalesce(sum(shipping_recovered_cents),0)::bigint shipping,coalesce(sum(expense_recovered_cents),0)::bigint expense,coalesce(sum(profit_delta_cents),0)::bigint delta into a from public.finance_adjustments where occurred_on>=m and occurred_on<m+interval '1 month';
 select exists(select 1 from public.finance_loss_closures where month=m) into saved;
 profit:=case when (s->>'missing_costs')::int=0 then (s->>'revenue_cents')::bigint-a.refunded-((s->>'cost_cents')::bigint-a.cost)-((s->>'fee_cents')::bigint-a.fee)-((s->>'shipping_paid_cents')::bigint-a.shipping)-((s->>'expenses_cents')::bigint-a.expense) else null end;
 if saved then profit:=(s->>'profit_cents')::bigint;
 elsif coalesce((s->>'sequence_ready')::boolean,false) and profit is not null then calc:=public.finance_loss_calculation(profit,(s->>'opening_loss_cents')::bigint,(s->>'eligible')::boolean);end if;
 return s||jsonb_build_object('revenue_cents',(s->>'revenue_cents')::bigint-a.refunded,'cost_cents',(s->>'cost_cents')::bigint-a.cost,'fee_cents',(s->>'fee_cents')::bigint-a.fee,'shipping_paid_cents',(s->>'shipping_paid_cents')::bigint-a.shipping,'expenses_cents',(s->>'expenses_cents')::bigint-a.expense,'profit_cents',profit,'adjustments_count',a.n,'adjustment_profit_cents',a.delta)||coalesce(calc,'{}'::jsonb);
end $f$;

create function public.finance_validate_adjusted_closure()
returns trigger language plpgsql security definer set search_path='' as $f$
declare s jsonb;expected_pool bigint;
begin
 perform public.finance_require_admin();
 if not coalesce(public.has_staff_role(array['administrador']),false) then raise exception 'Acesso financeiro negado';end if;
 perform pg_advisory_xact_lock(83022,1);
 -- AFTER INSERT já vê finance_months; o saldo anterior vem apenas do histórico de perdas.
 s:=public.finance_adjusted_summary(new.month);
 if not coalesce((s->>'configured')::boolean,false) then raise exception 'Confirme primeiro a base de apuração';end if;
 if not coalesce((s->>'sequence_ready')::boolean,false) then raise exception 'Feche primeiro a competência %',s->>'next_month';end if;
 if (new.month+interval '1 month')::date>public.finance_today() then raise exception 'Aguarde o término da competência';end if;
 if s->>'profit_cents' is null or new.profit_cents<>(s->>'profit_cents')::bigint then raise exception 'Resultado incompleto ou divergente';end if;
 expected_pool:=(s->>'pool_cents')::bigint;
 if new.pool_cents<>expected_pool or new.retained_cents<>new.profit_cents-expected_pool then raise exception 'O repasse precisa compensar o prejuízo acumulado';end if;
 insert into public.finance_loss_closures(month,opening_loss_cents,absorbed_loss_cents,closing_loss_cents,distributable_cents,eligible)
 values(new.month,(s->>'opening_loss_cents')::bigint,(s->>'absorbed_loss_cents')::bigint,(s->>'closing_loss_cents')::bigint,(s->>'distributable_cents')::bigint,(s->>'eligible')::boolean);
 return new;
end $f$;
create function public.finance_close_adjusted_period(p_month date,p_reconciled boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare m date:=date_trunc('month',p_month)::date;s jsonb;profit bigint;pool bigint;
begin
 perform public.finance_lock_open(m);
 perform pg_advisory_xact_lock(83022,1);
 if p_reconciled is distinct from true then raise exception 'Confirme a conferência das vendas, custos, saldos e despesas';end if;
 s:=public.finance_adjusted_summary(m);
 if not coalesce((s->>'configured')::boolean,false) then raise exception 'Confirme primeiro a base de apuração';end if;
 if not coalesce((s->>'sequence_ready')::boolean,false) then raise exception 'Feche primeiro a competência %',s->>'next_month';end if;
 if (m+interval '1 month')::date>public.finance_today() then raise exception 'Aguarde o término da competência';end if;
 if (s->>'missing_costs')::int>0 then raise exception 'Há vendas sem custo comprovado';end if;
 if (select count(*)<>3 or coalesce(sum(share_bps),0)<>10000 from public.finance_partners) then raise exception 'Participações precisam somar 100%% entre três sócios';end if;
 profit:=(s->>'profit_cents')::bigint;pool:=(s->>'pool_cents')::bigint;
 insert into public.finance_months(month,profit_cents,pool_cents,retained_cents,sales_count,closed_by) values(m,profit,pool,profit-pool,(s->>'sales_count')::int,auth.uid());
 if (s->>'eligible')::boolean then
  with base as(select id,share_bps,floor(pool::numeric*share_bps/10000)::bigint amount,mod(pool::numeric*share_bps,10000) rem from public.finance_partners),
  ranked as(select *,row_number()over(order by rem desc,id::text)rn from base),
  rest as(select pool-sum(amount) n from base)
  insert into public.finance_payouts(month,partner_id,share_bps,amount_cents)
  select m,id,share_bps,amount+case when rn<=rest.n then 1 else 0 end from ranked cross join rest;
 end if;
 return public.finance_adjusted_summary(m);
end $f$;


create view public.finance_adjustment_register with(security_invoker=true) as
select a.id,a.kind,case a.kind when 'sale_refund' then 'Devolução ou ressarcimento de venda' when 'entry_reversal' then 'Estorno de movimentação' else 'Estorno de transferência' end kind_label,a.occurred_on,a.sale_id,a.entry_id,a.transfer_id,a.amount_cents,a.revenue_refund_cents,a.shipping_refund_cents,a.cost_recovered_cents,a.fee_recovered_cents,a.shipping_recovered_cents,a.expense_recovered_cents,a.profit_delta_cents,a.reason,a.evidence,a.created_at,
 coalesce(s.reference,e.description,'Transferência entre contas') source_reference,
 coalesce((select sum(f.amount_cents) from public.finance_adjustment_links l join public.finance_entries f on f.id=l.entry_id where l.adjustment_id=a.id and f.direction='entrada'),0)::bigint cash_in_cents,
 coalesce((select sum(f.amount_cents) from public.finance_adjustment_links l join public.finance_entries f on f.id=l.entry_id where l.adjustment_id=a.id and f.direction='saida'),0)::bigint cash_out_cents
from public.finance_adjustments a left join public.finance_sales s on s.id=a.sale_id left join public.finance_entries e on e.id=a.entry_id;
revoke all on public.finance_adjustment_register from public,anon,authenticated;
grant select on public.finance_adjustment_register to authenticated;

create function public.finance_adjustment_source(p_kind text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare s public.finance_sales;e public.finance_entries;a record;allowed boolean;
begin
 if not coalesce(public.has_staff_role(array['administrador'])or public.management_is_reader(),false) then raise exception 'Acesso negado';end if;
 if p_kind='sale' then
  select * into s from public.finance_sales where id=p_id;if not found then raise exception 'Venda inexistente';end if;
  select coalesce(sum(revenue_refund_cents),0) revenue,coalesce(sum(shipping_refund_cents),0) freight,coalesce(sum(cost_recovered_cents),0) cost,coalesce(sum(fee_recovered_cents),0) fee,coalesce(sum(shipping_recovered_cents),0) shipping into a from public.finance_adjustments where sale_id=p_id;
  return jsonb_build_object('reference',s.reference,'source_date',s.occurred_on,'revenue',s.revenue_cents-a.revenue,'freight',s.shipping_collected_cents-a.freight,'cost',coalesce(s.cost_cents,0)-a.cost,'fee',s.fee_cents-a.fee,'shipping',s.shipping_paid_cents-a.shipping,'cost_known',s.cost_cents is not null);
 elsif p_kind='entry' then
  select * into e from public.finance_entries where id=p_id;if not found then raise exception 'Movimentação inexistente';end if;
  allowed:=e.sale_id is null and e.related_sale_id is null and e.payout_id is null and not exists(select 1 from public.finance_adjustment_links where entry_id=e.id) and (e.transfer_id is not null or e.category not in('venda','taxa_venda','frete_venda','transferencia','repasse_societario','ajuste_financeiro'));
  return jsonb_build_object('reference',e.description,'source_date',e.occurred_on,'allowed',allowed,'transfer',e.transfer_id is not null,'amount',e.amount_cents-case when e.transfer_id is not null then case when exists(select 1 from public.finance_adjustments where transfer_id=e.transfer_id) then e.amount_cents else 0 end else (select coalesce(sum(amount_cents),0) from public.finance_adjustments where entry_id=e.id) end);
 end if;
 raise exception 'Origem inválida';
end $f$;
revoke all on function public.finance_adjustment_source(text,uuid) from public,anon,authenticated;
grant execute on function public.finance_adjustment_source(text,uuid) to authenticated;

-- Troca atômica do vínculo do gatilho; as funções anteriores permanecem intactas.
drop trigger finance_loss_closure_guard on public.finance_months;
create trigger finance_loss_closure_guard after insert on public.finance_months for each row execute function public.finance_validate_adjusted_closure();
do $grants$ declare r record;begin
 for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname=any(array['finance_adjustment_replay','finance_adjustment_cash','finance_refund_sale','finance_reverse_entry','finance_guard_adjustment','finance_guard_adjustment_entry','finance_guard_adjusted_sale','finance_adjusted_summary','finance_validate_adjusted_closure','finance_close_adjusted_period']) loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
 end loop;
end $grants$;
grant execute on function public.finance_refund_sale(uuid,uuid,date,bigint,bigint,bigint,bigint,bigint,uuid,uuid,uuid,text,text),public.finance_reverse_entry(uuid,uuid,date,bigint,uuid,text,text),public.finance_adjusted_summary(date),public.finance_close_adjusted_period(date,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
