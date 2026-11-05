import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Movies } from '../shared/views/Movies.tsx'
import { Photos } from '../shared/views/Photos.tsx'
import { Music } from '../shared/views/Music.tsx'
import type { MediaViewProps } from '../shared/views/common.tsx'
import type { Entry } from '../shared/api.ts'
import { en } from '../shared/locales.ts'
import { fileIdentity } from '../shared/media.ts'

function entry(name: string, month = 0): Entry {
  return { path: name, name, kind: 'file', ext: name.slice(name.lastIndexOf('.')), size: 100, mtimeMs: new Date(2026, month, 10).getTime() }
}
function props(entries: Entry[]): MediaViewProps {
  return { rootId: 'root', path: '.', entries, allEntries: entries, t: key => en[key], navigate: vi.fn(), contentUrl: (root, path) => `https://files.example/${root}/${encodeURIComponent(path)}` }
}
afterEach(cleanup)

describe('video library', () => {
  it('persists the watchlist and limits the saved view to the current folder', () => {
    const entries = [entry('first.mp4'), entry('second.mp4')]
    const { unmount } = render(<Movies {...props(entries)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to my list: first.mp4' }))
    fireEvent.click(screen.getByRole('button', { name: /My list/ }))
    expect(screen.getByRole('button', { name: 'Play: first.mp4' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Play: second.mp4' })).toBeNull()
    unmount()
    render(<Movies {...props(entries)} />)
    expect(screen.getByRole('button', { name: 'Remove from my list: first.mp4' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('opens a playable poster directly in the video player', () => {
    const { container } = render(<Movies {...props([entry('first.mp4')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play: first.mp4' }))
    expect(screen.getByRole('dialog', { name: 'first.mp4' })).toBeDefined()
    expect(container.querySelector('video')).not.toBeNull()
  })
  it('resumes the exact video, persists a new position, and stops playback on modal close', () => {
    const movie = entry('first.mp4')
    localStorage.setItem('fileloom.media.v1.movies.root', JSON.stringify({ version: 1, saved: [], progress: [{ id: fileIdentity(movie), position: 15, duration: 120 }] }))
    const { container } = render(<Movies {...props([movie])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    const video = container.querySelector('video')!
    Object.defineProperty(video, 'duration', { configurable: true, value: 120 })
    fireEvent.loadedMetadata(video)
    expect(video.currentTime).toBe(15)
    video.currentTime = 35
    fireEvent.timeUpdate(video)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close preview' }))
    expect(container.querySelector('video')).toBeNull()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('fileloom.media.v1.movies.root')!).progress[0].position).toBe(35)
  })
  it('clears finished-video progress and closes details through native cancellation', () => {
    const movie = entry('first.mp4')
    const { container } = render(<Movies {...props([movie])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    const video = container.querySelector('video')!
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 })
    video.currentTime = 40
    fireEvent.timeUpdate(video)
    video.currentTime = 100
    fireEvent.ended(video)
    expect(JSON.parse(localStorage.getItem('fileloom.media.v1.movies.root')!).progress).toEqual([])
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('photo library', () => {
  it('drills into modification-month collections and returns to all photos', () => {
    render(<Photos {...props([entry('winter.jpg', 0), entry('spring.jpg', 3)])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Months' }))
    expect(screen.getByRole('button', { name: 'January 2026' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'January 2026' }))
    expect(screen.getByRole('button', { name: 'Preview: winter.jpg' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Preview: spring.jpg' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'All photos' }))
    expect(screen.getByRole('button', { name: 'Preview: spring.jpg' })).toBeDefined()
  })
  it('bulk-favorites only selected photos and restores favorites after remounting', () => {
    const files = [entry('one.jpg'), entry('two.jpg')]
    const { unmount } = render(<Photos {...props(files)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select: one.jpg' }))
    fireEvent.click(screen.getByRole('button', { name: 'Favorite selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }))
    expect(screen.getByRole('button', { name: 'Preview: one.jpg' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Preview: two.jpg' })).toBeNull()
    unmount()
    render(<Photos {...props(files)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }))
    expect(screen.getByRole('button', { name: 'Preview: one.jpg' })).toBeDefined()
  })
  it('supports keyboard navigation, zoom reset on selection, and cancellation', () => {
    render(<Photos {...props([entry('one.jpg'), entry('two.jpg')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview: one.jpg' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
    expect(within(dialog).getByRole<HTMLInputElement>('slider', { name: 'Zoom' }).value).toBe('125')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    dialog = screen.getByRole('dialog', { name: 'two.jpg' })
    expect(within(dialog).getByRole<HTMLInputElement>('slider', { name: 'Zoom' }).value).toBe('100')
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(screen.getByRole('dialog', { name: 'one.jpg' })).toBeDefined()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('keeps a storage failure visible inside the active lightbox', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    render(<Photos {...props([entry('one.jpg')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview: one.jpg' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to favorites' }))
    expect(within(dialog).getByText(en.storageWarning)).toBeDefined()
  })
})

describe('music library', () => {
  it('uses each track folder cover in the list and player', () => {
    const first = { ...entry('one.mp3'), path: 'First/one.mp3' }
    const second = { ...entry('two.mp3'), path: 'Second/two.mp3' }
    const firstCover = { ...entry('cover.jpg'), path: 'First/cover.jpg' }
    const secondCover = { ...entry('cover.jpg'), path: 'Second/cover.jpg' }
    const { container } = render(<Music {...props([first, second])} allEntries={[first, second, firstCover, secondCover]} />)
    expect(screen.getByRole('button', { name: 'Play: one.mp3' }).querySelector('img')?.getAttribute('src')).toContain(encodeURIComponent(firstCover.path))
    fireEvent.click(screen.getByRole('button', { name: 'Play: two.mp3' }))
    expect(container.querySelector('.flml-player-track img')?.getAttribute('src')).toContain(encodeURIComponent(secondCover.path))
  })
  it('keeps the queue and current playback intact when the visible filter changes', () => {
    const files = [entry('one.mp3'), entry('two.mp3')]
    const { container, rerender } = render(<Music {...props(files)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play: one.mp3' }))
    const audio = container.querySelector('audio')
    rerender(<Music {...props(files)} entries={[files[1]!]} />)
    expect(container.querySelector('audio')).toBe(audio)
    expect(within(screen.getByRole('complementary', { name: 'Queue' })).getAllByRole('listitem')).toHaveLength(2)
  })
  it('changes queue order, removes entries, and clears playback', () => {
    const { container } = render(<Music {...props([entry('one.mp3'), entry('two.mp3'), entry('three.mp3')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play next: three.mp3' }))
    const queue = within(screen.getByRole('complementary', { name: 'Queue' }))
    expect(queue.getAllByRole('listitem').map(item => item.textContent)).toEqual(['01one', '02three', '03two'])
    fireEvent.click(queue.getByRole('button', { name: 'Remove from queue: three.mp3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }))
    expect(container.querySelector('.flml-player h3')?.textContent).toBe('two')
    fireEvent.click(screen.getByRole('button', { name: 'Clear queue' }))
    expect(container.querySelector('audio')).toBeNull()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  })
  it('keeps volume across track changes and supports native seeking', () => {
    const { container } = render(<Music {...props([entry('one.mp3'), entry('two.mp3')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }))
    let audio = container.querySelector('audio')!
    Object.defineProperty(audio, 'duration', { configurable: true, value: 120 })
    fireEvent.loadedMetadata(audio)
    fireEvent.change(screen.getByRole('slider', { name: 'Playback position' }), { target: { value: '25' } })
    expect(audio.currentTime).toBe(25)
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '.35' } })
    expect(audio.volume).toBe(.35)
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(audio.muted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }))
    audio = container.querySelector('audio')!
    expect(audio.volume).toBe(.35)
    expect(audio.muted).toBe(true)
  })
  it('loops a one-track queue in repeat-all mode and exposes repeat-one to the browser', () => {
    const { container } = render(<Music {...props([entry('one.mp3')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Repeat off' }))
    const first = container.querySelector('audio')!
    fireEvent.ended(first)
    expect(container.querySelector('audio')).not.toBe(first)
    fireEvent.click(screen.getByRole('button', { name: 'Repeat all' }))
    expect(container.querySelector('audio')!.loop).toBe(true)
  })
  it('reports rejected playback without dropping the queue, then allows retry', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError')).mockResolvedValue(undefined)
    render(<Music {...props([entry('one.mp3')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }))
    expect((await screen.findByRole('alert')).textContent).toContain(en.playBlocked)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(within(screen.getByRole('complementary', { name: 'Queue' })).getAllByRole('listitem')).toHaveLength(1)
  })
})
