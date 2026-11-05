/** Bounded browser thumbnails; originals stay behind the authenticated content API. */
import type { Entry } from './api.ts'
import { fileIdentity } from './media.ts'

const CACHE = 'fileloom.thumbnails.v1'
const MAX_ITEMS = 256
const EDGE = 480
const pending = new Map<string, Promise<Blob>>()
const waiting: Array<() => void> = []
let running = 0

async function limited<T>(run: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>(resolve => waiting.push(resolve))
  else running++
  try { return await run() }
  finally {
    const next = waiting.shift()
    if (next) next()
    else running--
  }
}

export function supportsThumbnails(entry: Entry): boolean {
  return ['.jpg', '.jpeg', '.png', '.webp', '.bmp'].includes(entry.ext.toLowerCase()) && typeof createImageBitmap === 'function' && typeof caches !== 'undefined'
}

export async function thumbnail(url: string, entry: Entry): Promise<Blob> {
  const key = new URL(url, location.href)
  if (key.origin !== location.origin) throw new Error('Thumbnail source must be same-origin')
  key.searchParams.set('fileloom-thumbnail', fileIdentity(entry))
  const identity = key.href
  const existing = pending.get(identity)
  if (existing) return existing
  const task = limited(async () => {
    let cache: Cache | undefined
    try {
      cache = await caches.open(CACHE)
      const saved = await cache.match(identity)
      if (saved) return await saved.blob()
    } catch (_cacheUnavailable) { /* Private browsing may disable persistent caches. */ }
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) throw new Error(`Thumbnail source: ${response.status}`)
    const bitmap = await createImageBitmap(await response.blob())
    let blob: Blob
    try {
      const scale = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is unavailable')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Thumbnail encoding failed')), 'image/webp', .8))
    } finally { bitmap.close() }
    if (cache) {
      try {
        const keys = await cache.keys()
        for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ITEMS + 1))) await cache.delete(key)
        await cache.put(identity, new Response(blob, { headers: { 'content-type': blob.type } }))
      } catch (_cacheFull) { /* A thumbnail remains usable without persistence. */ }
    }
    return blob
  })
  pending.set(identity, task)
  try { return await task } finally { pending.delete(identity) }
}
