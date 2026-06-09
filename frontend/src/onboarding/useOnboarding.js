import { useCallback, useEffect, useState } from 'react'
import { onboardingSteps } from './onboardingSteps'
import { hasCompletedOnboarding, updateUserFirstLoginStatus } from './onboardingPlatform'

/* ───────────────────────────────────────────────────────────
 * 온보딩 단계 제어 (순수 비즈니스 로직 · DOM/뷰 의존 없음)
 *
 * - 최초 1회 노출 판단 (#4)
 * - 단계 이동(next/prev), 종료/건너뛰기 시 백엔드 상태 업데이트
 * 웹/RN 어느 뷰에서도 이 훅을 그대로 가져다 쓸 수 있다.
 * ─────────────────────────────────────────────────────────── */
export function useOnboarding(steps = onboardingSteps) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [finishing, setFinishing] = useState(false)

  // 최초 1회만 노출
  useEffect(() => {
    if (!hasCompletedOnboarding()) {
      setIndex(0)
      setActive(true)
    }
  }, [])

  const total = steps.length
  const step = steps[index]
  const isFirst = index === 0
  const isLast = index === total - 1

  const prev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0))
  }, [])

  // 종료(완료/건너뛰기 공통): 백엔드 상태 업데이트 후 닫기
  const end = useCallback(async () => {
    setFinishing(true)
    try {
      await updateUserFirstLoginStatus()
    } finally {
      setActive(false)
      setFinishing(false)
    }
  }, [])

  // 다음 (마지막 단계면 종료)
  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= total - 1) {
        end()
        return i
      }
      return i + 1
    })
  }, [total, end])

  return {
    active,
    index,
    step,
    steps,
    total,
    isFirst,
    isLast,
    finishing,
    next,
    prev,
    skip: end,
  }
}
