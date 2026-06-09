import { useEffect, useRef, useState } from 'react'
import { X, PawPrint, Dog, Cat, Camera } from 'lucide-react'
import { DateWheel } from './DateWheel'

/* Warm-tone 팔레트 */
const C = {
  card: 'rgb(var(--brand-card))',
  input: 'rgb(var(--brand-input))',
  border: 'rgb(var(--brand-line))',
  brown: 'rgb(var(--brand-brown))',
  mute: 'rgb(var(--brand-mute))',
  primary: 'rgb(var(--brand-primary))',
  danger: 'rgb(var(--brand-danger))',
}

const TODAY = new Date().toISOString().slice(0, 10) // 미래 생일 선택 방지

const emptyPet = () => ({
  name: '', species: 'DOG', breed: '', gender: 'M',
  birthDate: '', weightKg: '', heightCm: '',
  circumference: '', legLength: '', // (선택) 체지방률 계산용
  photo: '', notes: '',
})

/**
 * 펫 추가/수정 바텀 시트.
 * - 회원가입 펫 입력과 동일한 필드 (몸무게/키 포함 → BMI 계산에 사용)
 * - initial 이 있으면 수정 모드(프리필)
 * - onSave(pet) 로 전달 → 호출부에서 addPet / updatePet
 */
export function AddPetModal({ onClose, onSave, initial = null, title = '반려동물 추가', submitLabel = '추가하기' }) {
  const [pet, setPet] = useState(() => ({ ...emptyPet(), ...(initial || {}) }))
  const [err, setErr] = useState('')
  const [show, setShow] = useState(false) // 바텀 시트 슬라이드 인/아웃
  const fileRef = useRef(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const dismiss = (after) => {
    setShow(false)
    setTimeout(after, 280)
  }

  const set = (k, v) => setPet((p) => ({ ...p, [k]: v }))

  const onPick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set('photo', reader.result) // Base64
    reader.readAsDataURL(file)
  }

  const submit = (e) => {
    e.preventDefault()
    if (!pet.name.trim()) { setErr('이름을 입력해 주세요.'); return }
    if (!pet.breed.trim()) { setErr('품종을 입력해 주세요.'); return }
    if (pet.birthDate && pet.birthDate > TODAY) { setErr('생년월일은 오늘 이후로 선택할 수 없어요.'); return }
    dismiss(() => onSave(pet))
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={() => dismiss(onClose)}
    >
      {/* 뒷배경 */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: 'rgba(45,37,32,0.45)', opacity: show ? 1 : 0 }}
      />

      {/* 바텀 시트 */}
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] max-h-[88dvh] overflow-y-auto rounded-t-3xl px-6 pt-3 pb-8 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{ background: C.card, transform: show ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div className="mx-auto w-10 h-1.5 rounded-full mb-4" style={{ background: C.border }} />
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold" style={{ color: C.brown }}>{title}</h3>
          <button type="button" onClick={() => dismiss(onClose)} aria-label="닫기" style={{ color: C.mute }}><X className="w-5 h-5" /></button>
        </div>

        {/* 프로필 이미지 */}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
            style={{ background: C.input, border: `2px dashed ${C.border}` }}
          >
            {pet.photo
              ? <img src={pet.photo} alt="펫" className="w-full h-full object-cover" />
              : <Camera className="w-7 h-7" style={{ color: C.mute }} />}
            <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: C.primary, border: '2px solid #fff' }}>＋</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
        </div>

        <Field icon={<PawPrint className="w-5 h-5" />} label="이름" value={pet.name}
          onChange={(v) => set('name', v)} placeholder="예: 초코" />

        <Label>종류</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-2.5">
          <Seg active={pet.species === 'DOG'} onClick={() => set('species', 'DOG')} icon={<Dog className="w-5 h-5" />} label="강아지" />
          <Seg active={pet.species === 'CAT'} onClick={() => set('species', 'CAT')} icon={<Cat className="w-5 h-5" />} label="고양이" />
        </div>

        <Field icon={<PawPrint className="w-5 h-5" />} label="품종" value={pet.breed}
          onChange={(v) => set('breed', v)} placeholder="예: 푸들" />

        <Label>성별</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-2.5">
          <Seg active={pet.gender === 'M'} onClick={() => set('gender', 'M')} label="♂ 수컷" />
          <Seg active={pet.gender === 'F'} onClick={() => set('gender', 'F')} label="♀ 암컷" />
        </div>

        <Label>생년월일</Label>
        <div className="mt-1.5">
          <DateWheel value={pet.birthDate} onChange={(v) => set('birthDate', v)} />
        </div>
        <Field label="몸무게 (kg)" value={pet.weightKg} onChange={(v) => set('weightKg', v)} placeholder="예: 4.2" type="number" />
        <Field label="키 (cm)" value={pet.heightCm} onChange={(v) => set('heightCm', v)} placeholder="예: 25" type="number" />
        <Field label={`${pet.species === 'CAT' ? '갈비뼈 둘레' : '골반 둘레'} (cm)`} value={pet.circumference}
          onChange={(v) => set('circumference', v)} placeholder="선택 · 체지방률 계산용" type="number" />
        <Field label="하퇴골 길이 (cm)" value={pet.legLength} onChange={(v) => set('legLength', v)} placeholder="선택 · 체지방률 계산용" type="number" />

        <Label>특이사항</Label>
        <textarea
          value={pet.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          placeholder="알러지, 복용 약, 성격 등"
          className="mt-1.5 w-full rounded-2xl px-4 py-3 text-base outline-none resize-none"
          style={{ background: C.input, border: `1.5px solid ${C.border}`, color: C.brown }}
        />

        {err && <p className="mt-3 text-sm font-bold" style={{ color: C.danger }}>{err}</p>}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => dismiss(onClose)}
            className="flex-1 rounded-2xl py-3.5 text-base font-bold" style={{ background: C.input, color: C.brown }}>
            취소
          </button>
          <button type="submit"
            className="flex-1 rounded-2xl py-3.5 text-base font-bold text-white shadow-soft" style={{ background: C.primary }}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

function Label({ children }) {
  return <span className="mt-4 block text-sm font-bold pl-1" style={{ color: C.mute }}>{children}</span>
}

function Field({ icon, label, value, onChange, type = 'text', placeholder, max }) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-bold pl-1" style={{ color: C.mute }}>{label}</span>
      <div className="mt-1.5 flex items-center gap-2.5 rounded-2xl px-4 py-3.5" style={{ background: C.input, border: `1.5px solid ${C.border}` }}>
        {icon && <span style={{ color: C.mute }}>{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          max={max}
          className="flex-1 min-w-0 bg-transparent text-base outline-none placeholder:opacity-60"
          style={{ color: C.brown }}
        />
      </div>
    </label>
  )
}

function Seg({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 rounded-2xl py-3.5 text-base font-bold transition-colors"
      style={{
        background: active ? C.primary : C.input,
        color: active ? '#fff' : C.brown,
        border: `1.5px solid ${active ? C.primary : C.border}`,
      }}
    >
      {icon}{label}
    </button>
  )
}

export default AddPetModal
