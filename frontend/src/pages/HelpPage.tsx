import { useState } from 'react'
import { Layout } from '@/components/Layout'
import { useT } from '@/i18n'
import {
  Activity,
  User,
  Users,
  Settings,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
  Shield,
  MessageSquare,
  Ticket,
  BookOpen,
  Sliders,
  Tag,
  Puzzle,
  ArrowRight,
  Lock as LockIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccordionItem {
  question: string
  answer: string
}

function Accordion({ items, faqTitle }: { items: AccordionItem[]; faqTitle: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="mt-6 space-y-3">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        <HelpCircle className="h-5 w-5 text-blue-500" />
        {faqTitle}
      </h3>
      <div className="divide-y divide-gray-200 dark:divide-[#2a2a2a] rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] overflow-hidden">
        {items.map((item, idx) => {
          const isOpen = openIndex === idx
          return (
            <div key={idx} className="transition-colors">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#121212] focus:outline-none"
              >
                <span>{item.question}</span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                )}
              </button>
              {isOpen && (
                <div className="px-5 pb-4 pt-1 text-sm text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50/50 dark:bg-[#141414]">
                  {item.answer}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function HelpPage() {
  const { t } = useT()
  const [activeTab, setActiveTab] = useState<'overview' | 'customer' | 'agent' | 'admin'>('overview')

  const tabs = [
    { id: 'overview' as const, label: t('help.tab_overview'), icon: <Activity className="h-4 w-4" /> },
    { id: 'customer' as const, label: t('help.tab_customer'), icon: <User className="h-4 w-4" /> },
    { id: 'agent' as const, label: t('help.tab_agent'), icon: <Users className="h-4 w-4" /> },
    { id: 'admin' as const, label: t('help.tab_admin'), icon: <Settings className="h-4 w-4" /> },
  ]

  const faqOverview = [
    { question: t('help.faq_overview_q1'), answer: t('help.faq_overview_a1') },
    { question: t('help.faq_overview_q2'), answer: t('help.faq_overview_a2') },
  ]

  const faqCustomer = [
    { question: t('help.faq_customer_q1'), answer: t('help.faq_customer_a1') },
    { question: t('help.faq_customer_q2'), answer: t('help.faq_customer_a2') },
  ]

  const faqAgent = [
    { question: t('help.faq_agent_q1'), answer: t('help.faq_agent_a1') },
    { question: t('help.faq_agent_q2'), answer: t('help.faq_agent_a2') },
  ]

  const faqAdmin = [
    { question: t('help.faq_admin_q1'), answer: t('help.faq_admin_a1') },
    { question: t('help.faq_admin_q2'), answer: t('help.faq_admin_a2') },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        {/* Banner/Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shadow-lg dark:from-blue-900 dark:to-slate-900">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <Info className="h-3 w-3" /> {t('help.system_tour_badge')}
            </span>
            <h1 className="mt-3 text-2xl font-bold md:text-3xl">{t('help.title')}</h1>
            <p className="mt-2 text-sm text-blue-100/90 leading-relaxed">
              {t('help.subtitle')}
            </p>
          </div>
          <div className="absolute right-0 bottom-0 top-0 hidden w-1/3 opacity-10 md:block">
            <HelpCircle className="h-full w-full transform translate-x-12 translate-y-12" />
          </div>
        </div>

        {/* Navigation Tabs and Content */}
        <div className="flex flex-col gap-6 md:flex-row items-start">
          {/* Left Navigation */}
          <aside className="w-full shrink-0 md:w-60 rounded-xl border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] p-2 space-y-1">
            <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {t('help.nav_label')}
            </div>
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-150',
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-[#faff69] shadow-sm border-l-4 border-blue-500 pl-2'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-[#cccccc] dark:hover:bg-[#121212]'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] p-6 shadow-sm">

            {/* 1. Overview */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-500" />
                    {t('help.overview_title')}
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {t('help.overview_desc')}
                  </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#121212] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-blue-100 dark:bg-blue-950 p-1.5 text-blue-600 dark:text-blue-400">
                        <Ticket className="h-4 w-4" />
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t('help.ticketing_flow_title')}</h4>
                    </div>
                    <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      <li className="flex items-center gap-1.5">
                        <span className="font-semibold text-blue-500">{t('help.flow_intake')}</span> {t('help.flow_intake_desc')}
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="font-semibold text-blue-500">{t('help.flow_assignment')}</span> {t('help.flow_assignment_desc')}
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="font-semibold text-blue-500">{t('help.flow_resolution')}</span> {t('help.flow_resolution_desc')}
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="font-semibold text-blue-500">{t('help.flow_closure')}</span> {t('help.flow_closure_desc')}
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#121212] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-indigo-100 dark:bg-indigo-950 p-1.5 text-indigo-600 dark:text-indigo-400">
                        <Sliders className="h-4 w-4" />
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t('help.cti_title')}</h4>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {t('help.cti_desc')}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-[#151515] p-2 rounded border border-gray-100 dark:border-[#202020] justify-center">
                      <span className="font-bold text-indigo-500">Category</span>
                      <ArrowRight className="h-3 w-3 text-gray-400" />
                      <span className="font-bold text-indigo-500">Type</span>
                      <ArrowRight className="h-3 w-3 text-gray-400" />
                      <span className="font-bold text-indigo-500">Item</span>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {t('help.cti_example')}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50/30 dark:bg-yellow-950/10 p-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                    <h4 className="font-bold text-gray-900 dark:text-white">{t('help.sla_title')}</h4>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    {t('help.sla_desc')}
                  </p>
                </div>

                <Accordion items={faqOverview} faqTitle={t('help.faq_title')} />
              </div>
            )}

            {/* 2. Customer Portal */}
            {activeTab === 'customer' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-500" />
                    {t('help.customer_title')}
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {t('help.customer_desc')}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="border-l-4 border-blue-500 pl-4 space-y-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t('help.customer_s1_title')}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {t('help.customer_s1_desc')}
                    </p>
                  </div>

                  <div className="border-l-4 border-indigo-500 pl-4 space-y-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t('help.customer_s2_title')}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {t('help.customer_s2_desc').replace('/submit', '')}
                      <span className="font-semibold font-mono bg-gray-100 dark:bg-[#121212] px-1 rounded text-blue-500">/submit</span>
                      {' '}{t('help.customer_s2_desc').includes('/submit') ? '' : ''}
                    </p>
                  </div>

                  <div className="border-l-4 border-teal-500 pl-4 space-y-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t('help.customer_s3_title')}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {t('help.customer_s3_desc')}
                    </p>
                  </div>

                  <div className="border-l-4 border-amber-500 pl-4 space-y-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t('help.customer_s4_title')}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {t('help.customer_s4_desc')}
                    </p>
                  </div>
                </div>

                <Accordion items={faqCustomer} faqTitle={t('help.faq_title')} />
              </div>
            )}

            {/* 3. Agent Hub */}
            {activeTab === 'agent' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    {t('help.agent_title')}
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {t('help.agent_desc')}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#121212] p-4 space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Sliders className="h-4 w-4 text-blue-500" /> {t('help.agent_dashboard_title')}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {t('help.agent_dashboard_desc')}
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                      <li><strong>{t('help.agent_assigned')}</strong> {t('help.agent_assigned_desc')}</li>
                      <li><strong>{t('help.agent_my_groups')}</strong> {t('help.agent_my_groups_desc')}</li>
                      <li><strong>{t('help.agent_unassigned')}</strong> {t('help.agent_unassigned_desc')}</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#121212] p-4 space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-indigo-500" /> {t('help.agent_canned_title')}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {t('help.agent_canned_desc')}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] p-4 space-y-3">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t('help.agent_ops_title')}</h4>
                  <div className="grid gap-4 sm:grid-cols-3 text-xs text-gray-600 dark:text-gray-400">
                    <div className="space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <Tag className="h-3 w-3 text-teal-500" /> {t('help.agent_tagging_title')}
                      </h5>
                      <p>{t('help.agent_tagging_desc')}</p>
                    </div>
                    <div className="space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <Clock className="h-3 w-3 text-yellow-500" /> {t('help.agent_sla_title')}
                      </h5>
                      <p>{t('help.agent_sla_desc')}</p>
                    </div>
                    <div className="space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <User className="h-3 w-3 text-blue-500" /> {t('help.agent_assignment_title')}
                      </h5>
                      <p>{t('help.agent_assignment_desc')}</p>
                    </div>
                  </div>
                </div>

                <Accordion items={faqAgent} faqTitle={t('help.faq_title')} />
              </div>
            )}

            {/* 4. Admin Center */}
            {activeTab === 'admin' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Settings className="h-5 w-5 text-blue-500" />
                    {t('help.admin_title')}
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {t('help.admin_desc')}
                  </p>
                </div>

                <div className="space-y-4">
                  {/* ITSM Section */}
                  <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Sliders className="h-4 w-4 text-blue-500" /> {t('help.admin_itsm_title')}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {t('help.admin_itsm_desc')}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="inline-flex items-center rounded-md bg-red-100 dark:bg-red-950 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">{t('itsm.incident')}</span>
                      <span className="inline-flex items-center rounded-md bg-green-100 dark:bg-green-950 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300">{t('itsm.service_request')}</span>
                      <span className="inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">{t('itsm.problem')}</span>
                      <span className="inline-flex items-center rounded-md bg-blue-100 dark:bg-blue-950 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">{t('itsm.change_request')}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed pt-1">
                      {t('help.admin_itsm_mappings')}
                    </p>
                  </div>

                  {/* Custom Roles Section */}
                  <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/20 dark:bg-indigo-950/10 p-4 space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-indigo-500" /> {t('help.admin_roles_title')}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {t('help.admin_roles_desc')}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3 text-[11px] text-gray-500">
                      <div>• <code className="text-indigo-600 dark:text-indigo-400">tickets:reply</code> ({t('help.admin_perm_tickets')})</div>
                      <div>• <code className="text-indigo-600 dark:text-indigo-400">kb:manage</code> ({t('help.admin_perm_kb')})</div>
                      <div>• <code className="text-indigo-600 dark:text-indigo-400">settings:manage</code> ({t('help.admin_perm_settings')})</div>
                    </div>
                  </div>

                  {/* Other Configurations */}
                  <div className="grid gap-4 sm:grid-cols-3 text-xs text-gray-600 dark:text-gray-400">
                    <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] p-3 space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <LockIcon className="h-3.5 w-3.5 text-red-500" /> {t('help.admin_security_title')}
                      </h5>
                      <p className="text-[11px]">{t('help.admin_security_desc')}</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] p-3 space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <Puzzle className="h-3.5 w-3.5 text-blue-500" /> {t('help.admin_plugins_title')}
                      </h5>
                      <p className="text-[11px]">{t('help.admin_plugins_desc')}</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] p-3 space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5 text-emerald-500" /> {t('help.admin_kb_title')}
                      </h5>
                      <p className="text-[11px]">{t('help.admin_kb_desc')}</p>
                    </div>
                  </div>
                </div>

                <Accordion items={faqAdmin} faqTitle={t('help.faq_title')} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
