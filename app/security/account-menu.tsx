'use client';
import Link from 'next/link';
import type {SupabaseClient} from '@supabase/supabase-js';
import AccountSwitch from './account-switch';
import AccountMenuIcon from './account-menu-icon';
import './account-menu.css';
import { ManagementThemeControl } from '../admin/ui/appearance';

export default function AccountMenu({db,name,readOnly,onSwitch}:{db:SupabaseClient;name:string;readOnly:boolean;onSwitch:(email:string)=>Promise<void>}){
 const initial=name.trim().slice(0,1).toLocaleUpperCase('pt-BR');
 return <details className="erp-user-menu account-menu">
 <summary className="management-topbar-account account-menu-trigger" aria-label={'Conta de '+name}>
 <span className="management-account-avatar" aria-hidden="true">{initial}</span>
 <span className="account-menu-trigger-name">{name}</span><AccountMenuIcon name="chevron"/>
 </summary>
 <div className="account-menu-panel">
 <div className="account-menu-profile">
 <span className="account-menu-profile-avatar" aria-hidden="true">{initial}</span>
 <div className="account-menu-profile-copy"><span className="account-menu-eyebrow">Conta atual</span><strong>{name}</strong>
 <span className="account-menu-role">{readOnly?'Somente consulta':'Administrador'}</span></div>
 </div>
 <ManagementThemeControl/>
 <nav className="account-menu-actions" aria-label="Opções da conta">
 <AccountSwitch db={db} onSwitch={onSwitch}/>
 {!readOnly&&<Link className="account-menu-item" href="/admin#account-security">
 <span className="account-menu-item-icon"><AccountMenuIcon name="shield"/></span><span className="account-menu-item-copy"><strong>Segurança da conta</strong><small>Proteção do seu acesso</small></span><AccountMenuIcon name="arrow"/>
 </Link>}
 <div className="account-menu-divider" role="separator"/>
 <Link className="account-menu-item" href="/">
 <span className="account-menu-item-icon"><AccountMenuIcon name="store"/></span><span className="account-menu-item-copy"><strong>Abrir loja</strong><small>Ver a vitrine de vendas</small></span><AccountMenuIcon name="arrow"/>
 </Link>
 </nav>
 </div>
 </details>;
}
