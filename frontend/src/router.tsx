import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router'
import { getMe } from '@/api/auth'
import { getSetupStatus } from '@/api/setup'
import { useAuthStore } from '@/store/auth'
import { LoginPage } from '@/pages/LoginPage'
import { SetupPage } from '@/pages/SetupPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TicketListPage } from '@/pages/TicketListPage'
import { NewTicketPage } from '@/pages/NewTicketPage'
import { TicketDetailPage } from '@/pages/TicketDetailPage'
import { UsersPage } from '@/pages/admin/UsersPage'
import { UserDetailPage } from '@/pages/admin/UserDetailPage'
import { GroupsPage } from '@/pages/admin/GroupsPage'
import { CategoriesPage } from '@/pages/admin/CategoriesPage'
import { StatusesPage } from '@/pages/admin/StatusesPage'
import { RoleAdminPage } from '@/pages/admin/RoleAdminPage'
import { SettingsPage } from '@/pages/admin/SettingsPage'
import { TagsPage } from '@/pages/admin/TagsPage'
import { CustomFieldsPage } from '@/pages/admin/CustomFieldsPage'
import { PluginsPage } from '@/pages/admin/PluginsPage'
import { GuestTicketPage } from '@/pages/GuestTicketPage'
import { SignupPage } from '@/pages/SignupPage'
import { VerifyEmailPage } from '@/pages/VerifyEmailPage'
import { CannedResponsesPage } from '@/pages/admin/CannedResponsesPage'
import { KBPage } from '@/pages/kb/KBPage'
import { KBArticleDetailPage } from '@/pages/kb/KBArticleDetailPage'
import { KBAdminPage } from '@/pages/admin/KBAdminPage'
import { KBArticleEditorPage } from '@/pages/admin/KBArticleEditorPage'
import { HelpPage } from '@/pages/HelpPage'
import { CSATReportPage } from '@/pages/admin/CSATReportPage'

async function requireAuth() {
  const { user, setUser } = useAuthStore.getState()
  if (user) return
  try {
    const me = await getMe()
    setUser(me)
  } catch {
    throw redirect({ to: '/login' })
  }
}

async function requireAdmin() {
  await requireAuth()
  const { user } = useAuthStore.getState()
  if (user?.role !== 'admin') throw redirect({ to: '/dashboard' })
}

// ── Root ──────────────────────────────────────────────────────────────────────
const rootRoute = createRootRoute()

// ── Public ────────────────────────────────────────────────────────────────────
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

// Only accessible when no users exist yet; redirects to /login otherwise.
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  beforeLoad: async () => {
    const { needed } = await getSetupStatus()
    if (!needed) throw redirect({ to: '/login' })
  },
  component: SetupPage,
})

// ── Authenticated ─────────────────────────────────────────────────────────────
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  beforeLoad: requireAuth,
  component: DashboardPage,
})

const ticketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tickets',
  beforeLoad: requireAuth,
  component: TicketListPage,
})

const newTicketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tickets/new',
  beforeLoad: requireAuth,
  component: NewTicketPage,
})

const ticketDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tickets/$id',
  beforeLoad: requireAuth,
  component: TicketDetailPage,
})

const helpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/help',
  beforeLoad: requireAuth,
  component: HelpPage,
})

// ── Admin ─────────────────────────────────────────────────────────────────────
const adminUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/users',
  beforeLoad: requireAdmin,
  component: UsersPage,
})

const adminUserDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/users/$id',
  beforeLoad: requireAdmin,
  component: UserDetailPage,
})

const adminGroupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/groups',
  beforeLoad: requireAdmin,
  component: GroupsPage,
})

const adminRolesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/roles',
  beforeLoad: requireAdmin,
  component: RoleAdminPage,
})

const adminCategoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/categories',
  beforeLoad: requireAdmin,
  component: CategoriesPage,
})

const adminStatusesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/statuses',
  beforeLoad: requireAdmin,
  component: StatusesPage,
})

const adminSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/settings',
  beforeLoad: requireAdmin,
  component: SettingsPage,
})

const adminCSATReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/reports/csat',
  beforeLoad: requireAdmin,
  component: CSATReportPage,
})

const adminTagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/tags',
  beforeLoad: requireAdmin,
  component: TagsPage,
})

const adminCustomFieldsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/custom-fields',
  beforeLoad: requireAdmin,
  component: CustomFieldsPage,
})

const adminPluginsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/plugins',
  beforeLoad: requireAdmin,
  component: PluginsPage,
})

const adminCannedResponsesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/canned-responses',
  beforeLoad: requireAdmin,
  component: CannedResponsesPage,
})

const kbRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/kb',
  component: KBPage,
})

const kbArticleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/kb/articles/$id',
  component: KBArticleDetailPage,
})

const adminKBRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/kb',
  beforeLoad: requireAdmin,
  component: KBAdminPage,
})

const adminKBArticleNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/kb/articles/new',
  beforeLoad: requireAdmin,
  component: KBArticleEditorPage,
})

const adminKBArticleEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/kb/articles/$id',
  beforeLoad: requireAdmin,
  component: KBArticleEditorPage,
})

// ── Guest ─────────────────────────────────────────────────────────────────────
const submitRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/submit',
  component: GuestTicketPage,
})

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  component: SignupPage,
})

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  component: VerifyEmailPage,
})

// ── Index redirect ────────────────────────────────────────────────────────────
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const { needed } = await getSetupStatus()
    throw redirect({ to: needed ? '/setup' : '/dashboard' })
  },
  component: () => null,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    loginRoute,
    setupRoute,
    signupRoute,
    verifyEmailRoute,
    dashboardRoute,
    submitRoute,
    ticketsRoute,
    newTicketRoute,
    ticketDetailRoute,
    helpRoute,
    kbRoute,
    kbArticleDetailRoute,
    adminKBRoute,
    adminKBArticleNewRoute,
    adminKBArticleEditRoute,
    adminUsersRoute,
    adminUserDetailRoute,
    adminGroupsRoute,
    adminRolesRoute,
    adminCategoriesRoute,
    adminStatusesRoute,
    adminTagsRoute,
    adminCustomFieldsRoute,
    adminPluginsRoute,
    adminSettingsRoute,
    adminCSATReportRoute,
    adminCannedResponsesRoute,
  ]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
