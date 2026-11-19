import React, { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useInventory } from '../../context/InventoryContext';
import { LANGUAGES } from '../../i18n';
import { pname } from '../../lib/format';
import {
  SellIcon, BillsIcon, StatsIcon, StockIcon, AddIcon, InvoiceIcon, OrdersIcon,
  BellIcon, GearIcon, SunIcon, MoonIcon, GlobeIcon, MenuIcon, CloseIcon,
} from '../../lib/icons';
import SettingsModal from './SettingsModal';
import StorageNotice from './StorageNotice';
import DesktopSiteNotice from './DesktopSiteNotice';
import AccountButton from '../account/AccountButton';
import Logo from './Logo';

// Every page, in the order a shop uses them: sell, check the day, look after stock, buy.
const NAV = [
  { path: '/home', key: 'newSale', Icon: SellIcon },
  { path: '/bills', key: 'bills', Icon: BillsIcon },
  { path: '/dashboard', key: 'dashboard', Icon: StatsIcon },
  { path: '/inventory', key: 'inventory', Icon: StockIcon },
  { path: '/add-stock', key: 'addStock', Icon: AddIcon },
  { path: '/invoices', key: 'invoices', Icon: InvoiceIcon },
  { path: '/orders', key: 'orders', Icon: OrdersIcon },
];
// Phones get the five used every day; the rest sit behind the menu button.
const TABS = ['/home', '/bills', '/add-stock', '/inventory', '/dashboard'];

function useDismiss(ref, onDismiss, active) {
  useEffect(() => {
    if (!active) return undefined;
    const click = (e) => { if (ref.current && !ref.current.contains(e.target)) onDismiss(); };
    const key = (e) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, [ref, onDismiss, active]);
}

function LanguageMenu({ up = false }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, () => setOpen(false), open);
  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];
  return (
    <div className="relative" ref={ref}>
      <button className="side-tool" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title={t('topbar.language')}>
        <GlobeIcon className="icon" /><span className="side-tool-label">{current.native}</span>
      </button>
      {open && (
        <ul className={`menu-pop w-48 ${up ? 'menu-up' : 'right-0'}`} role="listbox" aria-label={t('topbar.language')}>
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button role="option" aria-selected={l.code === current.code} className={`menu-item ${l.code === current.code ? 'active' : ''}`}
                onClick={() => { i18n.changeLanguage(l.code); setOpen(false); }}>
                <span>{l.native}</span>{l.code !== 'en' && <span className="text-[var(--text-muted)] text-xs">{l.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertsMenu({ up = false, compact = false }) {
  const { t } = useTranslation();
  const { lowStockProducts } = useInventory();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, () => setOpen(false), open);
  const count = lowStockProducts.length;
  return (
    <div className="relative" ref={ref}>
      <button className={compact ? 'icon-btn relative' : 'side-tool relative'} onClick={() => setOpen((o) => !o)} aria-label={t('topbar.notifications')} title={t('topbar.notifications')}>
        <BellIcon className="icon" />
        {!compact && <span className="side-tool-label">{t('dashboard.lowStock')}</span>}
        {count > 0 && <span className="notif-dot">{count}</span>}
      </button>
      {open && (
        <div className={`menu-pop w-80 p-2 ${up ? 'menu-up' : 'right-0'}`}>
          <p className="section-label px-3 pt-2 pb-3">{t('dashboard.lowStock')}</p>
          {count === 0 && <p className="px-3 pb-3 text-sm text-[var(--text-secondary)]">{t('topbar.noAlerts')}</p>}
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            {lowStockProducts.map((p) => (
              <Link key={p.id} to={`/inventory?focus=${p.id}`} onClick={() => setOpen(false)} className="menu-item">
                <span className="truncate">{pname(p)}</span>
                <span className={`tabular text-xs ${p.quantity <= 0 ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>{p.quantity}/{p.min}</span>
              </Link>
            ))}
          </div>
          {count > 0 && <Link to="/inventory" onClick={() => setOpen(false)} className="menu-item text-[var(--primary)] font-semibold">{t('topbar.openInventory')}</Link>}
        </div>
      )}
    </div>
  );
}

/** Phones: everything that is not a tab — other pages, language, theme, settings. */
function MoreSheet({ open, onClose, onSettings }) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <nav className="more-sheet" aria-label={t('nav.more')}>
        <div className="more-sheet-head">
          <h2 className="font-display text-lg font-bold">{t('nav.more')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><CloseIcon /></button>
        </div>
        <div className="more-links">
          {NAV.filter((n) => !TABS.includes(n.path)).map(({ path, key, Icon }) => (
            <NavLink key={path} to={path} onClick={onClose} className={({ isActive }) => `more-link ${isActive ? 'active' : ''}`}>
              <Icon className="icon" /><span>{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
          <button className="more-link" onClick={() => { onClose(); onSettings(); }}><GearIcon className="icon" /><span>{t('topbar.settings')}</span></button>
          <button className="more-link" onClick={toggleTheme}>{theme === 'dark' ? <SunIcon className="icon" /> : <MoonIcon className="icon" />}<span>{t(theme === 'dark' ? 'nav.lightTheme' : 'nav.darkTheme')}</span></button>
        </div>
        <p className="section-label mt-5 mb-2">{t('topbar.language')}</p>
        <div className="lang-grid">
          {LANGUAGES.map((l) => (
            <button key={l.code} className={`chip ${i18n.language === l.code ? 'active' : ''}`} aria-pressed={i18n.language === l.code} onClick={() => i18n.changeLanguage(l.code)}>{l.native}</button>
          ))}
        </div>
      </nav>
    </>
  );
}

export default function AppShell() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); setMoreOpen(false); }, [pathname]);
  const selling = pathname === '/home';

  return (
    <div className={`app ${selling ? 'is-selling' : ''}`}>
      {/* Wide screens: the sidebar */}
      <aside className="sidebar no-print">
        <Link to="/home" className="sidebar-brand" aria-label="stokd"><Logo /></Link>
        <nav className="sidebar-nav" aria-label={t('nav.main')}>
          {NAV.map(({ path, key, Icon }) => (
            <NavLink key={path} to={path} title={t(`nav.${key}`)} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
              <Icon className="icon" /><span className="side-link-label">{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <AccountButton />
          <div className="sidebar-tools">
            <AlertsMenu up />
            <LanguageMenu up />
            <button className="side-tool" onClick={() => setSettingsOpen(true)} title={t('topbar.settings')}><GearIcon className="icon" /><span className="side-tool-label">{t('topbar.settings')}</span></button>
            <button className="side-tool" onClick={toggleTheme} title={t('topbar.theme')}>
              {theme === 'dark' ? <SunIcon className="icon" /> : <MoonIcon className="icon" />}
              <span className="side-tool-label">{t(theme === 'dark' ? 'nav.lightTheme' : 'nav.darkTheme')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Phones: a slim bar on top */}
      <header className="mobile-top no-print">
        <Link to="/home" aria-label="stokd"><Logo /></Link>
        <div className="flex items-center gap-1.5 min-w-0">
          <AccountButton />
          <AlertsMenu compact />
          <button className="icon-btn" onClick={() => setMoreOpen(true)} aria-label={t('nav.more')} aria-expanded={moreOpen}><MenuIcon /></button>
        </div>
      </header>

      <main className="main">
        <DesktopSiteNotice />
        <StorageNotice />
        <Outlet />
      </main>

      {/* Phones: the everyday pages as tabs */}
      <nav className="tabbar no-print" aria-label={t('nav.main')}>
        {TABS.map((path) => NAV.find((n) => n.path === path)).map(({ path, key, Icon }) => (
          <NavLink key={path} to={path} className={({ isActive }) => `tab ${path === '/add-stock' ? 'tab-add' : ''} ${isActive ? 'active' : ''}`}>
            <span className="tab-icon"><Icon className="icon" /></span>
            <span className="tab-label">{t(`nav.short.${key}`)}</span>
          </NavLink>
        ))}
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onSettings={() => setSettingsOpen(true)} />
      <SettingsModal key={settingsOpen ? 'open' : 'closed'} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
