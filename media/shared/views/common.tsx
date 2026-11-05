/** Shared media controls and a native modal with browser-owned focus containment. */
import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react'
import { Folder, ImageOff, X } from 'lucide-react'
import type { Entry, FileApi } from '../api.ts'
import { PREVIEW_LIMIT } from '../api.ts'
import { previewKind } from '../files.ts'
import type { Translate } from '../locales.ts'
import type { MusicSession } from '../music-session.ts'
import { supportsThumbnails, thumbnail } from '../thumbnails.ts'

export interface MediaViewProps {
  rootId: string
  path: string
  entries: readonly Entry[]
  allEntries: readonly Entry[]
  contentUrl: FileApi['contentUrl']
  navigate: (path: string) => void
  t: Translate
  musicSession?: MusicSession | undefined
  rootPath?: string | undefined
}

export function Folders({ entries, navigate, t }: Pick<MediaViewProps, 'entries' | 'navigate' | 't'>) {
  const folders = entries.filter(entry => entry.kind === 'directory')
  return folders.length > 0 && <nav className="flml-folders" aria-label={t('folders')}>
    {folders.map(entry => <button type="button" key={entry.path} onClick={() => navigate(entry.path)} aria-label={`${t('open')}: ${entry.name}`}><Folder size={17} aria-hidden="true" /><span>{entry.name}</span></button>)}
  </nav>
}

export function MediaImage({ entry, url, className = '', original = false }: { entry: Entry | undefined; url: string | undefined; className?: string; original?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ source: string; url: string } | null>(null)
  const image = useRef<HTMLImageElement>(null)
  const generated = !original && entry !== undefined && url !== undefined && entry.size <= PREVIEW_LIMIT && supportsThumbnails(entry)
  const identity = entry === undefined ? '' : JSON.stringify([url, entry.size, entry.mtimeMs])
  useEffect(() => {
    if (!generated || entry === undefined || url === undefined) return
    let active = true
    let objectUrl: string | undefined
    const load = () => {
      void thumbnail(url, entry).then(blob => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setPreview({ source: identity, url: objectUrl })
      }).catch((_unavailableThumbnail) => { if (active) setPreview({ source: identity, url }) })
    }
    const target = image.current
    const observer = typeof IntersectionObserver === 'function' && target !== null ? new IntersectionObserver(items => {
      if (items.some(item => item.isIntersecting)) { observer?.disconnect(); load() }
    }, { rootMargin: '160px' }) : null
    if (observer && target) observer.observe(target)
    else load()
    return () => { active = false; observer?.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [generated, identity])
  return entry === undefined || url === undefined || failedUrl === url || entry.size > PREVIEW_LIMIT || previewKind(entry.ext) !== 'image'
    ? <span className={`flml-image-fallback ${className}`}><ImageOff size={28} strokeWidth={1.3} aria-hidden="true" /></span>
    : <img ref={image} className={className} src={generated ? preview?.source === identity ? preview.url : undefined : url} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(url)} />
}

export function Modal({ label, close, children, onKeyDown, className = '' }: {
  label: string; close: () => void; children: ReactNode; onKeyDown?: (event: KeyboardEvent<HTMLDialogElement>) => void; className?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { element?.close() }
  }, [])
  return <dialog ref={dialog} className={`flml-modal ${className}`} aria-label={label}
    onCancel={event => { event.preventDefault(); close() }} onKeyDown={onKeyDown}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    }}>{children}</dialog>
}

export function CloseButton({ close, t }: { close: () => void; t: Translate }) {
  return <button type="button" className="flml-icon" aria-label={t('close')} title={t('close')} onClick={close}><X size={18} /></button>
}
