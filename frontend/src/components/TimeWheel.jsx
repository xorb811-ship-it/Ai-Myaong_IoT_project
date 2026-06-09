import { useEffect, useRef, useState } from 'react'

/**
 * 오전/오후 · 시 · 분 무한 루프 휠 시간 피커 — 안드로이드 알람 스타일(12시간제).
 * - value: 'HH:MM' (24시간으로 저장/반환)
 * - onChange('HH:MM')
 * - 끝(59분)에서 처음(00분)으로 자연스럽게 이어지는 무한 스크롤
 */
const ITEM = 40
const MERIDIEMS = ['오전', '오후']
const HOURS12 = Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i).padStart(2, '0')) // 12,01,...,11
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

export function TimeWheel({ value, onChange }) {
  const valid = value && /^\d{1,2}:\d{2}$/.test(value)
  const [h24Raw, mmRaw] = valid ? value.split(':') : ['08', '00']
  const h24 = Number(h24Raw)
  const minute = mmRaw.padStart(2, '0')
  const ampm = h24 < 12 ? '오전' : '오후'
  const hour12 = String((h24 % 12) || 12).padStart(2, '0')

  const emit = (nAmpm, nH12, nMin) => {
    let h = Number(nH12) % 12 // 12 → 0
    if (nAmpm === '오후') h += 12
    onChange(`${String(h).padStart(2, '0')}:${nMin}`)
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
        <LoopWheel items={MERIDIEMS} value={ampm} onChange={(v) => emit(v, hour12, minute)} />
        <LoopWheel items={HOURS12} value={hour12} unit="시" onChange={(v) => emit(ampm, v, minute)} />
        <LoopWheel items={MINUTES} value={minute} unit="분" onChange={(v) => emit(ampm, hour12, v)} />
      </div>
    </div>
  )
}

/* 무한 반복 휠 */
function LoopWheel({ items, value, unit, onChange }) {
  const ref = useRef(null)
  const lock = useRef(false)   // 프로그램적 스크롤 시 핸들러 무시
  const timer = useRef(null)
  const raf = useRef(0)
  const wheelLock = useRef(false) // 마우스 휠 한 notch = 1칸 제한
  const drag = useRef(null)       // 마우스 드래그 스크롤 상태
  const n = items.length
  const REP = 7                // 복사본 개수 (가운데에서 양방향 스크롤)
  const MID = Math.floor(REP / 2)
  const long = Array.from({ length: REP * n }, (_, i) => items[i % n])
  const valueIdx = Math.max(0, items.indexOf(value))

  // 현재 가운데(선택)에 있는 long 인덱스 → 이 항목만 진하게
  const [centerIdx, setCenterIdx] = useState(MID * n + valueIdx)

  // 마운트/값 변경 시 가운데 복사본 위치로 정렬
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = (MID * n + valueIdx) * ITEM
    if (Math.abs(el.scrollTop - target) > 2) {
      lock.current = true
      el.scrollTop = target
      setCenterIdx(MID * n + valueIdx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueIdx, n])

  // 마우스 휠: 한 번에 정확히 1칸만 이동 (나머지는 onScroll 이 값 emit/재배치 처리)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      if (wheelLock.current) return
      wheelLock.current = true
      el.scrollTo({ top: el.scrollTop + (e.deltaY > 0 ? 1 : -1) * ITEM, behavior: 'smooth' })
      setTimeout(() => { wheelLock.current = false }, 200)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    // 실시간 가운데 항목 추적 (강조용)
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const e2 = ref.current
      if (e2) setCenterIdx(Math.round(e2.scrollTop / ITEM))
    })

    if (lock.current) { lock.current = false; return }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (drag.current) return // 드래그 중엔 스냅/emit 보류
      const idx = Math.round(el.scrollTop / ITEM)
      const mod = ((idx % n) + n) % n
      const v = items[mod]
      if (v !== value) onChange(v)

      // 가장자리 복사본에 도달했을 때만 가운데로 재배치 (무한 효과)
      if (idx < n || idx >= (REP - 1) * n) {
        lock.current = true
        el.scrollTop = (MID * n + mod) * ITEM
      } else if (Math.abs(el.scrollTop - idx * ITEM) > 1) {
        lock.current = true
        el.scrollTop = idx * ITEM
      }
    }, 100)
  }

  // 중앙에서의 거리(0=가운데)에 따라 점점 투명
  const opacityFor = (i) => {
    const d = Math.abs(i - centerIdx)
    if (d === 0) return 1
    if (d === 1) return 0.45
    if (d === 2) return 0.22
    return 0.12
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
      {long.map((it, i) => {
        const center = i === centerIdx
        return (
          <div key={i} className="flex items-center justify-center snap-center" style={{ height: ITEM }}>
            <span
              className={`text-base transition-all ${center ? 'font-bold' : 'font-semibold'}`}
              style={{ color: 'rgb(var(--brand-brown))', opacity: opacityFor(i) }}
            >
              {it}{unit}
            </span>
          </div>
        )
      })}
      <div style={{ height: ITEM * 2 }} />
    </div>
  )
}

export default TimeWheel
