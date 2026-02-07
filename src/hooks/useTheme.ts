import { useState, useEffect, useCallback } from 'react'
import type { Theme } from '../types'

const ALL_THEMES: Theme[] = ['dark', 'light', 'cyberpunk', 'nord', 'monokai', 'solarized', 'dracula', 'rosepine']

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    window.artemis.store.get('theme').then((saved: Theme | undefined) => {
      const t = (saved && ALL_THEMES.includes(saved)) ? saved : 'dark'
      document.documentElement.setAttribute('data-theme', t)
      setThemeState(t)
      setIsLoaded(true)
    })
  }, [])

  const setTheme = useCallback((newTheme: Theme) => {
    document.documentElement.setAttribute('data-theme', newTheme)
    setThemeState(newTheme)
    window.artemis.store.set('theme', newTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    const idx = ALL_THEMES.indexOf(theme)
    const next = ALL_THEMES[(idx + 1) % ALL_THEMES.length]
    setTheme(next)
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme, isLoaded }
}
