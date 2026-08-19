import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import translationEN from './locales/en/translation.json';
import translationHI from './locales/hi/translation.json';
import translationMR from './locales/mr/translation.json';
import translationTE from './locales/te/translation.json';

// Get language from the same place our Navbar sets it
const savedLang = localStorage.getItem('sr_lang') || 'en';

const resources = {
  en: { translation: translationEN },
  hi: { translation: translationHI },
  mr: { translation: translationMR },
  te: { translation: translationTE },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLang, // Use the saved language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already safes from XSS
    },
  });

export default i18n;