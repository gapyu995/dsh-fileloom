/** Folder-only browser used for organize scope and move/copy destinations. */

import { useEffect, useState, type ReactNode } from 'react'
import type { DirEntry, FileManagerApi } from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import { dirname, errorText, joinPath } from '../utils.ts'
import css from '../FileManagerPage.module.css'
import { Button, Dialog, EmptyState, ErrorBanner, Icon, Spinner } from './ui.tsx'

export function DirectoryPicker({
  api, rootId, rootName, initialPath, title, t, onSelect, onClose,
}: {
  api: FileManagerApi
  rootId: string
  rootName: string
  initialPath: string
  title: string
  t: (key: FileManagerKey) => string
  onSelect: (path: string) => void
  onClose: () => void
}): ReactNode {
  const [path, setPath] = useState(initialPath === '' ? '.' : initialPath)
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.list(rootId, path)
      .then((result) => { if (!cancelled) setEntries(result.entries.filter(entry => entry.kind === 'directory')) })
      .catch((caught) => { if (!cancelled) setError(errorText(caught)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [api, rootId, path])

  const crumbs = path === '.' ? [] : path.split('/')
  const atRoot = path === '.'

  return (
    <Dialog
      title={title}
      onClose={onClose}
      closeLabel={t('close')}
      width="620px"
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" onClick={() => onSelect(path)}>{t('choose')}</Button>
      </>}
    >
      <div className={css.crumbRow}>
        <button className={css.crumb} onClick={() => setPath('.')} type="button">{rootName}</button>
        {crumbs.map((crumb, index) => (
          <span key={`${crumb}-${index}`} className={css.crumbGroup}>
            <span className={css.crumbSep}>/</span>
            <button className={css.crumb} type="button" onClick={() => setPath(crumbs.slice(0, index + 1).join('/'))}>{crumb}</button>
          </span>
        ))}
      </div>
      <div className={css.pickerList}>
        {loading ? <div className={css.centerState}><Spinner /> {t('loading')}</div> : null}
        {error !== '' ? <ErrorBanner message={error} /> : null}
        {!loading && error === '' && !atRoot ? (
          <button type="button" className={css.pickerRow} onClick={() => setPath(dirname(path))}>
            <Icon name="folder" />
            <span>{t('parent')}</span>
          </button>
        ) : null}
        {!loading && error === '' ? entries.map(entry => (
          <button key={entry.path} type="button" className={css.pickerRow} onClick={() => setPath(joinPath(path, entry.name))}>
            <Icon name="folder" />
            <span>{entry.name}</span>
          </button>
        )) : null}
        {!loading && error === '' && entries.length === 0 && atRoot ? (
          <EmptyState compact icon="folder" title={t('folderEmpty')} />
        ) : null}
      </div>
      <p className={css.pickerHint}>{t('destination')}: <span className={css.mono}>{path}</span></p>
    </Dialog>
  )
}
