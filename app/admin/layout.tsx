'use client';
import Image from 'next/image';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import './management.css';
import './queue.css';
import './jewelry-table.css';
import './inventory.css';
import './pricing-workflow.css';
import './catalogo/catalog.css';
import './colecoes/collections.css';
import './editorial.css';
import './system.css';
import './ui/tokens.css';
import './ui/appearance.css';
import { ManagementAppearance } from './ui/appearance';
import WorkspaceTools from './workspace-tools';
import dynamic from 'next/dynamic';
const ManagementReadOnly=dynamic(()=>import('../security/management-read-only'),{ssr:false,loading:()=> <p role="status">Carregando consulta…</p>});
import AccountMenu from '../security/account-menu';
import {useIdleSession,IdleWarning,IDLE_MESSAGE} from '../security/use-idle-session';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = url && key ? createClient(url, key) : null;
const ManagementContext = createContext<{ db: SupabaseClient } | null>(null);

export function useManagement() {
  const value = useContext(ManagementContext);
  if (!value) throw new Error('Acesso administrativo não disponível');
  return value;
}

const sections = [
  { href: '/admin', label: 'Visão geral', icon: 'home' },
  { href: '/admin/joias', label: 'Joias', icon: 'gem' },
  { href: '/admin/colecoes', label: 'Coleções', icon: 'layers' },
  { href: '/admin/estoque', label: 'Estoque', icon: 'box' },
  { href: '/admin/precificacao', label: 'Precificação', icon: 'tag' },
  { href: '/admin/catalogo', label: 'Catálogo', icon: 'grid' },
  { href: '/admin/integracoes', label: 'Integrações', icon: 'link' },
  ...(process.env.NEXT_PUBLIC_FINANCE_ENABLED === 'true' ? [{ href: '/admin/financeiro', label: 'Financeiro', icon: 'finance' }] : []),
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    finance: <><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M15 14h3M6 3v4"/></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/></>,
    gem: <><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M6 3l3 6 3 12 3-12 3-6"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    box: <><path d="m3 7 9-4 9 4v10l-9 4-9-4z"/><path d="m3 7 9 4 9-4M12 11v10"/></>,
    tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2"/><path d="M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/></>,
    logout: <><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="M15 7l5 5-5 5M20 12H9"/></>,
    store: <><path d="M3 9h18l-2-5H5zM4 9v11h16V9M9 20v-7h6v7"/></>,
  };
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function ManagementLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<'loading' | 'login' | 'mfa' | 'ready'>('loading');
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [accountName, setAccountName] = useState('');
  const [readOnly,setReadOnly]=useState(false);
  const [switching,setSwitching]=useState(false);
  const authenticatedOwner=useRef('');
  const identityCleanup=useRef<Promise<unknown>>(Promise.resolve());

  const handleExpired = useCallback((reason:'inactivity'|'signed-out') => {
    authenticatedOwner.current='';
    setState('login'); setPassword(''); setCode(''); setFactorId(''); setQrCode('');
    setAccountName(''); setReadOnly(false); setMenuOpen(false);
    setMessage(reason==='inactivity'?IDLE_MESSAGE:'Sessão encerrada. Entre novamente.');
  }, []);
  const {ensureSession,warning,extend,endSession}=useIdleSession(db,handleExpired);

  const continueSignIn = useCallback(async () => {
    if (!db) return;
    const {data:{session}}=await db.auth.getSession();
    if(!session){setState('login');return}
    if(!await ensureSession(session)){handleExpired('inactivity');return}
    const { data: { user } } = await db.auth.getUser();
    if (!user) { setState('login'); return; }
    if(!await ensureSession(session)){handleExpired('inactivity');return}
    const { data: assurance } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if(!await ensureSession(session)){handleExpired('inactivity');return}
    if (assurance?.currentLevel !== 'aal2') {
      setState('mfa');
      const { data: factors } = await db.auth.mfa.listFactors();
      if(!await ensureSession(session)){handleExpired('inactivity');return}
      const verified = factors?.totp?.find(f => f.status === 'verified');
      if (verified) { setFactorId(verified.id); return; }
      const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp' });
      if(!await ensureSession(session)){handleExpired('inactivity');return}
      if (error || !data) { setMessage('Não foi possível iniciar a verificação em duas etapas.'); return; }
      setFactorId(data.id); setQrCode(data.totp.qr_code); return;
    }
    const { data: role } = await db.from('admin_users').select('role,display_name').eq('user_id', user.id).maybeSingle();
    let viewerName:string|null=null;
    if(role?.role!=='administrador'){
      const context=await db.rpc('management_account_context');
      if(context.error||context.data?.role!=='consulta'){
        await db.auth.signOut({scope:'local'});setState('login');setMessage('Esta conta não tem acesso à gestão.');return;
      }
      viewerName=String(context.data.name||'Consulta');
    }
    if(!await ensureSession(session)){handleExpired('inactivity');return}
    authenticatedOwner.current=user.id;
    setReadOnly(viewerName!==null);
    setAccountName(viewerName||role?.display_name?.trim()||user.user_metadata?.full_name||user.email?.split('@')[0]||'Minha conta');
    setMessage('');setState('ready');
  }, [ensureSession,handleExpired]);

  useEffect(()=>{
    if(!db)return;
    const{data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{
      if(authenticatedOwner.current&&session?.user.id!==authenticatedOwner.current){
        handleExpired('signed-out');
        if(session)identityCleanup.current=fetch('/api/admin/session',{method:'DELETE',cache:'no-store',keepalive:true}).catch(()=>{});
      }
    });
    return()=>subscription.unsubscribe();
  },[handleExpired]);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!db) { if (active) setState('login'); return; }
      await continueSignIn();
    }
    void check();
    return () => { active = false; };
  }, [continueSignIn]);

  useEffect(() => {
    if (state !== 'ready' || !db) return;
    let cancelled = false;
    async function establishServerSession() {
      const { data: { session } } = await db!.auth.getSession();
      if (!session || cancelled || !await ensureSession(session)) return;
      const response = await fetch(readOnly?'/gestao/sessao':'/api/admin/session', {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      if(!await ensureSession(session)){
        await fetch('/api/admin/session',{method:'DELETE',cache:'no-store'}).catch(()=>{});
        return;
      }
      if (!response.ok) { if (!cancelled) setMessage('Não foi possível confirmar a sessão no servidor. Entre novamente.'); return; }
      if (pathname === '/admin/acesso' && !cancelled) {
        const requested = new URLSearchParams(window.location.search).get('next');
        window.location.replace(requested?.startsWith('/admin') && requested !== '/admin/acesso' && !requested.startsWith('//') ? requested : '/admin');
      }
    }
    void establishServerSession();
    const refresh = window.setInterval(() => { void establishServerSession(); }, 10 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(refresh); };
  }, [state, pathname, ensureSession, readOnly]);

  async function recoverPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || recoveryBusy) return;
    setRecoveryBusy(true); setMessage('');
    try {
      const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/ativar-acesso` });
      if (error) throw error;
      setMessage('Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha. Confira também o lixo eletrônico.');
    } catch { setMessage('Não foi possível solicitar a recuperação agora. Tente novamente em alguns minutos.'); }
    finally { setRecoveryBusy(false); }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || switching) return;
    await identityCleanup.current;
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) { setMessage('Não foi possível entrar. Confira suas credenciais.'); return; }
    if(!await ensureSession(data.session,true)){handleExpired('inactivity');return}
    setPassword(''); await continueSignIn();
  }

  async function switchAccount(targetEmail:string){
    setSwitching(true);
    try{
      await endSession();
      setEmail(targetEmail);setPassword('');setCode('');setFactorId('');setQrCode('');
      setReadOnly(false);setState('login');
      setMessage('Sessão anterior encerrada. Entre com a outra conta para continuar.');
    }finally{setSwitching(false)}
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !factorId || !/^\d{6}$/.test(code)) return;
    const {data:{session}}=await db.auth.getSession();
    if(!await ensureSession(session)){handleExpired('inactivity');return}
    const { data: challenge, error: challengeError } = await db.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) { setMessage('Não foi possível verificar o código.'); return; }
    const { error } = await db.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (error) { setMessage('Código inválido ou expirado.'); return; }
    setCode(''); setQrCode(''); await continueSignIn();
  }

  return <ManagementAppearance>
    {state === 'loading' && <main className="management-auth"><p>Verificando acesso...</p></main>}
    {state === 'login' && <main className="management-auth"><p className="eyebrow">ÁREA RESTRITA</p><h1>{recovering ? 'Recuperar senha' : 'Gestão Elegância'}</h1><p>{recovering ? 'Informe o e-mail da sua conta para receber um link de redefinição.' : 'Somente contas autorizadas podem acessar os dados da loja.'}</p>{db ? <><form onSubmit={recovering ? recoverPassword : signIn}><label>E-mail<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)}/></label>{!recovering && <label>Senha<input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)}/><button type="button" className="auth-text-button" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ocultar senha' : 'Mostrar senha'}</button></label>}<button className="botao" type="submit" disabled={switching || recoveryBusy}>{recovering ? (recoveryBusy ? 'Enviando…' : 'Enviar link de recuperação') : (switching ? 'Encerrando sessão…' : 'Entrar')}</button></form><button type="button" className="auth-text-button auth-recovery-link" onClick={() => { setRecovering(!recovering); setMessage(''); setPassword(''); }}>{recovering ? 'Voltar para o login' : 'Esqueci minha senha'}</button></> : <p>Configuração do Supabase indisponível.</p>}<p role="status">{message}</p></main>}
    {state === 'mfa' && <main className="management-auth"><p className="eyebrow">ÁREA RESTRITA</p><h1>Verificação em duas etapas</h1>{qrCode && <><p>Escaneie o código no aplicativo autenticador.</p><Image unoptimized src={qrCode} alt="Código de configuração do autenticador" width={180} height={180}/></>}<form onSubmit={verifyMfa}><label>Código de seis dígitos<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={event => setCode(event.target.value)}/></label><button className="botao" type="submit">Verificar</button></form><p role="status">{message}</p></main>}
    {state === 'ready' && db && <ManagementContext.Provider value={{ db }}><div className="management-layout erp-collapsed"><aside className={`management-sidebar ${menuOpen ? 'is-open' : ''}`}><Link className="management-brand" href="/admin" aria-label="E✦ Elegância PAINEL DE GESTÃO · visão geral" title="Visão geral"><span className="management-brand-symbol">E✦</span></Link><button className="management-menu-toggle" type="button" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} title={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="management-navigation" onClick={() => setMenuOpen(!menuOpen)}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><nav id="management-navigation" aria-label="Seções da gestão">{sections.map(section => <div key={section.href}><Link href={section.href} aria-label={section.label} title={section.label} aria-current={(pathname === section.href || (section.href !== '/admin' && pathname.startsWith(`${section.href}/`))) ? 'page' : undefined} onClick={() => setMenuOpen(false)}><NavIcon name={section.icon}/></Link></div>)}</nav><div className="management-sidebar-bottom"><Link className="management-store-link" href="/" aria-label="Ver loja" title="Ver loja"><NavIcon name="store"/></Link><button type="button" aria-label="Sair" title="Sair" onClick={() => endSession()}><NavIcon name="logout"/></button></div></aside><div className="management-main"><header className="management-topbar"><div><span className="management-topbar-kicker">ELEGÂNCIA PRATAS</span><strong>{sections.find(section => pathname === section.href || (section.href !== '/admin' && pathname.startsWith(`${section.href}/`)))?.label ?? 'Gestão da loja'}</strong></div><WorkspaceTools db={db} readOnly={readOnly}/><Link className="erp-alert-link" href="/admin#operation-title">Pendências</Link><AccountMenu db={db} name={accountName} readOnly={readOnly} onSwitch={switchAccount}/></header><nav className="erp-breadcrumbs" aria-label="Localização"><Link href="/admin">Gestão</Link><span aria-hidden="true">/</span><span>{sections.find(s => s.href !== '/admin' && pathname.startsWith(s.href))?.label ?? 'Visão geral'}</span></nav>{warning&&<IdleWarning onContinue={extend}/>} {readOnly?<ManagementReadOnly db={db} pathname={pathname}/>:children}</div></div></ManagementContext.Provider>}
  </ManagementAppearance>;
}
