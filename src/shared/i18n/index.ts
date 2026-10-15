import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ru } from './ru';

void i18n.use(initReactI18next).init({
  lng: 'ru',
  fallbackLng: 'ru',
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
});

export { i18n };
export { useTranslation } from 'react-i18next';
export * from './dictionaries';
