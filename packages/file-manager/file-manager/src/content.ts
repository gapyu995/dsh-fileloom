/** Root-checked streaming file responses; Hono owns HTTP byte-range handling. */
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { lstat } from 'node:fs/promises'
import { basename, dirname, extname } from 'node:path'
import { assertNoSymlinkPrefix, resolveWithin } from './paths.ts'
import type { FileManagerService } from './service.ts'
import { StewardError } from './types.ts'

const MAX_PREVIEW_BYTES = 64 * 1024 * 1024
const MIME: Readonly<Record<string, string>> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.flac': 'audio/flac',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4',
}

/**
 * Stream a regular file after applying the same root and symlink checks as mutations.
 * @param request - Authenticated content GET or HEAD request, optionally with a byte range.
 * @param service - File service owning configured roots.
 * @returns A streamed response; only nonmedia previews retain the 64 MB limit.
 */
export async function fileContent(request: Request, service: FileManagerService): Promise<Response> {
  const url = new URL(request.url)
  const rootId = url.searchParams.get('rootId')
  if (rootId === null || rootId === '') throw new StewardError('INVALID_INPUT', 'rootId is required', 400)
  const path = url.searchParams.get('path') ?? ''
  const root = service.rootsInfo().find(item => item.id === rootId)
  if (root === undefined) throw new StewardError('ROOT_NOT_FOUND', 'unknown root', 404)
  await assertNoSymlinkPrefix(root.path, path, false)
  const absolute = resolveWithin(root.path, path)
  const info = await lstat(absolute)
  if (!info.isFile()) throw new StewardError('NOT_FILE', 'not a regular file', 400)
  const type = MIME[extname(absolute).toLowerCase()] ?? 'application/octet-stream'
  const media = type.startsWith('audio/') || type.startsWith('video/')
  if (!media && info.size > MAX_PREVIEW_BYTES) throw new StewardError('FILE_TOO_LARGE', 'file exceeds the preview limit', 413)
  const app = new Hono()
  app.onError((error) => { throw error })
  app.use('*', serveStatic({ root: dirname(absolute), path: basename(absolute) }))
  const response = await app.fetch(request)
  const headers = new Headers(response.headers)
  headers.set('content-type', type)
  headers.set('cache-control', 'private, no-store')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('accept-ranges', 'bytes')
  if (!media && type !== 'application/pdf') headers.set('content-security-policy', "sandbox; default-src 'none'")
  return new Response(response.body, { status: response.status, headers })
}
