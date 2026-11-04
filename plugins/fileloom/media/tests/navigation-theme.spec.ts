// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { followDesktopTheme } from '../shared/navigation-theme.ts'

function harness(initial: string | null = null) {
  let activePanelId = initial
  const listeners = new Set<() => void>()
  const layers = new Map<string, Record<string, { light: string; dark: string }>>()
  const disposers: Array<() => void> = []
  const overrideTokens = vi.fn((source: string, tokens: Record<string, { light: string; dark: string }>) => {
    layers.set(source, tokens)
    return () => { if (layers.get(source) === tokens) layers.delete(source) }
  })
  const ctx = {
    effect: (callback: () => () => void) => { disposers.push(callback()) },
    layout: { panelInfo: { getSnapshot: () => ({ activePanelId }), subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } } },
    theme: { overrideTokens },
  }
  return { ctx, layers, listeners, disposers, overrideTokens, select: (id: string | null) => { activePanelId = id; for (const listener of listeners) listener() } }
}

describe('active desktop navigation colors', () => {
  it('mounts cinema colors only while movies are selected and restores the underlying theme', () => {
    const state = harness()
    followDesktopTheme(state.ctx, 'movies')
    expect(state.layers.size).toBe(0)
    state.select('fileloom-movies')
    expect(state.layers.get('@fileloom/desktop-movies')?.['--dsw-specific-sidebar-fill']).toEqual({ light: '#181818', dark: '#181818' })
    expect(state.layers.get('@fileloom/desktop-movies')?.['--dsw-alias-label-primary']).toEqual({ light: '#fafafa', dark: '#fafafa' })
    state.select('fileloom-movies')
    expect(state.overrideTokens).toHaveBeenCalledTimes(1)
    state.select('steward')
    expect(state.layers.size).toBe(0)
  })
  it('has exactly one layer across transitions and releases listeners and colors on unload', () => {
    const state = harness('fileloom-movies')
    for (const kind of ['movies', 'photos', 'music', 'files'] as const) followDesktopTheme(state.ctx, kind)
    for (const kind of ['photos', 'music', 'files', 'movies']) {
      state.select(`fileloom-${kind}`)
      expect([...state.layers.keys()]).toEqual([`@fileloom/desktop-${kind}`])
    }
    for (const dispose of state.disposers.reverse()) dispose()
    expect(state.layers.size).toBe(0)
    expect(state.listeners.size).toBe(0)
  })
  it('uses both system color schemes for noncinema desktops without rewriting text tokens', () => {
    const state = harness('fileloom-photos')
    followDesktopTheme(state.ctx, 'photos')
    expect(state.layers.get('@fileloom/desktop-photos')).toEqual({ '--dsw-specific-sidebar-fill': { light: '#f6f7f9', dark: '#1b1c1f' } })
    state.select(null)
    expect(state.layers.size).toBe(0)
  })
  it('removes its subscriber if activation fails', () => {
    const state = harness('fileloom-movies')
    state.overrideTokens.mockImplementation(() => { throw new Error('Theme unavailable') })
    expect(() => followDesktopTheme(state.ctx, 'movies')).toThrow('Theme unavailable')
    expect(state.listeners.size).toBe(0)
  })
})
