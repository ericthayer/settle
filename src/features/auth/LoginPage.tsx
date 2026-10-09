import { useId, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Wordmark } from '@/components/Wordmark'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'

export function LoginPage(): ReactNode {
  const { state, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const errorId = useId()

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (state.status === 'signed-in') return <Navigate to={from} replace />

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    startTransition(async () => {
      const result = await signIn(email, password)
      if (result.error) {
        setError(result.error)
        return
      }
      void navigate(from, { replace: true })
    })
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <Wordmark className="mb-1" />
        <p className="mb-6 text-sm text-ink-muted">Your work, invoiced. Your money, tracked.</p>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} aria-describedby={error ? errorId : undefined}>
          <h1 className="sr-only">Sign in</h1>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <p id={errorId} role="alert" aria-live="polite" className="min-h-5 text-sm text-danger">
            {error}
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
