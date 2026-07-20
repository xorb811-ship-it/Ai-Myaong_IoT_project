import { api } from '../api/api'

/* ───────────────────────────────────────────────────────────
 * 온보딩 "플랫폼 어댑터" — 영속화/백엔드 호출 격리 계층
 *
 * 최초 1회 노출 여부의 "정답(source of truth)"은 서버 DB(SETTINGS.onboarded)다.
 * → 어느 기기·브라우저·플랫폼에서 로그인해도 계정 기준으로 온보딩이 일관되게 뜬다.
 *
 * localStorage 는 저장소가 아니라 "폴백 캐시"로만 쓴다:
 *   - 오프라인/네트워크 실패 시 최근 상태 유지
 *   - 백엔드에 onboarded 컬럼이 아직 반영 전(배포 순서 차이)일 때도 재노출 방지
 * RN 이식 시 이 파일만 교체(localStorage → AsyncStorage 등)하면
 * useOnboarding 의 비즈니스 로직은 그대로 재사용된다.
 * ─────────────────────────────────────────────────────────── */

const KEY = 'aimyaong:onboardingDone'
const isWeb = typeof window !== 'undefined'

/* 폴백 캐시 읽기/쓰기 (실패해도 조용히 무시) */
function readCache() {
  if (!isWeb) return false
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
function writeCache(done) {
  if (!isWeb) return
  try {
    if (done) window.localStorage.setItem(KEY, '1')
    else window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/* 이미 온보딩을 본 적이 있는지 (true 면 다시 안 띄움).
 * DB(onboarded) 가 정답이며, 조회 실패/미반영 시에만 캐시로 폴백한다. */
export async function hasCompletedOnboarding() {
  try {
    const settings = await api.getSettings()
    if (settings?.onboarded === 'Y') {
      writeCache(true) // DB 완료 → 캐시도 최신화
      return true
    }
    if (settings?.onboarded === 'N') {
      return false // DB 가 명시적으로 '미완료' → 노출
    }
    // onboarded 필드 없음(백엔드 미반영) → 캐시로 판단
    return readCache()
  } catch {
    // 조회 실패(오프라인 등) → 캐시로 판단 (없으면 노출)
    return readCache()
  }
}

/* 온보딩 재노출 트리거 — 회원가입 등 "최초 1회"를 다시 시작할 때 호출.
 * 신규 계정은 DB onboarded 가 기본 'N' 이라 자동 노출되지만,
 * 같은 브라우저의 이전 계정 캐시가 남아 재노출을 막지 않도록 캐시를 비운다. */
export function resetOnboarding() {
  writeCache(false)
}

/* 최초 로그인 안내 완료 처리 — DB에 'Y' 저장 후 캐시도 최신화.
 * 저장 실패해도 캐시로 재노출을 막아 UX 를 유지한다(다음 온라인 로그인 시 DB 기준 재확인). */
export async function updateUserFirstLoginStatus() {
  try {
    await api.updateSettings({ onboarded: 'Y' })
    writeCache(true)
    return true
  } catch (e) {
    console.warn('[onboarding] 상태 업데이트 실패', e)
    writeCache(true)
    return false
  }
}
