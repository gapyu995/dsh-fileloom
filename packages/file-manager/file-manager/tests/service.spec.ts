import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileManagerService } from '../src/service.ts'
import { normalizeRel } from '../src/paths.ts'
import { compileRules, DEFAULT_RULES } from '../src/rules.ts'

let root: string
let service: FileManagerService

beforeEach(async () => {
  root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'steward-test-'))
  await mkdir(join(root, 'inbox'))
  await writeFile(join(root, 'inbox', 'movie.mp4'), 'movie')
  await writeFile(join(root, 'inbox', 'song.mp3'), 'song')
  await writeFile(join(root, 'inbox', 'photo.jpg'), 'photo')
  await writeFile(join(root, 'inbox', 'note.txt'), 'note')
  await writeFile(join(root, 'inbox', 'archive.zip'), 'zip')
  await writeFile(join(root, 'inbox', 'other.bin'), 'other')
  service = await FileManagerService.create({ roots: [root], maxScanFiles: 1000 })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('paths', () => {
  it('rejects absolute and traversing paths', () => {
    expect(() => normalizeRel('../etc')).toThrow()
    expect(() => normalizeRel('C:/Windows')).toThrow()
    expect(() => normalizeRel('/etc')).toThrow()
    expect(normalizeRel('./inbox\\movie.mp4')).toBe('inbox/movie.mp4')
  })
})

describe('rules', () => {
  it('compiles the default rule set and matches categories', () => {
    const rules = compileRules({ version: 1, rules: DEFAULT_RULES })
    expect(rules[0]!.priority).toBeGreaterThanOrEqual(rules[rules.length - 1]!.priority)
  })
})

describe('file manager service', () => {
  it('scans, classifies, organizes, and rolls back', async () => {
    const rootId = service.rootsInfo()[0]!.id
    const scan = await service.scan(rootId, 'inbox')
    expect(scan.fileCount).toBe(6)
    expect(scan.truncated).toBe(false)

    const plan = await service.classify(rootId, 'inbox') as {
      planId: string
      moveCount: number
      unmatchedCount: number
    }
    expect(plan.moveCount).toBe(6)
    expect(plan.unmatchedCount).toBe(0)

    const organized = await service.organize(rootId, plan.planId, true) as {
      operationId: string
      snapshotId: string
      movedCount: number
      status: string
    }
    expect(organized.status).toBe('succeeded')
    expect(organized.movedCount).toBe(6)
    expect(await readFile(join(root, 'Media', 'Videos', String(new Date().getFullYear()), 'movie.mp4'), 'utf8')).toBe('movie')
    await expect(readFile(join(root, 'inbox', 'movie.mp4'), 'utf8')).rejects.toThrow()

    const rolled = await service.rollback(rootId, { operationId: organized.operationId, confirm: true }) as {
      restoredCount: number
    }
    expect(rolled.restoredCount).toBe(6)
    expect(await readFile(join(root, 'inbox', 'movie.mp4'), 'utf8')).toBe('movie')
    await expect(readFile(join(root, 'Media', 'Videos', String(new Date().getFullYear()), 'movie.mp4'), 'utf8')).rejects.toThrow()
  })

  it('requires explicit confirmation', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await service.scan(rootId, 'inbox')
    const plan = await service.classify(rootId, 'inbox') as { planId: string }
    await expect(service.organize(rootId, plan.planId, false)).rejects.toThrow(/confirm/)
  })

  it('moves deleted files to trash and restores them', async () => {
    const rootId = service.rootsInfo()[0]!.id
    const deleted = await service.fileOp(rootId, { op: 'delete', path: 'inbox/note.txt' }) as { trashId: string }
    expect(deleted.trashId).toMatch(/^trash_/)
    await expect(readFile(join(root, 'inbox', 'note.txt'), 'utf8')).rejects.toThrow()
    const trash = await service.trashList(rootId) as { entries: Array<{ trashId: string; originalPath: string }> }
    expect(trash.entries[0]!.originalPath).toBe('inbox/note.txt')
    await service.fileOp(rootId, { op: 'restore', trashId: deleted.trashId })
    expect(await readFile(join(root, 'inbox', 'note.txt'), 'utf8')).toBe('note')
  })

  it('refuses to traverse outside the root', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await expect(service.list(rootId, '..')).rejects.toThrow()
  })

  it('does not overwrite an existing target', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await writeFile(join(root, 'inbox', 'copy.txt'), 'existing')
    await expect(service.fileOp(rootId, { op: 'copy', path: 'inbox/note.txt', targetPath: 'inbox/copy.txt' })).rejects.toThrow()
  })

  it('auto-rolls back completed moves when a later move fails', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await service.scan(rootId, 'inbox')
    const plan = await service.classify(rootId, 'inbox') as { planId: string; moveCount: number }
    expect(plan.moveCount).toBe(6)

    // Inject a fault on the second move, after the first one has already committed.
    const target = service as unknown as { moveNoReplace: (source: string, target: string) => Promise<void> }
    const original = target.moveNoReplace.bind(service)
    let calls = 0
    target.moveNoReplace = async (source, destination) => {
      calls += 1
      if (calls === 2) throw new Error('injected move failure')
      return original(source, destination)
    }

    await expect(service.organize(rootId, plan.planId, true)).rejects.toThrow(/autoRollback=ok/)
    // Every original file is back and no moved copy remains.
    expect(await readFile(join(root, 'inbox', 'archive.zip'), 'utf8')).toBe('zip')
    await expect(readFile(join(root, 'Archives', 'archive.zip'), 'utf8')).rejects.toThrow()
    expect(calls).toBe(3)
  })

  it('refuses rollback when a moved target has been modified', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await service.scan(rootId, 'inbox')
    const plan = await service.classify(rootId, 'inbox') as { planId: string }
    const organized = await service.organize(rootId, plan.planId, true) as { operationId: string }
    const target = join(root, 'Media', 'Videos', String(new Date().getFullYear()), 'movie.mp4')
    await writeFile(target, 'changed by user')
    await expect(service.rollback(rootId, { operationId: organized.operationId, confirm: true }))
      .rejects.toThrow(/conflicts/)
    // The modified target is untouched.
    expect(await readFile(target, 'utf8')).toBe('changed by user')
  })

  it('snapshots a directory and restores a file deleted to trash', async () => {
    const rootId = service.rootsInfo()[0]!.id
    const snapshot = await service.snapshotCreate(rootId, 'inbox') as { snapshotId: string; fileCount: number }
    expect(snapshot.fileCount).toBe(6)
    await service.fileOp(rootId, { op: 'delete', path: 'inbox/note.txt' })
    await expect(readFile(join(root, 'inbox', 'note.txt'), 'utf8')).rejects.toThrow()
    const rolled = await service.rollback(rootId, { snapshotId: snapshot.snapshotId, confirm: true }) as { restoredCount: number }
    expect(rolled.restoredCount).toBe(1)
    expect(await readFile(join(root, 'inbox', 'note.txt'), 'utf8')).toBe('note')
  })

  it('searches the scan index by name and category', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await service.scan(rootId, 'inbox')
    const byName = await service.search(rootId, { query: 'movie' }) as { totalMatches: number }
    expect(byName.totalMatches).toBe(1)
    const byCategory = await service.search(rootId, { category: 'video' }) as { totalMatches: number }
    expect(byCategory.totalMatches).toBe(1)
    const byExtension = await service.search(rootId, { extension: '.mp3' }) as { totalMatches: number }
    expect(byExtension.totalMatches).toBe(1)
  })

  it('uploads without overwriting and makes the file recent and searchable', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await service.scan(rootId, 'inbox')
    const uploaded = await service.upload(rootId, 'inbox', 'note.txt', Buffer.from('uploaded')) as {
      path: string
      name: string
    }
    expect(uploaded.name).toBe('note (1).txt')
    expect(await readFile(join(root, 'inbox', 'note (1).txt'), 'utf8')).toBe('uploaded')
    const recent = await service.recent(rootId, 10) as { entries: Array<{ path: string; indexed: boolean }> }
    expect(recent.entries[0]!.path).toBe('inbox/note (1).txt')
    expect(recent.entries[0]!.indexed).toBe(true)
    const search = await service.search(rootId, { query: 'note (1)' }) as { totalMatches: number }
    expect(search.totalMatches).toBe(1)
  })

  it('creates folders, copies files, and keeps renamed and moved files searchable', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await service.scan(rootId, '.')
    await service.fileOp(rootId, { op: 'mkdir', path: 'archive' })
    await service.fileOp(rootId, { op: 'copy', path: 'inbox/note.txt', targetPath: 'archive/copy.txt' })
    await service.fileOp(rootId, { op: 'rename', path: 'archive/copy.txt', targetPath: 'archive/renamed.txt' })
    await service.fileOp(rootId, { op: 'move', path: 'archive/renamed.txt', targetPath: 'inbox/moved.txt' })
    expect(await readFile(join(root, 'inbox/moved.txt'), 'utf8')).toBe('note')
    expect(await readFile(join(root, 'inbox/note.txt'), 'utf8')).toBe('note')
    expect(await service.search(rootId, { query: 'moved' })).toMatchObject({ totalMatches: 1 })
    expect(await service.search(rootId, { query: 'renamed' })).toMatchObject({ totalMatches: 0 })
  })

  it('persists recent uploads across service recreation and follows their new paths', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await service.upload(rootId, 'inbox', 'fresh.txt', Buffer.from('fresh'))
    await service.fileOp(rootId, { op: 'rename', path: 'inbox/fresh.txt', targetPath: 'inbox/renamed-fresh.txt' })
    const reopened = await FileManagerService.create({ roots: [root] })
    expect(await reopened.recent(rootId)).toMatchObject({ entries: [{ path: 'inbox/renamed-fresh.txt' }] })
  })

  it('rejects a conflicting trash restore and retains both the file and recovery record', async () => {
    const rootId = service.rootsInfo()[0]!.id
    const deleted = await service.fileOp(rootId, { op: 'delete', path: 'inbox/note.txt' })
    await writeFile(join(root, 'inbox/note.txt'), 'new file')
    await expect(service.fileOp(rootId, { op: 'restore', trashId: deleted.trashId })).rejects.toMatchObject({ code: 'TARGET_EXISTS' })
    expect(await readFile(join(root, 'inbox/note.txt'), 'utf8')).toBe('new file')
    expect(await service.trashList(rootId)).toMatchObject({ entries: [{ trashId: deleted.trashId }] })
  })

  it('validates and persists custom rules without moving files, then resets defaults', async () => {
    const rootId = service.rootsInfo()[0]!.id
    const custom = { version: 1, rules: [DEFAULT_RULES[0]!] }
    expect(await service.saveRules(rootId, custom)).toMatchObject({ source: 'user' })
    await expect(service.saveRules(rootId, { version: 1, rules: 'invalid' })).rejects.toThrow()
    expect(await service.rules(rootId)).toMatchObject({ source: 'user' })
    expect(await readFile(join(root, 'inbox/note.txt'), 'utf8')).toBe('note')
    expect(await service.resetRules(rootId)).toMatchObject({ source: 'default' })
  })

  it('exposes plan, operation history, and snapshot detail', async () => {
    const rootId = service.rootsInfo()[0]!.id
    await service.scan(rootId, 'inbox')
    const plan = await service.classify(rootId, 'inbox') as { planId: string }
    const organized = await service.organize(rootId, plan.planId, true) as { operationId: string; snapshotId: string }
    const detail = await service.planDetail(rootId, plan.planId) as { items: unknown[]; totalMatches: number }
    expect(detail.totalMatches).toBe(6)
    expect(detail.items).toHaveLength(6)
    const history = await service.operations(rootId, 10) as { operations: Array<{ operationId: string; movedCount: number }> }
    expect(history.operations[0]!.operationId).toBe(organized.operationId)
    expect(history.operations[0]!.movedCount).toBe(6)
    const operation = await service.operationDetail(rootId, organized.operationId) as { status: string }
    expect(operation.status).toBe('succeeded')
    const snapshot = await service.snapshotDetail(rootId, organized.snapshotId) as { fileCount: number; files: unknown[] }
    expect(snapshot.fileCount).toBe(6)
    expect(snapshot.files).toHaveLength(6)
  })
})
