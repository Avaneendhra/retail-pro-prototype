import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { desktopSiteNow } from '../../lib/desktopSite';

/** Shown on a phone whose browser is set to "Desktop site", which makes the app tiny and squashed. */
export default function DesktopSiteNotice() {
  const { t } = useTranslation();
  const [on, setOn] = useState(desktopSiteNow);

  useEffect(() => {
    const check = () => setOn(desktopSiteNow());
    const timer = setTimeout(check, 300); // after the browser has applied the phone width, if it allows it
    window.addEventListener('resize', check);
    return () => { clearTimeout(timer); window.removeEventListener('resize', check); };
  }, []);

  if (!on) return null;
  return (
    <div className="storage-notice no-print" role="alert">
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M11 18h2" /></svg>
      <p>{t('app.desktopSite')}</p>
    </div>
  );
}
