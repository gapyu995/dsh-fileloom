// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { FileManagerApi, type RecentEntry } from '../src/client/api.ts'
import { HomePage } from '../src/client/pages/HomePage.tsx'
import { en, zh } from '../src/client/locales.ts'

type Props = ComponentProps<typeof HomePage>

function entry(n: number): RecentEntry {
  return {
    ingestId: `ingest-${n}`, path: `Inbox/report-${n}.pdf`, name: `report-${n}.pdf`,
    size: 1024, ingestedAt: '2026-11-04T00:00:00Z', modifiedAt: '2026-11-04T00:00:00Z',
    source: 'upload', originalName: `report-${n}.pdf`, sha256: 'test', indexed: true, inInbox: true,
  }
}

function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    api: new FileManagerApi(), root: { id: 'test', name: 'Test root', path: '/test' },
    rootId: 'test', t: key => en[key], indexStatus: null,
    recent: { rootId: 'test', inboxPath: 'Inbox', pendingCount: 0, entries: [] },
    operations: [], notify: vi.fn(), refresh: vi.fn(async () => {}), navigate: vi.fn(), openPath: vi.fn(),
    ...overrides,
  }
  return { ...render(<HomePage {...props} />), props }
}

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Fileloom home workspace', () => {
  it('separates file sections from the action rail in both locales', () => {
    for (const dictionary of [en, zh]) {
      const { container, unmount } = mount({ t: key => dictionary[key] })
      expect([...container.querySelectorAll('h1, h2')].map(node => node.textContent)).toMatchSnapshot()
      const rail = screen.getByRole('complementary')
      expect(within(rail).getByRole('button', { name: dictionary.upload })).toBeDefined()
      expect(within(rail).queryByRole('heading', { name: dictionary.recentFiles })).toBeNull()
      expect(container.querySelector('dl')?.textContent).toContain('--')
      unmount()
    }
  })

  it('opens the file browser from the workspace header', () => {
    const { props } = mount()
    fireEvent.click(screen.getAllByRole('button', { name: en.browseFiles })[0]!)
    expect(props.navigate).toHaveBeenCalledWith('files')
  })

  it('expands recent files, collapses them, and opens a selected file', () => {
    const { props } = mount({ recent: { rootId: 'test', inboxPath: 'Inbox', pendingCount: 10, entries: Array.from({ length: 10 }, (_, n) => entry(n)) } })
    expect(screen.queryByRole('button', { name: /report-9.pdf/ })).toBeNull()
    const section = screen.getByRole('heading', { name: /Recent files/ }).closest('section')!
    fireEvent.click(within(section).getByRole('button', { name: en.seeAll }))
    fireEvent.click(screen.getByRole('button', { name: /report-9.pdf/ }))
    expect(props.openPath).toHaveBeenCalledWith('Inbox', 'Inbox/report-9.pdf')
    fireEvent.click(within(section).getByRole('button', { name: en.showLess }))
    expect(screen.queryByRole('button', { name: /report-9.pdf/ })).toBeNull()
  })

  it('routes pending work to the inbox and keeps scan actions separate', () => {
    const { props } = mount({
      recent: { rootId: 'test', inboxPath: 'Incoming', pendingCount: 2, entries: [] },
      indexStatus: { rootId: 'test', root: '/test', inboxPath: 'Incoming', maxScanFiles: 20000, planTtlHours: 24, index: null },
    })
    fireEvent.click(screen.getByRole('button', { name: en.recInboxAction }))
    expect(props.navigate).toHaveBeenCalledWith('organize', 'Incoming')
    fireEvent.click(screen.getByRole('button', { name: en.recIndexAction }))
    expect(props.navigate).toHaveBeenCalledWith('organize')
  })

  it('uses scan totals without presenting an absent scan as zero files', () => {
    const { container } = mount({ indexStatus: {
      rootId: 'test', root: '/test', inboxPath: 'Inbox', maxScanFiles: 20000, planTtlHours: 24,
      index: { scanId: 'scan', scope: '.', scannedAt: '2026-11-04', fileCount: 42, totalBytes: 2048, truncated: false, warnings: [] },
    } })
    expect([...container.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['42', '2.0 KB', '0'])
  })

  it('reopens browser-local files and continues the last folder', () => {
    window.localStorage.setItem('data-steward.opened.test', JSON.stringify([{ path: 'Work/notes.md', name: 'notes.md', at: '2026-11-04T00:00:00Z' }]))
    window.localStorage.setItem('data-steward.lastPath.test', JSON.stringify('Work'))
    const { props } = mount()
    fireEvent.click(screen.getByRole('button', { name: /notes.md/ }))
    expect(props.openPath).toHaveBeenCalledWith('Work', 'Work/notes.md')
    fireEvent.click(screen.getByRole('button', { name: en.recContinueAction }))
    expect(props.openPath).toHaveBeenCalledWith('Work')
  })

  it('keeps the native upload button keyboard accessible without nested buttons', () => {
    const { container } = mount()
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: en.upload }))
    expect(pick).toHaveBeenCalledOnce()
    expect(container.querySelector('[role="button"] button')).toBeNull()
  })
})
