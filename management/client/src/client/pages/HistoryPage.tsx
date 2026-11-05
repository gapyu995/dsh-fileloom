/** Activity history and backups: inspect an operation, then undo it. */

import { useEffect, useState, type ReactNode } from 'react'
import type {
  FileManagerApi, OperationDetail, OperationSummary, SnapshotDetail, SnapshotSummary,
} from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import { errorText, formatBytes, formatDate } from '../utils.ts'
import {
  Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorBanner, Spinner,
} from '../components/ui.tsx'
import css from '../FileManagerPage.module.css'

type Tab = 'operations' | 'snapshots'
type UndoTarget = { kind: 'operation'; operation: OperationSummary } | { kind: 'snapshot'; snapshot: SnapshotSummary }

export function HistoryPage({
  api, rootId, t, notify, refreshRootData,
}: {
  api: FileManagerApi
  rootId: string
  t: (key: FileManagerKey) => string
  notify: (message: string) => void
  refreshRootData: () => Promise<void>
}): ReactNode {
  const [tab, setTab] = useState<Tab>('operations')
  const [operations, setOperations] = useState<OperationSummary[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [operationDetail, setOperationDetail] = useState<OperationDetail | null>(null)
  const [snapshotDetail, setSnapshotDetail] = useState<SnapshotDetail | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [undoTarget, setUndoTarget] = useState<UndoTarget | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [undoError, setUndoError] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const [ops, snaps] = await Promise.all([api.operations(rootId), api.snapshots(rootId)])
      setOperations(ops.operations)
      setSnapshots(snaps.snapshots)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [api, rootId])

  const openOperation = async (operation: OperationSummary): Promise<void> => {
    setDetailBusy(true)
    setError('')
    try {
      setOperationDetail(await api.operation(rootId, operation.operationId))
    } catch (caught) { setError(errorText(caught)) } finally { setDetailBusy(false) }
  }

  const openSnapshot = async (snapshot: SnapshotSummary): Promise<void> => {
    setDetailBusy(true)
    setError('')
    try {
      setSnapshotDetail(await api.snapshotDetail(rootId, snapshot.snapshotId))
    } catch (caught) { setError(errorText(caught)) } finally { setDetailBusy(false) }
  }

  const doUndo = async (): Promise<void> => {
    if (undoTarget === null) return
    setUndoBusy(true)
    setUndoError('')
    try {
      const result = undoTarget.kind === 'operation'
        ? await api.rollback(rootId, { operationId: undoTarget.operation.operationId, confirm: true })
        : await api.rollback(rootId, { snapshotId: undoTarget.snapshot.snapshotId, confirm: true })
      notify(t('undoDone').replace('{count}', String(result.restoredCount)))
      setUndoTarget(null)
      await load()
      await refreshRootData()
    } catch (caught) {
      setUndoError(t('undoConflict').replace('{message}', errorText(caught)))
    } finally {
      setUndoBusy(false)
    }
  }

  return (
    <div className={css.pageScroll}>
      <div className={css.pageHead}>
        <div>
          <h1>{t('historyTitle')}</h1>
          <p>{t('historyIntro')}</p>
        </div>
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => void load()}>{t('refresh')}</Button>
      </div>

      <div className={css.segmented}>
        <button type="button" className={tab === 'operations' ? css.segmentActive : css.segment} onClick={() => setTab('operations')}>
          {t('operationsTab')} <span className={css.segmentCount}>{operations.length}</span>
        </button>
        <button type="button" className={tab === 'snapshots' ? css.segmentActive : css.segment} onClick={() => setTab('snapshots')}>
          {t('snapshotsTab')} <span className={css.segmentCount}>{snapshots.length}</span>
        </button>
      </div>

      {error !== '' ? <ErrorBanner message={error} retryLabel={t('retry')} onRetry={() => void load()} /> : null}
      {loading ? <div className={css.centerState}><Spinner /> {t('loading')}</div> : null}

      {!loading && tab === 'operations' ? (
        operations.length === 0 ? <EmptyState icon="history" title={t('noOperations')} />
          : (
            <div className={css.dataTableWrap}>
              <table className={css.table}>
                <thead><tr><th>{t('time')}</th><th>{t('status')}</th><th>{t('moved')}</th><th>{t('operationId')}</th><th className={css.actionsHead}>{t('actions')}</th></tr></thead>
                <tbody>
                  {operations.map(operation => (
                    <tr key={operation.operationId}>
                      <td title={formatDate(operation.createdAt)}>{formatDate(operation.createdAt)}</td>
                      <td><StatusBadge operation={operation} t={t} /></td>
                      <td>{operation.movedCount} / {operation.totalCount}</td>
                      <td className={css.monoSmall}>{operation.operationId}</td>
                      <td className={css.rowActions}>
                        <Button size="sm" variant="ghost" onClick={() => void openOperation(operation)}>{t('viewDetail')}</Button>
                        {operation.status === 'succeeded' ? (
                          <Button size="sm" variant="ghost" icon="undo" onClick={() => { setUndoError(''); setUndoTarget({ kind: 'operation', operation }) }}>{t('undo')}</Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      ) : null}

      {!loading && tab === 'snapshots' ? (
        snapshots.length === 0 ? <EmptyState icon="history" title={t('noSnapshots')} body={t('snapshotHint')} />
          : (
            <div className={css.dataTableWrap}>
              <table className={css.table}>
                <thead><tr><th>{t('time')}</th><th>{t('type')}</th><th>{t('snapshotLabel')}</th><th>{t('fileCount')}</th><th>{t('size')}</th><th className={css.actionsHead}>{t('actions')}</th></tr></thead>
                <tbody>
                  {snapshots.map(snapshot => (
                    <tr key={snapshot.snapshotId}>
                      <td title={formatDate(snapshot.createdAt)}>{formatDate(snapshot.createdAt)}</td>
                      <td><Badge tone={snapshot.kind === 'operation' ? 'info' : 'neutral'}>{snapshot.kind === 'operation' ? t('operationBackup') : t('manualSnapshot')}</Badge></td>
                      <td>{snapshot.label}</td>
                      <td>{snapshot.fileCount}</td>
                      <td>{formatBytes(snapshot.totalBytes)}</td>
                      <td className={css.rowActions}>
                        <Button size="sm" variant="ghost" onClick={() => void openSnapshot(snapshot)}>{t('viewDetail')}</Button>
                        <Button size="sm" variant="ghost" icon="undo" onClick={() => { setUndoError(''); setUndoTarget({ kind: 'snapshot', snapshot }) }}>{t('snapshotRestore')}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      ) : null}

      {detailBusy ? <div className={css.centerState}><Spinner /> {t('loading')}</div> : null}

      {operationDetail !== null ? (
        <Dialog
          title={t('detailTitle')}
          onClose={() => setOperationDetail(null)}
          closeLabel={t('close')}
          width="820px"
          footer={<Button variant="ghost" onClick={() => setOperationDetail(null)}>{t('close')}</Button>}
        >
          <div className={css.detailMetaGrid}>
            <span>{t('status')}</span><StatusBadge operation={operationDetail} t={t} />
            <span>{t('operationId')}</span><span className={css.monoSmall}>{operationDetail.operationId}</span>
            <span>{t('snapshotId')}</span><span className={css.monoSmall}>{operationDetail.snapshotId}</span>
            <span>{t('time')}</span><span>{formatDate(operationDetail.createdAt)}</span>
            {operationDetail.error === '' ? null : <><span>{t('error')}</span><span className={css.errorText}>{operationDetail.error}</span></>}
          </div>
          <h4>{t('affectedFiles')}</h4>
          <div className={css.detailTable}>
            <table className={css.table}>
              <thead><tr><th>{t('sourcePath')}</th><th>{t('targetPath')}</th><th>{t('moveStatus')}</th></tr></thead>
              <tbody>
                {operationDetail.moves.slice(0, 500).map((move, index) => (
                  <tr key={`${move.source}-${index}`}>
                    <td className={css.pathCell}>{move.source}</td>
                    <td className={css.pathCell}>{move.target}</td>
                    <td><Badge tone={move.status === 'moved' ? 'success' : move.status === 'restored' ? 'info' : move.status === 'failed' ? 'danger' : 'neutral'}>{moveLabel(move.status, t)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {operationDetail.moves.length > 500 ? <p className={css.mutedSmall}>{t('snapshotTooMany')}</p> : null}
          </div>
        </Dialog>
      ) : null}

      {snapshotDetail !== null ? (
        <Dialog
          title={t('snapshotDetail')}
          onClose={() => setSnapshotDetail(null)}
          closeLabel={t('close')}
          width="820px"
          footer={<Button variant="ghost" onClick={() => setSnapshotDetail(null)}>{t('close')}</Button>}
        >
          <div className={css.detailMetaGrid}>
            <span>{t('snapshotId')}</span><span className={css.monoSmall}>{snapshotDetail.snapshotId}</span>
            <span>{t('type')}</span><span>{snapshotDetail.kind === 'operation' ? t('operationBackup') : t('manualSnapshot')}</span>
            <span>{t('time')}</span><span>{formatDate(snapshotDetail.createdAt)}</span>
            <span>{t('fileCount')}</span><span>{snapshotDetail.fileCount} · {formatBytes(snapshotDetail.totalBytes)}</span>
            <span>{t('details')}</span><span>{snapshotDetail.label}</span>
          </div>
          <p className={css.mutedSmall}>{t('snapshotHint')}</p>
          <div className={css.detailTable}>
            <table className={css.table}>
              <thead><tr><th>{t('sourcePath')}</th><th>{t('targetPath')}</th><th>{t('size')}</th></tr></thead>
              <tbody>
                {snapshotDetail.files.slice(0, 500).map((file, index) => (
                  <tr key={`${file.source}-${index}`}>
                    <td className={css.pathCell}>{file.source}</td>
                    <td className={css.pathCell}>{file.target ?? '—'}</td>
                    <td>{formatBytes(file.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {snapshotDetail.files.length >= 500 ? <p className={css.mutedSmall}>{t('snapshotTooMany')}</p> : null}
          </div>
        </Dialog>
      ) : null}

      {undoTarget !== null ? (
        <ConfirmDialog
          title={undoTarget.kind === 'operation' ? t('undoTitle') : t('snapshotRestoreTitle')}
          message={undoTarget.kind === 'operation'
            ? t('undoBody').replace('{count}', String(undoTarget.operation.movedCount))
            : t('snapshotRestoreBody')}
          confirmLabel={undoTarget.kind === 'operation' ? t('undoConfirm') : t('snapshotRestore')}
          cancelLabel={t('cancel')}
          tone="danger"
          busy={undoBusy}
          onCancel={() => { setUndoTarget(null); setUndoError('') }}
          onConfirm={() => void doUndo()}
        />
      ) : null}
      {undoError !== '' ? (
        <div className={css.floatingError}><ErrorBanner message={undoError} /></div>
      ) : null}
    </div>
  )
}

function StatusBadge({ operation, t }: { operation: OperationSummary; t: (key: FileManagerKey) => string }): ReactNode {
  const map: Record<OperationSummary['status'], { tone: 'success' | 'neutral' | 'warning' | 'danger' | 'info'; label: FileManagerKey }> = {
    running: { tone: 'info', label: 'statusRunning' },
    succeeded: { tone: 'success', label: 'statusSucceeded' },
    rolled_back: { tone: 'neutral', label: 'statusRolledBack' },
    failed: { tone: 'danger', label: 'statusFailed' },
    rollback_failed: { tone: 'danger', label: 'statusRollbackFailed' },
  }
  const item = map[operation.status]
  return <Badge tone={item.tone}>{t(item.label)}</Badge>
}

function moveLabel(status: OperationDetail['moves'][number]['status'], t: (key: FileManagerKey) => string): string {
  switch (status) {
    case 'moved': return t('moveMoved')
    case 'restored': return t('moveRestored')
    case 'failed': return t('moveFailed')
    default: return t('movePending')
  }
}
