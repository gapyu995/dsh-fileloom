/** Shared data model for the file-manager host package. */

export interface RootInfo {
  readonly id: string
  readonly name: string
  readonly path: string
}

export interface FileEntry {
  /** POSIX path relative to the root. */
  readonly path: string
  readonly name: string
  readonly stem: string
  readonly ext: string
  readonly size: number
  readonly mtimeMs: number
}

export interface DirEntry extends FileEntry {
  readonly kind: 'file' | 'directory'
}

export interface Rule {
  readonly id: string
  readonly category: string
  readonly label: string
  readonly priority: number
  readonly extensions?: readonly string[]
  readonly namePattern?: string
  readonly minSize?: number
  readonly maxSize?: number
  readonly target: string
}

export interface CompiledRule extends Rule {
  readonly regex?: RegExp
}

export interface PlanItem {
  readonly source: string
  readonly target: string
  readonly ruleId: string
  readonly category: string
  readonly label: string
  readonly size: number
  readonly mtimeMs: number
  readonly renamedForConflict: boolean
}

export interface Plan {
  readonly version: 1
  readonly planId: string
  readonly rootId: string
  readonly root: string
  readonly scanId: string
  readonly scope: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly status: 'ready' | 'running' | 'executed' | 'failed'
  readonly rulesSource: 'default' | 'user'
  readonly items: readonly PlanItem[]
  readonly counts: {
    readonly fileCount: number
    readonly moveCount: number
    readonly noopCount: number
    readonly unmatchedCount: number
    readonly collisionCount: number
    readonly totalBytes: number
  }
  readonly warnings: readonly string[]
}

export interface SnapshotFile {
  readonly source: string
  readonly target?: string
  readonly snapshot: string
  readonly sha256: string
  readonly size: number
  readonly mtimeMs: number
}

export interface SnapshotManifest {
  readonly version: 1
  readonly snapshotId: string
  readonly rootId: string
  readonly root: string
  readonly createdAt: string
  readonly kind: 'manual' | 'operation'
  readonly label: string
  readonly operationId?: string
  readonly files: readonly SnapshotFile[]
  readonly summary: {
    readonly fileCount: number
    readonly totalBytes: number
    readonly hardLinkCount: number
    readonly copyCount: number
  }
}

export interface OperationMove {
  readonly source: string
  readonly target: string
  status: 'pending' | 'moved' | 'restored' | 'failed'
}

export interface OperationRecord {
  readonly version: 1
  readonly operationId: string
  readonly rootId: string
  readonly planId: string
  readonly snapshotId: string
  readonly createdAt: string
  finishedAt?: string
  status: 'running' | 'succeeded' | 'rolled_back' | 'failed' | 'rollback_failed'
  readonly moves: readonly OperationMove[]
  readonly summary: {
    readonly movedCount: number
    readonly conflictResolvedCount: number
    readonly error: string
  }
}

export interface TrashManifest {
  readonly version: 1
  readonly trashId: string
  readonly rootId: string
  readonly originalPath: string
  readonly deletedAt: string
  readonly size: number
  readonly sha256: string
  readonly storedPath: string
}

export interface ScanIndex {
  readonly version: 1
  readonly scanId: string
  readonly rootId: string
  readonly root: string
  readonly scope: string
  readonly scannedAt: string
  readonly maxFiles: number
  readonly truncated: boolean
  readonly warnings: readonly string[]
  readonly entries: readonly FileEntry[]
}

export interface SnapshotSummary {
  readonly snapshotId: string
  readonly createdAt: string
  readonly kind: 'manual' | 'operation'
  readonly label: string
  readonly operationId?: string
  readonly fileCount: number
  readonly totalBytes: number
}

/** One file added through the upload/drop path; persisted so it stays discoverable. */
export interface IngestEntry {
  readonly ingestId: string
  readonly rootId: string
  readonly path: string
  readonly name: string
  readonly size: number
  readonly ingestedAt: string
  readonly source: 'upload' | 'drop'
  readonly originalName: string
  readonly sha256: string
}

/** Operation list row shown in the activity history. */
export interface OperationSummary {
  readonly operationId: string
  readonly planId: string
  readonly snapshotId: string
  readonly createdAt: string
  readonly finishedAt?: string
  readonly status: OperationRecord['status']
  readonly movedCount: number
  readonly totalCount: number
  readonly error: string
}

/** Host-owned error with an HTTP-friendly status. */
export class StewardError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'StewardError'
    this.code = code
    this.status = status
  }
}
