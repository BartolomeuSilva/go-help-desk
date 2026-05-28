/**
 * Language store — Go Help Desk
 * Persists the selected language in localStorage.
 * Default: 'pt' (Português do Brasil)
 */
import { create } from 'zustand'
import type { Lang } from '@/i18n/translations'

const STORAGE_KEY = 'ghd_lang'

function getInitialLang(): Lang {
  if (typeof window === 'undefined') return 'pt'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'pt' || stored === 'en') return stored
  // Detect browser language as fallback
  const browserLang = navigator.language?.toLowerCase() ?? ''
  return browserLang.startsWith('pt') ? 'pt' : 'en'
}

interface LanguageState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLanguageStore = create<LanguageState>((set) => ({
  lang: getInitialLang(),
  setLang: (lang) => {
    localStorage.setItem(STORAGE_KEY, lang)
    set({ lang })
  },
}))
