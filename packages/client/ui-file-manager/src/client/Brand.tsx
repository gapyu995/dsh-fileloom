/** Product-owned brand occupants for the Data Steward shell. */

import type { ReactNode } from 'react'

const ACCENT = 'var(--dsw-alias-brand-primary)'

/** Sidebar mark: a folder with a steward spark. */
export function BrandMark(): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M3.5 7.2c0-1 .8-1.7 1.8-1.7h4l1.8 2h7.6c1 0 1.8.8 1.8 1.8v8.2c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8V7.2Z" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 13.5h8M8 16.2h5.5" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
      <path d="m16.2 4.1.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3Z" fill={ACCENT} />
    </svg>
  )
}

/** Sidebar product name. */
export function BrandName(): ReactNode {
  return <span style={{ fontWeight: 650, letterSpacing: 0 }}>Fileloom</span>
}

/** Sidebar navigation icon. */
export function StewardPanelIcon(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M3.5 7.2c0-1 .8-1.7 1.8-1.7h4l1.8 2h7.6c1 0 1.8.8 1.8 1.8v8.2c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8V7.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 13.5h8M8 16.2h5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
