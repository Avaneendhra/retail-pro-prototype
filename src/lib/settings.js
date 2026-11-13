import { useEffect, useState } from 'react';

// Tiny settings store in localStorage, shared across components.
const KEY = 'sr2_settings';
const DEFAULTS = { apiKey: '', shopName: 'Smart Retail' };
const listeners = new Set();

export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  listeners.forEach(fn => fn(next));
  return next;
}

export function useSettings() {
  const [s, setS] = useState(getSettings);
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS); }, []);
  return [s, setSettings];
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
