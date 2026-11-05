/** File-derived display values only; no title, album, or capture-date metadata is inferred. */
import type { Entry } from './api.ts'
import { PREVIEW_LIMIT } from './api.ts'
import { previewKind } from './files.ts'

export function titleOf(entry: Entry): string {
  return entry.ext !== '' && entry.name.toLowerCase().endsWith(entry.ext.toLowerCase())
    ? entry.name.slice(0, -entry.ext.length) : entry.name
}

export function artworkLookup(entries: readonly Entry[]): (entry: Entry) => Entry | undefined {
  const images = new Map<string, Entry>()
  for (const candidate of entries) {
    if (candidate.kind !== 'file' || candidate.size > PREVIEW_LIMIT || !['.jpg', '.jpeg', '.png', '.webp'].includes(candidate.ext.toLowerCase())) continue
    const stem = candidate.path.slice(0, -candidate.ext.length).toLowerCase()
    if (!images.has(stem)) images.set(stem, candidate)
  }
  return entry => images.get(entry.path.slice(0, -entry.ext.length).toLowerCase())
}

export function musicArtworkLookup(entries: readonly Entry[]): (entry: Entry) => Entry | undefined {
  const sidecar = artworkLookup(entries)
  const covers = new Map<string, Entry>()
  for (const entry of entries) {
    if (entry.kind !== 'file' || entry.size > PREVIEW_LIMIT || !['.jpg', '.jpeg', '.png', '.webp'].includes(entry.ext.toLowerCase())) continue
    if (titleOf(entry).toLowerCase() === 'cover') {
      const folder = entry.path.slice(0, entry.path.lastIndexOf('/') + 1).toLowerCase()
      if (!covers.has(folder)) covers.set(folder, entry)
    }
  }
  return entry => sidecar(entry) ?? covers.get(entry.path.slice(0, entry.path.lastIndexOf('/') + 1).toLowerCase())
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

export function photoGroupKey(time: number, unit: 'month' | 'year'): string {
  const date = new Date(time)
  const year = date.getFullYear()
  return unit === 'year' ? String(year) : `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function groupPhotos(entries: readonly Entry[], unit: 'month' | 'year', locale: string) {
  const groups = new Map<string, { key: string; title: string; entries: Entry[] }>()
  for (const entry of entries) {
    const date = new Date(entry.mtimeMs)
    const key = photoGroupKey(entry.mtimeMs, unit)
    let group = groups.get(key)
    if (group === undefined) {
      group = { key, title: date.toLocaleDateString(locale, unit === 'year' ? { year: 'numeric' } : { year: 'numeric', month: 'long' }), entries: [] }
      groups.set(key, group)
    }
    group.entries.push(entry)
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key))
}
