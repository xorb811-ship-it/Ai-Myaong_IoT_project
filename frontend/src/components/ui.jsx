/**
 * 공통 UI 프리미티브.
 * 디자인 가이드의 Soft 3D / Extra Rounded 스타일을 한 곳에 모아 재사용.
 */

export function PageHeader({ title, subtitle, right }) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold text-brand-brown leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-brand-mute truncate">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag
      className={`bg-brand-card rounded-3xl shadow-soft border border-brand-line/60 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function CreamCard({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag
      className={`bg-brand-cream rounded-3xl shadow-soft ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function PrimaryButton({ className = '', children, ...rest }) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        bg-brand-primary text-white font-bold
        rounded-3xl px-5 py-3
        shadow-press touch-active
        active:bg-brand-primary/90
        ${className}
      `}
      {...rest}
    >
      {children}
    </button>
  )
}

export function GhostButton({ className = '', children, ...rest }) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        bg-brand-cream text-brand-brown font-bold
        rounded-3xl px-5 py-3
        shadow-soft touch-active
        ${className}
      `}
      {...rest}
    >
      {children}
    </button>
  )
}

export function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange?.(!checked)}
      className={`
        relative inline-flex h-7 w-12 items-center rounded-full
        transition-colors touch-active
        ${checked ? 'bg-brand-primary' : 'bg-brand-line'}
      `}
    >
      <span
        className={`
          inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  )
}

export function Badge({ tone = 'primary', children }) {
  const tones = {
    primary: 'bg-brand-primary/15 text-brand-primary',
    brown: 'bg-brand-brown/10 text-brand-brown',
    warn: 'bg-brand-warning/20 text-[#A06B1A]',
    danger: 'bg-brand-danger/15 text-brand-danger',
    success: 'bg-brand-success/20 text-[#2F6A2E]',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function ProgressBar({ value = 0, warning = false }) {
  const safe = Math.max(0, Math.min(100, value))
  return (
    <div className="w-full h-3 rounded-full bg-brand-line overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${warning ? 'bg-brand-danger' : 'bg-brand-primary'}`}
        style={{ width: `${safe}%` }}
      />
    </div>
  )
}
