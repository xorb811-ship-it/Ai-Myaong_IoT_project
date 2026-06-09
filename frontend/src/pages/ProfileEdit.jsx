import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, User, Mail, Smile, Lock } from 'lucide-react'
import { Card } from '../components/ui'
import { useAccount, updateUser } from '../lib/accountRepository'
import { api } from '../api/api'

const C = {
  card: 'rgb(var(--brand-card))',
  input: 'rgb(var(--brand-input))',
  border: 'rgb(var(--brand-line))',
  brown: 'rgb(var(--brand-brown))',
  mute: 'rgb(var(--brand-mute))',
  primary: 'rgb(var(--brand-primary))',
  danger: 'rgb(var(--brand-danger))',
}

export function ProfileEdit() {
  const navigate = useNavigate()
  const account = useAccount()
  const user = account?.user || {}

  const [nickname, setNickname] = useState(user.nickname || '')
  const [email, setEmail] = useState(user.email || '')
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const nn = nickname.trim()
    const em = email.trim()
    if (!nn) { setErr('닉네임을 입력해 주세요.'); return }
    if (!em.includes('@')) { setErr('올바른 이메일을 입력해 주세요.'); return }

    setBusy(true)
    try {
      // 1) DB 반영 (백엔드 PATCH /me 준비되면 실제 컬럼 변경)
      const updated = await api.updateMe({ nickname: nn, email: em })
      const data = updated && (updated.nickname || updated.email) ? updated : { nickname: nn, email: em }
      // 2) 토큰 유저(sessionStorage) 동기화
      try {
        const su = JSON.parse(sessionStorage.getItem('aimyaong:user') || '{}')
        sessionStorage.setItem('aimyaong:user', JSON.stringify({ ...su, nickname: data.nickname, email: data.email }))
      } catch { /* ignore */ }
      // 3) 화면용 로컬(useAccount) 동기화
      updateUser({ nickname: data.nickname, email: data.email })
    } catch {
      // 백엔드 미구현/오류 → 로컬만이라도 반영 (기존 동작 유지)
      updateUser({ nickname: nn, email: em })
    } finally {
      setBusy(false)
      setSaved(true)
      setTimeout(() => navigate(-1), 600)
    }
  }

  return (
    <div className="px-5 pb-6">
      {/* 헤더 + 뒤로가기 */}
      <header className="flex items-center gap-2.5 pt-5 pb-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="뒤로가기"
          className="w-10 h-10 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display text-2xl font-bold text-brand-brown leading-tight">회원 정보 수정</h1>
      </header>

      <form onSubmit={submit}>
        <Card className="px-5 py-5">
          {/* 아이디 (읽기 전용) */}
          <ReadOnly label="아이디" icon={<User className="w-5 h-5" />} value={user.userId || '—'} />

          <Field icon={<Smile className="w-5 h-5" />} label="닉네임" value={nickname}
            onChange={setNickname} placeholder="집사 이름" />
          <Field icon={<Mail className="w-5 h-5" />} label="이메일" value={email}
            onChange={setEmail} placeholder="example@aimyaong.com" type="email" />

          {err && <p className="mt-4 text-sm font-bold" style={{ color: C.danger }}>{err}</p>}
          {saved && <p className="mt-4 text-sm font-bold" style={{ color: '#7FB28A' }}>저장되었어요!</p>}
        </Card>

        {/* 비밀번호 변경 안내 */}
        <button
          type="button"
          onClick={() => navigate('/find-password')}
          className="mt-3 w-full flex items-center gap-3 rounded-2xl bg-brand-card shadow-soft px-4 py-3.5 touch-active text-left"
        >
          <span className="w-9 h-9 rounded-2xl bg-brand-cream flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-brand-brown" />
          </span>
          <span className="flex-1 text-sm font-bold text-brand-brown">비밀번호 변경</span>
          <ChevronLeft className="w-4 h-4 text-brand-mute rotate-180" />
        </button>

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="flex-1 rounded-2xl py-3.5 text-base font-bold bg-brand-cream text-brand-brown touch-active">
            취소
          </button>
          <button type="submit" disabled={busy}
            className="flex-1 rounded-2xl py-3.5 text-base font-bold text-white shadow-soft touch-active disabled:opacity-60" style={{ background: C.primary }}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ReadOnly({ icon, label, value }) {
  return (
    <div className="block">
      <span className="text-sm font-bold pl-1" style={{ color: C.mute }}>{label}</span>
      <div className="mt-1.5 flex items-center gap-2.5 rounded-2xl px-4 py-4 opacity-70"
        style={{ background: C.input, border: `1.5px solid ${C.border}` }}>
        {icon && <span style={{ color: C.mute }}>{icon}</span>}
        <span className="flex-1 text-base font-semibold" style={{ color: C.brown }}>{value}</span>
        <span className="text-[11px] font-bold" style={{ color: C.mute }}>변경 불가</span>
      </div>
    </div>
  )
}

function Field({ icon, label, value, onChange, type = 'text', placeholder }) {
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
          className="flex-1 min-w-0 bg-transparent text-base outline-none placeholder:opacity-60"
          style={{ color: C.brown }}
        />
      </div>
    </label>
  )
}

export default ProfileEdit
