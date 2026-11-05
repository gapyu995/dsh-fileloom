import { describe, expect, it } from 'vitest'
import { MusicSession } from '../shared/music-session.ts'
import type { Entry, FileApi } from '../shared/api.ts'

const track = (path: string): Entry => ({ path, name: path, kind: 'file', ext: '.wav', size: 42, mtimeMs: 1 })
const api = (entries: Entry[], rootPath = '/media'): FileApi => ({
  roots: async () => [{ id: 'current-root', name: 'Media', path: rootPath }], list: async () => entries,
  library: async rootId => ({ rootId, entries, scannedAt: new Date().toISOString(), truncated: false, incomplete: false }),
  contentUrl: (_rootId, path) => `/content/${path}`,
})

describe('persistent music session', () => {
  it('restores valid queue entries paused and rejects replaced files', async () => {
    const first = new MusicSession(true)
    const tracks = [track('one.wav'), track('two.wav')]
    first.update({ rootId: 'old-root', rootPath: '/media', queue: tracks, activePath: 'one.wav', volume: .4 })
    first.position(18, true)
    const restored = new MusicSession(true)
    await restored.restore(api([tracks[0]!, { ...tracks[1]!, mtimeMs: 2 }]), new AbortController().signal)
    expect(restored.getSnapshot()).toMatchObject({ rootId: 'current-root', queue: [tracks[0]], activePath: 'one.wav', position: 18, volume: .4, autoplay: false, playing: false })
  })
  it('does not restore a queue into a different root that reuses its id', async () => {
    const first = new MusicSession(true)
    first.update({ rootId: 'current-root', rootPath: '/old-media', queue: [track('one.wav')], activePath: 'one.wav' })
    const restored = new MusicSession(true)
    await restored.restore(api([track('one.wav')]), new AbortController().signal)
    expect(restored.getSnapshot().queue).toEqual([])
  })
  it('keeps queue changes when an asynchronous restore finishes later', async () => {
    const first = new MusicSession(true)
    first.update({ rootId: 'old-root', rootPath: '/media', queue: [track('old.wav')], activePath: 'old.wav' })
    const restored = new MusicSession(true)
    const restoring = restored.restore(api([track('old.wav')]), new AbortController().signal)
    restored.update({ queue: [track('new.wav')] })
    restored.activate('new.wav')
    await restoring
    expect(restored.getSnapshot().activePath).toBe('new.wav')
  })
  it('advances and repeats without the library view being mounted', () => {
    const session = new MusicSession()
    session.update({ queue: [track('one.wav'), track('two.wav')], activePath: 'one.wav', repeat: 'all' })
    session.next(true)
    expect(session.getSnapshot().activePath).toBe('two.wav')
    session.next(true)
    expect(session.getSnapshot().activePath).toBe('one.wav')
    session.clear()
    expect(session.getSnapshot().queue).toEqual([])
  })
})
