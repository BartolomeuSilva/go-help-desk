import { useState } from 'react'
import { Layout } from '@/components/Layout'
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

function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="mt-6 space-y-3">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        <HelpCircle className="h-5 w-5 text-blue-500" />
        Frequently Asked Questions (FAQ)
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
  const [activeTab, setActiveTab] = useState<'overview' | 'customer' | 'agent' | 'admin'>('overview')

  const tabs = [
    { id: 'overview' as const, label: 'Overview & Flow', icon: <Activity className="h-4 w-4" /> },
    { id: 'customer' as const, label: 'Customer Portal', icon: <User className="h-4 w-4" /> },
    { id: 'agent' as const, label: 'Agent Hub (Staff)', icon: <Users className="h-4 w-4" /> },
    { id: 'admin' as const, label: 'Control Center (Admin)', icon: <Settings className="h-4 w-4" /> },
  ]

  const faqOverview = [
    {
      question: 'What is the standard lifecycle of a ticket?',
      answer:
        'A ticket is created by a customer or visitor (status: New). When an agent is assigned or starts working, it transitions to Open. If the agent needs customer feedback, they set it to Pending. Once resolved, the agent marks it as Resolved. Closed is the final state for fully completed tickets.',
    },
    {
      question: 'What does CTI stand for?',
      answer:
        'CTI stands for Category, Type, and Item. It is a hierarchical classification system (e.g., Category: Hardware → Type: Laptop → Item: Keyboard Issue) used to categorize tickets, assign groups, SLAs, and enforce custom fields.',
    },
  ]

  const faqCustomer = [
    {
      question: 'Can visitors submit tickets without registering an account?',
      answer:
        'Yes. If the administrator enables "Guest Submission" in the global settings, visitors can submit tickets directly via the /submit route. They only need to provide their name and email, and they can track their ticket by receiving email notifications.',
    },
    {
      question: 'How do customers interact on their tickets?',
      answer:
        'Once logged in, customers can view a list of their tickets, click on any ticket to view its reply timeline, submit replies, attach files, or close the ticket directly once they are satisfied with the resolution.',
    },
  ]

  const faqAgent = [
    {
      question: 'How do SLAs affect my response times?',
      answer:
        'SLA policies dictate the maximum response and resolution times based on the ticket priority (Low, Medium, High, Urgent). The system highlights SLA targets on each ticket to ensure agents stay within the service level targets.',
    },
    {
      question: 'What are Canned Responses and how do I use them?',
      answer:
        'Canned Responses are pre-defined message templates created by administrators for common queries. While replying to a ticket, agents can select a canned response from a dropdown to quickly populate the editor and send the reply.',
    },
  ]

  const faqAdmin = [
    {
      question: 'What is the role of ITSM in ticket management?',
      answer:
        'ITSM (Information Technology Service Management) enables classifying tickets into strategic types: Incident (unplanned interruption/degradation), Service Request (user request for service/information), Problem (root cause of incidents), and Change Request (proposal to add, modify, or remove something). By mapping ITSM types to CTI configurations, the system automatically classifies tickets.',
    },
    {
      question: 'How do Custom Roles work?',
      answer:
        'Unlike system default roles, Custom Roles allow admins to create granular security profiles. You can assign precise permissions (e.g., only manage knowledge base articles, or only reply to tickets) to user accounts, ensuring the principle of least privilege.',
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        {/* Banner/Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shadow-lg dark:from-blue-900 dark:to-slate-900">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <Info className="h-3 w-3" /> System Tour & Documentation
            </span>
            <h1 className="mt-3 text-2xl font-bold md:text-3xl">User Guide & Operations Manual</h1>
            <p className="mt-2 text-sm text-blue-100/90 leading-relaxed">
              Welcome to the official manual. Explore the core flows of the platform, customer interaction channels, agent dashboards, and advanced administrative configurations.
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
              Navigation
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
                    Overview & Service Flow
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    Go Help Desk is a modern, responsive ticketing system designed to facilitate communication between support requesters (Users/Guests) and solvers (Staff/Admins). It features deep categorization, service-level compliance, and custom roles.
                  </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#121212] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-blue-100 dark:bg-blue-950 p-1.5 text-blue-600 dark:text-blue-400">
                        <Ticket className="h-4 w-4" />
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">The Ticketing Flow</h4>
                    </div>
                    <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      <li className="flex items-center gap-1.5">
                        <span className="font-semibold text-blue-500">1. Intake:</span> Ticket created via Portal or Guest Form.
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="font-semibold text-blue-500">2. Assignment:</span> Dispatched to group/agent manually or based on CTI rules.
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="font-semibold text-blue-500">3. Resolution:</span> Conversations take place, SLA targets monitor progress.
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="font-semibold text-blue-500">4. Closure:</span> Resolved ticket is reviewed and permanently Closed.
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#121212] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-indigo-100 dark:bg-indigo-950 p-1.5 text-indigo-600 dark:text-indigo-400">
                        <Sliders className="h-4 w-4" />
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">Hierarchical CTI Structure</h4>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      Categorization consists of three cascading layers:
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-[#151515] p-2 rounded border border-gray-100 dark:border-[#202020] justify-center">
                      <span className="font-bold text-indigo-500">Category</span>
                      <ArrowRight className="h-3 w-3 text-gray-400" />
                      <span className="font-bold text-indigo-500">Type</span>
                      <ArrowRight className="h-3 w-3 text-gray-400" />
                      <span className="font-bold text-indigo-500">Item</span>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Example: IT Support (Cat) → Software (Type) → License Activation (Item).
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50/30 dark:bg-yellow-950/10 p-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                    <h4 className="font-bold text-gray-900 dark:text-white">SLA Enforcement</h4>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Compliance parameters calculate response and resolution deadlines relative to ticket priorities. Tickets that exceed target boundaries trigger alerts, signaling managers to re-triage or escalate as required.
                  </p>
                </div>

                <Accordion items={faqOverview} />
              </div>
            )}

            {/* 2. Customer Portal */}
            {activeTab === 'customer' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-500" />
                    Customer Portal (User Operations)
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    End users request assistance, track replies, and browse the knowledge base from their portal.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="border-l-4 border-blue-500 pl-4 space-y-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">1. Creating Tickets</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      Logged-in clients can create tickets via the portal dashboard. They select a CTI path, enter a descriptive title, specify their details, and submit. If the platform allows, files can be attached.
                    </p>
                  </div>

                  <div className="border-l-4 border-indigo-500 pl-4 space-y-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">2. Guest Ticket Submission</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      When guest submissions are globally enabled, anyone can navigate to <span className="font-semibold font-mono bg-gray-100 dark:bg-[#121212] px-1 rounded text-blue-500">/submit</span> to submit an issue. No login or password is required. The system matches the submitter's email to associate replies.
                    </p>
                  </div>

                  <div className="border-l-4 border-teal-500 pl-4 space-y-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">3. Tracking & Timeline</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      Requesters see their ticket timeline including replies from support agents, status changes, and notifications. Requesters can reply directly on this timeline or close the ticket when completed.
                    </p>
                  </div>

                  <div className="border-l-4 border-amber-500 pl-4 space-y-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">4. Self-Service Knowledge Base (KB)</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      Users can view published articles organized under categories in <span className="font-semibold font-mono bg-gray-100 dark:bg-[#121212] px-1 rounded text-blue-500">/kb</span>. Reading support articles before creating a ticket resolves common issues faster.
                    </p>
                  </div>
                </div>

                <Accordion items={faqCustomer} />
              </div>
            )}

            {/* 3. Agent Hub */}
            {activeTab === 'agent' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Agent Hub (Staff Operations)
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    Support agents (Staff) handle incoming queues, solve issues, and interact with ticket submitters.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#121212] p-4 space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Sliders className="h-4 w-4 text-blue-500" /> Dashboard & Queues
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      The Agent dashboard features metric counters for:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                      <li><strong>Assigned directly:</strong> Tickets assigned to you.</li>
                      <li><strong>My Groups:</strong> Tickets assigned to a group you belong to.</li>
                      <li><strong>Unassigned:</strong> Waiting in the queue for pickup.</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#121212] p-4 space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-indigo-500" /> Canned Responses
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      Avoid drafting repetitive replies. Click on the <strong>Canned Response</strong> dropdown when typing, choose a preset message template, and instantly insert it into the reply box.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] p-4 space-y-3">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">Agent Operations Inside Tickets</h4>
                  <div className="grid gap-4 sm:grid-cols-3 text-xs text-gray-600 dark:text-gray-400">
                    <div className="space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <Tag className="h-3 w-3 text-teal-500" /> Tagging
                      </h5>
                      <p>Apply tags (e.g., VIP, Billing) to categorize issues and optimize search filtering.</p>
                    </div>
                    <div className="space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <Clock className="h-3 w-3 text-yellow-500" /> SLA Tracker
                      </h5>
                      <p>View countdown timers in the sidebar warning of SLA response and resolution times.</p>
                    </div>
                    <div className="space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <User className="h-3 w-3 text-blue-500" /> Assignment
                      </h5>
                      <p>Re-route tickets by assigning them to other agents or specific support groups.</p>
                    </div>
                  </div>
                </div>

                <Accordion items={faqAgent} />
              </div>
            )}

            {/* 4. Admin Center */}
            {activeTab === 'admin' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Settings className="h-5 w-5 text-blue-500" />
                    Control Center (Administrative Operations)
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    Administrators configure the platform, control access permissions, define hierarchies, and monitor features.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* ITSM Section */}
                  <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Sliders className="h-4 w-4 text-blue-500" /> ITSM & Ticket Types Configuration
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      Enable **ITSM Mode** in settings to split tickets into four strategic types:
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="inline-flex items-center rounded-md bg-red-100 dark:bg-red-950 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">Incident</span>
                      <span className="inline-flex items-center rounded-md bg-green-100 dark:bg-green-950 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300">Service Request</span>
                      <span className="inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">Problem</span>
                      <span className="inline-flex items-center rounded-md bg-blue-100 dark:bg-blue-950 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">Change Request</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed pt-1">
                      <strong>Defaults Mappings:</strong> On the categories page, you can map CTI branches to a default type. When a ticket matches that classification, the type is auto-inferred. Agents can manually override the type in the ticket details sidebar.
                    </p>
                  </div>

                  {/* Custom Roles Section */}
                  <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/20 dark:bg-indigo-950/10 p-4 space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-indigo-500" /> Custom Roles & Permissions
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      Go Help Desk uses a granular security engine. As an admin, you can create custom roles (e.g., "KB Specialist" or "SLA Manager") and assign specific permissions from the security checklist, including:
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3 text-[11px] text-gray-500">
                      <div>• <code className="text-indigo-600 dark:text-indigo-400">tickets:reply</code> (Answer tickets)</div>
                      <div>• <code className="text-indigo-600 dark:text-indigo-400">kb:manage</code> (Create/publish articles)</div>
                      <div>• <code className="text-indigo-600 dark:text-indigo-400">settings:manage</code> (Configure site settings)</div>
                    </div>
                  </div>

                  {/* Other Configurations */}
                  <div className="grid gap-4 sm:grid-cols-3 text-xs text-gray-600 dark:text-gray-400">
                    <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] p-3 space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <LockIcon className="h-3.5 w-3.5 text-red-500" /> Security & MFA
                      </h5>
                      <p className="text-[11px]">Enforce Multi-Factor Authentication globally or opt-in. Enables TOTP via QR Code.</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] p-3 space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <Puzzle className="h-3.5 w-3.5 text-blue-500" /> Modular Plugins
                      </h5>
                      <p className="text-[11px]">Install and activate backend integrations or UI extensions from the plugins panel.</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 dark:border-[#2a2a2a] p-3 space-y-1">
                      <h5 className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5 text-emerald-500" /> KB Admin
                      </h5>
                      <p className="text-[11px]">Manage categories, compose articles using the rich editor, and publish drafts.</p>
                    </div>
                  </div>
                </div>

                <Accordion items={faqAdmin} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
