import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Video, Moon, UserX, UtensilsCrossed, Mic, Droplets,
  Activity as ActivityIcon, X, Play, MapPin, Clock, Cpu, PawPrint, Dog, Cat,
  CheckCheck, ShieldAlert, Footprints, Trash2,
} from '../components/icons'
import { Badge } from '../components/ui'
import { LogDatePicker } from '../components/LogDatePicker'
import { api, resolveMediaUrl } from '../api/api'
import { filterLogsByDate, groupLogsByDate } from '../lib/logGrouping'
import { mapVisionEventForList } from '../lib/visionEventMapper'

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

/* ═══════════════════════════════════════════════════════════
 * Mock 데이터 — 백엔드 DB 스키마(관계형) 기반
 *   PETS(pet_id) ─< FEED_LOGS(feed_log_id, pet_id)
 *   CLIPS(clip_id)  ← 감지 이벤트가 참조
 *
 * 활동 항목(ALERTS 성격)이 reference 로 CLIPS / FEED_LOGS 를 가리킨다.
 * 항목 탭 → 상세 시트에서 이 릴레이션을 따라가 상세 통계를 보여준다.
 * (실연동 시 이 상수만 API 응답으로 교체)
 * ═══════════════════════════════════════════════════════════ */
const PETS = [{ pet_id: 1, pet_name: '미야옹', pet_type: 'CAT' }]

const CLIPS = [
  { clip_id: 101, camera_location: '거실', duration: 12, storage_path: '/clips/move-101.mp4' },
  { clip_id: 103, camera_location: '현관', duration: 9, storage_path: '/clips/intruder-103.mp4' },
  { clip_id: 104, camera_location: '안방', duration: 20, storage_path: '/clips/sleep-104.mp4' },
]

const FEED_LOGS = [
  { feed_log_id: 201, pet_id: 1, feed_amount: 15, status: 'SUCCESS', device_id: 'DISP-7F3A' },
  { feed_log_id: 202, pet_id: 1, feed_amount: 10, status: 'SUCCESS', device_id: 'DISP-7F3A' },
  { feed_log_id: 203, pet_id: 1, feed_amount: 15, status: 'SUCCESS', device_id: 'DISP-7F3A' },
]

// 감지 로그 (vision) — clip_id 로 CLIPS 참조 (없으면 기기 이벤트)
const DETECTIONS = [
  { id: 'd1', cat: 'vision', type: '움직임 감지', time: '14:22', icon: Video, desc: '거실 카메라', clip_id: 101 },
  { id: 'd2', cat: 'vision', type: '음성 호출', time: '11:45', icon: Mic, desc: '집사 호출', clip_id: null },
  { id: 'd3', cat: 'vision', type: '외부인 감지', time: '09:11', icon: UserX, desc: '현관 카메라', clip_id: 103, danger: true },
  { id: 'd4', cat: 'vision', type: '수면 감지', time: '03:20', icon: Moon, desc: '안방', clip_id: 104 },
]

// 급여 기록 (feed) — feed_log_id 로 FEED_LOGS 참조
const FEEDINGS = [
  { id: 'f1', cat: 'feed', type: '자동 배식', time: '08:00', icon: UtensilsCrossed, feed_log_id: 201 },
  { id: 'f2', cat: 'feed', type: '자동 배식', time: '13:00', icon: UtensilsCrossed, feed_log_id: 202 },
  { id: 'f3', cat: 'feed', type: '자동 배식', time: '19:00', icon: UtensilsCrossed, feed_log_id: 203 },
]

/* 관계 조회 헬퍼 (FK 매핑) */
const getClip = (id) => CLIPS.find((c) => c.clip_id === id) || null
const getFeedLog = (id) => FEED_LOGS.find((f) => f.feed_log_id === id) || null
const getPet = (id) => PETS.find((p) => p.pet_id === id) || null
const speciesIcon = (t) => (t === 'DOG' ? Dog : Cat)

const FILTERS = [
  { id: 'all', label: '전체', icon: PawPrint },
  { id: 'vision', label: '감지', icon: Video },
  { id: 'feed', label: '급여', icon: UtensilsCrossed },
]

export function Activity() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null) // 상세 시트 대상
  const [selectedDate, setSelectedDate] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [feedLogs, setFeedLogs] = useState({ feed: [], water: [] })
  const [visionEvents, setVisionEvents] = useState([])

  // 급여(배식/급수)는 DB 연동 / 감지는 mock(DETECTIONS) 유지
  useEffect(() => {
    let alive = true
    const load = () => {
      api
        .getDispenserLogs()
        .then((d) => {
          if (alive) setFeedLogs({ feed: d.feed || [], water: d.water || [] })
        })
        .catch(() => {})
    }
    load()
    const timer = window.setInterval(load, 3000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const load = () => {
      api
        .getVisionEvents(50)
        .then((data) => {
          if (alive) setVisionEvents(data.events || [])
        })
        .catch(() => {
          if (alive) setVisionEvents([])
        })
    }
    load()
    const timer = window.setInterval(load, 3000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const feedItems = useMemo(() => {
    const fmt = (iso) => {
      const d = new Date(iso)
      return Number.isNaN(d.getTime())
        ? ''
        : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    // 0g 행은 자동 배식 스케줄러의 '이 분에 이미 배식함' 잠금 기록이라 활동으로 보여줄 게 없다.
    // 실제 배식량은 ESP32 가 저울로 잰 값이 별도 행으로 들어온다.
    const food = (feedLogs.feed || []).filter((x) => (Number(x.amount_g) || 0) > 0).map((x, i) => {
      const amt = Math.round(Number(x.amount_g) || 0)
      return { id: `f${i}-${x.created_at}`, cat: 'feed', kind: 'food', icon: UtensilsCrossed, type: '배식', amount: amt, unit: 'g', feedType: x.feed_type, desc: `사료 ${amt}g`, time: fmt(x.created_at), rawTime: x.created_at }
    })
    // 0ml 행은 자동 급수 스케줄러의 '이 분에 이미 급수함' 잠금 기록이라 활동으로 보여줄 게 없다.
    // (순환 구조라 펌프를 돌려도 물이 통에서 줄지 않아 급수량 ml 이 성립하지 않는다)
    const water = (feedLogs.water || []).filter((x) => (Number(x.amount_ml) || 0) > 0).map((x, i) => {
      const amt = Math.round(Number(x.amount_ml) || 0)
      const skipped = x.water_type === 'skipped'
      return { id: `w${i}-${x.created_at}`, cat: 'feed', kind: 'water', icon: Droplets, type: skipped ? '급수 미실행' : '급수', amount: amt, unit: skipped ? '초' : 'ml', feedType: x.water_type, desc: skipped ? `고양이 미감지로 ${amt}초 자동 급수 취소` : `물 ${amt}ml`, time: fmt(x.created_at), rawTime: x.created_at, warning: skipped }
    })
    return [...food, ...water]
  }, [feedLogs])

  const visionItems = useMemo(
    () => (visionEvents || []).map((event) => ({
      ...mapVisionEventForList(event),
      cat: 'vision',
      icon: ['away_person', 'fall_detected', 'no_motion', 'no_motion_warning', 'no_motion_emergency', 'seizure_suspected'].includes(event.type) ? UserX : Video,
      desc: event.message,
    })),
    [visionEvents],
  )

  const all = useMemo(
    () => [...visionItems, ...feedItems].sort((a, b) => {
      const at = a.rawTime ? new Date(a.rawTime).getTime() : 0
      const bt = b.rawTime ? new Date(b.rawTime).getTime() : 0
      if (at || bt) return bt - at
      return String(b.time).localeCompare(String(a.time))
    }),
    [feedItems, visionItems],
  )
  const categoryList = filter === 'all' ? all : all.filter((x) => x.cat === filter)
  const list = useMemo(() => filterLogsByDate(categoryList, selectedDate), [categoryList, selectedDate])
  const groupedList = useMemo(() => groupLogsByDate(list), [list])

  const deleteActivityLog = async (item, event) => {
    event?.stopPropagation()
    if (!item?.eventId) return
    try {
      await api.deleteAlert(item.eventId)
      setVisionEvents((events) => events.filter((row) => row.id !== item.eventId))
      setSelected((current) => (current?.eventId === item.eventId ? null : current))
    } catch (error) {
      console.error('[Activity] delete event failed:', error)
    }
  }

  const detectCount = visionItems.length
  const feedTotal = feedItems.filter((x) => x.kind === 'food').reduce((s, x) => s + x.amount, 0)

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
        <div className="min-w-0">
          <h1 className="font-cute text-2xl font-bold text-brand-brown leading-tight">활동 전체 보기</h1>
          <p className="text-sm text-brand-mute truncate">최근 이벤트는 30일 동안 보관돼요 🐾</p>
        </div>
      </header>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          icon={<ActivityIcon className="w-4 h-4" />}
          deco="paw"
          label="오늘 감지"
          value={detectCount}
          unit="건"
        />
        <SummaryCard
          icon={<UtensilsCrossed className="w-4 h-4" />}
          deco="bone"
          label="오늘 급여"
          value={feedTotal}
          unit="g"
        />
      </div>

      {/* 필터 탭 */}
      <div className="mt-4 flex justify-center">
        <div className="inline-flex bg-brand-cream rounded-full p-1 shadow-soft-inset">
          {FILTERS.map((f) => {
            const active = filter === f.id
            const FIcon = f.icon
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold rounded-full transition-colors ${active ? 'bg-brand-primary text-white shadow-soft' : 'text-brand-mute'}`}
              >
                <FIcon className="w-4 h-4" />
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 통합 타임라인 (항목 탭 → 상세) */}
      <LogDatePicker
        items={categoryList}
        open={calendarOpen}
        selectedDate={selectedDate}
        onToggle={() => setCalendarOpen((open) => !open)}
        onSelectDate={(dateKey) => {
          setSelectedDate(dateKey)
          setCalendarOpen(false)
        }}
        onClearDate={() => setSelectedDate('')}
        className="mt-3"
      />

      <section className="mt-4">
        <div key={filter} className="page-enter relative rounded-3xl shadow-soft" style={{ backgroundColor: BG_CARD }}>
          <Stitch />
          <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.08} className="absolute -right-3 -bottom-3 w-16 h-16 rotate-6" />
          <div className={`relative z-10 m-1.5 rounded-[18px] overflow-hidden ${list.length > 6 ? 'max-h-[420px] overflow-y-auto no-scrollbar' : ''}`}>
            {groupedList.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-10 px-4 py-2 bg-brand-cream/95 backdrop-blur text-[11px] font-bold text-brand-mute border-y border-brand-line/70 first:border-t-0">
                  {group.label}
                </div>
                <div className="divide-y divide-brand-line/70">
                  {group.items.map((e) => {
              const Icon = e.icon
              const isFeed = e.cat === 'feed'
              return (
                <div
                  key={e.id}
                  className="w-full flex items-center gap-2 px-4 py-3.5 bg-brand-card"
                >
                  <button
                    type="button"
                    onClick={() => setSelected(e)}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left active:bg-brand-cream/60 transition-colors rounded-2xl"
                  >
                  <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-dashed ${isFeed ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/30' : e.danger ? 'bg-brand-danger/15 text-brand-danger border-brand-danger/30' : e.warning ? 'bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))] border-[rgb(var(--brand-warning-ink)/0.3)]' : 'bg-brand-brown/10 text-brand-brown border-brand-brown/25'}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-brand-brown truncate">{e.type}</p>
                    <p className="text-xs text-brand-mute truncate">{e.desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge tone={isFeed ? 'primary' : e.danger ? 'danger' : e.warning ? 'warn' : 'brown'}>{isFeed ? '급여' : '감지'}</Badge>
                    <span className="text-[11px] text-brand-mute">{e.time}</span>
                    <ChevronRight className="w-4 h-4 text-brand-mute" />
                  </div>
                  </button>
                  {e.eventId && (
                    <button
                      type="button"
                      onClick={(event) => deleteActivityLog(e, event)}
                      className="w-9 h-9 rounded-2xl text-brand-mute flex items-center justify-center shrink-0 border border-dashed border-brand-brown/15 active:bg-brand-danger/10 active:text-brand-danger transition-colors"
                      style={{ backgroundColor: BG_INFO }}
                      aria-label="로그 삭제"
                      title="로그 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
                  })}
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <div className="px-4 py-10 flex flex-col items-center text-center bg-brand-card">
                <span className="w-14 h-14 rounded-full flex items-center justify-center mb-3 border border-dashed border-brand-brown/20" style={{ backgroundColor: BG_INFO }}>
                  <Footprints className="w-7 h-7 text-brand-primary/70" />
                </span>
                <p className="font-display text-base font-bold text-brand-brown">아직 기록이 없어요</p>
                <p className="text-xs text-brand-mute mt-1">우리 아이의 활동이 여기에 쌓여요 🐾</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 상세 바텀시트 */}
      {selected && <DetailSheet item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

/* ───── 상세 바텀시트 (아래에서 슬라이드 업) ───── */
function DetailSheet({ item, onClose }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const dismiss = () => {
    setShow(false)
    setTimeout(onClose, 280)
  }

  const isFeed = item.cat === 'feed'
  const Icon = item.icon

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={dismiss}>
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: 'rgba(45,37,32,0.45)', opacity: show ? 1 : 0 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-b-3xl px-5 pt-3 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{
          backgroundColor: BG_CARD,
          transform: show ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <Stitch className="!inset-[8px] !rounded-[22px]" />
        <PaperIcon shape="heart" color="rgb(var(--brand-primary))" opacity={0.4} className="absolute right-6 top-6 w-3.5 h-3.5" />
        <div className="relative z-10">
          <div className="mx-auto w-10 h-1.5 rounded-full bg-brand-line mb-4" />

          {/* 헤더 */}
          <div className="flex items-center gap-3">
            <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-dashed ${isFeed ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/30' : item.danger ? 'bg-brand-danger/15 text-brand-danger border-brand-danger/30' : item.warning ? 'bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))] border-[rgb(var(--brand-warning-ink)/0.3)]' : 'bg-brand-brown/10 text-brand-brown border-brand-brown/25'}`}>
              <Icon className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-lg font-bold text-brand-brown leading-tight">{item.type}</h3>
              <p className="text-xs text-brand-mute">오늘 {item.time}</p>
            </div>
            <button type="button" onClick={dismiss} aria-label="닫기" className="w-9 h-9 rounded-full flex items-center justify-center text-brand-mute touch-active shrink-0 border border-dashed border-brand-brown/20" style={{ backgroundColor: BG_INFO }}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4">
            {isFeed ? <FeedingBody item={item} /> : <DetectionBody item={item} />}
          </div>
        </div>
      </div>
    </div>
  )
}

/* 급여 상세: DB(FEED_LOGS / WATER_LOGS) 기록 기반 */
function FeedingBody({ item }) {
  const FEED_TYPE_KO = { manual: '수동', quick: '빠른', auto: '자동' }
  const isWater = item.kind === 'water'
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={<Clock className="w-4 h-4" />} label="시각" value={item.time} />
        <StatCard
          icon={isWater ? <Droplets className="w-4 h-4" /> : <UtensilsCrossed className="w-4 h-4" />}
          label={isWater ? '급수량' : '배식량'}
          value={`${item.amount}${item.unit}`}
          accent
        />
        <StatCard icon={<PawPrint className="w-4 h-4" />} label="종류" value={isWater ? '급수' : '배식'} />
        <StatCard icon={<Cpu className="w-4 h-4" />} label="방식" value={FEED_TYPE_KO[item.feedType] || item.feedType || '-'} />
      </div>

      <div className="mt-3 rounded-2xl p-3.5 flex items-center gap-2 border border-dashed border-brand-brown/15" style={{ backgroundColor: BG_INFO }}>
        <span className="w-7 h-7 rounded-full bg-brand-success/20 text-brand-success flex items-center justify-center shrink-0 border border-dashed border-brand-success/30">
          <CheckCheck className="w-4 h-4" />
        </span>
        <p className="text-sm text-brand-brown/90">
          {isWater ? '급수' : '배식'} <b>{item.amount}{item.unit}</b> 완료 🐾
        </p>
      </div>
    </div>
  )
}

/* 감지 상세: CLIPS 릴레이션 + 실제 영상 재생 */
function DetectionBody({ item }) {
  const clip = item.clip_id ? getClip(item.clip_id) : null
  const [mediaUrl, setMediaUrl] = useState(null)
  const [mediaFailed, setMediaFailed] = useState(false)
  const storagePath = item.storage_path || clip?.storage_path || ''
  const isCapture = item.eventType === 'capture_saved'
  const isAwayPerson = item.eventType === 'away_person'
  const hasMedia = !!storagePath

  useEffect(() => {
    setMediaUrl(null)
    setMediaFailed(false)
    if (storagePath) {
      setMediaUrl(api.getVisionMediaUrl(storagePath))
      return undefined
    }
    if (!clip) return undefined
    let alive = true
    api
      .getClipUrl(clip.clip_id)
      .then((u) => { if (alive && u) setMediaUrl(u) })
      .catch(() => { if (alive) setMediaUrl(resolveMediaUrl(clip.storage_path)) })
    return () => { alive = false }
  }, [clip, storagePath])

  const showImage = isCapture && mediaUrl && !mediaFailed
  const showVideo = !isCapture && mediaUrl && !mediaFailed
  const openLocalPath = () => {
    if (!storagePath) return
    api.revealVisionMedia(storagePath).catch((error) => {
      console.error('[Activity] reveal media failed:', error)
    })
  }

  return (
    <div>
      {isAwayPerson && (
        <div className="rounded-2xl bg-brand-danger/10 p-4 flex items-start gap-3">
          <span className="w-9 h-9 rounded-2xl bg-brand-danger/15 text-brand-danger flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand-danger">{item.type}</p>
            <p className="mt-1 text-sm text-brand-brown/80">{item.desc}</p>
          </div>
        </div>
      )}
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-brand-brown to-black">
        {hasMedia || clip ? (
          <>
            {showImage ? (
              <img
                src={mediaUrl}
                alt={item.type}
                onError={() => setMediaFailed(true)}
                className="absolute inset-0 w-full h-full object-contain bg-black"
              />
            ) : showVideo ? (
              <video
                src={mediaUrl}
                controls
                playsInline
                preload="metadata"
                onError={() => setMediaFailed(true)}
                className="absolute inset-0 w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-2">
                <span className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  {isCapture ? <Video className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                </span>
                <span className="text-[11px] font-semibold">
                  {mediaFailed ? '미리보기를 불러오지 못했어요' : '미리보기 준비 중'}
                </span>
              </div>
            )}
            <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold pointer-events-none">
              <Video className="w-3.5 h-3.5" /> {isCapture ? 'CAPTURE' : 'REC'}
            </span>
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold pointer-events-none">
              <MapPin className="w-3.5 h-3.5" /> {clip?.camera_location || '로봇 비전'}
            </span>
            {!showVideo && (
              <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-bold tabular-nums pointer-events-none">
                {clip?.duration ? `00:${String(clip.duration).padStart(2, '0')}` : item.eventType || 'EVENT'}
              </span>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/75 text-sm font-semibold">
            저장된 미디어가 없는 이벤트예요
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <StatCard icon={<Clock className="w-4 h-4" />} label="탐지 시각" value={item.time} />
        <button
          type="button"
          onClick={openLocalPath}
          disabled={!storagePath}
          className="rounded-2xl p-3.5 text-left border border-dashed border-brand-brown/15 disabled:cursor-default active:bg-brand-line/40"
          style={{ backgroundColor: BG_INFO }}
          title={storagePath || clip?.camera_location || item.desc}
        >
          <p className="flex items-center gap-1 text-[11px] font-bold text-brand-mute">
            <span className="text-brand-primary-deep"><MapPin className="w-4 h-4" /></span> 위치
          </p>
          <p className="mt-1 font-display text-lg font-bold text-brand-brown leading-none truncate">
            {storagePath || clip?.camera_location || item.desc}
          </p>
        </button>
      </div>

      {item.danger && (
        <div className="mt-3 rounded-2xl bg-brand-danger/10 p-3.5 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-brand-danger shrink-0" />
          <p className="text-sm font-bold text-brand-danger">주의가 필요한 감지예요. 영상을 확인해 주세요.</p>
        </div>
      )}

      {storagePath && (
        <p className="mt-2 text-[11px] text-brand-mute truncate">
          {storagePath}
        </p>
      )}
    </div>
  )


}

function StatCard({ icon, label, value, accent }) {
  return (
    <div
      className={`rounded-2xl p-3.5 border border-dashed ${accent ? 'bg-brand-primary/10 border-brand-primary/30' : 'border-brand-brown/15'}`}
      style={accent ? undefined : { backgroundColor: BG_INFO }}
    >
      <p className="flex items-center gap-1 text-[11px] font-bold text-brand-mute">
        <span className={accent ? 'text-brand-primary' : 'text-brand-primary-deep'}>{icon}</span>
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-bold text-brand-brown leading-none truncate">{value}</p>
    </div>
  )
}

/* 요약 카드 — 펠트 톤 + 종이질감 장식 + 점선 아이콘칩 (강조) */
function SummaryCard({ icon, deco, label, value, unit }) {
  return (
    <div className="relative overflow-hidden rounded-3xl shadow-soft px-4 py-4" style={{ backgroundColor: BG_CARD }}>
      <Stitch />
      <PaperIcon shape={deco} color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute -right-2 -bottom-2 w-14 h-14 rotate-6" />
      <div className="relative z-10">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border border-dashed border-brand-brown/20 text-brand-primary" style={{ backgroundColor: BG_INFO }}>
            {icon}
          </span>
          <p className="text-[11px] font-bold text-brand-brown/70">{label}</p>
        </div>
        <p className="font-display text-[28px] font-extrabold text-brand-brown leading-none">
          {value}
          <span className="text-base ml-0.5 font-bold text-brand-mute">{unit}</span>
        </p>
      </div>
    </div>
  )
}

export default Activity
