/** Presentation classification only; mutation and path authorization stay on the Host. */
import type { Entry } from './api.ts'
import type { DesktopKind } from './protocol.ts'

const extensions = {
  movies: new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v']),
  music: new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus']),
  photos: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif']),
}
const previewImages = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'])
const previewAudio = new Set(['.mp3', '.wav', '.flac', '.m4a'])
const previewVideo = new Set(['.mp4', '.webm'])
const previewText = new Set(['.txt', '.md', '.json', '.csv'])

export function selectEntries(entries: readonly Entry[], kind: DesktopKind, query: string, sort: 'name' | 'newest', locale: string): Entry[] {
  const needle = query.trim().toLocaleLowerCase(locale)
  return entries.filter(entry =>
    (entry.kind === 'directory' || kind === 'files' || extensions[kind].has(entry.ext.toLowerCase()))
    && entry.name.toLocaleLowerCase(locale).includes(needle),
  ).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return (sort === 'newest' ? b.mtimeMs - a.mtimeMs : 0) || a.name.localeCompare(b.name, locale, { numeric: true })
  })
}

export function previewKind(ext: string): 'image' | 'audio' | 'video' | 'text' | 'pdf' | 'none' {
  const value = ext.toLowerCase()
  if (previewImages.has(value)) return 'image'
  if (previewAudio.has(value)) return 'audio'
  if (previewVideo.has(value)) return 'video'
  if (previewText.has(value)) return 'text'
  return value === '.pdf' ? 'pdf' : 'none'
}

export function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '.' : path.slice(0, index)
}

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`
  return `${(size / 1024 ** 3).toFixed(1)} GB`
}
