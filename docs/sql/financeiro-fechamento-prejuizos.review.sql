-- Consolidação aditiva: não substitui RPCs existentes nem altera registros históricos.
-- Aplicar primeiro em homologação e somente com backup verificado antes de produção.
begin;
do $$begin if exists(select 1 from public.finance_months) then raise exception 'Há fechamentos existentes: concilie o histórico antes de aplicar esta consolidação';end if;end$$;
create table public.finance_closing_setup (
 singleton boolean primary key default true check(singleton),
 first_month date not null check(extract(day from first_month)=1),
 opening_loss_cents bigint not null check(opening_loss_cents between 0 and 999999999999),
 evidence text not null check(length(trim(evidence)) between 10 and 240),
 confirmed_by uuid not null references auth.users(id),
 confirmed_at timestamptz not null default now()
);
create table public.finance_loss_closures (
 month date primary key references public.finance_months(month),
 opening_loss_cents bigint not null check(opening_loss_cents>=0),
 absorbed_loss_cents bigint not null check(absorbed_loss_cents>=0),
 closing_loss_cents bigint not null check(closing_loss_cents>=0),
 distributable_cents bigint not null check(distributable_cents>=0),
 eligible boolean not null,
 recorded_at timestamptz not null default now()
);
alter table public.finance_closing_setup enable row level security;
alter table public.finance_loss_closures enable row level security;
revoke all on public.finance_closing_setup,public.finance_loss_closures from public,anon,authenticated;
grant select on public.finance_closing_setup,public.finance_loss_closures to authenticated;
create policy finance_closing_setup_read on public.finance_closing_setup for select to authenticated using(public.has_staff_role(array['administrador']) or public.management_is_reader());
create policy finance_loss_closures_read on public.finance_loss_closures for select to authenticated using(public.has_staff_role(array['administrador']) or public.management_is_reader());

create function public.finance_loss_calculation(p_profit bigint,p_loss bigint,p_eligible boolean)
returns jsonb language plpgsql immutable set search_path='' as $f$
declare available bigint;remaining bigint;pool bigint;
begin
 if p_profit is null or p_loss is null or p_loss<0 or p_eligible is null then raise exception 'Apuração de prejuízo inválida';end if;
 available:=greatest(p_profit::numeric-p_loss,0)::bigint;
 remaining:=greatest(p_loss::numeric-p_profit,0)::bigint;
 pool:=case when p_eligible then available/2 else 0 end;
 return jsonb_build_object('opening_loss_cents',p_loss,'absorbed_loss_cents',least(p_loss,greatest(p_profit,0)),'closing_loss_cents',remaining,'distributable_cents',available,'pool_cents',pool,'retained_cents',p_profit-pool,'eligible',p_eligible);
end $f$;

create function public.finance_configure_closing(p_first_month date,p_opening_loss bigint,p_evidence text)
returns void language plpgsql security definer set search_path='' as $f$
declare earliest date;
begin
 perform public.finance_require_admin();
 if not coalesce(public.has_staff_role(array['administrador']),false) then raise exception 'Acesso financeiro negado';end if;
 perform pg_advisory_xact_lock(83022,1);
 lock table public.finance_sales,public.finance_entries in share row exclusive mode;
 if p_first_month is null or extract(day from p_first_month)<>1 or p_first_month>public.finance_today() then raise exception 'Informe o primeiro mês já iniciado';end if;
 if p_opening_loss is null or p_opening_loss<0 or p_opening_loss>999999999999 or length(trim(coalesce(p_evidence,''))) not between 10 and 240 then raise exception 'Confira o prejuízo anterior e informe a referência da conferência';end if;
 if exists(select 1 from public.finance_months) then raise exception 'A base não pode mudar após o primeiro fechamento';end if;
 if exists(select 1 from public.finance_closing_setup) then raise exception 'Base já confirmada; solicite revisão controlada antes de fechar';end if;
 select min(recorded_day) into earliest from(select occurred_on as recorded_day from public.finance_sales union all select occurred_on from public.finance_entries)t;
 if earliest is not null and p_first_month>date_trunc('month',earliest)::date then raise exception 'O início precisa incluir as movimentações já registradas';end if;
 insert into public.finance_closing_setup(singleton,first_month,opening_loss_cents,evidence,confirmed_by)values(true,p_first_month,p_opening_loss,trim(p_evidence),auth.uid());
 insert into public.finance_audit_log(actor_id,action,table_name,new_data)values(auth.uid(),'INITIALIZE','finance_closing_setup',jsonb_build_object('first_month',p_first_month,'opening_loss_cents',p_opening_loss));
end $f$;

create function public.finance_closing_summary(p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare m date:=date_trunc('month',p_month)::date;s jsonb;setup public.finance_closing_setup;prev public.finance_loss_closures;saved public.finance_loss_closures;closed public.finance_months;expected date;loss bigint;calc jsonb;
begin
 if not coalesce(public.has_staff_role(array['administrador'])or public.management_is_reader(),false)then raise exception 'Acesso negado';end if;
 if p_month is null then raise exception 'Competência obrigatória';end if;
 s:=public.management_finance_summary(m);
 select * into setup from public.finance_closing_setup where singleton;
 select * into prev from public.finance_loss_closures order by month desc limit 1;
 expected:=coalesce((prev.month+interval '1 month')::date,setup.first_month);
 select * into saved from public.finance_loss_closures where month=m;
 select * into closed from public.finance_months where month=m;
 if saved.month is not null then
  return s||to_jsonb(saved)||jsonb_build_object('configured',true,'sequence_ready',true,'next_month',expected,'pool_cents',closed.pool_cents,'retained_cents',closed.retained_cents,'profit_cents',closed.profit_cents);
 end if;
 loss:=coalesce(prev.closing_loss_cents,setup.opening_loss_cents);
 if setup.singleton is not null and m=expected and s->>'profit_cents' is not null then calc:=public.finance_loss_calculation((s->>'profit_cents')::bigint,loss,m>=date '2026-12-01' and m<date '2027-06-01');end if;
 return s||coalesce(calc,'{}'::jsonb)||jsonb_build_object('configured',setup.singleton is not null,'first_month',setup.first_month,'next_month',expected,'sequence_ready',coalesce(m=expected,false));
end $f$;

-- Protege também chamadas ao fechamento legado: sua definição permanece intocada.
create function public.finance_validate_loss_closure()
returns trigger language plpgsql security definer set search_path='' as $f$
declare s jsonb;expected_pool bigint;
begin
 perform public.finance_require_admin();
 if not coalesce(public.has_staff_role(array['administrador']),false) then raise exception 'Acesso financeiro negado';end if;
 perform pg_advisory_xact_lock(83022,1);
 -- AFTER INSERT já vê finance_months; o saldo anterior vem apenas do histórico de perdas.
 s:=public.finance_closing_summary(new.month);
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
create trigger finance_loss_closure_guard after insert on public.finance_months for each row execute function public.finance_validate_loss_closure();

create function public.finance_guard_closing_start()
returns trigger language plpgsql security definer set search_path='' as $f$
declare first_day date;
begin
 select first_month into first_day from public.finance_closing_setup where singleton;
 if first_day is not null and new.occurred_on<first_day then raise exception 'Data anterior ao início confirmado da apuração';end if;
 return new;
end $f$;
create trigger finance_sale_start_guard before insert or update on public.finance_sales for each row execute function public.finance_guard_closing_start();
create trigger finance_entry_start_guard before insert or update on public.finance_entries for each row execute function public.finance_guard_closing_start();

create function public.finance_close_period(p_month date,p_reconciled boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare m date:=date_trunc('month',p_month)::date;s jsonb;profit bigint;pool bigint;
begin
 perform public.finance_lock_open(m);
 perform pg_advisory_xact_lock(83022,1);
 if p_reconciled is distinct from true then raise exception 'Confirme a conferência das vendas, custos, saldos e despesas';end if;
 s:=public.finance_closing_summary(m);
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
 return public.finance_closing_summary(m);
end $f$;
revoke all on function public.finance_loss_calculation(bigint,bigint,boolean),public.finance_configure_closing(date,bigint,text),public.finance_closing_summary(date),public.finance_validate_loss_closure(),public.finance_guard_closing_start(),public.finance_close_period(date,boolean) from public,anon,authenticated;
grant execute on function public.finance_configure_closing(date,bigint,text),public.finance_closing_summary(date),public.finance_close_period(date,boolean) to authenticated;
commit;
