/**
 * i18n hook — Go Help Desk
 * Usage: const { t, lang } = useT()
 *        t('nav.dashboard')  // returns translated string
 */
import { useLanguageStore } from '@/store/language'
import { translate, type TranslationKey } from './translations'

export function useT() {
  const lang = useLanguageStore((s) => s.lang)

  function t(key: TranslationKey): string {
    return translate(key, lang)
  }

  function tStatus(name: string): string {
    const lower = name.toLowerCase().trim()
    const key = `status.${lower.replace(' ', '_')}`
    if (key === 'status.new' || key === 'status.open' || key === 'status.in_progress' || key === 'status.pending' || key === 'status.resolved' || key === 'status.closed') {
      return translate(key as TranslationKey, lang)
    }
    return name
  }

  return { t, lang, tStatus }
}
