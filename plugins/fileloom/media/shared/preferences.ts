/** Browser-local library preferences; media fingerprints prevent resuming replaced files. */
import { useRef, useState } from 'react'
import { z } from 'zod'
import type { Entry } from './api.ts'
import { fileIdentity } from './media.ts'
import type { CopyKey } from './locales.ts'

const progressSchema = z.object({ id: z.string(), position: z.number().finite().nonnegative(), duration: z.number().finite().positive() })
const preferenceSchema = z.object({ version: z.literal(1), saved: z.array(z.string()).max(2000), progress: z.array(progressSchema).max(100) })
type Preferences = z.infer<typeof preferenceSchema>
const empty = (): Preferences => ({ version: 1, saved: [], progress: [] })

function read(key: string): { value: Preferences; warning: CopyKey | null } {
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch (_storageUnavailable) { return { value: empty(), warning: 'storageWarning' } }
  if (raw === null) return { value: empty(), warning: null }
  try {
    const parsed = preferenceSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { value: parsed.data, warning: null } : { value: empty(), warning: 'preferencesInvalid' }
  } catch (_invalidPreferences) { return { value: empty(), warning: 'preferencesInvalid' } }
}

/** Mount in a root-keyed view so preferences cannot cross library navigation. */
export function useLibraryPreferences(rootId: string, kind: 'movies' | 'photos') {
  const key = `fileloom.media.v1.${kind}.${rootId}`
  const [initial] = useState(() => read(key))
  const [value, setValue] = useState(initial.value)
  const current = useRef(value)
  const [warning, setWarning] = useState<CopyKey | null>(initial.warning)

  function commit(next: Preferences) {
    current.current = next
    setValue(next)
    try { localStorage.setItem(key, JSON.stringify(next)); setWarning(null) }
    catch (_storageUnavailable) { setWarning('storageWarning') }
  }

  return {
    saved: value.saved,
    warning,
    toggle: (paths: readonly string[]) => {
      const next = new Set(current.current.saved)
      const remove = paths.every(path => next.has(path))
      for (const path of paths) { if (remove) next.delete(path); else next.add(path) }
      commit({ ...current.current, saved: [...next].slice(-2000) })
    },
    progress: (entry: Entry) => value.progress.find(item => item.id === fileIdentity(entry)),
    saveProgress: (entry: Entry, position: number, duration: number) => {
      if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) return
      const id = fileIdentity(entry)
      const remaining = current.current.progress.filter(item => item.id !== id)
      const progress = position >= duration - 1 || position < 1 ? remaining
        : [{ id, position: Math.min(position, duration), duration }, ...remaining].slice(0, 100)
      commit({ ...current.current, progress })
    },
  }
}
