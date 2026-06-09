import { useState } from 'react'
import { User, ArrowRight } from 'lucide-react'
import { Brand, Field, BackLink } from './FindId'
import { EmailVerifyField } from '../components/EmailVerifyField'

const C = {
  bg: 'rgb(var(--brand-bg))',
  card: 'rgb(var(--brand-card))',
  border: 'rgb(var(--brand-line))',
  mute: 'rgb(var(--brand-mute))',
  primary: 'rgb(var(--brand-primary))',
  danger: 'rgb(var(--brand-danger))',
}

/**
 * 비밀번호 찾기 (프론트 전용).
 * - 아이디 + 이메일 인증 → 비밀번호 재설정 화면으로 이동
 * - 이메일 인증으로 본인 확인이 끝났으므로 별도 메일 링크 없이 바로 재설정
 *   (내일 백엔드 붙으면 토큰 검증 단계만 추가)
 */
export default function FindPassword({ onBackToLogin, onReset }) {
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [verified, setVerified] = useState(false) // 이메일 인증 완료 여부
  const [err, setErr] = useState('')

  const submit = (e) => {
    e.preventDefault()
    setErr('')
    if (!userId.trim()) { setErr('아이디를 입력해 주세요.'); return }
    if (!verified) { setErr('이메일 인증을 완료해 주세요.'); return }
    // 본인 확인 완료 → 재설정 화면으로
    onReset?.({ userId, email })
  }

  return (
    <div className="page-enter font-cute flex-1 flex flex-col px-5 pt-8 pb-6 sm:px-8" style={{ background: C.bg }}>
      <Brand subtitle="비밀번호 찾기" />

      <form
        onSubmit={submit}
        className="mt-6 rounded-3xl p-6 shadow-lg"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
      >
        <p className="text-sm" style={{ color: C.mute }}>
          아이디 입력 후 이메일을 인증하면 비밀번호를 새로 설정할 수 있어요.
        </p>

        <Field icon={<User className="w-5 h-5" />} label="아이디" value={userId}
          onChange={setUserId} placeholder="로그인 아이디" />
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
          비밀번호 재설정하기 <ArrowRight className="w-5 h-5" />
        </button>
      </form>

      <BackLink onBackToLogin={onBackToLogin} />
    </div>
  )
}
