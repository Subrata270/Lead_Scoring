import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabaseClient'

/** @typedef {{ id: string, name?: string }} Organization */

/** @typedef {{ id: string, full_name?: string | null, role?: string | null, organization_id?: string | null }} Profile */

const AuthContext = createContext(null)

async function fetchProfileBundle(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, organization_id, organizations(id, name)')
    .eq('id', userId)
    .maybeSingle()

  if (error) return { profile: null, organization: null, profileError: error.message }
  if (!profile) return { profile: null, organization: null, profileError: null }

  const orgRel = profile.organizations
  const organization = Array.isArray(orgRel) ? orgRel[0] ?? null : orgRel ?? null

  return {
    profile: {
      id: profile.id,
      full_name: profile.full_name,
      role: profile.role,
      organization_id: profile.organization_id,
    },
    organization,
    profileError: null,
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [organization, setOrganization] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState(null)

  const loadProfile = useCallback(async (userId) => {
    setProfileLoading(true)
    setProfileError(null)
    const { profile: p, organization: org, profileError: pErr } = await fetchProfileBundle(userId)
    setProfileLoading(false)
    if (pErr) {
      setProfileError(pErr)
      setProfile(null)
      setOrganization(null)
      return
    }
    if (!p) {
      setProfileError('missing_profile')
      setProfile(null)
      setOrganization(null)
      return
    }
    setProfile(p)
    setOrganization(org)
    setProfileError(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      const {
        data: { session: s },
      } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(s)
      setUser(s?.user ?? null)
      setAuthLoading(false)
      if (s?.user?.id) {
        await loadProfile(s.user.id)
      } else {
        setProfile(null)
        setOrganization(null)
        setProfileError(null)
      }
    }

    void init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user?.id) {
        void loadProfile(s.user.id)
      } else {
        setProfile(null)
        setOrganization(null)
        setProfileLoading(false)
        setProfileError(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setOrganization(null)
    setProfileError(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return
    await loadProfile(user.id)
  }, [user, loadProfile])

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      organization,
      loading: authLoading,
      profileLoading,
      profileError,
      signOut,
      refreshProfile,
    }),
    [
      session,
      user,
      profile,
      organization,
      authLoading,
      profileLoading,
      profileError,
      signOut,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider
export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuthContext must be used within AuthProvider')
  }
  return ctx
}
