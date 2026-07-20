import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, UserX, AlertTriangle, UtensilsCrossed, Droplets,
  Moon, PhoneCall, Bell, Trash2, X,
} from '../components/icons'
import {
  useNotifications, removeNotification, clearNotifications, markAllRead, timeAgo,
} from '../lib/notificationRepository'

// 카드 배경: 흰색 80% + 크림 20% (대시보드·마이페이지와 동일) / 정보·칩: 따뜻한 탄
const BG_CARD = 'color-mix(in srgb, rgb(var(--brand-card)) 80%, rgb(var(--brand-cream)) 20%)'
const BG_INFO = 'color-mix(in srgb, rgb(var(--brand-cream)) 78%, rgb(var(--brand-mute)) 22%)'

/* 안쪽 점선 바느질 테두리 (펠트 느낌) */
function Stitch({ className = '' }) {
  return (
    <span className={`pointer-events-none absolute inset-[6px] rounded-[18px] border border-dashed border-brand-brown/15 ${className}`} />
  )
}

/* 종이질감 장식 아이콘 — public/icons/*.svg 실루엣을 마스크로, paper.jpg 텍스처를 그 안에만.
 * 아이콘 출처: Phosphor Icons (MIT) — public/icons/{paw,bone,heart}.svg */
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

/* type → 아이콘 + 색상 */
const TYPE_META = {
  intruder: { icon: UserX, cls: 'bg-brand-danger/15 text-brand-danger' },
  abnormal: { icon: AlertTriangle, cls: 'bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))]' },
  food_low: { icon: UtensilsCrossed, cls: 'bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))]' },
  water_low: { icon: Droplets, cls: 'bg-[#5BA4D9]/15 text-[rgb(var(--brand-water-ink))]' },
  water_skipped: { icon: Droplets, cls: 'bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))]' },
  feed: { icon: UtensilsCrossed, cls: 'bg-brand-primary/15 text-brand-primary' },
  // 긴급 정지 — 없으면 DEFAULT_META 의 종 아이콘이 붙어서 뭘 멈췄는지 안 보인다
  dispenser_stopped: { icon: X, cls: 'bg-brand-danger/15 text-brand-danger' },
  sleep: { icon: Moon, cls: 'bg-brand-brown/10 text-brand-brown' },
  call: { icon: PhoneCall, cls: 'bg-brand-brown/10 text-brand-brown' },
}
const DEFAULT_META = { icon: Bell, cls: 'bg-brand-brown/10 text-brand-brown' }

export function Notifications() {
  const navigate = useNavigate()
  const list = useNotifications()

  useEffect(() => {
    markAllRead()
  }, [])

  const [clearing, setClearing] = useState(false) // 전체 삭제 도미노 진행 중
  const STAGGER = 70 // 항목 간 시차(ms)
  const EXIT_MS = 360 // 항목 1개 사라지는 시간(ms)

  // 알림 클릭 시 이동하지 않음 (통계 등으로 이동 막기)
  const open = () => {}

  // 위에서부터 차례로(드르륵) 사라진 뒤 실제 삭제
  const handleClearAll = () => {
    if (clearing || list.length === 0) return
    setClearing(true)
    const total = (list.length - 1) * STAGGER + EXIT_MS + 60
    setTimeout(() => {
      clearNotifications()
      setClearing(false)
    }, total)
  }

  return (
    <div className="px-5 pb-6">
      {/* 헤더 + 뒤로가기 */}
      <header className="flex items-center gap-2.5 pt-5 pb-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="뒤로가기"
          className="w-9 h-9 -ml-1 flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-cute text-2xl font-bold text-brand-brown leading-tight">알림</h1>
          <p className="text-sm text-brand-mute truncate">
            {list.length > 0 ? `알림 ${list.length}개` : '모두 확인했어요'}
          </p>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl shadow-soft px-5 py-10 mt-2 text-center" style={{ backgroundColor: BG_CARD }}>
          <Stitch />
          <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute -right-3 -bottom-3 w-20 h-20 rotate-6" />
          <PaperIcon shape="heart" color="rgb(var(--brand-primary))" opacity={0.5} className="absolute left-6 top-5 w-3.5 h-3.5" />
          <PaperIcon shape="bone" color="rgb(var(--brand-primary-deep))" opacity={0.12} className="absolute right-7 top-6 w-6 h-6 -rotate-12" />
          <div className="relative z-10 flex flex-col items-center text-brand-mute">
            <span className="w-16 h-16 rounded-full flex items-center justify-center mb-3 border border-dashed border-brand-brown/20" style={{ backgroundColor: BG_INFO }}>
              <Bell className="w-8 h-8 text-brand-primary/70" />
            </span>
            <p className="font-display text-lg font-bold text-brand-brown">새로운 알림이 없어요</p>
            <p className="text-sm mt-1">우리 아이에게 무슨 일이 생기면 여기로 알려드릴게요 🐾</p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative rounded-3xl shadow-soft mt-2" style={{ backgroundColor: BG_CARD }}>
            <Stitch />
            <div
              className={`relative z-10 m-1.5 rounded-[18px] overflow-hidden divide-y divide-brand-line/70 ${
                list.length > 6 ? 'max-h-[65vh] overflow-y-auto' : ''
              }`}
            >
              {list.map((n, i) => {
                const meta = TYPE_META[n.type] || DEFAULT_META
                const Icon = meta.icon
                return (
                  <SwipeRow
                    key={n.id}
                    onDelete={() => removeNotification(n.id)}
                    onTap={() => open(n)}
                    exiting={clearing}
                    exitDelay={i * STAGGER}
                    exitMs={EXIT_MS}
                  >
                    <div className="relative flex items-center gap-3 px-4 py-3.5 bg-brand-card">
                      <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-dashed border-brand-brown/15 ${meta.cls}`}>
                        <Icon className="w-5 h-5" />
                      </span>

                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-bold text-brand-brown">{n.title}</p>
                        <p className="text-xs text-brand-mute truncate mt-0.5">{n.desc}</p>
                        <p className="text-[11px] text-brand-mute/80 mt-0.5">{timeAgo(n.time)}</p>
                      </div>
                    </div>
                  </SwipeRow>
                )
              })}
            </div>
          </div>
          <p className="mt-2 px-1 text-[11px] text-brand-mute text-center">🐾 알림을 옆으로 밀면 삭제돼요 🐾</p>

          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearing}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-3xl border border-dashed border-brand-brown/25 text-brand-brown font-bold py-3 text-sm touch-active disabled:opacity-60"
            style={{ backgroundColor: BG_INFO }}
          >
            <Trash2 className="w-4 h-4" /> 전체 삭제
          </button>
        </>
      )}
    </div>
  )
}

/* 좌우로 밀어서 삭제하는 행. 살짝 움직이면 원위치, 임계값 넘기면 날아가며 삭제, 탭은 onTap */
function SwipeRow({ children, onDelete, onTap, exiting = false, exitDelay = 0, exitMs = 360 }) {
  const [dx, setDx] = useState(0)
  const [animating, setAnimating] = useState(false)
  const drag = useRef(null)
  const THRESHOLD = 96 // 이 거리 넘겨야 삭제

  // 전체 삭제(도미노): exiting 켜지면 시차를 두고 왼쪽으로 밀려 사라짐
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (exiting) requestAnimationFrame(() => setGone(true))
  }, [exiting])

  const onDown = (e) => {
    if (exiting) return
    drag.current = { x: e.clientX, moved: false }
    setAnimating(false)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    if (!drag.current) return
    const d = e.clientX - drag.current.x
    if (Math.abs(d) > 5) drag.current.moved = true
    setDx(d)
  }
  const onUp = (e) => {
    const info = drag.current
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (!info) return
    if (!info.moved) {
      setDx(0)
      onTap?.()
      return
    }
    setAnimating(true)
    if (Math.abs(dx) > THRESHOLD) {
      setDx(dx > 0 ? 500 : -500) // 화면 밖으로 날린 뒤 제거
      setTimeout(() => onDelete?.(), 200)
    } else {
      setDx(0) // 원위치
    }
  }

  const reveal = Math.abs(dx) > 8
  return (
    <div
      className="relative overflow-hidden"
      style={{
        maxHeight: gone ? 0 : 240,
        opacity: gone ? 0 : 1,
        transition: exiting
          ? `max-height ${exitMs}ms ease ${exitDelay}ms, opacity ${exitMs}ms ease ${exitDelay}ms`
          : 'none',
      }}
    >
      {/* 뒤 배경: 빨간 삭제 */}
      <div
        className={`absolute inset-0 flex items-center bg-brand-danger text-white ${dx > 0 ? 'justify-start pl-5' : 'justify-end pr-5'}`}
        style={{ opacity: reveal ? 1 : 0, transition: 'opacity 120ms' }}
      >
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          <Trash2 className="w-4 h-4" /> 삭제
        </span>
      </div>
      {/* 앞 컨텐츠 (밀리는 부분) */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative select-none cursor-grab active:cursor-grabbing"
        style={{
          transform: exiting ? `translateX(${gone ? '-110%' : '0'})` : `translateX(${dx}px)`,
          opacity: exiting && gone ? 0 : 1,
          transition: exiting
            ? `transform ${exitMs}ms cubic-bezier(.4,0,.2,1) ${exitDelay}ms, opacity ${exitMs}ms ease ${exitDelay}ms`
            : animating
              ? 'transform 200ms ease'
              : 'none',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default Notifications
