import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

type IconName = 'mail' | 'lock' | 'eye' | 'eye-off' | 'arrow' | 'shield';
export function AccessIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    mail: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    'eye-off': <><path d="m3 3 18 18M10 5.2a12 12 0 0 1 2-.2c6.5 0 10 7 10 7a18 18 0 0 1-3 3.8M6.5 6.5A21 21 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.5-1.5"/><path d="M10 10a3 3 0 0 0 4 4"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    shield: <><path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function ManagementAccessPanel({ title, description, children, loading = false }: { title: string; description?: string; children: ReactNode; loading?: boolean }) {
  return <main className="management-access" aria-labelledby="management-access-title">
    <div className="management-access-frame">
      <aside className="management-access-hero" aria-label="Elegância Pratas">
        <Image src="/images/category-colares.png" alt="" fill priority sizes="(max-width: 760px) 100vw, 52vw" className="management-access-photo"/>
        <div className="management-access-shade" aria-hidden="true"/>
        <Link className="management-access-brand" href="/" aria-label="Elegância Pratas — abrir loja">
          <span className="management-access-monogram" aria-hidden="true">E<span>✦</span></span>
          <span className="management-access-wordmark">Elegância<span>PRATAS</span></span>
        </Link>
        <div className="management-access-editorial">
          <span className="management-access-kicker">A ESSÊNCIA DA ELEGÂNCIA</span>
          <h2>Beleza em<br/>cada detalhe<span aria-hidden="true">.</span></h2>
          <div className="management-access-signature" aria-hidden="true"><span/>✦<span/></div>
          <p>Um olhar cuidadoso para tudo o que faz a sua marca brilhar.</p>
        </div>
        <span className="management-access-hero-footer">ELEGÂNCIA PRATAS · GESTÃO DA LOJA</span>
      </aside>
      <section className="management-auth management-access-form" aria-busy={loading}>
        <div className="management-access-form-top"><span>SEU ESPAÇO DE GESTÃO</span><span className="management-access-private"><AccessIcon name="lock"/>Acesso restrito</span></div>
        <div className="management-access-content">
          <header className="management-access-heading"><h1 id="management-access-title">{title}</h1>{description && <p>{description}</p>}</header>
          {children}
          <div className="management-access-assurance"><AccessIcon name="shield"/><p>Um acesso só seu.<span>Protegido por verificação em duas etapas.</span></p></div>
        </div>
        <footer className="management-access-footer"><Link href="/"><span aria-hidden="true">←</span> Voltar à loja</Link><span>Elegância Pratas</span></footer>
      </section>
    </div>
  </main>;
}
