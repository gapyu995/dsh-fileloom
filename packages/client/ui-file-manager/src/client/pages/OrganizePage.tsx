/** The read → preview → confirm workflow, with an explicit undo path. */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type {
  FileManagerApi, IndexResponse, OrganizeResult, PlanDetail, RecentResponse,
} from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import { errorText, formatBytes, formatDate } from '../utils.ts'
import { DirectoryPicker } from '../components/DirectoryPicker.tsx'
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorBanner, Icon, Spinner, WarningBanner,
} from '../components/ui.tsx'
import css from '../FileManagerPage.module.css'

const PAGE_SIZE = 50

export function OrganizePage({
  api, rootId, rootName, t, indexStatus, recent, initialScope, notify, refreshRootData, onOpenHistory, onOpenRules,
}: {
  api: FileManagerApi
  rootId: string
  rootName: string
  t: (key: FileManagerKey) => string
  indexStatus: IndexResponse | null
  recent: RecentResponse | null
  initialScope?: string
  notify: (message: string) => void
  refreshRootData: () => Promise<void>
  onOpenHistory: () => void
  onOpenRules: () => void
}): ReactNode {
  const inbox = recent?.inboxPath ?? indexStatus?.inboxPath ?? '收件箱'
  const [scope, setScope] = useState(initialScope ?? '.')
  const [picker, setPicker] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanError, setScanError] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState('')
  const [plan, setPlan] = useState<PlanDetail | null>(null)
  const [itemsBusy, setItemsBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [executeError, setExecuteError] = useState('')
  const [result, setResult] = useState<OrganizeResult | null>(null)
  const [undoConfirm, setUndoConfirm] = useState(false)
  const [undoBusy, setUndoBusy] = useState(false)

  useEffect(() => {
    if (initialScope !== undefined && initialScope !== '') setScope(initialScope)
  }, [initialScope])

  useEffect(() => {
    setPlan(null)
    setResult(null)
    setPage(0)
    setQuery('')
    setCategory('')
    setPlanError('')
    setExecuteError('')
  }, [rootId, scope])

  const index = indexStatus?.index ?? null
  const covered = index !== null && (index.scope === '.' || scope === index.scope || scope.startsWith(`${index.scope}/`))

  const loadPlan = useCallback(async (planIdValue: string, nextPage = page, nextQuery = query, nextCategory = category): Promise<void> => {
    setItemsBusy(true)
    try {
      const detail = await api.plan(rootId, planIdValue, {
        query: nextQuery, category: nextCategory, offset: nextPage * PAGE_SIZE, limit: PAGE_SIZE,
      })
      setPlan(detail)
      setPage(nextPage)
    } catch (caught) {
      setPlanError(errorText(caught))
    } finally {
      setItemsBusy(false)
    }
  }, [api, rootId, page, query, category])

  const doScan = async (): Promise<void> => {
    setScanBusy(true)
    setScanError('')
    try {
      const resultScan = await api.scan(rootId, scope)
      notify(`${t('indexReady').replace('{count}', String(resultScan.fileCount)).replace('{size}', formatBytes(resultScan.totalBytes))}`)
      setPlan(null)
      setResult(null)
      await refreshRootData()
    } catch (caught) {
      setScanError(errorText(caught))
    } finally {
      setScanBusy(false)
    }
  }

  const doClassify = async (): Promise<void> => {
    setPlanBusy(true)
    setPlanError('')
    setExecuteError('')
    setResult(null)
    try {
      const classified = await api.classify(rootId, scope)
      const detail = await api.plan(rootId, classified.planId, { offset: 0, limit: PAGE_SIZE })
      setPlan(detail)
      setPage(0)
    } catch (caught) {
      setPlanError(errorText(caught))
    } finally {
      setPlanBusy(false)
    }
  }

  const doExecute = async (): Promise<void> => {
    if (plan === null) return
    setExecuting(true)
    setExecuteError('')
    try {
      const executed = await api.organize(rootId, plan.planId, true)
      setResult(executed)
      setConfirming(false)
      setPlan(null)
      notify(`${t('resultBody').replace('{count}', String(executed.movedCount))}`)
      await refreshRootData()
    } catch (caught) {
      setExecuteError(errorText(caught))
      setConfirming(false)
    } finally {
      setExecuting(false)
    }
  }

  const doUndo = async (): Promise<void> => {
    if (result === null) return
    setUndoBusy(true)
    try {
      const rolled = await api.rollback(rootId, { operationId: result.operationId, confirm: true })
      notify(t('undoDone').replace('{count}', String(rolled.restoredCount)))
      setUndoConfirm(false)
      setResult(null)
      await refreshRootData()
    } catch (caught) {
      setExecuteError(t('undoConflict').replace('{message}', errorText(caught)))
      setUndoConfirm(false)
    } finally {
      setUndoBusy(false)
    }
  }

  const applyFilter = (nextCategory: string): void => {
    setCategory(nextCategory)
    if (plan !== null) void loadPlan(plan.planId, 0, query, nextCategory)
  }

  const pages = plan === null ? 1 : Math.max(1, Math.ceil(plan.totalMatches / PAGE_SIZE))

  return (
    <div className={css.pageScroll}>
      <div className={css.pageHead}>
        <div>
          <h1>{t('organizeTitle')}</h1>
          <p>{t('organizeIntro')}</p>
        </div>
        <Button size="sm" variant="ghost" icon="rules" onClick={onOpenRules}>{t('rulesLink')}</Button>
      </div>

      <section className={css.stepCard}>
        <div className={css.stepHead}>
          <span className={css.stepNumber}>1</span>
          <div>
            <h2>{t('scanTitle')}</h2>
            <p>{t('scanBody')}</p>
          </div>
          <div className={css.stepActions}>
            <Button variant={index === null ? 'primary' : 'secondary'} icon="refresh" busy={scanBusy} onClick={() => void doScan()}>
              {index === null ? t('scanButton') : t('rescanButton')}
            </Button>
          </div>
        </div>
        <div className={css.scopeRow}>
          <span className={css.scopeLabel}>{t('scope')}</span>
          <span className={css.scopeValue}><Icon name="folder" /> {scope === '.' ? t('scopeRoot') : scope}</span>
          <Button size="sm" variant="ghost" onClick={() => setPicker(true)}>{t('chooseScope')}</Button>
          {inbox === scope ? <Badge tone="brand">{t('scopeInbox')}</Badge> : null}
        </div>
        {index === null ? (
          <EmptyState compact icon="organize" title={t('indexMissing')} body={t('noIndexBody')} />
        ) : (
          <div className={css.indexLine}>
            <Badge tone="success">{t('indexReady').replace('{count}', String(index.fileCount)).replace('{size}', formatBytes(index.totalBytes))}</Badge>
            <span className={css.mutedSmall}>{t('indexCoverage').replace('{scope}', index.scope === '.' ? t('scopeRoot') : index.scope)}</span>
            <span className={css.mutedSmall}>{formatDate(index.scannedAt)}</span>
          </div>
        )}
        {index !== null && !covered ? (
          <WarningBanner message={`${t('indexCoverage').replace('{scope}', index.scope)} — ${t('planStale')}`} />
        ) : null}
        {index !== null && index.truncated ? <WarningBanner message={t('indexTruncated').replace('{count}', String(index.fileCount))} /> : null}
        {scanError !== '' ? <ErrorBanner message={scanError} /> : null}
      </section>

      <section className={css.stepCard}>
        <div className={css.stepHead}>
          <span className={css.stepNumber}>2</span>
          <div>
            <h2>{t('classifyTitle')}</h2>
            <p>{t('classifyBody')}</p>
          </div>
          <div className={css.stepActions}>
            <Button variant="primary" icon="sparkle" busy={planBusy} disabled={index === null || !covered} onClick={() => void doClassify()}>
              {planBusy ? t('planBuilding') : t('buildPlan')}
            </Button>
          </div>
        </div>
        {planError !== '' ? <ErrorBanner message={planError} /> : null}
        {plan === null && planError === '' ? (
          <EmptyState compact icon="sparkle" title={t('planTitle')} body={t('classifyBody')} />
        ) : null}
        {plan !== null ? (
          <>
            <div className={css.planSummary}>
              <div><strong>{plan.counts.moveCount}</strong><span>{t('moved')}</span></div>
              <div><strong>{plan.counts.noopCount}</strong><span>{t('noChange')}</span></div>
              <div><strong>{plan.counts.unmatchedCount}</strong><span>{t('unmatched')}</span></div>
              <div><strong>{plan.counts.collisionCount}</strong><span>{t('collisions')}</span></div>
            </div>
            <p className={css.planSentence}>{t('planSummary')
              .replace('{move}', String(plan.counts.moveCount))
              .replace('{noop}', String(plan.counts.noopCount))
              .replace('{unmatched}', String(plan.counts.unmatchedCount))
              .replace('{collision}', String(plan.counts.collisionCount))}</p>
            <div className={css.planMeta}>
              <Badge tone={plan.rulesSource === 'default' ? 'neutral' : 'brand'}>
                {t('planRules').replace('{source}', plan.rulesSource === 'default' ? t('rulesDefaultShort') : t('rulesUserShort'))}
              </Badge>
              <span className={css.mutedSmall}>{t('planExpires').replace('{time}', formatDate(plan.expiresAt))}</span>
            </div>
            {plan.counts.collisionCount > 0 ? <WarningBanner message={t('planWarningCollision').replace('{count}', String(plan.counts.collisionCount))} /> : null}
            {plan.warnings.length > 0 ? <WarningBanner message={plan.warnings.join(' · ')} /> : null}
            {plan.counts.moveCount === 0 ? (
              <EmptyState compact icon="check" title={t('planEmpty')} />
            ) : (
              <>
                <div className={css.planTools}>
                  <input
                    className={css.input}
                    value={query}
                    placeholder={t('planFilter')}
                    onChange={event => setQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && plan !== null) void loadPlan(plan.planId, 0) }}
                  />
                  <select className={css.select} value={category} onChange={event => applyFilter(event.target.value)}>
                    <option value="">{t('planCategoryAll')}</option>
                    {plan.categories.map(item => <option key={item.category} value={item.category}>{item.label} ({item.count})</option>)}
                  </select>
                  <span className={css.mutedSmall}>{t('planMatches').replace('{count}', String(plan.totalMatches))}</span>
                  {itemsBusy ? <Spinner /> : null}
                </div>
                <div className={css.planTableWrap}>
                  <table className={css.table}>
                    <thead><tr><th>{t('sourcePath')}</th><th /><th>{t('targetPath')}</th><th>{t('type')}</th><th>{t('size')}</th></tr></thead>
                    <tbody>
                      {plan.items.map(item => (
                        <tr key={item.source}>
                          <td className={css.pathCell} title={item.source}>{item.source}</td>
                          <td className={css.arrowCell}><Icon name="chevron" size={13} /></td>
                          <td className={css.pathCell} title={item.target}>
                            {item.target}
                            {item.renamedForConflict ? <Badge tone="warning">{t('collisions')}</Badge> : null}
                          </td>
                          <td><Badge tone="neutral">{item.label}</Badge></td>
                          <td>{formatBytes(item.size)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pages > 1 ? (
                  <div className={css.pager}>
                    <Button size="sm" variant="ghost" disabled={page === 0 || itemsBusy} onClick={() => void loadPlan(plan.planId, page - 1)}>{t('planPrev')}</Button>
                    <span>{t('planPage').replace('{page}', String(page + 1)).replace('{pages}', String(pages))}</span>
                    <Button size="sm" variant="ghost" disabled={page + 1 >= pages || itemsBusy} onClick={() => void loadPlan(plan.planId, page + 1)}>{t('planNext')}</Button>
                  </div>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </section>

      {plan !== null && plan.counts.moveCount > 0 ? (
        <section className={css.stepCard}>
          <div className={css.stepHead}>
            <span className={css.stepNumber}>3</span>
            <div>
              <h2>{t('executeTitle')}</h2>
              <p>{t('executeBody')}</p>
            </div>
            <div className={css.stepActions}>
              <Button variant="primary" icon="check" onClick={() => setConfirming(true)} disabled={executing}>{t('executeButton')}</Button>
            </div>
          </div>
          {executeError !== '' ? <ErrorBanner message={executeError} /> : null}
        </section>
      ) : null}

      {result !== null ? (
        <section className={`${css.stepCard} ${css.resultCard}`}>
          <div className={css.resultIcon}><Icon name="check" size={24} /></div>
          <div className={css.resultBody}>
            <h2>{t('resultTitle')}</h2>
            <p>{t('resultBody').replace('{count}', String(result.movedCount))}</p>
            <span className={css.monoSmall}>{result.operationId}</span>
            {executeError !== '' ? <ErrorBanner message={executeError} /> : null}
          </div>
          <div className={css.resultActions}>
            <Button variant="secondary" icon="history" onClick={onOpenHistory}>{t('resultHistory')}</Button>
            <Button variant="ghost" icon="undo" onClick={() => setUndoConfirm(true)}>{t('resultUndo')}</Button>
          </div>
        </section>
      ) : null}

      {picker ? (
        <DirectoryPicker
          api={api}
          rootId={rootId}
          rootName={rootName}
          initialPath={scope === '.' ? '.' : scope}
          title={t('chooseScope')}
          t={t}
          onClose={() => setPicker(false)}
          onSelect={(path) => { setScope(path); setPicker(false) }}
        />
      ) : null}

      {confirming && plan !== null ? (
        <ConfirmDialog
          title={t('executeConfirmTitle').replace('{count}', String(plan.counts.moveCount))}
          message={t('executeConfirmBody')}
          confirmLabel={t('executeButton')}
          cancelLabel={t('cancel')}
          busy={executing}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void doExecute()}
        />
      ) : null}
      {undoConfirm && result !== null ? (
        <ConfirmDialog
          title={t('undoTitle')}
          message={t('undoBody').replace('{count}', String(result.movedCount))}
          confirmLabel={t('undoConfirm')}
          cancelLabel={t('cancel')}
          tone="danger"
          busy={undoBusy}
          onCancel={() => setUndoConfirm(false)}
          onConfirm={() => void doUndo()}
        />
      ) : null}
    </div>
  )
}
