/** One plugin-owned playback session outlives main-panel and folder navigation. */
import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import type { Entry, FileApi } from './api.ts'
import { fileIdentity, musicArtworkLookup, playable } from './media.ts'

const entry = z.object({ path: z.string(), name: z.string(), ext: z.string(), kind: z.literal('file'), size: z.number().finite().nonnegative(), mtimeMs: z.number().finite() })
const savedSession = z.object({
  version: z.literal(1), rootId: z.string(), rootPath: z.string(), queue: z.array(entry).max(500), activePath: z.string().nullable(),
  shuffle: z.boolean(), repeat: z.enum(['off', 'all', 'one']), volume: z.number().min(0).max(1), muted: z.boolean(), position: z.number().finite().nonnegative(),
})

export interface MusicState {
  rootId: string; rootPath: string; queue: Entry[]; activePath: string | null; playbackSerial: number
  covers: Record<string, Entry>; shuffle: boolean; repeat: 'off' | 'all' | 'one'; volume: number; muted: boolean
  playing: boolean; autoplay: boolean; position: number; warning: boolean
}

const empty = (): MusicState => ({ rootId: '', rootPath: '', queue: [], activePath: null, playbackSerial: 0, covers: {}, shuffle: false, repeat: 'off', volume: 1, muted: false, playing: false, autoplay: false, position: 0, warning: false })
const KEY = 'fileloom.music.session.v1'

export class MusicSession {
  private state = empty()
  private readonly listeners = new Set<() => void>()
  private lastSavedPosition = 0
  constructor(private readonly persistent = false) {}
  getSnapshot = (): MusicState => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  update(patch: Partial<MusicState>, save = true): void {
    this.state = { ...this.state, ...patch }
    if (save && this.persistent) {
      try { localStorage.setItem(KEY, JSON.stringify({ ...this.state, version: 1, queue: this.state.queue.slice(0, 500), covers: undefined })); this.state.warning = false }
      catch (_storageUnavailable) { this.state.warning = true }
    }
    for (const listener of this.listeners) listener()
  }

  activate(path: string): void {
    this.update({ activePath: path, playbackSerial: this.state.playbackSerial + 1, position: 0, autoplay: true, playing: false })
  }

  next(ended = false): void {
    const { queue, activePath, shuffle, repeat } = this.state
    const index = queue.findIndex(item => item.path === activePath)
    const candidates = queue.filter(item => item.path !== activePath)
    const next = shuffle && candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)]
      : queue[index + 1] ?? (repeat === 'all' ? queue[0] : undefined)
    if (next !== undefined) this.activate(next.path)
    else if (ended) this.update({ playing: false, position: 0, autoplay: false })
  }

  position(position: number, force = false): void {
    if (!Number.isFinite(position) || position < 0) return
    if (force || Math.abs(position - this.lastSavedPosition) >= 5) {
      this.lastSavedPosition = position
      this.update({ position })
    }
  }

  async restore(api: FileApi, signal: AbortSignal): Promise<void> {
    if (!this.persistent) return
    try {
      const raw = localStorage.getItem(KEY)
      if (raw === null) return
      const parsed = savedSession.safeParse(JSON.parse(raw))
      if (!parsed.success) { this.update({ warning: true }, false); return }
      const saved = parsed.data
      const roots = await api.roots(signal)
      const root = roots.find(root => root.path === saved.rootPath)
      if (root === undefined) return
      const library = await api.library(root.id, signal)
      if (signal.aborted || this.state.playbackSerial !== 0 || this.state.queue.length > 0) return
      const current = new Map(library.entries.map(item => [fileIdentity(item), item]))
      const queue = saved.queue.filter(item => playable(item) && current.has(fileIdentity(item)))
      const artwork = musicArtworkLookup(library.entries)
      const covers = Object.fromEntries(queue.flatMap(track => { const cover = artwork(track); return cover ? [[track.path, cover]] : [] }))
      this.update({ ...saved, rootId: root.id, queue, covers, activePath: queue.some(item => item.path === saved.activePath) ? saved.activePath : null, autoplay: false, playing: false }, false)
    } catch (_unavailableSession) {
      if (!signal.aborted) this.update({ warning: true }, false)
    }
  }

  clear(): void { this.update({ queue: [], activePath: null, playing: false, autoplay: false, position: 0 }) }
}

export function useMusicSession(session: MusicSession): MusicState {
  return useSyncExternalStore(session.subscribe, session.getSnapshot)
}
