/** One short phrase for where syncing stands. */
export function syncLabel(t, sync) {
  const { status, pending } = sync;
  if (status === 'auth') return t('sync.auth');
  if (status === 'offline') return pending ? t('sync.offlineWaiting', { count: pending }) : t('sync.offline');
  if (status === 'error') return t('sync.error');
  if (status === 'syncing') return t('sync.syncing');
  return pending ? t('sync.waiting', { count: pending }) : t('sync.synced');
}
