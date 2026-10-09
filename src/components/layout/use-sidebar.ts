import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'settle:sidebar-collapsed'
const DESKTOP_QUERY = '(min-width: 48rem)'

export interface SidebarState {
  /** Whether the sidebar is currently showing, for the toggle's aria-expanded. */
  readonly open: boolean
  /** Desktop: sidebar slid off-canvas. */
  readonly collapsed: boolean
  /** Mobile: sidebar open as a sheet. */
  readonly mobileOpen: boolean
  setMobileOpen(open: boolean): void
  /** Collapses on desktop, opens the sheet on mobile. */
  toggle(): void
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Storage blocked: the choice just won't survive a reload.
  }
}

function subscribeDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const isDesktopNow = (): boolean => window.matchMedia(DESKTOP_QUERY).matches

/** Sidebar open/closed state, with the shadcn ⌘B / Ctrl+B shortcut. */
export function useSidebar(): SidebarState {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isDesktop = useSyncExternalStore(subscribeDesktop, isDesktopNow)

  const toggle = useCallback((): void => {
    if (isDesktopNow()) {
      setCollapsed((prev) => {
        writeCollapsed(!prev)
        return !prev
      })
    } else {
      setMobileOpen((prev) => !prev)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return { open: isDesktop ? !collapsed : mobileOpen, collapsed, mobileOpen, setMobileOpen, toggle }
}
