/** File-derived display values only; no title, album, or capture-date metadata is inferred. */
import type { Entry } from './api.ts'
import { PREVIEW_LIMIT } from './api.ts'
import { previewKind } from './files.ts'

export function titleOf(entry: Entry): string {
  return entry.ext !== '' && entry.name.toLowerCase().endsWith(entry.ext.toLowerCase())
    ? entry.name.slice(0, -entry.ext.length) : entry.name
}

export function artworkOf(entry: Entry, entries: readonly Entry[]): Entry | undefined {
  const stem = entry.path.slice(0, -entry.ext.length).toLowerCase()
  return entries.find(candidate => candidate.kind === 'file' && candidate.size <= PREVIEW_LIMIT
    && ['.jpg', '.jpeg', '.png', '.webp'].includes(candidate.ext.toLowerCase())
    && candidate.path.slice(0, -candidate.ext.length).toLowerCase() === stem)
}

export function playable(entry: Entry): boolean {
  return ['audio', 'video'].includes(previewKind(entry.ext))
}

export function fileIdentity(entry: Entry): string { return JSON.stringify([entry.path, entry.size, entry.mtimeMs]) }

export function timeLabel(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor(value / 60) % 60
  return `${hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}` : Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function groupPhotos(entries: readonly Entry[], unit: 'month' | 'year', locale: string) {
  const groups = new Map<string, { key: string; title: string; entries: Entry[] }>()
  for (const entry of entries) {
    const date = new Date(entry.mtimeMs)
    const year = date.getFullYear()
    const key = unit === 'year' ? String(year) : `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`
    let group = groups.get(key)
    if (group === undefined) {
      group = { key, title: date.toLocaleDateString(locale, unit === 'year' ? { year: 'numeric' } : { year: 'numeric', month: 'long' }), entries: [] }
      groups.set(key, group)
    }
    group.entries.push(entry)
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key))
}
