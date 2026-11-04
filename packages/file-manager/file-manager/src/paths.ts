/** Path normalization, containment, symlink checks, and filesystem walking. */

import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { StewardError, type FileEntry } from './types.ts'

const WINDOWS = process.platform === 'win32'
const DRIVE = /^[A-Za-z]:/

/** Normalize a user-supplied path to a POSIX path relative to a root. */
export function normalizeRel(input: unknown, label = 'path'): string {
  if (typeof input !== 'string') throw new StewardError('INVALID_PATH', `${label} must be a string`)
  const raw = input.replaceAll('\\', '/')
  if (raw.includes('\0')) throw new StewardError('INVALID_PATH', `${label} contains NUL`)
  if (raw.startsWith('/') || raw.startsWith('//') || DRIVE.test(raw) || isAbsolute(raw)) {
    throw new StewardError('INVALID_PATH', `${label} must be relative to the data root`)
  }
  const parts = raw.split('/').filter(part => part !== '' && part !== '.')
  if (parts.some(part => part === '..')) throw new StewardError('INVALID_PATH', `${label} must not traverse upward`)
  return parts.join('/') || '.'
}

/** Join a normalized relative path onto an absolute root. */
export function resolveWithin(root: string, rel: string): string {
  const normalized = normalizeRel(rel)
  const candidate = normalized === '.' ? resolve(root) : resolve(root, ...normalized.split('/'))
  if (!isWithin(root, candidate)) throw new StewardError('INVALID_PATH', 'path escapes the data root')
  return candidate
}

/** Case-aware containment test (Windows paths are case-insensitive). */
export function isWithin(root: string, candidate: string): boolean {
  const base = WINDOWS ? root.toLowerCase() : root
  const target = WINDOWS ? candidate.toLowerCase() : candidate
  const rel = relative(base, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Convert an absolute path under root to a POSIX relative path. */
export function relativePosix(root: string, absolute: string): string {
  const rel = relative(root, absolute).split(sep).join('/')
  return rel === '' ? '.' : rel
}

/**
 * Reject a symlink or junction at any existing segment of a relative path.
 * Missing segments are allowed when `allowMissing` is true (target paths).
 */
export async function assertNoSymlinkPrefix(root: string, rel: string, allowMissing = true): Promise<void> {
  const normalized = normalizeRel(rel)
  if (normalized === '.') return
  const parts = normalized.split('/')
  let current = root
  for (const [index, part] of parts.entries()) {
    current = join(current, part)
    let info
    try {
      info = await lstat(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && allowMissing) return
      throw error
    }
    if (info.isSymbolicLink()) throw new StewardError('SYMLINK_REFUSED', 'symbolic links are not allowed')
    if (index < parts.length - 1 && !info.isDirectory()) {
      throw new StewardError('INVALID_PATH', 'a parent path component is not a directory')
    }
  }
}

/** List regular files under a relative scope, skipping symlinks and state directories. */
export async function walkFiles(
  root: string,
  scope: string,
  options: {
    readonly maxFiles: number
    readonly excludeAbs?: readonly string[]
    readonly signal?: AbortSignal
  },
): Promise<{ entries: FileEntry[]; truncated: boolean; warnings: string[] }> {
  const start = resolveWithin(root, scope)
  await assertNoSymlinkPrefix(root, scope, false)
  const excluded = new Set((options.excludeAbs ?? []).map(path => WINDOWS ? path.toLowerCase() : path))
  const entries: FileEntry[] = []
  const warnings: string[] = []
  let truncated = false

  const visit = async (directory: string): Promise<void> => {
    options.signal?.throwIfAborted()
    let dirents
    try {
      dirents = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      warnings.push(`cannot read ${relativePosix(root, directory)}: ${(error as Error).message}`)
      return
    }
    dirents.sort((a, b) => a.name.localeCompare(b.name))
    for (const dirent of dirents) {
      options.signal?.throwIfAborted()
      if (entries.length >= options.maxFiles) {
        truncated = true
        return
      }
      const absolute = join(directory, dirent.name)
      if (excluded.has(WINDOWS ? absolute.toLowerCase() : absolute)) continue
      if (dirent.isSymbolicLink()) continue
      if (dirent.isDirectory()) {
        await visit(absolute)
        if (truncated) return
        continue
      }
      if (!dirent.isFile()) continue
      let info
      try {
        info = await lstat(absolute)
      } catch (error) {
        warnings.push(`cannot stat ${relativePosix(root, absolute)}: ${(error as Error).message}`)
        continue
      }
      if (!info.isFile()) continue
      const path = relativePosix(root, absolute)
      const name = dirent.name
      const dot = name.lastIndexOf('.')
      entries.push({
        path,
        name,
        stem: dot > 0 ? name.slice(0, dot) : name,
        ext: dot > 0 ? name.slice(dot).toLowerCase() : '',
        size: info.size,
        mtimeMs: info.mtimeMs,
      })
      if (entries.length >= options.maxFiles) {
        truncated = true
        return
      }
    }
  }

  await visit(start)
  entries.sort((a, b) => a.path.localeCompare(b.path))
  return { entries, truncated, warnings }
}

/** Hash one regular file. */
export async function sha256File(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  signal?.addEventListener('abort', () => stream.destroy(new Error('aborted')), { once: true })
  for await (const chunk of stream) {
    signal?.throwIfAborted()
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

/** Stable, filesystem-safe identifier. */
export function createId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `${prefix}_${stamp}_${randomBytes(4).toString('hex')}`
}

/** Assert an id is filename-safe before loading state. */
export function assertSafeId(id: unknown, prefix: string): string {
  if (typeof id !== 'string' || !new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(id)) {
    throw new StewardError('INVALID_ID', `invalid ${prefix} id`)
  }
  return id
}

/** Human-readable byte count. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}
