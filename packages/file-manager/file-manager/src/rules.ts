/** Declarative classification rules, validation, matching, and target templating. */

import { StewardError, type CompiledRule, type FileEntry, type Rule } from './types.ts'

const VIDEO = ['.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.m2ts', '.mpg', '.mpeg']
const MUSIC = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.wma', '.ape', '.aiff']
const PHOTO = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw', '.dng']
const ARCHIVE = ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.iso', '.cab', '.lz', '.lz4', '.zst']
const DOCUMENT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.rtf', '.epub', '.mobi', '.odt', '.ods', '.odp']

export const DEFAULT_RULES: readonly Rule[] = Object.freeze([
  {
    id: 'screenshot', category: 'photo', label: '截图', priority: 120,
    extensions: PHOTO, namePattern: '^(screenshot|screen shot|截屏|屏幕截图)',
    target: 'Media/Photos/Screenshots/{year}/{stem}{ext}',
  },
  { id: 'video', category: 'video', label: '视频', priority: 100, extensions: VIDEO, target: 'Media/Videos/{year}/{stem}{ext}' },
  { id: 'music', category: 'music', label: '音乐', priority: 100, extensions: MUSIC, target: 'Media/Music/{year}/{stem}{ext}' },
  { id: 'photo', category: 'photo', label: '照片', priority: 100, extensions: PHOTO, target: 'Media/Photos/{year}/{stem}{ext}' },
  { id: 'archive', category: 'archive', label: '压缩包', priority: 90, extensions: ARCHIVE, target: 'Archives/{stem}{ext}' },
  { id: 'document', category: 'document', label: '文档', priority: 80, extensions: DOCUMENT, target: 'Documents/{year}/{stem}{ext}' },
  { id: 'other', category: 'other', label: '其他', priority: -1000, target: 'Other/{stem}{ext}' },
])

const TEMPLATE_VARS = new Set(['year', 'month', 'day', 'stem', 'ext', 'name', 'category'])
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** Validate and compile a rule set. Throws a StewardError with a precise message. */
export function compileRules(input: unknown): CompiledRule[] {
  if (input === null || typeof input !== 'object') throw new StewardError('RULES_INVALID', 'rules file must be an object')
  const document = input as { version?: unknown; rules?: unknown }
  if (document.version !== 1) throw new StewardError('RULES_INVALID', 'rules.version must be 1')
  if (!Array.isArray(document.rules) || document.rules.length === 0) {
    throw new StewardError('RULES_INVALID', 'rules.rules must be a non-empty array')
  }
  const seen = new Set<string>()
  const rules: CompiledRule[] = []
  const array = document.rules as unknown[]
  for (const [index, value] of array.entries()) {
    if (value === null || typeof value !== 'object') throw new StewardError('RULES_INVALID', `rules[${index}] must be an object`)
    const rule = value as Record<string, unknown>
    const id = rule.id
    if (typeof id !== 'string' || id.trim() === '') throw new StewardError('RULES_INVALID', `rules[${index}].id must be a non-empty string`)
    if (seen.has(id)) throw new StewardError('RULES_INVALID', `duplicate rule id: ${id}`)
    seen.add(id)
    if (rule.category !== undefined && typeof rule.category !== 'string') throw new StewardError('RULES_INVALID', `${id}.category must be a string`)
    if (rule.label !== undefined && typeof rule.label !== 'string') throw new StewardError('RULES_INVALID', `${id}.label must be a string`)
    if (!Number.isInteger(rule.priority)) throw new StewardError('RULES_INVALID', `${id}.priority must be an integer`)
    if (!Array.isArray(rule.extensions) && rule.namePattern === undefined && rule.minSize === undefined && rule.maxSize === undefined && id !== 'other') {
      throw new StewardError('RULES_INVALID', `${id} needs at least one matcher`)
    }
    if (rule.extensions !== undefined) {
      if (!Array.isArray(rule.extensions) || rule.extensions.some(ext => typeof ext !== 'string' || !ext.startsWith('.'))) {
        throw new StewardError('RULES_INVALID', `${id}.extensions must be an array of dotted extensions`)
      }
    }
    if (rule.minSize !== undefined && (typeof rule.minSize !== 'number' || rule.minSize < 0)) throw new StewardError('RULES_INVALID', `${id}.minSize must be a non-negative number`)
    if (rule.maxSize !== undefined && (typeof rule.maxSize !== 'number' || rule.maxSize < 0)) throw new StewardError('RULES_INVALID', `${id}.maxSize must be a non-negative number`)
    if (rule.minSize !== undefined && rule.maxSize !== undefined && rule.minSize > rule.maxSize) throw new StewardError('RULES_INVALID', `${id}.minSize must not exceed maxSize`)
    if (typeof rule.target !== 'string') throw new StewardError('RULES_INVALID', `${id}.target must be a relative template`)
    if (rule.target.startsWith('/') || /^[A-Za-z]:/.test(rule.target) || rule.target.split('/').includes('..')) {
      throw new StewardError('RULES_INVALID', `${id}.target must stay inside the data root`)
    }
    for (const match of rule.target.matchAll(/\{([^}]+)\}/g)) {
      const variable = match[1] ?? ''
      if (!TEMPLATE_VARS.has(variable)) throw new StewardError('RULES_INVALID', `${id}.target has unknown variable {${variable}}`)
    }
    let regex: RegExp | undefined
    if (rule.namePattern !== undefined) {
      if (typeof rule.namePattern !== 'string') throw new StewardError('RULES_INVALID', `${id}.namePattern must be a string`)
      try {
        regex = new RegExp(rule.namePattern, 'i')
      } catch {
        throw new StewardError('RULES_INVALID', `${id}.namePattern is not a valid regular expression`)
      }
    }
    rules.push({
      id,
      category: typeof rule.category === 'string' && rule.category !== '' ? rule.category : id,
      label: typeof rule.label === 'string' && rule.label !== '' ? rule.label : id,
      priority: rule.priority as number,
      ...(rule.extensions === undefined ? {} : { extensions: (rule.extensions as string[]).map(ext => ext.toLowerCase()) }),
      ...(rule.namePattern === undefined ? {} : { namePattern: rule.namePattern as string }),
      ...(rule.minSize === undefined ? {} : { minSize: rule.minSize as number }),
      ...(rule.maxSize === undefined ? {} : { maxSize: rule.maxSize as number }),
      target: rule.target,
      ...(regex === undefined ? {} : { regex }),
    })
  }
  return rules.sort((a, b) => b.priority - a.priority)
}

/** Match the first rule, preserving compiled priority order. */
export function matchRule(entry: FileEntry, rules: readonly CompiledRule[]): CompiledRule | undefined {
  const name = entry.name
  for (const rule of rules) {
    if (rule.extensions !== undefined && !rule.extensions.some(ext => name.toLowerCase().endsWith(ext))) continue
    if (rule.regex !== undefined && !rule.regex.test(name)) continue
    if (rule.minSize !== undefined && entry.size < rule.minSize) continue
    if (rule.maxSize !== undefined && entry.size > rule.maxSize) continue
    return rule
  }
  return undefined
}

/** Render a target template and sanitize each path segment. */
export function renderTarget(rule: Rule, entry: FileEntry): string {
  const date = new Date(entry.mtimeMs)
  const values: Record<string, string> = {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    day: String(date.getDate()).padStart(2, '0'),
    stem: entry.stem,
    ext: entry.ext,
    name: entry.name,
    category: rule.category,
  }
  const rendered = rule.target.replace(/\{([^}]+)\}/g, (_match, key: string) => values[key] ?? '')
  const segments = rendered.split('/').filter(segment => segment !== '' && segment !== '.').map(safeSegment)
  if (segments.length === 0) throw new StewardError('RULES_INVALID', `${rule.id}.target rendered an empty path`)
  if (segments[0]?.toLowerCase() === '.data-steward') throw new StewardError('RULES_INVALID', `${rule.id}.target points at the state directory`)
  return segments.join('/')
}

const INVALID_SEGMENT_CHARS = new Set(['<', '>', ':', '"', '/', String.fromCharCode(92), '|', '?', '*'])

function safeSegment(segment: string): string {
  let value = [...segment].map(ch => (ch.charCodeAt(0) < 32 || INVALID_SEGMENT_CHARS.has(ch)) ? '_' : ch).join('').replace(/[. ]+$/g, '').trim()
  if (value === '') value = '_'
  if (RESERVED.test(value)) value = `_${value}`
  if (value.length > 80) {
    const dot = value.lastIndexOf('.')
    const ext = dot > 0 ? value.slice(dot) : ''
    value = `${value.slice(0, Math.max(1, 80 - ext.length))}${ext}`
  }
  return value
}

/** Explain the effective rule set for the UI and the model. */
export function describeRules(rules: readonly CompiledRule[], source: 'default' | 'user', userPath: string): {
  source: 'default' | 'user'
  userRulesPath: string
  count: number
  rules: Array<Record<string, unknown>>
} {
  return {
    source,
    userRulesPath: userPath,
    count: rules.length,
    rules: rules.map(rule => ({
      id: rule.id, category: rule.category, label: rule.label, priority: rule.priority,
      ...(rule.extensions === undefined ? {} : { extensions: [...rule.extensions] }),
      ...(rule.namePattern === undefined ? {} : { namePattern: rule.namePattern }),
      target: rule.target,
      ...(rule.minSize === undefined ? {} : { minSize: rule.minSize }),
      ...(rule.maxSize === undefined ? {} : { maxSize: rule.maxSize }),
    })),
  }
}
