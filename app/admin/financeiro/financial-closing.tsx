'use client';
import type {FormEvent} from 'react';
import {brl} from '@/lib/products';
import './finance.css';
export type ClosingSummary={
 configured:boolean;sequence_ready:boolean;first_month?:string|null;next_month?:string|null;
 opening_loss_cents?:number;absorbed_loss_cents?:number;closing_loss_cents?:number;
 distributable_cents?:number;pool_cents?:number;retained_cents?:number;eligible?:boolean;
 profit_cents:number|null;missing_costs:number;closed:boolean;
};
type Props={summary:ClosingSummary;month:string;readOnly?:boolean;busy?:boolean;reconciled?:boolean;onReconciled?:(value:boolean)=>void;onConfigure?:(event:FormEvent<HTMLFormElement>)=>void;onClose?:()=>void};
const money=(value:number|undefined)=>value===undefined?'—':brl(value);
export default function FinancialClosing({summary:s,month,readOnly=false,busy=false,reconciled=false,onReconciled,onConfigure,onClose}:Props){
 const currentMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
 const ended=month<currentMonth;
 return <section className="management-card finance-closing" aria-labelledby="finance-closing-title">
 <h2 id="finance-closing-title">Fechamento e compensação de prejuízos</h2>
 <p>O resultado positivo primeiro cobre o prejuízo acumulado. De dezembro/2026 a maio/2027, 50% do valor positivo restante formam o fundo dos sócios; a divisão permanece 60%, 25% e 15%.</p>
 {!s.configured?<><p role="status">Base de apuração ainda não confirmada. Nenhum valor de prejuízo anterior foi presumido.</p>
 {!readOnly&&onConfigure&&<details><summary>Confirmar base de apuração</summary><form className="management-fields" onSubmit={onConfigure}>
 <label>Primeira competência<input name="firstMonth" type="month" max={currentMonth} required/></label>
 <label>Prejuízo anterior a compensar (R$)<input name="openingLoss" type="number" min="0" step="0.01" required/></label>
 <label className="management-wide">Referência da conferência<input name="evidence" minLength={10} maxLength={240} required placeholder="Referência do demonstrativo conferido, sem dados pessoais"/></label>
 <p className="management-wide">Informe zero somente se a conferência comprovar que não há prejuízo anterior. O mês inicial deve incluir as movimentações já registradas. A confirmação será preservada e os fechamentos seguirão mês a mês, inclusive nos meses sem movimento.</p>
 <label className="erp-inline-check management-wide"><input type="checkbox" required/>Conferi o início da apuração, o prejuízo anterior e os saldos iniciais das contas.</label>
 <button className="management-outline" disabled={busy}>Confirmar base</button>
 </form></details>}</>:<>
 {!s.sequence_ready&&!s.closed&&<p role="status">Feche primeiro a competência {s.next_month?.slice(0,7)}. A projeção de repasses deste mês depende dos fechamentos anteriores.</p>}
 <dl className="finance-result">{[
 ['Prejuízo trazido dos meses anteriores',s.opening_loss_cents],
 ['Prejuízo compensado neste mês',s.absorbed_loss_cents],
 ['Prejuízo para os próximos meses',s.closing_loss_cents],
 ['Resultado disponível após compensação',s.distributable_cents],
 ['Fundo para os sócios',s.pool_cents],
 ['Resultado retido na empresa',s.retained_cents]
 ].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{money(value as number|undefined)}</dd></div>)}</dl>
 <p>{s.closed?'Competência fechada. Apuração e valores devidos preservados.':!ended?'Prévia: aguarde o término da competência.':s.missing_costs?'Há vendas sem custo comprovado; complete a conferência antes de fechar.':'Competência aberta: confira os lançamentos e os saldos antes de fechar.'}</p>
 <p>O fechamento mensal continua fora dos seis meses do plano, com fundo de repasses igual a zero. Resultado retido e prejuízo acumulado são indicadores contábeis; não representam o saldo disponível em caixa.</p>
 {!readOnly&&onClose&&!s.closed&&<>
 <label className="erp-inline-check"><input type="checkbox" checked={reconciled} onChange={e=>onReconciled?.(e.target.checked)} disabled={busy}/>Conferi vendas recebidas, custos, taxas, despesas e saldos desta competência.</label>
 <button type="button" className="management-outline" disabled={busy||!reconciled||!s.sequence_ready||!ended||Boolean(s.missing_costs)||s.profit_cents===null} onClick={onClose}>Fechar competência</button>
 <p>O fechamento bloqueia novos registros no mês e cria os valores devidos quando o plano se aplica. Esta ação não envia Pix nem efetua transferência bancária.</p>
 </>}
 </>}
 </section>;
}
