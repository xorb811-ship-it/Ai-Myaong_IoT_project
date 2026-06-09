import { useEffect, useState } from 'react'

/* ───────────────────────────────────────────────────────────
 * 디스펜서 1회 제공량 설정 (사료 g / 물 ml)
 *
 * 디스펜서에서 슬라이더로 바꾼 값을 저장해두고,
 * 대시보드 "빠른 배식" 등 다른 화면에서도 같은 값을 쓰도록 공유한다.
 * accountRepository 와 동일한 localStorage + 구독 이벤트 패턴.
 * (내일 백엔드 붙으면 get/set 내부만 교체)
 * ─────────────────────────────────────────────────────────── */

const KEY = 'aimyaong:dispenser'
const DEFAULTS = { food: 15, water: 80 }

export function getFeedSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new Event('dispenser-changed'))
  } catch (e) {
    console.warn('[dispenserSettings] 저장 실패', e)
  }
}

export function setFoodAmount(food) {
  save({ ...getFeedSettings(), food: Number(food) })
}

export function setWaterAmount(water) {
  save({ ...getFeedSettings(), water: Number(water) })
}

/* React 훅 — 제공량 설정 구독 (다른 탭/같은 탭 변경 모두 반영) */
export function useFeedSettings() {
  const [s, setS] = useState(getFeedSettings)

  useEffect(() => {
    const refresh = () => setS(getFeedSettings())
    const onStorage = (e) => { if (e.key === KEY) refresh() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('dispenser-changed', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('dispenser-changed', refresh)
    }
  }, [])

  return s
}
