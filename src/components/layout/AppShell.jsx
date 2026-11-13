import React, { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useInventory } from '../../context/InventoryContext';
import { LANGUAGES } from '../../i18n';
import { pname } from '../../lib/format';
import SettingsModal from './SettingsModal';
import Logo from './Logo';

const I = {
  sale: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7h6m-6 4h6m-6 4h3M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /></svg>,
  home: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5h6v6H4zM14 5h6v4h-6zM14 13h6v6h-6zM4 15h6v4H4z" /></svg>,
  stock: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  invoice: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" /></svg>,
  add: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M12 8v8M8 12h8" /></svg>,
  orders: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7h13v10H3zM16 10h3l2 3v4h-5M7 20a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" /></svg>,
  sun: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.8} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.4 6.4l-.7-.7M6.3 6.3l-.7-.7m12.8 0l-.7.7M6.3 17.7l-.7.7M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  moon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.4 15.4A9 9 0 018.6 3.6 9 9 0 1020.4 15.4z" /></svg>,
  bell: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" /></svg>,
  gear: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 001 2.5c1.8.5 1.8 3 0 3.5a1.7 1.7 0 00-1 2.5c.9 1.6-.9 3.4-2.4 2.4a1.7 1.7 0 00-2.6 1.1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 00-2.6-1.1c-1.5 1-3.3-.8-2.4-2.4a1.7 1.7 0 00-1-2.5c-1.8-.5-1.8-3 0-3.5a1.7 1.7 0 001-2.5c-.9-1.6.9-3.3 2.4-2.4a1.7 1.7 0 002.6-1.1zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  globe: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.8} d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>,
  chevron: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" /></svg>,
};

const NAV = [
  { path: '/home', key: 'newSale', icon: I.sale },
  { path: '/dashboard', key: 'dashboard', icon: I.home },
  { path: '/inventory', key: 'inventory', icon: I.stock },
  { path: '/add-stock', key: 'addStock', icon: I.add },
  { path: '/invoices', key: 'invoices', icon: I.invoice },
  { path: '/orders', key: 'orders', icon: I.orders },
];

function useClickOutside(ref, onOutside, active) {
  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    const k = (e) => { if (e.key === 'Escape') onOutside(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onOutside, active]);
}

function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);
  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];
  return (
    <div className="relative" ref={ref}>
      <button className="lang-button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} title={t('topbar.language')}>
        {I.globe}<span>{current.native}</span>{I.chevron}
      </button>
      {open && (
        <ul className="menu-pop right-0 w-48" role="listbox" aria-label={t('topbar.language')}>
          {LANGUAGES.map(l => (
            <li key={l.code}>
              <button role="option" aria-selected={l.code === current.code}
                className={`menu-item ${l.code === current.code ? 'active' : ''}`}
                onClick={() => { i18n.changeLanguage(l.code); setOpen(false); }}>
                <span>{l.native}</span>
                {l.code !== 'en' && <span className="text-[var(--text-muted)] text-xs">{l.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationMenu() {
  const { t } = useTranslation();
  const { lowStockProducts } = useInventory();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);
  const count = lowStockProducts.length;
  return (
    <div className="relative" ref={ref}>
      <button className="icon-pill relative" onClick={() => setOpen(o => !o)} aria-label={t('topbar.notifications')} title={t('topbar.notifications')}>
        {I.bell}
        {count > 0 && <span className="notif-dot">{count}</span>}
      </button>
      {open && (
        <div className="menu-pop right-0 w-80 p-2">
          <p className="eyebrow px-3 pt-2 pb-3">{t('dashboard.lowStock')}</p>
          {count === 0 && <p className="px-3 pb-3 text-sm text-[var(--text-secondary)]">{t('topbar.noAlerts')}</p>}
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            {lowStockProducts.map(p => (
              <Link key={p.id} to={`/inventory?focus=${p.id}`} onClick={() => setOpen(false)} className="menu-item">
                <span className="truncate">{pname(p)}</span>
                <span className={`font-mono text-xs ${p.quantity <= 0 ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>{p.quantity}/{p.min}</span>
              </Link>
            ))}
          </div>
          {count > 0 && <Link to="/inventory" onClick={() => setOpen(false)} className="menu-item text-[var(--primary)] font-semibold">{t('topbar.openInventory')} →</Link>}
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <Link to="/home" className="topbar-brand" aria-label="stokd home">
          <Logo />
        </Link>

        <nav className="pill-nav" aria-label="Main">
          {NAV.map(item => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-actions">
          <LanguageMenu />
          <NotificationMenu />
          <button onClick={() => setSettingsOpen(true)} className="icon-pill" aria-label={t('topbar.settings')} title={t('topbar.settings')}>{I.gear}</button>
          <button onClick={toggleTheme} className="icon-pill hide-sm" aria-label={t('topbar.theme')} title={t('topbar.theme')}>
            {theme === 'dark' ? I.sun : I.moon}
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="animate-in" key={pathname}>
          <Outlet />
        </div>
      </main>

      <nav className="mobile-bottom-nav no-print" aria-label="Main">
        {NAV.map(item => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => `mobile-bottom-nav-item ${isActive ? 'active' : ''}`}>
            {item.icon}
            <span className="mobile-bottom-nav-label">{t(`nav.short.${item.key}`)}</span>
          </NavLink>
        ))}
      </nav>

      <SettingsModal key={settingsOpen ? 'open' : 'closed'} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
