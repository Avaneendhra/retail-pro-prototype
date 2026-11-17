import React from 'react';

// Line icons drawn on a 24px grid. Size comes from the surrounding CSS (1em by default).
const icon = (d, extra = {}) => function Icon({ className = 'icon' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra}>
      {[].concat(d).map((path) => <path key={path} d={path} />)}
    </svg>
  );
};

export const SellIcon = icon(['M9 7h6', 'M9 11h6', 'M9 15h3', 'M6 3h12v18l-3-2-3 2-3-2-3 2V3z']);
export const BillsIcon = icon(['M8 4h11a1 1 0 011 1v15l-2.5-1.5L15 20l-2.5-1.5L10 20l-2.5-1.5L5 20V7', 'M5 7a3 3 0 013-3', 'M10 9h6', 'M10 13h6']);
export const StatsIcon = icon(['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2']);
export const StockIcon = icon(['M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4']);
export const AddIcon = icon(['M4 7V5a1 1 0 011-1h2', 'M17 4h2a1 1 0 011 1v2', 'M20 17v2a1 1 0 01-1 1h-2', 'M7 20H5a1 1 0 01-1-1v-2', 'M12 8v8', 'M8 12h8']);
export const InvoiceIcon = icon(['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h6', 'M10 17h6']);
export const OrdersIcon = icon(['M3 7h13v10H3z', 'M16 10h3l2 3v4h-5', 'M7 20a2 2 0 100-4 2 2 0 000 4z', 'M17 20a2 2 0 100-4 2 2 0 000 4z']);
export const SearchIcon = icon(['M21 21l-5-5', 'M17 11a6 6 0 11-12 0 6 6 0 0112 0z']);
export const ScanIcon = icon(['M4 7V5a1 1 0 011-1h2', 'M17 4h2a1 1 0 011 1v2', 'M20 17v2a1 1 0 01-1 1h-2', 'M7 20H5a1 1 0 01-1-1v-2', 'M8 8v8', 'M11 8v8', 'M14 8v8', 'M17 8v8']);
export const MenuIcon = icon(['M4 7h16', 'M4 12h16', 'M4 17h16']);
export const CloseIcon = icon(['M6 6l12 12', 'M18 6L6 18']);
export const BellIcon = icon(['M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5', 'M9 17a3 3 0 006 0']);
export const GearIcon = icon(['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z']);
export const SunIcon = icon(['M12 3v1', 'M12 20v1', 'M21 12h-1', 'M4 12H3', 'M18.4 18.4l-.7-.7', 'M6.3 6.3l-.7-.7', 'M18.4 5.6l-.7.7', 'M6.3 17.7l-.7.7', 'M16 12a4 4 0 11-8 0 4 4 0 018 0z']);
export const MoonIcon = icon(['M20.4 15.4A9 9 0 018.6 3.6 9 9 0 1020.4 15.4z']);
export const GlobeIcon = icon(['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M3.6 9h16.8', 'M3.6 15h16.8', 'M12 3a14 14 0 010 18', 'M12 3a14 14 0 000 18']);
export const PauseIcon = icon(['M9 6v12', 'M15 6v12']);
export const ShareIcon = icon(['M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7', 'M16 6l-4-4-4 4', 'M12 2v13']);
export const PrintIcon = icon(['M6 9V3h12v6', 'M6 18H4a1 1 0 01-1-1v-6a2 2 0 012-2h14a2 2 0 012 2v6a1 1 0 01-1 1h-2', 'M6 14h12v7H6z']);
export const ChevronIcon = icon(['M6 9l6 6 6-6']);
