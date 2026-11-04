/** Deleted files waiting to be restored. */

import { useEffect, useState, type ReactNode } from 'react'
import type { FileManagerApi, TrashEntry } from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import { errorText, formatBytes, formatDate } from '../utils.ts'
import { Button, ConfirmDialog, EmptyState, ErrorBanner, Spinner } from '../components/ui.tsx'
import css from '../FileManagerPage.module.css'

export function TrashPage({
  api, rootId, t, notify, refreshRootData,
}: {
  api: FileManagerApi
  rootId: string
  t: (key: FileManagerKey) => string
  notify: (message: string) => void
  refreshRootData: () => Promise<void>
}): ReactNode {
  const [entries, setEntries] = useState<TrashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [target, setTarget] = useState<TrashEntry | null>(null)
  const [restoring, setRestoring] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const result = await api.trash(rootId)
      setEntries(result.entries)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [api, rootId])

  const restore = async (): Promise<void> => {
    if (target === null) return
    setRestoring(true)
    setError('')
    try {
      await api.fileOp(rootId, { op: 'restore', trashId: target.trashId })
      notify(t('restoreDone').replace('{path}', target.originalPath))
      setTarget(null)
      await load()
      await refreshRootData()
    } catch (caught) {
      setError(errorText(caught))
      setTarget(null)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className={css.pageScroll}>
      <div className={css.pageHead}>
        <div>
          <h1>{t('trashTitle')}</h1>
          <p>{t('trashHint')}</p>
        </div>
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => void load()}>{t('refresh')}</Button>
      </div>
      {error !== '' ? <ErrorBanner message={error} retryLabel={t('retry')} onRetry={() => void load()} /> : null}
      {loading ? <div className={css.centerState}><Spinner /> {t('loading')}</div> : null}
      {!loading && entries.length === 0 ? <EmptyState icon="trash" title={t('trashEmpty')} body={t('trashNoPermanent')} /> : null}
      {!loading && entries.length > 0 ? (
        <div className={css.dataTableWrap}>
          <table className={css.table}>
            <thead><tr><th>{t('name')}</th><th>{t('originalPath')}</th><th>{t('size')}</th><th>{t('deletedAt')}</th><th className={css.actionsHead}>{t('actions')}</th></tr></thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.trashId}>
                  <td title={entry.originalPath}>{entry.originalPath.split('/').pop()}</td>
                  <td className={css.pathCell} title={entry.originalPath}>{entry.originalPath}</td>
                  <td>{formatBytes(entry.size)}</td>
                  <td>{formatDate(entry.deletedAt)}</td>
                  <td className={css.rowActions}>
                    <Button size="sm" variant="ghost" icon="undo" onClick={() => setTarget(entry)}>{t('trashRestore')}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {target !== null ? (
        <ConfirmDialog
          title={t('restoreTitle')}
          message={t('restoreBody').replace('{path}', target.originalPath)}
          confirmLabel={t('trashRestore')}
          cancelLabel={t('cancel')}
          busy={restoring}
          onCancel={() => setTarget(null)}
          onConfirm={() => void restore()}
        />
      ) : null}
    </div>
  )
}
