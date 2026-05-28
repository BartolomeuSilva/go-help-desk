import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { verifyEmail } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { extractError } from '@/api/client'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useT } from '@/i18n'

export function VerifyEmailPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? ''
    if (!token) {
      setError(t('verify.no_token'))
      return
    }
    verifyEmail(token)
      .then(({ user }) => {
        setUser(user)
        navigate({ to: '/dashboard' })
      })
      .catch((err) => {
        const code = extractError(err)
        setError(
          code === 'token_expired'
            ? t('verify.expired')
            : t('verify.invalid'),
        )
      })
  // Run once on mount only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t('verify.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="space-y-3 text-sm text-gray-700">
              <p className="text-red-600">{error}</p>
              <p>
                <Link to="/signup" className="text-blue-600 hover:underline">
                  {t('verify.back_signup')}
                </Link>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Spinner />
              <span>{t('verify.waiting')}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
