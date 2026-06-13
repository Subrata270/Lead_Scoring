/**
 * Module-level workspace cache survives React StrictMode remounts
 * so we don't refetch profile/org on duplicate INITIAL_SESSION events.
 */
export const workspaceCache = {
  userId: null,
  profile: null,
  organization: null,
}

export function saveWorkspaceCache(userId, profile, organization) {
  workspaceCache.userId = userId
  workspaceCache.profile = profile
  workspaceCache.organization = organization
}

export function clearWorkspaceCache() {
  workspaceCache.userId = null
  workspaceCache.profile = null
  workspaceCache.organization = null
}

export function restoreWorkspaceCache(userId) {
  if (workspaceCache.userId !== userId || !workspaceCache.profile) {
    return null
  }
  return {
    profile: workspaceCache.profile,
    organization: workspaceCache.organization,
  }
}
