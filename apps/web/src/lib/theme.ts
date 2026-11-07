import { useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'gallery.theme'

const DARK_THEME_COLOR = '#07070a'
const LIGHT_THEME_COLOR = '#f6f5fb'

let mode: ThemeMode = 'dark'
let resolved: ResolvedTheme = 'dark'
let initialized = false

const listeners = new Set<() => void>()

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStoredTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeMode(stored)) return stored
  } catch {
    // localStorage 不可用时保持深色默认值
  }
  return 'dark'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveMode(value: ThemeMode): ResolvedTheme {
  if (value === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return value
}

function emit(): void {
  for (const listener of listeners) listener()
}

function applyTheme(value: ThemeMode): void {
  const next = resolveMode(value)
  resolved = next

  const root = document.documentElement
  root.dataset.theme = next
  root.style.colorScheme = next

  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', next === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

/** 在首次渲染前调用，避免主题闪烁。 */
export function initTheme(): void {
  if (initialized) return
  initialized = true

  mode = readStoredTheme()
  applyTheme(mode)

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (mode !== 'system') return
    applyTheme(mode)
    emit()
  })
}

export function setTheme(next: ThemeMode): void {
  mode = next

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // 忽略写入失败，本次会话内仍然生效
  }

  applyTheme(mode)
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getModeSnapshot(): ThemeMode {
  return mode
}

function getResolvedSnapshot(): ResolvedTheme {
  return resolved
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getModeSnapshot, () => 'dark')
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, getResolvedSnapshot, () => 'dark')
}
