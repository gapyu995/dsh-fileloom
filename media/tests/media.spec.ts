import { describe, expect, it } from 'vitest'
import { artworkLookup, fileIdentity, groupPhotos, playable, timeLabel, titleOf } from '../shared/media.ts'
import type { Entry } from '../shared/api.ts'
import { PREVIEW_LIMIT } from '../shared/api.ts'

function entry(path: string, mtimeMs = 10): Entry { return { path, name: path.split('/').at(-1)!, size: 10, mtimeMs, kind: 'file', ext: path.slice(path.lastIndexOf('.')) } }

describe('file-derived media', () => {
  it('uses only matching real image sidecars, not an unrelated poster', () => {
    const video = entry('Movies/trip.mp4')
    const sidecar = entry('Movies/TRIP.jpg')
    expect(artworkLookup([entry('Other/trip.jpg'), entry('Movies/poster.jpg'), sidecar, entry('Movies/trip.png')])(video)).toBe(sidecar)
    expect(artworkLookup([{ ...sidecar, size: PREVIEW_LIMIT + 1 }])(video)).toBeUndefined()
  })
  it('groups photos by modification month and year, independent of input order', () => {
    const files = [entry('c.jpg', new Date(2025, 2, 3).getTime()), entry('a.jpg', new Date(2026, 0, 2).getTime()), entry('b.jpg', new Date(2026, 0, 7).getTime())]
    expect(groupPhotos(files, 'month', 'en').map(group => [group.key, group.entries.length])).toEqual([['2026-01', 2], ['2025-03', 1]])
    expect(groupPhotos(files, 'year', 'zh-CN').map(group => group.key)).toEqual(['2026', '2025'])
  })
  it('keeps filenames honest and distinguishes replacements', () => {
    const video = entry('trip.mp4')
    expect(titleOf(video)).toBe('trip')
    expect(fileIdentity(video)).not.toBe(fileIdentity({ ...video, mtimeMs: 20 }))
    expect(fileIdentity(video)).not.toBe(fileIdentity({ ...video, size: 30 }))
    expect(playable({ ...video, size: PREVIEW_LIMIT + 1 })).toBe(true)
    expect(playable(entry('movie.mkv'))).toBe(false)
  })
  it('formats finite playback times without making NaN visible', () => {
    expect(timeLabel(3723)).toBe('1:02:03')
    expect(timeLabel(123)).toBe('2:03')
    expect(timeLabel(NaN)).toBe('0:00')
    expect(timeLabel(-1)).toBe('0:00')
  })
})
