import { useEffect, useState } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { login, verifyMFA, getMe, enrollMFAStart, enrollMFAConfirm, getSignupStatus } from '@/api/auth'
import { getSiteConfig } from '@/api/admin'
import { useAuthStore } from '@/store/auth'
import { useT } from '@/i18n'
import { extractError } from '@/api/client'
import { Sun, Moon, Mail, Lock, KeyRound } from 'lucide-react'

type Step = 'credentials' | 'verify' | 'enroll'

function ParticleBackground() {
  useEffect(() => {
    const canvas = document.getElementById('particle-canvas') as HTMLCanvasElement
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let particles: Array<{
      x: number
      y: number
      size: number
      speedX: number
      speedY: number
      opacity: number
    }> = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', resize)
    resize()

    const createParticles = () => {
      particles = []
      const count = Math.min(Math.floor(window.innerWidth / 15), 60)
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 1,
          speedX: (Math.random() - 0.5) * 0.3,
          speedY: (Math.random() - 0.5) * 0.3,
          opacity: Math.random() * 0.5 + 0.1,
        })
      }
    }
    createParticles()

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const isDark = document.documentElement.classList.contains('dark')

      particles.forEach((p) => {
        p.x += p.speedX
        p.y += p.speedY

        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        if (isDark) {
          ctx.fillStyle = `rgba(250, 255, 105, ${p.opacity})`
        } else {
          ctx.fillStyle = `rgba(37, 99, 235, ${p.opacity})`
        }
        ctx.fill()
      })

      animationFrameId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      id="particle-canvas"
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
    />
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const { t } = useT()
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [enrollSecret, setEnrollSecret] = useState('')
  const [enrollQRDataURL, setEnrollQRDataURL] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signupEnabled, setSignupEnabled] = useState(false)

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('theme')
    return (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) ? 'dark' : 'light'
  })

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const { data: siteConfig } = useQuery({
    queryKey: ['site-config'],
    queryFn: getSiteConfig,
  })

  const logoURL = theme === 'dark' && siteConfig?.logo_dark_url
    ? siteConfig.logo_dark_url
    : (siteConfig?.logo_url ?? '')
  const siteName = siteConfig?.name ?? 'Go Help Desk'

  useEffect(() => {
    getSignupStatus().then(({ enabled }) => setSignupEnabled(enabled)).catch(() => {})
  }, [])

  async function completeLogin() {
    const user = await getMe()
    setUser(user)
    navigate({ to: '/dashboard' })
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { user, mfa_needed, mfa_enrollment_needed } = await login(email, password)
      if (mfa_enrollment_needed) {
        setStep('enroll')
      } else if (mfa_needed) {
        setStep('verify')
      } else {
        setUser(user)
        navigate({ to: '/dashboard' })
      }
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyMFA(mfaCode)
      await completeLogin()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (step !== 'enroll' || enrollSecret) return
    enrollMFAStart()
      .then(({ secret, qr_data_url }) => {
        setEnrollSecret(secret)
        setEnrollQRDataURL(qr_data_url)
      })
      .catch((err) => setError(extractError(err)))
  }, [step, enrollSecret])

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await enrollMFAConfirm(mfaCode)
      await completeLogin()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  const title =
    step === 'verify' ? t('auth.mfa_title')
    : step === 'enroll' ? t('auth.enroll_title')
    : t('auth.sign_in_title')

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 dark:bg-neutral-950 overflow-hidden transition-colors duration-300">
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes float-reverse {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(-30px, 40px) scale(0.95); }
          66% { transform: translate(20px, -20px) scale(1.05); }
        }
        @keyframes spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-float-1 {
          animation: float-slow 15s infinite ease-in-out;
        }
        .animate-float-2 {
          animation: float-reverse 15s infinite ease-in-out;
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>

      {/* Dynamic colorful blobs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-400/20 dark:bg-yellow-400/10 rounded-full mix-blend-multiply filter blur-3xl opacity-60 pointer-events-none z-0 animate-float-1" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-purple-400/20 dark:bg-blue-500/10 rounded-full mix-blend-multiply filter blur-3xl opacity-60 pointer-events-none z-0 animate-float-2" />

      {/* HTML5 Canvas Particles */}
      <ParticleBackground />

      {/* Theme Toggler */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          className="p-2.5 rounded-full border border-gray-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-neutral-800 transition-all duration-200 shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4 text-yellow-400 animate-spin-slow" /> : <Moon className="h-4 w-4 text-blue-600" />}
        </button>
      </div>

      {/* Glassmorphic Container Card */}
      <div className="w-full max-w-md backdrop-blur-xl bg-white/40 dark:bg-black/40 border border-white/20 dark:border-neutral-800/40 shadow-2xl rounded-2xl p-8 mx-4 z-10 transition-all duration-300 hover:shadow-blue-500/5 dark:hover:shadow-yellow-500/5">
        
        {/* App Branding */}
        <div className="flex flex-col items-center mb-8">
          {logoURL ? (
            <img
              src={logoURL}
              alt={siteName}
              className="max-h-12 w-auto object-contain mb-2 filter drop-shadow-[0_2px_8px_rgba(37,99,235,0.15)] dark:drop-shadow-[0_2px_8px_rgba(250,255,105,0.15)] transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-yellow-300 dark:to-yellow-500 bg-clip-text text-transparent mb-1 transition-transform duration-300 hover:scale-105">
              {siteName}
            </h1>
          )}
          <span className="text-xs text-gray-500 dark:text-neutral-400 font-medium tracking-wide uppercase mt-1">
            {title}
          </span>
        </div>

        {/* Credentials Form */}
        {step === 'credentials' && (
          <form onSubmit={handleLogin} method="POST" className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-neutral-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="seu-email@dominio.com"
                  className="pl-10 pr-3 py-2 bg-white/50 dark:bg-neutral-900/50 border border-gray-200 dark:border-neutral-800 focus:border-blue-500 dark:focus:border-yellow-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-yellow-400/20 backdrop-blur-sm rounded-lg transition-all duration-200 outline-none w-full text-sm text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-neutral-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-10 pr-3 py-2 bg-white/50 dark:bg-neutral-900/50 border border-gray-200 dark:border-neutral-800 focus:border-blue-500 dark:focus:border-yellow-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-yellow-400/20 backdrop-blur-sm rounded-lg transition-all duration-200 outline-none w-full text-sm text-gray-800 dark:text-white"
                />
              </div>
            </div>

            {error && <p className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-400/10 border border-red-500/20 dark:border-red-400/20 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white dark:text-neutral-950 font-semibold py-2 px-4 rounded-lg shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-yellow-500/25 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{t('auth.signing_in')}</span>
                </>
              ) : (
                <span>{t('auth.sign_in')}</span>
              )}
            </button>

            {signupEnabled && (
              <p className="text-center text-xs text-gray-500 dark:text-neutral-400 mt-4">
                {t('auth.no_account')}{' '}
                <Link to="/signup" className="font-semibold text-blue-600 dark:text-yellow-400 hover:underline">
                  {t('auth.create_one')}
                </Link>
              </p>
            )}
          </form>
        )}

        {/* Verify MFA Form */}
        {step === 'verify' && (
          <form onSubmit={handleVerify} method="POST" className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-neutral-300 bg-gray-500/5 p-3 rounded-lg border border-gray-500/10">{t('auth.mfa_instruction')}</p>
            <div className="space-y-1">
              <label htmlFor="mfa" className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">
                {t('auth.verification_code')}
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-neutral-500" />
                <input
                  id="mfa"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="pl-10 pr-3 py-2 bg-white/50 dark:bg-neutral-900/50 border border-gray-200 dark:border-neutral-800 focus:border-blue-500 dark:focus:border-yellow-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-yellow-400/20 backdrop-blur-sm rounded-lg transition-all duration-200 outline-none w-full text-sm text-center tracking-[0.3em] font-mono text-gray-800 dark:text-white"
                />
              </div>
            </div>

            {error && <p className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-400/10 border border-red-500/20 dark:border-red-400/20 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white dark:text-neutral-950 font-semibold py-2 px-4 rounded-lg shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-yellow-500/25 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{t('auth.verifying')}</span>
                </>
              ) : (
                <span>{t('auth.verify')}</span>
              )}
            </button>
          </form>
        )}

        {/* Enroll MFA Form */}
        {step === 'enroll' && (
          <form onSubmit={handleEnroll} method="POST" className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-neutral-300 bg-gray-500/5 p-3 rounded-lg border border-gray-500/10">
              {t('auth.enroll_instruction')}
            </p>
            {enrollQRDataURL ? (
              <div className="flex flex-col items-center gap-3 bg-white/40 dark:bg-black/20 p-4 rounded-xl border border-white/10 shadow-inner">
                <img
                  alt="TOTP QR code"
                  className="h-44 w-44 rounded-lg border bg-white p-2 shadow-sm transition-transform duration-300 hover:scale-105"
                  src={enrollQRDataURL}
                />
                <code className="max-w-full truncate text-[11px] text-gray-500 dark:text-neutral-400 bg-black/5 dark:bg-white/5 px-2 py-1 rounded" title={enrollSecret}>
                  {t('common.secret_label')}: {enrollSecret}
                </code>
              </div>
            ) : (
              <div className="flex justify-center py-6">
                <svg className="animate-spin h-6 w-6 text-blue-600 dark:text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="enroll" className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">
                {t('auth.verification_code')}
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-neutral-500" />
                <input
                  id="enroll"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="pl-10 pr-3 py-2 bg-white/50 dark:bg-neutral-900/50 border border-gray-200 dark:border-neutral-800 focus:border-blue-500 dark:focus:border-yellow-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-yellow-400/20 backdrop-blur-sm rounded-lg transition-all duration-200 outline-none w-full text-sm text-center tracking-[0.3em] font-mono text-gray-800 dark:text-white"
                />
              </div>
            </div>

            {error && <p className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-400/10 border border-red-500/20 dark:border-red-400/20 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={loading || !enrollSecret}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white dark:text-neutral-950 font-semibold py-2 px-4 rounded-lg shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-yellow-500/25 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{t('auth.confirming')}</span>
                </>
              ) : (
                <span>{t('auth.confirm_sign_in')}</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
