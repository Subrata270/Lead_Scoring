import { useEffect, useRef } from 'react'
import { useAuthContext } from '../context/AuthContext.jsx'

export function useAuth() {
  const auth = useAuthContext()
  const prevRef = useRef(null)

  useEffect(() => {
    const snapshot = {
      loading: auth.loading,
      profileLoading: auth.profileLoading,
      bootstrapComplete: auth.bootstrapComplete,
      hasUser: Boolean(auth.user?.id),
      hasProfile: Boolean(auth.profile?.id),
      hasOrganization: Boolean(auth.organization?.id),
      organizationId: auth.profile?.organization_id ?? auth.organization?.id ?? null,
      profileError: auth.profileError,
      loadTimedOut: auth.loadTimedOut,
    }

    const prev = prevRef.current
    const changed =
      !prev ||
      prev.loading !== snapshot.loading ||
      prev.profileLoading !== snapshot.profileLoading ||
      prev.bootstrapComplete !== snapshot.bootstrapComplete ||
      prev.hasUser !== snapshot.hasUser ||
      prev.hasProfile !== snapshot.hasProfile ||
      prev.hasOrganization !== snapshot.hasOrganization ||
      prev.organizationId !== snapshot.organizationId ||
      prev.profileError !== snapshot.profileError ||
      prev.loadTimedOut !== snapshot.loadTimedOut

    if (changed) {
      console.log('[useAuth] state', snapshot)
      if (snapshot.profileLoading) {
        console.log('[useAuth] profile loading')
      }
      if (!snapshot.profileLoading && snapshot.hasProfile) {
        console.log('[useAuth] profile loaded')
      }
      if (!snapshot.profileLoading && snapshot.hasOrganization) {
        console.log('[useAuth] organization loaded')
      }
      if (!snapshot.profileLoading && snapshot.hasUser && !snapshot.hasProfile) {
        console.log('[useAuth] profile missing')
      }
      if (!snapshot.profileLoading && snapshot.hasProfile && !snapshot.hasOrganization) {
        console.log('[useAuth] organization missing')
      }
      prevRef.current = snapshot
    }
  }, [
    auth.loading,
    auth.profileLoading,
    auth.bootstrapComplete,
    auth.user,
    auth.profile,
    auth.organization,
    auth.profileError,
    auth.loadTimedOut,
  ])

  return auth
}
