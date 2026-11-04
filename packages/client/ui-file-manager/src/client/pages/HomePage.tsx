/** File workspace with recent content and a separate action rail. */

import { useEffect, useState, type ReactNode } from 'react'
import type { FileManagerApi, IndexResponse, OperationSummary, RecentResponse, RootInfo } from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import type { Tab } from '../FileManagerPage.tsx'
import { basename, dirname, formatBytes, loadOpened, loadLastPath, relativeTime, type OpenedFile } from '../utils.ts'
import { UploadZone, uploadToastMessage, type UploadSummary } from '../components/Uploader.tsx'
import { Badge, Button, EmptyState, Icon, type IconName } from '../components/ui.tsx'
import css from '../FileManagerPage.module.css'

export function HomePage({
  api, root, rootId, t, indexStatus, recent, operations, notify, refresh, navigate, openPath,
}: {
  api: FileManagerApi
  root: RootInfo | undefined
  rootId: string
  t: (key: FileManagerKey) => string
  indexStatus: IndexResponse | null
  recent: RecentResponse | null
  operations: OperationSummary[]
  notify: (message: string) => void
  refresh: () => Promise<void>
  navigate: (tab: Tab, scope?: string) => void
  openPath: (path: string, selectPath?: string) => void
}): ReactNode {
  const [opened, setOpened] = useState<OpenedFile[]>([])
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [showAllOpened, setShowAllOpened] = useState(false)
  const inbox = recent?.inboxPath ?? indexStatus?.inboxPath ?? t('inbox')
  const entries = recent?.entries ?? []
  const lastPath = loadLastPath(rootId)
  const lastOperation = operations[0]
  const index = indexStatus?.index

  useEffect(() => {
    setOpened(loadOpened(rootId))
    setShowAllRecent(false)
    setShowAllOpened(false)
  }, [rootId])

  const onUploaded = (summary: UploadSummary): void => {
    notify(uploadToastMessage(t, summary, true))
    void refresh()
  }

  const recommendations: Array<{ id: string; icon: IconName; title: string; body: string; label: string; run: () => void }> = []
  if ((recent?.pendingCount ?? 0) > 0) {
    recommendations.push({
      id: 'inbox', icon: 'inbox',
      title: t('recInboxTitle').replace('{count}', String(recent?.pendingCount ?? 0)),
      body: t('recInboxBody'), label: t('recInboxAction'), run: () => navigate('organize', inbox),
    })
  }
  if (indexStatus !== null && indexStatus.index === null) {
    recommendations.push({
      id: 'index', icon: 'refresh', title: t('recIndexTitle'), body: t('recIndexBody'),
      label: t('recIndexAction'), run: () => navigate('organize'),
    })
  }
  if (lastPath !== '.') {
    recommendations.push({
      id: 'continue', icon: 'folder', title: t('recContinueTitle').replace('{name}', basename(lastPath)),
      body: t('recContinueBody'), label: t('recContinueAction'), run: () => openPath(lastPath),
    })
  }
  if (lastOperation?.status === 'succeeded' && lastOperation.movedCount > 0) {
    recommendations.push({
      id: 'undo', icon: 'undo', title: t('recUndoTitle'),
      body: t('recUndoBody').replace('{count}', String(lastOperation.movedCount)),
      label: t('recUndoAction'), run: () => navigate('history'),
    })
  }

  return (
    <div className={css.home}>
      <header className={css.workspaceHead}>
        <div>
          <p className={css.workspaceLabel}>{t('workspaceLabel')}</p>
          <h1>{t('workspaceTitle')}</h1>
          <p className={css.workspacePath} title={root?.path}><Icon name="folder" size={14} />{root?.name}</p>
        </div>
        <Button variant="secondary" icon="folder" onClick={() => navigate('files')}>{t('browseFiles')}</Button>
      </header>

      <dl className={css.workspaceStats}>
        <div><dt>{t('fileCount')}</dt><dd>{index == null ? '--' : index.fileCount}</dd></div>
        <div><dt>{t('totalSize')}</dt><dd>{index == null ? '--' : formatBytes(index.totalBytes)}</dd></div>
        <div><dt>{t('pendingLabel')}</dt><dd className={(recent?.pendingCount ?? 0) > 0 ? css.pendingValue : undefined}>{recent === null ? '--' : recent.pendingCount}</dd></div>
      </dl>

      <div className={css.workspaceGrid}>
        <div className={css.workspaceContent}>
          <section className={css.homeSection}>
            <div className={css.sectionHead}>
              <h2>{t('recentFiles')}<span className={css.sectionCount}>{entries.length}</span></h2>
              {entries.length > 8 ? <Button size="sm" variant="ghost" onClick={() => setShowAllRecent(value => !value)}>
                {showAllRecent ? t('showLess') : t('seeAll')}
              </Button> : null}
            </div>
            {entries.length === 0 ? (
              <EmptyState icon="inbox" title={t('recentFilesEmpty')} action={<Button variant="ghost" icon="folder" onClick={() => navigate('files')}>{t('browseFiles')}</Button>} />
            ) : (
              <div className={css.recentGrid}>
                {(showAllRecent ? entries : entries.slice(0, 8)).map(entry => (
                  <button key={entry.ingestId} type="button" className={css.fileCard}
                    onClick={() => openPath(dirname(entry.path), entry.path)} title={entry.path}>
                    <span className={css.fileCardIcon} data-kind={fileKind(entry.name)}><Icon name={fileKind(entry.name) === 'image' ? 'eye' : 'file'} size={20} /></span>
                    <span className={css.fileCardBody}><strong>{entry.name}</strong><span>{dirname(entry.path)}</span></span>
                    <span className={css.fileCardSize}>{formatBytes(entry.size)}</span>
                    <span className={css.fileCardTime}>{relativeTime(entry.ingestedAt)}</span>
                    <Badge tone={entry.indexed ? 'success' : 'neutral'}>{t(entry.indexed ? 'indexed' : 'notIndexed')}</Badge>
                    <Icon name="chevron" size={14} className={css.fileCardArrow} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className={css.homeSection}>
            <div className={css.sectionHead}>
              <h2>{t('recentOpened')}</h2>
              {opened.length > 6 ? <Button size="sm" variant="ghost" onClick={() => setShowAllOpened(value => !value)}>
                {showAllOpened ? t('showLess') : t('seeAll')}
              </Button> : null}
            </div>
            {opened.length === 0 ? <EmptyState compact icon="eye" title={t('recentOpenedEmpty')} /> : (
              <div className={css.rowList}>
                {(showAllOpened ? opened : opened.slice(0, 6)).map(item => (
                  <button key={item.path} type="button" className={css.rowItem} onClick={() => openPath(dirname(item.path), item.path)} title={item.path}>
                    <Icon name="file" /><span className={css.rowItemMain}>{item.name}</span>
                    <span className={css.rowItemMeta}>{relativeTime(item.at)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className={css.workspaceRail}>
          <section className={css.homeSection}>
            <div className={css.sectionHead}><h2>{t('addFiles')}</h2><Icon name="plus" size={15} /></div>
            <UploadZone api={api} rootId={rootId} destination={inbox} t={t} onUploaded={onUploaded} />
          </section>
          <section className={css.homeSection}>
            <div className={css.sectionHead}><h2>{t('needsAttention')}</h2><span className={css.sectionCount}>{recommendations.length}</span></div>
            {recommendations.length === 0 ? <div className={css.allClear}><Icon name="check" size={18} /><span>{t('allClear')}</span></div> : (
              <div className={css.recoGrid}>{recommendations.map(item => (
                <div key={item.id} className={css.recoCard}>
                  <Icon name={item.icon} size={17} />
                  <div className={css.recoBody}><strong>{item.title}</strong><p>{item.body}</p>
                    <Button size="sm" variant="ghost" icon="chevron" onClick={item.run}>{item.label}</Button>
                  </div>
                </div>
              ))}</div>
            )}
          </section>
          <section className={css.homeSection}>
            <div className={css.sectionHead}><h2>{t('recentOps')}</h2><Button size="sm" variant="ghost" onClick={() => navigate('history')}>{t('seeAll')}</Button></div>
            {operations.length === 0 ? <p className={css.railEmpty}>{t('recentOpsEmpty')}</p> : (
              <div className={css.rowList}>{operations.slice(0, 3).map(operation => (
                <button key={operation.operationId} type="button" className={css.operationRow} onClick={() => navigate('history')}>
                  <Icon name="history" size={16} /><span><strong>{operation.movedCount} {t('items')}</strong><small>{relativeTime(operation.createdAt)}</small></span>
                  <Badge tone={operation.status === 'succeeded' ? 'success' : operation.status === 'rolled_back' ? 'neutral' : 'warning'}>{statusLabel(operation, t)}</Badge>
                </button>
              ))}</div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function fileKind(name: string): 'image' | 'document' | 'other' {
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return 'image'
  if (/\.(pdf|docx?|txt|md)$/i.test(name)) return 'document'
  return 'other'
}

function statusLabel(operation: OperationSummary, t: (key: FileManagerKey) => string): string {
  switch (operation.status) {
    case 'succeeded': return t('statusSucceeded')
    case 'rolled_back': return t('statusRolledBack')
    case 'failed': return t('statusFailed')
    case 'rollback_failed': return t('statusRollbackFailed')
    default: return t('statusRunning')
  }
}
