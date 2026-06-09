import { useState } from 'react'
import { User, ChevronLeft, Search, LogIn, Eye, EyeOff } from 'lucide-react'
import { EmailVerifyField } from '../components/EmailVerifyField'

/* Warm-tone 팔레트 (Login.jsx 와 동일) */
const C = {
  bg: 'rgb(var(--brand-bg))',
  card: 'rgb(var(--brand-card))',
  input: 'rgb(var(--brand-input))',
  border: 'rgb(var(--brand-line))',
  brown: 'rgb(var(--brand-brown))',
  mute: 'rgb(var(--brand-mute))',
  primary: 'rgb(var(--brand-primary))',
  primaryDeep: 'rgb(var(--brand-primary-deep))',
  danger: 'rgb(var(--brand-danger))',
}

/* 가짜 아이디 생성 — DB 없으므로 이메일 앞부분으로 흉내만 냄 */
function fullUserId(email) {
  return (email.split('@')[0] || 'myaong').replace(/[^a-zA-Z0-9]/g, '') || 'myaong'
}
function maskUserId(id) {
  const head = id.slice(0, 2)
  return `${head}${'*'.repeat(Math.max(id.length - 2, 3))}`
}

/**
 * 아이디 찾기 (프론트 전용 · 목 동작).
 * - 이메일 입력 → 가입된 아이디(마스킹) 표시
 * - 실제 조회 로직은 백엔드/DB 연동 후 구현
 */
export default function FindId({ onBackToLogin }) {
  const [email, setEmail] = useState('')
  const [verified, setVerified] = useState(false) // 이메일 인증 완료 여부
  const [result, setResult] = useState(null) // 마스킹된 아이디 or null
  const [err, setErr] = useState('')

  const submit = (e) => {
    e.preventDefault()
    setErr('')
    if (!verified) { setErr('이메일 인증을 완료해 주세요.'); return }
    // 백엔드 없음 → 이메일로 가짜 아이디 생성
    const full = fullUserId(email)
    setResult({ full, masked: maskUserId(full) })
  }

  return (
    <div className="page-enter font-cute flex-1 flex flex-col px-5 pt-8 pb-6 sm:px-8" style={{ background: C.bg }}>
      <Brand subtitle="아이디 찾기" />

      {result ? (
        <ResultCard
          icon={<User className="w-7 h-7 text-white" />}
          title="이런 아이디로 가입되어 있어요"
          masked={result.masked}
          full={result.full}
          desc="눈 아이콘을 눌러 전체 아이디를 확인할 수 있어요."
          onBackToLogin={onBackToLogin}
        />
      ) : (
        <form
          onSubmit={submit}
          className="mt-6 rounded-3xl p-6 shadow-lg"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <p className="text-sm" style={{ color: C.mute }}>
            가입 시 등록한 이메일을 인증하면 아이디를 알려드려요.
          </p>

          <EmailVerifyField
            email={email}
            onEmailChange={setEmail}
            verified={verified}
            onVerifiedChange={setVerified}
            label="이메일"
          />

          {err && <p className="mt-4 text-sm font-bold" style={{ color: C.danger }}>{err}</p>}

          <button
            type="submit"
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl text-white py-4 text-base font-bold shadow-md transition-colors active:brightness-90"
            style={{ background: C.primary }}
          >
            <Search className="w-5 h-5" /> 아이디 찾기
          </button>
        </form>
      )}

      <BackLink onBackToLogin={onBackToLogin} />
    </div>
  )
}

/* ─────────────── 공통 (FindPassword 와 동일 톤) ─────────────── */
export function Brand({ subtitle }) {
  return (
    <div className="text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight" style={{ color: C.brown }}>
        Ai<span style={{ color: C.primary }}>:</span>Myaong
      </h1>
      <p className="mt-1 text-sm font-semibold" style={{ color: C.mute }}>{subtitle}</p>
    </div>
  )
}

export function ResultCard({ icon, title, highlight, masked, full, desc, onBackToLogin }) {
  const [revealed, setRevealed] = useState(false)
  const revealable = masked != null && full != null

  return (
    <div className="mt-6 rounded-3xl p-6 shadow-lg text-center" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ background: C.primary }}>
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-bold" style={{ color: C.brown }}>{title}</h2>

      <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl py-4 px-4" style={{ background: C.input, border: `1.5px solid ${C.border}` }}>
        <span className="text-lg font-bold break-all" style={{ color: C.primaryDeep }}>
          {revealable ? (revealed ? full : masked) : highlight}
        </span>
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="shrink-0 active:brightness-90"
            style={{ color: C.mute }}
            aria-label={revealed ? '아이디 가리기' : '아이디 보기'}
          >
            {revealed ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        )}
      </div>

      {desc && <p className="mt-3 text-sm" style={{ color: C.mute }}>{desc}</p>}
      <button
        type="button"
        onClick={onBackToLogin}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl text-white py-4 text-base font-bold shadow-md transition-colors active:brightness-90"
        style={{ background: C.primary }}
      >
        <LogIn className="w-5 h-5" /> 로그인하러 가기
      </button>
    </div>
  )
}

export function Field({ icon, label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-bold pl-1" style={{ color: C.mute }}>{label}</span>
      <div className="mt-1.5 flex items-center gap-2.5 rounded-2xl px-4 py-4"
        style={{ background: C.input, border: `1.5px solid ${C.border}` }}>
        {icon && <span style={{ color: C.mute }}>{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="font-sans flex-1 min-w-0 bg-transparent text-base outline-none placeholder:opacity-60"
          style={{ color: C.brown }}
        />
      </div>
    </label>
  )
}

export function BackLink({ onBackToLogin }) {
  return (
    <button
      type="button"
      onClick={onBackToLogin}
      className="mt-5 inline-flex items-center justify-center gap-1 self-center text-sm font-bold hover:underline"
      style={{ color: C.mute }}
    >
      <ChevronLeft className="w-4 h-4" /> 로그인으로 돌아가기
    </button>
  )
}
