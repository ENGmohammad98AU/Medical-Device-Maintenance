import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: {
          appTitle: 'BioMed AI Assistant',
          dashboard: 'Dashboard',
          devices: 'Medical Devices',
          reports: 'Fault Reports',
          maintenance: 'Maintenance',
          settings: 'Settings',
          login: 'Login',
          logout: 'Logout',
          language: 'Language',
        },
      },
      ar: {
        translation: {
          appTitle: 'مساعد الذكاء الاصطناعي الطبي',
          dashboard: 'لوحة التحكم',
          devices: 'الأجهزة الطبية',
          reports: 'تقارير الأعطال',
          maintenance: 'الصيانة',
          settings: 'الإعدادات',
          login: 'تسجيل الدخول',
          logout: 'تسجيل الخروج',
          language: 'اللغة',
        },
      },
    },
    lng: 'ar',
    fallbackLng: 'ar',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
