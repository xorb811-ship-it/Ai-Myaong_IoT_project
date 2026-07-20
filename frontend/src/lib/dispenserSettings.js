import { useEffect, useState } from 'react'
import { api } from '../api/api'

/* ───────────────────────────────────────────────────────────
 * 디스펜서 1회 제공 설정 (사료 g / 물 초)
 *
 * 물만 단위가 다른 이유: 물통이 저수조 겸 음수대라 펌프를 돌려도 물이 통 밖으로
 * 나가지 않는다(순환). 그래서 'ml 급수'가 물리적으로 성립하지 않아 '몇 초 돌릴지'로
 * 지시한다. 남은 양은 로드셀이 따로 재서 알려준다.
 *
 * 단일 출처 = DB(settings.feed_amount / water_amount).
 * 화면 간 공유(디스펜서 ↔ 대시보드 빠른배식)는 메모리 캐시 + 커스텀 이벤트로 처리한다.
 * localStorage·폴백 없음 → DB값 도착 전이나 미설정 시에는 아래 기본값으로 동작한다.
 * ─────────────────────────────────────────────────────────── */

// 허용 범위 (슬라이더 min~max 와 일치). 기존 큰 값(예: 150)도 여기로 clamp.
// water 는 초 단위 — 펌웨어가 최대 10초로 자른다(WATER_PUMP_MAX_RUN_MS).
const LIMITS = { food: { min: 5, max: 50 }, water: { min: 1, max: 10 } }
const DEFAULTS = { food: 25, water: 5 } // DB값 도착 전 / 미설정 시 기본값

function clampAmount(kind, value) {
  const { min, max } = LIMITS[kind]
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULTS[kind]
  return Math.min(Math.max(n, min), max)
}

let cache = { ...DEFAULTS }

export function getFeedSettings() {
  return { ...cache }
}

/* 메모리 캐시 갱신 + 같은 세션 내 다른 화면에 알림 */
function setCache(next) {
  cache = { ...cache, ...next }
  window.dispatchEvent(new Event('dispenser-changed'))
}

export function setFoodAmount(food) {
  const v = clampAmount('food', food)
  setCache({ food: v })
  api.updateSettings({ feed_amount: v }).catch(() => {}) // DB 저장
}

export function setWaterAmount(water) {
  const v = clampAmount('water', water)
  setCache({ water: v })
  api.updateSettings({ water_amount: v }).catch(() => {}) // DB 저장
}

/* DB(settings)에서 제공량을 불러와 캐시에 반영한다. */
export function hydrateFeedSettings() {
  return api
    .getSettings()
    .then((s) => {
      const next = {}
      if (s.feed_amount != null) next.food = clampAmount('food', s.feed_amount)
      if (s.water_amount != null) next.water = clampAmount('water', s.water_amount)
      if (Object.keys(next).length) setCache(next)
    })
    .catch(() => {})
}

/* React 훅 — 제공량 설정 구독 + 마운트 시 DB값으로 동기화 */
export function useFeedSettings() {
  const [s, setS] = useState(getFeedSettings)

  useEffect(() => {
    const refresh = () => setS(getFeedSettings())
    window.addEventListener('dispenser-changed', refresh)
    hydrateFeedSettings() // 로그인 상태면 DB값으로 동기화
    return () => window.removeEventListener('dispenser-changed', refresh)
  }, [])

  return s
}
