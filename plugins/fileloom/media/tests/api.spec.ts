import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileApi } from '../shared/api.ts'

afterEach(() => vi.unstubAllGlobals())

describe('read-only file API', () => {
  const api = createFileApi('https://files.example')
  it('encodes paths and sends same-origin credentials and cancellation', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ rootId: 'root', path: 'a & b', entries: [] }))
    vi.stubGlobal('fetch', request)
    const controller = new AbortController()
    await expect(api.list('root', 'a & b', controller.signal)).resolves.toEqual([])
    const [url, init] = request.mock.calls[0]!
    expect(url.origin).toBe('https://files.example')
    expect(url.searchParams.get('path')).toBe('a & b')
    expect(init).toEqual({ credentials: 'same-origin', signal: controller.signal })
    expect(new URL(api.contentUrl('r#', 'a & b/photo.png')).searchParams.get('path')).toBe('a & b/photo.png')
  })
  it.each([401, 403])('categorizes HTTP %i without leaking server diagnostics', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'private path' }, { status })))
    await expect(api.roots(new AbortController().signal)).rejects.toMatchObject({ code: 'unauthorized', status, message: 'unauthorized' })
  })
  it('rejects malformed JSON and malformed entries rather than rendering untrusted values', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('not json')).mockResolvedValueOnce(Response.json({ roots: [{ id: 12 }] }))
      .mockResolvedValueOnce(Response.json({ rootId: 'root', path: '.', entries: [{ size: -4 }] }))
    vi.stubGlobal('fetch', request)
    const signal = new AbortController().signal
    await expect(api.roots(signal)).rejects.toMatchObject({ code: 'invalidResponse' })
    await expect(api.roots(signal)).rejects.toMatchObject({ code: 'invalidResponse' })
    await expect(api.list('root', '.', signal)).rejects.toMatchObject({ code: 'invalidResponse' })
  })
  it('rejects a response for a different root or folder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ rootId: 'other', path: '.', entries: [] })))
    await expect(api.list('root', '.', new AbortController().signal)).rejects.toMatchObject({ code: 'invalidResponse' })
  })
  it('distinguishes network failures and preserves cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(api.roots(new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' })
    const controller = new AbortController()
    controller.abort()
    await expect(api.roots(controller.signal)).rejects.toThrow('offline')
  })
})
