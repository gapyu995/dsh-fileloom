/** Per-root state directory: index, plans, operations, snapshots, trash, audit. */

import { mkdir, readFile, readdir, rename, rm, writeFile, appendFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { IngestEntry, OperationRecord, OperationSummary, Plan, ScanIndex, SnapshotManifest, SnapshotSummary, TrashManifest } from './types.ts'
import { StewardError } from './types.ts'

const STATE_NAME = '.data-steward'

/** Naming and atomic persistence for one managed root. */
export class StateStore {
  readonly root: string
  readonly dir: string

  constructor(root: string, directory = join(root, STATE_NAME)) {
    this.root = root
    this.dir = directory
  }

  get plansDir(): string { return join(this.dir, 'plans') }
  get operationsDir(): string { return join(this.dir, 'operations') }
  get snapshotsDir(): string { return join(this.dir, 'snapshots') }
  get trashDir(): string { return join(this.dir, 'trash') }
  get indexFile(): string { return join(this.dir, 'index.json') }
  get rulesFile(): string { return join(this.dir, 'rules.json') }
  get ingestFile(): string { return join(this.dir, 'ingest.json') }
  get auditFile(): string { return join(this.dir, 'audit.jsonl') }

  async ensure(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    await Promise.all([
      mkdir(this.plansDir, { recursive: true }),
      mkdir(this.operationsDir, { recursive: true }),
      mkdir(this.snapshotsDir, { recursive: true }),
      mkdir(this.trashDir, { recursive: true }),
    ])
  }

  /** Read a JSON file, returning undefined for a missing file. */
  async readJson<T>(file: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      if (error instanceof SyntaxError) throw new StewardError('STATE_CORRUPT', `invalid JSON: ${file}`, 500)
      throw error
    }
  }

  /** Write JSON through a same-directory temporary file, then rename. */
  async writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.tmp-${randomBytes(4).toString('hex')}`
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    try {
      await rename(temp, file)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EACCES') throw error
      await rm(file, { force: true })
      await rename(temp, file)
    }
  }

  async saveIndex(index: ScanIndex): Promise<void> { await this.writeJson(this.indexFile, index) }
  async loadIndex(): Promise<ScanIndex | undefined> { return this.readJson<ScanIndex>(this.indexFile) }

  async savePlan(plan: Plan): Promise<void> { await this.writeJson(join(this.plansDir, `${plan.planId}.json`), plan) }
  async loadPlan(planId: string): Promise<Plan> {
    const plan = await this.readJson<Plan>(join(this.plansDir, `${planId}.json`))
    if (plan === undefined) throw new StewardError('PLAN_NOT_FOUND', `plan not found: ${planId}`, 404)
    return plan
  }

  async saveOperation(operation: OperationRecord): Promise<void> {
    await this.writeJson(join(this.operationsDir, `${operation.operationId}.json`), operation)
  }
  async loadOperation(operationId: string): Promise<OperationRecord> {
    const operation = await this.readJson<OperationRecord>(join(this.operationsDir, `${operationId}.json`))
    if (operation === undefined) throw new StewardError('OPERATION_NOT_FOUND', `operation not found: ${operationId}`, 404)
    return operation
  }

  /** Newest-first operation summaries for the activity history. */
  async listOperations(): Promise<OperationSummary[]> {
    let names: string[]
    try {
      names = await readdir(this.operationsDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const rows: OperationSummary[] = []
    for (const name of names) {
      if (!name.endsWith('.json') || name.startsWith('.')) continue
      const operation = await this.readJson<OperationRecord>(join(this.operationsDir, name))
      if (operation === undefined) continue
      rows.push({
        operationId: operation.operationId,
        planId: operation.planId,
        snapshotId: operation.snapshotId,
        createdAt: operation.createdAt,
        ...(operation.finishedAt === undefined ? {} : { finishedAt: operation.finishedAt }),
        status: operation.status,
        movedCount: operation.summary.movedCount,
        totalCount: operation.moves.length,
        error: operation.summary.error,
      })
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async removeRules(): Promise<void> { await rm(this.rulesFile, { force: true }) }

  async loadIngest(): Promise<IngestEntry[]> {
    return await this.readJson<IngestEntry[]>(this.ingestFile) ?? []
  }

  /** Record an upload; cap the ledger so the file stays bounded. */
  async addIngest(entry: IngestEntry): Promise<void> {
    const current = await this.loadIngest()
    const next = [entry, ...current.filter(item => item.path !== entry.path)].slice(0, 500)
    await this.writeJson(this.ingestFile, next)
  }

  /** Follow moves so recently added files remain discoverable after organizing. */
  async moveIngestPaths(updates: ReadonlyMap<string, string>): Promise<void> {
    if (updates.size === 0) return
    const current = await this.loadIngest()
    let changed = false
    const next = current.map((item) => {
      const target = updates.get(item.path)
      if (target === undefined) return item
      changed = true
      return { ...item, path: target, name: target.split('/').pop() ?? item.name }
    })
    if (changed) await this.writeJson(this.ingestFile, next)
  }

  async removeIngest(paths: ReadonlySet<string>): Promise<void> {
    if (paths.size === 0) return
    const current = await this.loadIngest()
    const next = current.filter(item => !paths.has(item.path))
    if (next.length !== current.length) await this.writeJson(this.ingestFile, next)
  }

  snapshotDir(snapshotId: string): string { return join(this.snapshotsDir, snapshotId) }
  snapshotTempDir(snapshotId: string): string { return join(this.snapshotsDir, `.tmp-${snapshotId}`) }
  snapshotManifestFile(snapshotId: string): string { return join(this.snapshotDir(snapshotId), 'manifest.json') }

  async loadSnapshot(snapshotId: string): Promise<SnapshotManifest> {
    const manifest = await this.readJson<SnapshotManifest>(this.snapshotManifestFile(snapshotId))
    if (manifest === undefined) throw new StewardError('SNAPSHOT_NOT_FOUND', `snapshot not found: ${snapshotId}`, 404)
    return manifest
  }

  async listSnapshots(): Promise<SnapshotSummary[]> {
    let names: string[]
    try {
      names = await readdir(this.snapshotsDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const summaries: SnapshotSummary[] = []
    for (const name of names) {
      if (name.startsWith('.')) continue
      const manifest = await this.readJson<SnapshotManifest>(join(this.snapshotsDir, name, 'manifest.json'))
      if (manifest === undefined) continue
      summaries.push({
        snapshotId: manifest.snapshotId,
        createdAt: manifest.createdAt,
        kind: manifest.kind,
        label: manifest.label,
        ...(manifest.operationId === undefined ? {} : { operationId: manifest.operationId }),
        fileCount: manifest.summary.fileCount,
        totalBytes: manifest.summary.totalBytes,
      })
    }
    return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async saveTrash(manifest: TrashManifest): Promise<void> {
    await this.writeJson(join(this.trashDir, `${manifest.trashId}.json`), manifest)
  }

  async listTrash(): Promise<TrashManifest[]> {
    let names: string[]
    try {
      names = await readdir(this.trashDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const rows: TrashManifest[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const row = await this.readJson<TrashManifest>(join(this.trashDir, name))
      if (row !== undefined) rows.push(row)
    }
    return rows.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }

  async audit(event: Record<string, unknown>): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    await appendFile(this.auditFile, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8')
  }
}
