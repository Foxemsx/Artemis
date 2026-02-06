import { useState, useEffect, useCallback } from 'react'
import type { Theme } from '../types'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    window.artemis.store.get('theme').then((saved: Theme | undefined) => {
      const t = saved || 'dark'
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
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme, isLoaded }
}
