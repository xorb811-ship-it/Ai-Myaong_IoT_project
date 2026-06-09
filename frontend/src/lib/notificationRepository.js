import { useEffect, useState } from 'react'

/* ───────────────────────────────────────────────────────────
 * 알림(Notification) 데이터 접근 계층 (Repository)
 *
 * accountRepository 와 동일한 패턴.
 * 지금은 localStorage 가 임시 저장소이고,
 * 내일 백엔드+RDB / 실시간(WebSocket) 이 붙으면
 * ↓ 함수 "내부"만 fetch/소켓 수신으로 교체하면 된다. (화면 코드는 그대로)
 *
 * 알림 형태:
 *   { id, type, title, desc, time(ISO), read, link }
 *   type: 'intruder' | 'abnormal' | 'food_low' | 'water_low' | 'feed' | 'sleep' | 'call'
 *   link: 탭하면 이동할 경로
 * ─────────────────────────────────────────────────────────── */

const KEY = 'aimyaong:notifications'

function minutesAgo(min) {
  return new Date(Date.now() - min * 60000).toISOString()
}

/* 첫 진입 시 한 번 들어가는 샘플 알림 (실데이터 붙으면 제거) */
const SEED = [
  { id: 'n1', type: 'intruder', title: '외부인 감지', desc: '현관 카메라에서 낯선 사람이 감지됐어요', time: minutesAgo(8), read: false, link: '/vision' },
  { id: 'n2', type: 'abnormal', title: '이상 행동 감지', desc: '거실에서 평소와 다른 움직임이 있었어요', time: minutesAgo(35), read: false, link: '/vision' },
  { id: 'n3', type: 'food_low', title: '사료 부족', desc: '사료 잔여량이 28%예요. 채워주세요', time: minutesAgo(120), read: false, link: '/dispenser' },
  { id: 'n4', type: 'feed', title: '자동 배식 완료', desc: '15g · 정기 스케줄', time: minutesAgo(180), read: true, link: '/feeding' },
  { id: 'n5', type: 'sleep', title: '수면 감지', desc: '안방에서 편하게 자고 있어요 😴', time: minutesAgo(620), read: true, link: '/activity' },
]

/* 전체 조회 — 최초 1회 SEED 주입(이후 비워도 재주입 안 함) */
export function getNotifications() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw == null) {
      localStorage.setItem(KEY, JSON.stringify(SEED))
      return SEED
    }
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    // 같은 탭에서도 구독 훅이 갱신되도록 이벤트 발행
    window.dispatchEvent(new Event('notifications-changed'))
  } catch (e) {
    console.warn('[notificationRepository] 저장 실패', e)
  }
}

/* 알림 추가 — 내일: 소켓 수신 시 호출하거나 서버 동기화로 교체 */
export function addNotification(n) {
  const item = { id: `n${Date.now()}`, time: new Date().toISOString(), read: false, ...n }
  save([item, ...getNotifications()])
  return item
}

export function markRead(id) {
  save(getNotifications().map((n) => (n.id === id ? { ...n, read: true } : n)))
}

export function markAllRead() {
  save(getNotifications().map((n) => ({ ...n, read: true })))
}

export function removeNotification(id) {
  save(getNotifications().filter((n) => n.id !== id))
}

export function clearNotifications() {
  save([])
}

export function unreadCount(list) {
  return (list || getNotifications()).filter((n) => !n.read).length
}

/* React 훅 — 알림 목록 구독 (다른 탭/같은 탭 변경 모두 반영) */
export function useNotifications() {
  const [list, setList] = useState(getNotifications)

  useEffect(() => {
    const refresh = () => setList(getNotifications())
    const onStorage = (e) => { if (e.key === KEY) refresh() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('notifications-changed', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('notifications-changed', refresh)
    }
  }, [])

  return list
}

/* ISO → "방금 전 / N분 전 / N시간 전 / 어제 / N일 전" */
export function timeAgo(iso) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.floor((Date.now() - t) / 1000)
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 172800) return '어제'
  return `${Math.floor(diff / 86400)}일 전`
}
