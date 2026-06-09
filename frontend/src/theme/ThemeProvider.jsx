import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react'
import {
  getStoredTheme, setStoredTheme, getSystemTheme, subscribeSystemTheme, applyResolvedTheme,
} from './themePlatform'

/* ───────────────────────────────────────────────────────────
 * 테마 전역 상태 (React Context)
 *
 * 이 파일에는 "순수 비즈니스 로직"만 둔다 (상태 값, 전이 규칙).
 * 웹 전용 API 접근은 전부 ./themePlatform 어댑터를 통해서만 한다.
 * → RN 이식 시 themePlatform 만 교체하면 이 Provider 는 그대로 재사용.
 *
 * theme         : 사용자가 고른 모드 ('light' | 'dark' | 'system')
 * resolvedTheme : 실제 화면에 적용되는 값 ('light' | 'dark')
 * ─────────────────────────────────────────────────────────── */

const THEMES = ['light', 'dark', 'system']
const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  // 기본값은 '밝은 모드'(light). 사용자가 직접 고른 값이 있으면 그걸 사용.
  const [theme, setThemeState] = useState(() => getStoredTheme() || 'light')
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme())

  // OS 테마 변화 구독 (웹: matchMedia / RN: Appearance)
  useEffect(() => subscribeSystemTheme(setSystemTheme), [])

  // 'system' 이면 OS 값을 따르고, 아니면 사용자가 고른 값을 그대로 적용
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  // 결정된 테마를 화면에 적용 (웹: html.dark 토글)
  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  // 특정 모드로 설정 + 저장
  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return
    setThemeState(next)
    setStoredTheme(next)
  }, [])

  // 순환 토글: light → dark → system → light ...
  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = THEMES[(THEMES.indexOf(prev) + 1) % THEMES.length]
      setStoredTheme(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      isDark: resolvedTheme === 'dark',
      setTheme,
      cycleTheme,
    }),
    [theme, resolvedTheme, setTheme, cycleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme 는 <ThemeProvider> 안에서만 사용할 수 있어요.')
  return ctx
}
