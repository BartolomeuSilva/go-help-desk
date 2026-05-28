import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { signup } from '@/api/auth'
import { extractError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useT } from '@/i18n'

export function SignupPage() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError(t('setup.err_passwords_match'))
      return
    }
    setLoading(true)
    try {
      await signup(email, displayName, password)
      setDone(true)
    } catch (err) {
      const msg = extractError(err)
      setError(
        msg === 'domain_not_allowed'
          ? t('signup.err_domain_not_allowed')
          : msg,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t('signup.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                {t('signup.check_email')}
              </p>
              <p>
                <Link to="/login" className="text-blue-600 hover:underline">
                  {t('signup.back_login')}
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} method="POST" className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">{t('setup.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="display_name">{t('signup.display_name')}</Label>
                <Input
                  id="display_name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">{t('setup.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm">{t('setup.confirm_password')}</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('signup.creating') : t('signup.create')}
              </Button>
              <p className="text-center text-sm text-gray-500">
                {t('signup.already_have')}{' '}
                <Link to="/login" className="text-blue-600 hover:underline">
                  {t('auth.sign_in')}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
