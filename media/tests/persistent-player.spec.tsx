import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Music } from '../shared/views/Music.tsx'
import { PersistentMusic } from '../shared/views/Music.tsx'
import { MusicSession } from '../shared/music-session.ts'
import { en, type Translate } from '../shared/locales.ts'
import type { Entry, FileApi } from '../shared/api.ts'

afterEach(cleanup)
const t: Translate = key => en[key]
const tracks: Entry[] = ['one.wav', 'two.wav'].map(path => ({ path, name: path, ext: '.wav', kind: 'file', size: 42, mtimeMs: 1 }))
const api: FileApi = {
  roots: async () => [{ id: 'root', name: 'Media', path: '/media' }], list: async () => tracks,
  library: async rootId => ({ rootId, entries: tracks, scannedAt: new Date().toISOString(), truncated: false, incomplete: false }),
  contentUrl: (_rootId, path) => `/content/${path}`,
}

describe('shell music player', () => {
  it('keeps the same audio element and advances the queue after the library unmounts', () => {
    const session = new MusicSession()
    function App({ library }: { library: boolean }) {
      return <>
        {library && <Music rootId="root" rootPath="/media" path="." entries={tracks} allEntries={tracks} contentUrl={api.contentUrl} t={t} navigate={() => {}} musicSession={session} />}
        <PersistentMusic session={session} api={api} t={t} />
      </>
    }
    const { container, rerender } = render(<App library />)
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }))
    const audio = container.querySelector('audio')!
    rerender(<App library={false} />)
    expect(container.querySelector('audio')).toBe(audio)
    fireEvent.ended(audio)
    expect(session.getSnapshot().activePath).toBe('two.wav')
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('/content/two.wav')
  })
})
