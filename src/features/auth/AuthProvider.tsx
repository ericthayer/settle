import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { requireSupabase } from '@/lib/supabase'
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    const client = requireSupabase()
    let active = true
    void client.auth.getSession().then(({ data }) => {
      if (!active) return
      setState(data.session ? { status: 'signed-in', session: data.session } : { status: 'signed-out' })
    })
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' })
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

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
