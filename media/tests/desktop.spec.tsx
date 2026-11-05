import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DesktopProps } from '../shared/Desktop.tsx'
import { Desktop } from '../shared/Desktop.tsx'
import type { Entry } from '../shared/api.ts'
import { FileApiError, PREVIEW_LIMIT } from '../shared/api.ts'
import { en, zh } from '../shared/locales.ts'

const entry = (path: string, kind: Entry['kind'] = 'file', size = 100): Entry => ({ path, name: path.split('/').at(-1)!, kind, size, ext: path.slice(path.lastIndexOf('.')), mtimeMs: 1 })

function mount(options: Partial<DesktopProps> = {}) {
  const props: DesktopProps = {
    kind: 'files', t: key => en[key],
    roots: vi.fn(async () => [{ id: 'one', name: 'One', path: '/one' }, { id: 'two', name: 'Two', path: '/two' }]),
    list: vi.fn(async () => [entry('movie.mp4'), entry('song.mp3'), entry('photo.jpg'), entry('notes.txt')]),
    library: vi.fn(async (rootId, signal) => ({ rootId, entries: (await props.list(rootId, '.', signal)).filter(item => item.kind === 'file'), truncated: false, incomplete: false })),
    contentUrl: (rootId, path) => `https://files.example/content?rootId=${rootId}&path=${path}`,
    ...options,
  }
  return { props, ...render(<Desktop {...props} />) }
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('independent desktops', () => {
  it.each(['movies', 'music', 'photos', 'files'] as const)('shows only matching files in %s', async kind => {
    const { container } = mount({ kind })
    await screen.findByRole('button', { name: kind === 'movies' ? 'Play: movie.mp4' : kind === 'music' ? 'Play: song.mp3' : kind === 'photos' ? 'Preview: photo.jpg' : 'Preview: notes.txt' })
    if (kind !== 'files') expect(screen.queryByRole('button', { name: /notes.txt/ })).toBeNull()
    expect([...container.querySelectorAll('button[aria-label^="Preview:"], button[aria-label^="Play:"]')].map(button => button.getAttribute('aria-label'))).toMatchSnapshot()
  })
  it('navigates folders and breadcrumbs without retaining old file selections', async () => {
    const list = vi.fn(async (_root: string, path: string) => path === '.' ? [entry('Music', 'directory')] : [entry('Music/song.mp3')])
    mount({ kind: 'music', list })
    fireEvent.click(await screen.findByRole('button', { name: 'Open: Music' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Play: song.mp3' }))
    expect(screen.getByRole('contentinfo', { name: 'Now playing' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Parent folder' }))
    await screen.findByRole('button', { name: 'Open: Music' })
    expect(screen.queryByRole('contentinfo', { name: 'Now playing' })).toBeNull()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled()
  })
  it('shows nested media on the library home and warns when results are incomplete', async () => {
    mount({ kind: 'movies', library: async () => ({ rootId: 'one', entries: [entry('Films/nested.mp4')], truncated: true, incomplete: false }) })
    expect(await screen.findByRole('button', { name: 'Play: nested.mp4' })).toBeDefined()
    expect(screen.getByText(en.libraryTruncated)).toBeDefined()
  })
  it('ignores late responses after root navigation even when a transport ignores abort', async () => {
    let finish: (entries: Entry[]) => void = () => { throw new Error('request has not started') }
    let firstSignal: AbortSignal | undefined
    const list = vi.fn((rootId: string, _path: string, signal: AbortSignal) => {
      if (rootId === 'two') return Promise.resolve([entry('new.jpg')])
      firstSignal = signal
      return new Promise<Entry[]>(resolve => { finish = resolve })
    })
    mount({ list })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByRole('combobox', { name: 'Library' }), { target: { value: 'two' } })
    await screen.findByRole('button', { name: 'Preview: new.jpg' })
    expect(firstSignal?.aborted).toBe(true)
    finish([entry('stale.jpg')])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Preview: stale.jpg' })).toBeNull())
  })
  it('preserves directory content on refresh failure and offers retry', async () => {
    const list = vi.fn().mockResolvedValueOnce([entry('photo.jpg')]).mockRejectedValueOnce(new FileApiError('unavailable')).mockResolvedValueOnce([entry('fresh.jpg')])
    mount({ list })
    await screen.findByRole('button', { name: 'Preview: photo.jpg' })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Preview: photo.jpg' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('button', { name: 'Preview: fresh.jpg' })
  })
  it('plays large movies through the host stream without the image preview limit', async () => {
    mount({ kind: 'movies', list: async () => [entry('large.mp4', 'file', PREVIEW_LIMIT + 1)] })
    fireEvent.click(await screen.findByRole('button', { name: 'Play: large.mp4' }))
    expect(screen.queryByText(en.previewLimit)).toBeNull()
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('video')).not.toBeNull()
  })
  it('advances the music queue, stops at the end, and cleans up media on unmount', async () => {
    const { container, unmount } = mount({ kind: 'music', list: async () => [entry('a.mp3'), entry('b.mp3')] })
    fireEvent.click(await screen.findByRole('button', { name: 'Play: a.mp3' }))
    fireEvent.ended(container.querySelector('audio')!)
    expect(container.querySelector('.flml-player h3')?.textContent).toBe('b')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next track' }).disabled).toBe(true)
    unmount()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(2)
  })
  it('uses Chinese product text and exposes root discovery failures', async () => {
    mount({ t: key => zh[key], roots: async () => { throw new FileApiError('unauthorized') } })
    expect((await screen.findByRole('alert')).textContent).toContain(zh.unauthorized)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(zh.files)
  })
  it('aborts text preview on selection changes and ignores its late settlement', async () => {
    let signal: AbortSignal | undefined
    const fetcher = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetcher)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Preview: notes.txt' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Preview: photo.jpg' }))
    expect(signal?.aborted).toBe(true)
  })
})
