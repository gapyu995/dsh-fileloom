/** File-based music library using the plugin-owned queue and native audio playback. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Disc3, ListMusic, Music2, Pause, Play, Plus, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import type { Entry } from '../api.ts'
import { formatSize, parentPath } from '../files.ts'
import { musicArtworkLookup, fileIdentity, playable, timeLabel, titleOf } from '../media.ts'
import { Folders, MediaImage, type MediaViewProps } from './common.tsx'
import { MusicSession, useMusicSession, type MusicState } from '../music-session.ts'
import type { FileApi } from '../api.ts'
import styles from '../styles.css'
import mediaStyles from '../media.css'

type RepeatMode = 'off' | 'all' | 'one'

export function Music(props: MediaViewProps) {
  const { entries, allEntries, rootId, contentUrl, t, path } = props
  const tracks = entries.filter(entry => entry.kind === 'file')
  const [localSession] = useState(() => new MusicSession())
  const session = props.musicSession ?? localSession
  const state = useMusicSession(session)
  const currentRoot = state.rootId === '' || state.rootId === rootId
  const queue = currentRoot ? state.queue : []
  const activePath = currentRoot ? state.activePath : null
  const [showQueue, setShowQueue] = useState(false)
  const { shuffle, playing } = state
  const setShuffle = (shuffle: boolean) => session.update({ shuffle })
  const [notice, setNotice] = useState<'unsupported' | 'queueLimit' | null>(null)
  const active = queue.find(entry => entry.path === activePath)
  const available = tracks.filter(playable)
  const artwork = useMemo(() => musicArtworkLookup(allEntries), [allEntries])
  const displayCover = active === undefined ? (tracks[0] === undefined ? undefined : artwork(tracks[0])) : artwork(active)
  const wall = [...new Map(tracks.flatMap(track => { const art = artwork(track); return art === undefined ? [] : [[art.path, art] as const] })).values()].slice(0, 12)
  const album = path === '.' ? t('localAudio') : path.split('/').at(-1) ?? t('localAudio')

  function updateSource(patch: Partial<MusicState>) {
    const covers = Object.fromEntries(tracks.flatMap(track => { const cover = artwork(track); return cover ? [[track.path, cover]] : [] }))
    const current = session.getSnapshot()
    const sameRoot = current.rootId === '' || current.rootId === rootId
    session.update({ ...(sameRoot ? {} : { queue: [], activePath: null, playing: false }), rootId, rootPath: props.rootPath ?? rootId, covers: { ...(sameRoot ? current.covers : {}), ...covers }, ...patch })
  }
  function setQueue(queue: Entry[]) { updateSource({ queue: queue.slice(0, 500) }) }
  function activate(path: string) { updateSource({}); session.activate(path) }
  function setActivePath(path: string | null) { if (path === null) session.clear(); else activate(path) }

  function play(entry: Entry) {
    if (!playable(entry)) { setNotice('unsupported'); return }
    setNotice(available.length > 500 ? 'queueLimit' : null)
    setQueue(available.indexOf(entry) >= 500 ? [entry, ...available.filter(item => item.path !== entry.path).slice(0, 499)] : available)
    activate(entry.path)
  }

  function enqueue(entry: Entry, immediatelyNext: boolean) {
    if (queue.length >= 500 && !queue.some(item => item.path === entry.path)) { setNotice('queueLimit'); return }
    const remaining = queue.filter(item => item.path !== entry.path)
    const current = remaining.findIndex(item => item.path === activePath)
    const insertAt = immediatelyNext && current >= 0 ? current + 1 : remaining.length
    const updated = [...remaining.slice(0, insertAt), entry, ...remaining.slice(insertAt)]
    setQueue(updated)
    if (activePath === null) activate(entry.path)
  }

  return <div className="flml-music-library">
    <Folders {...props} />
    <section className={`flml-album-heading${active !== undefined ? ' has-active-track' : ''}${active !== undefined && playing ? ' is-playing-track' : ''}`} aria-label={t('music')}>
      <div className="flml-album-wall" aria-hidden="true">{wall.map((entry, index) => <MediaImage key={entry.path} entry={entry} url={contentUrl(rootId, entry.path)} className={`flml-wall-tile wall-${index % 4}`} />)}</div>
      <div className="flml-album-veil" aria-hidden="true" />
      <div className="flml-album-stage"><div className="flml-album-art">{displayCover !== undefined ? <MediaImage entry={displayCover} url={contentUrl(rootId, displayCover.path)} /> : <Disc3 size={80} strokeWidth={1} aria-hidden="true" />}</div></div>
      <div className="flml-album-copy"><span className="flml-eyebrow">FILELOOM / {t('localAudio')}</span><h2>{album}</h2><p>{tracks.length} {t('tracks')} · {formatSize(tracks.reduce((sum, entry) => sum + entry.size, 0))}</p>
        {active !== undefined && <div className="flml-now-playing" role="status"><Music2 size={16} aria-hidden="true" /><span>{t('nowPlaying')}</span><strong>{titleOf(active)}</strong></div>}
        <div className="flml-feature-actions"><button type="button" className="flml-primary" disabled={available.length === 0} onClick={() => play(available[0]!)}><Play size={17} fill="currentColor" />{t('playAll')}</button><button type="button" aria-pressed={shuffle} disabled={available.length === 0} onClick={() => { setShuffle(!shuffle); if (active === undefined) play(available[0]!) }}><Shuffle size={17} />{t('shuffle')}</button></div>
      </div>
    </section>
    {notice !== null && <p className="flml-notice" role="status">{t(notice)}</p>}
    {state.warning && <p className="flml-notice" role="status">{t('storageWarning')}</p>}
    <div className="flml-section-heading"><h2>{t('songs')}</h2><button type="button" aria-pressed={showQueue} onClick={() => setShowQueue(!showQueue)}><ListMusic size={17} />{t('queue')}<span className="flml-count">{queue.length}</span></button></div>
    <div className={`flml-music-body${showQueue ? ' with-queue' : ''}`}>
      <div className="flml-track-list" role="list" aria-label={t('songs')}>
        {tracks.length === 0 ? <p className="flml-state">{t('empty')}</p> : tracks.map((entry, number) => {
          const art = artwork(entry)
          return <div className={`flml-track-row${entry.path === activePath ? ' is-playing' : ''}`} role="listitem" key={entry.path}>
          <button type="button" className="flml-track-open" aria-label={`${t('play')}: ${entry.name}`} onClick={() => play(entry)}><span className="flml-track-number">{entry.path === activePath ? <Music2 size={17} /> : String(number + 1).padStart(2, '0')}</span><MediaImage className="flml-track-art" entry={art} url={art === undefined ? undefined : contentUrl(rootId, art.path)} /><span className="flml-track-copy"><span>{titleOf(entry)}</span><span className="flml-muted">{parentPath(entry.path) === '.' ? t('localAudio') : parentPath(entry.path)} · {entry.ext.slice(1).toUpperCase()} · {formatSize(entry.size)}</span></span></button>
          <button type="button" className="flml-icon" disabled={!playable(entry) || entry.path === activePath} aria-label={`${t('playNext')}: ${entry.name}`} title={t('playNext')} onClick={() => enqueue(entry, true)}><ListMusic size={17} /></button>
          <button type="button" className="flml-icon" disabled={!playable(entry) || queue.some(item => item.path === entry.path)} aria-label={`${t('addToQueue')}: ${entry.name}`} title={t('addToQueue')} onClick={() => enqueue(entry, false)}>{queue.some(item => item.path === entry.path) ? <Check size={17} /> : <Plus size={17} />}</button>
        </div>})}
      </div>
      {showQueue && <aside className="flml-queue" aria-label={t('queue')}><div className="flml-section-heading"><h3>{t('queue')}</h3><button type="button" className="flml-icon" disabled={queue.length === 0} title={t('clearQueue')} aria-label={t('clearQueue')} onClick={() => { setQueue([]); setActivePath(null) }}><X size={17} /></button></div>
        {queue.length === 0 ? <p className="flml-muted">{t('nothingPlaying')}</p> : <ol>{queue.map((entry, number) => <li key={entry.path} className={entry.path === activePath ? 'is-playing' : ''}>
          <button type="button" aria-label={`${t('play')}: ${entry.name}`} onClick={() => activate(entry.path)}><span className="flml-muted">{String(number + 1).padStart(2, '0')}</span><span>{titleOf(entry)}</span></button>
          <button type="button" className="flml-icon" aria-label={`${t('removeFromQueue')}: ${entry.name}`} title={t('removeFromQueue')} onClick={() => {
            const updated = queue.filter(item => item.path !== entry.path)
            if (activePath === entry.path) setActivePath((queue[number + 1] ?? updated[number - 1])?.path ?? null)
            setQueue(updated)
          }}><X size={14} /></button>
        </li>)}</ol>}
      </aside>}
    </div>
    {props.musicSession === undefined && <SessionPlayer session={session} contentUrl={contentUrl} t={t} />}
  </div>
}

export function PersistentMusic({ session, api, t }: { session: MusicSession; api: FileApi; t: MediaViewProps['t'] }) {
  const state = useMusicSession(session)
  useEffect(() => {
    const controller = new AbortController()
    void session.restore(api, controller.signal)
    return () => { controller.abort() }
  }, [session, api])
  if (state.activePath === null) return null
  return <section className="flml-desktop flml-persistent-music" data-fileloom-desktop="music" aria-label={t('nowPlaying')}>
    <style>{styles}</style><style>{mediaStyles}</style>
    <SessionPlayer session={session} contentUrl={api.contentUrl} t={t} />
  </section>
}

function SessionPlayer({ session, contentUrl, t }: { session: MusicSession; contentUrl: FileApi['contentUrl']; t: MediaViewProps['t'] }) {
  const state = useMusicSession(session)
  const { queue, activePath, rootId, shuffle, repeat, volume, muted, playbackSerial } = state
  const active = queue.find(item => item.path === activePath)
  const index = queue.findIndex(item => item.path === activePath)
  const cover = activePath === null ? undefined : state.covers[activePath]
  if (active === undefined) return <footer className="flml-player-empty"><Music2 size={20} /><span>{t('nothingPlaying')}</span></footer>
  const isCurrent = () => session.getSnapshot().rootId === rootId && session.getSnapshot().activePath === activePath && session.getSnapshot().playbackSerial === playbackSerial
  return <>
    {state.warning && <p className="flml-player-warning" role="status">{t('storageWarning')}</p>}
    <MusicPlayer key={`${rootId}/${fileIdentity(active)}/${playbackSerial}`} entry={active} url={contentUrl(rootId, active.path)} artwork={cover} artworkUrl={cover === undefined ? undefined : contentUrl(rootId, cover.path)} t={t}
      previous={() => { const entry = queue[index - 1] ?? (repeat === 'all' ? queue.at(-1) : undefined); if (entry) session.activate(entry.path) }} next={() => session.next()} onEnded={() => session.next(true)}
      hasPrevious={index > 0 || repeat === 'all'} hasNext={index < queue.length - 1 || repeat === 'all' || (shuffle && queue.length > 1)}
      shuffle={shuffle} toggleShuffle={() => session.update({ shuffle: !shuffle })} repeat={repeat} toggleRepeat={() => session.update({ repeat: repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off' })}
      volume={volume} muted={muted} setVolume={volume => session.update({ volume })} setMuted={muted => session.update({ muted })} onPlayingChange={playing => { if (isCurrent()) session.update({ playing }, false) }}
      autoPlay={state.autoplay} initialPosition={state.position} onPosition={(position, force) => { if (isCurrent()) session.position(position, force) }} close={() => session.clear()} />
  </>
}

interface PlayerProps {
  entry: Entry; url: string; artwork: Entry | undefined; artworkUrl: string | undefined; t: MediaViewProps['t']
  previous: () => void; next: () => void; onEnded: () => void
  hasPrevious: boolean; hasNext: boolean; shuffle: boolean; toggleShuffle: () => void
  repeat: RepeatMode; toggleRepeat: () => void
  volume: number; muted: boolean; setVolume: (value: number) => void; setMuted: (value: boolean) => void
  onPlayingChange: (playing: boolean) => void
  autoPlay: boolean; initialPosition: number; onPosition: (position: number, force?: boolean) => void; close: () => void
}

function MusicPlayer(props: PlayerProps) {
  const { entry, url, artwork, artworkUrl, t, previous, next, hasPrevious, hasNext, shuffle, toggleShuffle, repeat, toggleRepeat, onEnded, volume, muted, setVolume, setMuted, onPlayingChange, autoPlay, initialPosition, onPosition, close } = props
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [failed, setFailed] = useState<'playBlocked' | 'previewFailed' | null>(null)
  const mounted = useRef(true)

  function start() {
    const element = audio.current
    if (!element) return
    setFailed(null)
    void element.play().catch((_playbackRejected: unknown) => { if (mounted.current) setFailed('playBlocked') })
  }

  useEffect(() => {
    if (audio.current) { audio.current.volume = volume; audio.current.muted = muted }
  }, [volume, muted])

  useEffect(() => {
    mounted.current = true
    const element = audio.current
    if (element) {
      element.src = url
      if (autoPlay) void element.play().catch((_playbackRejected: unknown) => { if (mounted.current) setFailed('playBlocked') })
    }
    return () => {
      mounted.current = false
      element?.pause()
      element?.removeAttribute('src')
      element?.load()
    }
  }, [])

  return <footer className="flml-player" aria-label={t('nowPlaying')}>
    <audio ref={audio} src={url} preload="metadata" loop={repeat === 'one'} onPlay={() => { setPlaying(true); onPlayingChange(true) }} onPause={event => { setPlaying(false); onPlayingChange(false); onPosition(event.currentTarget.currentTime, true) }} onEnded={() => { onPlayingChange(false); onEnded() }}
      onTimeUpdate={event => { setTime(event.currentTarget.currentTime); onPosition(event.currentTarget.currentTime) }} onLoadedMetadata={event => {
        const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0
        setDuration(duration)
        if (initialPosition > 0 && duration > 0) { event.currentTarget.currentTime = Math.min(initialPosition, Math.max(0, duration - 1)); setTime(event.currentTarget.currentTime) }
      }} onError={() => { onPlayingChange(false); setFailed('previewFailed') }} />
    <div className="flml-player-track"><MediaImage entry={artwork} url={artworkUrl} /><div><h3>{titleOf(entry)}</h3><span className="flml-muted">{t('localAudio')} · {entry.ext.slice(1).toUpperCase()}</span></div></div>
    <div className="flml-player-center"><div className="flml-player-buttons">
      <button type="button" className="flml-icon" aria-label={t('shuffle')} title={t('shuffle')} aria-pressed={shuffle} onClick={toggleShuffle}><Shuffle size={16} /></button>
      <button type="button" className="flml-icon" aria-label={t('previousTrack')} title={t('previousTrack')} disabled={!hasPrevious && time <= 3} onClick={() => { if (time > 3 && audio.current) audio.current.currentTime = 0; else previous() }}><SkipBack size={19} fill="currentColor" /></button>
      <button type="button" className="flml-icon flml-play-toggle" aria-label={t(playing ? 'pause' : 'play')} title={t(playing ? 'pause' : 'play')} onClick={() => { if (playing) audio.current?.pause(); else start() }}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
      <button type="button" className="flml-icon" aria-label={t('nextTrack')} title={t('nextTrack')} disabled={!hasNext} onClick={next}><SkipForward size={19} fill="currentColor" /></button>
      <button type="button" className="flml-icon" aria-label={t(repeat === 'off' ? 'repeatOff' : repeat === 'all' ? 'repeatAll' : 'repeatOne')} title={t('repeat')} aria-pressed={repeat !== 'off'} onClick={toggleRepeat}>{repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}</button>
    </div><div className="flml-seek"><span>{timeLabel(time)}</span><input type="range" aria-label={t('seek')} min={0} max={duration || 1} step={.1} value={Math.min(time, duration || 1)} disabled={duration === 0} onChange={event => { if (audio.current) { audio.current.currentTime = Number(event.target.value); setTime(Number(event.target.value)) } }} /><span>{timeLabel(duration)}</span></div></div>
    <div className="flml-player-volume"><button type="button" className="flml-icon" aria-label={t(muted ? 'unmute' : 'mute')} title={t(muted ? 'unmute' : 'mute')} onClick={() => { if (audio.current) audio.current.muted = !muted; setMuted(!muted) }}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><input type="range" aria-label={t('volume')} min={0} max={1} step={.05} value={muted ? 0 : volume} onChange={event => { const value = Number(event.target.value); if (audio.current) { audio.current.volume = value; audio.current.muted = false }; setVolume(value); setMuted(false) }} /><button type="button" className="flml-icon" aria-label={t('close')} title={t('close')} onClick={close}><X size={17} /></button></div>
    {failed !== null && <div className="flml-player-error" role="alert"><span>{t(failed)}</span><button type="button" onClick={start}>{t('retry')}</button></div>}
  </footer>
}
