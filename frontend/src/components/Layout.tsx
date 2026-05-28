import { useState, useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { useLanguageStore } from '@/store/language'
import { useT } from '@/i18n'
import { logout } from '@/api/auth'
import { getSiteConfig } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { TicketIcon, UsersIcon, SettingsIcon, LogOutIcon, HomeIcon, FolderIcon, CircleDotIcon, ShieldIcon, UsersRoundIcon, TagIcon, SlidersIcon, PuzzleIcon, MessageSquare, Sun, Moon, BookOpen, HelpCircle, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
}

function NavItem({ to, icon, label }: NavItemProps) {
  const { location } = useRouterState()
  const active = location.pathname === to || location.pathname.startsWith(to + '/')
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-[#1a1a1a] dark:text-[#faff69]'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-[#cccccc] dark:hover:bg-[#121212] dark:hover:text-white'
      )}
    >
      {icon}
      {label}
    </Link>
  )
}

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { user, clear } = useAuthStore()
  const { lang, setLang } = useLanguageStore()
  const { t } = useT()

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme')
      if (stored === 'light' || stored === 'dark') return stored
      return 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'))
  }

  const { data: siteConfig } = useQuery({
    queryKey: ['site-config'],
    queryFn: getSiteConfig,
    staleTime: 5 * 60 * 1000,
  })

  const siteName = siteConfig?.name ?? 'Go Help Desk'
  const logoURL = (theme === 'dark' && siteConfig?.logo_dark_url) ? siteConfig.logo_dark_url : (siteConfig?.logo_url ?? '')
  const version = siteConfig?.version ?? ''

  async function handleLogout() {
    await logout().catch(() => {})
    clear()
    window.location.href = '/login'
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-[#0a0a0a]">
      {/* Body row: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-60 flex-col border-r border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a]">
          {/* Branding */}
          <div className="flex h-14 items-center justify-center border-b border-gray-200 dark:border-[#2a2a2a] px-4">
            {logoURL ? (
              <img src={logoURL} alt={siteName} className="max-h-10 w-full max-w-[200px] object-contain" />
            ) : (
              <span className="text-lg font-semibold text-gray-900 dark:text-white truncate">{siteName}</span>
            )}
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            <NavItem to="/dashboard" icon={<HomeIcon className="h-4 w-4" />} label={t('nav.dashboard')} />
            <NavItem to="/tickets" icon={<TicketIcon className="h-4 w-4" />} label={t('nav.tickets')} />
            <NavItem to="/kb" icon={<BookOpen className="h-4 w-4" />} label={t('nav.knowledge_base')} />
            <NavItem to="/help" icon={<HelpCircle className="h-4 w-4" />} label={t('nav.user_guide')} />
            {user?.role === 'admin' && (
              <>
                <div className="px-3 pt-4 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('nav.admin')}</span>
                </div>
                <NavItem to="/admin/users" icon={<UsersIcon className="h-4 w-4" />} label={t('nav.users')} />
              </>
            )}
            {user?.role === 'admin' && (
              <>
                <NavItem to="/admin/groups" icon={<UsersRoundIcon className="h-4 w-4" />} label={t('nav.groups')} />
                <NavItem to="/admin/roles" icon={<ShieldIcon className="h-4 w-4" />} label={t('nav.roles')} />
                <NavItem to="/admin/categories" icon={<FolderIcon className="h-4 w-4" />} label={t('nav.categories')} />
                <NavItem to="/admin/statuses" icon={<CircleDotIcon className="h-4 w-4" />} label={t('nav.statuses')} />
                <NavItem to="/admin/tags" icon={<TagIcon className="h-4 w-4" />} label={t('nav.tags')} />
                <NavItem to="/admin/custom-fields" icon={<SlidersIcon className="h-4 w-4" />} label={t('nav.custom_fields')} />
                <NavItem to="/admin/plugins" icon={<PuzzleIcon className="h-4 w-4" />} label={t('nav.plugins')} />
                <NavItem to="/admin/canned-responses" icon={<MessageSquare className="h-4 w-4" />} label={t('nav.canned_responses')} />
                <NavItem to="/admin/kb" icon={<BookOpen className="h-4 w-4" />} label={t('nav.kb_management')} />
                <NavItem to="/admin/settings" icon={<SettingsIcon className="h-4 w-4" />} label={t('nav.settings')} />
                <NavItem to="/admin/reports/csat" icon={<BarChart3 className="h-4 w-4" />} label={t('nav.csat_ai_coach')} />
              </>
            )}
          </nav>

          {/* User, Language & Theme Controls */}
          <div className="border-t border-gray-200 dark:border-[#2a2a2a] p-3 space-y-2">
            <div className="px-3 text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</div>

            {/* Language selector */}
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('nav.language')}</span>
              <div className="flex items-center gap-1">
                <button
                  id="lang-pt"
                  onClick={() => setLang('pt')}
                  title="Português (Brasil)"
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all',
                    lang === 'pt'
                      ? 'bg-[#faff69] text-black'
                      : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-[#1a1a1a]'
                  )}
                >
                  🇧🇷 PT
                </button>
                <button
                  id="lang-en"
                  onClick={() => setLang('en')}
                  title="English (United States)"
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all',
                    lang === 'en'
                      ? 'bg-[#faff69] text-black'
                      : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-[#1a1a1a]'
                  )}
                >
                  🇺🇸 EN
                </button>
              </div>
            </div>

            {/* Theme selector */}
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('nav.theme')}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                onClick={toggleTheme}
                title="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-[#faff69]" />
                ) : (
                  <Moon className="h-4 w-4 text-gray-600" />
                )}
              </Button>
            </div>

            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white" onClick={handleLogout}>
              <LogOutIcon className="h-4 w-4" />
              {t('nav.sign_out')}
            </Button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-[#0a0a0a]">
          <div className="mx-auto max-w-5xl p-6">{children}</div>
        </main>
      </div>

      {/* Footer — full width across the bottom */}
      {version && (
        <footer className="border-t border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] px-6 py-2 text-center text-[11px] text-gray-400 dark:text-gray-500">
          Powered by{' '}
          <a
            href="https://github.com/PubliciaLLC/go-help-desk"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted hover:decoration-solid text-gray-500 dark:text-gray-400"
          >
            Go Help Desk
          </a>{' '}
          v{version}
        </footer>
      )}
    </div>
  )
}
