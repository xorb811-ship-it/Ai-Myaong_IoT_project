import { useEffect, useState } from 'react'
import { api } from '../api/api'

/* ───────────────────────────────────────────────────────────
 * 알림(Notification) 데이터 접근 계층 (Repository)
 *
 * 단일 출처 = DB(ALERTS 테이블). localStorage 미사용.
 * 화면 공유/리렌더는 인메모리 캐시 + 커스텀 이벤트로 처리한다.
 * (백엔드 미연결 시에는 빈 목록 — 알림은 서버가 만드는 데이터라 로컬 보관 안 함)
 *
 * 알림 형태: { id, serverId, type, title, desc, time(ISO), read, link }
 *   type: 'intruder' | 'abnormal' | 'food_low' | 'water_low' | 'feed' | 'sleep' | 'call'
 * DB 의 message 컬럼에 {title, desc, link} 를 JSON 으로 저장해 완전 복원한다.
 * ─────────────────────────────────────────────────────────── */

const SETTINGS_KEY = 'aimyaong:alertSettings' // 설정탭의 알림 제어 미러 (Settings.jsx가 저장)

// 알림 type → 설정 컬럼 매핑 (해당 설정이 꺼져 있으면 알림 차단)
const HIDDEN_KEY = 'aimyaong:hiddenNotifications'

const TYPE_TO_SETTING = {
  feed: 'feed_alert',
  manual: 'feed_alert',
  food: 'feed_alert',
  abnormal: 'motion_alert',
  rear_obstacle: 'motion_alert',
  intruder: 'stranger_alert',
}

/* 현재 알림 제어 설정상 이 type 의 알림을 보낼 수 있는지 */
function alertAllowed(type) {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return true // 설정 미러 없으면 허용(기본 동작)
    const s = JSON.parse(raw)
    if (s.push_enabled === false) return false // 푸시 전체 OFF → 모두 차단
    const key = TYPE_TO_SETTING[type]
    if (key && s[key] === false) return false // 타입별 알림 OFF → 차단
    return true
  } catch {
    return true
  }
}

/* 인메모리 캐시 (DB 미러) */
let cache = []
let hydratedOnce = false

export async function requestPushPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

function showPushNotification(notification) {
  if (!notification || !alertAllowed(notification.type)) return
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  const push = new Notification(notification.title || 'Ai Myaong 알림', {
    body: notification.desc || '',
    icon: '/favicon.ico',
    tag: notification.serverId ? `aimyaong-alert-${notification.serverId}` : undefined,
  })
  push.onclick = () => {
    window.focus()
    if (notification.link) window.location.assign(notification.link)
    push.close()
  }
}

function setCache(list) {
  cache = list
  window.dispatchEvent(new Event('notifications-changed'))
}

function readHiddenIds() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    const ids = JSON.parse(raw || '[]')
    return new Set(Array.isArray(ids) ? ids.map(String) : [])
  } catch {
    return new Set()
  }
}

function writeHiddenIds(ids) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

function hideServerIds(serverIds) {
  const hidden = readHiddenIds()
  serverIds.filter(Boolean).forEach((id) => hidden.add(String(id)))
  writeHiddenIds(hidden)
}

function normalizeAlertType(type) {
  if (type === 'vision.away_person') return 'intruder'
  if (
    [
      'vision.fall_detected',
      'vision.no_motion',
      'vision.no_motion_warning',
      'vision.no_motion_emergency',
      'vision.seizure_suspected',
    ].includes(type)
  ) {
    return 'abnormal'
  }
  return type
}

export function getNotifications() {
  return cache
}

/* DB(alerts) → 알림 객체 변환. message 는 {title,desc,link} JSON 으로 저장돼 있다. */
function fromAlert(a) {
  let extra = {}
  try {
    extra = JSON.parse(a.message || '{}')
  } catch {
    extra = { desc: a.message || '' }
  }
  return {
    id: `a${a.alert_id}`,
    serverId: a.alert_id,
    type: normalizeAlertType(a.alert_type),
    title: extra.title || '',
    desc: extra.desc || (typeof a.message === 'string' && a.message[0] !== '{' ? a.message : ''),
    link: extra.link || '',
    read: a.is_confirmed === 'Y',
    time: a.created_at || new Date().toISOString(),
  }
}

/* DB 에서 알림을 불러와 캐시에 반영 (로그인 + 백엔드 켜져 있을 때만 성공) */
export async function hydrateNotifications() {
  try {
    const rows = await api.getAlerts()
    const hidden = readHiddenIds()
    const next = (rows || []).filter((row) => !hidden.has(String(row.alert_id))).map(fromAlert)
    if (hydratedOnce) {
      const previousIds = new Set(cache.map((item) => String(item.serverId)))
      next
        .filter((item) => item.type === 'water_skipped' && !previousIds.has(String(item.serverId)))
        .forEach(showPushNotification)
    }
    hydratedOnce = true
    setCache(next)
  } catch {
    /* 백엔드 미연결 → 빈 목록 유지 */
  }
}

/* 알림 추가 — DB 저장 성공 시 캐시에 반영 (단일 출처 = DB) */
export function addNotification(n) {
  if (!alertAllowed(n?.type)) return null // 설정에서 꺼진 종류면 보내지 않음
  api
    .createAlert({ alert_type: n.type, message: JSON.stringify({ title: n.title, desc: n.desc, link: n.link }) })
    .then((created) => {
      if (created?.alert_id) setCache([fromAlert(created), ...cache])
    })
    .catch(() => {})
  return null
}

export function markRead(id) {
  const target = cache.find((n) => n.id === id)
  setCache(cache.map((n) => (n.id === id ? { ...n, read: true } : n)))
  if (target?.serverId) api.confirmAlert(target.serverId).catch(() => {})
}

export function markAllRead() {
  setCache(cache.map((n) => ({ ...n, read: true })))
  api.confirmAllAlerts().catch(() => {})
}

export function removeNotification(id) {
  const target = cache.find((n) => n.id === id)
  setCache(cache.filter((n) => n.id !== id))
  if (target?.serverId) hideServerIds([target.serverId])
}

export function clearNotifications() {
  hideServerIds(cache.map((n) => n.serverId))
  setCache([])
}

export function unreadCount(list) {
  return (list || cache).filter((n) => !n.read).length
}

/* React 훅 — 알림 목록 구독 + 마운트 시 DB 동기화 */
export function useNotifications() {
  const [list, setList] = useState(cache)

  useEffect(() => {
    const refresh = () => setList(getNotifications())
    window.addEventListener('notifications-changed', refresh)
    hydrateNotifications() // DB 에서 최신 알림 로드
    const timer = window.setInterval(hydrateNotifications, 3000)
    return () => {
      window.removeEventListener('notifications-changed', refresh)
      window.clearInterval(timer)
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
