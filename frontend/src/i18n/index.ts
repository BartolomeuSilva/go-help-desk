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

  return { t, lang }
}
