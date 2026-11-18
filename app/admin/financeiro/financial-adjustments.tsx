'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {brl} from '@/lib/products';
import {ErrorState,Skeleton} from '../ui/components';
import './adjustments.css';
type Account={id:string;name:string};
type Sale={id:string;reference:string;occurred_on:string};
type Entry={id:string;description:string;occurred_on:string;account_id:string;amount_cents:number;category:string;transfer_id?:string|null;sale_id?:string|null;related_sale_id?:string|null;payout_id?:string|null};
type Source={reference:string;source_date:string;revenue?:number;freight?:number;cost?:number;fee?:number;shipping?:number;cost_known?:boolean;allowed?:boolean;transfer?:boolean;amount?:number};
type EventRow={id:string;kind:string;kind_label:string;occurred_on:string;source_reference:string;reason:string;evidence:string;cash_in_cents:number;cash_out_cents:number;profit_delta_cents:number;cost_recovered_cents:number};
type Props={db:SupabaseClient;month:string;accounts:Account[];sales:Sale[];entries:Entry[];onSaved:(day:string)=>void;onNotice:(message:string)=>void;onBusyChange:(busy:boolean)=>void};
const emptyValues={revenue:'0',freight:'0',cost:'0',fee:'0',shipping:'0'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function cents(value:FormDataEntryValue|null){const s=String(value??'0').trim();if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Informe valores com até duas casas decimais.');const[a,b='']=s.split('.');const amount=BigInt(a)*BigInt(100)+BigInt(b.padEnd(2,'0'));if(amount>BigInt(999999999999))throw Error('Valor acima do limite.');return Number(amount)}
const labels:Record<string,string>={revenue:'Valor das peças devolvido ao cliente',freight:'Frete devolvido ao cliente',cost:'Custo recuperado das peças devolvidas',fee:'Taxa efetivamente ressarcida',shipping:'Frete pago efetivamente ressarcido'};
export default function FinancialAdjustments({db,month,accounts,sales,entries,onSaved,onNotice,onBusyChange}:Props){
 const[kind,setKind]=useState('sale'),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[source,setSource]=useState<Source|null>(null),[sourceError,setSourceError]=useState(false),[sourceRevision,setSourceRevision]=useState(0),[sourceLoading,setSourceLoading]=useState(false);
 const[values,setValues]=useState(emptyValues),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
 const[events,setEvents]=useState<EventRow[]>([]),[page,setPage]=useState(0),[count,setCount]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 const pending=useRef<{rpc:string;args:Record<string,unknown>;day:string}|null>(null);
 useEffect(()=>{let active=true;setSource(null);setSourceError(false);if(!selected){setSourceLoading(false);return}setSourceLoading(true);
 void db.rpc('finance_adjustment_source',{p_kind:kind,p_id:selected}).then(({data,error})=>{if(!active)return;if(error)setSourceError(true);else setSource(data as Source);setSourceLoading(false)});
 return()=>{active=false};
 },[db,kind,selected,sourceRevision]);
 useEffect(()=>{let active=true;setLoading(true);setError(false);const[y,m]=month.split('-').map(Number);const next=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
 void db.from('finance_adjustment_register').select('id,kind,kind_label,occurred_on,source_reference,reason,evidence,cash_in_cents,cash_out_cents,profit_delta_cents,cost_recovered_cents',{count:'exact'}).gte('occurred_on',month+'-01').lt('occurred_on',next).order('occurred_on',{ascending:false}).order('id').range(page*20,page*20+19).then(({data,count,error})=>{if(!active)return;if(error)setError(true);else{setEvents((data??[]) as EventRow[]);setCount(count??0)}setLoading(false)});
 return()=>{active=false};
 },[db,month,page,revision]);
 const originalEntries=entries.filter(e=>!e.sale_id&&!e.related_sale_id&&!e.payout_id&&(Boolean(e.transfer_id)||!['venda','taxa_venda','frete_venda','repasse_societario','ajuste_financeiro','transferencia'].includes(e.category))).filter((e,i,all)=>!e.transfer_id||all.findIndex(x=>x.transfer_id===e.transfer_id)===i);
 const candidates=(kind==='sale'?sales.map(s=>({id:s.id,title:s.reference,date:s.occurred_on})):originalEntries.map(e=>({id:e.id,title:e.description,date:e.occurred_on}))).filter(x=>x.id===selected||(x.title+' '+x.date).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
 function resetTarget(value:string){setSelected(value);setValues(emptyValues);setSource(null)}
 async function execute(request:{rpc:string;args:Record<string,unknown>;day:string}){
  setBusy(true);onBusyChange(true);onNotice('');
  try{
   const result=await db.rpc(request.rpc,request.args);
   if(result.error){
    if(/^[0-9A-Z]{5}$/.test(result.error.code??'')){setUncertain(false);pending.current=null;onNotice(result.error.code==='P0001'?result.error.message:'Confira os valores, as contas e a competência aberta. Nenhum ajuste foi concluído.');return}
    throw Error('Resposta não confirmada');
   }
   pending.current=null;setUncertain(false);onNotice('Ajuste registrado na competência '+request.day.slice(0,7)+'. O histórico original foi preservado.');onBusyChange(false);setBusy(false);onSaved(request.day);
  }catch{setUncertain(true);onNotice('A resposta não foi confirmada. Use “Conferir operação” para repetir a mesma solicitação com segurança, sem duplicar o ajuste.')}
  finally{setBusy(false);onBusyChange(Boolean(pending.current))}
 }
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy||uncertain||!source)return;const f=new FormData(event.currentTarget);const day=String(f.get('day'));
  try{
   let rpc:string,args:Record<string,unknown>;const requestId=crypto.randomUUID();
   if(kind==='sale'){
    const cost=cents(f.get('cost'));if(!['revenue','freight','cost','fee','shipping'].some(key=>cents(f.get(key))>0))throw Error('Informe pelo menos um valor devolvido ou recuperado.');if(cost>0&&f.get('usable')!=='on')throw Error('Confirme que as peças retornaram em condição de uso e que o custo está comprovado.');
    rpc='finance_refund_sale';args={p_request:requestId,p_sale:selected,p_day:day,p_revenue:cents(f.get('revenue')),p_shipping_refund:cents(f.get('freight')),p_cost_recovered:cost,p_fee_recovered:cents(f.get('fee')),p_shipping_recovered:cents(f.get('shipping')),p_refund_account:f.get('refundAccount')||null,p_fee_account:f.get('feeAccount')||null,p_shipping_account:f.get('shippingAccount')||null,p_reason:f.get('reason'),p_evidence:f.get('evidence')};
   }else{rpc='finance_reverse_entry';args={p_request:requestId,p_entry:selected,p_day:day,p_amount:source.transfer?source.amount:cents(f.get('amount')),p_account:source.transfer?null:f.get('account')||null,p_reason:f.get('reason'),p_evidence:f.get('evidence')}}
   const request={rpc,args,day};pending.current=request;await execute(request);
  }catch(ex){onNotice(ex instanceof Error?ex.message:'Confira os dados informados.')}
 }
 const accountField=(name:string,label:string,required:boolean,defaultValue='')=><label>{label}<select name={name} required={required} defaultValue={defaultValue}><option value="">Selecione a conta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>;
 return <div className="finance-adjustments">
 <section className="management-card"><h2>Estornos e devoluções</h2><p>Registre valores já conferidos. O ajuste será lançado na data informada, preservando a venda ou movimentação original e os meses fechados. Esta operação não movimenta dinheiro no banco nem altera o estoque.</p>
 {uncertain?<div className="finance-adjustment-recovery" role="status"><p>Há uma solicitação aguardando confirmação. Confira esta operação antes de iniciar outra.</p><button type="button" className="management-outline" disabled={busy} onClick={()=>{if(pending.current)void execute(pending.current)}}>Conferir operação</button></div>:<>
 <fieldset disabled={busy} className="finance-adjustment-fieldset"><legend>Origem do ajuste</legend><div className="finance-tabs">{[['sale','Venda: devolução ou ressarcimento'],['entry','Movimentação: estorno ou correção']].map(([value,title])=><button type="button" key={value} aria-pressed={kind===value} onClick={()=>{setKind(value);resetTarget('');setSearch('')}}>{title}</button>)}</div>
 <div className="management-fields"><label>Buscar registro original<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Referência ou descrição"/></label><label>{kind==='sale'?'Venda original':'Movimentação original'}<select value={selected} onChange={e=>resetTarget(e.target.value)}><option value="">Selecione o registro</option>{candidates.map(x=><option key={x.id} value={x.id}>{x.title} · {x.date}</option>)}</select></label></div>
 {!(kind==='sale'?sales:originalEntries).length&&<p>Nenhum registro elegível. Cadastre e confira a venda ou movimentação antes de registrar um ajuste.</p>}
 {sourceLoading?<Skeleton label="Conferindo saldo disponível"/>:sourceError?<ErrorState message="Não foi possível conferir o registro original." onRetry={()=>setSourceRevision(n=>n+1)}/>:source&&<>
 {kind==='sale'?<dl className="finance-adjustment-balances">{Object.entries(labels).map(([key,label])=><div key={key}><dt>{label} · disponível</dt><dd>{key==='cost'&&!source.cost_known?'Custo ainda não comprovado':brl(Number(source[key as keyof Source]??0))}</dd></div>)}</dl>:<p>{source.transfer?'A transferência será estornada integralmente nas duas contas originais.':'Valor ainda não estornado:'} <strong>{brl(source.amount??0)}</strong></p>}
 {kind==='entry'&&(!source.allowed||!source.amount)?<p role="status">Registro sem saldo elegível para estorno. Lançamentos de vendas, pagamentos de sócios e ajustes utilizam fluxos próprios.</p>:<form className="management-fields finance-adjustment-form" onSubmit={e=>void submit(e)} key={kind+selected}>
 <label>Data do ajuste<input name="day" type="date" min={source.source_date} max={today()} defaultValue={today()} required/></label>
 {kind==='sale'?<>
 {Object.entries(labels).map(([key,label])=><label key={key}>{label} (R$)<input name={key} type="number" min="0" max={Number(source[key as keyof Source]??0)/100} step="0.01" required={key!=='cost'||source.cost_known} disabled={key==='cost'&&!source.cost_known} value={values[key as keyof typeof values]} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/></label>)}
 {Number(values.cost)>0&&<label className="erp-inline-check management-wide"><input name="usable" type="checkbox" required/>Conferi o custo histórico e o retorno das peças em condição de uso. O estoque será conferido separadamente.</label>}
 {accountField('refundAccount','Conta da devolução ao cliente',Number(values.revenue)>0||Number(values.freight)>0)}
 {accountField('feeAccount','Conta que recebeu o ressarcimento da taxa',Number(values.fee)>0)}
 {accountField('shippingAccount','Conta que recebeu o ressarcimento do frete',Number(values.shipping)>0)}
 <p className="management-wide">Informe somente o que foi devolvido ou recuperado. Sem retorno aproveitável das peças, mantenha o custo recuperado em zero. Taxas e frete só são recuperados quando o ressarcimento realmente ocorreu.</p>
 </>:!source.transfer?<><label>Valor a estornar (R$)<input name="amount" type="number" min="0.01" max={(source.amount??0)/100} step="0.01" required defaultValue={((source.amount??0)/100).toFixed(2)}/></label>{accountField('account','Conta do estorno',true,entries.find(e=>e.id===selected)?.account_id)}</>:null}
 <label className="management-wide">Motivo<input name="reason" minLength={10} maxLength={240} required placeholder="Explique a devolução ou correção"/></label>
 <label className="management-wide">Referência do comprovante<input name="evidence" minLength={3} maxLength={240} required placeholder="Identificador para conferência, sem dados pessoais"/></label>
 <label className="erp-inline-check management-wide"><input type="checkbox" required/>Conferi os valores, a data, as contas e os comprovantes deste ajuste.</label>
 <button className="management-outline" disabled={busy||!accounts.length}>{busy?'Registrando…':'Registrar ajuste conferido'}</button>
 </form>}
 </>}
 </fieldset></>}
 </section>
 <section className="management-card"><h2>Histórico de ajustes · {month}</h2><p>Somente leitura. Ajustes não podem ser editados ou excluídos.</p>
 {error?<ErrorState message="Não foi possível carregar os ajustes." onRetry={()=>setRevision(n=>n+1)}/>:loading?<Skeleton label="Carregando histórico de ajustes"/>:events.length?<div className="finance-adjustment-history">{events.map(e=><article key={e.id}><header><strong>{e.kind_label}</strong><span>{e.occurred_on}</span></header><p>{e.source_reference}</p><dl><div><dt>Entrada no caixa</dt><dd>{brl(e.cash_in_cents)}</dd></div><div><dt>Saída do caixa</dt><dd>{brl(e.cash_out_cents)}</dd></div><div><dt>Efeito no lucro</dt><dd>{brl(e.profit_delta_cents)}</dd></div>{e.cost_recovered_cents>0&&<div><dt>Custo recuperado, sem entrada de dinheiro</dt><dd>{brl(e.cost_recovered_cents)}</dd></div>}</dl><details><summary>Ver justificativa e referência</summary><p>{e.reason}</p><p>{e.evidence}</p><small>Registro: {e.id}</small></details></article>)}</div>:<p>Nenhum ajuste registrado nesta competência. Use o quadro acima para registrar uma ocorrência conferida.</p>}
 {count>20&&<nav className="finance-tabs" aria-label="Páginas do histórico de ajustes"><button type="button" className="management-outline" disabled={page===0||loading} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page+1} de {Math.ceil(count/20)}</span><button type="button" className="management-outline" disabled={(page+1)*20>=count||loading} onClick={()=>setPage(p=>p+1)}>Próxima</button></nav>}
 </section>
 </div>;
}
