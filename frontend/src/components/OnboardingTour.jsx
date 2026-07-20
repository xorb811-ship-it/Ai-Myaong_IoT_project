import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Check } from './icons'
import { useOnboarding } from '../onboarding/useOnboarding'

/* ───────────────────────────────────────────────────────────
 * 온보딩 코치마크 "뷰" (웹 전용 · 모바일 앱 프레임에 한정)
 *
 * 모든 좌표/딤/말풍선은 앱 셸([data-app-frame], 최대 480px) "안"에서만
 * 계산·표시된다. 데스크톱에서 프레임 바깥으로 새지 않음 → 실제 앱 화면과 동일.
 *
 * 비즈니스 로직(useOnboarding) / 데이터(steps) / 영속화(platform) 는 그대로 재사용.
 * 라우터 의존성은 이 뷰에만 격리 (RN 이식 시 이 파일만 교체).
 * ─────────────────────────────────────────────────────────── */

const PAD = 8 // 강조 영역 여백
const GAP = 18 // 대상 ↔ 말풍선 간격

// 대시보드와 동일한 크림 카드 톤 (card 80% + cream 20%)
const BG_CARD = 'color-mix(in srgb, rgb(var(--brand-card)) 82%, rgb(var(--brand-cream)) 18%)'

/* 종이 질감 발자국/하트/뼈다귀 데코 (대시보드 PaperIcon 과 동일 방식: 마스크 + paper.jpg) */
function PaperIcon({ shape, color, className = '', opacity = 1 }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none ${className}`}
      style={{
        backgroundColor: color,
        backgroundImage: 'url(/paper.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundBlendMode: 'multiply',
        WebkitMaskImage: `url(/icons/${shape}.svg)`,
        maskImage: `url(/icons/${shape}.svg)`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        opacity,
      }}
    />
  )
}

export function OnboardingTour() {
  const { active, step, index, total, isFirst, isLast, finishing, next, prev, skip } =
    useOnboarding()
  const navigate = useNavigate()
  const location = useLocation()
  const [frame, setFrame] = useState(null) // 앱 셸 영역 (viewport 좌표)
  const [rect, setRect] = useState(null) // 대상 영역 (viewport 좌표)
  const tipRef = useRef(null) // 말풍선 DOM
  const [tipH, setTipH] = useState(0) // 말풍선 실측 높이 (뷰포트 안으로 clamp 하는 데 사용)

  // 말풍선 높이 실측 (단계/대상/프레임 바뀔 때마다) → 화면 밖으로 넘치지 않게 clamp
  useLayoutEffect(() => {
    const el = tipRef.current
    if (el) setTipH(el.offsetHeight)
  }, [active, step, index, rect, frame])

  // 단계가 요구하는 화면으로 이동
  useEffect(() => {
    if (active && step?.route && location.pathname !== step.route) {
      navigate(step.route)
    }
  }, [active, step, location.pathname, navigate])

  // 프레임 + 대상 측정 (페이지 전환 대기를 위해 잠깐 폴링)
  useLayoutEffect(() => {
    if (!active || !step) return undefined
    let cancelled = false
    let timer = null
    let tries = 0

    const measureFrame = () => {
      const f = document.querySelector('[data-app-frame]')
      if (f) setFrame(f.getBoundingClientRect())
    }
    const remeasure = () => {
      measureFrame()
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      if (el) setRect(el.getBoundingClientRect())
    }
    const find = () => {
      if (cancelled) return
      measureFrame()
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setRect(el.getBoundingClientRect())
        timer = setTimeout(remeasure, 340) // 스크롤 후 보정
      } else if (tries++ < 40) {
        timer = setTimeout(find, 60) // 최대 ~2.4s
      } else {
        setRect(null)
      }
    }

    find()
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      cancelled = true
      clearTimeout(timer)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [active, step])

  if (!active || !step) return null

  // 프레임 기준 좌표계 (프레임 없으면 화면 전체로 폴백)
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const fr = frame || { left: 0, top: 0, width: vw, height: vh }
  const FW = fr.width
  const FH = fr.height
  const TOOLTIP_W = Math.min(320, Math.round(FW * 0.88))

  // 대상을 프레임 로컬 좌표로 변환
  let r = null
  if (rect) {
    r = {
      top: rect.top - fr.top,
      left: rect.left - fr.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom - fr.top,
    }
  }

  // 실제로 "보이는 영역"(프레임 ∩ 뷰포트)을 프레임 로컬 좌표로 구한다.
  // 프레임이 뷰포트보다 크거나 스크롤돼 있어도 말풍선이 화면 밖으로 나가지 않게 하기 위함.
  const MARGIN = 12 // 최소 여백
  const viewTop = Math.max(MARGIN, MARGIN - fr.top)
  const viewBottom = Math.min(FH - MARGIN, vh - fr.top - MARGIN)
  const viewH = Math.max(120, viewBottom - viewTop)

  // 말풍선 / 화살표 배치
  let left = (FW - TOOLTIP_W) / 2
  let beakLeft = TOOLTIP_W / 2
  let placeBelow = true
  let desiredTop = (viewTop + viewBottom - tipH) / 2 // 대상 없으면 보이는 영역 세로 중앙
  let arrow = null

  if (r) {
    const centerX = r.left + r.width / 2
    // 아래/위 판정은 "보이는 영역 중앙" 기준 (프레임 높이 오차에 강함).
    // → 하단 탭바 같은 맨아래 대상은 확실히 '아래'로 인식돼 말풍선이 위로 올라간다.
    const viewMid = (viewTop + viewBottom) / 2
    placeBelow = r.top < viewMid
    left = Math.min(Math.max(centerX - TOOLTIP_W / 2, 12), FW - TOOLTIP_W - 12)
    beakLeft = Math.min(Math.max(centerX - left, 24), TOOLTIP_W - 24)
    // 대상 위/아래에 붙이되, 아래 clamp 로 항상 화면 안에 들어오게 한다.
    desiredTop = placeBelow ? r.bottom + GAP : r.top - GAP - tipH
    arrow = { below: placeBelow, x: centerX, y: placeBelow ? r.bottom + 2 : r.top - 28 }
  }

  // 핵심: 말풍선 전체가 "보이는 영역" 안에 오도록 세로 위치를 강제로 가둔다.
  const topPx = Math.min(Math.max(desiredTop, viewTop), Math.max(viewTop, viewBottom - tipH))
  const vStyle = { top: Math.round(topPx) }
  const maxH = viewH // 아주 긴 말풍선은 내부 스크롤

  return (
    // 오버레이를 앱 프레임에 정확히 겹치고 overflow-hidden 으로 가둠
    <div
      className="fixed z-[100] overflow-hidden"
      role="dialog"
      aria-modal="true"
      style={{ left: fr.left, top: fr.top, width: FW, height: FH }}
    >
      {/* 건너뛰기 (프레임 상단 고정) */}
      <button
        type="button"
        onClick={skip}
        disabled={finishing}
        className="absolute top-5 right-5 z-[103] inline-flex items-center gap-1 rounded-full bg-brand-cream/95 border border-dashed border-brand-brown/25 px-3 py-1.5 text-xs font-bold text-brand-brown shadow-soft touch-active disabled:opacity-60"
      >
        건너뛰기 <X className="w-3.5 h-3.5" />
      </button>

      {/* 스포트라이트 (대상만 밝게 · box-shadow 는 프레임에 의해 클립됨) */}
      {r ? (
        <div
          className="absolute rounded-2xl ring-2 ring-brand-primary transition-all duration-300 ease-out"
          style={{
            top: r.top - PAD,
            left: r.left - PAD,
            width: r.width + PAD * 2,
            height: r.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(20, 15, 10, 0.72)',
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'rgba(20,15,10,0.72)' }} />
      )}

      {/* 가리키는 화살표 (통통 튀는) */}
      {arrow && (
        <div
          className="absolute z-[102] -translate-x-1/2 animate-bounce"
          style={{ left: arrow.x, top: arrow.y }}
        >
          {arrow.below ? (
            <ChevronUp className="w-7 h-7 text-brand-primary drop-shadow" />
          ) : (
            <ChevronDown className="w-7 h-7 text-brand-primary drop-shadow" />
          )}
        </div>
      )}

      {/* 말풍선 — 대시보드 무드(크림 카드 + 스티치 점선 + 발자국 데코) */}
      <div
        ref={tipRef}
        className="absolute z-[101] rounded-3xl shadow-soft-lg transition-all duration-300 ease-out"
        style={{ left, width: TOOLTIP_W, opacity: tipH ? 1 : 0, ...vStyle }}
      >
        {/* 장식 레이어 (둥근 모서리로 클립: 크림 배경 · 스티치 · 발자국/하트/뼈다귀) */}
        <div
          className="absolute inset-0 rounded-3xl overflow-hidden border border-brand-line/60"
          style={{ backgroundColor: BG_CARD }}
        >
          <span className="pointer-events-none absolute inset-[6px] rounded-[20px] border border-dashed border-brand-brown/15" />
          <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute -right-4 -bottom-4 w-20 h-20 rotate-6" />
          <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.14} className="absolute -left-2 -top-2 w-9 h-9 -rotate-12" />
          <PaperIcon shape="heart" color="rgb(var(--brand-primary))" opacity={0.5} className="absolute right-6 top-4 w-3.5 h-3.5" />
          <PaperIcon shape="bone" color="rgb(var(--brand-primary-deep))" opacity={0.4} className="absolute left-7 bottom-3.5 w-4 h-4 -rotate-12" />
        </div>

        {/* 말풍선 꼬리 (크림 톤 · 클립 밖이라 안 잘림) */}
        {r && (
          <span
            className="absolute w-3.5 h-3.5 rotate-45"
            style={{ left: beakLeft - 7, backgroundColor: BG_CARD, ...(placeBelow ? { top: -6 } : { bottom: -6 }) }}
          />
        )}

        {/* 내용 (넘치면 내부 스크롤) */}
        <div className="relative p-5 overflow-y-auto no-scrollbar" style={{ maxHeight: maxH }}>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-cream border border-dashed border-brand-brown/25 px-2.5 py-0.5 text-[11px] font-extrabold text-brand-primary">
              <PaperIcon shape="paw" color="rgb(var(--brand-primary))" opacity={0.95} className="inline-block w-3 h-3" />
              {index + 1} / {total}
            </span>
            <div className="flex gap-1.5">
              {Array.from({ length: total }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? 'w-5 bg-brand-primary' : 'w-1.5 bg-brand-line'
                  }`}
                />
              ))}
            </div>
          </div>

          <h3 className="mt-3 font-display text-lg font-bold text-brand-brown">{step.title}</h3>
          <p className="mt-1.5 text-sm text-brand-mute leading-relaxed">{step.content}</p>

          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={prev}
              disabled={isFirst || finishing}
              className="inline-flex items-center justify-center gap-1 rounded-2xl bg-brand-cream border border-dashed border-brand-brown/20 px-4 py-2.5 text-sm font-bold text-brand-brown touch-active disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> 이전
            </button>
            <button
              type="button"
              onClick={next}
              disabled={finishing}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-2xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-soft touch-active disabled:opacity-60"
            >
              {isLast ? (
                <>
                  <Check className="w-4 h-4" /> {finishing ? '시작하는 중…' : '시작하기'}
                </>
              ) : (
                <>
                  다음 <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OnboardingTour
