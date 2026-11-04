import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerFileManagerApi } from '../src/api.ts'
import { FileManagerService } from '../src/service.ts'

let root: string
let service: FileManagerService

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'steward-api-'))
  service = await FileManagerService.create({ roots: [root] })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('file manager API routes', () => {
  it('registers every exact route once and merges methods per path', () => {
    const routes: Array<{ path: string; methods: readonly string[] }> = []
    const ctx = {
      effect: (callback: () => () => void) => callback(),
      connection: {
        fetch: {
          register: (route: { path: string; methods: readonly string[] }) => {
            if (routes.some(existing => existing.path === route.path)) {
              throw new Error(`duplicate route ${route.path}`)
            }
            routes.push(route)
            return () => {}
          },
        },
      },
    }
    expect(() => registerFileManagerApi(ctx as never, service)).not.toThrow()
    expect(routes.map(route => route.path).sort()).toEqual([
      '/api/file-manager/classify',
      '/api/file-manager/content',
      '/api/file-manager/index',
      '/api/file-manager/list',
      '/api/file-manager/operation',
      '/api/file-manager/operations',
      '/api/file-manager/organize',
      '/api/file-manager/plan',
      '/api/file-manager/recent',
      '/api/file-manager/rollback',
      '/api/file-manager/roots',
      '/api/file-manager/rules',
      '/api/file-manager/rules/reset',
      '/api/file-manager/scan',
      '/api/file-manager/search',
      '/api/file-manager/snapshot',
      '/api/file-manager/snapshots',
      '/api/file-manager/stat',
      '/api/file-manager/trash',
      '/api/file-manager/upload',
    ].sort())
    expect(routes.find(route => route.path === '/api/file-manager/rules')?.methods).toEqual(['GET', 'POST'])
    expect(routes.find(route => route.path === '/api/file-manager/content')?.methods).toEqual(['GET', 'HEAD'])
    expect(routes.find(route => route.path === '/api/file-manager/operation')?.methods).toEqual(['GET', 'POST'])
    expect(routes.find(route => route.path === '/api/file-manager/snapshot')?.methods).toEqual(['GET', 'POST'])
  })
})
