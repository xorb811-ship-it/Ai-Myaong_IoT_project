import { useEffect, useState } from 'react'

/* ───────────────────────────────────────────────────────────
 * 계정/펫 데이터 접근 계층 (Repository)
 *
 * 화면 컴포넌트는 localStorage 를 직접 만지지 않고 이 함수들만 사용한다.
 * 지금은 localStorage 가 임시 백엔드 역할을 하고,
 * 내일 백엔드+RDB 가 붙으면 ↓ 함수 "내부"만 fetch/API 호출로 교체하면 된다.
 * (화면 코드는 그대로 둬도 됨)
 *
 * 저장 데이터 형태:
 *   {
 *     user: { userId, password, email, nickname },
 *     pets: [{ name, species, breed, gender, birthDate, weightKg, photo, notes }],
 *     createdAt: ISO
 *   }
 * ─────────────────────────────────────────────────────────── */

const KEY = 'aimyaong:account'

/* 가입/로그인 결과 저장 — 내일: POST /api/signup 등으로 교체 */
export function saveAccount(payload) {
  try {
    localStorage.setItem(KEY, JSON.stringify(payload))
    // 같은 탭에서도 useAccount 가 갱신되도록 이벤트 발행
    window.dispatchEvent(new Event('account-changed'))
  } catch (e) {
    console.warn('[accountRepository] 저장 실패', e)
  }
}

/* 현재 계정 전체 — 내일: GET /api/me 로 교체 */
export function getAccount() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearAccount() {
  try {
    localStorage.removeItem(KEY)
    window.dispatchEvent(new Event('account-changed'))
  } catch { /* ignore */ }
}

export function getCurrentUser() {
  return getAccount()?.user ?? null
}

/* 유저 정보 수정 — 내일: PATCH /api/me 로 교체 */
export function updateUser(patch) {
  const acc = getAccount()
  if (!acc) return false
  saveAccount({ ...acc, user: { ...acc.user, ...patch } })
  return true
}

/* 비밀번호 재설정 — 내일: PATCH /api/me/password 로 교체 */
export function updatePassword(newPassword) {
  const acc = getAccount()
  if (!acc) return false
  saveAccount({ ...acc, user: { ...acc.user, password: newPassword } })
  return true
}

export function getPets() {
  return getAccount()?.pets ?? []
}

/* 펫 추가 — 내일: POST /api/pets 로 교체 */
export function addPet(pet) {
  const acc = getAccount()
  if (!acc) return false
  saveAccount({ ...acc, pets: [...(acc.pets || []), pet] })
  return true
}

/* 펫 수정 — 내일: PATCH /api/pets/:id 로 교체 */
export function updatePet(index, pet) {
  const acc = getAccount()
  if (!acc || !acc.pets?.[index]) return false
  const pets = acc.pets.map((p, i) => (i === index ? { ...p, ...pet } : p))
  saveAccount({ ...acc, pets })
  return true
}

/* 펫 삭제 — 내일: DELETE /api/pets/:id 로 교체 */
export function removePet(index) {
  const acc = getAccount()
  if (!acc || !acc.pets?.[index]) return false
  saveAccount({ ...acc, pets: acc.pets.filter((_, i) => i !== index) })
  return true
}

/* 생년월일 → 만 나이 (없으면 null) */
export function petAge(birthDate) {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return null
  const years = Math.floor((Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000))
  return years >= 0 ? years : null
}

/* 생년월일 → 나이 라벨 (1살 미만은 "N개월", 이상은 "N살", 없으면 null) */
export function petAgeLabel(birthDate) {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  if (now.getDate() < b.getDate()) months -= 1 // 생일 안 지난 달 보정
  if (months < 0) return null
  return months < 12 ? `${months}개월` : `${Math.floor(months / 12)}살`
}

/* 종류 코드 → 한글 라벨 */
export function speciesLabel(species) {
  return species === 'DOG' ? '강아지' : species === 'CAT' ? '고양이' : '반려동물'
}

/* BMI = 체중(kg) / 키(m)^2 — 키/몸무게 없으면 null */
export function petBmi(weightKg, heightCm) {
  const w = Number(weightKg)
  const h = Number(heightCm) / 100
  if (!w || !h) return null
  return Math.round((w / (h * h)) * 10) / 10
}

/* BMI 등급 (참고용 · 사람 기준 근사) */
export function bmiGrade(bmi) {
  if (bmi == null) return { label: '정보 부족', color: '#A98A6B', ratio: 0 }
  if (bmi < 18.5) return { label: '저체중', color: '#F0B860', ratio: 0.25 }
  if (bmi < 25) return { label: '정상', color: '#7FB28A', ratio: 0.5 }
  if (bmi < 30) return { label: '과체중', color: '#F0A56E', ratio: 0.75 }
  return { label: '비만', color: '#E26D5C', ratio: 1 }
}

/* 체지방률(%BF) — 종류별 둘레/하퇴골 길이 기반 (없으면 null) */
export function petBodyFat(species, circumference, legLength) {
  const c = Number(circumference)
  const l = Number(legLength)
  if (!c || !l) return null
  const raw = species === 'CAT' ? (c / l * 1.5) - 9 : (c / l * 1.2) - 15.5
  return Math.round(raw * 10) / 10
}

/* 체지방률 등급 (종류별 임계값) */
export function bodyFatGrade(species, bf) {
  if (bf == null) return null
  let status
  if (species === 'CAT') {
    status = bf < 10 ? 'UNDERWEIGHT' : bf < 30 ? 'IDEAL' : bf <= 42 ? 'OVERWEIGHT' : 'OBESE'
  } else {
    status = bf < 10 ? 'UNDERWEIGHT' : bf < 25 ? 'IDEAL' : bf < 35 ? 'OVERWEIGHT' : 'OBESE'
  }
  const META = {
    UNDERWEIGHT: { label: '저체중', color: '#F0B860', ratio: 0.25 },
    IDEAL: { label: '정상', color: '#7FB28A', ratio: 0.5 },
    OVERWEIGHT: { label: '과체중', color: '#F0A56E', ratio: 0.75 },
    OBESE: { label: '비만', color: '#E26D5C', ratio: 1 },
  }
  return { status, ...META[status] }
}

/**
 * React 훅 — 계정 데이터를 구독해서 반환.
 * 다른 탭(storage 이벤트) / 같은 탭(account-changed 이벤트) 변경 모두 반영.
 */
export function useAccount() {
  const [account, setAccount] = useState(getAccount)

  useEffect(() => {
    const refresh = () => setAccount(getAccount())
    const onStorage = (e) => { if (e.key === KEY) refresh() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('account-changed', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('account-changed', refresh)
    }
  }, [])

  return account
}
