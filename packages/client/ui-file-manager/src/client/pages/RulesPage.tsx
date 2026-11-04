/** Readable rule list with an optional advanced JSON editor. */

import { useEffect, useState, type ReactNode } from 'react'
import type { FileManagerApi, RuleDocument } from '../api.ts'
import type { FileManagerKey } from '../locales.ts'
import { errorText, formatBytes } from '../utils.ts'
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorBanner, Icon, Spinner, TextField,
} from '../components/ui.tsx'
import css from '../FileManagerPage.module.css'

export function RulesPage({
  api, rootId, t, notify,
}: {
  api: FileManagerApi
  rootId: string
  t: (key: FileManagerKey) => string
  notify: (message: string) => void
}): ReactNode {
  const [doc, setDoc] = useState<RuleDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [saveConfirm, setSaveConfirm] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const rules = await api.rules(rootId)
      setDoc(rules)
      setText(JSON.stringify({ version: 1, rules: rules.rules }, null, 2))
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [api, rootId])

  const validate = (value: string): unknown | undefined => {
    try {
      const parsed = JSON.parse(value) as { version?: unknown; rules?: unknown }
      if (parsed.version !== 1 || !Array.isArray(parsed.rules)) throw new Error(t('jsonShapeError'))
      setJsonError('')
      return parsed
    } catch (caught) {
      setJsonError(t('jsonInvalid').replace('{message}', errorText(caught)))
      return undefined
    }
  }

  const save = async (): Promise<void> => {
    const parsed = validate(text)
    if (parsed === undefined) return
    setBusy(true)
    setError('')
    try {
      const saved = await api.saveRules(rootId, parsed)
      setDoc(saved)
      setText(JSON.stringify({ version: 1, rules: saved.rules }, null, 2))
      setEditing(false)
      setSaveConfirm(false)
      notify(t('rulesSaved'))
    } catch (caught) {
      setError(errorText(caught))
      setSaveConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  const reset = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const saved = await api.resetRules(rootId)
      setDoc(saved)
      setText(JSON.stringify({ version: 1, rules: saved.rules }, null, 2))
      setEditing(false)
      setResetConfirm(false)
      notify(t('rulesReset'))
    } catch (caught) {
      setError(errorText(caught))
      setResetConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.pageScroll}>
      <div className={css.pageHead}>
        <div>
          <h1>{t('rulesTitle')}</h1>
          <p>{t('rulesIntro')}</p>
        </div>
        <div className={css.headActions}>
          {doc !== null && doc.source === 'user' ? (
            <Button size="sm" variant="ghost" icon="undo" onClick={() => setResetConfirm(true)}>{t('resetDefaults')}</Button>
          ) : null}
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setJsonError(''); if (doc !== null) setText(JSON.stringify({ version: 1, rules: doc.rules }, null, 2)) }}>{t('cancelEdit')}</Button>
              <Button size="sm" variant="primary" icon="check" onClick={() => setSaveConfirm(true)} disabled={jsonError !== ''}>{t('saveRules')}</Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(true)}>{t('edit')}</Button>
          )}
        </div>
      </div>

      {error !== '' ? <ErrorBanner message={error} retryLabel={t('retry')} onRetry={() => void load()} /> : null}
      {loading ? <div className={css.centerState}><Spinner /> {t('loading')}</div> : null}

      {doc !== null && !loading ? (
        <>
          <div className={css.ruleMeta}>
            <Badge tone={doc.source === 'user' ? 'brand' : 'neutral'}>{doc.source === 'user' ? t('rulesCustom') : t('rulesBuiltin')}</Badge>
            <span>{t('ruleCount').replace('{count}', String(doc.count))}</span>
            <span className={css.monoSmall}>{doc.userRulesPath}</span>
          </div>
          <p className={css.sectionSub}>{t('rulesSourceHint').replace('{source}', doc.source === 'user' ? t('rulesCustom') : t('rulesBuiltin'))}</p>

          {editing ? (
            <div className={css.ruleEditorLayout}>
              <div className={css.editorCard}>
                <TextField
                  label={t('advancedJson')}
                  textarea
                  value={text}
                  spellCheck={false}
                  onChange={(event) => { setText(event.target.value); validate(event.target.value) }}
                  className={css.jsonField}
                />
                {jsonError === '' ? null : <ErrorBanner message={jsonError} />}
              </div>
              <aside className={css.editorSide}>
                <h3>{t('ruleVariablesTitle')}</h3>
                <p>{t('ruleHelp')}</p>
                <p className={css.mutedSmall}>{t('saveRulesBody')}</p>
              </aside>
            </div>
          ) : doc.rules.length === 0 ? (
            <EmptyState icon="rules" title={t('noRules')} />
          ) : (
            <div className={css.ruleList}>
              {doc.rules.map(rule => (
                <article key={rule.id} className={css.ruleCard}>
                  <div className={css.ruleCardHead}>
                    <span className={css.ruleLabel}><Icon name="rules" size={16} /> {rule.label}</span>
                    <Badge tone="neutral">{rule.category}</Badge>
                    <span className={css.rulePriority}>{t('priority')} {rule.priority}</span>
                  </div>
                  <div className={css.ruleMatch}>
                    <span className={css.ruleFieldLabel}>{t('match')}</span>
                    <span>{matcherText(rule, t)}</span>
                  </div>
                  <div className={css.ruleTarget}>
                    <span className={css.ruleFieldLabel}>{t('target')}</span>
                    <span className={css.monoSmall}>{rule.target}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}

      {saveConfirm ? (
        <ConfirmDialog
          title={t('saveRulesTitle')}
          message={t('saveRulesBody')}
          confirmLabel={t('saveAnyway')}
          cancelLabel={t('cancel')}
          busy={busy}
          onCancel={() => setSaveConfirm(false)}
          onConfirm={() => void save()}
        />
      ) : null}
      {resetConfirm ? (
        <ConfirmDialog
          title={t('resetTitle')}
          message={t('resetBody')}
          confirmLabel={t('resetDefaults')}
          cancelLabel={t('cancel')}
          tone="danger"
          busy={busy}
          onCancel={() => setResetConfirm(false)}
          onConfirm={() => void reset()}
        />
      ) : null}
    </div>
  )
}

function matcherText(rule: RuleDocument['rules'][number], t: (key: FileManagerKey) => string): string {
  const parts: string[] = []
  if (rule.extensions !== undefined && rule.extensions.length > 0) parts.push(rule.extensions.join(', '))
  if (rule.namePattern !== undefined) parts.push(`/${rule.namePattern}/`)
  if (rule.minSize !== undefined || rule.maxSize !== undefined) {
    parts.push(`${rule.minSize === undefined ? '0' : formatBytes(rule.minSize)} – ${rule.maxSize === undefined ? '∞' : formatBytes(rule.maxSize)}`)
  }
  return parts.length === 0 ? t('allFiles') : parts.join(' · ')
}
