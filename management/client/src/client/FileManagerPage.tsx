/** Data Steward shell: one simplified navigation, shared root data, and toasts. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  FileManagerApi, IndexResponse, OperationSummary, RecentResponse, RootConfig, RootInfo,
} from './api.ts'
import { BrandMark } from './Brand.tsx'
import { errorText, loadLastPath } from './utils.ts'
import { HomePage } from './pages/HomePage.tsx'
import { FilesPage } from './pages/FilesPage.tsx'
import { OrganizePage } from './pages/OrganizePage.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { TrashPage } from './pages/TrashPage.tsx'
import { RulesPage } from './pages/RulesPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { Button, EmptyState, ErrorBanner, Icon, IconButton, Spinner } from './components/ui.tsx'
import css from './FileManagerPage.module.css'

export interface FileManagerFace {
  readonly api: FileManagerApi
  readonly openChat: () => void
}

export type FileManagerPageProps =
  & PropsRuntime<'main'>
  & PropsLocale<'fileManager'>
  & InjectFace<FileManagerFace>

export type Tab = 'home' | 'files' | 'organize' | 'history' | 'trash' | 'rules' | 'settings'

interface Toast { kind: 'success' | 'error' | 'info'; text: string }

export function FileManagerPage(props: FileManagerPageProps): ReactNode {
  const { t, api, openChat } = props
  const [roots, setRoots] = useState<RootInfo[]>([])
  const [config, setConfig] = useState<RootConfig | null>(null)
  const [rootId, setRootId] = useState('')
  const [tab, setTab] = useState<Tab>('home')
  const [filesPath, setFilesPath] = useState('.')
  const [focusPath, setFocusPath] = useState('')
  const [organizeScope, setOrganizeScope] = useState<string | undefined>(undefined)
  const [indexStatus, setIndexStatus] = useState<IndexResponse | null>(null)
  const [recent, setRecent] = useState<RecentResponse | null>(null)
  const [operations, setOperations] = useState<OperationSummary[]>([])
  const [rootsLoading, setRootsLoading] = useState(true)
  const [rootError, setRootError] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const toastTimer = useRef<number | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)

  const notify = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    setToast({ kind, text })
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 5_000)
  }, [])

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    api.roots()
      .then((result) => {
        if (cancelled) return
        setRoots(result.roots)
        setConfig(result.config)
        const firstRoot = result.roots[0]
        if (firstRoot !== undefined) setRootId(firstRoot.id)
      })
      .catch((caught) => { if (!cancelled) setRootError(errorText(caught)) })
      .finally(() => { if (!cancelled) setRootsLoading(false) })
    return () => { cancelled = true }
  }, [api])

  const refreshRootData = useCallback(async (root = rootId): Promise<void> => {
    if (root === '') return
    const [indexResult, recentResult, operationResult] = await Promise.allSettled([
      api.indexStatus(root),
      api.recent(root, 30),
      api.operations(root, 10),
    ])
    if (indexResult.status === 'fulfilled') setIndexStatus(indexResult.value)
    if (recentResult.status === 'fulfilled') setRecent(recentResult.value)
    if (operationResult.status === 'fulfilled') setOperations(operationResult.value.operations)
    const failed = [indexResult, recentResult, operationResult].find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') setRootError(errorText(failed.reason))
  }, [api, rootId])

  useEffect(() => {
    if (rootId === '') return
    setIndexStatus(null)
    setRecent(null)
    setOperations([])
    setRootError('')
    setFilesPath(loadLastPath(rootId))
    setFocusPath('')
    void refreshRootData(rootId)
  }, [rootId, refreshRootData])

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: MouseEvent): void => {
      if (moreRef.current !== null && event.target instanceof Node && moreRef.current.contains(event.target)) return
      setMoreOpen(false)
    }
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', key)
    }
  }, [moreOpen])

  const navigate = useCallback((next: Tab, scope?: string): void => {
    setTab(next)
    setMoreOpen(false)
    if (next === 'organize') setOrganizeScope(scope)
  }, [])

  const openPath = useCallback((path: string, selectPath?: string): void => {
    setFilesPath(path)
    setFocusPath(selectPath ?? '')
    setTab('files')
    setMoreOpen(false)
  }, [])

  const currentRoot = roots.find(root => root.id === rootId)
  const pending = recent?.pendingCount ?? 0
  const secondaryTabs: Array<{ id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }> = [
    { id: 'history', label: t('history'), icon: 'history' },
    { id: 'trash', label: t('trash'), icon: 'trash' },
    { id: 'rules', label: t('rules'), icon: 'rules' },
    { id: 'settings', label: t('settings'), icon: 'settings' },
  ]

  const navItem = (id: Tab, label: string, icon: Parameters<typeof Icon>[0]['name'], badge?: number): ReactNode => (
    <button
      key={id}
      type="button"
      className={tab === id ? css.navItemActive : css.navItem}
      onClick={() => navigate(id)}
      aria-current={tab === id ? 'page' : undefined}
    >
      <Icon name={icon} size={15} />
      <span>{label}</span>
      {badge !== undefined && badge > 0 ? <span className={css.navBadge}>{badge}</span> : null}
    </button>
  )

  return (
    <div className={css.page}>
      <header className={css.appHeader}>
        <div className={css.brandBlock}>
          <BrandMark />
          <strong>{t('panel')}</strong>
        </div>
        <nav className={css.primaryNav} aria-label={t('panel')}>
          {navItem('home', t('home'), 'home')}
          {navItem('files', t('files'), 'folder')}
          {navItem('organize', t('organize'), 'organize', pending)}
          <div className={css.moreWrap} ref={moreRef}>
            <button
              type="button"
              className={secondaryTabs.some(item => item.id === tab) ? css.navItemActive : css.navItem}
              onClick={() => setMoreOpen(value => !value)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
            >
              <Icon name="more" size={15} />
              <span>{t('more')}</span>
              <Icon name="chevron" size={12} className={css.moreChevron} />
            </button>
            {moreOpen ? (
              <div className={css.moreMenu} role="menu">
                {secondaryTabs.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={tab === item.id ? css.moreItemActive : css.moreItem}
                    onClick={() => navigate(item.id)}
                  >
                    <Icon name={item.icon} size={15} /><span>{item.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </nav>
        <div className={css.headerTools}>
          {roots.length > 1 ? (
            <label className={css.rootSelect}>
              <Icon name="folder" size={14} />
              <select value={rootId} onChange={event => setRootId(event.target.value)} aria-label={t('rootSwitch')}>
                {roots.map(root => <option key={root.id} value={root.id}>{root.name}</option>)}
              </select>
            </label>
          ) : currentRoot === undefined ? null : (
            <span className={css.rootPill} title={currentRoot.path}><Icon name="folder" size={13} /> {currentRoot.name}</span>
          )}
          <Button size="sm" variant="ghost" icon="sparkle" onClick={openChat}>{t('askAi')}</Button>
        </div>
      </header>

      {rootError !== '' ? <ErrorBanner message={rootError} retryLabel={t('retry')} onRetry={() => void refreshRootData()} /> : null}
      {config?.readOnly && <p className={css.readOnlyNotice} role="status">{t('readOnlyLibrary')}</p>}

      <main className={css.main}>
        {rootsLoading ? (
          <div className={css.centerState}><Spinner /> {t('loading')}</div>
        ) : roots.length === 0 ? (
          <EmptyState icon="folder" title={t('noRoots')} body={t('emptyRoots')} />
        ) : currentRoot === undefined ? (
          <div className={css.centerState}><Spinner /> {t('loading')}</div>
        ) : tab === 'home' ? (
          <HomePage
            api={api}
            root={currentRoot}
            rootId={rootId}
            t={t}
            indexStatus={indexStatus}
            recent={recent}
            operations={operations}
            notify={notify}
            refresh={() => refreshRootData()}
            navigate={navigate}
            openPath={openPath}
          />
        ) : tab === 'files' ? (
          <FilesPage
            api={api}
            root={currentRoot}
            rootId={rootId}
            t={t}
            path={filesPath}
            onPathChange={(path) => { setFilesPath(path); setFocusPath('') }}
            {...(focusPath === '' ? {} : { focusPath })}
            notify={notify}
            onRootDataChanged={() => refreshRootData()}
          />
        ) : tab === 'organize' ? (
          <OrganizePage
            api={api}
            rootId={rootId}
            rootName={currentRoot.name}
            t={t}
            indexStatus={indexStatus}
            recent={recent}
            {...(organizeScope === undefined ? {} : { initialScope: organizeScope })}
            notify={notify}
            refreshRootData={() => refreshRootData()}
            onOpenHistory={() => navigate('history')}
            onOpenRules={() => navigate('rules')}
          />
        ) : tab === 'history' ? (
          <HistoryPage
            api={api}
            rootId={rootId}
            t={t}
            notify={notify}
            refreshRootData={() => refreshRootData()}
          />
        ) : tab === 'trash' ? (
          <TrashPage api={api} rootId={rootId} t={t} notify={notify} refreshRootData={() => refreshRootData()} />
        ) : tab === 'rules' ? (
          <RulesPage api={api} rootId={rootId} t={t} notify={notify} />
        ) : (
          <SettingsPage roots={roots} config={config} rootId={rootId} indexStatus={indexStatus} t={t} />
        )}
      </main>

      {toast !== null ? (
        <div className={`${css.toast} ${css[`toast_${toast.kind}`]}`} role="status" aria-live="polite">
          <Icon name={toast.kind === 'error' ? 'warning' : toast.kind === 'success' ? 'check' : 'sparkle'} size={15} />
          <span>{toast.text}</span>
          <IconButton label={t('dismiss')} icon="close" onClick={() => setToast(null)} />
        </div>
      ) : null}
      {pending > 0 && tab !== 'organize' && tab !== 'home' ? (
        <button type="button" className={css.pendingFab} onClick={() => navigate('organize')}>
          <Icon name="inbox" size={16} />
          {t('pendingInbox').replace('{count}', String(pending))}
        </button>
      ) : null}
    </div>
  )
}
