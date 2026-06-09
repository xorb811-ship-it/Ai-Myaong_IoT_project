import { useMemo, useState } from 'react'
import {
  Bell, ShieldAlert, UtensilsCrossed, Play, Phone, BellOff, Video,
  Clock, Cpu, PawPrint, CheckCheck, MapPin, Inbox, Dog, Cat, Repeat,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════
 * Mock 데이터 (백엔드 DB 스키마 그대로 · 관계형 구조)
 *
 *   USERS(user_id) ─┬─< PETS(pet_id, user_id)
 *                   └─< ALERTS(alert_id, user_id, event_type, reference_id)
 *
 *   ALERTS.reference_id ─▶ event_type 에 따라 분기:
 *      'INTRUSION' → CLIPS.clip_id
 *      'FEEDING'   → FEED_LOGS.feed_log_id ─▶ PETS.pet_id (→ pet_name)
 *
 * 실제 연동 시: 이 상수들을 GET /api/alerts 등 API 응답으로 교체하면 됨.
 * ═══════════════════════════════════════════════════════════ */

const USERS = [
  { user_id: 1, email: 'nyce@aimyaong.com', nickname: '묘냥집사', sns_id: null },
]

const PETS = [
  { pet_id: 1, user_id: 1, pet_name: '미야옹', pet_type: 'CAT' },
  { pet_id: 2, user_id: 1, pet_name: '초코', pet_type: 'DOG' },
]

const CLIPS = [
  { clip_id: 101, storage_path: '/clips/intrusion-101.mp4', camera_location: '현관', duration: 12 },
  { clip_id: 102, storage_path: '/clips/intrusion-102.mp4', camera_location: '거실', duration: 8 },
]

const FEED_LOGS = [
  { feed_log_id: 201, pet_id: 1, feed_amount: 15, status: 'SUCCESS', device_id: 'DISP-7F3A', created_at: minsAgo(35) },
  { feed_log_id: 202, pet_id: 2, feed_amount: 30, status: 'SUCCESS', device_id: 'DISP-7F3A', created_at: minsAgo(190) },
  { feed_log_id: 203, pet_id: 1, feed_amount: 10, status: 'SUCCESS', device_id: 'DISP-7F3A', created_at: minsAgo(600) },
]

const ALERTS = [
  { alert_id: 1, user_id: 1, event_type: 'INTRUSION', reference_id: 101, title: '외부인 감지', message: '현관 카메라에서 낯선 사람이 감지됐어요.', is_read: false, created_at: minsAgo(8) },
  { alert_id: 2, user_id: 1, event_type: 'FEEDING', reference_id: 201, title: '자동 배식 완료', message: '미야옹에게 사료 15g을 배식했어요.', is_read: false, created_at: minsAgo(35) },
  { alert_id: 3, user_id: 1, event_type: 'INTRUSION', reference_id: 102, title: '이상 움직임 감지', message: '거실에서 평소와 다른 움직임이 있었어요.', is_read: false, created_at: minsAgo(70) },
  { alert_id: 4, user_id: 1, event_type: 'FEEDING', reference_id: 202, title: '자동 배식 완료', message: '초코에게 사료 30g을 배식했어요.', is_read: true, created_at: minsAgo(190) },
  { alert_id: 5, user_id: 1, event_type: 'FEEDING', reference_id: 203, title: '자동 배식 완료', message: '미야옹에게 사료 10g을 배식했어요.', is_read: true, created_at: minsAgo(600) },
]

/* ───── 관계 조회 헬퍼 (FK 매핑) ───── */
const getClip = (clipId) => CLIPS.find((c) => c.clip_id === clipId) || null
const getFeedLog = (logId) => FEED_LOGS.find((f) => f.feed_log_id === logId) || null
const getPet = (petId) => PETS.find((p) => p.pet_id === petId) || null

/* ───── 시간 유틸 ───── */
function minsAgo(m) {
  return new Date(Date.now() - m * 60000).toISOString()
}
function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}
function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}
const speciesIcon = (type) => (type === 'DOG' ? Dog : Cat)

/* ═══════════════════════════════════════════════════════════
 * 메인 — 2열 관제 대시보드
 * ═══════════════════════════════════════════════════════════ */
export function AlertConsole() {
  const [alerts, setAlerts] = useState(ALERTS)
  const [filter, setFilter] = useState('all') // 'all' | 'unread'
  const [selectedId, setSelectedId] = useState(ALERTS[0]?.alert_id ?? null)

  const total = alerts.length
  const unread = alerts.filter((a) => !a.is_read).length
  const visible = useMemo(
    () => (filter === 'unread' ? alerts.filter((a) => !a.is_read) : alerts),
    [alerts, filter],
  )
  const selected = alerts.find((a) => a.alert_id === selectedId) || null

  // 알림 클릭 → 선택 + 읽음 처리
  const openAlert = (a) => {
    setSelectedId(a.alert_id)
    if (!a.is_read) {
      setAlerts((prev) => prev.map((x) => (x.alert_id === a.alert_id ? { ...x, is_read: true } : x)))
    }
  }
  const markAllRead = () => setAlerts((prev) => prev.map((x) => ({ ...x, is_read: true })))

  return (
    <div className="min-h-screen bg-brand-bg text-brand-brown">
      {/* 상단 바 */}
      <header className="sticky top-0 z-10 bg-brand-bg/90 backdrop-blur border-b border-brand-line px-5 py-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center">
          <ShieldAlert className="w-5 h-5" />
        </span>
        <div>
          <h1 className="font-display text-xl font-bold leading-tight">관제 센터</h1>
          <p className="text-xs text-brand-mute">실시간 알림 · 상세 관제</p>
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] p-4 lg:p-6 grid gap-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        {/* ── Left: 최근 활동/알림 리스트 ── */}
        <section className="rounded-3xl border border-brand-line bg-brand-card shadow-soft overflow-hidden flex flex-col">
          {/* 카운트 배지 */}
          <div className="p-4 border-b border-brand-line">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-brand-primary" />
              <h2 className="font-display text-base font-bold">알림</h2>
              <span className="ml-auto flex items-center gap-1.5 text-xs font-bold">
                <span className="px-2.5 py-1 rounded-full bg-brand-cream text-brand-brown">전체 {total}</span>
                <span className="px-2.5 py-1 rounded-full bg-brand-danger/15 text-brand-danger">미확인 {unread}</span>
              </span>
            </div>

            {/* 필터 토글 + 모두 읽음 */}
            <div className="mt-3 flex items-center justify-between">
              <div className="inline-flex bg-brand-cream rounded-full p-1 shadow-soft-inset">
                {[
                  { id: 'all', label: '전체보기' },
                  { id: 'unread', label: `미확인${unread ? ` ${unread}` : ''}` },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilter(t.id)}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-colors ${
                      filter === t.id ? 'bg-brand-primary text-white shadow-soft' : 'text-brand-mute'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-mute touch-active"
                >
                  <CheckCheck className="w-4 h-4" /> 모두 읽음
                </button>
              )}
            </div>
          </div>

          {/* 리스트 */}
          <div className="flex-1 overflow-y-auto divide-y divide-brand-line max-h-[70vh]">
            {visible.length === 0 ? (
              <div className="px-4 py-16 text-center text-brand-mute">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-60" />
                <p className="text-sm font-semibold">표시할 알림이 없어요</p>
              </div>
            ) : (
              visible.map((a) => (
                <AlertListItem
                  key={a.alert_id}
                  alert={a}
                  active={a.alert_id === selectedId}
                  onClick={() => openAlert(a)}
                />
              ))
            )}
          </div>
        </section>

        {/* ── Right: 동적 상세 관제 뷰 ── */}
        <section key={selectedId} className="page-enter min-h-[420px]">
          {!selected ? (
            <EmptyDetail />
          ) : selected.event_type === 'INTRUSION' ? (
            <IntrusionDetail
              alert={selected}
              clip={getClip(selected.reference_id)}
              onDismiss={() => markAllRead()}
            />
          ) : (
            <FeedingDetail alert={selected} feedLog={getFeedLog(selected.reference_id)} />
          )}
        </section>
      </div>
    </div>
  )
}

/* ───── 좌측 리스트 아이템 ───── */
function AlertListItem({ alert, active, onClick }) {
  const intrusion = alert.event_type === 'INTRUSION'
  const Icon = intrusion ? ShieldAlert : UtensilsCrossed
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
        active ? 'bg-brand-primary/[0.08]' : 'hover:bg-brand-cream/60'
      }`}
    >
      {active && <span className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary" />}
      <span
        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
          intrusion ? 'bg-brand-danger/15 text-brand-danger' : 'bg-brand-primary/15 text-brand-primary'
        }`}
      >
        <Icon className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* 안읽음 블루 닷 */}
          {!alert.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
          <p className={`truncate text-sm ${alert.is_read ? 'font-semibold text-brand-brown/80' : 'font-bold text-brand-brown'}`}>
            {alert.title}
          </p>
        </div>
        <p className="text-xs text-brand-mute truncate mt-0.5">{alert.message}</p>
      </div>
      <span className="text-[11px] text-brand-mute shrink-0">{timeAgo(alert.created_at)}</span>
    </button>
  )
}

/* ───── 빈 상태 ───── */
function EmptyDetail() {
  return (
    <div className="h-full rounded-3xl border border-dashed border-brand-line bg-brand-card/50 flex flex-col items-center justify-center text-brand-mute py-20">
      <Bell className="w-10 h-10 mb-3 opacity-50" />
      <p className="font-display text-lg font-bold text-brand-brown">알림을 선택하세요</p>
      <p className="text-sm mt-1">왼쪽 목록에서 알림을 누르면 상세 관제가 표시돼요.</p>
    </div>
  )
}

/* ═══════════ INTRUSION 상세 (CLIPS 매핑) ═══════════ */
function IntrusionDetail({ alert, clip, onDismiss }) {
  return (
    <div className="rounded-3xl border border-brand-line bg-brand-card shadow-soft overflow-hidden">
      <div className="p-4 flex items-center gap-2 border-b border-brand-line">
        <span className="w-9 h-9 rounded-2xl bg-brand-danger/15 text-brand-danger flex items-center justify-center">
          <ShieldAlert className="w-5 h-5" />
        </span>
        <div>
          <h3 className="font-display text-base font-bold">{alert.title}</h3>
          <p className="text-xs text-brand-mute">외부인 침입 상세 관제</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-danger/15 text-brand-danger text-[11px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-danger animate-pulse" /> 경보
        </span>
      </div>

      <div className="p-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* 비디오 플레이어 (CCTV 클립) */}
        <div>
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-brand-brown to-black">
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                type="button"
                className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white touch-active hover:bg-white/30"
                aria-label="재생"
              >
                <Play className="w-7 h-7 ml-1" />
              </button>
            </div>
            <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold">
              <Video className="w-3.5 h-3.5" /> REC
            </span>
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold">
              <MapPin className="w-3.5 h-3.5" /> {clip?.camera_location || '알 수 없음'}
            </span>
            <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-bold tabular-nums">
              {clip ? `00:${String(clip.duration).padStart(2, '0')}` : '--:--'}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-brand-mute truncate">
            <Video className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
            {clip?.storage_path || '클립 없음'} · {clip?.duration ?? 0}초
          </p>
        </div>

        {/* 탐지 정보 + 액션 */}
        <div className="flex flex-col">
          <div className="rounded-2xl bg-brand-cream p-4">
            <p className="text-xs font-bold text-brand-mute flex items-center gap-1">
              <Clock className="w-4 h-4" /> 탐지 시각
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-brand-brown leading-none">
              {fmtTime(alert.created_at)}
            </p>
            <p className="mt-1 text-xs text-brand-mute">{timeAgo(alert.created_at)} · {clip?.camera_location} 카메라</p>
            <p className="mt-3 text-sm text-brand-brown/90 leading-relaxed">{alert.message}</p>
          </div>

          <div className="mt-auto pt-4 space-y-2.5">
            <a
              href="tel:112"
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-danger text-white font-bold py-3.5 shadow-soft touch-active"
            >
              <Phone className="w-5 h-5" /> 🚨 112 긴급 신고
            </a>
            <button
              type="button"
              onClick={onDismiss}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-cream text-brand-brown font-bold py-3 touch-active"
            >
              <BellOff className="w-5 h-5" /> 경보 끄기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════ FEEDING 상세 (FEED_LOGS → PETS 매핑) ═══════════ */
function FeedingDetail({ alert, feedLog }) {
  const pet = feedLog ? getPet(feedLog.pet_id) : null
  const PetIcon = pet ? speciesIcon(pet.pet_type) : PawPrint

  return (
    <div className="rounded-3xl border border-brand-line bg-brand-card shadow-soft overflow-hidden">
      <div className="p-4 flex items-center gap-2 border-b border-brand-line">
        <span className="w-9 h-9 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center">
          <UtensilsCrossed className="w-5 h-5" />
        </span>
        <div>
          <h3 className="font-display text-base font-bold">{alert.title}</h3>
          <p className="text-xs text-brand-mute">배식 통계 · 숏폼</p>
        </div>
        {pet && (
          <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-cream text-brand-brown text-xs font-bold">
            <PetIcon className="w-4 h-4 text-brand-primary" /> {pet.pet_name}
          </span>
        )}
      </div>

      <div className="p-4 grid gap-4 lg:grid-cols-[1fr_minmax(180px,240px)]">
        {/* 세부 통계 카드 */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Clock className="w-4 h-4" />} label="배식 시각" value={feedLog ? fmtTime(feedLog.created_at) : '--:--'} />
            <StatCard icon={<UtensilsCrossed className="w-4 h-4" />} label="배식량" value={feedLog ? `${feedLog.feed_amount}g` : '-'} accent />
            <StatCard icon={<Cpu className="w-4 h-4" />} label="기기 ID" value={feedLog?.device_id || '-'} />
            <StatCard icon={<PetIcon className="w-4 h-4" />} label="대상 반려동물" value={pet ? `${pet.pet_name}` : '-'} />
          </div>

          <div className="mt-3 rounded-2xl bg-brand-cream p-3.5 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-brand-success/20 text-brand-success flex items-center justify-center shrink-0">
              <CheckCheck className="w-4 h-4" />
            </span>
            <p className="text-sm text-brand-brown/90">
              <b>{pet?.pet_name}</b>에게 <b>{feedLog?.feed_amount}g</b> 배식이 정상 완료됐어요.
              <span className="text-brand-mute"> ({feedLog?.status})</span>
            </p>
          </div>

          {/* 릴레이션 추적 표시 (학습/디버그용) */}
          <p className="mt-2 text-[11px] text-brand-mute">
            alert#{alert.alert_id} → feed_log#{alert.reference_id} → pet#{feedLog?.pet_id} ({pet?.pet_name})
          </p>
        </div>

        {/* 숏폼 (3초 루프) */}
        <div>
          <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-gradient-to-br from-brand-brown to-black">
            <div className="absolute inset-0 flex items-center justify-center text-white/85">
              <div className="text-center">
                <PawPrint className="w-9 h-9 mx-auto mb-2 opacity-90" />
                <p className="text-xs font-semibold">배식 직후 숏폼</p>
              </div>
            </div>
            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold">
              <Repeat className="w-3 h-3" /> LOOP · 3s
            </span>
            <button
              type="button"
              className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white touch-active"
              aria-label="재생"
            >
              <Play className="w-5 h-5 ml-0.5" />
            </button>
          </div>
          <p className="mt-2 text-[11px] text-brand-mute text-center">먹는 모습 자동 캡처</p>
        </div>
      </div>
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

export default AlertConsole
