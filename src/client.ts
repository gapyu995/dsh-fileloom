/** Fileloom panels inside the existing DSH shell; no global brand replacement. */
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { FileManagerPage } from '../management/client/src/client/FileManagerPage.tsx'
import { FileManagerApi } from '../management/client/src/client/api.ts'
import { StewardPanelIcon } from '../management/client/src/client/Brand.tsx'
import { en, zh } from '../management/client/src/client/locales.ts'
import { mountDesktop } from '../media/shared/plugin.ts'
import type { PluginContext } from '../media/shared/protocol.ts'
import styles from 'fileloom:styles'

export const name = 'fileloom'
export const inject = ['slots', 'locale', 'layout', 'theme']

/**
 * Mount management and media panels with plugin-owned styles and registrations.
 * @param ctx - DSH browser context with the declared services available.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-plugin-fileloom'
    tag.textContent = styles
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'fileloom: styles')

  ctx.plugin({
    name: 'fileloom-management',
    inject,
    apply(child: Context) {
      child.effect(() => child.locale.register('fileManager', { en, zh }), 'fileloom: management copy')
      const t = child.locale.bind('fileManager')
      child.slots.inject('main', () => child.slots.register({
        name: 'main', key: 'steward' as MainPanelId, locale: 'fileManager',
        inject: () => ({ api: new FileManagerApi(), openChat: () => child.layout.selectPanel('conversation' as MainPanelId) }),
      }, FileManagerPage))
      child.slots.inject('sidebar.panellist', () => child.slots.register({
        name: 'sidebar.panellist', id: 'steward' as MainPanelId, order: -10,
        label: () => t('panel'), locale: 'fileManager',
      }, StewardPanelIcon))
    },
  })
  for (const kind of ['movies', 'music', 'photos', 'files'] as const) {
    ctx.plugin({
      name: `fileloom-${kind}`,
      inject,
      apply(child: PluginContext) { mountDesktop(child, kind) },
    })
  }
}
