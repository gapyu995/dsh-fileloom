// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Dialog, ConfirmDialog } from '../src/client/components/ui.tsx'
import { FilesPage } from '../src/client/pages/FilesPage.tsx'
import { FileManagerApi } from '../src/client/api.ts'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear() })

describe('management dialogs', () => {
  it('blocks close, Escape and backdrop dismissal while work is pending', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Dialog title="Working" closeLabel={en.close} busy onClose={onClose}><button type="button">Action</button></Dialog>)
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(dialog.parentElement!)
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    expect(onClose).not.toHaveBeenCalled()
    rerender(<Dialog title="Working" closeLabel={en.close} onClose={onClose}><button type="button">Action</button></Dialog>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('traps keyboard focus and restores the triggering element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    try {
      const { unmount } = render(<Dialog title="Details" closeLabel={en.close} onClose={() => {}}><button type="button">Last</button></Dialog>)
      const first = screen.getByRole('button', { name: en.close })
      const last = screen.getByRole('button', { name: 'Last' })
      last.focus()
      fireEvent.keyDown(document, { key: 'Tab' })
      expect(document.activeElement).toBe(first)
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(last)
      unmount()
      expect(document.activeElement).toBe(trigger)
    } finally { trigger.remove() }
  })

  it('keeps destructive confirmations mounted while their action runs', () => {
    const cancel = vi.fn()
    render(<ConfirmDialog title="Confirm" message="Pending" confirmLabel={en.delete} cancelLabel={en.cancel} busy onConfirm={() => {}} onCancel={cancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(cancel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true')
  })
})

describe('file preview access', () => {
  it('opens a modal from row activation even when the desktop details column is absent', async () => {
    const api = new FileManagerApi()
    vi.spyOn(api, 'list').mockResolvedValue({ rootId: 'root', path: '.', entries: [
      { kind: 'file', path: 'note.txt', name: 'note.txt', stem: 'note', ext: '.txt', size: 8, mtimeMs: 0 },
    ] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('File preview')))
    render(<FilesPage api={api} root={{ id: 'root', name: 'Files', path: '/files' }} rootId="root" path="." onPathChange={() => {}} t={key => en[key]} notify={() => {}} onRootDataChanged={async () => {}} />)
    const row = await screen.findByRole('row', { name: /note.txt/ })
    fireEvent.keyDown(row, { key: 'Enter' })
    const dialog = screen.getByRole('dialog', { name: 'note.txt' })
    expect(await within(dialog).findByText('File preview')).toBeDefined()
    expect(within(dialog).getByRole('link', { name: en.download })).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.doubleClick(row)
    expect(screen.getByRole('dialog', { name: 'note.txt' })).toBeDefined()
  })
})
