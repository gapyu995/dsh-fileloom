/** Browser half: the Data Steward main panel, sidebar entry, brand, and theme accent. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { FileManagerPage, type FileManagerFace } from './FileManagerPage.tsx'
import { FileManagerApi } from './api.ts'
import { BrandMark, BrandName, StewardPanelIcon } from './Brand.tsx'
import { en, zh, type FileManagerKey } from './locales.ts'

export const name = 'ui-file-manager'

/** Browser services: slots, copy, layout switching, and the theme override layer. */
export const inject = ['slots', 'locale', 'layout', 'theme']

const NS = 'fileManager'
const PANEL_ID = 'steward' as MainPanelId

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Data Steward page copy. */
    fileManager: FileManagerKey
  }
}

/**
 * Register the file-manager page and its shell contributions.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-file-manager: dictionaries')
  ctx.effect(() => ctx.theme.overrideTokens('data-steward', {
    '--dsw-alias-brand-primary': { light: '#0b6b57', dark: '#7ee8c8' },
    '--dsw-specific-sidebar-fill': { light: '#f4f9f6', dark: '#151a18' },
  }), 'ui-file-manager: theme accent')

  const t = ctx.locale.bind(NS)
  const face: FileManagerFace = {
    api: new FileManagerApi(),
    openChat: () => ctx.layout.selectPanel('conversation' as MainPanelId),
  }

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => face,
  }, FileManagerPage))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: -10,
    label: () => t('panel'),
    locale: NS,
  }, StewardPanelIcon))

  // The official brand plugin is removed from the Web roster in this fork.
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
    yield ctx.slots.register({ name: 'sidebar.brand.mark' }, BrandMark)
    yield ctx.slots.register({ name: 'sidebar.brand.name' }, BrandName)
  }))
}
