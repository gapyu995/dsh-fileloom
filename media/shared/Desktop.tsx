/** Folder-scoped desktops. Components receive actions and copy, never a Cordis context. */
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Film, Folder, Image, Music2, FileText, RotateCw, Search, SkipBack, SkipForward, X } from 'lucide-react'
import { FileApiError } from './api.ts'
import type { ApiFailure, Entry, FileApi, Root } from './api.ts'
import { formatSize, parentPath, selectEntries } from './files.ts'
import type { Translate } from './locales.ts'
import type { DesktopKind } from './protocol.ts'
import { Preview } from './Preview.tsx'
import { Movies } from './views/Movies.tsx'
import { Photos } from './views/Photos.tsx'
import { Music } from './views/Music.tsx'
import type { MusicSession } from './music-session.ts'
import styles from './styles.css'
import mediaStyles from './media.css'

export interface DesktopProps extends FileApi {
  kind: DesktopKind
  t: Translate
  musicSession?: MusicSession | undefined
}

const icons = { movies: Film, music: Music2, photos: Image, files: FileText }
const FILE_BATCH_SIZE = 120

export function DesktopIcon({ kind }: { kind: DesktopKind }) {
  const Icon = icons[kind]
  return <Icon size={18} aria-hidden="true" />
}

function Failure({ error, retry, t }: { error: ApiFailure; retry: () => void; t: Translate }) {
  return <div className="flml-notice" role="alert"><p>{t(error)}</p><button type="button" onClick={retry}><RotateCw size={16} />{t('retry')}</button></div>
}

export function Desktop({ kind, t, roots: loadRoots, list, library, contentUrl, musicSession }: DesktopProps) {
  const [libraries, setLibraries] = useState<Root[] | null>(null)
  const [rootId, setRootId] = useState('')
  const [error, setError] = useState<ApiFailure | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    void loadRoots(controller.signal).then(value => {
      if (controller.signal.aborted) return
      setLibraries(value)
      setRootId(previous => value.some(root => root.id === previous) ? previous : value[0]?.id ?? '')
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof FileApiError ? failure.code : 'unavailable')
    })
    return () => { controller.abort() }
  }, [loadRoots, revision])

  return <section className="flml-desktop" aria-label={t(kind)} data-fileloom-desktop={kind}>
    <style>{styles}</style>
    <style>{mediaStyles}</style>
    <header className="flml-heading">
      <div className="flml-title"><DesktopIcon kind={kind} /><h1>{t(kind)}</h1><span className="flml-product">Fileloom</span></div>
      {libraries !== null && libraries.length > 0 && <label className="flml-root">{t('root')}
        <select value={rootId} onChange={event => setRootId(event.target.value)}>
          {libraries.map(root => <option value={root.id} key={root.id}>{root.name}</option>)}
        </select>
      </label>}
    </header>
    {error !== null ? <Failure error={error} retry={() => setRevision(value => value + 1)} t={t} />
      : libraries === null ? <div className="flml-state"><span className="flml-spinner" role="status" aria-label={t('loading')} /></div>
        : libraries.length === 0 ? <p className="flml-state">{t('noRoots')}</p>
          : rootId !== '' && <FolderBrowser key={rootId} kind={kind} t={t} rootId={rootId} rootPath={libraries.find(root => root.id === rootId)?.path ?? ''} rootName={libraries.find(root => root.id === rootId)?.name ?? ''} list={list} library={library} contentUrl={contentUrl} musicSession={musicSession} />}
  </section>
}

interface BrowserProps {
  kind: DesktopKind
  t: Translate
  rootId: string
  rootName: string
  rootPath: string
  musicSession?: MusicSession | undefined
  list: FileApi['list']
  library: FileApi['library']
  contentUrl: FileApi['contentUrl']
}

function FolderBrowser({ kind, t, rootId, rootName, rootPath, list, library, contentUrl, musicSession }: BrowserProps) {
  const [path, setPath] = useState('.')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'name' | 'newest'>(kind === 'photos' ? 'newest' : 'name')
  const [revision, setRevision] = useState(0)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [fileLimit, setFileLimit] = useState(FILE_BATCH_SIZE)
  const [error, setError] = useState<ApiFailure | null>(null)
  const [loading, setLoading] = useState(true)
  const [libraryWarning, setLibraryWarning] = useState<'libraryTruncated' | 'libraryIncomplete' | 'libraryTruncatedIncomplete' | null>(null)
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const refreshLibrary = useRef(false)
  const [selected, setSelected] = useState<string | null>(null)
  const selectedButton = useRef<HTMLButtonElement | null>(null)
  const locale = t('languageTag')
  const visible = selectEntries(entries ?? [], kind, query, sort, locale)
  const queue = visible.filter(entry => entry.kind === 'file')
  const selectedEntry = entries?.find(entry => entry.path === selected)
  const index = queue.findIndex(entry => entry.path === selected)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const refresh = refreshLibrary.current
    refreshLibrary.current = false
    const request = kind !== 'files' && path === '.'
      ? Promise.all([list(rootId, path, controller.signal), library(rootId, controller.signal, refresh)]).then(([folders, result]) => ({ entries: [...folders.filter(entry => entry.kind === 'directory'), ...result.entries], scannedAt: result.scannedAt, warning: result.incomplete && result.truncated ? 'libraryTruncatedIncomplete' as const : result.incomplete ? 'libraryIncomplete' as const : result.truncated ? 'libraryTruncated' as const : null }))
      : list(rootId, path, controller.signal).then(value => ({ entries: value, scannedAt: null, warning: null }))
    void request.then(value => {
      if (!controller.signal.aborted) { setEntries(value.entries); setLibraryWarning(value.warning); setScannedAt(value.scannedAt); setLoading(false) }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        setError(failure instanceof FileApiError ? failure.code : 'unavailable')
        setLoading(false)
      }
    })
    return () => { controller.abort() }
  }, [kind, list, library, rootId, path, revision])

  function navigate(next: string) {
    setPath(next)
    setQuery('')
    setSelected(null)
    setEntries(null)
    setFileLimit(FILE_BATCH_SIZE)
    setLibraryWarning(null)
    setScannedAt(null)
  }

  function moveSelection(offset: number) {
    if (index < 0) return
    const next = queue[index + offset]
    if (next !== undefined) setSelected(next.path)
  }

  const date = (time: number): string => new Date(time).toLocaleDateString(locale)
  const count = visible.length
  return <>
    <div className="flml-toolbar">
      <button type="button" className="flml-icon" title={t('up')} aria-label={t('up')} disabled={path === '.'} onClick={() => navigate(parentPath(path))}><ArrowLeft size={18} /></button>
      <nav className="flml-breadcrumb" aria-label={t('folder')}>
        <button type="button" onClick={() => navigate('.')}>{rootName}</button>
        {path !== '.' && path.split('/').map((part, position, parts) => <span key={parts.slice(0, position + 1).join('/')}>
          <ChevronRight size={14} aria-hidden="true" />
          <button type="button" onClick={() => navigate(parts.slice(0, position + 1).join('/'))}>{part}</button>
        </span>)}
      </nav>
      <button type="button" className="flml-icon" title={t('refresh')} aria-label={t('refresh')} disabled={loading} onClick={() => { refreshLibrary.current = true; setRevision(value => value + 1) }}><RotateCw size={17} /></button>
      <label className="flml-search"><Search size={16} aria-hidden="true" /><input aria-label={t(kind !== 'files' && path === '.' ? 'searchLibrary' : 'search')} placeholder={t(kind !== 'files' && path === '.' ? 'searchLibrary' : 'search')} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="flml-sort"><span className="flml-sr-only">{t('sort')}</span><select aria-label={t('sort')} value={sort} onChange={event => setSort(event.target.value === 'newest' ? 'newest' : 'name')}><option value="name">{t('name')}</option><option value="newest">{t('newest')}</option></select></label>
    </div>
    <div className="flml-summary" role="status">{!loading && entries !== null ? `${count} ${t('items')}${scannedAt === null ? '' : ` · ${t('libraryScanned')}: ${new Date(scannedAt).toLocaleString(locale)}`}` : '\u00a0'}</div>
    {libraryWarning !== null && <p className="flml-notice" role="status">{t(libraryWarning)}</p>}
    {error !== null && <Failure error={error} retry={() => { refreshLibrary.current = true; setRevision(value => value + 1) }} t={t} />}
    {entries === null ? loading && <div className="flml-state"><span className="flml-spinner" role="status" aria-label={t('loading')} /></div>
      : kind === 'movies' ? <Movies key={path} rootId={rootId} path={path} entries={visible} allEntries={entries} contentUrl={contentUrl} navigate={navigate} t={t} />
        : kind === 'photos' ? <Photos key={path} rootId={rootId} path={path} entries={visible} allEntries={entries} contentUrl={contentUrl} navigate={navigate} t={t} />
          : kind === 'music' ? <Music rootId={rootId} rootPath={rootPath} path={path} entries={visible} allEntries={entries} contentUrl={contentUrl} navigate={navigate} t={t} musicSession={musicSession} />
            : <div className={`flml-content${selectedEntry !== undefined ? ' flml-with-preview' : ''}`}>
      <div className="flml-results">
        {visible.length === 0 ? <p className="flml-state">{t('empty')}</p> : <><ul className="flml-list" aria-label={t(kind)}>
          {visible.slice(0, fileLimit).map(entry => {
            const isFolder = entry.kind === 'directory'
            const TileIcon = isFolder ? Folder : icons[kind]
            return <li key={entry.path}>
              <button type="button" title={entry.name} aria-label={`${t(isFolder ? 'open' : 'preview')}: ${entry.name}`} aria-pressed={!isFolder ? entry.path === selected : undefined}
                className={`flml-item flml-${kind}${entry.path === selected ? ' flml-selected' : ''}`}
                onClick={event => {
                  if (isFolder) { navigate(entry.path); return }
                  selectedButton.current = event.currentTarget
                  setSelected(entry.path)
                }}>
                <span className="flml-artwork"><TileIcon size={20} strokeWidth={1.5} aria-hidden="true" /></span>
                <span className="flml-item-copy"><span className="flml-filename">{entry.name}</span><span className="flml-muted">{isFolder ? t('folder') : `${entry.ext.replace(/^\./, '').toUpperCase()} · ${formatSize(entry.size)}`}</span></span>
                <span className="flml-file-date">{date(entry.mtimeMs)}</span>
              </button>
            </li>
          })}
        </ul>{visible.length > fileLimit && <div className="flml-load-more"><button type="button" onClick={() => setFileLimit(value => value + FILE_BATCH_SIZE)}>{t('loadMore')}</button></div>}</>}
      </div>
      {selectedEntry !== undefined && <aside className="flml-detail" aria-label={t('preview')}>
        <div className="flml-detail-heading"><h2>{selectedEntry.name}</h2><button type="button" className="flml-icon" aria-label={t('close')} title={t('close')} onClick={() => { setSelected(null); selectedButton.current?.focus() }}><X size={18} /></button></div>
        <Preview key={`${rootId}/${selectedEntry.path}/${selectedEntry.mtimeMs}/${selectedEntry.size}`} entry={selectedEntry} url={contentUrl(rootId, selectedEntry.path)} t={t} autoPlay={false} onEnded={() => moveSelection(1)} />
        <div className="flml-preview-actions">
          <button type="button" className="flml-icon" aria-label={t('previous')} title={t('previous')} disabled={index <= 0} onClick={() => moveSelection(-1)}><SkipBack size={17} /></button>
          <button type="button" className="flml-icon" aria-label={t('next')} title={t('next')} disabled={index < 0 || index >= queue.length - 1} onClick={() => moveSelection(1)}><SkipForward size={17} /></button>
        </div>
        <dl><dt>{t('path')}</dt><dd>{selectedEntry.path}</dd><dt>{t('size')}</dt><dd>{formatSize(selectedEntry.size)}</dd><dt>{t('modified')}</dt><dd>{date(selectedEntry.mtimeMs)}</dd></dl>
      </aside>}
    </div>}
  </>
}
