/** Authenticated /api/file-manager/* routes over the shared Connection channel. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { lstat, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { assertNoSymlinkPrefix, resolveWithin } from './paths.ts'
import { StewardError } from './types.ts'
import type { FileManagerService } from './service.ts'

const PREFIX = '/api/file-manager'
const MAX_CONTENT_BYTES = 64 * 1024 * 1024

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.flac': 'audio/flac',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4',
}

function json(value: unknown, status = 200): Response {
  return Response.json(value as never, { status, headers: { 'cache-control': 'no-store' } })
}

function failure(error: unknown): Response {
  if (error instanceof StewardError) {
    return json({ error: error.code, message: error.message }, error.status)
  }
  return json({ error: 'INTERNAL', message: error instanceof Error ? error.message : String(error) }, 500)
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.method === 'GET' || request.method === 'HEAD') return {}
  try {
    const parsed = await request.json() as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new StewardError('INVALID_BODY', 'request body must be a JSON object', 400)
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof StewardError) throw error
    throw new StewardError('INVALID_BODY', 'request body is not valid JSON', 400)
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new StewardError('INVALID_INPUT', `${name} is required`, 400)
  return value
}

/** Register every file-manager route. The Connection service authenticates first. */
export function registerFileManagerApi(ctx: Context, service: FileManagerService): void {
  const route = (
    path: string,
    methods: Array<'GET' | 'HEAD' | 'POST'>,
    fetch: (request: Request) => Promise<Response>,
    label: string,
  ): void => {
    ctx.effect(() => ctx.connection.fetch.register({
      path: `${PREFIX}${path}`,
      methods,
      requestBody: 'buffered',
      fetch,
    }), `file-manager: ${label}`)
  }

  route('/roots', ['GET'], async () => json({
    roots: service.rootsInfo(),
    config: { maxScanFiles: service.maxScanFiles, planTtlHours: service.planTtlHours },
  }), 'roots')

  route('/list', ['GET'], async (request) => {
    try {
      const url = new URL(request.url)
      const rootId = requiredString(url.searchParams.get('rootId'), 'rootId')
      return json(await service.list(rootId, url.searchParams.get('path') ?? '.'))
    } catch (error) { return failure(error) }
  }, 'list')

  route('/stat', ['GET'], async (request) => {
    try {
      const url = new URL(request.url)
      return json(await service.stat(requiredString(url.searchParams.get('rootId'), 'rootId'), url.searchParams.get('path') ?? '.'))
    } catch (error) { return failure(error) }
  }, 'stat')

  route('/content', ['GET', 'HEAD'], async (request) => {
    try {
      const url = new URL(request.url)
      const rootId = requiredString(url.searchParams.get('rootId'), 'rootId')
      const path = url.searchParams.get('path') ?? ''
      const root = service.rootsInfo().find(item => item.id === rootId)
      if (root === undefined) throw new StewardError('ROOT_NOT_FOUND', 'unknown root', 404)
      await assertNoSymlinkPrefix(root.path, path, false)
      const absolute = resolveWithin(root.path, path)
      const info = await lstat(absolute)
      if (!info.isFile()) throw new StewardError('NOT_FILE', 'not a regular file', 400)
      if (info.size > MAX_CONTENT_BYTES) throw new StewardError('FILE_TOO_LARGE', 'file exceeds the preview limit', 413)
      const extension = extname(absolute).toLowerCase()
      const headers: Record<string, string> = {
        'cache-control': 'private, no-store',
        'content-type': MIME[extension] ?? 'application/octet-stream',
        'content-length': String(info.size),
        'x-content-type-options': 'nosniff',
      }
      if (!['.pdf', '.mp4', '.webm', '.mp3', '.wav', '.flac', '.m4a'].includes(extension)) {
        headers['content-security-policy'] = "sandbox; default-src 'none'"
      }
      if (request.method === 'HEAD') return new Response(null, { headers })
      const bytes = await readFile(absolute)
      return new Response(bytes, { headers })
    } catch (error) { return failure(error) }
  }, 'content')

  route('/search', ['GET'], async (request) => {
    try {
      const url = new URL(request.url)
      return json(await service.search(requiredString(url.searchParams.get('rootId'), 'rootId'), {
        query: url.searchParams.get('query') ?? undefined,
        extension: url.searchParams.get('extension') ?? undefined,
        category: url.searchParams.get('category') ?? undefined,
        after: url.searchParams.get('after') ?? undefined,
        before: url.searchParams.get('before') ?? undefined,
        offset: Number(url.searchParams.get('offset') ?? '0'),
        limit: Number(url.searchParams.get('limit') ?? '20'),
      }))
    } catch (error) { return failure(error) }
  }, 'search')

  route('/index', ['GET'], async (request) => {
    try {
      const url = new URL(request.url)
      return json(await service.indexStatus(requiredString(url.searchParams.get('rootId'), 'rootId')))
    } catch (error) { return failure(error) }
  }, 'index')

  route('/recent', ['GET'], async (request) => {
    try {
      const url = new URL(request.url)
      return json(await service.recent(requiredString(url.searchParams.get('rootId'), 'rootId'), Number(url.searchParams.get('limit') ?? '30')))
    } catch (error) { return failure(error) }
  }, 'recent')

  route('/plan', ['GET'], async (request) => {
    try {
      const url = new URL(request.url)
      const rootId = requiredString(url.searchParams.get('rootId'), 'rootId')
      const planId = requiredString(url.searchParams.get('planId'), 'planId')
      return json(await service.planDetail(rootId, planId, {
        query: url.searchParams.get('query') ?? undefined,
        category: url.searchParams.get('category') ?? undefined,
        offset: Number(url.searchParams.get('offset') ?? '0'),
        limit: Number(url.searchParams.get('limit') ?? '100'),
      }))
    } catch (error) { return failure(error) }
  }, 'plan')

  route('/operations', ['GET'], async (request) => {
    try {
      const url = new URL(request.url)
      return json(await service.operations(requiredString(url.searchParams.get('rootId'), 'rootId'), Number(url.searchParams.get('limit') ?? '50')))
    } catch (error) { return failure(error) }
  }, 'operations')

  route('/snapshots', ['GET'], async (request) => {
    try {
      const url = new URL(request.url)
      return json(await service.snapshotList(requiredString(url.searchParams.get('rootId'), 'rootId')))
    } catch (error) { return failure(error) }
  }, 'snapshots')

  route('/trash', ['GET'], async (request) => {
    try {
      const url = new URL(request.url)
      return json(await service.trashList(requiredString(url.searchParams.get('rootId'), 'rootId')))
    } catch (error) { return failure(error) }
  }, 'trash')

  route('/rules', ['GET', 'POST'], async (request) => {
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url)
        return json(await service.rules(requiredString(url.searchParams.get('rootId'), 'rootId')))
      }
      const input = await body(request)
      return json(await service.saveRules(requiredString(input.rootId, 'rootId'), input.rules))
    } catch (error) { return failure(error) }
  }, 'rules')

  route('/scan', ['POST'], async (request) => {
    try {
      const input = await body(request)
      return json(await service.scan(requiredString(input.rootId, 'rootId'), typeof input.path === 'string' ? input.path : '.', typeof input.maxFiles === 'number' ? input.maxFiles : undefined))
    } catch (error) { return failure(error) }
  }, 'scan')

  route('/classify', ['POST'], async (request) => {
    try {
      const input = await body(request)
      return json(await service.classify(requiredString(input.rootId, 'rootId'), typeof input.path === 'string' ? input.path : '.'))
    } catch (error) { return failure(error) }
  }, 'classify')

  route('/organize', ['POST'], async (request) => {
    try {
      const input = await body(request)
      return json(await service.organize(requiredString(input.rootId, 'rootId'), input.planId, input.confirm))
    } catch (error) { return failure(error) }
  }, 'organize')

  route('/operation', ['GET', 'POST'], async (request) => {
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url)
        return json(await service.operationDetail(
          requiredString(url.searchParams.get('rootId'), 'rootId'),
          requiredString(url.searchParams.get('operationId'), 'operationId'),
        ))
      }
      const input = await body(request)
      return json(await service.fileOp(requiredString(input.rootId, 'rootId'), input))
    } catch (error) { return failure(error) }
  }, 'operation')

  route('/snapshot', ['GET', 'POST'], async (request) => {
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url)
        return json(await service.snapshotDetail(
          requiredString(url.searchParams.get('rootId'), 'rootId'),
          requiredString(url.searchParams.get('snapshotId'), 'snapshotId'),
        ))
      }
      const input = await body(request)
      return json(await service.snapshotCreate(requiredString(input.rootId, 'rootId'), typeof input.path === 'string' ? input.path : '.', typeof input.label === 'string' ? input.label : ''))
    } catch (error) { return failure(error) }
  }, 'snapshot')

  route('/upload', ['POST'], async (request) => {
    try {
      const url = new URL(request.url)
      const rootId = requiredString(url.searchParams.get('rootId'), 'rootId')
      const name = requiredString(url.searchParams.get('name'), 'name')
      const path = url.searchParams.get('path') ?? '.'
      const source = url.searchParams.get('source') === 'drop' ? 'drop' : 'upload'
      const length = Number(request.headers.get('content-length') ?? '0')
      if (Number.isFinite(length) && length > 512 * 1024 * 1024) {
        throw new StewardError('UPLOAD_TOO_LARGE', 'upload exceeds the 512 MB limit', 413)
      }
      const data = Buffer.from(await request.arrayBuffer())
      return json(await service.upload(rootId, path, name, data, source))
    } catch (error) { return failure(error) }
  }, 'upload')

  route('/rules/reset', ['POST'], async (request) => {
    try {
      const input = await body(request)
      return json(await service.resetRules(requiredString(input.rootId, 'rootId')))
    } catch (error) { return failure(error) }
  }, 'rules-reset')

  route('/rollback', ['POST'], async (request) => {
    try {
      const input = await body(request)
      return json(await service.rollback(requiredString(input.rootId, 'rootId'), {
        operationId: input.operationId,
        snapshotId: input.snapshotId,
        confirm: input.confirm,
      }))
    } catch (error) { return failure(error) }
  }, 'rollback')
}
