/** Read-only client for the authenticated Fileloom API. Wire responses are validated before rendering. */
import { z } from 'zod'

const rootSchema = z.object({ id: z.string().min(1), name: z.string(), path: z.string() })
const entrySchema = z.object({
  path: z.string().min(1), name: z.string(), ext: z.string(),
  size: z.number().finite().nonnegative(), mtimeMs: z.number().finite(), kind: z.enum(['file', 'directory']),
})
const rootsSchema = z.object({ roots: z.array(rootSchema) })
const listSchema = z.object({ rootId: z.string(), path: z.string(), entries: z.array(entrySchema) })
const librarySchema = z.object({ rootId: z.string(), entries: z.array(entrySchema), truncated: z.boolean(), incomplete: z.boolean() })

export type Root = z.infer<typeof rootSchema>
export type Entry = z.infer<typeof entrySchema>
export type ApiFailure = 'unauthorized' | 'invalidResponse' | 'unavailable'

/** A safe display category; raw server messages do not become product copy. */
export class FileApiError extends Error {
  constructor(readonly code: ApiFailure, readonly status?: number) { super(code) }
}

/** Current Fileloom Host content limit, not a frontend setting. */
export const PREVIEW_LIMIT = 64 * 1024 * 1024

async function get<T>(url: URL, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  let response: Response
  try { response = await fetch(url, { credentials: 'same-origin', signal }) }
  catch (error) {
    if (signal.aborted) throw error
    throw new FileApiError('unavailable')
  }
  if (!response.ok) throw new FileApiError(response.status === 401 || response.status === 403 ? 'unauthorized' : 'unavailable', response.status)
  let value: unknown
  try { value = await response.json() }
  catch (error) {
    if (signal.aborted) throw error
    throw new FileApiError('invalidResponse')
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new FileApiError('invalidResponse')
  return parsed.data
}

/** Bind to the page origin; never send host credentials or file paths to third-party origins. */
export function createFileApi(origin: string) {
  const url = (endpoint: string, rootId?: string, path?: string): URL => {
    const result = new URL(`/api/file-manager/${endpoint}`, origin)
    if (rootId !== undefined) result.searchParams.set('rootId', rootId)
    if (path !== undefined) result.searchParams.set('path', path)
    return result
  }
  return {
    roots: async (signal: AbortSignal): Promise<Root[]> => (await get(url('roots'), rootsSchema, signal)).roots,
    list: async (rootId: string, path: string, signal: AbortSignal): Promise<Entry[]> => {
      const result = await get(url('list', rootId, path), listSchema, signal)
      if (result.rootId !== rootId || result.path !== path) throw new FileApiError('invalidResponse')
      return result.entries
    },
    library: async (rootId: string, signal: AbortSignal) => {
      const result = await get(url('media-library', rootId), librarySchema, signal)
      if (result.rootId !== rootId) throw new FileApiError('invalidResponse')
      return result
    },
    contentUrl: (rootId: string, path: string): string => url('content', rootId, path).href,
  }
}

export type FileApi = ReturnType<typeof createFileApi>
