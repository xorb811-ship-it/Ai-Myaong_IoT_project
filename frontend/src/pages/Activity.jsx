import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Video, Moon, UserX, UtensilsCrossed, Mic,
  Activity as ActivityIcon, X, Play, MapPin, Clock, Cpu, PawPrint, Dog, Cat,
  CheckCheck, ShieldAlert,
} from 'lucide-react'
import { Card, CreamCard, Badge } from '../components/ui'
import { api, resolveMediaUrl } from '../api/api'

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
  { id: 'all', label: '전체' },
  { id: 'vision', label: '감지' },
  { id: 'feed', label: '급여' },
]

export function Activity() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null) // 상세 시트 대상

  const all = useMemo(
    () => [...DETECTIONS, ...FEEDINGS].sort((a, b) => b.time.localeCompare(a.time)),
    [],
  )
  const list = filter === 'all' ? all : all.filter((x) => x.cat === filter)

  const detectCount = DETECTIONS.length
  const feedTotal = FEEDINGS.reduce((s, f) => s + (getFeedLog(f.feed_log_id)?.feed_amount || 0), 0)

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
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-brand-brown leading-tight">활동 전체 보기</h1>
          <p className="text-sm text-brand-mute truncate">오늘의 감지 · 급여 기록</p>
        </div>
      </header>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="px-4 py-4">
          <div className="flex items-center gap-1.5 text-brand-mute mb-1">
            <ActivityIcon className="w-4 h-4 text-brand-primary" />
            <p className="text-[11px] font-semibold">오늘 감지</p>
          </div>
          <p className="font-display text-2xl font-bold text-brand-brown leading-none">{detectCount}건</p>
        </Card>
        <Card className="px-4 py-4">
          <div className="flex items-center gap-1.5 text-brand-mute mb-1">
            <UtensilsCrossed className="w-4 h-4 text-brand-primary" />
            <p className="text-[11px] font-semibold">오늘 급여</p>
          </div>
          <p className="font-display text-2xl font-bold text-brand-brown leading-none">{feedTotal}g</p>
        </Card>
      </div>

      {/* 필터 탭 */}
      <div className="mt-4 flex justify-center">
        <div className="inline-flex bg-brand-cream rounded-full p-1 shadow-soft-inset">
          {FILTERS.map((f) => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-5 py-1.5 text-sm font-bold rounded-full transition-colors ${active ? 'bg-brand-primary text-white shadow-soft' : 'text-brand-mute'}`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 통합 타임라인 (항목 탭 → 상세) */}
      <section className="mt-4">
        <div key={filter} className="page-enter">
          <CreamCard className="divide-y divide-brand-line">
            {list.map((e) => {
              const Icon = e.icon
              const isFeed = e.cat === 'feed'
              const log = isFeed ? getFeedLog(e.feed_log_id) : null
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelected(e)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-brand-card/60 transition-colors"
                >
                  <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${isFeed ? 'bg-brand-primary/15 text-brand-primary' : 'bg-brand-brown/10 text-brand-brown'}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-brand-brown truncate">{e.type}</p>
                    <p className="text-xs text-brand-mute truncate">{isFeed ? `사료 ${log?.feed_amount}g` : e.desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge tone={isFeed ? 'primary' : 'brown'}>{isFeed ? '급여' : '감지'}</Badge>
                    <span className="text-[11px] text-brand-mute">{e.time}</span>
                    <ChevronRight className="w-4 h-4 text-brand-mute" />
                  </div>
                </button>
              )
            })}
            {list.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-brand-mute">기록이 없어요.</p>
            )}
          </CreamCard>
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
        className="relative w-full max-w-[480px] max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-brand-bg px-5 pt-3 pb-8 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{ transform: show ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div className="mx-auto w-10 h-1.5 rounded-full bg-brand-line mb-4" />

        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isFeed ? 'bg-brand-primary/15 text-brand-primary' : item.danger ? 'bg-brand-danger/15 text-brand-danger' : 'bg-brand-brown/10 text-brand-brown'}`}>
            <Icon className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-bold text-brand-brown leading-tight">{item.type}</h3>
            <p className="text-xs text-brand-mute">오늘 {item.time}</p>
          </div>
          <button type="button" onClick={dismiss} aria-label="닫기" className="text-brand-mute touch-active">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4">
          {isFeed ? <FeedingBody item={item} /> : <DetectionBody item={item} />}
        </div>
      </div>
    </div>
  )
}

/* 급여 상세: FEED_LOGS → PETS 릴레이션 */
function FeedingBody({ item }) {
  const log = getFeedLog(item.feed_log_id)
  const pet = log ? getPet(log.pet_id) : null
  const PetIcon = pet ? speciesIcon(pet.pet_type) : PawPrint

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={<Clock className="w-4 h-4" />} label="배식 시각" value={item.time} />
        <StatCard icon={<UtensilsCrossed className="w-4 h-4" />} label="배식량" value={log ? `${log.feed_amount}g` : '-'} accent />
        <StatCard icon={<Cpu className="w-4 h-4" />} label="기기 ID" value={log?.device_id || '-'} />
        <StatCard icon={<PetIcon className="w-4 h-4" />} label="대상 반려동물" value={pet?.pet_name || '-'} />
      </div>

      <div className="mt-3 rounded-2xl bg-brand-cream p-3.5 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-brand-success/20 text-brand-success flex items-center justify-center shrink-0">
          <CheckCheck className="w-4 h-4" />
        </span>
        <p className="text-sm text-brand-brown/90">
          <b>{pet?.pet_name}</b>에게 <b>{log?.feed_amount}g</b> 배식 완료
          <span className="text-brand-mute"> · {log?.status}</span>
        </p>
      </div>

      <p className="mt-2 text-[11px] text-brand-mute">
        활동 → feed_log#{item.feed_log_id} → pet#{log?.pet_id} ({pet?.pet_name})
      </p>
    </div>
  )
}

/* 감지 상세: CLIPS 릴레이션 + 실제 영상 재생 */
function DetectionBody({ item }) {
  const clip = item.clip_id ? getClip(item.clip_id) : null
  const [videoUrl, setVideoUrl] = useState(null)
  const [videoFailed, setVideoFailed] = useState(false)

  // 백엔드가 클립을 저장/서빙하면 재생 URL 을 받아 자동 재생.
  // 미구현 시 storage_path 를 API_BASE 기준으로 직접 시도 → 그래도 없으면 placeholder.
  useEffect(() => {
    setVideoUrl(null)
    setVideoFailed(false)
    if (!clip) return undefined
    let alive = true
    api
      .getClipUrl(clip.clip_id)
      .then((u) => { if (alive && u) setVideoUrl(u) })
      .catch(() => { if (alive) setVideoUrl(resolveMediaUrl(clip.storage_path)) })
    return () => { alive = false }
  }, [clip])

  const showVideo = !!(clip && videoUrl && !videoFailed)

  return (
    <div>
      {/* 클립 영역 */}
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-brand-brown to-black">
        {clip ? (
          <>
            {showVideo ? (
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                onError={() => setVideoFailed(true)}
                className="absolute inset-0 w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-2">
                <span className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <Play className="w-6 h-6 ml-0.5" />
                </span>
                <span className="text-[11px] font-semibold">영상 준비 중 · 처리되면 자동 재생</span>
              </div>
            )}
            <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold pointer-events-none">
              <Video className="w-3.5 h-3.5" /> REC
            </span>
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold pointer-events-none">
              <MapPin className="w-3.5 h-3.5" /> {clip.camera_location}
            </span>
            {!showVideo && (
              <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-bold tabular-nums pointer-events-none">
                00:{String(clip.duration).padStart(2, '0')}
              </span>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/75 text-sm font-semibold">
            저장된 영상이 없는 이벤트예요
          </div>
        )}
      </div>

      {/* 메타 */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <StatCard icon={<Clock className="w-4 h-4" />} label="탐지 시각" value={item.time} />
        <StatCard icon={<MapPin className="w-4 h-4" />} label="위치" value={clip?.camera_location || item.desc} />
      </div>

      {item.danger && (
        <div className="mt-3 rounded-2xl bg-brand-danger/10 p-3.5 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-brand-danger shrink-0" />
          <p className="text-sm font-bold text-brand-danger">주의가 필요한 감지예요. 영상을 확인해 주세요.</p>
        </div>
      )}

      {clip && (
        <p className="mt-2 text-[11px] text-brand-mute truncate">
          활동 → clip#{clip.clip_id} · {clip.storage_path} · {clip.duration}초
        </p>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div className={`rounded-2xl p-3.5 ${accent ? 'bg-brand-primary/10' : 'bg-brand-cream'}`}>
      <p className="flex items-center gap-1 text-[11px] font-bold text-brand-mute">
        <span className={accent ? 'text-brand-primary' : 'text-brand-mute'}>{icon}</span>
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-bold text-brand-brown leading-none truncate">{value}</p>
    </div>
  )
}

export default Activity
