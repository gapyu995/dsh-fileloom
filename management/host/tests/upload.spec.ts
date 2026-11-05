import { describe, expect, it, vi } from 'vitest'
import { readUploadBody } from '../src/upload.ts'

describe('bounded streaming uploads', () => {
  it('reads a body exactly at the configured byte limit', async () => {
    const request = new Request('http://localhost/upload', { method: 'POST', body: 'hello' })
    expect((await readUploadBody(request, 5)).toString()).toBe('hello')
    expect(request.body?.locked).toBe(false)
  })
  it('rejects an oversized body without trusting a Content-Length header', async () => {
    const request = new Request('http://localhost/upload', { method: 'POST', body: 'hello!' })
    await expect(readUploadBody(request, 5)).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' })
    expect(request.body?.locked).toBe(false)
  })
  it('cancels an overflowing producer and releases its reader', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(4)) },
      cancel,
    })
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', body: stream, duplex: 'half' }
    const request = new Request('http://localhost/upload', init)
    await expect(readUploadBody(request, 5)).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })
})
