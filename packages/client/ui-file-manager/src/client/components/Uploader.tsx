/** Upload control with drag-and-drop and sequential progress for the panel. */

import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { FileManagerApi, UploadResult } from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import { errorText, formatBytes } from '../utils.ts'
import css from '../FileManagerPage.module.css'
import { Button, Icon, Spinner } from './ui.tsx'

export interface UploadSummary {
  readonly results: readonly UploadResult[]
  readonly failed: number
}

export function UploadZone({
  api, rootId, destination, t, variant = 'hero', onUploaded,
}: {
  api: FileManagerApi
  rootId: string
  destination: string
  t: (key: FileManagerKey) => string
  variant?: 'hero' | 'compact'
  onUploaded: (summary: UploadSummary) => void
}): ReactNode {
  const input = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const dragDepth = useRef(0)

  const pick = (): void => { input.current?.click() }

  const upload = async (files: File[]): Promise<void> => {
    if (files.length === 0 || busy) return
    setBusy(true)
    setError('')
    const results: UploadResult[] = []
    let failed = 0
    for (const [index, file] of files.entries()) {
      setProgress(`${index + 1} / ${files.length} · ${file.name}`)
      try {
        results.push(await api.upload(rootId, destination, file, variant === 'hero' ? 'drop' : 'upload'))
      } catch (caught) {
        failed += 1
        setError(errorText(caught))
      }
    }
    setBusy(false)
    setProgress('')
    if (results.length > 0) onUploaded({ results, failed })
  }

  const onDrop = (event: DragEvent<HTMLDivElement | HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setActive(false)
    void upload([...event.dataTransfer.files])
  }

  const onDragEnter = (event: DragEvent<HTMLDivElement | HTMLButtonElement>): void => {
    event.preventDefault()
    dragDepth.current += 1
    setActive(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement | HTMLButtonElement>): void => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setActive(false)
  }

  if (variant === 'compact') {
    return (
      <span className={css.uploadCompact}>
        <Button
          variant="primary"
          icon="upload"
          busy={busy}
          onClick={pick}
          onDragEnter={onDragEnter}
          onDragOver={event => event.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {busy ? t('uploading') : t('upload')}
        </Button>
        <input ref={input} type="file" multiple hidden onChange={(event) => {
          void upload([...(event.target.files ?? [])])
          event.target.value = ''
        }} />
        {progress === '' ? null : <span className={css.uploadProgress}><Spinner /> {progress}</span>}
        {error === '' ? null : <span className={css.uploadError} title={error}>{error}</span>}
      </span>
    )
  }

  return (
    <div
      className={active ? `${css.dropHero} ${css.dropHeroActive}` : css.dropHero}
      onDragEnter={onDragEnter}
      onDragOver={event => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-busy={busy}
    >
      <input ref={input} type="file" multiple hidden onChange={(event) => {
        void upload([...(event.target.files ?? [])])
        event.target.value = ''
      }} />
      <div className={css.dropIcon}>{busy ? <Spinner /> : <Icon name="inbox" size={24} />}</div>
      <div className={css.dropCopy}>
        <strong>{busy ? t('uploading') : active ? t('heroDrop') : t('heroTitle')}</strong>
        <span>{busy ? progress : t('heroText')}</span>
        {error === '' ? null : <span className={css.uploadError}>{error}</span>}
      </div>
      <Button variant="primary" icon="upload" onClick={pick} disabled={busy}>
        {busy ? t('uploading') : t('upload')}
      </Button>
    </div>
  )
}

export function uploadToastMessage(t: (key: FileManagerKey) => string, summary: UploadSummary, inbox: boolean): string {
  const last = summary.results[summary.results.length - 1]
  if (summary.results.length === 1 && last !== undefined) {
    const size = formatBytes(last.size)
    const base = inbox
      ? t('uploadInboxResult')
      : t('uploadResult').replace('{path}', last.path)
    return `${base} · ${size}`
  }
  return summary.failed > 0
    ? `${t('uploadDone')} ${summary.results.length} · ${t('uploadFailed')} ${summary.failed}`
    : `${t('uploadDone')} · ${summary.results.length}`
}
