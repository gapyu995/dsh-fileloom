/** Photo collections use file modification dates, not unprovided capture metadata. */
import { useState, type CSSProperties } from 'react'
import { Check, ChevronLeft, ChevronRight, Heart, Minus, Plus, SlidersHorizontal } from 'lucide-react'
import { PREVIEW_LIMIT, type Entry } from '../api.ts'
import { previewKind } from '../files.ts'
import { groupPhotos } from '../media.ts'
import { useLibraryPreferences } from '../preferences.ts'
import { CloseButton, Folders, MediaImage, Modal, type MediaViewProps } from './common.tsx'

type PhotoMode = 'allPhotos' | 'months' | 'years' | 'favorites'

export function Photos(props: MediaViewProps) {
  const { entries, rootId, t, contentUrl } = props
  const preferences = useLibraryPreferences(rootId, 'photos')
  const [mode, setMode] = useState<PhotoMode>('allPhotos')
  const [period, setPeriod] = useState<string | null>(null)
  const [density, setDensity] = useState(3)
  const [selecting, setSelecting] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [opened, setOpened] = useState<string | null>(null)
  const photos = entries.filter(entry => entry.kind === 'file')
  const visible = photos.filter(entry => (mode !== 'favorites' || preferences.saved.includes(entry.path))
    && (period === null || groupPhotos([entry], period.length === 4 ? 'year' : 'month', t('languageTag'))[0]?.key === period))
  const active = visible.find(entry => entry.path === opened)
  const index = visible.findIndex(entry => entry.path === opened)
  const selectedVisible = visible.filter(entry => selection.has(entry.path))

  function changeMode(next: PhotoMode) { setMode(next); setPeriod(null); setSelection(new Set()); setSelecting(false) }
  function selectPhoto(entry: Entry) {
    if (!selecting) { setOpened(entry.path); return }
    const next = new Set(selection)
    if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path)
    setSelection(next)
  }

  function move(offset: number) { const next = visible[index + offset]; if (index >= 0 && next) setOpened(next.path) }

  return <div className="flml-photo-library">
    <div className="flml-photo-controls">
      <nav className="flml-segments" aria-label={t('photoLibrary')}>{(['allPhotos', 'months', 'years', 'favorites'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => changeMode(value)}>{value === 'favorites' && <Heart size={14} />}{t(value)}</button>)}</nav>
      <div className="flml-photo-tools"><label className="flml-density"><SlidersHorizontal size={16} aria-hidden="true" /><input type="range" min={2} max={6} value={density} aria-label={t('gridSize')} onChange={event => setDensity(Number(event.target.value))} /></label><button type="button" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelection(new Set()) }}>{t(selecting ? 'done' : 'select')}</button></div>
    </div>
    {preferences.warning !== null && <p role="status" className="flml-notice">{t(preferences.warning)}</p>}
    <Folders {...props} />
    <div className="flml-section-heading"><div><h2>{period ?? t(mode)}</h2><span className="flml-muted">{visible.length} {t('photosCount')} · {t('modifiedDate')}</span></div>{period !== null && <button type="button" onClick={() => setPeriod(null)}><ChevronLeft size={16} />{t(mode === 'years' ? 'years' : 'months')}</button>}</div>
    {selecting && <div className="flml-selection-bar" role="status"><span>{selectedVisible.length} {t('selected')}</span>
      <button type="button" onClick={() => setSelection(new Set(visible.map(entry => entry.path)))}>{t('selectAll')}</button>
      <button type="button" disabled={selectedVisible.length === 0} onClick={() => setSelection(new Set())}>{t('clearSelection')}</button>
      <button type="button" disabled={selectedVisible.length === 0} onClick={() => preferences.toggle(selectedVisible.map(entry => entry.path))}><Heart size={16} />{t(selectedVisible.length > 0 && selectedVisible.every(entry => preferences.saved.includes(entry.path)) ? 'unfavorite' : 'favoriteSelected')}</button>
    </div>}
    {visible.length === 0 ? <p className="flml-state">{t(mode === 'favorites' ? 'noFavorites' : 'empty')}</p>
      : (mode === 'months' || mode === 'years') && period === null ? <div className="flml-collections">{groupPhotos(visible, mode === 'years' ? 'year' : 'month', t('languageTag')).map(group => <button type="button" className="flml-collection" key={group.key} onClick={() => setPeriod(group.key)} aria-label={group.title}>
        <div className="flml-collection-art">{group.entries.slice(0, 3).map(entry => <MediaImage key={entry.path} entry={entry} url={contentUrl(rootId, entry.path)} />)}</div><span>{group.title}</span><span className="flml-muted">{group.entries.length} {t('photosCount')}</span>
      </button>)}</div>
        : <div className="flml-photo-grid" style={{ '--photo-columns': density, '--photo-mobile-columns': Math.max(2, density - 2) } as CSSProperties}>{visible.map(entry => <button type="button" className={`flml-photo-tile${selection.has(entry.path) ? ' is-selected' : ''}`} key={entry.path} aria-label={`${t(selecting ? 'select' : 'preview')}: ${entry.name}`} aria-pressed={selecting ? selection.has(entry.path) : undefined} onClick={() => selectPhoto(entry)}>
          <MediaImage entry={entry} url={contentUrl(rootId, entry.path)} />
          {preferences.saved.includes(entry.path) && <Heart className="flml-photo-heart" size={17} fill="currentColor" aria-label={t('favorites')} />}
          {selecting && <span className="flml-photo-check">{selection.has(entry.path) && <Check size={16} />}</span>}
          <span className="flml-photo-caption">{entry.name}</span>
        </button>)}</div>}
    {active !== undefined && <Modal label={active.name} close={() => setOpened(null)} className="flml-photo-modal" onKeyDown={event => {
      if ((event.target as HTMLElement).matches('input,select,textarea')) return
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    }}>
      <div className="flml-modal-heading"><div><h2>{active.name}</h2><span className="flml-muted">{new Date(active.mtimeMs).toLocaleDateString(t('languageTag'), { year: 'numeric', month: 'long', day: 'numeric' })} · {index + 1} / {visible.length}</span></div><div className="flml-inline-controls"><button type="button" className="flml-icon" title={t(preferences.saved.includes(active.path) ? 'unfavorite' : 'favorite')} aria-label={t(preferences.saved.includes(active.path) ? 'unfavorite' : 'favorite')} aria-pressed={preferences.saved.includes(active.path)} onClick={() => preferences.toggle([active.path])}><Heart size={18} fill={preferences.saved.includes(active.path) ? 'currentColor' : 'none'} /></button><CloseButton close={() => setOpened(null)} t={t} /></div></div>
      {preferences.warning !== null && <p role="status" className="flml-notice">{t(preferences.warning)}</p>}
      <PhotoZoom key={active.path} entry={active} url={contentUrl(rootId, active.path)} t={t} />
      <div className="flml-photo-filmstrip"><button type="button" className="flml-icon" disabled={index <= 0} title={t('previous')} aria-label={t('previous')} onClick={() => move(-1)}><ChevronLeft size={20} /></button><div>{visible.map(entry => <button type="button" key={entry.path} aria-label={`${t('preview')}: ${entry.name}`} aria-current={entry.path === active.path ? 'true' : undefined} onClick={() => setOpened(entry.path)}><MediaImage entry={entry} url={contentUrl(rootId, entry.path)} /></button>)}</div><button type="button" className="flml-icon" disabled={index >= visible.length - 1} title={t('next')} aria-label={t('next')} onClick={() => move(1)}><ChevronRight size={20} /></button></div>
    </Modal>}
  </div>
}

function PhotoZoom({ entry, url, t }: { entry: Entry; url: string; t: MediaViewProps['t'] }) {
  const [zoom, setZoom] = useState(100)
  const [failed, setFailed] = useState(false)
  return <>
    <div className="flml-photo-stage">{entry.size > PREVIEW_LIMIT || previewKind(entry.ext) !== 'image' ? <p role="status">{t(entry.size > PREVIEW_LIMIT ? 'previewLimit' : 'unsupported')}</p> : failed ? <div role="alert"><p>{t('previewFailed')}</p><button type="button" onClick={() => setFailed(false)}>{t('retry')}</button></div> : <img className="flml-full-image" style={{ width: `${zoom}%`, height: zoom === 100 ? '100%' : 'auto', maxWidth: zoom === 100 ? '100%' : 'none' }} src={url} alt={entry.name} onError={() => setFailed(true)} />}</div>
    <div className="flml-zoom-controls"><button type="button" className="flml-icon" disabled={zoom <= 100} aria-label={t('zoomOut')} title={t('zoomOut')} onClick={() => setZoom(value => Math.max(100, value - 25))}><Minus size={16} /></button><input type="range" aria-label={t('zoom')} value={zoom} min={100} max={300} step={25} onChange={event => setZoom(Number(event.target.value))} /><button type="button" className="flml-icon" disabled={zoom >= 300} aria-label={t('zoomIn')} title={t('zoomIn')} onClick={() => setZoom(value => Math.min(300, value + 25))}><Plus size={16} /></button><button type="button" onClick={() => setZoom(100)}>{t('fit')}</button><output>{zoom}%</output></div>
  </>
}
