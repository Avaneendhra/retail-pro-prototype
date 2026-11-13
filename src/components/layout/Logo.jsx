import React from 'react';

export const BRAND = 'stokd';

/** Brand mark: three stacked shelf bars on a periwinkle tile. */
export function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <rect width="40" height="40" rx="12" fill="var(--accent-blue)" />
      <rect x="10" y="10" width="13" height="5.5" rx="2.75" fill="#0D0D0D" />
      <rect x="10" y="17.25" width="20" height="5.5" rx="2.75" fill="#0D0D0D" />
      <rect x="10" y="24.5" width="16" height="5.5" rx="2.75" fill="#0D0D0D" />
      <circle cx="28.5" cy="12.75" r="2.75" fill="#0D0D0D" />
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="brand">
      <LogoMark />
      <span className="brand-word">{BRAND}<span className="brand-dot">.</span></span>
    </span>
  );
}
