import { useEffect, useRef, useState } from 'react'
import { Mail, Check, Clock } from 'lucide-react'
import { sendVerificationEmail, emailjsConfigured } from '../lib/sendVerificationEmail'

/* Warm-tone 팔레트 */
const C = {
  input: 'rgb(var(--brand-input))',
  panel: 'rgb(var(--brand-cream))',
  border: 'rgb(var(--brand-line))',
  brown: 'rgb(var(--brand-brown))',
  mute: 'rgb(var(--brand-mute))',
  primary: 'rgb(var(--brand-primary))',
  primaryDeep: 'rgb(var(--brand-primary-deep))',
  danger: 'rgb(var(--brand-danger))',
  ok: 'rgb(var(--brand-success))',
}

const genCode = () => String(Math.floor(100000 + Math.random() * 900000))

const EXPIRY_SECONDS = 180 // 인증번호 유효시간 (3분)
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/**
 * 이메일 + 인증번호 입력 필드.
 * - "인증" 클릭 → 6자리 코드 생성 → EmailJS로 실제 메일 발송 (키 설정 시).
 * - EmailJS 키가 없으면 자동으로 화면에 코드 노출(mock)로 동작.
 * - 코드 일치 시 verified=true. (코드 비교는 프론트 · 운영 보안은 백엔드 필요)
 *
 * props:
 *  - email, onEmailChange : 이메일 값/변경
 *  - verified, onVerifiedChange : 인증 완료 여부
 *  - label, hint
 */
export function EmailVerifyField({ email, onEmailChange, verified, onVerifiedChange, label = '이메일', hint, invalid = false }) {
  const [sentCode, setSentCode] = useState(null) // 발송된 코드 or null
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [deadline, setDeadline] = useState(null) // 만료 시각(ms) or null
  const [remaining, setRemaining] = useState(0)  // 남은 초
  const failRef = useRef(0)                       // 연속 발송 실패 횟수

  // 만료 카운트다운
  useEffect(() => {
    if (!deadline || verified) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) clearInterval(id)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline, verified])

  const expired = sentCode && !verified && remaining <= 0

  const startTimer = () => {
    setDeadline(Date.now() + EXPIRY_SECONDS * 1000)
    setRemaining(EXPIRY_SECONDS)
  }

  const sendCode = async () => {
    setError('')
    if (!email.includes('@')) { setError('올바른 이메일을 입력해 주세요.'); return }
    const c = genCode()

    // EmailJS 미설정 → mock (화면에 코드 노출)
    if (!emailjsConfigured) {
      setSentCode(c)
      setCode('')
      setNotice(`개발용 인증번호: ${c}`)
      startTimer()
      console.log(`[mock email] ${email} → 인증번호 ${c}`)
      return
    }

    // 실제 메일 발송
    setSending(true)
    try {
      await sendVerificationEmail(email, c)
      failRef.current = 0
      setSentCode(c)
      setCode('')
      setNotice('인증번호를 이메일로 보냈어요. 메일함(스팸함)을 확인해 주세요.')
      startTimer()
    } catch (e) {
      console.error('[EmailVerifyField] 발송 실패', e)
      failRef.current += 1
      if (failRef.current >= 5) {
        // 5회 연속 실패 → 가입이 막히지 않도록 임시 인증번호(화면 표시)로 폴백
        setSentCode(c)
        setCode('')
        setNotice(`메일 발송이 계속 실패해 임시 인증번호로 진행해요: ${c}`)
        startTimer()
      } else {
        setError(`메일 발송에 실패했어요. 다시 시도해 주세요. (${failRef.current}/5)`)
      }
    } finally {
      setSending(false)
    }
  }

  const verify = () => {
    setError('')
    if (remaining <= 0) { setError('인증번호가 만료되었어요. 재전송해 주세요.'); return }
    if (code === sentCode) {
      onVerifiedChange(true)
      setNotice('이메일 인증 완료!')
      setDeadline(null)
    } else {
      setError('인증번호가 일치하지 않습니다.')
    }
  }

  const changeEmail = (v) => {
    onEmailChange(v)
    if (verified) onVerifiedChange(false)
    setSentCode(null)
    setCode('')
    setNotice('')
    setError('')
    setDeadline(null)
    setRemaining(0)
  }

  return (
    <div className="mt-5">
      <span className="text-sm font-bold pl-1" style={{ color: invalid && !verified ? C.danger : C.mute }}>{label}</span>

      {/* 이메일 입력 (전체폭) */}
      <div
        className="mt-1.5 flex items-center gap-2.5 rounded-2xl px-4 py-4"
        style={{ background: invalid && !verified ? '#FDECE9' : C.input, border: `1.5px solid ${verified ? C.ok : invalid ? C.danger : C.border}` }}
      >
        <Mail className="w-5 h-5" style={{ color: C.mute }} />
        <input
          type="email"
          value={email}
          onChange={(e) => changeEmail(e.target.value)}
          disabled={verified}
          placeholder="example@aimyaong.com"
          className="font-sans flex-1 min-w-0 bg-transparent text-base outline-none placeholder:opacity-60 disabled:opacity-70"
          style={{ color: C.brown }}
        />
        {verified && (
          <span className="shrink-0 inline-flex items-center gap-1 text-sm font-bold" style={{ color: C.ok }}>
            <Check className="w-4 h-4" /> 인증완료
          </span>
        )}
      </div>

      {hint && !sentCode && !verified && (
        <p className="mt-1.5 text-xs pl-1" style={{ color: C.mute }}>{hint}</p>
      )}

      {/* 인증번호 받기 버튼 (입력칸 아래 · 우측 · 작게) */}
      {!verified && (
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={sendCode}
            disabled={sending}
            className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-colors active:brightness-90 disabled:opacity-60"
            style={{ background: C.primary }}
          >
            {sending ? '전송 중…' : sentCode ? '인증번호 재전송' : '인증번호 받기'}
          </button>
        </div>
      )}

      {/* 인증번호 입력 (전체폭으로 정돈) */}
      {sentCode && !verified && (
        <div className="mt-3 rounded-2xl p-4" style={{ background: C.panel, border: `1.5px solid ${C.border}` }}>
          {/* 라벨 + 남은 시간 */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: C.mute }}>인증번호 입력</span>
            {expired ? (
              <span className="text-xs font-bold" style={{ color: C.danger }}>만료됨</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums" style={{ color: C.primaryDeep }}>
                <Clock className="w-4 h-4" /> {mmss(remaining)}
              </span>
            )}
          </div>

          {/* 6자리 입력 (가운데 정렬) */}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            disabled={expired}
            placeholder="● ● ● ● ● ●"
            className="font-sans mt-3 w-full rounded-2xl px-4 py-4 text-center text-lg font-bold tracking-[0.4em] outline-none placeholder:text-base placeholder:tracking-[0.25em] placeholder:font-normal placeholder:opacity-40 disabled:opacity-60"
            style={{ background: C.input, border: `1.5px solid ${expired ? C.danger : C.border}`, color: C.brown }}
          />

          {/* 확인 버튼 (전체폭) */}
          <button
            type="button"
            onClick={verify}
            disabled={expired}
            className="mt-3 w-full rounded-2xl py-4 text-base font-bold transition-colors active:brightness-95 disabled:opacity-50"
            style={{ background: C.primary, color: '#FFFFFF', border: `1.5px solid ${C.primary}` }}
          >
            인증 확인
          </button>

          {expired && (
            <p className="mt-2 text-xs font-bold text-center" style={{ color: C.danger }}>
              인증번호가 만료되었어요. 위 <b>재전송</b>을 눌러 다시 받아주세요.
            </p>
          )}
        </div>
      )}

      {notice && (
        <p className="mt-2 text-xs font-bold pl-1" style={{ color: verified ? C.ok : C.primaryDeep }}>
          {notice}
        </p>
      )}
      {error && <p className="mt-2 text-xs font-bold pl-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

export default EmailVerifyField
