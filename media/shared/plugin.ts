/** Mount one independent desktop; no process-global selection or DOM registration side effects. */
import { createFileApi } from './api.ts'
import { Desktop, DesktopIcon } from './Desktop.tsx'
import { en, zh } from './locales.ts'
import type { DesktopKind, PluginContext } from './protocol.ts'
import { followDesktopTheme } from './navigation-theme.ts'
import { MusicSession } from './music-session.ts'
import { PersistentMusic } from './views/Music.tsx'

export function mountDesktop(ctx: PluginContext, kind: DesktopKind): void {
  const namespace = `fileloomDesktop${kind}`
  const panel = `fileloom-${kind}`
  ctx.effect(() => ctx.locale.register(namespace, { en, zh }), `${panel}: locale`)
  const t = ctx.locale.bind(namespace)
  const api = createFileApi(window.location.origin)
  const musicSession = kind === 'music' ? new MusicSession(true) : undefined
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panel, locale: namespace, inject: () => ({ kind, ...api, musicSession }) }, Desktop))
  if (musicSession !== undefined) ctx.slots.inject('shell.bottom', () => ctx.slots.register({ name: 'shell.bottom', locale: namespace, inject: () => ({ session: musicSession, api }) }, PersistentMusic))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: panel, order: 10, label: () => t(kind), inject: () => ({ kind }) }, DesktopIcon))
  followDesktopTheme(ctx, kind)
}
