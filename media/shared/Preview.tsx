/** A selection owns its preview request and media element; unmounting ends both. */
import { useEffect, useRef, useState } from 'react'
import { FileWarning, RotateCw } from 'lucide-react'
import { PREVIEW_LIMIT } from './api.ts'
import type { Entry } from './api.ts'
import { previewKind } from './files.ts'
import type { Translate } from './locales.ts'

export interface PreviewProps {
  entry: Entry
  url: string
  t: Translate
  autoPlay: boolean
  onEnded: () => void
  initialPosition?: number
  onPosition?: (position: number, duration: number) => void
}

export function Preview({ entry, url, t, autoPlay, onEnded, initialPosition = 0, onPosition }: PreviewProps) {
  const kind = previewKind(entry.ext)
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const media = useRef<HTMLMediaElement | null>(null)
  const lastPosition = useRef(initialPosition)
  const reportPosition = useRef(onPosition)
  reportPosition.current = onPosition
  const overLimit = entry.size > PREVIEW_LIMIT && kind !== 'audio' && kind !== 'video'

  useEffect(() => {
    const controller = new AbortController()
    setText(null)
    setFailed(false)
    if (!overLimit && kind === 'text') {
      void fetch(url, { signal: controller.signal, credentials: 'same-origin' })
        .then(async response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.text()
        })
        .then(value => { if (!controller.signal.aborted) setText(value.slice(0, 200_001)) })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setFailed(true)
            // The preview has no mutations; failure leaves the directory usable.
            void error
          }
        })
    }
    return () => { controller.abort() }
  }, [kind, url, overLimit, retry])

  useEffect(() => {
    const element = media.current
    return () => {
      if (element !== null) {
        reportPosition.current?.(element.currentTime, element.duration)
        element.pause()
        element.removeAttribute('src')
        element.load()
      }
    }
  }, [retry, failed, kind, url, overLimit])

  if (overLimit || kind === 'none') return <p role="status">{t(overLimit ? 'previewLimit' : 'unsupported')}</p>
  if (failed) return <div className="flml-notice" role="alert">
    <FileWarning size={20} aria-hidden="true" /><p>{t('previewFailed')}</p>
    <button type="button" onClick={() => { setFailed(false); setRetry(value => value + 1) }}><RotateCw size={16} />{t('retry')}</button>
  </div>
  if (kind === 'image') return <img key={retry} className="flml-full-image" src={url} alt={entry.name} onError={() => setFailed(true)} />
  if (kind === 'video') return <video key={retry} ref={element => { media.current = element }} src={url} controls autoPlay={autoPlay} preload="metadata" onError={() => setFailed(true)}
    onLoadedMetadata={event => { if (initialPosition > 0 && Number.isFinite(event.currentTarget.duration)) event.currentTarget.currentTime = Math.min(initialPosition, Math.max(0, event.currentTarget.duration - 1)) }}
    onTimeUpdate={event => { const element = event.currentTarget; if (Math.abs(element.currentTime - lastPosition.current) >= 5) { lastPosition.current = element.currentTime; reportPosition.current?.(element.currentTime, element.duration) } }}
    onPause={event => reportPosition.current?.(event.currentTarget.currentTime, event.currentTarget.duration)}
    onEnded={event => { reportPosition.current?.(event.currentTarget.duration, event.currentTarget.duration); onEnded() }} />
  if (kind === 'audio') return <audio key={retry} ref={element => { media.current = element }} src={url} controls autoPlay={autoPlay} preload="metadata" onEnded={onEnded} onError={() => setFailed(true)} />
  if (kind === 'pdf') return <iframe key={retry} title={entry.name} src={url} />
  if (text === null) return <span className="flml-spinner" role="status" aria-label={t('loading')} />
  return <div>{text.length > 200_000 && <p role="status">{t('textTruncated')}</p>}<pre>{text.slice(0, 200_000)}</pre></div>
}
