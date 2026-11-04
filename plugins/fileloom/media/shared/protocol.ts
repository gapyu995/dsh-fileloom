/** Minimal Client services used by these plugins; exercised against Fileloom's real Loader. */
import type { ComponentType } from 'react'
import type { CopyKey, Dictionary } from './locales.ts'

export interface PluginContext {
  effect(callback: () => () => void, label?: string): unknown
  layout: {
    panelInfo: {
      getSnapshot(): { readonly activePanelId: string | null }
      subscribe(listener: () => void): () => void
    }
  }
  theme: {
    overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
  }
  locale: {
    register(namespace: string, dictionaries: { en: Dictionary; zh: Dictionary }): () => void
    bind(namespace: string): (key: CopyKey) => string
  }
  slots: {
    inject(slot: string, register: () => () => void): unknown
    register<Props>(options: {
      name: string
      id?: string
      key?: string
      locale?: string
      order?: number
      label?: () => string
      inject?: () => Omit<Props, 't'>
    }, component: ComponentType<Props>): () => void
  }
}

export type DesktopKind = 'movies' | 'music' | 'photos' | 'files'
