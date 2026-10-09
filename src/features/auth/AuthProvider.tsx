import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { requireSupabase } from '@/lib/supabase'
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const queryClient = useQueryClient()
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    const client = requireSupabase()
    let active = true
    const apply = (session: Session | null): void => {
      const userId = session?.user.id ?? null
      // Never let one user's cached rows render for another (or after sign-out).
      if (userId !== userIdRef.current) queryClient.clear()
      userIdRef.current = userId
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' })
    }
    void client.auth.getSession().then(({ data }) => {
      if (active) apply(data.session)
    })
    const { data } = client.auth.onAuthStateChange((_event, session) => apply(session))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await requireSupabase().auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }, [])

  const signOut = useCallback(async (): Promise<void> => {
    await requireSupabase().auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext value={value}>{children}</AuthContext>
}
