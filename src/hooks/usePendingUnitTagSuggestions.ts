import type { UnitTagSuggestionQueryParams } from '@/api/client'
import { useApiQuery } from '@/api/query'
import { queryKeys, unitTagSuggestionService } from '@/api/services'

// Only the total is needed
const PENDING_PARAMS: UnitTagSuggestionQueryParams = { status: 'pending', limit: 1 }

/**
 * Pending unit tag suggestions (a limit=1 request, for the total and scanner
 * status). It also probes for the API: on engines without it (tr-engine before
 * v0.10) the first 404 marks it unavailable (unitTagSuggestionService.isUnavailable)
 * and it isn't requested again this page load. Callers sharing it share one
 * cached request.
 */
export function usePendingUnitTagSuggestions(enabled = true) {
  return useApiQuery(
    queryKeys.unitTagSuggestions.list(PENDING_PARAMS),
    () => unitTagSuggestionService.list(PENDING_PARAMS),
    { staleTime: 60_000, enabled: enabled && !unitTagSuggestionService.isUnavailable() }
  )
}
