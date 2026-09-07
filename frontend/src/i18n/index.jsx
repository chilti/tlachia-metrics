import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import es from './locales/es.json'
import pt from './locales/pt.json'
import en from './locales/en.json'

const translations = { es, pt, en }

export const AVAILABLE_LANGUAGES = [
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'pt', label: 'Português', short: 'PT' },
  { code: 'en', label: 'English', short: 'EN' }
]

const I18nContext = createContext(null)

const getNestedValue = (obj, path) => {
  if (!obj || !path) return undefined
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj)
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem('tlachia_lang')
      if (saved && ['es', 'pt', 'en'].includes(saved)) {
        return saved
      }
      const browserLang = navigator.language ? navigator.language.slice(0, 2).toLowerCase() : 'es'
      if (['es', 'pt', 'en'].includes(browserLang)) {
        return browserLang
      }
      return 'es'
    } catch {
      return 'es'
    }
  })

  const setLang = useCallback((newLang) => {
    if (['es', 'pt', 'en'].includes(newLang)) {
      setLangState(newLang)
      try {
        localStorage.setItem('tlachia_lang', newLang)
      } catch (e) {
        console.warn('No se pudo persistir el idioma:', e)
      }
      document.documentElement.lang = newLang
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const t = useCallback(
    (key, params = {}, fallback = null) => {
      // 1. Buscar en el idioma seleccionado
      let val = getNestedValue(translations[lang], key)
      
      // 2. Fallback a español si no existe en el idioma seleccionado
      if (val === undefined && lang !== 'es') {
        val = getNestedValue(translations.es, key)
      }

      // 3. Si aún no existe, usar fallback o devolver la clave
      if (val === undefined) {
        return fallback !== null ? fallback : key
      }

      // 4. Si el valor es una cadena, interpolar parámetros {{param}}
      if (typeof val === 'string' && params && Object.keys(params).length > 0) {
        return val.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
          return params[k] !== undefined ? params[k] : `{{${k}}}`
        })
      }

      return val
    },
    [lang]
  )

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      languages: AVAILABLE_LANGUAGES
    }),
    [lang, setLang, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n debe usarse dentro de un I18nProvider')
  }
  return ctx
}
