import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Minus,
  Plus,
  Play,
  Clock,
  UtensilsCrossed,
  AlertTriangle,
  Droplets,
  ChevronLeft,
  ChevronRight,
  X,
  Plus as PlusIcon,
} from 'lucide-react'
import { Card, CreamCard, PageHeader, PrimaryButton } from '../components/ui'
import { TimeWheel } from '../components/TimeWheel'
import { api } from '../api/api'
import { useFeedSettings, setFoodAmount, setWaterAmount } from '../lib/dispenserSettings'
import { addNotification } from '../lib/notificationRepository'

const COLORS = {
  food: '#F08D86',
  water: '#5BA4D9',
  brown: '#4B3621',
  mute: '#9C8A78',
}

/* 오늘(일간) 시간대별 급여량(g) */
const DAILY_FOOD = [
  { label: '아침', g: 15 },
  { label: '점심', g: 10 },
  { label: '오후', g: 8 },
  { label: '저녁', g: 15 },
  { label: '야식', g: 5 },
]

/* 오늘(일간) 시간대별 급수량(ml) */
const DAILY_WATER = [
  { label: '아침', ml: 60 },
  { label: '점심', ml: 40 },
  { label: '오후', ml: 50 },
  { label: '저녁', ml: 70 },
  { label: '야식', ml: 20 },
]

export function Dispenser() {
  const navigate = useNavigate()
  // 1회 제공량: 저장소에서 공유 (대시보드 빠른 배식과 동일 값 사용)
  const feed = useFeedSettings()
  const foodAmount = feed.food
  const waterAmount = feed.water

  const [schedule, setSchedule] = useState([
    { id: 1, time: '08:00', type: 'food', amount: 15, on: true },
    { id: 2, time: '12:00', type: 'water', amount: 100, on: true },
    { id: 3, time: '13:00', type: 'food', amount: 10, on: true },
    { id: 4, time: '19:00', type: 'food', amount: 15, on: false },
  ])
  const [editing, setEditing] = useState(null) // { id?, time, type, amount } | null

  // 토스트
  const [toast, setToast] = useState(null)
  const [toastOn, setToastOn] = useState(false)
  const toastTimer = useRef(null)
  const showToast = (msg) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    requestAnimationFrame(() => setToastOn(true))
    toastTimer.current = setTimeout(() => {
      setToastOn(false)
      setTimeout(() => setToast(null), 300)
    }, 2000)
  }

  const [busy, setBusy] = useState(false)

  // 수동 배식 — 저장된 제공량으로 실제 배식 시도 + 토스트 + 알림
  const doFeed = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.dispenserFeed(foodAmount)
      showToast(`🍚 사료 ${foodAmount}g 배식 완료`)
      addNotification({ type: 'feed', title: '수동 배식', desc: `사료 ${foodAmount}g을 배식했어요`, link: '/feeding' })
    } catch {
      showToast('배식 실패 — 기기 연결을 확인해 주세요')
    } finally {
      setBusy(false)
    }
  }

  const doWater = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.dispenserWater(waterAmount)
      showToast(`💧 물 ${waterAmount}ml 급수 완료`)
      addNotification({ type: 'water_low', title: '수동 급수', desc: `물 ${waterAmount}ml을 급수했어요`, link: '/feeding' })
    } catch {
      showToast('급수 실패 — 기기 연결을 확인해 주세요')
    } finally {
      setBusy(false)
    }
  }

  const openAdd = () => setEditing({ time: '08:00', type: 'food', amount: 15 })
  const openEdit = (s) => setEditing({ id: s.id, time: s.time, type: s.type, amount: s.amount })

  const saveSchedule = (form) => {
    if (form.id) {
      setSchedule((prev) => prev.map((x) => (x.id === form.id ? { ...x, ...form } : x)))
      showToast('스케줄이 수정되었어요')
    } else {
      setSchedule((prev) =>
        [...prev, { ...form, id: Date.now(), on: true }].sort((a, b) => a.time.localeCompare(b.time)))
      showToast('스케줄이 추가되었어요')
    }
    setEditing(null)
  }

  const [removingIds, setRemovingIds] = useState([])
  const removeSchedule = (id) => {
    if (removingIds.includes(id)) return
    setRemovingIds((p) => [...p, id]) // 먼저 접히는 애니메이션
    setTimeout(() => {
      setSchedule((prev) => prev.filter((x) => x.id !== id))
      setRemovingIds((p) => p.filter((x) => x !== id))
      showToast('스케줄이 삭제되었어요')
    }, 320)
  }
  const toggleSchedule = (id) =>
    setSchedule((prev) => prev.map((x) => (x.id === id ? { ...x, on: !x.on } : x)))

  const foodRemain = 28
  const waterRemain = 62
  const foodLow = foodRemain < 30
  const waterLow = waterRemain < 25

  const todayTotal = DAILY_FOOD.reduce((s, d) => s + d.g, 0)
  const todayWater = DAILY_WATER.reduce((s, d) => s + d.ml, 0)
  const maxFood = Math.max(...DAILY_FOOD.map((d) => d.g))
  const maxWater = Math.max(...DAILY_WATER.map((d) => d.ml))

  return (
    <div className="px-5 pb-6">
      {/* 헤더 + 뒤로가기 */}
      <header className="flex items-center gap-2.5 pt-5 pb-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="뒤로가기"
          className="w-10 h-10 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-brand-brown leading-tight">디스펜서</h1>
          <p className="text-sm text-brand-mute truncate">사료 · 음수 · 통계</p>
        </div>
      </header>

      {/* 잔여량 (사료 + 물) */}
      <section className="grid grid-cols-2 gap-3">
        <ResourceCard
          icon={<UtensilsCrossed className="w-4 h-4" />}
          label="사료 잔여량"
          value={foodRemain}
          unit="%"
          color="primary"
          low={foodLow}
        />
        <ResourceCard
          icon={<Droplets className="w-4 h-4" />}
          label="수위 (Water Level)"
          value={waterRemain}
          unit="%"
          color="water"
          low={waterLow}
        />
      </section>

      <div data-tour="disp-manual">
      <ManualCard
        kind="food"
        title="수동 배식"
        unitLabel="g"
        amount={foodAmount}
        min={5}
        max={300}
        step={5}
        onChange={setFoodAmount}
        onSubmit={doFeed}
        busy={busy}
        button={`지금 ${foodAmount}g 배식하기`}
        icon={<UtensilsCrossed className="w-4 h-4" />}
      />

      <ManualCard
        kind="water"
        title="수동 급수"
        unitLabel="ml"
        amount={waterAmount}
        min={20}
        max={300}
        step={20}
        onChange={setWaterAmount}
        onSubmit={doWater}
        busy={busy}
        button={`지금 ${waterAmount}ml 급수하기`}
        icon={<Droplets className="w-4 h-4" />}
      />
      </div>

      {/* 스케줄 (CRUD) */}
      <section className="mt-5" data-tour="disp-schedule">
        <div className="flex items-center justify-between px-1 mb-3">
          <h3 className="font-display text-base font-bold text-brand-brown">자동 스케줄</h3>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1 text-xs font-bold text-brand-primary touch-active"
          >
            <PlusIcon className="w-3.5 h-3.5" /> 추가
          </button>
        </div>
        <CreamCard className="divide-y divide-brand-line">
          {schedule.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-brand-mute">등록된 스케줄이 없어요. <b>추가</b>를 눌러보세요.</p>
          )}
          {schedule.map((s) => {
            const isFood = s.type === 'food'
            const removing = removingIds.includes(s.id)
            return (
              <div
                key={s.id}
                className="overflow-hidden transition-all duration-300 ease-out"
                style={{ maxHeight: removing ? 0 : 120, opacity: removing ? 0 : 1 }}
              >
              <div
                onClick={() => openEdit(s)}
                role="button"
                tabIndex={0}
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-brand-cream transition-transform duration-300"
                style={{ transform: removing ? 'translateX(-12px)' : 'none' }}
              >
                {/* 삭제 (작은 ×) */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeSchedule(s.id) }}
                  aria-label="삭제"
                  className="w-6 h-6 rounded-full bg-brand-line/60 text-brand-mute flex items-center justify-center shrink-0 active:bg-brand-danger active:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <span
                  className="w-10 h-10 rounded-2xl bg-brand-card flex items-center justify-center shadow-soft shrink-0"
                  style={{ color: isFood ? COLORS.food : COLORS.water }}
                >
                  {isFood ? <UtensilsCrossed className="w-5 h-5" /> : <Droplets className="w-5 h-5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-lg font-bold text-brand-brown leading-none">{s.time}</p>
                  <p className="text-xs text-brand-mute mt-1">
                    {isFood ? `사료 ${s.amount}g` : `물 ${s.amount}ml`}
                  </p>
                </div>

                {/* 활성 토글 */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={s.on}
                    onChange={() => toggleSchedule(s.id)}
                  />
                  <span className="w-12 h-7 rounded-full bg-brand-line peer-checked:bg-brand-primary transition-colors" />
                  <span className="absolute left-1 top-1 w-5 h-5 rounded-full bg-white shadow-soft transition-transform peer-checked:translate-x-5" />
                </label>
              </div>
              </div>
            )
          })}
        </CreamCard>
        <p className="mt-2 px-1 text-[11px] text-brand-mute">항목을 누르면 수정할 수 있어요.</p>
      </section>

      {/* 추가/수정 모달 */}
      {editing && (
        <ScheduleModal initial={editing} onClose={() => setEditing(null)} onSave={saveSchedule} />
      )}

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed left-1/2 bottom-24 z-50 px-5 py-3 rounded-2xl shadow-soft-lg text-sm font-bold text-white"
          style={{
            transform: `translateX(-50%) translateY(${toastOn ? '0' : '10px'})`,
            opacity: toastOn ? 1 : 0,
            transition: 'all 250ms ease',
            background: '#4B3621',
            maxWidth: '88%',
          }}
        >
          🐾 {toast}
        </div>
      )}

      {/* 오늘(일간) 급여 통계 */}
      <section className="mt-6">
        <div className="flex items-center justify-between px-1 mb-3">
          <h3 className="font-display text-base font-bold text-brand-brown">오늘 급여 통계</h3>
          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: `${COLORS.food}26`, color: COLORS.food }}>
              사료 {todayTotal}g
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: `${COLORS.water}26`, color: COLORS.water }}>
              물 {todayWater}ml
            </span>
          </div>
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-brand-mute font-semibold">시간대별 급여 · 급수</p>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              <Legend color={COLORS.food} label="사료(g)" />
              <Legend color={COLORS.water} label="물(ml)" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 h-32">
            {DAILY_FOOD.map((d, i) => {
              const w = DAILY_WATER[i]
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                  <div className="flex-1 w-full flex items-end justify-center gap-1">
                    <div
                      className="w-1/3 rounded-t-md transition-all"
                      style={{ height: `${(d.g / maxFood) * 100}%`, background: COLORS.food }}
                      title={`${d.label} 사료 ${d.g}g`}
                    />
                    <div
                      className="w-1/3 rounded-t-md transition-all"
                      style={{ height: `${(w.ml / maxWater) * 100}%`, background: COLORS.water }}
                      title={`${d.label} 물 ${w.ml}ml`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-brand-mute">{d.label}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 급여 통계 자세히 보기 → 일·주·월 상세 페이지 */}
        <button
          type="button"
          onClick={() => navigate('/feeding')}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-3xl bg-brand-cream text-brand-brown font-bold py-3.5 shadow-soft touch-active"
        >
          급여 통계 자세히 보기
          <ChevronRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  )
}

/* ───── 보조 컴포넌트 ───── */

function ResourceCard({ icon, label, value, unit, color, low }) {
  const accent = color === 'water' ? COLORS.water : COLORS.food
  return (
    <Card className={`px-4 py-4 ${low ? 'border-brand-danger/40' : ''}`}>
      <div className="flex items-center gap-1.5 text-brand-mute mb-1">
        <span style={{ color: accent }}>{icon}</span>
        <p className="text-[11px] font-semibold truncate">{label}</p>
      </div>
      <p className="font-display text-2xl font-bold text-brand-brown leading-none">
        {value}
        <span className="text-base ml-0.5 text-brand-mute font-bold">{unit}</span>
      </p>
      <div className="mt-3 h-2.5 rounded-full bg-brand-line overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: low ? '#E26D5C' : accent }}
        />
      </div>
      {low ? (
        <p className="mt-2 text-[11px] text-brand-danger font-bold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> 부족 경고
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-brand-success font-bold">충분</p>
      )}
    </Card>
  )
}

function ManualCard({ kind, title, unitLabel, amount, min, max, step, onChange, onSubmit, busy, button, icon }) {
  const isWater = kind === 'water'
  const accent = isWater ? COLORS.water : COLORS.food
  const ratio = (amount - min) / (max - min)
  return (
    <Card className="mt-4 px-5 py-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-9 h-9 rounded-2xl flex items-center justify-center"
            style={{ background: `${accent}26`, color: accent }}
          >
            {icon}
          </span>
          <div>
            <p className="text-xs text-brand-mute font-semibold">{title}</p>
            <p className="font-display text-base font-bold text-brand-brown">1회 제공량</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: `${accent}26`, color: accent }}>
          {amount}{unitLabel}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(min, amount - step))}
          className="w-12 h-12 rounded-2xl bg-brand-cream text-brand-brown shadow-soft touch-active flex items-center justify-center"
          aria-label="감소"
        >
          <Minus className="w-5 h-5" />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={amount}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={`${title} 제공량`}
          className="flex-1 h-2.5 cursor-pointer appearance-none rounded-full"
          style={{
            accentColor: accent,
            background: `linear-gradient(to right, ${accent} 0%, ${accent} ${ratio * 100}%, #EFE3D2 ${ratio * 100}%, #EFE3D2 100%)`,
          }}
        />
        <button
          onClick={() => onChange(Math.min(max, amount + step))}
          className="w-12 h-12 rounded-2xl bg-brand-cream text-brand-brown shadow-soft touch-active flex items-center justify-center"
          aria-label="증가"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {isWater ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-3xl text-white font-bold py-3.5 shadow-soft transition-colors disabled:opacity-60"
          style={{ background: accent }}
        >
          <Play className="w-4 h-4" />
          {button}
        </button>
      ) : (
        <PrimaryButton className="mt-4 w-full disabled:opacity-60" onClick={onSubmit} disabled={busy}>
          <Play className="w-4 h-4" />
          {button}
        </PrimaryButton>
      )}
    </Card>
  )
}

function PeriodTabs({ value, onChange }) {
  return (
    <div className="inline-flex bg-brand-cream rounded-full p-1 shadow-soft-inset">
      {[{ id: 'week', label: '주간' }, { id: 'month', label: '월간' }].map((opt) => {
        const active = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
              active ? 'bg-brand-primary text-white shadow-soft' : 'text-brand-mute'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function SummaryStat({ color, label, value }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <p className="text-xs text-brand-mute font-semibold">{label}</p>
      </div>
      <p className="font-display text-2xl font-bold text-brand-brown mt-1">{value}</p>
    </Card>
  )
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1 text-brand-brown">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

/* 스케줄 추가/수정 — 바텀 시트(아래에서 위로 슬라이딩) */
function ScheduleModal({ initial, onClose, onSave }) {
  const isEdit = initial.id != null
  const [time, setTime] = useState(initial.time)
  const [type, setType] = useState(initial.type)
  const [amount, setAmount] = useState(initial.amount)
  const [show, setShow] = useState(false) // 슬라이드 인/아웃 제어

  // 마운트 직후 위로 슬라이드 업
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // 아래로 내려간 뒤 실제 닫기/저장 (애니메이션 후 처리)
  const dismiss = (after) => {
    setShow(false)
    setTimeout(after, 280)
  }

  const isFood = type === 'food'
  const unit = isFood ? 'g' : 'ml'
  const step = isFood ? 5 : 20
  const min = isFood ? 5 : 20
  const max = 300
  const accent = isFood ? COLORS.food : COLORS.water
  const ratio = (Number(amount) - min) / (max - min)

  const submit = (e) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!time || !amt || amt <= 0) return
    dismiss(() => onSave({ id: initial.id, time, type, amount: amt }))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => dismiss(onClose)}>
      {/* 뒷배경(Overlay) */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: 'rgba(45,37,32,0.45)', opacity: show ? 1 : 0 }}
      />

      {/* 바텀 시트 */}
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-brand-card px-6 pt-3 pb-8 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{ transform: show ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* 그랩 핸들 */}
        <div className="mx-auto w-10 h-1.5 rounded-full bg-brand-line mb-4" />

        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-brand-brown">{isEdit ? '스케줄 수정' : '스케줄 추가'}</h3>
          <button type="button" onClick={() => dismiss(onClose)} aria-label="닫기" className="text-brand-mute"><X className="w-5 h-5" /></button>
        </div>

        {/* 종류 */}
        <p className="mt-5 text-sm font-bold text-brand-mute pl-1">종류</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setType('food')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-2xl py-3.5 text-base font-bold transition-colors ${isFood ? 'bg-brand-primary text-white' : 'bg-brand-cream text-brand-brown'}`}
          >
            <UtensilsCrossed className="w-5 h-5" /> 사료
          </button>
          <button
            type="button"
            onClick={() => setType('water')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-2xl py-3.5 text-base font-bold transition-colors ${!isFood ? 'bg-brand-primary text-white' : 'bg-brand-cream text-brand-brown'}`}
          >
            <Droplets className="w-5 h-5" /> 물
          </button>
        </div>

        {/* 시간 (시/분 휠) */}
        <div className="mt-4">
          <span className="text-sm font-bold text-brand-mute pl-1 flex items-center gap-1"><Clock className="w-4 h-4" /> 시간</span>
          <div className="mt-1.5">
            <TimeWheel value={time} onChange={setTime} />
          </div>
        </div>

        {/* 급여량/급수량 (슬라이드 막대) */}
        <div className="mt-4">
          <div className="flex items-center justify-between pl-1">
            <span className="text-sm font-bold text-brand-mute">{isFood ? '급여량' : '급수량'}</span>
            <span className="px-2.5 py-1 rounded-full text-sm font-bold" style={{ background: `${accent}26`, color: accent }}>
              {amount}{unit}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <button type="button" onClick={() => setAmount((a) => Math.max(min, Number(a) - step))}
              className="w-10 h-10 rounded-2xl bg-brand-cream text-brand-brown shadow-soft flex items-center justify-center shrink-0"><Minus className="w-5 h-5" /></button>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label={isFood ? '급여량' : '급수량'}
              className="flex-1 h-2.5 cursor-pointer appearance-none rounded-full"
              style={{
                accentColor: accent,
                background: `linear-gradient(to right, ${accent} 0%, ${accent} ${ratio * 100}%, #EFE3D2 ${ratio * 100}%, #EFE3D2 100%)`,
              }}
            />
            <button type="button" onClick={() => setAmount((a) => Math.min(max, Number(a) + step))}
              className="w-10 h-10 rounded-2xl bg-brand-cream text-brand-brown shadow-soft flex items-center justify-center shrink-0"><Plus className="w-5 h-5" /></button>
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-brand-mute px-1">
            <span>{min}{unit}</span>
            <span>{max}{unit}</span>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => dismiss(onClose)} className="flex-1 rounded-2xl py-3.5 text-base font-bold bg-brand-cream text-brand-brown touch-active">취소</button>
          <button type="submit" className="flex-1 rounded-2xl py-3.5 text-base font-bold text-white bg-brand-primary shadow-soft touch-active">{isEdit ? '저장' : '추가'}</button>
        </div>
      </form>
    </div>
  )
}

export default Dispenser
