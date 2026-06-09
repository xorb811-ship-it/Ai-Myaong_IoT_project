import { useState } from 'react'
import { Lock, Eye, EyeOff, Check, X } from 'lucide-react'

/* Warm-tone 팔레트 */
const C = {
  input: 'rgb(var(--brand-input))',
  border: 'rgb(var(--brand-line))',
  brown: 'rgb(var(--brand-brown))',
  mute: 'rgb(var(--brand-mute))',
  danger: 'rgb(var(--brand-danger))',
  ok: 'rgb(var(--brand-success))',
}

/* 비밀번호 조건 평가 */
export function evaluatePassword(pw = '') {
  const checks = {
    length: pw.length >= 8,
    letter: /[a-zA-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^a-zA-Z0-9]/.test(pw),
  }
  const score = Object.values(checks).filter(Boolean).length // 0~4
  return { checks, score }
}

/* 가입 통과 조건: 4개 모두 충족 */
export function isStrongPassword(pw) {
  const { checks } = evaluatePassword(pw)
  return checks.length && checks.letter && checks.number && checks.special
}

/* 강도 단계 (0~4) */
const LEVELS = [
  { label: '매우 약함', color: '#E26D5C' },
  { label: '약함', color: '#F0A56E' },
  { label: '보통', color: '#F0B860' },
  { label: '강함', color: '#9CC79A' },
  { label: '매우 강함', color: '#7FB28A' },
]

/* 진짜 흔한 비밀번호/단어 (강한 감점) */
const COMMON_WORDS = [
  'password', 'passwd', 'iloveyou', 'letmein', 'welcome', 'admin', 'login',
  'master', 'dragon', 'monkey', 'qwerty', 'aimyaong', 'myaong',
  '123456', '12345678', '111111', '000000',
]
/* 키보드/짧은 패턴 조각 (약한 감점) */
const WEAK_FRAGMENTS = ['asdf', 'zxcv', 'qwer', 'wasd', '1234', 'abcd']

/* 연속 문자 (abc / 123 / cba / 321) */
function hasSequential(pw) {
  const s = pw.toLowerCase()
  for (let i = 0; i < s.length - 2; i++) {
    const a = s.charCodeAt(i), b = s.charCodeAt(i + 1), c = s.charCodeAt(i + 2)
    if (b - a === 1 && c - b === 1) return true
    if (a - b === 1 && b - c === 1) return true
  }
  return false
}
/* 같은 문자 3연속 (aaaa) */
const hasRepeat = (pw) => /(.)\1\1/.test(pw)

/**
 * 비밀번호 강도 추정 — 엔트로피 + 패턴 감점 (무설치 자체 구현).
 * 조건 개수만 세지 않고, 길이·문자 다양성으로 점수를 올리고
 * 흔한 단어·연속·반복 패턴은 감점한다.
 * 반환: { score: 0~4, bits, tips[] }
 */
export function strength(pw = '') {
  if (!pw) return { score: 0, bits: 0, tips: [] }

  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33
  let bits = pw.length * Math.log2(pool || 1) // 대략적 엔트로피(비트)

  const tips = []
  const lower = pw.toLowerCase()
  if (COMMON_WORDS.some((w) => lower.includes(w))) { bits -= 26; tips.push('흔한 단어·비밀번호는 피하세요') }
  else if (WEAK_FRAGMENTS.some((w) => lower.includes(w))) { bits -= 10; tips.push('키보드 연속 패턴(asdf 등)은 살짝 약해요') }
  if (hasSequential(pw)) { bits -= 16; tips.push('연속된 문자(abc·123)는 피하세요') }
  if (hasRepeat(pw)) { bits -= 12; tips.push('같은 문자 반복을 줄여주세요') }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length
  if (classes <= 2) tips.push('대/소문자·숫자·특수문자를 섞어주세요')
  if (pw.length < 10) tips.push('더 길게 만들수록 안전해요')

  bits = Math.max(0, bits)

  let score
  if (bits < 28) score = 0
  else if (bits < 40) score = 1
  else if (bits < 56) score = 2
  else if (bits < 76) score = 3
  else score = 4
  if (pw.length < 8) score = Math.min(score, 1) // 너무 짧으면 상한

  return { score, bits: Math.round(bits), tips }
}

/**
 * 비밀번호 입력 필드 (강도 그래프 + 조건 체크리스트 + 보기 토글).
 * props:
 *  - value, onChange
 *  - label, placeholder
 *  - showStrength : 강도/체크리스트 표시 여부 (확인용 필드는 false)
 */
export function PasswordField({
  value,
  onChange,
  label = '비밀번호',
  placeholder = '8자 이상 · 영문·숫자·특수문자 포함',
  showStrength = true,
  invalid = false,
}) {
  const [show, setShow] = useState(false)
  const { checks } = evaluatePassword(value)
  const st = strength(value)
  const level = LEVELS[st.score]

  return (
    <label className="mt-5 block">
      <span className="text-sm font-bold pl-1" style={{ color: invalid ? C.danger : C.mute }}>{label}</span>

      <div
        className="mt-1.5 flex items-center gap-2.5 rounded-2xl px-4 py-4"
        style={{ background: invalid ? '#FDECE9' : C.input, border: `1.5px solid ${invalid ? C.danger : C.border}` }}
      >
        <Lock className="w-5 h-5" style={{ color: C.mute }} />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="font-sans flex-1 min-w-0 bg-transparent text-base outline-none placeholder:opacity-60"
          style={{ color: C.brown }}
          autoComplete="new-password"
        />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label="비밀번호 표시" style={{ color: C.mute }}>
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>

      {showStrength && value && (
        <div className="mt-2.5">
          {/* 강도 그래프 (5단계) */}
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex-1 h-1.5 rounded-full transition-colors"
                style={{ background: i <= st.score ? level.color : C.border }}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs font-bold" style={{ color: level.color }}>
            비밀번호 강도: {level.label}
          </p>

          {/* 약점 팁 (강함 미만일 때) */}
          {st.score < 3 && st.tips[0] && (
            <p className="mt-1 text-xs" style={{ color: C.mute }}>💡 {st.tips[0]}</p>
          )}

          {/* 조건 체크리스트 (가입 필수 조건) */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <Req ok={checks.length} text="8자 이상" />
            <Req ok={checks.letter} text="영문" />
            <Req ok={checks.number} text="숫자" />
            <Req ok={checks.special} text="특수문자" />
          </div>
        </div>
      )}
    </label>
  )
}

function Req({ ok, text }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: ok ? C.ok : C.mute }}>
      {ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      {text}
    </span>
  )
}

export default PasswordField
