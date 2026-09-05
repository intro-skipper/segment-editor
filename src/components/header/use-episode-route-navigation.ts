import { useRef } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { getPlayerNavigationRoute } from '@/lib/navigation-utils'

/**
 * Navigation to another episode's player page, shared by the Episode Switcher
 * and the previous/next arrows so both land on the same route with segments
 * fetched. `preloadEpisode` warms the route once per episode on hover or focus.
 */
export function useEpisodeRouteNavigation() {
  const navigate = useNavigate()
  const router = useRouter()
  const preloadedEpisodeIdsRef = useRef<Set<string> | null>(null)
  if (preloadedEpisodeIdsRef.current === null) {
    preloadedEpisodeIdsRef.current = new Set<string>()
  }

  const goToEpisode = (episodeId: string) => {
    void navigate(getPlayerNavigationRoute(episodeId))
  }

  const preloadEpisode = (episodeId: string) => {
    const preloadedEpisodeIds = preloadedEpisodeIdsRef.current
    if (preloadedEpisodeIds === null || preloadedEpisodeIds.has(episodeId)) {
      return
    }
    preloadedEpisodeIds.add(episodeId)
    void router.preloadRoute(getPlayerNavigationRoute(episodeId))
  }

  return { goToEpisode, preloadEpisode }
}
