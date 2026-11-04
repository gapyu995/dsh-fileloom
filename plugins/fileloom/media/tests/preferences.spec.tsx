import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLibraryPreferences } from '../shared/preferences.ts'
import type { Entry } from '../shared/api.ts'

const movie: Entry = { path: 'trip.mp4', name: 'trip.mp4', size: 100, mtimeMs: 10, ext: '.mp4', kind: 'file' }
afterEach(cleanup)

describe('browser-local library preferences', () => {
  it('persists favorites per data root and media kind', () => {
    const first = renderHook(() => useLibraryPreferences('a', 'photos'))
    act(() => first.result.current.toggle(['photo.jpg']))
    first.unmount()
    const restored = renderHook(() => useLibraryPreferences('a', 'photos'))
    const other = renderHook(() => useLibraryPreferences('b', 'photos'))
    const movieList = renderHook(() => useLibraryPreferences('a', 'movies'))
    expect(restored.result.current.saved).toEqual(['photo.jpg'])
    expect(other.result.current.saved).toEqual([])
    expect(movieList.result.current.saved).toEqual([])
  })
  it('does not reuse a resume point for a replaced file and clears completed videos', () => {
    const { result } = renderHook(() => useLibraryPreferences('a', 'movies'))
    act(() => result.current.saveProgress(movie, 30, 120))
    expect(result.current.progress(movie)?.position).toBe(30)
    expect(result.current.progress({ ...movie, mtimeMs: 20 })).toBeUndefined()
    act(() => result.current.saveProgress(movie, 120, 120))
    expect(result.current.progress(movie)).toBeUndefined()
    act(() => result.current.saveProgress(movie, NaN, Infinity))
    expect(result.current.progress(movie)).toBeUndefined()
  })
  it('reports malformed stored data without accepting unvalidated values', () => {
    localStorage.setItem('fileloom.media.v1.photos.a', JSON.stringify({ version: 1, saved: [12], progress: [] }))
    const { result } = renderHook(() => useLibraryPreferences('a', 'photos'))
    expect(result.current.saved).toEqual([])
    expect(result.current.warning).toBe('preferencesInvalid')
    act(() => result.current.toggle(['valid.jpg']))
    expect(result.current.warning).toBeNull()
    expect(JSON.parse(localStorage.getItem('fileloom.media.v1.photos.a')!).saved).toEqual(['valid.jpg'])
  })
  it('keeps in-memory choices and visibly reports a failed storage write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage blocked', 'SecurityError') })
    const { result } = renderHook(() => useLibraryPreferences('a', 'photos'))
    act(() => result.current.toggle(['photo.jpg']))
    expect(result.current.saved).toEqual(['photo.jpg'])
    expect(result.current.warning).toBe('storageWarning')
  })
  it('applies bulk favorites as one set, then removes an entirely saved selection', () => {
    const { result } = renderHook(() => useLibraryPreferences('a', 'photos'))
    act(() => result.current.toggle(['one.jpg']))
    act(() => result.current.toggle(['one.jpg', 'two.jpg']))
    expect(result.current.saved).toEqual(['one.jpg', 'two.jpg'])
    act(() => result.current.toggle(['one.jpg', 'two.jpg']))
    expect(result.current.saved).toEqual([])
  })
})
