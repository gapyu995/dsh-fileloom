import { describe, expect, it } from 'vitest'
import { parentPath, previewKind, selectEntries } from '../shared/files.ts'
import type { Entry } from '../shared/api.ts'

export function file(name: string, kind: Entry['kind'] = 'file', mtimeMs = 1): Entry {
  return { path: name, name, ext: name.includes('.') ? name.slice(name.lastIndexOf('.')) : '', kind, size: 128, mtimeMs }
}

describe('desktop classification', () => {
  const entries = [file('Album', 'directory'), file('movie.MP4'), file('song.mp3'), file('photo.jpg'), file('notes.txt')]
  it.each([
    ['movies', ['Album', 'movie.MP4']], ['music', ['Album', 'song.mp3']],
    ['photos', ['Album', 'photo.jpg']], ['files', ['Album', 'movie.MP4', 'notes.txt', 'photo.jpg', 'song.mp3']],
  ] as const)('filters %s without hiding navigable folders', (kind, expected) => {
    expect(selectEntries(entries, kind, '', 'name', 'en').map(entry => entry.name)).toEqual(expected)
  })
  it('filters the current folder and sorts by date while keeping folders first', () => {
    expect(selectEntries([file('a.mp3', 'file', 2), file('b.mp3', 'file', 4), file('C', 'directory')], 'music', '', 'newest', 'en').map(entry => entry.name)).toEqual(['C', 'b.mp3', 'a.mp3'])
    expect(selectEntries(entries, 'files', ' MOVIE ', 'name', 'en').map(entry => entry.name)).toEqual(['movie.MP4'])
  })
  it('does not promise playback for formats without a Host MIME mapping', () => {
    expect(previewKind('.mkv')).toBe('none')
    expect(previewKind('.ogg')).toBe('none')
    expect(previewKind('.MP4')).toBe('video')
    expect(previewKind('.mp3')).toBe('audio')
    expect(previewKind('.jpg')).toBe('image')
  })
  it('navigates root and nested folder parents', () => {
    expect(parentPath('.')).toBe('.')
    expect(parentPath('Music')).toBe('.')
    expect(parentPath('Music/Live')).toBe('Music')
  })
})
