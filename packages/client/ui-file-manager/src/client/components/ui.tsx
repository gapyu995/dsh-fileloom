/** Small shared UI primitives for the Data Steward panel. */

import {
  useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type ReactNode, type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import css from '../FileManagerPage.module.css'

export type IconName =
  | 'home' | 'folder' | 'organize' | 'history' | 'trash' | 'rules' | 'settings'
  | 'more' | 'upload' | 'search' | 'file' | 'chevron' | 'close' | 'check'
  | 'warning' | 'undo' | 'plus' | 'download' | 'sparkle' | 'inbox' | 'refresh' | 'eye'
  | 'copy' | 'edit'

const PATHS: Record<IconName, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  organize: <><path d="M4 6h16M4 12h10M4 18h6" /><path d="m17 15 2 2 3-4" /></>,
  history: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  trash: <><path d="M4 7h16M9 7V5h6v2" /><path d="m6 7 1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
  rules: <><path d="M4 7h8M16 7h4M4 17h4M12 17h8" /><circle cx="14" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  upload: <><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></>,
  file: <><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v4h4" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  warning: <><path d="M12 3 2.8 20h18.4Z" /><path d="M12 9v5M12 17.2v.2" /></>,
  undo: <><path d="M4 9h10a5 5 0 0 1 0 10H8" /><path d="m4 4 5 5-5 5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  download: <><path d="M12 4v12M7.5 11.5 12 16l4.5-4.5" /><path d="M4 18v2h16v-2" /></>,
  sparkle: <><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z" /></>,
  inbox: <><path d="M4 5h16v9l-3 5H7l-3-5Z" /><path d="M4 14h5l1 2h4l1-2h5" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.8-4.5L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14.8 4.5L21 15" /><path d="M21 20v-5h-5" /></>,
  eye: <><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  edit: <><path d="M4 20h4l10-10-4-4L4 16Z" /><path d="m14 6 4 4" /></>,
}

/** Inline stroke icon; size follows the surrounding text by default. */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string | undefined }): ReactNode {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'

export function Button({
  variant = 'secondary', size = 'md', busy = false, icon, children, className, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  busy?: boolean
  icon?: IconName
}): ReactNode {
  const classes = [css.btn, css[`btn_${variant}`], size === 'sm' ? css.btnSm : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} disabled={disabled === true || busy} aria-busy={busy} {...rest}>
      {busy ? <Spinner /> : icon === undefined ? null : <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  )
}

export function IconButton({
  label, icon, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: IconName }): ReactNode {
  return (
    <button type="button" className={[css.iconBtn, className ?? ''].filter(Boolean).join(' ')} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  )
}

export function Spinner({ label }: { label?: string }): ReactNode {
  return <span className={css.spinner} role="status" aria-label={label ?? 'Loading'} />
}

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }): ReactNode {
  return <span className={`${css.badge} ${css[`badge_${tone}`]}`} title={title}>{children}</span>
}

export function EmptyState({
  icon = 'folder', title, body, action, compact = false,
}: { icon?: IconName; title: string; body?: string; action?: ReactNode; compact?: boolean }): ReactNode {
  return (
    <div className={compact ? `${css.emptyState} ${css.emptyStateCompact}` : css.emptyState}>
      <div className={css.emptyIcon}><Icon name={icon} size={compact ? 20 : 28} /></div>
      <strong>{title}</strong>
      {body === undefined ? null : <p>{body}</p>}
      {action === undefined ? null : <div className={css.emptyAction}>{action}</div>}
    </div>
  )
}

export function ErrorBanner({ message, retryLabel, onRetry }: { message: string; retryLabel?: string; onRetry?: () => void }): ReactNode {
  return (
    <div className={css.errorBanner} role="alert">
      <Icon name="warning" />
      <span>{message}</span>
      {onRetry === undefined ? null : (
        <Button size="sm" variant="ghost" onClick={onRetry}>{retryLabel ?? 'Retry'}</Button>
      )}
    </div>
  )
}

export function WarningBanner({ message }: { message: string }): ReactNode {
  return (
    <div className={css.warnBanner} role="status">
      <Icon name="warning" />
      <span>{message}</span>
    </div>
  )
}

export function TextField({
  label, hint, error, textarea = false, className, ...rest
}: (InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
  textarea?: false
}) | (TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string
  hint?: string
  error?: string
  textarea: true
})): ReactNode {
  const control = textarea
    ? <textarea className={css.textarea} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
    : <input className={css.input} {...(rest as InputHTMLAttributes<HTMLInputElement>)} />
  return (
    <label className={[css.field, className ?? ''].filter(Boolean).join(' ')}>
      {label === undefined ? null : <span className={css.fieldLabel}>{label}</span>}
      {control}
      {error !== undefined ? <span className={css.fieldError}>{error}</span>
        : hint === undefined ? null : <span className={css.fieldHint}>{hint}</span>}
    </label>
  )
}

/** Modal dialog with an escape key, focus trap, and backdrop dismissal. */
export function Dialog({
  title, description, onClose, footer, children, width = '560px',
}: {
  title: string
  description?: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
  width?: string
}): ReactNode {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = panel.current
    const focusable = (): HTMLElement[] => {
      if (node === null) return []
      return [...node.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    }
    const first = focusable().find(element => element.dataset.autofocus === 'true') ?? focusable()[0]
    first?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      const head = items[0]
      const tail = items.at(-1)
      if (head === undefined || tail === undefined) return
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus()
    }
  }, [])

  return createPortal(
    <div className={css.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={panel} className={css.dialog} role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <div className={css.dialogHead}>
          <div>
            <h3>{title}</h3>
            {description === undefined ? null : <p>{description}</p>}
          </div>
          <IconButton label="Close" icon="close" onClick={onClose} />
        </div>
        <div className={css.dialogBody}>{children}</div>
        {footer === undefined ? null : <div className={css.dialogActions}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  title, message, confirmLabel, cancelLabel, tone = 'primary', busy = false, onConfirm, onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  tone?: 'primary' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}): ReactNode {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      width="460px"
      footer={<>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
      </>}
    >
      <p className={css.dialogText}>{message}</p>
    </Dialog>
  )
}
