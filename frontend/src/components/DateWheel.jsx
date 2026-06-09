import { useEffect, useRef } from 'react'

/**
 * 년/월/일 휠(슬라이드) 날짜 피커.
 * - value: 'YYYY-MM-DD' (없으면 오늘 기준 표시, 단 emit 전엔 빈 값 유지)
 * - onChange('YYYY-MM-DD')
 * - 미래 날짜 불가 (오늘까지만)
 */
const ITEM = 40 // 각 항목 높이(px)
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const pad = (n) => String(n).padStart(2, '0')

export function DateWheel({ value, onChange }) {
  const today = new Date()
  const maxY = today.getFullYear()
  const maxM = today.getMonth() + 1
  const maxD = today.getDate()
  const minYear = maxY - 30

  const valid = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
  const [y, m, d] = valid
    ? value.split('-').map(Number)
    : [maxY, maxM, maxD]

  const years = range(minYear, maxY)
  const monthMax = y >= maxY ? maxM : 12
  const months = range(1, monthMax)
  const daysInMonth = new Date(y, m, 0).getDate()
  const dayMax = (y >= maxY && m >= maxM) ? maxD : daysInMonth
  const days = range(1, dayMax)

  // 변경 시 월/일을 유효 범위로 보정해서 emit
  const emit = (ny, nm, nd) => {
    const mMax = ny >= maxY ? maxM : 12
    const cm = Math.min(nm, mMax)
    const dim = new Date(ny, cm, 0).getDate()
    const dMax = (ny >= maxY && cm >= maxM) ? maxD : dim
    const cd = Math.min(nd, dMax)
    onChange(`${ny}-${pad(cm)}-${pad(cd)}`)
  }

  return (
    <div className="relative rounded-2xl bg-brand-cream border border-brand-line overflow-hidden">
      {/* 가운데 선택 밴드 */}
      <div className="pointer-events-none absolute left-2 right-2 top-1/2 -translate-y-1/2 rounded-xl bg-brand-primary/10 border-y-2 border-brand-primary/30"
        style={{ height: ITEM }} />
      {/* 위/아래 페이드 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-brand-cream to-transparent z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-brand-cream to-transparent z-10" />

      <div className="flex">
        <Wheel items={years} value={y} unit="년" onChange={(v) => emit(v, m, d)} />
        <Wheel items={months} value={m} unit="월" onChange={(v) => emit(y, v, d)} />
        <Wheel items={days} value={d} unit="일" onChange={(v) => emit(y, m, v)} />
      </div>
    </div>
  )
}

export function Wheel({ items, value, unit, onChange }) {
  const ref = useRef(null)
  const timer = useRef(null)
  const wheelLock = useRef(false)
  const drag = useRef(null) // 마우스 드래그 스크롤 상태
  const idx = Math.max(0, items.indexOf(value))

  // 선택값/목록 변경 시 해당 위치로 정렬 (이미 맞으면 무시 → 사용자 스크롤과 충돌 방지)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = idx * ITEM
    if (Math.abs(el.scrollTop - target) > 2) el.scrollTop = target
  }, [idx])

  // 마우스 휠: 한 번에 정확히 1칸만 이동 (네이티브 스크롤은 한 notch 가 여러 칸 이동)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      if (wheelLock.current) return
      const dir = e.deltaY > 0 ? 1 : -1
      const ni = Math.max(0, Math.min(items.length - 1, idx + dir))
      if (ni === idx) return
      wheelLock.current = true
      el.scrollTo({ top: ni * ITEM, behavior: 'smooth' }) // 한 칸 부드럽게 (값은 onScroll 이 반영)
      setTimeout(() => { wheelLock.current = false }, 200)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [idx, items, onChange])

  const onScroll = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (drag.current) return // 드래그 중엔 스냅 보류
      const el = ref.current
      if (!el) return
      let i = Math.round(el.scrollTop / ITEM)
      i = Math.max(0, Math.min(items.length - 1, i))
      const v = items[i]
      if (v !== value) onChange(v)
      else el.scrollTop = i * ITEM // 스냅 보정
    }, 90)
  }

  // 마우스로 잡고 위아래 드래그 → 빠른 스크롤 (터치는 네이티브 스크롤 유지)
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return
    const el = ref.current
    if (!el) return
    drag.current = { y: e.clientY, top: el.scrollTop }
    el.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const el = ref.current
    if (el) el.scrollTop = drag.current.top - (e.clientY - drag.current.y)
  }
  const onPointerUp = (e) => {
    if (!drag.current) return
    drag.current = null
    ref.current?.releasePointerCapture?.(e.pointerId)
    onScroll() // 스냅/값 반영
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="no-scrollbar flex-1 h-[200px] overflow-y-auto overscroll-y-contain snap-y snap-mandatory cursor-grab active:cursor-grabbing select-none"
    >
      <div style={{ height: ITEM * 2 }} />
      {items.map((it) => (
        <div
          key={it}
          className="flex items-center justify-center snap-center"
          style={{ height: ITEM }}
        >
          <span className={`text-base transition-colors ${it === value ? 'font-bold text-brand-brown' : 'text-brand-mute/50'}`}>
            {it}{unit}
          </span>
        </div>
      ))}
      <div style={{ height: ITEM * 2 }} />
    </div>
  )
}

export default DateWheel
