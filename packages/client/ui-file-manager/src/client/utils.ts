/** Formatting and small per-browser preferences for the Data Steward panel. */

export interface OpenedFile {
  readonly path: string
  readonly name: string
  readonly at: string
}

const PREFIX = 'data-steward.'
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico'])
const AUDIO = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'])
const VIDEO = new Set(['.mp4', '.webm', '.mkv', '.mov'])
const TEXT = new Set(['.txt', '.md', '.json', '.csv', '.log', '.xml', '.yml', '.yaml', '.js', '.ts', '.tsx', '.py', '.go', '.rs', '.html', '.css', '.ini', '.toml', '.conf'])

export function fileKind(ext: string): 'image' | 'audio' | 'video' | 'text' | 'pdf' | 'other' {
  const value = ext.toLowerCase()
  if (IMAGE.has(value)) return 'image'
  if (AUDIO.has(value)) return 'audio'
  if (VIDEO.has(value)) return 'video'
  if (TEXT.has(value)) return 'text'
  if (value === '.pdf') return 'pdf'
  return 'other'
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1 }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function formatDate(value: number | string): string {
  const parsed = typeof value === 'number' ? value : Date.parse(value)
  if (Number.isNaN(parsed)) return '-'
  return new Date(parsed).toLocaleString()
}

/** Browser-locale relative time; falls back to the absolute date. */
export function relativeTime(value: number | string): string {
  const parsed = typeof value === 'number' ? value : Date.parse(value)
  if (Number.isNaN(parsed)) return '-'
  const seconds = Math.round((parsed - Date.now()) / 1000)
  const absolute = Math.abs(seconds)
  try {
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    if (absolute < 60) return formatter.format(seconds, 'second')
    if (absolute < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
    if (absolute < 86_400) return formatter.format(Math.round(seconds / 3600), 'hour')
    if (absolute < 604_800) return formatter.format(Math.round(seconds / 86_400), 'day')
  } catch {
    // Intl is unavailable in some embedded webviews; use the absolute date.
  }
  return new Date(parsed).toLocaleDateString()
}

export function dirname(path: string): string {
  if (path === '.' || path === '') return '.'
  const index = path.lastIndexOf('/')
  return index <= 0 ? '.' : path.slice(0, index)
}

export function basename(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? path : path.slice(index + 1)
}

export function joinPath(base: string, name: string): string {
  return base === '.' || base === '' ? name : `${base}/${name}`
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try { window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value)) } catch { /* storage may be unavailable */ }
}

export function loadOpened(rootId: string): OpenedFile[] {
  const value = readJson<OpenedFile[]>(`opened.${rootId}`, [])
  return Array.isArray(value)
    ? value.filter(item => typeof item.path === 'string' && typeof item.name === 'string' && typeof item.at === 'string')
    : []
}

export function recordOpened(rootId: string, path: string, name: string): void {
  const next = [{ path, name, at: new Date().toISOString() }, ...loadOpened(rootId).filter(item => item.path !== path)].slice(0, 12)
  writeJson(`opened.${rootId}`, next)
}

export function loadLastPath(rootId: string): string {
  const value = readJson<string>(`lastPath.${rootId}`, '.')
  return typeof value === 'string' ? value : '.'
}

export function saveLastPath(rootId: string, path: string): void { writeJson(`lastPath.${rootId}`, path) }

export function loadSeenAt(rootId: string): string {
  const value = readJson<string>(`seen.${rootId}`, '')
  return typeof value === 'string' ? value : ''
}

export function markSeen(rootId: string, timestamp: string): void { writeJson(`seen.${rootId}`, timestamp) }

export function countUnseen(entries: ReadonlyArray<{ ingestedAt: string }>, seenAt: string): number {
  if (seenAt === '') return entries.length
  return entries.filter(entry => entry.ingestedAt > seenAt).length
}
