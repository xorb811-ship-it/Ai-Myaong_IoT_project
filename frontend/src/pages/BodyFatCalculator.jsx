import { useState } from 'react'

/**
 * 반려동물 비만도(체지방률, %BF) 계산기 — 단일 파일 컴포넌트
 * - React(JSX) + Tailwind CSS
 * - 1단계(기본 정보) → 2단계(신체 치수) → 결과
 * - 결과 계산 시 Oracle DB 인서트용 Payload(대문자 스네이크) 생성 + console.log
 *   (실제 전송은 추후 백엔드 API로 대체)
 */

const TYPES = [
  { id: 'DOG', label: '강아지', emoji: '🐶' },
  { id: 'CAT', label: '고양이', emoji: '🐱' },
]

/* 판정 등급 메타 (라벨 + 색상) */
const STATUS_META = {
  UNDERWEIGHT: { ko: '저체중', badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  IDEAL: { ko: '정상', badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  OVERWEIGHT: { ko: '과체중', badge: 'bg-orange-100 text-orange-700', bar: 'bg-orange-500' },
  OBESE: { ko: '비만', badge: 'bg-red-100 text-red-700', bar: 'bg-red-500' },
}

const emptyForm = () => ({
  name: '',
  type: 'DOG',
  breed: '',
  weight: '',
  circumference: '', // 고양이: 9번째 갈비뼈 둘레 / 강아지: 골반 둘레
  legLength: '',     // 하퇴골 길이
})

/* 체지방률 계산 */
function calcBodyFat({ type, circumference, legLength }) {
  const c = Number(circumference)
  const l = Number(legLength)
  if (!c || !l) return null
  const raw = type === 'CAT'
    ? (c / l * 1.5) - 9     // 고양이 공식
    : (c / l * 1.2) - 15.5  // 강아지 공식
  return Math.round(raw * 10) / 10 // 소수점 첫째자리
}

/* 등급 판정 */
function judge(type, bf) {
  if (type === 'CAT') {
    if (bf < 10) return 'UNDERWEIGHT'
    if (bf < 30) return 'IDEAL'
    if (bf <= 42) return 'OVERWEIGHT'
    return 'OBESE'
  }
  // DOG
  if (bf < 10) return 'UNDERWEIGHT'
  if (bf < 25) return 'IDEAL'
  if (bf < 35) return 'OVERWEIGHT'
  return 'OBESE'
}

export default function BodyFatCalculator() {
  const [step, setStep] = useState(1)        // 1: 기본정보, 2: 신체치수, 3: 결과
  const [form, setForm] = useState(emptyForm())
  const [result, setResult] = useState(null) // { bf, status }
  const [error, setError] = useState('')

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const isCat = form.type === 'CAT'
  const circumferenceLabel = isCat ? '9번째 갈비뼈 둘레 (cm)' : '골반 둘레 (cm)'

  const goStep2 = () => {
    setError('')
    if (!form.name.trim()) { setError('반려동물 이름을 입력해 주세요.'); return }
    if (!Number(form.weight)) { setError('현재 몸무게를 입력해 주세요.'); return }
    setStep(2)
  }

  /* 결과 계산 + DB 전송 객체 생성 */
  const handleCalculate = () => {
    setError('')
    if (!Number(form.circumference) || !Number(form.legLength)) {
      setError('둘레와 하퇴골 길이를 정확히 입력해 주세요.')
      return
    }
    const bf = calcBodyFat(form)
    const status = judge(form.type, bf)
    setResult({ bf, status })
    setStep(3)
    handleSaveToDatabase(bf, status)
  }

  /**
   * 미래 DB 연동을 위한 전송용 Payload 생성 함수.
   * 지금은 console.log 로만 출력하고, 추후 백엔드 API 호출로 대체한다.
   */
  const handleSaveToDatabase = (bf, status) => {
    const payload = {
      PET_NAME: form.name.trim(),
      PET_TYPE: form.type,                       // "DOG" | "CAT"
      BREED: form.breed.trim(),
      WEIGHT: Number(form.weight),
      CIRCUMFERENCE: Number(form.circumference),
      LEG_LENGTH: Number(form.legLength),
      BODY_FAT_PERCENTAGE: bf,                    // 소수점 첫째자리
      STATUS: status,                            // "UNDERWEIGHT" | "IDEAL" | "OVERWEIGHT" | "OBESE"
      MEASURED_AT: new Date().toISOString(),     // ISO 8601
    }

    // TODO: 백엔드 API 연동 시 fetch/axios 로직 대체 예정
    //   예) await fetch('/api/pet-bodyfat', {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json' },
    //         body: JSON.stringify(payload),
    //       })
    //   → 서버에서 Oracle DB(PET_BODYFAT 테이블 등)에 INSERT
    console.log('%c[BodyFatCalculator] DB 전송 Payload', 'color:#ea580c;font-weight:bold')
    console.log(JSON.stringify(payload, null, 2))

    return payload
  }

  const reset = () => {
    setForm(emptyForm())
    setResult(null)
    setError('')
    setStep(1)
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-slate-100 py-8 px-4">
      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-slate-800">반려동물 비만도 계산기</h1>
          <p className="mt-1 text-sm text-slate-500">체지방률(%BF)로 우리 아이 건강 상태를 확인해요</p>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {['기본 정보', '신체 치수', '결과'].map((label, i) => {
            const n = i + 1
            const active = step === n
            const done = step > n
            return (
              <div key={label} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                    ${active ? 'bg-orange-500 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
                    {done ? '✓' : n}
                  </span>
                  <span className={`mt-1 text-[11px] font-semibold ${active ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
                </div>
                {n < 3 && <div className={`w-6 h-0.5 mb-4 rounded-full ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </div>
            )
          })}
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-3xl shadow-lg shadow-slate-200/60 p-6">
          {/* ───── 1단계: 기본 정보 ───── */}
          {step === 1 && (
            <div className="space-y-4">
              <Field label="반려동물 이름">
                <input value={form.name} onChange={(e) => set('name', e.target.value)}
                  placeholder="예: 초코" className={inputCls} />
              </Field>

              <div>
                <Label>종류</Label>
                <div className="grid grid-cols-2 gap-2.5">
                  {TYPES.map((t) => {
                    const on = form.type === t.id
                    return (
                      <button key={t.id} type="button" onClick={() => set('type', t.id)}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border transition-colors
                          ${on ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'}`}>
                        <span className="text-lg">{t.emoji}</span> {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Field label="품종">
                <input value={form.breed} onChange={(e) => set('breed', e.target.value)}
                  placeholder={isCat ? '예: 코리안숏헤어' : '예: 푸들'} className={inputCls} />
              </Field>

              <Field label="현재 몸무게 (kg)">
                <input type="number" min="0" step="0.1" value={form.weight} onChange={(e) => set('weight', e.target.value)}
                  placeholder="예: 4.2" className={inputCls} />
              </Field>

              {error && <p className="text-sm font-semibold text-red-500">{error}</p>}

              <button type="button" onClick={goStep2}
                className="w-full rounded-xl bg-orange-500 text-white font-bold py-3.5 hover:bg-orange-600 transition-colors">
                다음
              </button>
            </div>
          )}

          {/* ───── 2단계: 신체 치수 ───── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <b className="text-slate-800">{form.name}</b> · {isCat ? '🐱 고양이' : '🐶 강아지'}
                {form.breed && ` · ${form.breed}`}
              </div>

              <Field label={circumferenceLabel}>
                <input type="number" min="0" step="0.1" value={form.circumference} onChange={(e) => set('circumference', e.target.value)}
                  placeholder="예: 32" className={inputCls} />
              </Field>

              <Field label="뒷다리 하퇴골 길이 (cm)">
                <input type="number" min="0" step="0.1" value={form.legLength} onChange={(e) => set('legLength', e.target.value)}
                  placeholder="예: 12" className={inputCls} />
              </Field>

              {error && <p className="text-sm font-semibold text-red-500">{error}</p>}

              <div className="flex gap-3">
                <button type="button" onClick={() => { setError(''); setStep(1) }}
                  className="flex-1 rounded-xl bg-slate-100 text-slate-700 font-bold py-3.5 hover:bg-slate-200 transition-colors">
                  이전
                </button>
                <button type="button" onClick={handleCalculate}
                  className="flex-1 rounded-xl bg-orange-500 text-white font-bold py-3.5 hover:bg-orange-600 transition-colors">
                  결과 계산하기
                </button>
              </div>
            </div>
          )}

          {/* ───── 3단계: 결과 ───── */}
          {step === 3 && result && (
            <div>
              <div className="text-center">
                <p className="text-sm text-slate-500">{form.name}의 체지방률 (%BF)</p>
                <p className="mt-1 text-5xl font-extrabold text-slate-800">{result.bf}<span className="text-2xl">%</span></p>
                <span className={`mt-3 inline-block px-4 py-1.5 rounded-full text-sm font-bold ${STATUS_META[result.status].badge}`}>
                  {result.status} · {STATUS_META[result.status].ko}
                </span>
              </div>

              {/* 등급 막대 */}
              <div className="mt-5 flex h-2 rounded-full overflow-hidden">
                {['UNDERWEIGHT', 'IDEAL', 'OVERWEIGHT', 'OBESE'].map((s) => (
                  <div key={s} className={`flex-1 ${STATUS_META[s].bar} ${result.status === s ? 'opacity-100' : 'opacity-25'}`} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] font-semibold text-slate-400">
                <span>저체중</span><span>정상</span><span>과체중</span><span>비만</span>
              </div>

              {/* 입력 요약 */}
              <div className="mt-5 grid grid-cols-2 gap-2.5 text-sm">
                <Summary label="종류" value={isCat ? '고양이' : '강아지'} />
                <Summary label="몸무게" value={`${form.weight}kg`} />
                <Summary label={isCat ? '갈비뼈 둘레' : '골반 둘레'} value={`${form.circumference}cm`} />
                <Summary label="하퇴골 길이" value={`${form.legLength}cm`} />
              </div>

              {/* ⚠️ 오차 안내 경고 박스 */}
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                <p className="text-sm leading-relaxed text-amber-800">
                  ⚠️ <b>측정 결과 안내:</b> 반려동물의 호흡 상태, 자세, 털 두께에 따라 집에서 줄자로 재는 수치는
                  최대 <b>20%의 오차</b>가 발생할 수 있습니다. 보다 정확한 측정을 위해 아이가 편안하게 서 있을 때
                  3번 측정하여 평균값을 입력하시는 것을 권장하며, 본 결과는 <b>참고용</b>으로만 활용하시고
                  정확한 진단은 <b>수의사 상담</b>을 받으세요.
                </p>
              </div>

              <div className="mt-5 flex gap-3">
                <button type="button" onClick={() => setStep(2)}
                  className="flex-1 rounded-xl bg-slate-100 text-slate-700 font-bold py-3.5 hover:bg-slate-200 transition-colors">
                  다시 측정
                </button>
                <button type="button" onClick={reset}
                  className="flex-1 rounded-xl bg-orange-500 text-white font-bold py-3.5 hover:bg-orange-600 transition-colors">
                  처음으로
                </button>
              </div>

              <p className="mt-3 text-center text-[11px] text-slate-400">
                계산 완료 시 DB 전송용 Payload가 콘솔에 출력됩니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition'

function Label({ children }) {
  return <p className="mb-1.5 text-sm font-semibold text-slate-700">{children}</p>
}

function Field({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Summary({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-800 mt-0.5">{value}</p>
    </div>
  )
}
