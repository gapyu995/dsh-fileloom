/** File browsing, search, upload, preview, and single-file operations. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { DirEntry, FileManagerApi, RootInfo, SearchResult } from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import {
  dirname, errorText, formatBytes, formatDate, joinPath, recordOpened, relativeTime, saveLastPath,
} from '../utils.ts'
import { UploadZone, uploadToastMessage, type UploadSummary } from '../components/Uploader.tsx'
import { Preview } from '../components/Preview.tsx'
import { DirectoryPicker } from '../components/DirectoryPicker.tsx'
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorBanner, Icon, IconButton, Spinner, TextField } from '../components/ui.tsx'
import css from '../FileManagerPage.module.css'

type DialogState =
  | { kind: 'folder' }
  | { kind: 'rename'; entry: DirEntry }
  | { kind: 'move'; entry: DirEntry }
  | { kind: 'copy'; entry: DirEntry }
  | { kind: 'delete'; entry: DirEntry }
  | null

type SearchRow = DirEntry & { category?: string; label?: string }

export function FilesPage({
  api, root, rootId, t, path, onPathChange, focusPath, notify, onRootDataChanged,
}: {
  api: FileManagerApi
  root: RootInfo | undefined
  rootId: string
  t: (key: FileManagerKey) => string
  path: string
  onPathChange: (path: string) => void
  focusPath?: string
  notify: (message: string) => void
  onRootDataChanged: () => Promise<void>
}): ReactNode {
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<DirEntry | null>(null)
  const [preview, setPreview] = useState<DirEntry | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [sort, setSort] = useState<{ key: 'name' | 'size' | 'mtime'; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [dialog, setDialog] = useState<DialogState>(null)
  const [menu, setMenu] = useState<{ entry: DirEntry; x: number; y: number } | null>(null)
  const [pendingSelect, setPendingSelect] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const dragDepth = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const result = await api.list(rootId, path)
      setEntries(result.entries)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setLoading(false)
    }
  }, [api, rootId, path])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setSelected(null); setPreview(null); saveLastPath(rootId, path) }, [rootId, path])
  useEffect(() => {
    const target = focusPath !== undefined && focusPath !== '' ? focusPath : pendingSelect
    if (target === '' || entries.length === 0) return
    const found = entries.find(entry => entry.path === target)
    if (found !== undefined) {
      setSelected(found)
      setPendingSelect('')
    }
  }, [entries, focusPath, pendingSelect])

  useEffect(() => {
    if (menu === null) return
    const close = (): void => setMenu(null)
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', key)
    }
  }, [menu])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const select = (entry: DirEntry): void => {
    setSelected(entry)
    if (entry.kind === 'file') recordOpened(rootId, entry.path, entry.name)
  }

  const openEntry = (entry: DirEntry): void => {
    if (entry.kind === 'directory') onPathChange(entry.path)
    else { select(entry); setPreview(entry) }
  }

  const breadcrumb = (target: string): void => { setSearch(null); setQuery(''); onPathChange(target) }

  const run = async (task: () => Promise<void>, success: string): Promise<void> => {
    setError('')
    try {
      await task()
      notify(success)
      await load()
      await onRootDataChanged()
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  const runOrThrow = async (task: () => Promise<void>, success: string): Promise<void> => {
    setError('')
    try {
      await task()
      notify(success)
      await load()
      await onRootDataChanged()
    } catch (caught) {
      setError(errorText(caught))
      throw caught
    }
  }

  const doSearch = async (): Promise<void> => {
    const value = query.trim()
    if (value === '') { setSearch(null); return }
    setSearching(true)
    setSearchError('')
    try {
      setSearch(await api.search(rootId, value))
      setSelected(null)
    } catch (caught) {
      setSearchError(errorText(caught))
    } finally {
      setSearching(false)
    }
  }

  const openSearchResult = (row: SearchRow): void => {
    const target = dirname(row.path)
    setPendingSelect(row.path)
    setSearch(null)
    setQuery('')
    if (target === path) {
      setSelected(row)
    } else {
      onPathChange(target)
    }
  }

  const onUploaded = (summary: UploadSummary): void => {
    notify(uploadToastMessage(t, summary, false))
    void load()
    void onRootDataChanged()
  }

  const onDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    dragDepth.current = 0
    setDropActive(false)
    const files = [...event.dataTransfer.files]
    if (files.length === 0) return
    void apiUploadMany(api, rootId, path, files)
      .then(summary => onUploaded(summary))
      .catch(caught => setError(errorText(caught)))
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    if (sort.key === 'name') return a.name.localeCompare(b.name) * sort.dir
    if (sort.key === 'size') return (a.size - b.size) * sort.dir
    return (a.mtimeMs - b.mtimeMs) * sort.dir
  })
  const directories = sorted.filter(entry => entry.kind === 'directory')
  const searchRows: SearchRow[] = search === null ? [] : search.results.map((result) => {
    const name = result.name
    const dot = name.lastIndexOf('.')
    return {
      path: result.path, name, stem: dot > 0 ? name.slice(0, dot) : name,
      ext: dot > 0 ? name.slice(dot).toLowerCase() : '', size: result.size,
      mtimeMs: Date.parse(result.modifiedAt), kind: 'file', category: result.category, label: result.label,
    }
  })
  const shown: SearchRow[] = search === null ? sorted : searchRows
  const crumbs = path === '.' ? [] : path.split('/')

  return (
    <div className={css.filesLayout}>
      <aside className={css.folderSidebar}>
        <div className={css.sidebarHead}>
          <span>{t('folders')}</span>
          <IconButton label={t('newFolder')} icon="plus" onClick={() => setDialog({ kind: 'folder' })} />
        </div>
        {path !== '.' ? (
          <button type="button" className={css.folderRow} onClick={() => breadcrumb(dirname(path))}>
            <Icon name="chevron" className={css.chevronUp} /><span>{t('parent')}</span>
          </button>
        ) : null}
        {directories.map(entry => (
          <button key={entry.path} type="button" className={css.folderRow} onClick={() => breadcrumb(entry.path)} title={entry.path}>
            <Icon name="folder" /><span>{entry.name}</span>
          </button>
        ))}
        {directories.length === 0 ? <p className={css.sidebarHint}>{t('folderEmpty')}</p> : null}
        <div className={css.sidebarSpacer} />
        <Button size="sm" variant="ghost" icon="upload" onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.multiple = true
          input.onchange = () => {
            const files = [...(input.files ?? [])]
            if (files.length === 0) return
            void apiUploadMany(api, rootId, path, files).then(summary => onUploaded(summary)).catch(caught => setError(errorText(caught)))
          }
          input.click()
        }}>{t('uploadHere')}</Button>
      </aside>

      <section className={css.filesMain}>
        <div className={css.crumbsBar}>
          <div className={css.crumbRow}>
            <button type="button" className={css.crumb} onClick={() => breadcrumb('.')}>{root?.name ?? t('rootLabel')}</button>
            {crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className={css.crumbGroup}>
                <span className={css.crumbSep}>/</span>
                <button type="button" className={css.crumb} onClick={() => breadcrumb(crumbs.slice(0, index + 1).join('/'))}>{crumb}</button>
              </span>
            ))}
          </div>
          <div className={css.filesToolbar}>
            <div className={css.searchBox}>
              <Icon name="search" className={css.searchIcon} />
              <input
                ref={searchRef}
                className={css.searchInput}
                value={query}
                placeholder={t('searchPlaceholder')}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void doSearch() }}
              />
              {searching ? <Spinner /> : query === '' ? null : <IconButton label={t('clear')} icon="close" onClick={() => { setQuery(''); setSearch(null) }} />}
            </div>
            <UploadZone api={api} rootId={rootId} destination={path} t={t} variant="compact" onUploaded={onUploaded} />
            <Button variant="secondary" icon="plus" onClick={() => setDialog({ kind: 'folder' })}>{t('newFolder')}</Button>
            <IconButton label={t('refresh')} icon="refresh" onClick={() => void load()} />
          </div>
        </div>

        {search !== null ? (
          <div className={css.searchBanner}>
            <span>{t('searchResults')} · {search.totalMatches} {t('items')}</span>
            <Button size="sm" variant="ghost" onClick={() => { setSearch(null); setQuery('') }}>{t('clear')}</Button>
          </div>
        ) : null}
        {searchError !== '' ? <ErrorBanner message={searchError} /> : null}
        {error !== '' ? <ErrorBanner message={error} retryLabel={t('retry')} onRetry={() => void load()} /> : null}

        <div
          className={dropActive ? `${css.tableWrap} ${css.tableWrapDrop}` : css.tableWrap}
          onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDropActive(true) }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault()
            dragDepth.current = Math.max(0, dragDepth.current - 1)
            if (dragDepth.current === 0) setDropActive(false)
          }}
          onDrop={onDrop}
        >
          {dropActive ? <div className={css.dropOverlay}><Icon name="upload" size={28} /><strong>{t('dropHere').replace('{path}', path === '.' ? t('noFolder') : path)}</strong></div> : null}
          {loading ? <div className={css.centerState}><Spinner /> {t('loading')}</div> : null}
          {!loading && shown.length === 0 ? (
            search !== null ? (
              <EmptyState icon="search" title={t('noSearchResults')} />
            ) : (
              <EmptyState
                icon="folder"
                title={t('noFiles')}
                action={<Button variant="primary" icon="plus" onClick={() => setDialog({ kind: 'folder' })}>{t('newFolder')}</Button>}
              />
            )
          ) : null}
          {!loading && shown.length > 0 ? (
            <table className={css.table}>
              <thead>
                <tr>
                  <th>
                    <button type="button" className={css.sortButton} onClick={() => setSort(current => ({ key: 'name', dir: current.key === 'name' ? (current.dir === 1 ? -1 : 1) : 1 }))}>
                      {t('name')}
                    </button>
                  </th>
                  {search === null ? null : <th>{t('location')}</th>}
                  <th><button type="button" className={css.sortButton} onClick={() => setSort(current => ({ key: 'size', dir: current.key === 'size' ? (current.dir === 1 ? -1 : 1) : 1 }))}>{t('size')}</button></th>
                  <th><button type="button" className={css.sortButton} onClick={() => setSort(current => ({ key: 'mtime', dir: current.key === 'mtime' ? (current.dir === 1 ? -1 : 1) : 1 }))}>{t('modified')}</button></th>
                  <th className={css.actionsHead}>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(entry => (
                  <tr
                    key={entry.path}
                    className={selected?.path === entry.path ? css.rowActive : css.row}
                    onClick={() => select(entry)}
                    tabIndex={0}
                    aria-selected={selected?.path === entry.path}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && event.target === event.currentTarget) {
                        event.preventDefault()
                        if (search !== null) openSearchResult(entry)
                        else openEntry(entry)
                      }
                    }}
                    onDoubleClick={() => { if (search !== null) openSearchResult(entry); else openEntry(entry) }}
                  >
                    <td>
                      <div className={css.nameCell}>
                        <span className={entry.kind === 'directory' ? css.typeIconFolder : css.typeIconFile}>
                          <Icon name={entry.kind === 'directory' ? 'folder' : 'file'} />
                        </span>
                        <span className={css.nameText} title={entry.path}>{entry.name}</span>
                        {search !== null && entry.label !== undefined ? <Badge tone="neutral">{entry.label}</Badge> : null}
                      </div>
                    </td>
                    {search === null ? null : <td className={css.pathCell} title={entry.path}>{dirname(entry.path)}</td>}
                    <td>{entry.kind === 'directory' ? '—' : formatBytes(entry.size)}</td>
                    <td className={css.mutedCell} title={formatDate(entry.mtimeMs)}>{relativeTime(entry.mtimeMs)}</td>
                    <td className={css.rowActions}>
                      <IconButton
                        label={t('fileActions')}
                        icon="more"
                        onClick={(event) => {
                          event.stopPropagation()
                          const rect = event.currentTarget.getBoundingClientRect()
                          setMenu({ entry, x: Math.max(8, rect.right - 168), y: rect.bottom + 4 })
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </section>

      <aside className={css.details}>
        {selected === null ? (
          <div className={css.detailsEmpty}>
            <Icon name="eye" size={22} />
            <span>{t('noSelection')}</span>
          </div>
        ) : (
          <>
            <div className={css.detailTitle}>
              <span className={selected.kind === 'directory' ? css.typeIconFolder : css.typeIconFile}>
                <Icon name={selected.kind === 'directory' ? 'folder' : 'file'} size={18} />
              </span>
              <strong title={selected.path}>{selected.name}</strong>
              <IconButton label={t('close')} icon="close" onClick={() => setSelected(null)} />
            </div>
            <dl className={css.meta}>
              <dt>{t('path')}</dt><dd><button type="button" className={css.copyPath} onClick={() => {
                void navigator.clipboard?.writeText(selected.path).then(() => notify(t('pathCopied'))).catch(() => undefined)
              }} title={selected.path}>{selected.path}</button></dd>
              <dt>{t('type')}</dt><dd>{selected.kind === 'directory' ? t('directory') : selected.ext || t('noExtension')}</dd>
              <dt>{t('size')}</dt><dd>{selected.kind === 'directory' ? '—' : formatBytes(selected.size)}</dd>
              <dt>{t('modified')}</dt><dd>{formatDate(selected.mtimeMs)}</dd>
            </dl>
            <div className={css.detailActions}>
              {selected.kind === 'directory' ? (
                <>
                  <Button size="sm" variant="secondary" icon="folder" onClick={() => openEntry(selected)}>{t('openFolder')}</Button>
                  <Button size="sm" variant="ghost" icon="edit" onClick={() => setDialog({ kind: 'rename', entry: selected })}>{t('rename')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'move', entry: selected })}>{t('move')}</Button>
                </>
              ) : (
                <>
                  <a className={css.downloadButton} href={api.contentUrl(rootId, selected.path)} download={selected.name}>
                    <Icon name="download" size={14} /> {t('download')}
                  </a>
                  <Button size="sm" variant="ghost" icon="edit" onClick={() => setDialog({ kind: 'rename', entry: selected })}>{t('rename')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'move', entry: selected })}>{t('move')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'copy', entry: selected })}>{t('copy')}</Button>
                  <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'delete', entry: selected })}>{t('delete')}</Button>
                </>
              )}
            </div>
            {selected.kind === 'file' ? (
              <Preview api={api} rootId={rootId} path={selected.path} name={selected.name} ext={selected.ext} t={t} />
            ) : (
              <p className={css.mutedSmall}>{t('folderRenameHint')}</p>
            )}
          </>
        )}
      </aside>

      {menu !== null ? createPortal(
        <div className={css.menu} style={{ left: menu.x, top: menu.y }} onMouseDown={event => event.stopPropagation()}>
          {menu.entry.kind === 'directory' ? (
            <MenuItem icon="folder" label={t('open')} onClick={() => { openEntry(menu.entry); setMenu(null) }} />
          ) : (
            <MenuItem icon="eye" label={t('preview')} onClick={() => { openEntry(menu.entry); setMenu(null) }} />
          )}
          {menu.entry.kind === 'file' ? (
            <a className={css.menuItem} href={api.contentUrl(rootId, menu.entry.path)}
              download={menu.entry.name} onClick={() => setMenu(null)}>
              <Icon name="download" size={14} /><span>{t('download')}</span>
            </a>
          ) : null}
          <MenuItem icon="edit" label={t('rename')} onClick={() => { setDialog({ kind: 'rename', entry: menu.entry }); setMenu(null) }} />
          <MenuItem icon="folder" label={t('move')} onClick={() => { setDialog({ kind: 'move', entry: menu.entry }); setMenu(null) }} />
          {menu.entry.kind === 'file' ? (
            <>
              <MenuItem icon="copy" label={t('copy')} onClick={() => { setDialog({ kind: 'copy', entry: menu.entry }); setMenu(null) }} />
              <MenuItem icon="trash" label={t('menuDelete')} danger onClick={() => { setDialog({ kind: 'delete', entry: menu.entry }); setMenu(null) }} />
            </>
          ) : null}
        </div>,
        document.body,
      ) : null}

      {preview !== null ? (
        <Dialog title={preview.name} closeLabel={t('close')} onClose={() => setPreview(null)} width="900px">
          <Preview api={api} rootId={rootId} path={preview.path} name={preview.name} ext={preview.ext} t={t} />
          <a className={css.downloadButton} href={api.contentUrl(rootId, preview.path)} download={preview.name}>
            <Icon name="download" size={14} /> {t('download')}
          </a>
        </Dialog>
      ) : null}

      {dialog?.kind === 'folder' ? (
        <NameDialog
          title={t('newFolderTitle')}
          label={t('folderName')}
          initial=""
          placeholder={t('newFolder')}
          submitLabel={t('newFolder')}
          t={t}
          onCancel={() => setDialog(null)}
          onSubmit={async (name) => {
            await runOrThrow(() => api.fileOp(rootId, { op: 'mkdir', path: joinPath(path, name) }).then(() => undefined), t('newFolder'))
            setDialog(null)
          }}
        />
      ) : null}
      {dialog?.kind === 'rename' ? (
        <NameDialog
          title={t('renameTitle')}
          label={t('renameLabel')}
          initial={dialog.entry.name}
          submitLabel={t('rename')}
          t={t}
          onCancel={() => setDialog(null)}
          onSubmit={async (name) => {
            const target = joinPath(dirname(dialog.entry.path), name)
            await runOrThrow(() => api.fileOp(rootId, { op: 'rename', path: dialog.entry.path, targetPath: target }).then(() => undefined), t('rename'))
            setSelected(null)
            setDialog(null)
          }}
        />
      ) : null}
      {dialog?.kind === 'move' || dialog?.kind === 'copy' ? (
        <TransferDialog
          api={api}
          rootId={rootId}
          rootName={root?.name ?? t('rootLabel')}
          entry={dialog.entry}
          mode={dialog.kind}
          t={t}
          onCancel={() => setDialog(null)}
          onSubmit={async (destination, name) => {
            const target = joinPath(destination, name)
            await runOrThrow(
              () => api.fileOp(rootId, { op: dialog.kind, path: dialog.entry.path, targetPath: target }).then(() => undefined),
              dialog.kind === 'move' ? t('move') : t('copy'),
            )
            setSelected(null)
            setDialog(null)
          }}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <ConfirmDialog
          title={t('deleteTitle')}
          message={t('deleteBody').replace('{name}', dialog.entry.name)}
          confirmLabel={t('deleteConfirm')}
          cancelLabel={t('cancel')}
          tone="danger"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            void run(() => api.fileOp(rootId, { op: 'delete', path: dialog.entry.path }).then(() => undefined), t('delete'))
            setSelected(null)
            setDialog(null)
          }}
        />
      ) : null}
    </div>
  )
}

function MenuItem({ icon, label, danger = false, onClick }: {
  icon: Parameters<typeof Icon>[0]['name']
  label: string
  danger?: boolean
  onClick: () => void
}): ReactNode {
  return (
    <button type="button" className={danger ? `${css.menuItem} ${css.menuDanger}` : css.menuItem} onClick={onClick}>
      <Icon name={icon} size={14} /><span>{label}</span>
    </button>
  )
}

function NameDialog({
  title, label, initial, placeholder, submitLabel, t, onCancel, onSubmit,
}: {
  title: string
  label: string
  initial: string
  placeholder?: string
  submitLabel: string
  t: (key: FileManagerKey) => string
  onCancel: () => void
  onSubmit: (name: string) => Promise<void>
}): ReactNode {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    const name = value.trim()
    if (name === '' || /[\\/]/.test(name) || name === '.' || name === '..') {
      setError(t('invalidName'))
      return
    }
    setBusy(true)
    try { await onSubmit(name) } catch (caught) { setError(errorText(caught)); setBusy(false) }
  }
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      closeLabel={t('close')}
      busy={busy}
      width="440px"
      footer={<>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('cancel')}</Button>
        <Button variant="primary" onClick={() => void submit()} busy={busy}>{submitLabel}</Button>
      </>}
    >
      <TextField
        label={label}
        value={value}
        placeholder={placeholder}
        autoFocus
        data-autofocus="true"
        error={error}
        onChange={(event) => { setValue(event.target.value); setError('') }}
        onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
      />
    </Dialog>
  )
}

function TransferDialog({
  api, rootId, rootName, entry, mode, t, onCancel, onSubmit,
}: {
  api: FileManagerApi
  rootId: string
  rootName: string
  entry: DirEntry
  mode: 'move' | 'copy'
  t: (key: FileManagerKey) => string
  onCancel: () => void
  onSubmit: (destination: string, name: string) => Promise<void>
}): ReactNode {
  const [destination, setDestination] = useState(dirname(entry.path))
  const [name, setName] = useState(entry.name)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    if (name.trim() === '' || /[\\/]/.test(name)) { setError(t('invalidName')); return }
    if (mode === 'move' && joinPath(destination, name) === entry.path) {
      setError(t('sameLocation'))
      return
    }
    setBusy(true)
    try { await onSubmit(destination, name) } catch (caught) { setError(errorText(caught)); setBusy(false) }
  }
  if (choosing) {
    return (
      <DirectoryPicker
        api={api}
        rootId={rootId}
        rootName={rootName}
        initialPath={destination}
        title={t('destination')}
        t={t}
        onClose={() => setChoosing(false)}
        onSelect={(path) => { setDestination(path); setChoosing(false) }}
      />
    )
  }
  return (
    <Dialog
      title={mode === 'move' ? t('moveTitle') : t('copyTitle')}
      onClose={onCancel}
      closeLabel={t('close')}
      busy={busy}
      footer={<>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('cancel')}</Button>
        <Button variant="primary" onClick={() => void submit()} busy={busy}>{mode === 'move' ? t('moveHere') : t('copyHere')}</Button>
      </>}
    >
      <p className={css.dialogText}>{entry.path}</p>
      <TextField
        label={t('destination')}
        value={destination}
        onChange={event => setDestination(event.target.value)}
        hint={t('path')}
      />
      <div className={css.inlineActions}>
        <Button size="sm" variant="secondary" icon="folder" onClick={() => setChoosing(true)}>{t('selectFolder')}</Button>
      </div>
      <TextField label={t('targetName')} value={name} onChange={event => setName(event.target.value)} error={error} />
    </Dialog>
  )
}

async function apiUploadMany(api: FileManagerApi, rootId: string, destination: string, files: File[]): Promise<UploadSummary> {
  const results = []
  let failed = 0
  for (const file of files) {
    try { results.push(await api.upload(rootId, destination, file, 'drop')) } catch { failed += 1 }
  }
  return { results, failed }
}
