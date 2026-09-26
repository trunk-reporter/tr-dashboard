import {
  getCall,
  getCallFrequencies,
  getCalls,
  getCallTranscription,
  getCallTransmissions,
  getSystems,
  getTalkgroups,
  getUnitTagSuggestions,
  approveUnitTagSuggestion,
  dismissUnitTagSuggestion,
  isMissingEndpoint,
  type CallQueryParams,
  type TalkgroupQueryParams,
  type UnitTagSuggestionQueryParams,
  type Unavailable,
} from '@/api/client'
import type {
  Call,
  CallFrequency,
  CallListResponse,
  CallTransmission,
  SystemListResponse,
  TalkgroupListResponse,
  Transcription,
  UnitTagSuggestionApproveResponse,
  UnitTagSuggestionDismissResponse,
  UnitTagSuggestionListResponse,
} from '@/api/types'
import type { QueryKey } from '@/api/query'

export const queryKeys = {
  all: ['api'] as const,
  systems: {
    all: ['api', 'systems'] as const,
    list: () => ['api', 'systems', 'list'] as const,
  },
  talkgroups: {
    all: ['api', 'talkgroups'] as const,
    list: (params?: TalkgroupQueryParams) => ['api', 'talkgroups', 'list', params ?? {}] as const,
  },
  calls: {
    all: ['api', 'calls'] as const,
    list: (params?: CallQueryParams) => ['api', 'calls', 'list', params ?? {}] as const,
    detail: (id: number) => ['api', 'calls', 'detail', id] as const,
    related: (id: number) => ['api', 'calls', 'detail', id, 'related'] as const,
  },
  unitTagSuggestions: {
    all: ['api', 'unit-tag-suggestions'] as const,
    list: (params?: UnitTagSuggestionQueryParams) => ['api', 'unit-tag-suggestions', 'list', params ?? {}] as const,
  },
} satisfies Record<string, unknown>

export interface CallDetailData {
  call: Call
  transmissions: CallTransmission[]
  frequencies: CallFrequency[]
  transcription: Transcription | null
}

export const systemService = {
  list: (): Promise<SystemListResponse> => getSystems(),
}

export const talkgroupService = {
  list: (params?: TalkgroupQueryParams): Promise<TalkgroupListResponse> => getTalkgroups(params),
}

export const callService = {
  list: (params?: CallQueryParams): Promise<CallListResponse> => getCalls(params),
  get: (id: number): Promise<Call> => getCall(id),
  getDetail: async (id: number): Promise<CallDetailData> => {
    const call = await getCall(id)
    const transmissions = call.src_list && call.src_list.length > 0
      ? call.src_list
      : await getCallTransmissions(id).then((res) => res.transmissions || []).catch(() => [])
    const frequencies = call.freq_list && call.freq_list.length > 0
      ? call.freq_list
      : await getCallFrequencies(id).then((res) => res.frequencies || []).catch(() => [])
    const transcription = await getCallTranscription(id).catch(() => null)

    return { call, transmissions, frequencies, transcription }
  },
}

// Set once GET /unit-tag-suggestions turns out to be a missing route (tr-engine
// before v0.10, see isMissingEndpoint). It only goes false -> true and lasts for
// the page load, so a reload checks again after an engine upgrade.
let unitTagSuggestionsMissing = false

export const unitTagSuggestionService = {
  /** True once the engine has shown it has no unit tag suggestions API: hide the feature and don't request it again. */
  isUnavailable: (): boolean => unitTagSuggestionsMissing,
  /** Unavailable (without a request) for restricted credentials: the endpoint denies them */
  list: async (params?: UnitTagSuggestionQueryParams): Promise<UnitTagSuggestionListResponse | Unavailable> => {
    try {
      return await getUnitTagSuggestions(params)
    } catch (err) {
      if (isMissingEndpoint(err)) unitTagSuggestionsMissing = true
      throw err
    }
  },
  /** `alphaTag` overrides the proposed tag ("edit, then approve"); omit it to apply `proposed_tag`. */
  approve: ({ id, alphaTag }: { id: number; alphaTag?: string }): Promise<UnitTagSuggestionApproveResponse> =>
    approveUnitTagSuggestion(id, alphaTag !== undefined ? { alpha_tag: alphaTag } : undefined),
  dismiss: ({ id }: { id: number }): Promise<UnitTagSuggestionDismissResponse> => dismissUnitTagSuggestion(id),
}

export function invalidateCallQueries(id?: number): QueryKey[] {
  return id ? [queryKeys.calls.all, queryKeys.calls.detail(id)] : [queryKeys.calls.all]
}
