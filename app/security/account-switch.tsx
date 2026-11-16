'use client';
import {useEffect,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import AccountMenuIcon from './account-menu-icon';
import {Modal} from '../admin/ui/components';
type Account={email:string;name:string;role:'administrador'|'consulta';current:boolean};
export default function AccountSwitch({db,onSwitch}:{db:SupabaseClient;onSwitch:(email:string)=>Promise<void>}){
 const[open,setOpen]=useState(false),[accounts,setAccounts]=useState<Account[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!open)return;let active=true;setBusy(true);setError(false);
 void db.rpc('management_linked_accounts').then(({data,error})=>{
  if(!active)return;setBusy(false);if(error){setError(true);return}
  setAccounts(Array.isArray(data)?data:[]);
 });return()=>{active=false};
 },[db,open,revision]);
 async function choose(email:string){setBusy(true);try{await onSwitch(email);setOpen(false)}catch{setError(true)}finally{setBusy(false)}}
 return <><button className="account-menu-item" type="button" onClick={()=>setOpen(true)}><span className="account-menu-item-icon"><AccountMenuIcon name="switch"/></span><span className="account-menu-item-copy"><strong>Trocar conta</strong><small>Usar outro perfil de acesso</small></span><AccountMenuIcon name="arrow"/></button>
 <Modal open={open} onClose={()=>{if(!busy)setOpen(false)}} title="Trocar conta">
 <p>Salve o que estiver preenchendo. A sessão atual será encerrada; a outra conta exige senha e verificação em duas etapas.</p>
 {busy?<p role="status">Preparando a troca de conta…</p>:error?<><p role="alert">Não foi possível carregar as contas vinculadas.</p><button type="button" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></>:accounts.length?
 <div className="account-switch-list">{accounts.map(account=><button className="management-outline" type="button" key={account.email} disabled={account.current||busy} onClick={()=>void choose(account.email)}>
 <strong>{account.name} · {account.role==='consulta'?'Somente consulta':'Administrador'}</strong><small>{account.email}</small>{account.current&&<span>Conta atual</span>}
 </button>)}</div>:<p>Nenhuma outra conta foi vinculada a este acesso.</p>}
 {!busy&&<button className="management-outline" type="button" onClick={()=>void choose('')}>Entrar com outro e-mail</button>}
 </Modal></>;
}
