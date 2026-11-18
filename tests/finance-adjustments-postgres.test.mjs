import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync,spawn}from'node:child_process';import{randomUUID}from'node:crypto';
if(process.env.FINANCE_FIXTURE_PORT!=='55439')throw Error('Fixture descartável em 55439 obrigatória.');
const master='00000000-0000-0000-0000-000000000001',partner='00000000-0000-0000-0000-000000000002',reader='00000000-0000-0000-0000-000000000003';
const args=['-X','-qAt','-h','127.0.0.1','-p','55439','-U','postgres','-d','finance_fixture','-v','ON_ERROR_STOP=1'];
const raw=sql=>{const r=spawnSync('psql',[...args,'-c',sql],{encoding:'utf8'});return{ok:r.status===0,out:r.stdout.trim(),err:r.stderr}};
const q=sql=>{const r=raw(sql);assert.equal(r.ok,true,r.err);return r.out};
const role=(id,sql,aal='aal2')=>"set role authenticated;set request.jwt.claim.sub='"+id+"';set request.jwt.claim.aal='"+aal+"';"+sql;
const admin=sql=>q(role(master,sql));const no=(sql,id=master,aal='aal2')=>assert.equal(raw(role(id,sql,aal)).ok,false);
const report=m=>JSON.parse(admin("select public.finance_adjusted_summary('"+m+"-01')"));
const close=m=>JSON.parse(admin("select public.finance_close_adjusted_period('"+m+"-01',true)"));
let account,other,sale,expense,transfer,refundId,refundSQL,entry;
const refund=(id,month,rev=20000,freight=1000,cost=8000,fee=600,shipping=400,bank=account)=>"select public.finance_refund_sale('"+id+"','"+sale+"','"+month+"-05',"+[rev,freight,cost,fee,shipping].join(',')+",'"+bank+"','"+account+"','"+account+"','Fixture devolução comprovada','Fixture comprovante')";
const reverse=(id,target,day,amount,bank=account)=>"select public.finance_reverse_entry('"+id+"','"+target+"','"+day+"',"+amount+","+(bank?"'"+bank+"'":"null")+",'Fixture correção comprovada','Fixture comprovante')";
test('fontes reais são registradas e outubro fecha sem alterar fórmula anterior',()=>{
 account=admin("select public.finance_create_account('Fixture caixa',0)");other=admin("select public.finance_create_account('Fixture banco',0)");
 admin("select public.finance_configure_closing('2026-10-01',0,'Fixture base conferida')");
 sale=admin("select public.finance_record_sale('2026-10-02','fixture-original',null,'presencial','envio','"+account+"',100000,5000,40000,3000,2000,'Fixture custo','"+account+"','"+account+"')");
 admin("select public.finance_add_entry('2026-10-03','"+account+"','saida','operacional','Fixture aluguel',10000,true)");
 assert.equal(close('2026-10').profit_cents,50000);
});
test('ajustes exigem administrador com MFA e não permitem escrita direta',()=>{
 const sql=refund(randomUUID(),'2026-11');
 no(sql,reader);no(sql,partner);no(sql,master,'aal1');
 no("insert into public.finance_adjustments(id,kind,occurred_on,request_data,reason,evidence)values(gen_random_uuid(),'sale_refund','2026-11-05','{}','Fixture proibida','xxx')");
 assert.equal(raw("set role anon;select public.finance_adjusted_summary('2026-11-01')").ok,false);
});
test('devolução parcial distingue caixa, custo, taxas e frete sem dupla despesa',()=>{
 refundId=randomUUID();refundSQL=refund(refundId,'2026-11');assert.equal(admin(refundSQL),refundId);
 const s=report('2026-11');assert.equal(s.revenue_cents,-21000);assert.equal(s.cost_cents,-8000);assert.equal(s.fee_cents,-600);assert.equal(s.shipping_paid_cents,-400);assert.equal(s.profit_cents,-12000);
 const row=JSON.parse(admin("select row_to_json(x)from public.finance_adjustment_register x where id='"+refundId+"'"));
 assert.equal(row.cash_out_cents,21000);assert.equal(row.cash_in_cents,1000);assert.equal(row.profit_delta_cents,-12000);
 assert.equal(q("select count(*)from public.finance_adjustment_links where adjustment_id='"+refundId+"'"),'3');
 assert.equal(q("select count(*)from public.finance_entries where category='ajuste_financeiro' and impacts_profit"),'0');
 assert.equal(q("select cost_cents from public.finance_sales where id='"+sale+"'"),'40000');
 assert.equal(q("select profit_cents from public.finance_months where month='2026-10-01'"),'50000');
});
test('retry idêntico é idempotente; chave reutilizada com outros valores é rejeitada',()=>{
 assert.equal(admin(refundSQL),refundId);assert.equal(q("select count(*)from public.finance_adjustments where id='"+refundId+"'"),'1');
 no(refund(refundId,'2026-11',1,0,0,0,0));
});
test('limites cumulativos e datas impedem devolver mais que os valores comprovados',()=>{
 for(const values of [[80001,0,0,0,0],[0,4001,0,0,0],[0,0,32001,0,0],[0,0,0,2401,0],[0,0,0,0,1601],[-1,0,0,0,0],[0,0,0,0,0]])no(refund(randomUUID(),'2026-11',...values));
 no(refund(randomUUID(),'2026-09',1,0,0,0,0));no(refund(randomUUID(),'2026-10',1,0,0,0,0));no(refund(randomUUID(),'2028-01',1,0,0,0,0));
});
test('falha de conta não deixa evento, auditoria nem caixa parcialmente gravados',()=>{
 const id=randomUUID();no(refund(id,'2026-11',1,0,0,0,0,'99999999-9999-9999-9999-999999999999'));
 assert.equal(q("select count(*)from public.finance_adjustments where id='"+id+"'"),'0');
 assert.equal(q("select count(*)from public.finance_adjustment_links where adjustment_id='"+id+"'"),'0');
 assert.equal(q("select count(*)from public.finance_audit_log where row_id='"+id+"'"),'0');
});
test('venda com ajuste não permite reescrever o custo conhecido pelo RPC legado',()=>{
 const separate=admin("select public.finance_record_sale('2026-11-01','fixture-open-source',null,'presencial','retirada','"+account+"',1000,0,500,0,0,'Fixture nota')");
 const sql="select public.finance_refund_sale('"+randomUUID()+"','"+separate+"','2026-11-02',100,0,0,0,0,'"+account+"',null,null,'Fixture devolução parcial','Fixture nota')";
 admin(sql);no("select public.finance_set_sale_cost('"+separate+"',100,'Tentativa de regravar')");
 assert.equal(q("select cost_cents from public.finance_sales where id='"+separate+"'"),'500');
 // Net effect of this independent sale and refund is +400 in November.
});
test('despesa operacional admite estorno parcial e limita o total recuperado',()=>{
 expense=admin("select public.finance_add_entry('2026-11-03','"+account+"','saida','operacional','Fixture despesa',5000,true)");
 entry=admin(reverse(randomUUID(),expense,'2026-11-06',2000));const s=report('2026-11');assert.equal(s.expenses_cents,3000);assert.equal(s.profit_cents,-14600);
 no(reverse(randomUUID(),expense,'2026-11-06',3001));no(reverse(randomUUID(),expense,'2026-11-02',1));
 const source=JSON.parse(admin("select public.finance_adjustment_source('entry','"+expense+"')"));assert.equal(source.amount,3000);
});
test('entrada sem efeito em lucro é estornada somente no caixa',()=>{
 const original=admin("select public.finance_add_entry('2026-11-04','"+account+"','entrada','aporte','Fixture aporte',1000,false)");
 const before=report('2026-11').profit_cents;const id=admin(reverse(randomUUID(),original,'2026-11-07',400));
 assert.equal(report('2026-11').profit_cents,before);assert.equal(q("select profit_delta_cents from public.finance_adjustments where id='"+id+"'"),'0');
});
test('lançamentos automáticos de vendas e ajustes não são estornados isoladamente',()=>{
 const auto=q("select id from public.finance_entries where sale_id='"+sale+"'");
 no(reverse(randomUUID(),auto,'2026-11-06',100));
 const mirrored=q("select entry_id from public.finance_adjustment_links where adjustment_id='"+refundId+"' limit 1");
 no(reverse(randomUUID(),mirrored,'2026-11-06',100));
 no("select public.finance_add_entry('2026-11-06','"+account+"','entrada','ajuste_financeiro','Fixture indevida',1,false)");
});
test('transferência é revertida nas duas contas, sem lucro ou entradas infladas no caixa mensal',()=>{
 transfer=admin("select public.finance_transfer('2026-11-04','"+account+"','"+other+"',10000,'Fixture transferência')");
 const target=q("select id from public.finance_entries where transfer_id='"+transfer+"' order by id limit 1");const before=report('2026-11').profit_cents;
 no(reverse(randomUUID(),target,'2026-11-06',5000,null));no(reverse(randomUUID(),target,'2026-11-06',10000,account));
 const id=admin(reverse(randomUUID(),target,'2026-11-06',10000,null));assert.equal(report('2026-11').profit_cents,before);
 assert.equal(q("select count(*)from public.finance_adjustment_links where adjustment_id='"+id+"'"),'2');
 assert.equal(q("select sum(case when direction='entrada' then amount_cents else -amount_cents end)from public.finance_entries where category='transferencia'"),'0');
 no(reverse(randomUUID(),target,'2026-11-06',10000,null));
});
test('ajustes são imutáveis e deixam referência ao original na auditoria',()=>{
 assert.equal(raw("update public.finance_adjustments set reason='Tentativa de alteração' where id='"+refundId+"'").ok,false);
 assert.equal(raw("delete from public.finance_adjustments where id='"+refundId+"'").ok,false);
 assert.equal(q("select count(*)from public.finance_audit_log where row_id='"+refundId+"' and table_name='finance_adjustments' and actor_id='"+master+"'"),'1');
});
test('fechamento ajustado carrega o prejuízo e retry confirmado continua válido após fechar',()=>{
 const s=close('2026-11');assert.equal(s.profit_cents,-14600);assert.equal(s.closing_loss_cents,14600);
 assert.equal(admin(refundSQL),refundId);no(refund(randomUUID(),'2026-11',1,0,0,0,0));
});
test('fechamento antigo não pode ignorar devolução e novo rateio usa resultado líquido ajustado',()=>{
 admin("select public.finance_record_sale('2026-12-01','fixture-new-sale',null,'presencial','retirada','"+account+"',50000,0,10000,0,0,'Fixture custo')");
 admin(refund(randomUUID(),'2026-12',10000,0,4000,0,0));
 no("select public.finance_close_period('2026-12-01',true)");
 assert.equal(q("select count(*)from public.finance_months where month='2026-12-01'"),'0');
 const s=close('2026-12');assert.equal(s.profit_cents,34000);assert.equal(s.opening_loss_cents,14600);assert.equal(s.distributable_cents,19400);assert.equal(s.pool_cents,9700);assert.equal(s.retained_cents,24300);
 assert.equal(q("select sum(amount_cents)from public.finance_payouts where month='2026-12-01'"),'9700');
 assert.equal(q("select profit_cents from public.finance_months where month='2026-10-01'"),'50000');
});
test('custo desconhecido não é recuperado por suposição e continua bloqueando o fechamento',()=>{
 const pending=admin("select public.finance_record_sale('2027-01-01','fixture-unknown',null,'presencial','retirada','"+account+"',1000,0,null,0,0,null)");
 const id=randomUUID();const make=cost=>"select public.finance_refund_sale('"+id+"','"+pending+"','2027-01-02',1000,0,"+cost+",0,0,'"+account+"',null,null,'Fixture cancelamento total','Fixture comprovante')";
 no(make(1));admin(make(0));assert.equal(report('2027-01').profit_cents,null);no("select public.finance_close_adjusted_period('2027-01-01',true)");
 admin("select public.finance_set_sale_cost('"+pending+"',500,'Fixture custo histórico recuperado')");
 assert.equal(report('2027-01').profit_cents,-500);
});
test('consulta vê resultado e histórico equivalentes, mas sócias individuais e MFA ausente são bloqueados',()=>{
 const view=JSON.parse(q(role(reader,"select public.finance_adjusted_summary('2026-12-01')")));assert.equal(view.pool_cents,9700);
 assert.equal(q(role(reader,"select count(*)from public.finance_adjustment_register")),q("select count(*)from public.finance_adjustments"));
 assert.equal(q(role(partner,"select count(*)from public.finance_adjustment_register")),'0');
 no("select public.finance_adjusted_summary('2026-12-01')",partner);no("select public.finance_adjusted_summary('2026-12-01')",reader,'aal1');
 no("select public.finance_close_adjusted_period('2027-01-01',true)",reader);
});
const asyncRaw=sql=>new Promise(resolve=>{const p=spawn('psql',[...args,'-c',sql]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>resolve({ok:code===0,out,err}));});
test('pedidos concorrentes com a mesma chave criam um único ajuste e uma única saída',async()=>{
 const id=randomUUID();const sql=role(master,refund(id,'2027-01',100,0,0,0,0));const r=await Promise.all([asyncRaw(sql),asyncRaw(sql)]);
 assert.equal(r.every(x=>x.ok),true,JSON.stringify(r));assert.equal(q("select count(*)from public.finance_adjustments where id='"+id+"'"),'1');assert.equal(q("select count(*)from public.finance_adjustment_links where adjustment_id='"+id+"'"),'1');
});
test('reembolsos concorrentes com chaves diferentes não excedem o saldo disponível',async()=>{
 const remaining=Number(JSON.parse(admin("select public.finance_adjustment_source('sale','"+sale+"')")).revenue);
 const r=await Promise.all([asyncRaw(role(master,refund(randomUUID(),'2027-01',remaining,0,0,0,0))),asyncRaw(role(master,refund(randomUUID(),'2027-01',remaining,0,0,0,0)))]);
 assert.equal(r.filter(x=>x.ok).length,1,JSON.stringify(r));assert.equal(Number(JSON.parse(admin("select public.finance_adjustment_source('sale','"+sale+"')")).revenue),0);
});
test('pagamentos de sócios não podem ser estornados como despesa ou entrada manual',()=>{
 const payout=q("select id from public.finance_payouts where month='2026-12-01' and amount_cents>0 limit 1");
 admin("select public.finance_mark_paid('"+payout+"','"+account+"','2027-01-05')");
 const target=q("select id from public.finance_entries where payout_id='"+payout+"'");
 no(reverse(randomUUID(),target,'2027-01-06',1));
});

test('ajuste sem movimento de caixa concorre com fechamento sem escapar da competência',async()=>{
 const before=report('2027-01').profit_cents,id=randomUUID();
 const r=await Promise.all([asyncRaw(role(master,"select public.finance_close_adjusted_period('2027-01-01',true)")),asyncRaw(role(master,refund(id,'2027-01',0,0,2000,0,0)))]);
 assert.equal(r[0].ok,true,r[0].err);
 const closed=report('2027-01');assert.equal(closed.profit_cents,before+(r[1].ok?2000:0));
 assert.equal(q("select count(*)from public.finance_adjustments where id='"+id+"'"),r[1].ok?'1':'0');
 if(r[1].ok)assert.equal(q("select count(*)from public.finance_adjustment_links where adjustment_id='"+id+"'"),'0');
});
test('estornar duas pernas de uma transferência simultaneamente cria somente um par reverso',async()=>{
 const original=admin("select public.finance_transfer('2027-02-01','"+account+"','"+other+"',1234,'Fixture concorrente')");
 const ids=JSON.parse(q("select json_agg(id order by id)from public.finance_entries where transfer_id='"+original+"'"));
 const r=await Promise.all(ids.map(id=>asyncRaw(role(master,reverse(randomUUID(),id,'2027-02-02',1234,null)))));
 assert.equal(r.filter(x=>x.ok).length,1,JSON.stringify(r));assert.equal(q("select count(*)from public.finance_adjustments where transfer_id='"+original+"'"),'1');
});
