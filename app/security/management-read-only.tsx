'use client';
import Image from 'next/image';
import FinancialClosing, {type ClosingSummary} from '../admin/financeiro/financial-closing';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {brl} from '@/lib/products';
import {PageHeader,Skeleton,ErrorState} from '../admin/ui/components';
import OperationInsights from '../admin/operation-insights';
import {useIdentificationPhotos} from '@/lib/use-identification-photos';
import {commercialCalendar,todayInBrazil,upcomingReminders} from '../admin/colecoes/campanhas/calendar';
import {ideaSchema} from '../admin/colecoes/campanhas/schema';
import {readSets,fieldValue} from './read-only-catalog';
import './read-only.css';
type Row=Record<string,unknown>;
const pageSize=30;
function show(value:unknown,key:string):string{
 if(value===null||value===undefined||value==='')return '—';
 if(key.endsWith('_cents'))return brl(Number(value));
 if(key.endsWith('_bps'))return (Number(value)/100).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)&&/(?:_on|_at|^month)$/.test(key))return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:value.length===10?'UTC':'America/Sao_Paulo'}).format(new Date(value.length===10?value+'T12:00:00Z':value));
 if(typeof value==='boolean')return value?'Sim':'Não';
 if(Array.isArray(value))return value.map(x=>typeof x==='object'?show(x,''):String(x)).join(' · ');
 if(typeof value==='object')return Object.values(value as Record<string,unknown>).map(v=>show(v,'')).join(' · ');
 return String(value);
}
export default function ManagementReadOnly({db,pathname}:{db:SupabaseClient;pathname:string}){
 const sets=readSets(pathname),[tab,setTab]=useState(''),[month,setMonth]=useState(todayInBrazil().slice(0,7)),[search,setSearch]=useState(''),[page,setPage]=useState(0),[revision,setRevision]=useState(0);
 const dataset=sets.find(s=>s.key===tab)??sets[0];
 const[cash,setCash]=useState<Row|null>(null);
 const[rows,setRows]=useState<Row[]>([]),[count,setCount]=useState(0),[summary,setSummary]=useState<Row|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const isFinance=pathname.startsWith('/admin/financeiro'),isOverview=pathname==='/admin',isCampaign=pathname.includes('/campanhas');
 const paths=rows.map(r=>fieldValue(r,'jewelry_intake.identification_image_path')).flat().filter((p):p is string=>typeof p==='string');
 const photos=useIdentificationPhotos(db,paths);
 useEffect(()=>{let active=true;setLoading(true);setError(false);const timer=window.setTimeout(()=>{
 void(async()=>{
  try{
   let query=db.from(dataset.table).select(dataset.fields,{count:'exact'}).order(dataset.order??'id',{ascending:dataset.table!=='finance_sales'&&dataset.table!=='stock_movements'});
   const term=search.trim().replace(/[%_\\]/g,'').slice(0,100);
   if(term&&dataset.search)query=query.ilike(dataset.search,'%'+term+'%');
   if(dataset.monthField){
    const [year,m]=month.split('-').map(Number);const next=new Date(Date.UTC(year,m,1)).toISOString().slice(0,10);
    query=query.gte(dataset.monthField,month+'-01').lt(dataset.monthField,next);
   }
   if(pathname.startsWith('/admin/catalogo'))query=query.in('workflow_stage',['aguardando_catalogo','pronto']);
   if(dataset.table.startsWith('campaign_'))query=query.eq('archived',false);
   const[data,result,cashResult]=await Promise.all([
    query.range(page*pageSize,(page+1)*pageSize-1),
    isFinance?db.rpc('finance_closing_summary',{p_month:month+'-01'}):isOverview?db.rpc('management_sales_dashboard'):Promise.resolve({data:null,error:null}),
    isFinance?db.rpc('management_finance_cash',{p_month:month+'-01'}):Promise.resolve({data:null,error:null})
   ]);
   if(data.error||result.error||cashResult.error)throw Error('READ');
   if(active){setRows((data.data??[])as unknown as Row[]);setCount(data.count??0);setSummary(result.data as Row|null);setCash(cashResult.data as Row|null)}
  }catch{if(active)setError(true)}finally{if(active)setLoading(false)}
 })();
 },200);
 return()=>{active=false;window.clearTimeout(timer)};
 },[db,dataset.table,dataset.fields,dataset.search,dataset.order,dataset.monthField,month,search,page,revision,pathname,isFinance,isOverview]);
 const titles:Record<string,string>={'/admin':'Visão geral','/admin/joias':'Joias','/admin/colecoes':'Coleções','/admin/estoque':'Estoque','/admin/precificacao':'Precificação','/admin/catalogo':'Catálogo','/admin/financeiro':'Financeiro'};
 const title=isCampaign?'Calendário e campanhas':isFinance?'Financeiro':pathname.startsWith('/admin/integracoes')?'Integrações':titles[pathname]??'Consulta da gestão';
 const reminders=isCampaign?upcomingReminders(commercialCalendar(Number(todayInBrazil().slice(0,4))),todayInBrazil()):[];
 return <main className="management-page management-readonly">
 <PageHeader title={title} description="Acesso somente de leitura. Para fazer alterações, troque para a conta administradora."/>
 <section className="management-card readonly-banner" aria-label="Permissão atual"><strong>Caio Amaral · Somente consulta</strong><span>Cadastros, preços, estoque, pagamentos e campanhas estão protegidos contra alterações por esta conta.</span></section>
 {isOverview&&<OperationInsights/>}
 {pathname==='/admin/colecoes'&&<Link className="management-outline" href="/admin/colecoes/campanhas">Consultar calendário e campanhas</Link>}
 {pathname.startsWith('/admin/integracoes')&&<section className="management-card"><h2>Consulta de frete</h2><p>Os pesos e dimensões cadastrados aparecem abaixo. Conexões, credenciais e solicitações ao transportador são gerenciadas pelo administrador.</p><Link href="/admin/integracoes/frete">Consultar dados de envio</Link></section>}
 {isCampaign&&<section className="management-card"><h2>Próximas datas comerciais</h2>{reminders.length?reminders.map(x=><p key={x.key}>{x.date} · {x.title}</p>):<p>Sem lembretes comerciais na faixa atual.</p>}<p>As datas próprias e os planejamentos cadastrados estão nas abas abaixo.</p></section>}
 <div className="erp-toolbar">
 {isFinance&&<label>Competência<input type="month" value={month} onChange={e=>{if(e.target.value){setMonth(e.target.value);setPage(0)}}}/></label>}
 {dataset.search&&<label>Buscar<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="Buscar registros"/></label>}
 <button className="management-outline" type="button" onClick={()=>setRevision(n=>n+1)}>Atualizar consulta</button>
 </div>
 {!isOverview&&<nav className="finance-tabs" aria-label="Dados disponíveis para consulta">{sets.map(s=><button type="button" key={s.key} aria-pressed={dataset.key===s.key} onClick={()=>{setTab(s.key);setPage(0);setSearch('')}}>{s.title}</button>)}</nav>}
 {error?<ErrorState message="Não foi possível carregar a consulta. Confira o acesso e tente novamente." onRetry={()=>setRevision(n=>n+1)}/>:loading?<Skeleton label="Carregando consulta"/>:<>
 {cash&&<section className="management-card"><h2>Caixa</h2><dl className="readonly-metrics">{[['balance_cents','Saldo acumulado das contas'],['incoming_cents','Entradas do mês'],['outgoing_cents','Saídas do mês']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{show(cash[key],key)}</dd></div>)}</dl><p>Saldo de caixa e lucro são indicadores diferentes. Transferências entre contas não entram nas entradas e saídas mensais.</p></section>}
 {summary&&<section className="management-card"><h2>{isFinance?'Resultado mensal':'Vendas do site'}</h2><dl className="readonly-metrics">{(isFinance?[['revenue_cents','Vendas e frete recebido'],['cost_cents','Custo histórico'],['fee_cents','Taxas'],['shipping_paid_cents','Frete pago'],['expenses_cents','Despesas'],['profit_cents','Lucro líquido'],['missing_costs','Vendas com custo pendente'],['closed','Competência fechada']]:[['paid_orders','Pedidos pagos'],['gross_revenue_cents','Receita registrada'],['pending_orders','Pedidos pendentes']]).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='profit_cents'&&summary[key]===null?'Custo pendente':show(summary[key],key)}</dd></div>)}</dl></section>}
 {isFinance&&summary&&<FinancialClosing summary={summary as unknown as ClosingSummary} month={month} readOnly/>}
 {!isOverview&&(!rows.length?<section className="management-card"><h2>Nenhum registro encontrado</h2><p>Confira a competência ou ajuste a busca. Esta conta não cadastra dados.</p>{search&&<button type="button" className="management-outline" onClick={()=>{setSearch('');setPage(0)}}>Limpar busca</button>}</section>:dataset.cards?<div className="readonly-jewels">{rows.map((row,index)=>{const rawPath=fieldValue(row,'jewelry_intake.identification_image_path'),path=Array.isArray(rawPath)?rawPath[0]:rawPath,photo=typeof path==='string'?photos[path]:undefined;const image=photo||(Array.isArray(row.commercial_image_urls)?row.commercial_image_urls[0]:null)||row.image_url;return <article className="management-card readonly-jewel" key={String(row.id??index)}>{typeof image==='string'&&image?<Image src={image} unoptimized width={104} height={104} alt={String(row.name??'Joia')} style={{objectFit:'cover',borderRadius:8}}/>:<span className="readonly-no-photo">Sem foto</span>}<h2>{String(row.name??'Joia')}</h2><dl>{dataset.columns.slice(0,8).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{show(fieldValue(row,key),key)}</dd></div>)}</dl><details><summary>Ver detalhes</summary><dl>{dataset.columns.slice(8).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{show(fieldValue(row,key),key)}</dd></div>)}</dl></details></article>})}</div>:<section className="management-card"><div className="readonly-table" role="region" aria-label={dataset.title} tabIndex={0}><table><caption>{dataset.title} · somente consulta</caption><thead><tr>{dataset.columns.map(([key,label])=><th scope="col" key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={String(row.id??row.product_id??row.month??index)}>{dataset.columns.map(([key])=><td key={key}>{key==='content'?<SavedIdeas value={fieldValue(row,key)}/>:show(fieldValue(row,key),key)}</td>)}</tr>)}</tbody></table></div></section>)}
 {!isOverview&&<nav className="erp-toolbar" aria-label="Paginação da consulta"><button type="button" className="management-outline" disabled={page===0} onClick={()=>setPage(n=>n-1)}>Anterior</button><span>Página {page+1} · {count} registro(s)</span><button type="button" className="management-outline" disabled={(page+1)*pageSize>=count} onClick={()=>setPage(n=>n+1)}>Próxima</button></nav>}
 </>}
 </main>;
}

function SavedIdeas({value}:{value:unknown}){
 const parsed=ideaSchema.safeParse(value);
 if(!parsed.success)return <span>Conteúdo salvo indisponível para exibição.</span>;
 const idea=parsed.data,labels:Record<string,string>={post:'Post',carrossel:'Carrossel',stories:'Stories',reels:'Reels',promocao:'Promoção'};
 return <div className="readonly-ideas"><strong>{idea.campaignName}</strong><p>{idea.summary}</p><details><summary>Ver sugestões</summary>{idea.ideas.map((item,index)=><article key={index}><strong>{labels[item.format]} · {item.title}</strong><p>{item.copy}</p>{item.visual&&<p>Visual: {item.visual}</p>}{item.script&&<p>Roteiro: {item.script}</p>}<p>{item.cta}</p></article>)}</details></div>;
}
