/* ───────────────────────────────────────────────────────────
 * 테마 "플랫폼 어댑터" — 웹 전용 API 격리 계층
 *
 * window / document / localStorage / matchMedia 등 웹에서만 존재하는 API는
 * 전부 이 파일 안에만 둔다. ThemeProvider 의 비즈니스 로직(상태 전이 등)은
 * 이 함수들의 "시그니처"에만 의존하므로, React Native 로 옮길 때
 * 같은 시그니처의 themePlatform.native.js 만 새로 만들면 된다.
 *   - getStoredTheme / setStoredTheme → AsyncStorage
 *   - getSystemTheme / subscribeSystemTheme → react-native Appearance
 *   - applyResolvedTheme → (RN은 className 개념이 없으므로 no-op 또는 nativewind colorScheme)
 * ─────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'aimyaong:theme'
const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined'

/* 저장된 사용자 선택 테마 반환 ('light' | 'dark' | 'system' | null) */
export function getStoredTheme() {
  if (!isWeb) return null
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : null
  } catch {
    return null
  }
}

/* 사용자 선택 테마 저장 */
export function setStoredTheme(theme) {
  if (!isWeb) return
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

/* OS(시스템) 다크모드 여부 → 'dark' | 'light' */
export function getSystemTheme() {
  if (!isWeb || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/* OS 테마 변경 구독. 변경 시 cb('dark'|'light') 호출. 해제 함수 반환. */
export function subscribeSystemTheme(callback) {
  if (!isWeb || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e) => callback(e.matches ? 'dark' : 'light')
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}

/* 실제 화면에 적용 — 웹은 <html> 의 .dark 토글 + color-scheme + 상태바 색.
 * (RN 이식 시 이 함수는 no-op 또는 NativeWind 의 colorScheme 설정으로 대체) */
export function applyResolvedTheme(resolved) {
  if (!isWeb) return
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#1A1714' : '#FFF9F1')
}
