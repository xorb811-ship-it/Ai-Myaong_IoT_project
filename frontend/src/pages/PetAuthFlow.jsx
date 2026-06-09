import { useState, useRef, useEffect } from 'react'

/* ───────────────────────────────────────────────────────────
 * PetAuthFlow — 단일 파일 프론트 전용 데모
 * 인증(구글/이메일) → 다중 펫 등록 → 펫 스위칭 대시보드 → 가상 알림
 * 백엔드/DB 없음 · 모든 상태는 useState + localStorage
 * 복붙해서 바로 실행/테스트 가능 (외부 import 없음)
 * ─────────────────────────────────────────────────────────── */

/* Warm-tone 팔레트 */
const C = {
  bg: 'rgb(var(--brand-bg))', card: 'rgb(var(--brand-card))', input: 'rgb(var(--brand-input))', border: 'rgb(var(--brand-line))',
  brown: 'rgb(var(--brand-brown))', mute: 'rgb(var(--brand-mute))', primary: 'rgb(var(--brand-primary))', primaryDeep: 'rgb(var(--brand-primary-deep))',
  danger: 'rgb(var(--brand-danger))', ok: 'rgb(var(--brand-success))',
}

const TEST_CODE = '123456'
const GOOGLE_PROFILE = { email: 'user@gmail.com', nickname: '구글유저' }
const LS_KEY = 'petflow:account'

const emptyPet = () => ({
  name: '', species: 'DOG', breed: '', gender: 'M',
  birthDate: '', weightKg: '', photo: '', notes: '',
})

/* 펫별 맞춤형 가상 로그 */
function petLogs(pet) {
  const n = pet.name || '아이'
  return pet.species === 'DOG'
    ? [
        { t: '10분 전', m: `${n} 짖음 감지 🐕` },
        { t: '45분 전', m: '현관 앞 움직임 포착' },
        { t: '2시간 전', m: '산책 다녀옴 🦴' },
      ]
    : [
        { t: '30분 전', m: `${n} 밥 먹음 🍚` },
        { t: '1시간 전', m: '그루밍 중 🧼' },
        { t: '3시간 전', m: '창가에서 휴식 ☀️' },
      ]
}

export default function PetAuthFlow() {
  // 화면: 'auth' | 'signup' | 'dashboard'
  const [view, setView] = useState('auth')

  // 인증 방식: 'email' | 'google'
  const [authType, setAuthType] = useState('email')

  // 유저/펫 상태 (단계 이동 시 유실 X)
  const [userInfo, setUserInfo] = useState({ email: '', password: '', nickname: '', phone: '' })
  const [petList, setPetList] = useState([])
  const [pet, setPet] = useState(emptyPet())
  const [step, setStep] = useState(0)
  const [err, setErr] = useState('')

  // 모달/토스트
  const [showGoogle, setShowGoogle] = useState(false)
  const [showFindHelp, setShowFindHelp] = useState(false)
  const [toast, setToast] = useState(null)
  const [toastOn, setToastOn] = useState(false)
  const toastTimer = useRef(null)

  // 완료 데이터 (대시보드용)
  const [account, setAccount] = useState(null)

  const setU = (k, v) => setUserInfo((p) => ({ ...p, [k]: v }))
  const setP = (k, v) => setPet((p) => ({ ...p, [k]: v }))

  /* 토스트 */
  const showToast = (msg) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    requestAnimationFrame(() => setToastOn(true))
    toastTimer.current = setTimeout(() => {
      setToastOn(false)
      setTimeout(() => setToast(null), 320)
    }, 3000)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  /* 단계 구성 — 구글은 유저 정보 단계 스킵 */
  const steps = authType === 'google' ? ['pet', 'branch'] : ['user', 'pet', 'branch']
  const current = steps[step]
  const petIndex = steps.indexOf('pet')

  /* 초기화 → 인증 홈 */
  const resetToAuth = () => {
    setView('auth')
    setAuthType('email')
    setUserInfo({ email: '', password: '', nickname: '', phone: '' })
    setPetList([])
    setPet(emptyPet())
    setStep(0)
    setErr('')
  }

  /* 일반 이메일로 시작 */
  const startEmail = (email, password) => {
    setAuthType('email')
    setUserInfo({ email, password, nickname: '', phone: '' })
    setPetList([])
    setPet(emptyPet())
    setStep(0)
    setErr('')
    setView('signup')
  }

  /* 구글 승인 → 프로필 프리패스 후 펫 등록부터 */
  const approveGoogle = () => {
    setShowGoogle(false)
    setAuthType('google')
    setUserInfo({ email: GOOGLE_PROFILE.email, password: '', nickname: GOOGLE_PROFILE.nickname, phone: '' })
    setPetList([])
    setPet(emptyPet())
    setStep(0) // steps=['pet','branch'] → 바로 펫 등록
    setErr('')
    setView('signup')
  }

  /* 단계 검증 */
  const validate = () => {
    if (current === 'user') {
      if (!userInfo.email.includes('@')) return '올바른 이메일을 입력해 주세요.'
      if (userInfo.password.length < 6) return '비밀번호는 6자 이상이어야 합니다.'
      if (!userInfo.nickname.trim()) return '닉네임을 입력해 주세요.'
      if (!userInfo.phone.trim()) return '전화번호를 입력해 주세요.'
    }
    if (current === 'pet') {
      if (!pet.name.trim()) return '펫 이름을 입력해 주세요.'
      if (!pet.breed.trim()) return '품종을 입력해 주세요.'
    }
    return ''
  }

  const goNext = () => {
    const msg = validate()
    if (msg) { setErr(msg); return }
    setErr('')
    if (current === 'pet') {
      setPetList((l) => [...l, pet])
      setPet(emptyPet())
    }
    setStep((s) => s + 1)
  }

  const goPrev = () => {
    setErr('')
    if (current === 'branch') {
      setPetList((l) => { const c = [...l]; const last = c.pop(); if (last) setPet(last); return c })
    }
    if (step === 0) { resetToAuth(); return }
    setStep((s) => s - 1)
  }

  const addAnotherPet = () => { setErr(''); setPet(emptyPet()); setStep(petIndex) }
  const removePet = (i) => setPetList((l) => l.filter((_, idx) => idx !== i))

  /* 최종 가입 완료 */
  const finish = () => {
    if (petList.length === 0) { setErr('최소 한 마리의 펫을 등록해 주세요.'); return }
    const user = authType === 'google'
      ? { email: userInfo.email, nickname: userInfo.nickname, phone: userInfo.phone }
      : { email: userInfo.email, password: userInfo.password, nickname: userInfo.nickname, phone: userInfo.phone }

    const payload = { provider: authType, user, pets: petList, createdAt: new Date().toISOString() }

    console.log('%c[PetAuthFlow] 가입 완료 페이로드', 'color:#D6814A;font-weight:bold')
    console.log(JSON.stringify(payload, null, 2))
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)) } catch (e) { console.warn(e) }

    setAccount(payload)
    setView('dashboard')
  }

  const logout = () => {
    console.log('%c[PetAuthFlow] 로그아웃', 'color:#A98A6B;font-weight:bold')
    try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
    setAccount(null)
    resetToAuth()
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: '#EAD9C2' }}>
      <div
        className="relative w-full max-w-[460px] min-h-screen flex flex-col overflow-hidden"
        style={{ background: C.bg, fontFamily: "'Jua','Pretendard',system-ui,sans-serif" }}
      >
        {view === 'auth' && (
          <AuthHome
            onEmailStart={startEmail}
            onGoogle={() => setShowGoogle(true)}
            onFindHelp={() => setShowFindHelp(true)}
          />
        )}

        {view === 'signup' && (
          <SignupFlow
            steps={steps} step={step} current={current}
            userInfo={userInfo} setU={setU}
            pet={pet} setP={setP}
            petList={petList} removePet={removePet}
            err={err}
            onNext={goNext} onPrev={goPrev}
            onAddAnother={addAnotherPet} onFinish={finish}
            isGoogle={authType === 'google'}
          />
        )}

        {view === 'dashboard' && account && (
          <Dashboard account={account} onLogout={logout} onToast={showToast} />
        )}

        {/* 구글 로그인 가상 팝업 */}
        {showGoogle && <GoogleModal onApprove={approveGoogle} onClose={() => setShowGoogle(false)} />}

        {/* 아이디/비번 찾기 안내 팝업 */}
        {showFindHelp && (
          <InfoModal
            title="비밀번호 찾기 안내"
            body="구글 연동 회원은 구글 로그인 창에서 비밀번호를 찾으실 수 있습니다."
            onClose={() => setShowFindHelp(false)}
          />
        )}

        {/* 인앱 토스트 */}
        {toast && (
          <div
            className="fixed left-1/2 bottom-8 z-50 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-bold"
            style={{
              transform: `translateX(-50%) translateY(${toastOn ? '0' : '16px'})`,
              opacity: toastOn ? 1 : 0,
              transition: 'all 300ms ease',
              background: C.brown, color: '#fff', maxWidth: '88%',
            }}
          >
            🔔 {toast}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════ 1. 인증 홈 ═══════════════ */
function AuthHome({ onEmailStart, onGoogle, onFindHelp }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!email.includes('@')) { setErr('올바른 이메일을 입력해 주세요.'); return }
    if (pw.length < 6) { setErr('비밀번호는 6자 이상이어야 합니다.'); return }
    setErr('')
    onEmailStart(email, pw)
  }

  return (
    <div className="flex-1 flex flex-col px-6 pt-12 pb-8">
      <div className="text-center">
        <div className="text-5xl">🐾</div>
        <h1 className="mt-2 text-3xl font-bold" style={{ color: C.brown }}>
          Ai<span style={{ color: C.primary }}>:</span>Myaong
        </h1>
        <p className="mt-1 text-sm font-semibold" style={{ color: C.mute }}>우리 아이, 어디서든 곁에</p>
      </div>

      {/* 이메일 가입/로그인 */}
      <form onSubmit={submit} className="mt-8 rounded-3xl p-6 shadow-lg" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: C.primary }}>이메일로 시작</p>
        <Input label="이메일" value={email} onChange={setEmail} placeholder="example@aimyaong.com" type="email" />
        <Input label="비밀번호" value={pw} onChange={setPw} placeholder="6자 이상" type="password" />
        {err && <p className="mt-3 text-sm font-bold" style={{ color: C.danger }}>{err}</p>}
        <button type="submit" className="mt-5 w-full rounded-2xl py-4 text-base font-bold text-white shadow-md active:brightness-90" style={{ background: C.primary }}>
          이메일로 가입 / 로그인
        </button>
        <div className="mt-3 flex justify-center gap-4 text-xs font-semibold" style={{ color: C.mute }}>
          <button type="button" onClick={onFindHelp} className="hover:underline">아이디 찾기</button>
          <span>·</span>
          <button type="button" onClick={onFindHelp} className="hover:underline">비밀번호 찾기</button>
        </div>
      </form>

      {/* 구분선 */}
      <div className="mt-6 flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: C.border }} />
        <span className="text-xs font-bold" style={{ color: C.mute }}>또는</span>
        <div className="flex-1 h-px" style={{ background: C.border }} />
      </div>

      {/* 구글 */}
      <button
        type="button"
        onClick={onGoogle}
        className="mt-6 w-full inline-flex items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold shadow-sm active:brightness-95"
        style={{ background: C.card, color: C.brown, border: `1.5px solid ${C.border}` }}
      >
        <GoogleG /> 구글 계정으로 빠르고 안전하게 시작하기
      </button>
    </div>
  )
}

/* ═══════════════ 2. 회원가입 / 펫 등록 ═══════════════ */
function SignupFlow({
  steps, step, current, userInfo, setU, pet, setP, petList, removePet,
  err, onNext, onPrev, onAddAnother, onFinish, isGoogle,
}) {
  const labels = { user: '정보', pet: '펫 등록', branch: '완료' }
  return (
    <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden">
      {/* 상단 고정 */}
      <div className="shrink-0 px-6 pt-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold" style={{ color: C.brown }}>회원가입</h1>
          {isGoogle && (
            <p className="mt-1 text-sm font-semibold" style={{ color: C.ok }}>
              ✓ 구글 계정 연동됨 · {GOOGLE_PROFILE.email}
            </p>
          )}
        </div>
        {/* 스텝 인디케이터 */}
        <div className="mt-5 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: i === step ? C.primary : i < step ? C.ok : C.input,
                    color: i <= step ? '#fff' : C.mute,
                    border: `1.5px solid ${i === step ? C.primary : i < step ? C.ok : C.border}`,
                  }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className="mt-1 text-xs font-bold" style={{ color: i === step ? C.brown : C.mute }}>{labels[s]}</span>
              </div>
              {i < steps.length - 1 && <div className="w-6 h-0.5 mb-5 rounded-full" style={{ background: i < step ? C.ok : C.border }} />}
            </div>
          ))}
        </div>
      </div>

      {/* 중앙 스크롤 */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
        <div className="rounded-3xl p-6 shadow-lg" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          {current === 'user' && <UserStep userInfo={userInfo} setU={setU} />}
          {current === 'pet' && <PetStep pet={pet} setP={setP} count={petList.length} />}
          {current === 'branch' && <BranchStep petList={petList} onAdd={onAddAnother} onRemove={removePet} />}
          {err && <p className="mt-4 text-sm font-bold" style={{ color: C.danger }}>{err}</p>}
        </div>
      </div>

      {/* 하단 고정 */}
      <div className="shrink-0 flex gap-3 px-6 pt-3 pb-7" style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <button type="button" onClick={onPrev}
          className="rounded-2xl px-6 py-4 text-base font-bold active:brightness-95"
          style={{ background: C.input, color: C.brown, border: `1.5px solid ${C.border}` }}>
          ‹ 이전
        </button>
        {current !== 'branch' ? (
          <button type="button" onClick={onNext}
            className="flex-1 rounded-2xl px-6 py-4 text-base font-bold text-white shadow-md active:brightness-90"
            style={{ background: C.primary }}>
            다음 ›
          </button>
        ) : (
          <button type="button" onClick={onFinish}
            className="flex-1 rounded-2xl px-6 py-4 text-base font-bold text-white shadow-md active:brightness-90"
            style={{ background: C.primaryDeep }}>
            ✓ 가입 완료
          </button>
        )}
      </div>
    </div>
  )
}

function UserStep({ userInfo, setU }) {
  return (
    <div>
      <h2 className="text-xl font-bold" style={{ color: C.brown }}>회원 정보를 입력해 주세요</h2>
      <Input label="이메일" value={userInfo.email} onChange={(v) => setU('email', v)} placeholder="example@aimyaong.com" type="email" />
      <Input label="비밀번호" value={userInfo.password} onChange={(v) => setU('password', v)} placeholder="6자 이상" type="password" />
      <Input label="닉네임" value={userInfo.nickname} onChange={(v) => setU('nickname', v)} placeholder="집사 이름" />
      <Input label="전화번호" value={userInfo.phone} onChange={(v) => setU('phone', v)} placeholder="010-0000-0000" type="tel" />
    </div>
  )
}

function PetStep({ pet, setP, count }) {
  const fileRef = useRef(null)
  const onPick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setP('photo', reader.result) // Base64 프리뷰
    reader.readAsDataURL(file)
  }
  return (
    <div>
      <h2 className="text-xl font-bold" style={{ color: C.brown }}>
        {count === 0 ? '반려동물을 등록해 주세요' : `${count + 1}번째 반려동물`}
      </h2>

      {/* 프로필 이미지 */}
      <div className="mt-5 flex justify-center">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="relative w-28 h-28 rounded-full flex items-center justify-center overflow-hidden"
          style={{ background: C.input, border: `2px dashed ${C.border}` }}>
          {pet.photo ? <img src={pet.photo} alt="펫" className="w-full h-full object-cover" /> : <span className="text-4xl">📷</span>}
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center text-white"
            style={{ background: C.primary, border: '2px solid #fff' }}>＋</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      </div>

      <Input label="이름" value={pet.name} onChange={(v) => setP('name', v)} placeholder="예: 초코" />

      <Label>종류</Label>
      <div className="mt-1.5 grid grid-cols-2 gap-2.5">
        <Seg active={pet.species === 'DOG'} onClick={() => setP('species', 'DOG')} label="🐶 강아지" />
        <Seg active={pet.species === 'CAT'} onClick={() => setP('species', 'CAT')} label="🐱 고양이" />
      </div>

      <Input label="품종" value={pet.breed} onChange={(v) => setP('breed', v)} placeholder="예: 푸들" />

      <Label>성별</Label>
      <div className="mt-1.5 grid grid-cols-2 gap-2.5">
        <Seg active={pet.gender === 'M'} onClick={() => setP('gender', 'M')} label="♂ 수컷" />
        <Seg active={pet.gender === 'F'} onClick={() => setP('gender', 'F')} label="♀ 암컷" />
      </div>

      <Input label="생년월일" value={pet.birthDate} onChange={(v) => setP('birthDate', v)} type="date" />
      <Input label="몸무게 (kg)" value={pet.weightKg} onChange={(v) => setP('weightKg', v)} placeholder="예: 4.2" type="number" />

      <Label>특이사항</Label>
      <textarea value={pet.notes} onChange={(e) => setP('notes', e.target.value)} rows={3} placeholder="알러지, 복용 약, 성격 등"
        className="mt-1.5 w-full rounded-2xl px-4 py-4 text-base outline-none resize-none"
        style={{ background: C.input, border: `1.5px solid ${C.border}`, color: C.brown, fontFamily: 'Pretendard,system-ui,sans-serif' }} />
    </div>
  )
}

function BranchStep({ petList, onAdd, onRemove }) {
  return (
    <div>
      <h2 className="text-xl font-bold" style={{ color: C.brown }}>총 {petList.length}마리 등록됨</h2>
      <div className="mt-5 space-y-2.5">
        {petList.map((p, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl px-3.5 py-3" style={{ background: C.input, border: `1.5px solid ${C.border}` }}>
            <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-2xl shrink-0" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              {p.photo ? <img src={p.photo} alt={p.name} className="w-full h-full object-cover" /> : (p.species === 'DOG' ? '🐶' : '🐱')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold truncate" style={{ color: C.brown }}>{p.name}</p>
              <p className="text-sm" style={{ color: C.mute }}>{p.species === 'DOG' ? '강아지' : '고양이'} · {p.breed || '품종 미입력'}</p>
            </div>
            <button type="button" onClick={() => onRemove(i)} className="p-2.5 text-lg" style={{ color: C.danger }}>🗑</button>
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-base font-bold" style={{ color: C.brown }}>다른 반려동물도 등록하시겠습니까?</p>
      <button type="button" onClick={onAdd}
        className="mt-3 w-full rounded-2xl py-4 text-base font-bold active:brightness-95"
        style={{ background: C.input, color: C.primaryDeep, border: `1.5px dashed ${C.primary}` }}>
        ＋ 예, 추가로 등록할게요
      </button>
      <p className="mt-3 text-center text-sm" style={{ color: C.mute }}>등록을 마쳤다면 아래 <b>가입 완료</b>를 눌러주세요 🐾</p>
    </div>
  )
}

/* ═══════════════ 3. 펫 스위칭 대시보드 ═══════════════ */
function Dashboard({ account, onLogout, onToast }) {
  const pets = account.pets
  const [idx, setIdx] = useState(0)
  const pet = pets[idx]
  const drag = useRef({ x: 0, active: false })

  const go = (n) => setIdx((i) => (i + n + pets.length) % pets.length)

  const onTouchStart = (e) => { drag.current = { x: e.touches[0].clientX, active: true } }
  const onTouchEnd = (e) => {
    if (!drag.current.active) return
    const dx = e.changedTouches[0].clientX - drag.current.x
    if (dx > 50) go(-1); else if (dx < -50) go(1)
    drag.current.active = false
  }
  const onMouseDown = (e) => { drag.current = { x: e.clientX, active: true } }
  const onMouseUp = (e) => {
    if (!drag.current.active) return
    const dx = e.clientX - drag.current.x
    if (dx > 50) go(-1); else if (dx < -50) go(1)
    drag.current.active = false
  }

  /* 가상 알림 */
  const fireNotification = () => {
    const body = `펫캠 알림: ${pet.name}이가 짖고 있습니다!`
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('🐾 펫캠 알림', { body })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') new Notification('🐾 펫캠 알림', { body })
        })
      }
    }
    onToast(body)
  }

  const logs = petLogs(pet)

  return (
    <div className="flex-1 flex flex-col h-[100dvh] overflow-y-auto">
      {/* 헤더 */}
      <div className="px-6 pt-8 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: C.mute }}>
            {account.provider === 'google' ? '구글 연동' : '이메일'} · {account.user.nickname} 님
          </p>
          <h1 className="text-2xl font-bold" style={{ color: C.brown }}>우리 아이들 🐾</h1>
        </div>
        <button type="button" onClick={onLogout} className="rounded-xl px-3 py-2 text-sm font-bold" style={{ background: C.input, color: C.mute, border: `1.5px solid ${C.border}` }}>로그아웃</button>
      </div>

      {/* 펫 캐러셀 */}
      <div className="px-6 mt-5">
        <div className="relative select-none"
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onMouseDown={onMouseDown} onMouseUp={onMouseUp}>
          <div className="rounded-3xl p-5 shadow-lg flex items-center gap-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-4xl shrink-0" style={{ background: C.input, border: `1px solid ${C.border}` }}>
              {pet.photo ? <img src={pet.photo} alt={pet.name} className="w-full h-full object-cover" /> : (pet.species === 'DOG' ? '🐶' : '🐱')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold" style={{ color: C.brown }}>{pet.name}</p>
              <p className="text-sm" style={{ color: C.mute }}>
                {pet.species === 'DOG' ? '강아지' : '고양이'} · {pet.breed || '품종 미입력'} · {pet.gender === 'M' ? '♂' : '♀'}
              </p>
              <p className="text-sm" style={{ color: C.mute }}>{pet.weightKg ? `${pet.weightKg}kg` : '몸무게 미입력'} · {pet.birthDate || '생일 미입력'}</p>
            </div>
          </div>

          {pets.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} className="absolute -left-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-white text-lg shadow-md" style={{ background: C.primary }}>‹</button>
              <button type="button" onClick={() => go(1)} className="absolute -right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-white text-lg shadow-md" style={{ background: C.primary }}>›</button>
            </>
          )}
        </div>

        {/* 인디케이터 */}
        <div className="mt-3 flex justify-center gap-1.5">
          {pets.map((_, i) => (
            <button key={i} type="button" onClick={() => setIdx(i)}
              className="h-2 rounded-full transition-all" style={{ width: i === idx ? 20 : 8, background: i === idx ? C.primary : C.border }} />
          ))}
        </div>
      </div>

      {/* 펫캠 스트리밍 (더미) */}
      <div className="px-6 mt-5">
        <div className="relative rounded-3xl overflow-hidden aspect-video flex items-center justify-center shadow-lg"
          style={{ background: pet.photo ? '#000' : 'linear-gradient(135deg,#FFD8A8,#F2A06A)' }}>
          {pet.photo
            ? <img src={pet.photo} alt="live" className="w-full h-full object-cover opacity-90" />
            : <span className="text-6xl">{pet.species === 'DOG' ? '🐶' : '🐱'}</span>}
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ background: 'rgba(226,109,92,0.95)' }}>
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> LIVE
          </span>
          <span className="absolute bottom-3 right-3 px-2 py-1 rounded-lg text-xs font-bold text-white" style={{ background: 'rgba(0,0,0,0.45)' }}>
            {pet.name} 펫캠
          </span>
        </div>
      </div>

      {/* 특이사항 */}
      {pet.notes && (
        <div className="px-6 mt-4">
          <div className="rounded-2xl px-4 py-3" style={{ background: C.input, border: `1px solid ${C.border}` }}>
            <p className="text-xs font-bold" style={{ color: C.primaryDeep }}>특이사항</p>
            <p className="mt-1 text-sm" style={{ color: C.brown, fontFamily: 'Pretendard,system-ui,sans-serif' }}>{pet.notes}</p>
          </div>
        </div>
      )}

      {/* 가상 로그 */}
      <div className="px-6 mt-4">
        <p className="text-sm font-bold" style={{ color: C.brown }}>{pet.name} 최근 활동</p>
        <div className="mt-2 space-y-2">
          {logs.map((log, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: C.primary }} />
              <span className="flex-1 text-sm font-semibold" style={{ color: C.brown }}>{log.m}</span>
              <span className="text-xs" style={{ color: C.mute }}>{log.t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 알림 테스트 */}
      <div className="px-6 mt-5 pb-8">
        <button type="button" onClick={fireNotification}
          className="w-full rounded-2xl py-4 text-base font-bold text-white shadow-md active:brightness-90"
          style={{ background: C.danger }}>
          🔔 테스트: 펫 이상 행동 감지 알림 발생
        </button>
      </div>
    </div>
  )
}

/* ═══════════════ 모달 ═══════════════ */
function GoogleModal({ onApprove, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div className="rounded-3xl p-6 w-[88%] max-w-[360px] shadow-2xl" style={{ background: C.card, fontFamily: 'Pretendard,system-ui,sans-serif' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-2">
          <GoogleG size={22} />
          <span className="text-lg font-bold" style={{ color: '#3c4043' }}>Google 계정으로 로그인</span>
        </div>
        <p className="mt-1 text-center text-sm" style={{ color: '#5f6368' }}>AiMyaong(으)로 계속</p>

        <div className="mt-5 flex items-center gap-3 rounded-2xl p-3" style={{ border: '1px solid #dadce0' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: '#F2A06A' }}>구</div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#3c4043' }}>{GOOGLE_PROFILE.nickname}</p>
            <p className="text-xs" style={{ color: '#5f6368' }}>{GOOGLE_PROFILE.email}</p>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl py-3 text-sm font-bold" style={{ color: '#1a73e8', border: '1px solid #dadce0' }}>취소</button>
          <button type="button" onClick={onApprove} className="flex-1 rounded-xl py-3 text-sm font-bold text-white" style={{ background: '#1a73e8' }}>승인</button>
        </div>
      </div>
    </Overlay>
  )
}

function InfoModal({ title, body, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div className="rounded-3xl p-6 w-[88%] max-w-[340px] shadow-2xl text-center" style={{ background: C.card }} onClick={(e) => e.stopPropagation()}>
        <div className="text-3xl">🔐</div>
        <h3 className="mt-2 text-lg font-bold" style={{ color: C.brown }}>{title}</h3>
        <p className="mt-2 text-sm" style={{ color: C.mute, fontFamily: 'Pretendard,system-ui,sans-serif' }}>{body}</p>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-2xl py-3.5 text-base font-bold text-white" style={{ background: C.primary }}>확인</button>
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(45,37,32,0.45)' }} onClick={onClose}>
      {children}
    </div>
  )
}

/* ═══════════════ 공통 입력 UI ═══════════════ */
function Label({ children }) {
  return <span className="mt-5 block text-sm font-bold pl-1" style={{ color: C.mute }}>{children}</span>
}

function Input({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-bold pl-1" style={{ color: C.mute }}>{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1.5 w-full rounded-2xl px-4 py-4 text-base outline-none"
        style={{ background: C.input, border: `1.5px solid ${C.border}`, color: C.brown, fontFamily: 'Pretendard,system-ui,sans-serif' }}
      />
    </label>
  )
}

function Seg({ active, onClick, label }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl py-4 text-base font-bold active:brightness-95"
      style={{ background: active ? C.primary : C.input, color: active ? '#fff' : C.brown, border: `1.5px solid ${active ? C.primary : C.border}` }}>
      {label}
    </button>
  )
}

function GoogleG({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 12.9 2 4 10.9 4 22s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.5 5.5C40.9 36.9 44 31 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  )
}
