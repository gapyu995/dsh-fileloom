import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileContent } from '../src/content.ts'
import { FileManagerService } from '../src/service.ts'

let directory: string
let service: FileManagerService
let rootId: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fileloom-content-'))
  service = await FileManagerService.create({ roots: [directory] })
  rootId = service.rootsInfo()[0]!.id
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

function request(path: string, headers: Record<string, string> = {}, method = 'GET'): Request {
  const url = new URL('http://localhost/api/file-manager/content')
  url.searchParams.set('rootId', rootId)
  url.searchParams.set('path', path)
  return new Request(url, { method, headers })
}

describe('root-checked streaming content', () => {
  it('streams text with MIME, sandbox and private-cache headers', async () => {
    await writeFile(join(directory, 'note.txt'), 'hello')
    const response = await fileContent(request('note.txt'), service)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toBe('hello')
  })

  it('serves HEAD and small ranges of a sparse movie larger than 64 MB', async () => {
    const size = 128 * 1024 * 1024
    const file = await open(join(directory, 'large.mp4'), 'w')
    try {
      await file.truncate(size)
      await file.write('head', 0)
      await file.write('tail', size - 4)
    } finally { await file.close() }
    const head = await fileContent(request('large.mp4', {}, 'HEAD'), service)
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
    expect(head.headers.get('content-length')).toBe(String(size))
    expect(head.headers.get('accept-ranges')).toBe('bytes')
    for (const [range, body, position] of [['bytes=0-3', 'head', `0-3/${size}`], ['bytes=-4', 'tail', `${size - 4}-${size - 1}/${size}`]]) {
      const response = await fileContent(request('large.mp4', { range: range! }), service)
      expect(response.status).toBe(206)
      expect(response.headers.get('content-length')).toBe('4')
      expect(response.headers.get('content-range')).toBe(`bytes ${position}`)
      expect(await response.text()).toBe(body)
    }
  })

  it('rejects unsatisfiable ranges without returning file bytes', async () => {
    await writeFile(join(directory, 'movie.webm'), 'video')
    const response = await fileContent(request('movie.webm', { range: 'bytes=500-' }), service)
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */5')
    expect(await response.text()).toBe('')
  })

  it('keeps the nonmedia preview limit and rejects directories and traversal', async () => {
    const file = await open(join(directory, 'large.txt'), 'w')
    try { await file.truncate(65 * 1024 * 1024) } finally { await file.close() }
    await mkdir(join(directory, 'folder'))
    await expect(fileContent(request('large.txt'), service)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
    await expect(fileContent(request('folder'), service)).rejects.toMatchObject({ code: 'NOT_FILE' })
    await expect(fileContent(request('../outside.txt'), service)).rejects.toMatchObject({ code: 'INVALID_PATH' })
  })
})
