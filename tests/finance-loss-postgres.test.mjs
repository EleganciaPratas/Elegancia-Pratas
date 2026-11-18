// Executar somente no PostgreSQL descartável criado em nuvem; nunca usa o Supabase de produção.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
if(process.env.FINANCE_FIXTURE_PORT!=='55439')throw Error('Fixture na porta 55439 obrigatória.');
const master='00000000-0000-0000-0000-000000000001',partner='00000000-0000-0000-0000-000000000002',reader='00000000-0000-0000-0000-000000000003';
const raw=sql=>{const r=spawnSync('psql',['-X','-qAt','-h','127.0.0.1','-p','55439','-U','postgres','-d','finance_fixture','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8'});return{ok:r.status===0,out:r.stdout.trim(),err:r.stderr}};
const query=sql=>{const r=raw(sql);assert.equal(r.ok,true,r.err);return r.out};
const role=(id,sql,aal='aal2')=>"set role authenticated;set request.jwt.claim.sub='"+id+"';set request.jwt.claim.aal='"+aal+"';"+sql;
const admin=sql=>query(role(master,sql));
const denied=(sql,id=master,aal='aal2')=>assert.equal(raw(role(id,sql,aal)).ok,false);
const summary=m=>JSON.parse(admin("select public.finance_closing_summary('"+m+"-01')"));
const close=m=>JSON.parse(admin("select public.finance_close_period('"+m+"-01',true)"));
let account,pending;
test('SQL real compensa perdas, preserva centavos e não distribui fora do plano',()=>{
 for(const [profit,loss,eligible,available,carry,pool]of [[-10000,1000,true,0,11000,0],[6000,11000,true,0,5000,0],[15001,5000,true,10001,0,5000],[5000,5000,true,0,0,0],[10001,0,false,10001,0,0],[0,500,true,0,500,0]]){
  const r=JSON.parse(query("select public.finance_loss_calculation("+profit+","+loss+","+eligible+")"));
  assert.equal(r.distributable_cents,available);assert.equal(r.closing_loss_cents,carry);assert.equal(r.pool_cents,pool);assert.equal(r.retained_cents,profit-pool);
 }
 assert.equal(raw("select public.finance_loss_calculation(100,-1,true)").ok,false);
});
test('sem base o repasse não é presumido; MFA e administrador são obrigatórios',()=>{
 assert.equal(summary('2026-10').configured,false);assert.equal(summary('2026-10').pool_cents,undefined);
 const sql="select public.finance_configure_closing('2026-10-01',1000,'Fixture conferida')";
 denied(sql,partner);denied(sql,reader);denied(sql,master,'aal1');
 denied("insert into public.finance_closing_setup values(true,'2026-10-01',0,'Fixture conferida','"+master+"',now())");
 denied("select public.finance_close_period('2026-10-01',true)");
});
test('base exige mês inicial, valor válido e evidência; não altera saldos existentes',()=>{
 account=admin("select public.finance_create_account('Fixture caixa',12345)");
 for(const args of ["null,0,'Fixture conferida'","'2026-10-02',0,'Fixture conferida'","'2027-08-01',0,'Fixture conferida'","'2026-10-01',-1,'Fixture conferida'","'2026-10-01',0,'curta'"])denied("select public.finance_configure_closing("+args+")");
 admin("select public.finance_configure_closing('2026-10-01',1000,'Fixture saldo anterior conferido')");
 assert.equal(query("select opening_cents from public.finance_accounts where id='"+account+"'"),'12345');
 denied("select public.finance_configure_closing('2026-09-01',0,'Segunda tentativa')");
});
test('fechamento é mensal, cronológico e exige reconciliação',()=>{
 assert.equal(summary('2026-12').sequence_ready,false);assert.equal(summary('2026-12').pool_cents,undefined);
 denied("select public.finance_close_period('2026-12-01',true)");
 denied("select public.finance_close_period('2026-10-01',false)");
 denied("select public.finance_close_period('2027-07-01',true)");
});
test('mês com prejuízo fecha sem repasses e carrega perda anterior',()=>{
 admin("select public.finance_add_entry('2026-10-05','"+account+"','saida','operacional','Fixture despesa',10000,true)");
 const s=close('2026-10');assert.equal(s.profit_cents,-10000);assert.equal(s.opening_loss_cents,1000);assert.equal(s.closing_loss_cents,11000);assert.equal(s.pool_cents,0);
 assert.equal(query("select count(*)from public.finance_payouts"),'0');
 assert.equal(s.closed,true);
});
test('legado continua bloqueando escrita em mês fechado; início confirmado também é protegido',()=>{
 denied("select public.finance_add_entry('2026-10-06','"+account+"','saida','operacional','Fixture proibida',100,true)");
 denied("select public.finance_add_entry('2026-09-06','"+account+"','saida','operacional','Fixture anterior',100,true)");
 denied("select public.finance_close_period('2026-10-01',true)");
});
test('custo ausente bloqueia apuração e fechamento; conferência usa custo histórico',()=>{
 pending=admin("select public.finance_record_sale('2026-11-05','fixture-recovery',null,'presencial','retirada','"+account+"',9000,0,null,0,0,null)");
 assert.equal(summary('2026-11').profit_cents,null);
 denied("select public.finance_close_period('2026-11-01',true)");
 admin("select public.finance_set_sale_cost('"+pending+"',3000,'Fixture nota histórica')");
 const s=close('2026-11');assert.equal(s.profit_cents,6000);assert.equal(s.absorbed_loss_cents,6000);assert.equal(s.closing_loss_cents,5000);assert.equal(s.pool_cents,0);
});
test('chamada legada não pode ignorar prejuízo acumulado e falha atomicamente',()=>{
 admin("select public.finance_record_sale('2026-12-05','fixture-positive',null,'presencial','retirada','"+account+"',15001,0,0,0,0,'Fixture custo zero comprovado')");
 denied("select public.finance_close_month('2026-12-01',true)");
 assert.equal(query("select count(*)from public.finance_months where month='2026-12-01'"),'0');
 assert.equal(query("select count(*)from public.finance_payouts where month='2026-12-01'"),'0');
});
test('lucro excedente cria exatamente os repasses 60/25/15 com arredondamento existente',()=>{
 const s=close('2026-12');assert.equal(s.profit_cents,15001);assert.equal(s.absorbed_loss_cents,5000);assert.equal(s.distributable_cents,10001);assert.equal(s.pool_cents,5000);assert.equal(s.retained_cents,10001);
 const amounts=JSON.parse(query("select json_object_agg(p.partner_key,v.amount_cents)from public.finance_payouts v join public.finance_partners p on p.id=v.partner_id where month='2026-12-01'"));
 assert.deepEqual(amounts,{aurizinete:3000,elizabete:1250,caio:750});
 denied("select public.finance_close_period('2026-12-01',true)");
 assert.equal(query("select count(*)from public.finance_payouts where month='2026-12-01'"),'3');
});
test('novo prejuízo é acumulado e recuperação exata não gera repasse',()=>{
 admin("select public.finance_add_entry('2027-01-05','"+account+"','saida','operacional','Fixture prejuízo',8000,true)");
 const a=close('2027-01');assert.equal(a.closing_loss_cents,8000);assert.equal(a.pool_cents,0);
 admin("select public.finance_record_sale('2027-02-05','fixture-exact',null,'presencial','retirada','"+account+"',8000,0,0,0,0,'Fixture custo zero comprovado')");
 const b=close('2027-02');assert.equal(b.closing_loss_cents,0);assert.equal(b.distributable_cents,0);assert.equal(b.pool_cents,0);
});
test('meses vazios preservam continuidade e fechamento continua após o plano',()=>{
 for(const m of ['2027-03','2027-04','2027-05'])assert.equal(close(m).pool_cents,0);
 admin("select public.finance_record_sale('2027-06-05','fixture-post-plan',null,'presencial','retirada','"+account+"',10000,0,0,0,0,'Fixture custo zero comprovado')");
 const s=close('2027-06');assert.equal(s.eligible,false);assert.equal(s.pool_cents,0);assert.equal(s.retained_cents,10000);
 assert.equal(query("select count(*)from public.finance_payouts where month='2027-06-01'"),'0');
 denied("select public.finance_close_period('2027-07-01',true)");
});
test('consulta vê a mesma compensação e não ganha permissão de escrita nem sem MFA',()=>{
 const read=JSON.parse(query(role(reader,"select public.finance_closing_summary('2026-12-01')")));
 assert.equal(read.pool_cents,5000);assert.equal(read.absorbed_loss_cents,5000);
 denied("select public.finance_close_period('2027-07-01',true)",reader);
 denied("select public.finance_closing_summary('2026-12-01')",reader,'aal1');
 denied("select public.finance_closing_summary('2026-12-01')",partner);
 denied("update public.finance_loss_closures set closing_loss_cents=0",reader);
 assert.equal(raw("set role anon;select public.finance_closing_summary('2026-12-01')").ok,false);
});

const asyncRaw=sql=>new Promise(resolve=>{const child=spawn('psql',['-X','-qAt','-h','127.0.0.1','-p','55439','-U','postgres','-d','finance_fixture','-v','ON_ERROR_STOP=1','-c',sql]);let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>resolve({ok:code===0,out,err}));});
test('duas chamadas simultâneas fecham uma única vez, sem duplicar histórico',async()=>{
 query("create or replace function public.finance_today() returns date language sql stable security invoker set search_path='' as $$select date '2027-09-02'$$");
 const sql=role(master,"select public.finance_close_period('2027-07-01',true)");
 const results=await Promise.all([asyncRaw(sql),asyncRaw(sql)]);
 assert.equal(results.filter(r=>r.ok).length,1);
 assert.equal(query("select count(*)from public.finance_months where month='2027-07-01'"),'1');
 assert.equal(query("select count(*)from public.finance_loss_closures where month='2027-07-01'"),'1');
});
test('lançamento concorrente ao fechamento entra na apuração ou é bloqueado integralmente',async()=>{
 const results=await Promise.all([
 asyncRaw(role(master,"select public.finance_close_period('2027-08-01',true)")),
 asyncRaw(role(master,"select public.finance_add_entry('2027-08-05','"+account+"','saida','operacional','Fixture concorrente',100,true)"))
 ]);
 assert.equal(results[0].ok,true,results[0].err);
 const s=summary('2027-08');
 assert.equal(s.profit_cents,results[1].ok?-100:0);
 assert.equal(s.closing_loss_cents,results[1].ok?100:0);
 assert.equal(query("select profit_cents from public.finance_months where month='2027-08-01'"),String(s.profit_cents));
});

test('predicado de autorização nulo não libera as novas consultas e mutações',()=>{
 for(const call of ["select public.finance_closing_summary('2027-09-01')","select public.finance_close_period('2027-09-01',true)","select public.finance_configure_closing('2026-10-01',0,'Fixture conferida')"]){
  assert.equal(raw("begin;create or replace function public.has_staff_role(required_roles text[]) returns boolean language sql stable security definer set search_path='' as $$select null::boolean$$;"+role(master,call)+";rollback;").ok,false);
 }
});
