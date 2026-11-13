import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/app/en';
import te from './locales/app/te';
import hi from './locales/app/hi';
import mr from './locales/app/mr';

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
];

let saved = 'en';
try { saved = localStorage.getItem('sr_lang') || 'en'; } catch { /* storage blocked */ }
if (!LANGUAGES.some(l => l.code === saved)) saved = 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    te: { translation: te },
    hi: { translation: hi },
    mr: { translation: mr },
  },
  lng: saved,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

const applyLang = (lng) => {
  document.documentElement.lang = lng;
  try { localStorage.setItem('sr_lang', lng); } catch { /* storage blocked */ }
};
applyLang(saved);
i18n.on('languageChanged', applyLang);

export default i18n;
