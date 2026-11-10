import { createContext, useContext } from 'react'

export type SettingsSection = 'appearance' | 'media' | 'security' | 'data'

export interface SettingsContextValue {
  openSettings: (section?: SettingsSection) => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (!value) {
    throw new Error('useSettings 必须在 SettingsContext.Provider 内使用')
  }
  return value
}
