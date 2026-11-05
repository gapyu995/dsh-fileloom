/** File-domain service shared by the HTTP API and the model-facing tools. */

import { constants as fsConstants } from 'node:fs'
import { copyFile, link, lstat, mkdir, readdir, realpath, rename, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { StateStore } from './state.ts'
import {
  assertNoSymlinkPrefix, assertSafeId, createId, normalizeRel, relativePosix,
  resolveWithin, sha256File, walkFiles, isWithin,
} from './paths.ts'
import { DEFAULT_RULES, compileRules, describeRules, matchRule, renderTarget } from './rules.ts'
import {
  StewardError, type CompiledRule, type DirEntry, type FileEntry, type IngestEntry,
  type OperationRecord, type OperationSummary, type Plan, type PlanItem, type RootInfo,
  type ScanIndex, type SnapshotFile, type SnapshotManifest, type SnapshotSummary, type TrashManifest,
} from './types.ts'

export interface FileManagerOptions {
  readonly roots: readonly string[]
  readonly maxScanFiles?: number | undefined
  readonly planTtlHours?: number | undefined
  readonly stateDirectory?: string | undefined
  readonly readOnly?: boolean | undefined
  readonly mediaCacheMaxAgeSeconds?: number | undefined
}

export interface ScanSummary {
  readonly scanId: string
  readonly rootId: string
  readonly root: string
  readonly path: string
  readonly scannedAt: string
  readonly fileCount: number
  readonly totalBytes: number
  readonly truncated: boolean
  readonly byExtension: Array<{ extension: string; count: number; bytes: number }>
  readonly byCategory: Array<{ category: string; count: number; bytes: number }>
  readonly samples: Array<{ path: string; size: number; modifiedAt: string }>
  readonly warnings: string[]
}

interface MediaLibrary {
  readonly rootId: string
  readonly entries: DirEntry[]
  readonly truncated: boolean
  readonly incomplete: boolean
  readonly scannedAt: string
}

const MAX_SCAN = 100_000
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024
const mediaIndexSchema = z.object({
  version: z.literal(1), root: z.string(), maxScanFiles: z.number(),
  library: z.object({ rootId: z.string(), scannedAt: z.iso.datetime(), truncated: z.boolean(), incomplete: z.boolean(), entries: z.array(z.object({
    path: z.string(), name: z.string(), stem: z.string(), ext: z.string(), kind: z.literal('file'), size: z.number().finite().nonnegative(), mtimeMs: z.number().finite(),
  })) }),
})
/** Default landing folder for uploads that are not aimed at a specific folder. */
export const INBOX_PATH = '收件箱'

/** One service instance owns every configured root and its state directories. */
export class FileManagerService {
  readonly roots: readonly RootInfo[]
  readonly maxScanFiles: number
  readonly planTtlHours: number
  private readonly stores = new Map<string, StateStore>()
  private readonly mediaLibraries = new Map<string, MediaLibrary>()
  private mediaGeneration = 0
  private readonly diskChecked = new Set<string>()
  private readonly mediaWrites = new Set<Promise<void>>()
  private readOnly = false
  private mediaCacheMaxAgeSeconds = 300

  private constructor(roots: readonly RootInfo[], maxScanFiles: number, planTtlHours: number) {
    this.roots = roots
    this.maxScanFiles = maxScanFiles
    this.planTtlHours = planTtlHours
    for (const root of roots) this.stores.set(root.id, new StateStore(root.path))
  }

  static async create(options: FileManagerOptions): Promise<FileManagerService> {
    const paths = [...new Set((options.roots ?? []).map(path => path.trim()).filter(path => path !== ''))]
    if (paths.length === 0) throw new StewardError('ROOTS_EMPTY', 'no data roots configured', 500)
    const maxScanFiles = Math.trunc(options.maxScanFiles ?? 20_000)
    if (!Number.isInteger(maxScanFiles) || maxScanFiles < 100 || maxScanFiles > MAX_SCAN) {
      throw new StewardError('CONFIG_INVALID', `maxScanFiles must be an integer in 100..${MAX_SCAN}`, 500)
    }
    const planTtlHours = Math.trunc(options.planTtlHours ?? 24)
    if (!Number.isInteger(planTtlHours) || planTtlHours < 1 || planTtlHours > 24 * 30) {
      throw new StewardError('CONFIG_INVALID', 'planTtlHours must be an integer in 1..720', 500)
    }
    const roots: RootInfo[] = []
    for (const [index, input] of paths.entries()) {
      const absolute = await stat(input).then((info) => {
        if (!info.isDirectory()) throw new StewardError('ROOT_INVALID', `not a directory: ${input}`, 500)
        return input
      }).catch((error) => {
        if (error instanceof StewardError) throw error
        throw new StewardError('ROOT_NOT_FOUND', `data root does not exist: ${input}`, 500)
      })
      const resolved = await realpath(absolute)
      if (parse(resolved).root === resolved) throw new StewardError('ROOT_INVALID', `refusing to manage a filesystem root: ${resolved}`, 500)
      roots.push({ id: `root_${index + 1}`, name: basename(resolved) || resolved, path: resolved })
    }
    const service = new FileManagerService(roots, maxScanFiles, planTtlHours)
    service.readOnly = options.readOnly ?? false
    service.mediaCacheMaxAgeSeconds = options.mediaCacheMaxAgeSeconds ?? 300
    if (!Number.isInteger(service.mediaCacheMaxAgeSeconds) || service.mediaCacheMaxAgeSeconds < 0 || service.mediaCacheMaxAgeSeconds > 86400) {
      throw new StewardError('CONFIG_INVALID', 'mediaCacheMaxAgeSeconds must be an integer in 0..86400', 500)
    }
    if (service.readOnly && !options.stateDirectory) throw new StewardError('CONFIG_INVALID', 'readOnly requires a local stateDirectory', 500)
    if (options.stateDirectory !== undefined) {
      if (!service.readOnly) throw new StewardError('CONFIG_INVALID', 'stateDirectory requires readOnly; writable roots keep recovery state beside their files', 500)
      if (!isAbsolute(options.stateDirectory)) throw new StewardError('CONFIG_INVALID', 'stateDirectory must be absolute', 500)
      let ancestor = resolve(options.stateDirectory)
      const missing: string[] = []
      let directory: string
      // Resolve the existing prefix before creating anything, including through junctions.
      while (true) {
        try { directory = join(await realpath(ancestor), ...missing); break }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error
          missing.unshift(basename(ancestor))
          ancestor = dirname(ancestor)
        }
      }
      if (roots.some(root => isWithin(root.path, directory))) throw new StewardError('CONFIG_INVALID', 'stateDirectory must be outside all managed roots', 500)
      await mkdir(directory, { recursive: true })
      for (const root of roots) service.stores.set(root.id, new StateStore(root.path, join(directory, createHash('sha256').update(root.path).digest('hex'))))
    }
    await Promise.all([...service.stores.values()].map(store => store.ensure()))
    return service
  }

  private target(rootId: string): { info: RootInfo; store: StateStore } {
    const info = this.roots.find(root => root.id === rootId)
    if (info === undefined) throw new StewardError('ROOT_NOT_FOUND', `unknown root: ${rootId}`, 404)
    const store = this.stores.get(rootId)
    if (store === undefined) throw new StewardError('ROOT_NOT_FOUND', `unknown root: ${rootId}`, 404)
    return { info, store }
  }

  rootsInfo(): readonly RootInfo[] { return this.roots }
  get isReadOnly(): boolean { return this.readOnly }

  private assertWritable(): void {
    if (this.readOnly) throw new StewardError('READ_ONLY', 'this library is configured read-only', 403)
  }

  invalidateMediaLibraries(): void {
    this.mediaGeneration += 1
    this.mediaLibraries.clear()
    for (const root of this.roots) this.diskChecked.add(root.id)
  }

  async withMediaInvalidation<T>(run: () => Promise<T>): Promise<T> {
    this.invalidateMediaLibraries()
    await this.clearMediaIndexes()
    try { return await run() }
    finally { this.invalidateMediaLibraries(); await this.clearMediaIndexes() }
  }

  private async clearMediaIndexes(): Promise<void> {
    await Promise.all(this.mediaWrites)
    await Promise.all([...this.stores.values()].map(store => rm(join(store.dir, 'media-library.json'), { force: true })))
  }

  async mediaLibrary(rootId: string, signal: AbortSignal, refresh = false): Promise<MediaLibrary> {
    const { info, store } = this.target(rootId)
    signal.throwIfAborted()
    const cached = this.mediaLibraries.get(rootId)
    if (!refresh && cached !== undefined && Date.now() - Date.parse(cached.scannedAt) < this.mediaCacheMaxAgeSeconds * 1000) return cached
    const indexFile = join(store.dir, 'media-library.json')
    const generation = ++this.mediaGeneration
    if (!refresh && !this.diskChecked.has(rootId)) {
      this.diskChecked.add(rootId)
      let saved: unknown
      try { saved = await store.readJson(indexFile) }
      catch (error) { if (!(error instanceof StewardError && error.code === 'STATE_CORRUPT')) throw error }
      const parsed = mediaIndexSchema.safeParse(saved)
      if (parsed.success && parsed.data.root === info.path && parsed.data.maxScanFiles === this.maxScanFiles) {
        const age = Date.now() - Date.parse(parsed.data.library.scannedAt)
        if (age >= 0 && age < this.mediaCacheMaxAgeSeconds * 1000 && generation === this.mediaGeneration) {
          signal.throwIfAborted()
          const result = { ...parsed.data.library, rootId }
          this.mediaLibraries.set(rootId, result)
          return result
        }
      }
    }
    this.diskChecked.add(rootId)
    const walked = await walkFiles(info.path, '.', { maxFiles: this.maxScanFiles, excludeAbs: [store.dir, join(info.path, '.data-steward')], signal })
    signal.throwIfAborted()
    const result: MediaLibrary = { rootId, entries: walked.entries.map(entry => ({ ...entry, kind: 'file' })), truncated: walked.truncated, incomplete: walked.warnings.length > 0, scannedAt: new Date().toISOString() }
    if (generation === this.mediaGeneration) {
      this.mediaLibraries.set(rootId, result)
      const write = store.writeJson(indexFile, { version: 1, root: info.path, maxScanFiles: this.maxScanFiles, library: result })
      this.mediaWrites.add(write)
      try { await write } finally { this.mediaWrites.delete(write) }
    }
    return result
  }

  async list(rootId: string, path = '.'): Promise<{ rootId: string; path: string; entries: DirEntry[] }> {
    const { info } = this.target(rootId)
    const scope = normalizeRel(path)
    const absolute = resolveWithin(info.path, scope)
    await assertNoSymlinkPrefix(info.path, scope, false)
    const infoStat = await stat(absolute)
    if (!infoStat.isDirectory()) throw new StewardError('NOT_DIRECTORY', 'path is not a directory', 400)
    const dirents = await readdir(absolute, { withFileTypes: true })
    const entries: DirEntry[] = []
    for (const dirent of dirents) {
      if (scope === '.' && dirent.name === '.data-steward') continue
      const childAbs = join(absolute, dirent.name)
      if (dirent.isSymbolicLink()) continue
      let childStat
      try {
        childStat = await lstat(childAbs)
      } catch {
        continue
      }
      const rel = relativePosix(info.path, childAbs)
      const dot = dirent.name.lastIndexOf('.')
      entries.push({
        path: rel,
        name: dirent.name,
        stem: dot > 0 ? dirent.name.slice(0, dot) : dirent.name,
        ext: dot > 0 ? dirent.name.slice(dot).toLowerCase() : '',
        size: childStat.size,
        mtimeMs: childStat.mtimeMs,
        kind: childStat.isDirectory() ? 'directory' : 'file',
      })
    }
    entries.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1)
    return { rootId, path: scope, entries }
  }

  async stat(rootId: string, path: string): Promise<Record<string, unknown>> {
    const { info } = this.target(rootId)
    const scope = normalizeRel(path)
    const absolute = resolveWithin(info.path, scope)
    await assertNoSymlinkPrefix(info.path, scope, false)
    const value = await lstat(absolute)
    return {
      rootId,
      path: scope,
      name: basename(absolute),
      size: value.size,
      modifiedAt: value.mtime.toISOString(),
      kind: value.isDirectory() ? 'directory' : value.isFile() ? 'file' : 'other',
    }
  }

  async scan(rootId: string, path = '.', requestedMax?: number): Promise<ScanSummary> {
    const { info, store } = this.target(rootId)
    const scope = normalizeRel(path)
    const maxFiles = Math.min(
      this.maxScanFiles,
      requestedMax !== undefined && Number.isInteger(requestedMax) && requestedMax > 0 ? requestedMax : this.maxScanFiles,
    )
    const walked = await walkFiles(info.path, scope, { maxFiles, excludeAbs: [store.dir, join(info.path, '.data-steward')] })
    const scanId = createId('scan')
    const index: ScanIndex = {
      version: 1,
      scanId,
      rootId,
      root: info.path,
      scope,
      scannedAt: new Date().toISOString(),
      maxFiles,
      truncated: walked.truncated,
      warnings: walked.warnings,
      entries: walked.entries,
    }
    await store.saveIndex(index)
    const rules = await this.loadRules(rootId)
    const byExtension = new Map<string, { count: number; bytes: number }>()
    const byCategory = new Map<string, { count: number; bytes: number }>()
    for (const entry of walked.entries) {
      const ext = entry.ext || '(none)'
      const extension = byExtension.get(ext) ?? { count: 0, bytes: 0 }
      extension.count += 1
      extension.bytes += entry.size
      byExtension.set(ext, extension)
      const rule = matchRule(entry, rules.rules)
      const category = rule?.category ?? 'unmatched'
      const bucket = byCategory.get(category) ?? { count: 0, bytes: 0 }
      bucket.count += 1
      bucket.bytes += entry.size
      byCategory.set(category, bucket)
    }
    const totalBytes = walked.entries.reduce((sum, entry) => sum + entry.size, 0)
    return {
      scanId,
      rootId,
      root: info.path,
      path: scope,
      scannedAt: index.scannedAt,
      fileCount: walked.entries.length,
      totalBytes,
      truncated: walked.truncated,
      byExtension: [...byExtension.entries()].map(([extension, value]) => ({ extension, ...value }))
        .sort((a, b) => b.count - a.count).slice(0, 12),
      byCategory: [...byCategory.entries()].map(([category, value]) => ({ category, ...value })).sort((a, b) => b.count - a.count),
      samples: walked.entries.slice(0, 20).map(entry => ({
        path: entry.path, size: entry.size, modifiedAt: new Date(entry.mtimeMs).toISOString(),
      })),
      warnings: walked.warnings,
    }
  }

  async classify(rootId: string, path = '.'): Promise<Record<string, unknown>> {
    const { info, store } = this.target(rootId)
    const scope = normalizeRel(path)
    const index = await store.loadIndex()
    if (index === undefined) throw new StewardError('INDEX_NOT_FOUND', 'run data_steward_scan first', 409)
    const ruleSet = await this.loadRules(rootId)
    const entries = index.entries.filter(entry => isUnder(entry.path, scope))
    const used = new Set<string>()
    const items: PlanItem[] = []
    let noopCount = 0
    let unmatchedCount = 0
    let collisionCount = 0
    for (const entry of entries) {
      const rule = matchRule(entry, ruleSet.rules)
      if (rule === undefined) { unmatchedCount += 1; continue }
      let target = renderTarget(rule, entry)
      if (target === entry.path) { noopCount += 1; continue }
      const unique = await this.uniqueTarget(info.path, target, used)
      const renamedForConflict = unique !== target
      if (renamedForConflict) collisionCount += 1
      target = unique
      used.add(target)
      items.push({
        source: entry.path, target, ruleId: rule.id, category: rule.category, label: rule.label,
        size: entry.size, mtimeMs: entry.mtimeMs, renamedForConflict,
      })
    }
    const planId = createId('plan')
    const now = new Date()
    const plan: Plan = {
      version: 1, planId, rootId, root: info.path, scanId: index.scanId, scope,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.planTtlHours * 3_600_000).toISOString(),
      status: 'ready', rulesSource: ruleSet.source, items,
      counts: {
        fileCount: entries.length,
        moveCount: items.length,
        noopCount,
        unmatchedCount,
        collisionCount,
        totalBytes: items.reduce((sum, item) => sum + item.size, 0),
      },
      warnings: index.warnings,
    }
    await store.savePlan(plan)
    return {
      planId, scanId: index.scanId, rootId, root: info.path, path: scope,
      createdAt: plan.createdAt, expiresAt: plan.expiresAt,
      fileCount: plan.counts.fileCount, moveCount: plan.counts.moveCount,
      noopCount, unmatchedCount, collisionCount, totalBytes: plan.counts.totalBytes,
      rulesSource: ruleSet.source,
      samples: items.slice(0, 10).map(item => ({ source: item.source, target: item.target, category: item.category })),
    }
  }

  async organize(rootId: string, planIdInput: unknown, confirm: unknown): Promise<Record<string, unknown>> {
    this.assertWritable()
    if (confirm !== true) throw new StewardError('CONFIRM_REQUIRED', 'organize requires confirm: true', 400)
    const planId = assertSafeId(planIdInput, 'plan')
    const { info, store } = this.target(rootId)
    const plan = await store.loadPlan(planId)
    if (plan.rootId !== rootId) throw new StewardError('PLAN_ROOT_MISMATCH', 'plan belongs to another root', 409)
    if (plan.status !== 'ready') throw new StewardError('PLAN_NOT_READY', `plan is ${plan.status}`, 409)
    if (Date.now() > Date.parse(plan.expiresAt)) throw new StewardError('PLAN_EXPIRED', 'plan expired; classify again', 409)
    const index = await store.loadIndex()
    if (index?.scanId !== plan.scanId) throw new StewardError('PLAN_STALE', 'index changed; scan and classify again', 409)
    if (plan.items.length === 0) {
      await store.savePlan({ ...plan, status: 'executed' })
      return { planId, status: 'noop', movedCount: 0, operationId: '', snapshotId: '' }
    }
    await this.preflightPlan(info.path, plan)
    const operationId = createId('operation')
    const snapshot = await this.createSnapshotFromEntries(info, store, plan.items.map(item => ({
      source: item.source, target: item.target, size: item.size, mtimeMs: item.mtimeMs,
    })), 'operation', `before organize ${planId}`, operationId)
    const operation: OperationRecord = {
      version: 1, operationId, rootId, planId, snapshotId: snapshot.snapshotId,
      createdAt: new Date().toISOString(), status: 'running',
      moves: plan.items.map(item => ({ source: item.source, target: item.target, status: 'pending' })),
      summary: { movedCount: 0, conflictResolvedCount: 0, error: '' },
    }
    await store.saveOperation(operation)
    await store.savePlan({ ...plan, status: 'running' })
    await store.audit({ event: 'organize.started', operationId, snapshotId: snapshot.snapshotId, planId })
    const moves = [...operation.moves]
    let movedCount = 0
    try {
      for (const [index, item] of plan.items.entries()) {
        await this.ensureParent(info.path, item.target)
        await this.moveNoReplace(resolveWithin(info.path, item.source), resolveWithin(info.path, item.target))
        moves[index] = { source: item.source, target: item.target, status: 'moved' }
        movedCount += 1
      }
    } catch (error) {
      const failed: OperationRecord = {
        ...operation, moves, finishedAt: new Date().toISOString(), status: 'failed',
        summary: { movedCount, conflictResolvedCount: 0, error: (error as Error).message },
      }
      await store.saveOperation(failed)
      const rollback = await this.autoRollback(info, store, failed, snapshot)
      await store.savePlan({ ...plan, status: 'failed' })
      await store.audit({ event: 'organize.failed', operationId, snapshotId: snapshot.snapshotId, rollback, error: (error as Error).message })
      throw new StewardError('ORGANIZE_FAILED', `organize failed: ${(error as Error).message}; operationId=${operationId}; snapshotId=${snapshot.snapshotId}; autoRollback=${rollback}`, 500)
    }
    const movedPaths = new Map(plan.items.map(item => [item.source, item.target]))
    try {
      await this.moveIndexEntries(store, movedPaths)
      await store.moveIngestPaths(movedPaths)
    } catch (error) {
      await store.audit({ event: 'index.update_failed', operationId, error: (error as Error).message })
    }
    const done: OperationRecord = {
      ...operation, moves, finishedAt: new Date().toISOString(), status: 'succeeded',
      summary: { movedCount, conflictResolvedCount: 0, error: '' },
    }
    await store.saveOperation(done)
    await store.savePlan({ ...plan, status: 'executed' })
    await store.audit({ event: 'organize.succeeded', operationId, snapshotId: snapshot.snapshotId, planId, movedCount })
    return {
      planId, operationId, snapshotId: snapshot.snapshotId, status: 'succeeded',
      movedCount, rootId, root: info.path,
      samples: plan.items.slice(0, 10).map(item => ({ source: item.source, target: item.target })),
    }
  }

  async snapshotCreate(rootId: string, path = '.', label = ''): Promise<Record<string, unknown>> {
    const { info, store } = this.target(rootId)
    const scope = normalizeRel(path)
    const walked = await walkFiles(info.path, scope, { maxFiles: this.maxScanFiles, excludeAbs: [store.dir, join(info.path, '.data-steward')] })
    if (walked.truncated) throw new StewardError('SNAPSHOT_TOO_LARGE', 'snapshot scope exceeds the configured file limit', 409)
    const manifest = await this.createSnapshotFromEntries(info, store, walked.entries.map(entry => ({
      source: entry.path, size: entry.size, mtimeMs: entry.mtimeMs,
    })), 'manual', label || `manual snapshot ${scope}`)
    await store.audit({ event: 'snapshot.created', snapshotId: manifest.snapshotId, fileCount: manifest.summary.fileCount, kind: 'manual' })
    return {
      snapshotId: manifest.snapshotId, createdAt: manifest.createdAt, label: manifest.label,
      rootId, path: scope, fileCount: manifest.summary.fileCount, totalBytes: manifest.summary.totalBytes,
      hardLinkCount: manifest.summary.hardLinkCount, copyCount: manifest.summary.copyCount,
    }
  }

  async snapshotList(rootId: string): Promise<{ rootId: string; snapshots: SnapshotSummary[] }> {
    const { store } = this.target(rootId)
    return { rootId, snapshots: await store.listSnapshots() }
  }

  /** Current index coverage and runtime limits; the UI explains freshness from this. */
  async indexStatus(rootId: string): Promise<Record<string, unknown>> {
    const { info, store } = this.target(rootId)
    const index = await store.loadIndex()
    return {
      rootId,
      root: info.path,
      inboxPath: INBOX_PATH,
      maxScanFiles: this.maxScanFiles,
      planTtlHours: this.planTtlHours,
      index: index === undefined ? null : {
        scanId: index.scanId,
        scope: index.scope,
        scannedAt: index.scannedAt,
        fileCount: index.entries.length,
        totalBytes: index.entries.reduce((sum, entry) => sum + entry.size, 0),
        truncated: index.truncated,
        warnings: index.warnings,
      },
    }
  }

  async operations(rootId: string, limitInput = 50): Promise<{ rootId: string; operations: OperationSummary[] }> {
    const { store } = this.target(rootId)
    const limit = Math.min(200, Math.max(1, Math.trunc(limitInput)))
    const all = await store.listOperations()
    return { rootId, operations: all.slice(0, limit) }
  }

  async operationDetail(rootId: string, operationIdInput: unknown): Promise<OperationRecord> {
    const operationId = assertSafeId(operationIdInput, 'operation')
    const { store } = this.target(rootId)
    const operation = await store.loadOperation(operationId)
    if (operation.rootId !== rootId) throw new StewardError('OPERATION_ROOT_MISMATCH', 'operation belongs to another root', 409)
    return operation
  }

  /** Paged plan view for the review screen; classify itself only returns samples. */
  async planDetail(rootId: string, planIdInput: unknown, options: {
    query?: string | undefined
    category?: string | undefined
    offset?: number | undefined
    limit?: number | undefined
  } = {}): Promise<Record<string, unknown>> {
    const planId = assertSafeId(planIdInput, 'plan')
    const { store } = this.target(rootId)
    const plan = await store.loadPlan(planId)
    if (plan.rootId !== rootId) throw new StewardError('PLAN_ROOT_MISMATCH', 'plan belongs to another root', 409)
    const query = options.query?.trim().toLowerCase() ?? ''
    const category = options.category?.trim() ?? ''
    const matches = plan.items.filter((item) => {
      if (query !== '' && !item.source.toLowerCase().includes(query) && !item.target.toLowerCase().includes(query)) return false
      if (category !== '' && item.category !== category) return false
      return true
    })
    const offset = Math.max(0, Math.trunc(options.offset ?? 0))
    const limit = Math.min(500, Math.max(1, Math.trunc(options.limit ?? 100)))
    const categories = new Map<string, { category: string; label: string; count: number; bytes: number }>()
    for (const item of plan.items) {
      const row = categories.get(item.category) ?? { category: item.category, label: item.label, count: 0, bytes: 0 }
      row.count += 1
      row.bytes += item.size
      categories.set(item.category, row)
    }
    return {
      planId, scanId: plan.scanId, scope: plan.scope, status: plan.status,
      createdAt: plan.createdAt, expiresAt: plan.expiresAt, rulesSource: plan.rulesSource,
      counts: plan.counts, warnings: plan.warnings,
      categories: [...categories.values()].sort((a, b) => b.count - a.count),
      totalMatches: matches.length, offset, limit,
      hasMore: offset + limit < matches.length,
      items: matches.slice(offset, offset + limit).map(item => ({
        source: item.source, target: item.target, category: item.category, label: item.label,
        size: item.size, renamedForConflict: item.renamedForConflict,
      })),
    }
  }

  async snapshotDetail(rootId: string, snapshotIdInput: unknown): Promise<Record<string, unknown>> {
    const snapshotId = assertSafeId(snapshotIdInput, 'snap')
    const { store } = this.target(rootId)
    const manifest = await store.loadSnapshot(snapshotId)
    if (manifest.rootId !== rootId) throw new StewardError('SNAPSHOT_ROOT_MISMATCH', 'snapshot belongs to another root', 409)
    return {
      snapshotId: manifest.snapshotId,
      createdAt: manifest.createdAt,
      kind: manifest.kind,
      label: manifest.label,
      ...(manifest.operationId === undefined ? {} : { operationId: manifest.operationId }),
      fileCount: manifest.summary.fileCount,
      totalBytes: manifest.summary.totalBytes,
      hardLinkCount: manifest.summary.hardLinkCount,
      copyCount: manifest.summary.copyCount,
      files: manifest.files.slice(0, 500).map(file => ({
        source: file.source,
        ...(file.target === undefined ? {} : { target: file.target }),
        size: file.size,
        mtimeMs: file.mtimeMs,
      })),
    }
  }

  /** Recently ingested files that still exist; powers "recent" and the home screen. */
  async recent(rootId: string, limitInput = 30): Promise<Record<string, unknown>> {
    const { info, store } = this.target(rootId)
    const limit = Math.min(200, Math.max(1, Math.trunc(limitInput)))
    const entries = await store.loadIngest()
    const index = await store.loadIndex()
    const indexed = new Set(index?.entries.map(entry => entry.path) ?? [])
    const rows: Array<IngestEntry & { modifiedAt: string; indexed: boolean; inInbox: boolean }> = []
    for (const entry of entries) {
      const abs = resolveWithin(info.path, entry.path)
      const current = await lstat(abs).catch(() => undefined)
      if (current === undefined || !current.isFile()) continue
      rows.push({
        ...entry,
        size: current.size,
        modifiedAt: new Date(current.mtimeMs).toISOString(),
        indexed: indexed.has(entry.path),
        inInbox: entry.path.startsWith(`${INBOX_PATH}/`),
      })
      if (rows.length >= limit) break
    }
    return {
      rootId,
      inboxPath: INBOX_PATH,
      pendingCount: rows.filter(row => row.inInbox).length,
      entries: rows,
    }
  }

  /** Store an upload without overwriting; updates the index so search works immediately. */
  async upload(rootId: string, pathInput: unknown, nameInput: unknown, data: Buffer, source: 'upload' | 'drop' = 'upload'): Promise<Record<string, unknown>> {
    this.assertWritable()
    const { info, store } = this.target(rootId)
    const dir = normalizeRel(typeof pathInput === 'string' && pathInput !== '' ? pathInput : '.', 'path')
    if (data.length > MAX_UPLOAD_BYTES) throw new StewardError('UPLOAD_TOO_LARGE', 'upload exceeds the 512 MB limit', 413)
    const originalName = uploadName(nameInput)
    const proposed = dir === '.' ? originalName : `${dir}/${originalName}`
    await this.ensureParent(info.path, proposed)
    const rel = await this.uniqueTarget(info.path, proposed, new Set())
    await assertNoSymlinkPrefix(info.path, rel, true)
    const abs = resolveWithin(info.path, rel)
    const hash = createHash('sha256').update(data).digest('hex')
    await writeFile(abs, data, { flag: 'wx' })
    const stored = await lstat(abs)
    const ingestedAt = new Date().toISOString()
    const ingest: IngestEntry = {
      ingestId: createId('ingest'), rootId, path: rel, name: basename(rel), size: stored.size,
      ingestedAt, source, originalName, sha256: hash,
    }
    await store.addIngest(ingest)
    await this.upsertIndex(store, info.path, rel)
    await store.audit({ event: 'file.upload', rootId, path: rel, size: stored.size, source })
    return { rootId, path: rel, name: basename(rel), size: stored.size, ingestedAt, sha256: hash }
  }

  /** Remove custom rules and fall back to the built-in rule set. */
  async resetRules(rootId: string): Promise<Record<string, unknown>> {
    const { store } = this.target(rootId)
    await store.removeRules()
    const rules = compileRules({ version: 1, rules: DEFAULT_RULES })
    await store.audit({ event: 'rules.reset', rootId })
    return describeRules(rules, 'default', store.rulesFile)
  }

  async rollback(rootId: string, input: {
    operationId?: unknown
    snapshotId?: unknown
    confirm?: unknown
  }): Promise<Record<string, unknown>> {
    this.assertWritable()
    if (input.confirm !== true) throw new StewardError('CONFIRM_REQUIRED', 'rollback requires confirm: true', 400)
    const { info, store } = this.target(rootId)
    const hasOperation = input.operationId !== undefined && input.operationId !== ''
    const hasSnapshot = input.snapshotId !== undefined && input.snapshotId !== ''
    if (hasOperation === hasSnapshot) throw new StewardError('INVALID_INPUT', 'give exactly one of operationId or snapshotId', 400)
    const operationId = hasOperation ? assertSafeId(input.operationId, 'operation') : undefined
    const snapshotId = hasSnapshot ? assertSafeId(input.snapshotId, 'snap') : undefined
    const operation = operationId === undefined ? undefined : await store.loadOperation(operationId)
    const effectiveSnapshotId = snapshotId ?? operation?.snapshotId
    if (effectiveSnapshotId === undefined) throw new StewardError('INVALID_INPUT', 'snapshot is required', 400)
    const snapshot = await store.loadSnapshot(effectiveSnapshotId)
    if (snapshot.rootId !== rootId) throw new StewardError('SNAPSHOT_ROOT_MISMATCH', 'snapshot belongs to another root', 409)
    if (operation !== undefined && operation.status === 'rolled_back') throw new StewardError('ALREADY_ROLLED_BACK', 'operation is already rolled back', 409)
    const conflicts: string[] = []
    const actions: Array<{ file: SnapshotFile; keep: boolean; removeTarget: boolean }> = []
    for (const file of snapshot.files) {
      await assertNoSymlinkPrefix(info.path, file.source, true)
      const snapshotAbs = join(store.snapshotDir(snapshot.snapshotId), ...file.snapshot.split('/'))
      const snapshotInfo = await lstat(snapshotAbs).catch(() => undefined)
      if (snapshotInfo === undefined || !snapshotInfo.isFile()) { conflicts.push(`${file.source}: snapshot file missing`); continue }
      if (await sha256File(snapshotAbs) !== file.sha256) { conflicts.push(`${file.source}: snapshot content changed`); continue }
      const sourceAbs = resolveWithin(info.path, file.source)
      const sourceInfo = await lstat(sourceAbs).catch(() => undefined)
      if (sourceInfo !== undefined) {
        if (!sourceInfo.isFile()) conflicts.push(`${file.source}: original path is occupied`)
        else if (await sha256File(sourceAbs) !== file.sha256) conflicts.push(`${file.source}: original path has different content`)
        else actions.push({ file, keep: true, removeTarget: false })
        continue
      }
      let removeTarget = false
      if (operation !== undefined && file.target !== undefined) {
        const targetAbs = resolveWithin(info.path, file.target)
        const targetInfo = await lstat(targetAbs).catch(() => undefined)
        if (targetInfo !== undefined) {
          if (!targetInfo.isFile()) conflicts.push(`${file.target}: moved target is not a regular file`)
          else if (await sha256File(targetAbs) !== file.sha256) conflicts.push(`${file.target}: moved target has been modified`)
          else removeTarget = true
        }
      }
      actions.push({ file, keep: false, removeTarget })
    }
    if (conflicts.length > 0) throw new StewardError('ROLLBACK_CONFLICT', `rollback stopped; conflicts: ${conflicts.slice(0, 8).join(' | ')}`, 409)
    let restored = 0
    let kept = 0
    let removedTarget = 0
    for (const action of actions) {
      if (action.keep) { kept += 1; continue }
      const snapshotAbs = join(store.snapshotDir(snapshot.snapshotId), ...action.file.snapshot.split('/'))
      const sourceAbs = resolveWithin(info.path, action.file.source)
      await this.ensureParent(info.path, action.file.source)
      const temp = join(dirname(sourceAbs), `.steward-restore-${createId('tmp')}`)
      await copyFile(snapshotAbs, temp, fsConstants.COPYFILE_EXCL)
      try {
        if (await sha256File(temp) !== action.file.sha256) throw new StewardError('RESTORE_HASH_MISMATCH', 'restored content hash mismatch', 500)
        await this.publishNoReplace(temp, sourceAbs)
      } finally {
        await rm(temp, { force: true })
      }
      await utimes(sourceAbs, new Date(), new Date(action.file.mtimeMs)).catch(() => undefined)
      restored += 1
      if (action.removeTarget && action.file.target !== undefined) {
        const targetAbs = resolveWithin(info.path, action.file.target)
        await unlink(targetAbs).catch(() => undefined)
        removedTarget += 1
        await this.pruneEmptyParents(info.path, dirname(targetAbs))
      }
    }
    const restoredPaths = new Map<string, string>()
    for (const file of snapshot.files) {
      if (file.target !== undefined) restoredPaths.set(file.target, file.source)
    }
    try {
      await this.moveIndexEntries(store, restoredPaths)
      await store.moveIngestPaths(restoredPaths)
    } catch (error) {
      await store.audit({ event: 'index.update_failed', operationId, error: (error as Error).message })
    }
    if (operation !== undefined) {
      const done: OperationRecord = {
        ...operation,
        moves: operation.moves.map(move => move.status === 'moved' ? { ...move, status: 'restored' } : move),
        finishedAt: new Date().toISOString(), status: 'rolled_back',
        summary: { ...operation.summary, error: '' },
      }
      await store.saveOperation(done)
    }
    await store.audit({ event: 'rollback.succeeded', snapshotId: snapshot.snapshotId, operationId, restored, kept, removedTarget })
    return { rootId, snapshotId: snapshot.snapshotId, ...(operationId === undefined ? {} : { operationId }), status: 'rolled_back', restoredCount: restored, keptCount: kept, removedTargetCount: removedTarget }
  }

  async search(rootId: string, filters: {
    query?: string | undefined
    extension?: string | undefined
    category?: string | undefined
    after?: string | undefined
    before?: string | undefined
    offset?: number | undefined
    limit?: number | undefined
  }): Promise<Record<string, unknown>> {
    const { store } = this.target(rootId)
    const index = await store.loadIndex()
    if (index === undefined) throw new StewardError('INDEX_NOT_FOUND', 'run data_steward_scan first', 409)
    const rules = await this.loadRules(rootId)
    const query = filters.query?.trim().toLowerCase() ?? ''
    const extension = filters.extension?.trim().toLowerCase().replace(/^\./, '')
    const category = filters.category?.trim()
    const after = filters.after === undefined ? undefined : Date.parse(filters.after)
    const before = filters.before === undefined ? undefined : Date.parse(filters.before)
    if (after !== undefined && Number.isNaN(after)) throw new StewardError('INVALID_INPUT', 'after must be an ISO date', 400)
    if (before !== undefined && Number.isNaN(before)) throw new StewardError('INVALID_INPUT', 'before must be an ISO date', 400)
    const offset = Math.max(0, Math.trunc(filters.offset ?? 0))
    const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit ?? 20)))
    const matches = index.entries.filter((entry) => {
      if (query !== '' && !entry.name.toLowerCase().includes(query) && !entry.path.toLowerCase().includes(query)) return false
      if (extension !== undefined && extension !== '' && entry.ext.replace(/^\./, '') !== extension) return false
      if (after !== undefined && entry.mtimeMs < after) return false
      if (before !== undefined && entry.mtimeMs > before) return false
      if (category !== undefined && category !== '') {
        const rule = matchRule(entry, rules.rules)
        if ((rule?.category ?? 'unmatched') !== category) return false
      }
      return true
    })
    const page = matches.slice(offset, offset + limit)
    return {
      rootId, scanId: index.scanId, totalMatches: matches.length, offset, limit, hasMore: offset + page.length < matches.length,
      results: page.map((entry) => {
        const rule = matchRule(entry, rules.rules)
        return { path: entry.path, name: entry.name, size: entry.size, modifiedAt: new Date(entry.mtimeMs).toISOString(), category: rule?.category ?? 'unmatched', label: rule?.label ?? '未匹配', ruleId: rule?.id ?? null }
      }),
    }
  }

  async rules(rootId: string): Promise<Record<string, unknown>> {
    const { store } = this.target(rootId)
    const loaded = await this.loadRules(rootId)
    return describeRules(loaded.rules, loaded.source, store.rulesFile)
  }

  async saveRules(rootId: string, input: unknown): Promise<Record<string, unknown>> {
    const { store } = this.target(rootId)
    const compiled = compileRules(input)
    await store.writeJson(store.rulesFile, input)
    await store.audit({ event: 'rules.saved', rootId, count: compiled.length })
    return describeRules(compiled, 'user', store.rulesFile)
  }

  async fileOp(rootId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.assertWritable()
    const { info, store } = this.target(rootId)
    const op = input.op
    if (typeof op !== 'string') throw new StewardError('INVALID_INPUT', 'op is required', 400)
    if (op === 'mkdir') {
      const path = normalizeRel(input.path, 'path')
      if (path === '.') throw new StewardError('INVALID_INPUT', 'mkdir needs a path', 400)
      const abs = resolveWithin(info.path, path)
      await this.ensureParent(info.path, path)
      try { await lstat(abs); throw new StewardError('TARGET_EXISTS', 'path already exists', 409) } catch (error) {
        if (error instanceof StewardError) throw error
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await mkdir(abs)
      await store.audit({ event: 'file.mkdir', rootId, path })
      return { rootId, op, path, status: 'succeeded' }
    }
    if (op === 'rename' || op === 'move') {
      const source = normalizeRel(input.path, 'path')
      const target = normalizeRel(input.targetPath, 'targetPath')
      if (source === '.' || target === '.') throw new StewardError('INVALID_INPUT', 'source and target are required', 400)
      const sourceAbs = resolveWithin(info.path, source)
      const targetAbs = resolveWithin(info.path, target)
      await assertNoSymlinkPrefix(info.path, source, false)
      await this.ensureParent(info.path, target)
      const sourceInfo = await lstat(sourceAbs)
      if (sourceInfo.isSymbolicLink()) throw new StewardError('SYMLINK_REFUSED', 'symbolic links are not allowed', 400)
      await lstat(targetAbs).then(() => { throw new StewardError('TARGET_EXISTS', 'target already exists', 409) }).catch((error) => {
        if (error instanceof StewardError) throw error
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      })
      if (sourceInfo.isFile()) {
        await this.createSnapshotFromEntries(info, store, [{ source, size: sourceInfo.size, mtimeMs: sourceInfo.mtimeMs }], 'manual', `before ${op} ${source}`)
        await this.moveNoReplace(sourceAbs, targetAbs)
      } else if (sourceInfo.isDirectory()) {
        await rename(sourceAbs, targetAbs)
      } else {
        throw new StewardError('UNSUPPORTED', 'only files and directories can be moved', 400)
      }
      await this.moveIndexEntries(store, new Map([[source, target]]))
      await store.moveIngestPaths(new Map([[source, target]]))
      await store.audit({ event: `file.${op}`, rootId, source, target })
      return { rootId, op, source, target, status: 'succeeded' }
    }
    if (op === 'copy') {
      const source = normalizeRel(input.path, 'path')
      const target = normalizeRel(input.targetPath, 'targetPath')
      const sourceAbs = resolveWithin(info.path, source)
      const targetAbs = resolveWithin(info.path, target)
      await assertNoSymlinkPrefix(info.path, source, false)
      await this.ensureParent(info.path, target)
      const sourceInfo = await lstat(sourceAbs)
      if (!sourceInfo.isFile()) throw new StewardError('UNSUPPORTED', 'copy currently supports regular files only', 400)
      await copyFile(sourceAbs, targetAbs, fsConstants.COPYFILE_EXCL)
      if (await sha256File(sourceAbs) !== await sha256File(targetAbs)) {
        await rm(targetAbs, { force: true })
        throw new StewardError('COPY_HASH_MISMATCH', 'copied content hash mismatch', 500)
      }
      await this.upsertIndex(store, info.path, target)
      await store.audit({ event: 'file.copy', rootId, source, target })
      return { rootId, op, source, target, status: 'succeeded' }
    }
    if (op === 'delete') {
      const path = normalizeRel(input.path, 'path')
      if (path === '.') throw new StewardError('INVALID_INPUT', 'refusing to delete the root', 400)
      const sourceAbs = resolveWithin(info.path, path)
      await assertNoSymlinkPrefix(info.path, path, false)
      const sourceInfo = await lstat(sourceAbs)
      if (!sourceInfo.isFile()) throw new StewardError('UNSUPPORTED', 'delete currently supports regular files only', 400)
      const trashId = createId('trash')
      const storedRel = `files/${trashId}`
      const storedAbs = join(store.trashDir, ...storedRel.split('/'))
      await mkdir(dirname(storedAbs), { recursive: true })
      const hash = await sha256File(sourceAbs)
      await this.moveNoReplace(sourceAbs, storedAbs)
      const manifest: TrashManifest = {
        version: 1, trashId, rootId, originalPath: path, deletedAt: new Date().toISOString(),
        size: sourceInfo.size, sha256: hash, storedPath: storedRel,
      }
      await store.saveTrash(manifest)
      await this.removeIndexEntries(store, [path])
      await store.audit({ event: 'file.delete', rootId, path, trashId })
      return { rootId, op, path, trashId, status: 'succeeded' }
    }
    if (op === 'restore') {
      const trashId = assertSafeId(input.trashId, 'trash')
      const manifest = await store.readJson<TrashManifest>(join(store.trashDir, `${trashId}.json`))
      if (manifest === undefined) throw new StewardError('TRASH_NOT_FOUND', `trash entry not found: ${trashId}`, 404)
      const sourceAbs = resolveWithin(info.path, manifest.originalPath)
      await this.ensureParent(info.path, manifest.originalPath)
      const storedAbs = join(store.trashDir, ...manifest.storedPath.split('/'))
      if (await sha256File(storedAbs) !== manifest.sha256) throw new StewardError('TRASH_CORRUPT', 'trash content changed', 409)
      await lstat(sourceAbs).then(() => { throw new StewardError('TARGET_EXISTS', 'original path is occupied', 409) }).catch((error) => {
        if (error instanceof StewardError) throw error
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      })
      await this.moveNoReplace(storedAbs, sourceAbs)
      await rm(join(store.trashDir, `${trashId}.json`), { force: true })
      await this.upsertIndex(store, info.path, manifest.originalPath)
      await store.audit({ event: 'file.restore', rootId, path: manifest.originalPath, trashId })
      return { rootId, op, path: manifest.originalPath, trashId, status: 'succeeded' }
    }
    throw new StewardError('UNSUPPORTED', `unsupported operation: ${op}`, 400)
  }

  async trashList(rootId: string): Promise<Record<string, unknown>> {
    const { store } = this.target(rootId)
    return { rootId, entries: await store.listTrash() }
  }

  private async loadRules(rootId: string): Promise<{ rules: CompiledRule[]; source: 'default' | 'user' }> {
    const { store } = this.target(rootId)
    const user = await store.readJson<unknown>(store.rulesFile)
    if (user === undefined) return { rules: compileRules({ version: 1, rules: DEFAULT_RULES }), source: 'default' }
    return { rules: compileRules(user), source: 'user' }
  }

  private async uniqueTarget(root: string, target: string, used: Set<string>): Promise<string> {
    const exists = async (candidate: string): Promise<boolean> => used.has(candidate)
      || await lstat(resolveWithin(root, candidate)).then(() => true).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
        return true
      })
    if (!(await exists(target))) return target
    const dot = target.lastIndexOf('.')
    const stem = dot > 0 ? target.slice(0, dot) : target
    const ext = dot > 0 ? target.slice(dot) : ''
    for (let index = 1; index < 10_000; index += 1) {
      const candidate = `${stem} (${index})${ext}`
      if (!(await exists(candidate))) return candidate
    }
    throw new StewardError('TARGET_CONFLICT', 'cannot allocate a unique target name', 409)
  }

  private async preflightPlan(root: string, plan: Plan): Promise<void> {
    for (const item of plan.items) {
      await assertNoSymlinkPrefix(root, item.source, false)
      const sourceAbs = resolveWithin(root, item.source)
      const info = await lstat(sourceAbs)
      if (!info.isFile()) throw new StewardError('PLAN_SOURCE_INVALID', `${item.source} is not a regular file`, 409)
      if (info.size !== item.size || Math.abs(info.mtimeMs - item.mtimeMs) > 1) {
        throw new StewardError('PLAN_SOURCE_CHANGED', `${item.source} changed since classify; scan and classify again`, 409)
      }
      await assertNoSymlinkPrefix(root, item.target, true)
      const targetAbs = resolveWithin(root, item.target)
      await lstat(targetAbs).then(() => { throw new StewardError('TARGET_EXISTS', `${item.target} now exists; classify again`, 409) }).catch((error) => {
        if (error instanceof StewardError) throw error
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      })
    }
  }

  /** Keep the last index useful after an upload or file operation. */
  private async upsertIndex(store: StateStore, root: string, rel: string): Promise<void> {
    const index = await store.loadIndex()
    if (index === undefined || !isUnder(rel, index.scope)) return
    const info = await lstat(resolveWithin(root, rel)).catch(() => undefined)
    if (info === undefined || !info.isFile()) return
    const entries = index.entries.filter(entry => entry.path !== rel)
    entries.push(indexEntry(rel, info))
    entries.sort((a, b) => a.path.localeCompare(b.path))
    await store.saveIndex({ ...index, entries })
  }

  private async removeIndexEntries(store: StateStore, paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return
    const index = await store.loadIndex()
    if (index === undefined) return
    const removed = new Set(paths)
    const entries = index.entries.filter(entry => !removed.has(entry.path))
    if (entries.length !== index.entries.length) await store.saveIndex({ ...index, entries })
  }

  private async moveIndexEntries(store: StateStore, updates: ReadonlyMap<string, string>): Promise<void> {
    if (updates.size === 0) return
    const index = await store.loadIndex()
    if (index === undefined) return
    let changed = false
    const entries = index.entries.map((entry) => {
      for (const [from, to] of updates) {
        if (entry.path === from) {
          changed = true
          return indexEntry(to, entry)
        }
        if (entry.path.startsWith(`${from}/`)) {
          changed = true
          return indexEntry(`${to}${entry.path.slice(from.length)}`, entry)
        }
      }
      return entry
    })
    if (changed) {
      entries.sort((a, b) => a.path.localeCompare(b.path))
      await store.saveIndex({ ...index, entries })
    }
  }

  private async createSnapshotFromEntries(
    info: RootInfo,
    store: StateStore,
    entries: ReadonlyArray<{ source: string; target?: string; size: number; mtimeMs: number }>,
    kind: 'manual' | 'operation',
    label: string,
    operationId?: string,
  ): Promise<SnapshotManifest> {
    const snapshotId = createId('snap')
    const temp = store.snapshotTempDir(snapshotId)
    const final = store.snapshotDir(snapshotId)
    await mkdir(join(temp, 'files'), { recursive: true })
    const files: SnapshotFile[] = []
    let hardLinkCount = 0
    let copyCount = 0
    try {
      for (const [index, entry] of entries.entries()) {
        const sourceAbs = resolveWithin(info.path, entry.source)
        await assertNoSymlinkPrefix(info.path, entry.source, false)
        const sourceInfo = await lstat(sourceAbs)
        if (!sourceInfo.isFile()) throw new StewardError('SNAPSHOT_SOURCE_INVALID', `${entry.source} is not a regular file`, 409)
        const snapshotRel = `files/${String(index + 1).padStart(6, '0')}`
        const snapshotAbs = join(temp, ...snapshotRel.split('/'))
        const hash = await sha256File(sourceAbs)
        try {
          await link(sourceAbs, snapshotAbs)
          hardLinkCount += 1
        } catch {
          await copyFile(sourceAbs, snapshotAbs, fsConstants.COPYFILE_EXCL)
          if (await sha256File(snapshotAbs) !== hash) throw new StewardError('SNAPSHOT_HASH_MISMATCH', 'snapshot copy hash mismatch', 500)
          copyCount += 1
        }
        files.push({
          source: entry.source, ...(entry.target === undefined ? {} : { target: entry.target }),
          snapshot: snapshotRel, sha256: hash, size: sourceInfo.size, mtimeMs: sourceInfo.mtimeMs,
        })
      }
      const manifest: SnapshotManifest = {
        version: 1, snapshotId, rootId: info.id, root: info.path, createdAt: new Date().toISOString(),
        kind, label, ...(operationId === undefined ? {} : { operationId }), files,
        summary: {
          fileCount: files.length,
          totalBytes: files.reduce((sum, file) => sum + file.size, 0),
          hardLinkCount, copyCount,
        },
      }
      await store.writeJson(join(temp, 'manifest.json'), manifest)
      await rename(temp, final)
      return manifest
    } catch (error) {
      await rm(temp, { recursive: true, force: true })
      throw error
    }
  }

  private async autoRollback(info: RootInfo, store: StateStore, operation: OperationRecord, snapshot: SnapshotManifest): Promise<'ok' | 'failed'> {
    try {
      for (const move of operation.moves) {
        if (move.status !== 'moved') continue
        const targetAbs = resolveWithin(info.path, move.target)
        const sourceAbs = resolveWithin(info.path, move.source)
        const targetInfo = await lstat(targetAbs).catch(() => undefined)
        if (targetInfo === undefined) continue
        await this.ensureParent(info.path, move.source)
        await this.moveNoReplace(targetAbs, sourceAbs)
      }
      await store.audit({ event: 'organize.auto_rollback', operationId: operation.operationId, snapshotId: snapshot.snapshotId, result: 'ok' })
      return 'ok'
    } catch (error) {
      await store.audit({ event: 'organize.auto_rollback', operationId: operation.operationId, snapshotId: snapshot.snapshotId, result: 'failed', error: (error as Error).message })
      return 'failed'
    }
  }

  private async ensureParent(root: string, targetRel: string): Promise<void> {
    const parent = dirname(targetRel)
    if (parent === '.' || parent === '') return
    await assertNoSymlinkPrefix(root, parent, true)
    await mkdir(resolveWithin(root, parent), { recursive: true })
    await assertNoSymlinkPrefix(root, parent, false)
  }

  private async moveNoReplace(source: string, target: string): Promise<void> {
    try {
      await link(source, target)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') throw new StewardError('TARGET_EXISTS', 'target already exists', 409)
      if (code === 'EXDEV' || code === 'EPERM' || code === 'EACCES' || code === 'EMLINK' || code === 'ENOSYS') {
        const sourceHash = await sha256File(source)
        await copyFile(source, target, fsConstants.COPYFILE_EXCL)
        if (await sha256File(target) !== sourceHash) {
          await rm(target, { force: true })
          throw new StewardError('MOVE_HASH_MISMATCH', 'cross-device move hash mismatch', 500)
        }
      } else {
        throw error
      }
    }
    try {
      await unlink(source)
    } catch (error) {
      await unlink(target).catch(() => undefined)
      throw error
    }
  }

  private async publishNoReplace(source: string, target: string): Promise<void> {
    try {
      await link(source, target)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') throw new StewardError('TARGET_EXISTS', 'target already exists', 409)
      if (code === 'EXDEV' || code === 'EPERM' || code === 'EACCES' || code === 'EMLINK' || code === 'ENOSYS') {
        await copyFile(source, target, fsConstants.COPYFILE_EXCL)
        return
      }
      throw error
    }
  }

  private async pruneEmptyParents(root: string, start: string): Promise<void> {
    let current = start
    while (current !== root && current.startsWith(`${root}${sep}`)) {
      try {
        const entries = await readdir(current)
        if (entries.length > 0) return
        await rm(current, { recursive: false })
      } catch {
        return
      }
      current = dirname(current)
    }
  }
}

function isUnder(path: string, scope: string): boolean {
  if (scope === '.') return true
  return path === scope || path.startsWith(`${scope}/`)
}

function indexEntry(rel: string, info: { readonly size: number; readonly mtimeMs: number }): FileEntry {
  const name = basename(rel)
  const parsed = parse(name)
  return { path: rel, name, stem: parsed.name, ext: parsed.ext, size: info.size, mtimeMs: info.mtimeMs }
}

const INVALID_UPLOAD_NAME = /[<>:"/\\|?*\u0000-\u001f]/
const RESERVED_UPLOAD_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** Accept a browser file name without allowing a path or a reserved device name. */
function uploadName(input: unknown): string {
  if (typeof input !== 'string' || input.trim() === '') throw new StewardError('INVALID_NAME', 'file name is required', 400)
  const name = basename(input.replace(/\\/g, '/')).trim().replace(/[. ]+$/, '')
  if (name === '' || name === '.' || name === '..') throw new StewardError('INVALID_NAME', 'invalid file name', 400)
  if (INVALID_UPLOAD_NAME.test(name) || RESERVED_UPLOAD_NAME.test(name)) {
    throw new StewardError('INVALID_NAME', `invalid file name: ${name}`, 400)
  }
  return name
}
