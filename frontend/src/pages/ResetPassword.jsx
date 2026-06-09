import { useState } from 'react'
import { Check, LogIn } from 'lucide-react'
import { Brand, BackLink } from './FindId'
import { PasswordField, isStrongPassword } from '../components/PasswordField'
import { updatePassword } from '../lib/accountRepository'

const C = {
  bg: 'rgb(var(--brand-bg))',
  card: 'rgb(var(--brand-card))',
  border: 'rgb(var(--brand-line))',
  brown: 'rgb(var(--brand-brown))',
  mute: 'rgb(var(--brand-mute))',
  primary: 'rgb(var(--brand-primary))',
  danger: 'rgb(var(--brand-danger))',
  ok: 'rgb(var(--brand-success))',
}

/**
 * 비밀번호 재설정 (프론트 전용).
 * - 본인 확인(이메일 인증)을 마친 뒤 진입
 * - 새 비밀번호 + 확인 → accountRepository 의 비밀번호 갱신
 *   (내일 백엔드 붙으면 updatePassword 내부만 API 호출로 교체)
 */
export default function ResetPassword({ onBackToLogin, onDone }) {
  const [pw, setPw] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const submit = (e) => {
    e.preventDefault()
    setErr('')
    if (!isStrongPassword(pw)) { setErr('비밀번호는 8자 이상이며 영문·숫자·특수문자를 포함해야 합니다.'); return }
    if (pw !== pwConfirm) { setErr('비밀번호가 일치하지 않습니다.'); return }

    updatePassword(pw) // 저장된 계정 비밀번호 갱신 (없으면 데모상 무시)
    console.log('%c[ResetPassword] 비밀번호 재설정 완료', 'color:#D6814A;font-weight:bold')
    setDone(true)
  }

  if (done) {
    return (
      <div className="page-enter font-cute flex-1 flex flex-col px-5 pt-10 pb-8 sm:px-8" style={{ background: C.bg }}>
        <Brand subtitle="비밀번호 재설정" />
        <div className="mt-6 rounded-3xl p-6 shadow-lg text-center" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ background: C.ok }}>
            <Check className="w-8 h-8 text-white" />
          </div>
          <h2 className="mt-4 text-lg font-bold" style={{ color: C.brown }}>비밀번호가 변경되었어요</h2>
          <p className="mt-2 text-sm" style={{ color: C.mute }}>새 비밀번호로 다시 로그인해 주세요.</p>
          <button
            type="button"
            onClick={onDone}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl text-white py-4 text-base font-bold shadow-md transition-colors active:brightness-90"
            style={{ background: C.primary }}
          >
            <LogIn className="w-5 h-5" /> 로그인하러 가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter font-cute flex-1 flex flex-col px-5 pt-8 pb-6 sm:px-8" style={{ background: C.bg }}>
      <Brand subtitle="비밀번호 재설정" />

      <form
        onSubmit={submit}
        className="mt-6 rounded-3xl p-6 shadow-lg"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
      >
        <p className="text-sm" style={{ color: C.mute }}>
          새로 사용할 비밀번호를 입력해 주세요.
        </p>

        <PasswordField label="새 비밀번호" value={pw} onChange={setPw} />
        <PasswordField label="새 비밀번호 확인" value={pwConfirm} onChange={setPwConfirm} placeholder="비밀번호 재입력" showStrength={false} />
        {pwConfirm && (
          <p className="mt-1.5 text-xs font-bold pl-1" style={{ color: pw === pwConfirm ? C.ok : C.danger }}>
            {pw === pwConfirm ? '✓ 비밀번호가 일치해요' : '비밀번호가 일치하지 않아요'}
          </p>
        )}

        {err && <p className="mt-4 text-sm font-bold" style={{ color: C.danger }}>{err}</p>}

        <button
          type="submit"
          className="mt-6 w-full rounded-2xl text-white py-4 text-base font-bold shadow-md transition-colors active:brightness-90"
          style={{ background: C.primary }}
        >
          비밀번호 변경하기
        </button>
      </form>

      <BackLink onBackToLogin={onBackToLogin} />
    </div>
  )
}
