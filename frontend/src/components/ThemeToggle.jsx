import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../theme/ThemeProvider'

const OPTIONS = [
  { id: 'light', label: '라이트', icon: Sun },
  { id: 'dark', label: '다크', icon: Moon },
  { id: 'system', label: '시스템', icon: Monitor },
]

/* 세그먼트형 테마 토글 (라이트 / 다크 / 시스템) */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="inline-flex bg-brand-cream rounded-full p-1 shadow-soft-inset">
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const active = theme === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${
              active ? 'bg-brand-primary text-white shadow-soft' : 'text-brand-mute'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* (대안) 아이콘 하나로 순환 토글하는 버튼 — 헤더 등 좁은 곳용 */
export function ThemeToggleButton() {
  const { theme, resolvedTheme, cycleTheme } = useTheme()
  const Icon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun
  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={`테마: ${theme}`}
      className="w-11 h-11 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active"
    >
      <Icon className="w-5 h-5" />
    </button>
  )
}

export default ThemeToggle
