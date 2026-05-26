import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type QueryKey = readonly unknown[]

export interface QueryState<T> {
  data: T | undefined
  error: Error | null
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  isSuccess: boolean
  refetch: () => Promise<T>
}

export interface MutationState<TData, TVariables> {
  data: TData | undefined
  error: Error | null
  isPending: boolean
  mutate: (variables: TVariables) => Promise<TData>
}

interface CacheEntry<T> {
  data?: T
  error?: Error
  updatedAt: number
  promise?: Promise<T>
}

interface QueryClientValue {
  getEntry: <T>(key: QueryKey) => CacheEntry<T> | undefined
  fetchQuery: <T>(key: QueryKey, queryFn: () => Promise<T>, staleTime?: number, force?: boolean) => Promise<T>
  invalidateQueries: (prefix?: QueryKey) => void
}

const QueryClientContext = createContext<QueryClientValue | null>(null)
const DEFAULT_STALE_TIME_MS = 30_000

function serializeKey(key: QueryKey): string {
  return JSON.stringify(key)
}

function keyMatchesPrefix(key: QueryKey, prefix: QueryKey): boolean {
  if (prefix.length > key.length) return false
  return prefix.every((part, index) => serializeKey([part]) === serializeKey([key[index]]))
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef(new Map<string, CacheEntry<unknown>>())

  const value = useMemo<QueryClientValue>(() => ({
    getEntry: <T,>(key: QueryKey) => cacheRef.current.get(serializeKey(key)) as CacheEntry<T> | undefined,
    fetchQuery: async <T,>(key: QueryKey, queryFn: () => Promise<T>, staleTime = DEFAULT_STALE_TIME_MS, force = false) => {
      const cacheKey = serializeKey(key)
      const existing = cacheRef.current.get(cacheKey) as CacheEntry<T> | undefined
      const isFresh = existing?.data !== undefined && Date.now() - existing.updatedAt < staleTime
      if (!force && isFresh) return existing.data as T
      if (!force && existing?.promise) return existing.promise

      const promise = queryFn()
        .then((data) => {
          cacheRef.current.set(cacheKey, { data, updatedAt: Date.now() })
          return data
        })
        .catch((err: unknown) => {
          const error = err instanceof Error ? err : new Error(String(err))
          cacheRef.current.set(cacheKey, { error, updatedAt: Date.now() })
          throw error
        })

      cacheRef.current.set(cacheKey, { data: existing?.data, error: existing?.error, updatedAt: existing?.updatedAt ?? 0, promise })
      return promise
    },
    invalidateQueries: (prefix?: QueryKey) => {
      if (!prefix) {
        cacheRef.current.clear()
        return
      }
      for (const key of cacheRef.current.keys()) {
        const parsed = JSON.parse(key) as QueryKey
        if (keyMatchesPrefix(parsed, prefix)) cacheRef.current.delete(key)
      }
    },
  }), [])

  return <QueryClientContext.Provider value={value}>{children}</QueryClientContext.Provider>
}

export function useQueryClient(): QueryClientValue {
  const client = useContext(QueryClientContext)
  if (!client) throw new Error('useQueryClient must be used inside QueryProvider')
  return client
}

export function useApiQuery<T>(
  key: QueryKey,
  queryFn: () => Promise<T>,
  options?: { enabled?: boolean; staleTime?: number }
): QueryState<T> {
  const client = useQueryClient()
  const keyString = useMemo(() => serializeKey(key), [key])
  const stableKey = useMemo(() => key, [keyString])
  const queryFnRef = useRef(queryFn)
  const initialEntry = client.getEntry<T>(stableKey)
  const [data, setData] = useState<T | undefined>(initialEntry?.data)
  const [error, setError] = useState<Error | null>(initialEntry?.error ?? null)
  const [isFetching, setIsFetching] = useState(false)
  const enabled = options?.enabled ?? true
  const staleTime = options?.staleTime ?? DEFAULT_STALE_TIME_MS

  useEffect(() => {
    queryFnRef.current = queryFn
  }, [queryFn])

  const execute = useCallback(async (force = false) => {
    setIsFetching(true)
    setError(null)
    try {
      const result = await client.fetchQuery(stableKey, queryFnRef.current, staleTime, force)
      setData(result)
      return result
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error(String(err))
      setError(nextError)
      throw nextError
    } finally {
      setIsFetching(false)
    }
  }, [client, stableKey, staleTime])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setIsFetching(true)
    setError(null)
    client.fetchQuery(stableKey, queryFnRef.current, staleTime)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false)
      })
    return () => { cancelled = true }
  }, [client, enabled, keyString, stableKey, staleTime])

  return {
    data,
    error,
    isLoading: enabled && data === undefined && isFetching,
    isFetching,
    isError: error !== null,
    isSuccess: data !== undefined && error === null,
    refetch: () => execute(true),
  }
}

export function useApiMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: { invalidate?: QueryKey[]; onSuccess?: (data: TData, variables: TVariables) => void }
): MutationState<TData, TVariables> {
  const client = useQueryClient()
  const [data, setData] = useState<TData | undefined>()
  const [error, setError] = useState<Error | null>(null)
  const [isPending, setIsPending] = useState(false)

  const mutate = useCallback(async (variables: TVariables) => {
    setIsPending(true)
    setError(null)
    try {
      const result = await mutationFn(variables)
      setData(result)
      for (const key of options?.invalidate ?? []) client.invalidateQueries(key)
      options?.onSuccess?.(result, variables)
      return result
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error(String(err))
      setError(nextError)
      throw nextError
    } finally {
      setIsPending(false)
    }
  }, [client, mutationFn, options])

  return { data, error, isPending, mutate }
}
