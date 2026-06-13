import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} 
from 'react'
import { supabase } from '../lib/supabaseClient'
import { acceptInvitation } from '../services/inviteOnboardingService.js'
import { AUTH_LOAD_TIMEOUT_MS, withAuthLoadTimeout } from '../utils/authLoadTimeout.js'
import {
  clearWorkspaceCache,
  restoreWorkspaceCache,
  saveWorkspaceCache,
} from '../utils/workspaceCache.js'

/** @typedef {{ id: string, name?: string }} Organization */

/** @typedef {{ id: string, full_name?: string | null, role?: string | null, organization_id?: string | null }} Profile */

const AuthContext = createContext(null)

/** Events that require loading profile/org workspace data. */
const BOOTSTRAP_EVENTS = new Set(['INITIAL_SESSION', 'SIGNED_IN'])

/** @type {import('@supabase/supabase-js').Subscription | null} */
let activeAuthSubscription = null

async function fetchProfileRow(userId) {
  console.log('PROFILE_LOADING', { userId })
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[AuthContext] profile query failed', { userId, error: error.message })
    return { profile: null, profileError: error.message }
  }
  if (!data) {
    console.warn('[AuthContext] profile missing', { userId })
    return { profile: null, profileError: null }
  }

  console.log('PROFILE_LOADED', {
    userId,
    organization_id: data.organization_id,
    role: data.role,
  })
  return {
    profile: {
      id: data.id,
      full_name: data.full_name,
      role: data.role,
      organization_id: data.organization_id,
    },
    profileError: null,
  }
}

/**
 * @param {string} organizationId
 * @param {Map<string, Organization>} orgCache
 * @param {boolean} allowCache
 */
async function fetchOrganizationRow(organizationId, orgCache, allowCache = true) {
  if (!organizationId) {
    return { organization: null, organizationError: null }
  }

  if (allowCache && orgCache.has(organizationId)) {
    console.log('ORG_LOADED', { organizationId, cached: true })
    return { organization: orgCache.get(organizationId), organizationError: null }
  }

  console.log('ORG_LOADING', { organizationId })
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', organizationId)
    .maybeSingle()

  if (error) {
    console.error('[AuthContext] organization query failed', {
      organizationId,
      error: error.message,
    })
    return { organization: null, organizationError: error.message }
  }
  if (!data?.id) {
    console.warn('[AuthContext] organization missing', { organizationId })
    return { organization: null, organizationError: null }
  }

  orgCache.set(organizationId, data)
  console.log('ORG_LOADED', { organizationId: data.id, name: data.name })
  return { organization: data, organizationError: null }
}

/**
 * @param {string} userId
 * @param {{ orgCache: Map<string, Organization>, allowOrgCache?: boolean }} options
 */
async function fetchProfileBundle(userId, { orgCache, allowOrgCache = true }) {
  const profileResult = await fetchProfileRow(userId)
  if (profileResult.profileError || !profileResult.profile) {
    return {
      profile: profileResult.profile,
      organization: null,
      profileError: profileResult.profileError,
      organizationError: null,
    }
  }

  const orgResult = await fetchOrganizationRow(
    profileResult.profile.organization_id,
    orgCache,
    allowOrgCache,
  )
  const organization =
    orgResult.organization ??
    (profileResult.profile.organization_id
      ? { id: profileResult.profile.organization_id }
      : null)

  return {
    profile: profileResult.profile,
    organization,
    profileError: null,
    organizationError: orgResult.organizationError,
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
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const [bootstrapComplete, setBootstrapComplete] = useState(false)

  const isBootstrappingRef = useRef(false)
  const bootstrapPromiseRef = useRef(null)
  const bootstrappedUserRef = useRef(null)
  const inviteCompletionRef = useRef(new Set())
  const orgCacheRef = useRef(new Map())
  const profileRef = useRef(null)
  const organizationRef = useRef(null)

  profileRef.current = profile
  organizationRef.current = organization

  const clearWorkspaceState = useCallback(() => {
    setProfile(null)
    setOrganization(null)
    setProfileError(null)
    setLoadTimedOut(false)
    bootstrappedUserRef.current = null
    clearWorkspaceCache()
  }, [])

  const applyBundle = useCallback((bundle) => {
    if (bundle.profileError) {
      setProfileError(bundle.profileError)
      setProfile(null)
      setOrganization(null)
      return false
    }
    if (!bundle.profile) {
      setProfileError('missing_profile')
      setProfile(null)
      setOrganization(null)
      return false
    }
    if (!bundle.profile.organization_id) {
      setProfileError('Profile exists but is not linked to an organization.')
      setProfile(bundle.profile)
      setOrganization(null)
      return false
    }
    if (!bundle.organization?.id) {
      const orgMessage = bundle.organizationError
        ? `Organization could not be loaded: ${bundle.organizationError}`
        : 'Organization record is missing for this profile.'
      setProfileError(orgMessage)
      setProfile(bundle.profile)
      setOrganization(null)
      return false
    }

    setProfile(bundle.profile)
    setOrganization(bundle.organization)
    setProfileError(null)
    saveWorkspaceCache(bundle.profile.id, bundle.profile, bundle.organization)
    bootstrappedUserRef.current = bundle.profile.id
    return true
  }, [])

  const completePendingInvite = useCallback(async (authUser, accessToken) => {
    if (profileRef.current?.id === authUser?.id && profileRef.current?.organization_id) {
      console.log('[AuthContext] profile already exists, skipping invite completion', {
        userId: authUser.id,
      })
      return false
    }

    const inviteId = String(authUser?.user_metadata?.invite_id || '').trim()
    if (!inviteId || !accessToken || !authUser?.id) return false

    const dedupeKey = `${authUser.id}:${inviteId}`
    if (inviteCompletionRef.current.has(dedupeKey)) return false
    inviteCompletionRef.current.add(dedupeKey)

    const fullName = String(authUser.user_metadata?.full_name || '').trim()
    if (!fullName) {
      inviteCompletionRef.current.delete(dedupeKey)
      return false
    }

    try {
      const result = await withAuthLoadTimeout(
        acceptInvitation({ inviteId, fullName, accessToken }),
        AUTH_LOAD_TIMEOUT_MS,
        'Invite completion',
      )

      if (!result.ok) {
        setProfileError(
          result.error || 'Invitation was accepted but profile could not be created. Contact your administrator.',
        )
        inviteCompletionRef.current.delete(dedupeKey)
        return false
      }

      return true
    } catch (err) {
      const message = err?.message || 'Invite completion failed.'
      setProfileError(message)
      if (String(message).includes('timed out')) {
        setLoadTimedOut(true)
      }
      inviteCompletionRef.current.delete(dedupeKey)
      return false
    }
  }, [])

  const bootstrapUserSession = useCallback(
    async (authSession, { force = false } = {}) => {
      const authUser = authSession?.user
      if (!authUser?.id) {
        clearWorkspaceState()
        return
      }

      const userId = authUser.id

      if (
        !force &&
        bootstrappedUserRef.current === userId &&
        profileRef.current?.id === userId &&
        profileRef.current?.organization_id
      ) {
        console.log('[AuthContext] bootstrap skipped: workspace already loaded', { userId })
        return
      }

      if (!force) {
        const cached = restoreWorkspaceCache(userId)
        if (cached?.profile?.organization_id) {
          console.log('[AuthContext] bootstrap restored from cache', { userId })
          setProfile(cached.profile)
          setOrganization(cached.organization)
          setProfileError(null)
          bootstrappedUserRef.current = userId
          return
        }
      }

      if (isBootstrappingRef.current && bootstrapPromiseRef.current) {
        console.log('[AuthContext] bootstrap waiting for in-flight load', { userId })
        await bootstrapPromiseRef.current
        return
      }

      isBootstrappingRef.current = true
      setProfileLoading(true)
      setProfileError(null)
      setLoadTimedOut(false)

      const work = (async () => {
        try {
          let bundle = await withAuthLoadTimeout(
            fetchProfileBundle(userId, { orgCache: orgCacheRef.current, allowOrgCache: !force }),
            AUTH_LOAD_TIMEOUT_MS,
            'Session bootstrap',
          )

          if (
            !bundle.profile &&
            authSession?.access_token &&
            authUser.user_metadata?.invite_id &&
            profileRef.current?.id !== userId
          ) {
            const completed = await completePendingInvite(authUser, authSession.access_token)
            if (completed) {
              bundle = await withAuthLoadTimeout(
                fetchProfileBundle(userId, { orgCache: orgCacheRef.current, allowOrgCache: false }),
                AUTH_LOAD_TIMEOUT_MS,
                'Profile reload after invite',
              )
            } else if (!bundle.profile) {
              setProfileError((current) =>
                current ||
                'Invitation may be accepted but your profile was not created. Try signing out and back in, or contact your administrator.',
              )
            }
          }

          applyBundle(bundle)
        } catch (err) {
          const message = err?.message || 'Failed to load workspace.'
          console.error('[AuthContext] bootstrap failed', { userId, error: message })
          setProfileError(message)
          setProfile(null)
          setOrganization(null)
          if (String(message).includes('timed out')) {
            setLoadTimedOut(true)
          }
        } finally {
          setProfileLoading(false)
          isBootstrappingRef.current = false
          bootstrapPromiseRef.current = null
          console.log('BOOTSTRAP_COMPLETE', { userId })
        }
      })()

      bootstrapPromiseRef.current = work
      await work
    },
    [applyBundle, clearWorkspaceState, completePendingInvite],
  )

  const refreshProfile = useCallback(async () => {
    if (!user?.id || !session) return
    if (isBootstrappingRef.current && bootstrapPromiseRef.current) {
      await bootstrapPromiseRef.current
      return
    }
    await bootstrapUserSession(session, { force: true })
  }, [user, session, bootstrapUserSession])

  useEffect(() => {
    let cancelled = false

    console.log('AUTH_INIT_START')

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (cancelled) return

      console.log('SESSION_LOADED', { event, userId: authSession?.user?.id ?? null })

      setSession(authSession)
      setUser(authSession?.user ?? null)

      void (async () => {
        try {
          if (!authSession?.user?.id) {
            clearWorkspaceState()
            return
          }

          if (event === 'TOKEN_REFRESHED') {
            console.log('[AuthContext] token refreshed, skipping workspace reload')
            return
          }

          if (!BOOTSTRAP_EVENTS.has(event)) {
            console.log('[AuthContext] auth event skipped for bootstrap', { event })
            return
          }

          await bootstrapUserSession(authSession)
        } catch (err) {
          const message = err?.message || 'Failed to initialize workspace.'
          console.error('[AuthContext] auth event bootstrap failed', { event, error: message })
          setProfileError(message)
          if (String(message).includes('timed out')) {
            setLoadTimedOut(true)
          }
        } finally {
          if (!cancelled) {
            setAuthLoading(false)
            setBootstrapComplete(true)
            console.log('BOOTSTRAP_COMPLETE', { event })
          }
        }
      })()
    })

    activeAuthSubscription = subscription

    return () => {
      cancelled = true
      subscription.unsubscribe()
      activeAuthSubscription = null
    }
  }, [bootstrapUserSession, clearWorkspaceState])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } finally {
      setSession(null)
      setUser(null)
      clearWorkspaceState()
      setLoadTimedOut(false)
      setProfileLoading(false)
      setAuthLoading(false)
      setBootstrapComplete(true)
      orgCacheRef.current.clear()
      inviteCompletionRef.current.clear()
      isBootstrappingRef.current = false
      bootstrapPromiseRef.current = null
    }
  }, [clearWorkspaceState])

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      organization,
      loading: authLoading,
      profileLoading,
      profileError,
      loadTimedOut,
      bootstrapComplete,
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
      loadTimedOut,
      bootstrapComplete,
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
