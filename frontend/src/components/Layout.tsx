import { useState, useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { useLanguageStore } from '@/store/language'
import { useT } from '@/i18n'
import { logout } from '@/api/auth'
import { getSiteConfig } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { TicketIcon, UsersIcon, SettingsIcon, LogOutIcon, HomeIcon, FolderIcon, CircleDotIcon, ShieldIcon, UsersRoundIcon, TagIcon, SlidersIcon, PuzzleIcon, MessageSquare, Sun, Moon, BookOpen, HelpCircle, BarChart3, Menu, X } from 'lucide-react'
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

function BottomTabItem({ to, icon, label }: NavItemProps) {
  const { location } = useRouterState()
  const active = location.pathname === to || location.pathname.startsWith(to + '/')
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors py-1.5 cursor-pointer',
        active
          ? 'text-blue-600 dark:text-[#faff69]'
          : 'text-gray-500 hover:text-gray-900 dark:text-[#888888] dark:hover:text-white'
      )}
    >
      {icon}
      <span className="truncate max-w-[70px]">{label}</span>
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  const sidebarContent = (
    <>
      {/* Branding */}
      <div className="hidden md:flex h-14 items-center justify-center border-b border-gray-200 dark:border-[#2a2a2a] px-4 shrink-0">
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
      <div className="border-t border-gray-200 dark:border-[#2a2a2a] p-3 space-y-2 shrink-0">
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
                'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all cursor-pointer',
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
                'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all cursor-pointer',
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
            className="h-8 w-8 rounded-md hover:bg-gray-100 dark:hover:bg-[#1a1a1a] cursor-pointer"
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

        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white cursor-pointer" onClick={handleLogout}>
          <LogOutIcon className="h-4 w-4" />
          {t('nav.sign_out')}
        </Button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-[#0a0a0a] overflow-hidden">
      {/* Mobile Top Header */}
      <header className="flex h-14 items-center justify-between border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] px-4 md:hidden z-20 shrink-0">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] rounded-md cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex-1 flex justify-center">
          {logoURL ? (
            <img src={logoURL} alt={siteName} className="max-h-8 object-contain" />
          ) : (
            <span className="text-md font-semibold text-gray-900 dark:text-white truncate">{siteName}</span>
          )}
        </div>
        <div className="w-9" />
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 w-72 bg-white dark:bg-[#0a0a0a] border-r border-gray-200 dark:border-[#2a2a2a] z-50 md:hidden transition-transform duration-300 flex flex-col shadow-xl",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-gray-200 dark:border-[#2a2a2a] px-4 shrink-0">
          {logoURL ? (
            <img src={logoURL} alt={siteName} className="max-h-8 object-contain" />
          ) : (
            <span className="text-md font-semibold text-gray-900 dark:text-white truncate">{siteName}</span>
          )}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#1a1a1a] text-gray-500 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 flex flex-col overflow-y-auto" onClick={() => setMobileMenuOpen(false)}>
          {sidebarContent}
        </div>
      </aside>

      {/* Body row: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-60 flex-col border-r border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] shrink-0">
          {sidebarContent}
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-[#0a0a0a]">
          <div className="mx-auto max-w-5xl p-4 md:p-6">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="flex h-16 border-t border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] md:hidden z-20 shrink-0 shadow-lg">
        <BottomTabItem to="/dashboard" icon={<HomeIcon className="h-5 w-5" />} label={t('nav.dashboard')} />
        <BottomTabItem to="/tickets" icon={<TicketIcon className="h-5 w-5" />} label={t('nav.tickets')} />
        <BottomTabItem to="/kb" icon={<BookOpen className="h-5 w-5" />} label={t('nav.knowledge_base')} />
        {user?.role === 'admin' ? (
          <BottomTabItem to="/admin/settings" icon={<SettingsIcon className="h-5 w-5" />} label={t('nav.settings')} />
        ) : (
          <BottomTabItem to="/help" icon={<HelpCircle className="h-5 w-5" />} label={t('nav.user_guide')} />
        )}
      </nav>

      {/* Footer — desktop only */}
      {version && (
        <footer className="hidden md:block border-t border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] px-6 py-2 text-center text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
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
