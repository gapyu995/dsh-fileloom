/** jsdom lacks native modal and media implementations; real browser checks cover those APIs. */
import { beforeEach, vi } from 'vitest'

beforeEach(() => {
  if (typeof window === 'undefined') return
  window.localStorage.clear()
  if (!('showModal' in HTMLDialogElement.prototype)) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value() {} })
  if (!('close' in HTMLDialogElement.prototype)) Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, writable: true, value() {} })
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open') })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event('play')); return Promise.resolve() })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event('pause')) })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
