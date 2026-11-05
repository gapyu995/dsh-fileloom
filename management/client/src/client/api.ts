/** Browser-side client for /api/file-manager. */

export interface RootInfo { id: string; name: string; path: string }
export interface RootConfig { maxScanFiles: number; planTtlHours: number; readOnly?: boolean }
export interface DirEntry {
  path: string
  name: string
  stem: string
  ext: string
  size: number
  mtimeMs: number
  kind: 'file' | 'directory'
}
export interface ScanResult {
  scanId: string
  rootId: string
  path: string
  scannedAt: string
  fileCount: number
  totalBytes: number
  truncated: boolean
  byExtension: Array<{ extension: string; count: number; bytes: number }>
  byCategory: Array<{ category: string; count: number; bytes: number }>
  warnings: string[]
}
export interface IndexState {
  scanId: string
  scope: string
  scannedAt: string
  fileCount: number
  totalBytes: number
  truncated: boolean
  warnings: string[]
}
export interface IndexResponse {
  rootId: string
  root: string
  inboxPath: string
  maxScanFiles: number
  planTtlHours: number
  index: IndexState | null
}
export interface ClassifyResult {
  planId: string
  scanId: string
  path: string
  createdAt: string
  expiresAt: string
  fileCount: number
  moveCount: number
  noopCount: number
  unmatchedCount: number
  collisionCount: number
  totalBytes: number
  rulesSource: 'default' | 'user'
  samples: Array<{ source: string; target: string; category: string }>
}
export interface PlanItemDetail {
  source: string
  target: string
  category: string
  label: string
  size: number
  renamedForConflict: boolean
}
export interface PlanDetail {
  planId: string
  scanId: string
  scope: string
  status: string
  createdAt: string
  expiresAt: string
  rulesSource: 'default' | 'user'
  counts: {
    fileCount: number
    moveCount: number
    noopCount: number
    unmatchedCount: number
    collisionCount: number
    totalBytes: number
  }
  warnings: string[]
  categories: Array<{ category: string; label: string; count: number; bytes: number }>
  totalMatches: number
  offset: number
  limit: number
  hasMore: boolean
  items: PlanItemDetail[]
}
export interface OrganizeResult {
  planId: string
  operationId: string
  snapshotId: string
  status: string
  movedCount: number
  samples: Array<{ source: string; target: string }>
}
export interface OperationSummary {
  operationId: string
  planId: string
  snapshotId: string
  createdAt: string
  finishedAt?: string
  status: 'running' | 'succeeded' | 'rolled_back' | 'failed' | 'rollback_failed'
  movedCount: number
  totalCount: number
  error: string
}
export interface OperationMove { source: string; target: string; status: 'pending' | 'moved' | 'restored' | 'failed' }
export interface OperationDetail extends OperationSummary { moves: OperationMove[] }
export interface SnapshotSummary {
  snapshotId: string
  createdAt: string
  kind: 'manual' | 'operation'
  label: string
  operationId?: string
  fileCount: number
  totalBytes: number
}
export interface SnapshotDetail {
  snapshotId: string
  createdAt: string
  kind: 'manual' | 'operation'
  label: string
  operationId?: string
  fileCount: number
  totalBytes: number
  hardLinkCount: number
  copyCount: number
  files: Array<{ source: string; target?: string; size: number; mtimeMs: number }>
}
export interface TrashEntry {
  trashId: string
  originalPath: string
  deletedAt: string
  size: number
}
export interface RuleDocument {
  source: 'default' | 'user'
  userRulesPath: string
  count: number
  rules: Array<{
    id: string
    category: string
    label: string
    priority: number
    target: string
    extensions?: string[]
    namePattern?: string
    minSize?: number
    maxSize?: number
  }>
}
export interface SearchResult {
  totalMatches: number
  offset: number
  limit: number
  hasMore: boolean
  results: Array<{ path: string; name: string; size: number; modifiedAt: string; category: string; label: string }>
}
export interface RecentEntry {
  ingestId: string
  path: string
  name: string
  size: number
  ingestedAt: string
  source: 'upload' | 'drop'
  originalName: string
  sha256: string
  modifiedAt: string
  indexed: boolean
  inInbox: boolean
}
export interface RecentResponse {
  rootId: string
  inboxPath: string
  pendingCount: number
  entries: RecentEntry[]
}
export interface UploadResult {
  rootId: string
  path: string
  name: string
  size: number
  ingestedAt: string
  sha256: string
}
export interface RollbackResult {
  status: string
  restoredCount: number
  keptCount: number
  removedTargetCount: number
}

const BASE = '/api/file-manager'

/** Fetch wrapper that preserves server error codes and messages. */
export class FileManagerApi {
  private async request<T>(method: 'GET' | 'POST', path: string, query?: Record<string, string | number | undefined>, body?: unknown): Promise<T> {
    const url = new URL(`${BASE}${path}`, window.location.origin)
    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
      }
    }
    const init: RequestInit = { method, credentials: 'same-origin' }
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify(body)
    }
    const response = await fetch(url, init)
    const text = await response.text()
    let parsed: unknown = undefined
    if (text !== '') {
      try { parsed = JSON.parse(text) } catch { parsed = text }
    }
    if (!response.ok) {
      const message = parsed !== null && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : typeof parsed === 'string' && parsed !== '' ? parsed : `${response.status} ${response.statusText}`
      throw new Error(message)
    }
    return parsed as T
  }

  roots(): Promise<{ roots: RootInfo[]; config: RootConfig }> { return this.request('GET', '/roots') }
  list(rootId: string, path: string): Promise<{ rootId: string; path: string; entries: DirEntry[] }> {
    return this.request('GET', '/list', { rootId, path })
  }
  scan(rootId: string, path: string): Promise<ScanResult> { return this.request('POST', '/scan', undefined, { rootId, path }) }
  classify(rootId: string, path: string): Promise<ClassifyResult> { return this.request('POST', '/classify', undefined, { rootId, path }) }
  plan(rootId: string, planId: string, options: {
    query?: string
    category?: string
    offset?: number
    limit?: number
  } = {}): Promise<PlanDetail> {
    return this.request('GET', '/plan', { rootId, planId, query: options.query, category: options.category, offset: options.offset, limit: options.limit })
  }
  organize(rootId: string, planId: string, confirm: true): Promise<OrganizeResult> {
    return this.request('POST', '/organize', undefined, { rootId, planId, confirm })
  }
  indexStatus(rootId: string): Promise<IndexResponse> { return this.request('GET', '/index', { rootId }) }
  recent(rootId: string, limit = 30): Promise<RecentResponse> { return this.request('GET', '/recent', { rootId, limit }) }
  operations(rootId: string, limit = 50): Promise<{ rootId: string; operations: OperationSummary[] }> {
    return this.request('GET', '/operations', { rootId, limit })
  }
  operation(rootId: string, operationId: string): Promise<OperationDetail> {
    return this.request('GET', '/operation', { rootId, operationId })
  }
  search(rootId: string, query: string, filters: {
    category?: string
    extension?: string
    offset?: number
    limit?: number
  } = {}): Promise<SearchResult> {
    return this.request('GET', '/search', {
      rootId, query, category: filters.category, extension: filters.extension,
      offset: filters.offset, limit: filters.limit ?? 100,
    })
  }
  rules(rootId: string): Promise<RuleDocument> { return this.request('GET', '/rules', { rootId }) }
  saveRules(rootId: string, rules: unknown): Promise<RuleDocument> {
    return this.request('POST', '/rules', undefined, { rootId, rules })
  }
  resetRules(rootId: string): Promise<RuleDocument> {
    return this.request('POST', '/rules/reset', undefined, { rootId })
  }
  snapshots(rootId: string): Promise<{ rootId: string; snapshots: SnapshotSummary[] }> {
    return this.request('GET', '/snapshots', { rootId })
  }
  snapshotDetail(rootId: string, snapshotId: string): Promise<SnapshotDetail> {
    return this.request('GET', '/snapshot', { rootId, snapshotId })
  }
  snapshotCreate(rootId: string, path: string, label: string): Promise<{ snapshotId: string; fileCount: number; totalBytes: number }> {
    return this.request('POST', '/snapshot', undefined, { rootId, path, label })
  }
  rollback(rootId: string, input: { operationId?: string; snapshotId?: string; confirm: true }): Promise<RollbackResult> {
    return this.request('POST', '/rollback', undefined, { rootId, ...input })
  }
  trash(rootId: string): Promise<{ rootId: string; entries: TrashEntry[] }> {
    return this.request('GET', '/trash', { rootId })
  }
  fileOp(rootId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('POST', '/operation', undefined, { rootId, ...input })
  }
  async upload(rootId: string, path: string, file: File, source: 'upload' | 'drop'): Promise<UploadResult> {
    const url = new URL(`${BASE}/upload`, window.location.origin)
    url.searchParams.set('rootId', rootId)
    url.searchParams.set('path', path)
    url.searchParams.set('name', file.name)
    url.searchParams.set('source', source)
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin', body: file })
    const text = await response.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = text }
    if (!response.ok) {
      const message = parsed !== null && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : `上传失败（${response.status}）`
      throw new Error(message)
    }
    return parsed as UploadResult
  }
  contentUrl(rootId: string, path: string): string {
    const url = new URL(`${BASE}/content`, window.location.origin)
    url.searchParams.set('rootId', rootId)
    url.searchParams.set('path', path)
    return url.toString()
  }
}
