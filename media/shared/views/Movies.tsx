/** Local video browsing, a browser-local watchlist, and file-specific resume positions. */
import { useMemo, useRef, useState } from 'react'
import { Bookmark, Check, ChevronLeft, ChevronRight, Film, Info, Play, Plus } from 'lucide-react'
import type { Entry } from '../api.ts'
import { formatSize } from '../files.ts'
import { artworkLookup, playable, timeLabel, titleOf } from '../media.ts'
import { useLibraryPreferences } from '../preferences.ts'
import { Preview } from '../Preview.tsx'
import { CloseButton, Folders, MediaImage, Modal, type MediaViewProps } from './common.tsx'

export function Movies(props: MediaViewProps) {
  const { entries, allEntries, rootId, t, contentUrl } = props
  const preferences = useLibraryPreferences(rootId, 'movies')
  const findArtwork = useMemo(() => artworkLookup(allEntries), [allEntries])
  const [tab, setTab] = useState<'home' | 'myList'>('home')
  const [selection, setSelection] = useState<{ entry: Entry; playing: boolean; start: number } | null>(null)
  const files = entries.filter(entry => entry.kind === 'file')
  const recent = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs)
  const saved = files.filter(entry => preferences.saved.includes(entry.path))
  const continuing = recent.filter(entry => preferences.progress(entry) !== undefined)
  const featured = continuing[0] ?? recent[0]

  function open(entry: Entry, playing: boolean) {
    setSelection({ entry, playing, start: preferences.progress(entry)?.position ?? 0 })
  }

  function card(entry: Entry) {
    const artwork = findArtwork(entry)
    const progress = preferences.progress(entry)
    const isSaved = preferences.saved.includes(entry.path)
    return <article className="flml-video-card" key={entry.path}>
      <button type="button" className="flml-video-open" onClick={() => open(entry, playable(entry))} aria-label={`${t(playable(entry) ? 'play' : 'preview')}: ${entry.name}`}>
        <span className="flml-video-art">
          {artwork !== undefined ? <MediaImage entry={artwork} url={contentUrl(rootId, artwork.path)} /> : <Film size={36} strokeWidth={1.3} aria-hidden="true" />}
          <span className="flml-format">{entry.ext.slice(1).toUpperCase()}</span>
          <span className="flml-video-play"><Play size={22} fill="currentColor" aria-hidden="true" /></span>
        </span>
        {progress !== undefined && <progress aria-label={`${t('continueWatching')}: ${entry.name}`} max={progress.duration} value={progress.position} />}
        <span className="flml-video-title">{titleOf(entry)}</span>
        <span className="flml-muted">{progress !== undefined ? `${timeLabel(progress.position)} / ${timeLabel(progress.duration)}` : formatSize(entry.size)}</span>
      </button>
      <button type="button" className="flml-icon flml-watchlist" title={t(isSaved ? 'removeFromList' : 'addToList')} aria-label={`${t(isSaved ? 'removeFromList' : 'addToList')}: ${entry.name}`} aria-pressed={isSaved} onClick={() => preferences.toggle([entry.path])}>{isSaved ? <Check size={17} /> : <Plus size={17} />}</button>
    </article>
  }

  const featureArt = featured === undefined ? undefined : findArtwork(featured)
  const selectionArt = selection === null ? undefined : findArtwork(selection.entry)
  return <div className="flml-cinema">
    <nav className="flml-media-tabs" aria-label={t('movies')}>
      <button type="button" aria-current={tab === 'home' ? 'page' : undefined} onClick={() => setTab('home')}>{t('home')}</button>
      <button type="button" aria-current={tab === 'myList' ? 'page' : undefined} onClick={() => setTab('myList')}><Bookmark size={15} />{t('myList')}<span>{saved.length}</span></button>
    </nav>
    {preferences.warning !== null && <p className="flml-notice" role="status">{t(preferences.warning)}</p>}
    <Folders {...props} />
    {tab === 'home' && featured !== undefined && <section className="flml-video-feature" aria-label={t('featured')}>
      {featureArt !== undefined && <MediaImage className="flml-feature-backdrop" entry={featureArt} url={contentUrl(rootId, featureArt.path)} />}
      <div className="flml-feature-scrim" />
      <div className="flml-feature-copy">
        <span className="flml-eyebrow">FILELOOM / {t('localLibrary')}</span>
        <h2>{titleOf(featured)}</h2>
        <p>{featured.ext.slice(1).toUpperCase()}<span> / </span>{formatSize(featured.size)}<span> / </span>{t('modified')}: {new Date(featured.mtimeMs).toLocaleDateString(t('languageTag'))}</p>
        <div className="flml-feature-actions">
          {playable(featured) && <button type="button" className="flml-primary" onClick={() => open(featured, true)}><Play size={17} fill="currentColor" />{t(preferences.progress(featured) ? 'resume' : 'play')}</button>}
          <button type="button" onClick={() => open(featured, false)}><Info size={17} />{t('details')}</button>
        </div>
      </div>
    </section>}
    {tab === 'home' && continuing.length > 0 && <VideoRail title={t('continueWatching')} previous={t('previous')} next={t('next')}>{continuing.map(card)}</VideoRail>}
    {tab === 'home' && recent.length > 0 && <VideoRail title={t('recentlyAdded')} previous={t('previous')} next={t('next')}>{recent.map(card)}</VideoRail>}
    {tab === 'myList' && <section className="flml-video-section"><h2>{t('myList')}</h2>{saved.length === 0 ? <p className="flml-state">{t('noSavedVideos')}</p> : <div className="flml-video-grid">{saved.map(card)}</div>}</section>}
    {files.length === 0 && tab === 'home' && <p className="flml-state">{t('empty')}</p>}
    {selection !== null && <Modal label={selection.entry.name} close={() => setSelection(null)} className={`flml-video-modal${selection.playing ? ' is-playing' : ''}`}>
      <div className="flml-modal-heading"><span>{t('details')}</span><CloseButton close={() => setSelection(null)} t={t} /></div>
      {selection.playing || !playable(selection.entry) ? <div className="flml-video-screen"><Preview key={`${selection.entry.path}/${selection.start}`} entry={selection.entry} url={contentUrl(rootId, selection.entry.path)} t={t} autoPlay={selection.playing} initialPosition={selection.start} onPosition={(position, duration) => preferences.saveProgress(selection.entry, position, duration)} onEnded={() => {}} /></div>
        : <div className="flml-video-detail-art"><MediaImage entry={selectionArt} url={selectionArt === undefined ? undefined : contentUrl(rootId, selectionArt.path)} /></div>}
      <div className="flml-video-detail-copy">
        {preferences.warning !== null && <p role="status" className="flml-notice">{t(preferences.warning)}</p>}
        <h2>{titleOf(selection.entry)}</h2>
        <div className="flml-feature-actions">
          {!selection.playing && playable(selection.entry) && <button type="button" className="flml-primary" onClick={() => setSelection({ ...selection, playing: true })}><Play size={17} fill="currentColor" />{t(selection.start > 0 ? 'resume' : 'play')}</button>}
          {selection.start > 0 && <button type="button" onClick={() => setSelection({ ...selection, playing: true, start: 0 })}>{t('startOver')}</button>}
          <button type="button" aria-pressed={preferences.saved.includes(selection.entry.path)} onClick={() => preferences.toggle([selection.entry.path])}><Bookmark size={17} />{t(preferences.saved.includes(selection.entry.path) ? 'removeFromList' : 'addToList')}</button>
        </div>
        <dl><dt>{t('path')}</dt><dd>{selection.entry.path}</dd><dt>{t('format')}</dt><dd>{selection.entry.ext.slice(1).toUpperCase()}</dd><dt>{t('size')}</dt><dd>{formatSize(selection.entry.size)}</dd></dl>
      </div>
    </Modal>}
  </div>
}

function VideoRail({ title, previous, next, children }: { title: string; previous: string; next: string; children: React.ReactNode }) {
  const rail = useRef<HTMLDivElement>(null)
  return <section className="flml-video-section">
    <div className="flml-section-heading"><h2>{title}</h2><div>
      <button type="button" className="flml-icon" aria-label={`${previous}: ${title}`} title={previous} onClick={() => rail.current?.scrollBy({ left: -rail.current.clientWidth * .8, behavior: 'smooth' })}><ChevronLeft size={18} /></button>
      <button type="button" className="flml-icon" aria-label={`${next}: ${title}`} title={next} onClick={() => rail.current?.scrollBy({ left: rail.current.clientWidth * .8, behavior: 'smooth' })}><ChevronRight size={18} /></button>
    </div></div>
    <div className="flml-video-rail" ref={rail}>{children}</div>
  </section>
}
