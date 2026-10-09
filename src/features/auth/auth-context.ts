import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly session: Session }

export interface AuthContextValue {
  readonly state: AuthState
  signIn(email: string, password: string): Promise<{ error: string | null }>
  signOut(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
