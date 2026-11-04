/** Read-only product settings: roots, runtime limits, shortcuts, and about. */

import type { ReactNode } from 'react'
import type { IndexResponse, RootConfig, RootInfo } from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import { Badge, Icon } from '../components/ui.tsx'
import css from '../FileManagerPage.module.css'

export function SettingsPage({
  roots, config, rootId, indexStatus, t,
}: {
  roots: RootInfo[]
  config: RootConfig | null
  rootId: string
  indexStatus: IndexResponse | null
  t: (key: FileManagerKey) => string
}): ReactNode {
  return (
    <div className={css.pageScroll}>
      <div className={css.pageHead}>
        <div>
          <h1>{t('settingsTitle')}</h1>
          <p>{t('rootsHint')}</p>
        </div>
      </div>

      <div className={css.settingsGrid}>
        <section className={css.settingsCard}>
          <h2><Icon name="folder" /> {t('rootsTitle')}</h2>
          <div className={css.rootCards}>
            {roots.map(root => (
              <div key={root.id} className={root.id === rootId ? `${css.rootCard} ${css.rootCardActive}` : css.rootCard}>
                <div className={css.rootCardHead}>
                  <strong>{root.name}</strong>
                  {root.id === rootId ? <Badge tone="brand">{t('current')}</Badge> : null}
                </div>
                <span className={css.monoSmall}>{root.path}</span>
                <span className={css.mutedSmall}>{root.id}</span>
              </div>
            ))}
          </div>
          <p className={css.mutedSmall}>{t('rootsHint')}</p>
        </section>

        <section className={css.settingsCard}>
          <h2><Icon name="settings" /> {t('configTitle')}</h2>
          <dl className={css.settingsList}>
            <dt>{t('configScanLimit')}</dt><dd>{config === null ? '—' : String(config.maxScanFiles)}</dd>
            <dt>{t('configPlanTtl')}</dt><dd>{config === null ? '—' : t('configPlanTtlValue').replace('{hours}', String(config.planTtlHours))}</dd>
            <dt>{t('stateTitle')}</dt><dd>{indexStatus?.index === null || indexStatus === null ? t('notConfigured') : indexStatus.index?.scanId ?? '—'}</dd>
            <dt>{t('indexState')}</dt><dd>{indexStatus?.index === null || indexStatus === null ? t('indexMissing') : indexStatus.index?.scope ?? '—'}</dd>
          </dl>
          <p className={css.mutedSmall}>{t('stateHint')}</p>
        </section>

        <section className={css.settingsCard}>
          <h2><Icon name="history" /> {t('shortcutsTitle')}</h2>
          <dl className={css.shortcutList}>
            <dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>{t('shortcutSearch')}</dd>
            <dt><kbd>Esc</kbd></dt><dd>{t('shortcutClose')}</dd>
          </dl>
        </section>

        <section className={css.settingsCard}>
          <h2><Icon name="sparkle" /> {t('aboutTitle')}</h2>
          <p className={css.mutedSmall}>{t('aboutText')}</p>
          <p className={css.mutedSmall}>{t('aiHint')}</p>
          <span className={css.versionTag}>{t('fileManagerVersion')}</span>
        </section>
      </div>
    </div>
  )
}
