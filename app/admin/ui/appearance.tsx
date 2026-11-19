'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
const AppearanceContext = createContext<{ theme: Theme; choose: (theme: Theme) => void } | null>(null);

/** Appearance lives in memory; no account data, cookies or browser storage are written. */
export function ManagementAppearance({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    if (chosen) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => setTheme(media.matches ? 'dark' : 'light');
    followSystem();
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, [chosen]);
  return <AppearanceContext.Provider value={{ theme, choose: next => { setChosen(true); setTheme(next); } }}>
    <div className="management-shell" data-management-theme={theme}>{children}</div>
  </AppearanceContext.Provider>;
}

export function ManagementThemeControl() {
  const appearance = useContext(AppearanceContext);
  if (!appearance) return null;
  return <section className="account-appearance" aria-label="Aparência do sistema">
    <div className="account-appearance-heading"><strong>Aparência</strong><span>Seu ambiente de trabalho</span></div>
    <div className="account-theme-options" role="group" aria-label="Tema do sistema">
      {(['light', 'dark'] as const).map(theme => <button type="button" key={theme} aria-pressed={appearance.theme === theme} onClick={() => appearance.choose(theme)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {theme === 'light' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></> : <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>}
        </svg>{theme === 'light' ? 'Claro' : 'Escuro'}
      </button>)}
    </div>
    <span className="sr-only" role="status">Tema {appearance.theme === 'light' ? 'claro' : 'escuro'} ativo</span>
  </section>;
}
