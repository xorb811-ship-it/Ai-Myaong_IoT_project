import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, UserX, AlertTriangle, UtensilsCrossed, Droplets,
  Moon, PhoneCall, CheckCheck, Bell, Trash2,
} from 'lucide-react'
import { Card } from '../components/ui'
import {
  useNotifications, markRead, markAllRead, removeNotification, clearNotifications, timeAgo,
} from '../lib/notificationRepository'

/* type → 아이콘 + 색상 */
const TYPE_META = {
  intruder: { icon: UserX, cls: 'bg-brand-danger/15 text-brand-danger' },
  abnormal: { icon: AlertTriangle, cls: 'bg-brand-warning/20 text-[#A06B1A]' },
  food_low: { icon: UtensilsCrossed, cls: 'bg-brand-warning/20 text-[#A06B1A]' },
  water_low: { icon: Droplets, cls: 'bg-[#5BA4D9]/15 text-[#3E7FB0]' },
  feed: { icon: UtensilsCrossed, cls: 'bg-brand-primary/15 text-brand-primary' },
  sleep: { icon: Moon, cls: 'bg-brand-brown/10 text-brand-brown' },
  call: { icon: PhoneCall, cls: 'bg-brand-brown/10 text-brand-brown' },
}
const DEFAULT_META = { icon: Bell, cls: 'bg-brand-brown/10 text-brand-brown' }

export function Notifications() {
  const navigate = useNavigate()
  const list = useNotifications()
  const unread = list.filter((n) => !n.read).length

  const [clearing, setClearing] = useState(false) // 전체 삭제 도미노 진행 중
  const STAGGER = 70 // 항목 간 시차(ms)
  const EXIT_MS = 360 // 항목 1개 사라지는 시간(ms)

  const open = (n) => {
    if (clearing) return
    if (!n.read) markRead(n.id)
    if (n.link) navigate(n.link)
  }

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
          className="w-10 h-10 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold text-brand-brown leading-tight">알림</h1>
          <p className="text-sm text-brand-mute truncate">
            {unread > 0 ? `읽지 않은 알림 ${unread}개` : '모두 확인했어요'}
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-brand-cream text-brand-brown text-xs font-bold touch-active shrink-0"
          >
            <CheckCheck className="w-4 h-4" /> 모두 읽음
          </button>
        )}
      </header>

      {list.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center text-brand-mute">
          <span className="w-16 h-16 rounded-3xl bg-brand-cream flex items-center justify-center mb-3">
            <Bell className="w-8 h-8 text-brand-primary/70" />
          </span>
          <p className="font-display text-lg font-bold text-brand-brown">새로운 알림이 없어요</p>
          <p className="text-sm mt-1">우리 아이에게 무슨 일이 생기면 여기로 알려드릴게요 🐾</p>
        </div>
      ) : (
        <>
          <Card
            className={`overflow-hidden divide-y divide-brand-line ${
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
                  <div
                    className={`relative flex items-center gap-3 px-4 py-3.5 ${
                      n.read ? 'bg-brand-card' : 'bg-brand-primary/[0.06]'
                    }`}
                  >
                    {/* 안읽음 좌측 강조 바 */}
                    {!n.read && <span className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary" />}

                    <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${meta.cls}`}>
                      <Icon className="w-5 h-5" />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />}
                        <p className={`truncate ${n.read ? 'text-sm font-semibold text-brand-brown/80' : 'text-sm font-bold text-brand-brown'}`}>
                          {n.title}
                        </p>
                      </div>
                      <p className="text-xs text-brand-mute truncate mt-0.5">{n.desc}</p>
                      <p className="text-[11px] text-brand-mute/80 mt-0.5">{timeAgo(n.time)}</p>
                    </div>
                  </div>
                </SwipeRow>
              )
            })}
          </Card>
          <p className="mt-2 px-1 text-[11px] text-brand-mute text-center">← 알림을 옆으로 밀면 삭제돼요 →</p>

          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearing}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-3xl bg-brand-cream text-brand-mute font-bold py-3 text-sm touch-active disabled:opacity-60"
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
