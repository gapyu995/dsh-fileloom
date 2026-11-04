/** Bounded preview for images, media, PDFs, and text files. */

import { useEffect, useState, type ReactNode } from 'react'
import type { FileManagerApi } from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import { fileKind } from '../utils.ts'
import css from '../FileManagerPage.module.css'
import { Icon } from './ui.tsx'

export function Preview({ api, rootId, path, name, ext, t }: {
  api: FileManagerApi
  rootId: string
  path: string
  name: string
  ext: string
  t: (key: FileManagerKey) => string
}): ReactNode {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const kind = fileKind(ext)
  const url = api.contentUrl(rootId, path)

  useEffect(() => {
    setText('')
    setState(kind === 'text' ? 'loading' : 'idle')
    if (kind !== 'text') return
    const controller = new AbortController()
    fetch(url, { credentials: 'same-origin', signal: controller.signal })
      .then(response => response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((value) => { setText(value.slice(0, 200_000)); setState('ready') })
      .catch((error) => { if ((error as Error).name !== 'AbortError') setState('failed') })
    return () => { controller.abort() }
  }, [url, kind])

  if (kind === 'image') return <img className={css.previewImage} src={url} alt={name} />
  if (kind === 'video') return <video className={css.previewMedia} src={url} controls preload="metadata" />
  if (kind === 'audio') return <audio className={css.previewAudio} src={url} controls preload="metadata" />
  if (kind === 'pdf') return <iframe className={css.previewFrame} src={url} title={name} />
  if (kind === 'text') {
    if (state === 'failed') {
      return (
        <div className={css.previewFallback}>
          <Icon name="warning" size={22} />
          <span>{t('previewFailed')}</span>
        </div>
      )
    }
    return <pre className={css.previewText}>{state === 'ready' ? text : t('loading')}</pre>
  }
  return (
    <div className={css.previewFallback}>
      <Icon name="file" size={24} />
      <span>{t('previewUnsupported')}</span>
      <span className={css.mutedSmall}>{t('previewDownloadHint')}</span>
    </div>
  )
}
