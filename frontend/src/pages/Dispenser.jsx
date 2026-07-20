import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Check,
  PawPrint,
  Bone,
  Plus as PlusIcon,
} from '../components/icons'
import { Card, CreamCard, PageHeader, PrimaryButton } from '../components/ui'
import { TimeWheel } from '../components/TimeWheel'
import { api } from '../api/api'
import { useFeedSettings, setFoodAmount, setWaterAmount } from '../lib/dispenserSettings'
import { addNotification } from '../lib/notificationRepository'

// 브랜드 색 토큰(CSS 변수) 사용 → 다크모드에서 자동으로 차분한 톤으로 전환
/* 잔량 기준 — 실제 양(g/ml)으로 본다. % 는 통 용량 설정에 따라 뜻이 달라지지만
 * '50g 남았다'는 통이 뭐든 같은 뜻이다. 물은 밀도가 1이라 1g = 1ml 로 같은 눈금을 쓴다.
 * 통 용량(게이지 100% 기준)은 백엔드의 DISPENSER_*_CAPACITY 가 정한다. */
const FOOD_PLENTY_G = 150 // 이상이면 여유
const FOOD_CAUTION_G = 50 // 이하면 '보충 필요' + 알림
const WATER_PLENTY_ML = 150
const WATER_CAUTION_ML = 50

/* 정지 버튼을 언제 내릴지 정하는 '예상 구동 시간'.
 *
 * 정확한 신호는 ESP32 가 보내는 dispenser.busy 이고 오면 그쪽이 항상 이긴다. 이 값은
 * 신호가 늦거나(폴링 3초) 아직 펌웨어를 안 구운 기기일 때만 쓰는 폴백이다.
 * 그래서 여기가 틀려도 버튼이 잠깐 더/덜 보일 뿐, 통계나 실제 동작에는 영향이 없다.
 * (배출량은 이 값으로 재지 않는다 — 그건 ESP32 가 저울로 직접 잰다)
 *
 * 물은 사용자가 고른 초 그대로라 정확하다. 사료만 펌웨어 상수를 따라간다. */
const FOOD_MOTOR_MS_PER_AMOUNT = 250 // esp32/main/motor_control.h 와 같은 값
const FOOD_MOTOR_MIN_RUN_MS = 300
const FOOD_MOTOR_MAX_RUN_MS = 8000
const RUN_MARGIN_MS = 400 // 명령이 기기까지 가는 시간

/* 정지를 누른 뒤 눌림 표시를 유지하는 시간. 이 시간이 지나야 배식 버튼으로 넘어간다 —
 * 즉시 넘기면 눌린 걸 보기도 전에 바뀐다. */
const STOP_FLASH_MS = 300

const foodRunMs = (g) =>
  Math.min(FOOD_MOTOR_MAX_RUN_MS, Math.max(FOOD_MOTOR_MIN_RUN_MS, g * FOOD_MOTOR_MS_PER_AMOUNT))

/* 로봇 시리얼 번호 — 설정에서 등록하면 저장된다. 등록 전에는 디스펜서를 못 쓴다. */
const ROBOT_SERIAL_KEY = 'aimyaong:robotSerial'

/* 지금 시각 'HH:MM'. 스케줄을 새로 추가할 때 기본값 — 08:00 고정에서 돌리는 것보다
 * 지금 시각에서 출발하는 편이 손이 덜 간다. */
function nowHHMM() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/* '15:30' -> '오후 3시 30분'. 저장·정렬은 24시간(HH:MM) 그대로 두고 보여줄 때만 바꾼다.
 * 형식이 이상하면 원본을 그대로 돌려준다 — 표시 때문에 값이 사라지면 안 된다. */
function formatTimeKo(hhmm) {
  const parsed = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''))
  if (!parsed) return hhmm ?? ''
  const hour24 = Number(parsed[1])
  const minute = Number(parsed[2])
  if (hour24 > 23 || minute > 59) return hhmm
  const meridiem = hour24 < 12 ? '오전' : '오후'
  const hour12 = hour24 % 12 || 12 // 0시·12시 -> 12
  return minute === 0 ? `${meridiem} ${hour12}시` : `${meridiem} ${hour12}시 ${minute}분`
}

/* 여유 / 보통 / 보충 필요 — 값이 없으면(센서 끊김) null. 모르는 건 경고하지 않는다. */
function remainLevel(live, amount, plentyAt, cautionAt) {
  if (!live) return null
  if (amount <= cautionAt) return 'low'
  if (amount >= plentyAt) return 'plenty'
  return 'normal'
}

const COLORS = {
  food: 'rgb(var(--brand-food))',
  water: 'rgb(var(--brand-water))',
  brown: 'rgb(var(--brand-brown))',
  mute: 'rgb(var(--brand-mute))',
}
// rgb(var(--x)) 색에 투명도 적용: rgb(var(--x) / a)
const withAlpha = (c, a) => `${c.slice(0, -1)} / ${a})`

// 카드 배경: 흰색 80% + 크림 20% (은은) / 정보·칩: 따뜻한 탄
const BG_CARD = "color-mix(in srgb, rgb(var(--brand-card)) 80%, rgb(var(--brand-cream)) 20%)"
const BG_INFO = "color-mix(in srgb, rgb(var(--brand-cream)) 78%, rgb(var(--brand-mute)) 22%)"
const ROBOT_DEVICE_CLAIM_ENABLED = import.meta.env.VITE_ROBOT_DEVICE_CLAIM_ENABLED === "true"

/* 안쪽 점선 바느질 테두리 (펠트 느낌) */
function Stitch({ className = '' }) {
  return (
    <span className={`pointer-events-none absolute inset-[6px] rounded-[18px] border-2 border-dashed border-brand-brown/20 ${className}`} />
  )
}

/* 종이질감 장식 아이콘 — public/icons/*.svg 실루엣을 마스크로, paper.jpg 텍스처를 그 안에만.
 * 아이콘 출처: Phosphor Icons (MIT) — public/icons/{paw,bone,heart}.svg */
function PaperIcon({ shape, color, className = '', opacity = 1 }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none ${className}`}
      style={{
        backgroundColor: color,
        backgroundImage: 'url(/paper.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundBlendMode: 'multiply',
        WebkitMaskImage: `url(/icons/${shape}.svg)`,
        maskImage: `url(/icons/${shape}.svg)`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        opacity,
      }}
    />
  )
}

/* 오늘(일간) 시간대 버킷 라벨 */
const DAY_LABELS = ['아침', '점심', '오후', '저녁', '야식']

// 시각(시) → 시간대 버킷 인덱스
function hourBucket(h) {
  if (h >= 5 && h < 11) return 0 // 아침
  if (h >= 11 && h < 14) return 1 // 점심
  if (h >= 14 && h < 18) return 2 // 오후
  if (h >= 18 && h < 22) return 3 // 저녁
  return 4 // 야식 (22~04)
}

export function Dispenser() {
  const navigate = useNavigate()
  // 1회 제공량: 저장소에서 공유 (대시보드 빠른 배식과 동일 값 사용)
  const feed = useFeedSettings()
  const foodAmount = feed.food
  const waterAmount = feed.water

  const [schedule, setSchedule] = useState([]) // DB(feed_schedule/water_schedule)에서 불러옴, 없으면 빈 상태
  const [editing, setEditing] = useState(null) // { id?, time, type, amount } | null
  const [logs, setLogs] = useState({ feed: [], water: [] }) // 오늘의 급여 통계용 DB 기록

  // 배식/급수 기록 불러오기 (오늘의 통계 차트) — 자동 배식이 새로고침 없이 바로 반영되도록 폴링
  useEffect(() => {
    let alive = true
    const load = () =>
      api
        .getDispenserLogs()
        .then((d) => { if (alive) setLogs({ feed: d.feed || [], water: d.water || [] }) })
        .catch(() => {})
    load()
    const timer = window.setInterval(load, 3000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  // ── 스케줄 DB 연동 (settings.feed_schedule / water_schedule 에 JSON 직렬화 저장) ──
  // 한 배열을 type 으로 나눠 각 컬럼에 저장하고, 불러올 때 다시 합친다. id 는 로컬 전용.
  const scheduleFirst = useRef(false) // 첫 렌더(기본값) 저장 방지
  const applyingFromDb = useRef(false) // DB 로드로 인한 변경은 재저장(에코) 방지

  useEffect(() => {
    // 마운트 시 DB 에서 스케줄 불러오기
    api
      .getSettings()
      .then((s) => {
        const parse = (raw, type) => {
          try {
            const arr = JSON.parse(raw || '[]')
            // 물 스케줄은 예전에 ml(5~50)로 저장됐는데 지금은 '초'다. 범위 밖 값을 그대로
            // 두면 리스트엔 "50초 급수"로 보이지만 펌웨어는 90초 범위로 맞춰 표시와 동작을
            // 어긋난다. 불러올 때 종류별 범위로 맞춰 화면과 실제를 일치시킨다.
            const r = SCHEDULE_RANGE[type] ?? SCHEDULE_RANGE.food
            return Array.isArray(arr)
              ? arr.map((x) => ({
                  time: x.time,
                  type,
                  amount: Math.min(Math.max(Number(x.amount) || r.min, r.min), r.max),
                  on: x.on !== false,
                }))
              : []
          } catch {
            return []
          }
        }
        const loaded = [...parse(s.feed_schedule, 'food'), ...parse(s.water_schedule, 'water')]
          .map((x, i) => ({ ...x, id: Date.now() + i }))
          .sort((a, b) => a.time.localeCompare(b.time))
        if (loaded.length) {
          applyingFromDb.current = true
          setSchedule(loaded)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 스케줄 변경(추가/수정/삭제/토글) 시 DB 저장
    if (!scheduleFirst.current) {
      scheduleFirst.current = true
      return
    }
    if (applyingFromDb.current) {
      applyingFromDb.current = false
      return
    }
    const pack = (type) =>
      JSON.stringify(
        schedule.filter((x) => x.type === type).map((x) => ({ time: x.time, amount: x.amount, on: x.on })),
      )
    api.updateSettings({ feed_schedule: pack('food'), water_schedule: pack('water') }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule])

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
  const [manualWaterOn, setManualWaterOn] = useState(false)
  const [manualWaterStopping, setManualWaterStopping] = useState(false)

  /* 시리얼 번호를 등록해야 디스펜서를 쓸 수 있다. 등록 전에는 배식·급수·스케줄을 막는다.
   * 버튼을 disabled 로 막아두지만, 그래도 호출되는 경로(자동 스케줄 편집 등)가 있어
   * 동작 함수에서 한 번 더 확인한다. */
  const [robotSerial, setRobotSerial] = useState(() => {
    if (ROBOT_DEVICE_CLAIM_ENABLED) return ''
    try {
      return localStorage.getItem(ROBOT_SERIAL_KEY) || ''
    } catch {
      return ''
    }
  })
  const hasRobotSerial = !!robotSerial.trim()
  const requireRobotSerial = () => {
    if (hasRobotSerial) return false
    showToast('로봇 시리얼 번호를 먼저 등록해 주세요')
    return true
  }

  useEffect(() => {
    if (!ROBOT_DEVICE_CLAIM_ENABLED) return;
    let alive = true;
    const syncRobotAccess = () => {
      api
        .getMyRobotDevices()
        .then((result) => {
          if (!alive) return;
          const nextSerial = result.devices?.[0]?.robot_serial || "";
          setRobotSerial(nextSerial);
          try {
            if (nextSerial) localStorage.setItem(ROBOT_SERIAL_KEY, nextSerial);
            else localStorage.removeItem(ROBOT_SERIAL_KEY);
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          if (!alive) return;
          setRobotSerial("");
          try {
            localStorage.removeItem(ROBOT_SERIAL_KEY);
          } catch {
            /* ignore */
          }
        });
    };
    syncRobotAccess();
    window.addEventListener("focus", syncRobotAccess);
    return () => {
      alive = false;
      window.removeEventListener("focus", syncRobotAccess);
    };
  }, []);

  // 수동 배식 — 명령만 보낸다. 통계 기록은 백엔드가 한다.
  // 실제 배출량은 ESP32 가 저울로 직접 재서(dispenser/dispensed) 백엔드에 알리고,
  // 백엔드가 FEED_LOGS 에 쌓는다. 여기서 시간을 추측해 재려 하면 펌웨어의 오거 속도
  // 상수를 프론트가 복제해야 하고, 그 값이 바뀌면 조용히 틀어진다.
  // 자동 배식은 브라우저가 꺼져 있어도 돌아가므로 어차피 백엔드가 기록해야 한다.
  const doFeed = async () => {
    if (requireRobotSerial()) return
    if (busy) return
    setBusy(true)
    try {
      await api.dispenserFeed(foodAmount)
      startRun(foodRunMs(foodAmount) + RUN_MARGIN_MS)
      setDispenser((prev) => ({ ...(prev || {}), busy: true, state: 'feed_running' }))
      window.setTimeout(refreshDispenser, 250)
      showToast(`🍚 ${foodAmount}g 배식 시작 — 버튼을 눌러 멈출 수 있어요`)
      // 배식은 '일상'이라 알림(경고)으로 보내지 않음 → 통계/최근활동으로만 표현
    } catch {
      showToast('배식 실패 — 기기 연결을 확인해 주세요')
    } finally {
      setBusy(false)
    }
  }

  // 급수는 '몇 초 돌릴지'만 지시한다. 물통이 저수조 겸 음수대라 펌프를 돌려도 물이
  // 통 밖으로 나가지 않아(순환) '이번에 몇 ml 급수했다'가 성립하지 않는다. 그래서
  // 급수량은 기록하지 않는다 — 물이 실제로 줄어드는 건 고양이가 마셨을 때뿐이고,
  // 그건 잔여량(water_ml) 이 시간에 따라 떨어지는 것으로 나타난다.
  const doWater = async () => {
    if (requireRobotSerial()) return
    if (busy) return
    setBusy(true)
    try {
      if (manualWaterOn) {
        setManualWaterOn(false)
        setManualWaterStopping(true)
        showToast('💧 수동 급수 종료 요청을 보냈어요')
        await api.dispenserPumpOff()
      } else {
        setManualWaterStopping(false)
        await api.dispenserPumpOn()
        setManualWaterOn(true)
        showToast('💧 수동 급수를 시작했어요')
      }
    } catch {
      if (manualWaterOn) {
        setManualWaterOn(true)
        setManualWaterStopping(false)
      }
      showToast('급수 제어 실패 — 기기 연결을 확인해 주세요')
    } finally {
      setBusy(false)
    }
  }

  const openAdd = () => {
    if (requireRobotSerial()) return
    setEditing({ time: nowHHMM(), type: 'food', amount: SCHEDULE_RANGE.food.def })
  }
  const openEdit = (s) => {
    if (requireRobotSerial()) return
    setEditing({ id: s.id, time: s.time, type: s.type, amount: s.amount })
  }

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
  const toggleSchedule = (id) => {
    if (requireRobotSerial()) return
    setSchedule((prev) => prev.map((x) => (x.id === id ? { ...x, on: !x.on } : x)))
  }

  // 잔여량 — 디스펜서 로드셀 실측값. 값이 끊기면(food_fresh/water_fresh=false) 숫자를 지어내지 않고
  // '연결 안 됨'을 표시한다.
  //
  // ESP32 가 무게를 3초마다 발행하므로 폴링도 3초다. 더 자주 물어봐야 같은 값을 다시
  // 받을 뿐이라 서버만 때린다. 값이 툭툭 튀어 보이는 건 폴링을 조여서가 아니라,
  // 받은 값 사이를 useCountUp 이 애니메이션으로 메워서 해결한다.
  // 탭이 숨겨져 있으면 아예 멈춘다 — 안 보이는 화면 때문에 서버를 때릴 이유가 없다.
  const [dispenser, setDispenser] = useState(null)
  const refreshDispenser = useCallback(() =>
    api
      .getDashboard()
      .then((d) => {
        const next = d?.status?.dispenser ?? null
        setDispenser(next)
        return next
      })
      .catch(() => {
        setDispenser(null)
        return null
      }), [])
  useEffect(() => {
    let alive = true
    let timer = null

    const load = () =>
      refreshDispenser().then((next) => {
        if (alive) setDispenser(next)
      })

    const start = () => {
      if (timer) return
      load()
      api.requestDispenserWeight().catch(() => {})
      window.setTimeout(load, 350)
      timer = window.setInterval(load, 1000)
    }
    const stop = () => {
      if (!timer) return
      window.clearInterval(timer)
      timer = null
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      alive = false
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshDispenser])

  /* ── 긴급 정지 ──
   * 구동 중인지는 ESP32 가 dispenser/status 로 알려주고 백엔드가 dispenser.busy 로 내려준다.
   * 그게 유일하게 정확한 신호라 오면 무조건 그쪽을 따른다.
   *
   * 다만 두 경우에 기기 신호만으로는 부족하다:
   *  - 폴링이 3초라 신호가 최대 3초 늦게 온다. 사료 3초 배식이면 그때는 이미 끝났다.
   *  - 아직 펌웨어를 안 구운 기기는 상태를 아예 안 보낸다.
   * 그래서 '방금 내가 눌렀고, 이만큼 걸릴 것'이라는 예상으로 버튼을 띄우고,
   * 기기 신호가 오면 그 즉시 예상을 버리고 기기를 따른다. */
  const [pendingUntil, setPendingUntil] = useState(0) // 예상 종료 시각(ms), 0 = 대기 아님
  const [now, setNow] = useState(() => Date.now())
  const deviceBusy = !!dispenser?.busy
  const expectedFoodRunning = pendingUntil > now
  const running = deviceBusy || expectedFoodRunning
  const foodRunning = (dispenser?.state === 'feed_running' && deviceBusy) || expectedFoodRunning
  const waterPumpRunning = !manualWaterStopping && (
    manualWaterOn || ['water_running', 'water_pump_on'].includes(dispenser?.state)
  )

  useEffect(() => {
    if (['idle', 'online', 'stopped', 'water_stopped'].includes(dispenser?.state)) {
      setManualWaterOn(false)
      setManualWaterStopping(false)
    }
  }, [dispenser?.state])

  // 예상으로 띄운 버튼은 예상 종료 시각이 되면 스스로 내려간다.
  // 기기가 상태를 보내오면 예상은 버린다 — 실제 신호가 항상 이긴다.
  useEffect(() => {
    if (deviceBusy && pendingUntil && dispenser?.state !== 'feed_running') setPendingUntil(0)
  }, [deviceBusy, pendingUntil, dispenser?.state])

  // 경과 시간 표시 + 예상 종료 판정을 같은 틱으로 굴린다.
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) {
      setElapsed(0)
      return undefined
    }
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setNow(Date.now())
      setElapsed((Date.now() - startedAt) / 1000)
    }, 100)
    return () => window.clearInterval(timer)
  }, [running])

  const startRun = (ms) => {
    setNow(Date.now())
    setPendingUntil(Date.now() + ms)
  }

  const doStop = async () => {
    // 눌림 반응이 다 보인 뒤에 버튼을 내린다. 즉시 내리면 running 이 false 가 되면서
    // 버튼이 통째로 사라져 애니메이션이 재생될 틈이 없다 — 그냥 뚝 꺼지는 느낌이 된다.
    setNow(Date.now())
    setPendingUntil(0)
    setDispenser((prev) => ({ ...(prev || {}), busy: false, state: 'stopped' }))
    try {
      await api.dispenserStop()
      refreshDispenser()
      window.setTimeout(refreshDispenser, 250)
      showToast('⏹ 정지했어요')
      // 명령이 실제로 나간 뒤에만 알림을 남긴다 — 실패했는데 '정지됨'이 기록되면 안 된다.
      // 배식/급수와 달리 정지는 '일상'이 아니라 사람이 개입한 사건이라 알림으로 남긴다.
      addNotification({
        type: 'dispenser_stopped',
        title: '디스펜서 정지',
        desc: '배식/급수를 중간에 멈췄어요.',
        link: '/dispenser',
      })
    } catch {
      showToast('정지 실패 — 기기 연결을 확인해 주세요')
    }
  }

  // 사료/물 로드셀은 따로 논다. 한쪽만 붙어 있어도 붙은 쪽은 정상 표시해야 한다.
  const foodFresh = !!dispenser?.food_fresh
  const waterFresh = !!dispenser?.water_fresh
  const foodLive = dispenser?.food_g != null
  const waterLive = dispenser?.water_ml != null
  const foodGrams = foodLive ? Math.round(dispenser.food_g ?? 0) : null
  const waterMl = waterLive ? Math.round(dispenser.water_ml ?? 0) : null
  const foodPercent = foodLive ? (dispenser.food_percent ?? 0) : 0
  const waterPercent = waterLive ? (dispenser.water_percent ?? 0) : 0

  const foodLevel = remainLevel(foodLive, foodGrams, FOOD_PLENTY_G, FOOD_CAUTION_G)
  const waterLevel = remainLevel(waterLive, waterMl, WATER_PLENTY_ML, WATER_CAUTION_ML)

  // 센서가 죽었을 때는 '보충 필요'가 아니라 '모름'이다. 함부로 경고를 띄우지 않는다.
  const foodLow = foodLevel === 'low'
  const waterLow = waterLevel === 'low'

  // 잔여량 부족 → 알림 (세션당 1회, 스팸 방지). 실측값이 들어온 뒤에만 판단한다.
  useEffect(() => {
    const notifyLow = (key, type, title, desc) => {
      const flag = `aimyaong:lowNotified:${key}`
      if (sessionStorage.getItem(flag)) return
      sessionStorage.setItem(flag, '1')
      addNotification({ type, title, desc, link: '/dispenser' })
    }
    if (foodLow) {
      notifyLow('food', 'food_low', '사료 보충 필요',
        foodGrams <= 0 ? '사료가 비었어요. 지금 보충해주세요!' : `남은 사료 ${foodGrams}g · 보충해주세요!`)
    }
    if (waterLow) {
      notifyLow('water', 'water_low', '물 보충 필요',
        waterMl <= 0 ? '물이 비었어요. 지금 보충해주세요!' : `남은 물 ${waterMl}ml · 보충해주세요!`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodLow, waterLow])

  // 오늘의 급여 통계 — DB 기록(feed_logs/water_logs)으로 시간대별 집계
  const { DAILY_FOOD, DAILY_WATER, todayTotal, todayWater, maxFood, maxWater } = useMemo(() => {
    const now = new Date()
    const sameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    const food = DAY_LABELS.map((label) => ({ label, g: 0 }))
    const water = DAY_LABELS.map((label) => ({ label, ml: 0 }))
    ;(logs.feed || []).forEach((x) => {
      const t = new Date(x.created_at)
      if (sameDay(t, now)) food[hourBucket(t.getHours())].g += Number(x.amount_g) || 0
    })
    ;(logs.water || []).forEach((x) => {
      const t = new Date(x.created_at)
      if (sameDay(t, now)) water[hourBucket(t.getHours())].ml += Number(x.amount_ml) || 0
    })
    food.forEach((d) => { d.g = Math.round(d.g) })
    water.forEach((d) => { d.ml = Math.round(d.ml) })
    // 사료·물을 같은 눈금(5단위 올림)으로 맞춰 실제 값 차이가 막대 높이에 보이도록
    const peak = Math.max(0, ...food.map((d) => d.g), ...water.map((d) => d.ml))
    const scaleMax = Math.max(5, Math.ceil(peak / 5) * 5)
    return {
      DAILY_FOOD: food,
      DAILY_WATER: water,
      todayTotal: food.reduce((s, d) => s + d.g, 0),
      todayWater: water.reduce((s, d) => s + d.ml, 0),
      maxFood: scaleMax,
      maxWater: scaleMax,
    }
  }, [logs])

  return (
    <div className="px-5 pb-6">
      {/* 헤더 + 뒤로가기 */}
      <header className="flex items-center gap-2.5 pt-5 pb-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="뒤로가기"
          className="w-9 h-9 -ml-1 flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="min-w-0">
          <h1 className="font-cute text-2xl font-bold text-brand-brown leading-tight">디스펜서</h1>
          <p className="text-sm text-brand-mute truncate">사료 · 음수 · 통계</p>
        </div>
      </header>

      {!hasRobotSerial && (
        <div className="mb-3 rounded-3xl border border-dashed border-brand-primary/30 bg-brand-primary/10 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 w-4 h-4 text-brand-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-brown">
                시리얼 번호 등록이 필요합니다.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-brand-mute">
                수동 급식, 수동 급수와 자동 스케줄은 설정에서 로봇 시리얼 번호를
                등록한 뒤 사용할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 잔여량 (사료 + 물) */}
      <section className="grid grid-cols-2 gap-3">
        <ResourceCard
          icon={<UtensilsCrossed className="w-4 h-4" />}
          label="남은 사료"
          value={foodGrams}
          unit="g"
          percent={foodPercent}
          color="primary"
          level={foodLevel}
          live={foodLive}
          fresh={foodFresh}
        />
        <ResourceCard
          icon={<Droplets className="w-4 h-4" />}
          label="남은 물"
          value={waterMl}
          unit="ml"
          percent={waterPercent}
          color="water"
          level={waterLevel}
          live={waterLive}
          fresh={waterFresh}
        />
      </section>

      <div data-tour="disp-manual">
      <ManualCard
        kind="food"
        title="수동 배식"
        unitLabel="g"
        amount={foodAmount}
        min={5}
        max={50}
        step={5}
        onChange={setFoodAmount}
        onSubmit={doFeed}
        busy={busy}
        button={`지금 ${foodAmount}g 배식하기`}
        icon={<UtensilsCrossed className="w-4 h-4" />}
        running={foodRunning}
        elapsed={elapsed}
        onStop={doStop}
        disabled={!hasRobotSerial}
      />

      <ManualCard
        kind="water"
        title="수동 급수"
        unitLabel=""
        amount={waterPumpRunning ? 'ON' : 'OFF'}
        min={0}
        max={1}
        step={1}
        onChange={() => {}}
        isToggle
        onSubmit={doWater}
        busy={busy}
        button={waterPumpRunning ? '수동 급수 끄기' : '수동 급수 켜기'}
        icon={<Droplets className="w-4 h-4" />}
        running={false}
        elapsed={elapsed}
        onStop={doStop}
        disabled={!hasRobotSerial}
      />
      </div>

      {/* 스케줄 (CRUD) */}
      <section className="mt-5" data-tour="disp-schedule">
        <div className="flex items-center px-1 mb-3">
          <h3 className="font-display text-base font-bold text-brand-brown">자동 스케줄</h3>
        </div>
        <div className="relative overflow-hidden rounded-3xl shadow-soft" style={{ backgroundColor: BG_CARD }}>
          <Stitch />
          <PaperIcon shape="bone" color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute right-4 top-3 w-8 h-8 rotate-12" />
          <div className="relative z-10 divide-y divide-brand-line/70">
          {schedule.length === 0 && (
            <button
              type="button"
              onClick={openAdd}
              className="w-full px-4 py-9 flex flex-col items-center gap-3 active:opacity-80 transition-opacity"
            >
              <span
                className="w-14 h-14 rounded-full text-white flex items-center justify-center border-2 border-dashed border-white/40 shadow-soft"
                style={{ background: COLORS.food }}
              >
                <PlusIcon className="w-6 h-6" />
              </span>
              <span className="text-sm font-bold text-brand-brown/70">눌러서 자동 급여 일정을 추가하세요</span>
            </button>
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
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer border-l-4 hover:bg-brand-cream/50 active:bg-brand-cream active:scale-[0.985] transition-all duration-200"
                style={{
                  transform: removing ? 'translateX(-12px)' : undefined,
                  borderLeftColor: isFood ? COLORS.food : COLORS.water,
                  opacity: s.on ? 1 : 0.5,
                }}
              >
                {/* 삭제 (작은 ×) — 왼쪽 */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeSchedule(s.id) }}
                  aria-label="삭제"
                  className="w-6 h-6 rounded-full bg-brand-line/60 text-brand-mute flex items-center justify-center shrink-0 hover:bg-brand-danger hover:text-white active:bg-brand-danger active:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* 종류 아이콘 (색상 톤) */}
                <span
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: withAlpha(isFood ? COLORS.food : COLORS.water, 0.1), color: isFood ? COLORS.food : COLORS.water }}
                >
                  {isFood ? <UtensilsCrossed className="w-5 h-5" /> : <Droplets className="w-5 h-5" />}
                </span>

                {/* 시간 + 종류 배지 + 양 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-lg font-bold text-brand-brown leading-none">{formatTimeKo(s.time)}</p>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                      style={{ background: withAlpha(isFood ? COLORS.food : COLORS.water, 0.1), color: isFood ? COLORS.food : COLORS.water }}
                    >
                      {isFood ? '사료' : '물'}
                    </span>
                    {!s.on && <span className="text-[10px] font-bold text-brand-mute">꺼짐</span>}
                  </div>
                  <p className="text-xs text-brand-mute mt-1 font-semibold">
                    {isFood ? `${s.amount}g` : `${s.amount}초 급수`}
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
          {schedule.length > 0 && (
            <button
              type="button"
              onClick={openAdd}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3.5 text-sm font-bold text-brand-primary hover:bg-brand-cream/50 active:bg-brand-cream active:scale-[0.99] transition-all duration-200"
            >
              <PlusIcon className="w-4 h-4" /> 스케줄 추가
            </button>
          )}
          </div>
        </div>
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
        <div className="relative overflow-hidden rounded-3xl shadow-soft p-4" style={{ backgroundColor: BG_CARD }}>
          <Stitch />
          <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute right-3 bottom-3 w-12 h-12 rotate-6" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-bold text-brand-brown">오늘 급여 통계</h3>
              <div className="flex items-center gap-1.5">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold border border-dashed border-brand-brown/20" style={{ background: withAlpha(COLORS.food, 0.15), color: COLORS.food }}>
                  사료 {todayTotal}g
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold border border-dashed border-brand-brown/20" style={{ background: withAlpha(COLORS.water, 0.15), color: COLORS.water }}>
                  물 {todayWater}ml
                </span>
              </div>
            </div>

            <div className="relative rounded-2xl p-3.5 border border-dashed border-brand-brown/15" style={{ backgroundColor: "rgb(var(--brand-card))" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-brand-mute font-semibold">시간대별 급여 · 급수</p>
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  <Legend color={COLORS.food} label="사료(g)" />
                  <Legend color={COLORS.water} label="물(ml)" />
                </div>
              </div>
              <div className="flex items-end justify-between gap-2 h-44 pt-2">
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
            </div>
          </div>
        </div>

        {/* 급여 통계 자세히 보기 → 일·주·월 상세 페이지 */}
        <button
          type="button"
          onClick={() => navigate('/feeding')}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-3xl border-2 border-dashed border-brand-brown/20 text-brand-brown font-bold py-3.5 shadow-soft touch-active"
          style={{ backgroundColor: BG_INFO }}
        >
          급여 통계 자세히 보기
          <ChevronRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  )
}

/* ───── 보조 컴포넌트 ───── */

/* 숫자가 이전 값에서 새 값으로 굴러가게 한다.
 *
 * 로드셀 값은 3초마다 한 번만 온다. 그대로 꽂으면 3초마다 숫자가 툭 튄다.
 * 받은 값 사이를 애니메이션으로 메워서, 실제로 무게가 오르내리는 것처럼 보이게 한다.
 * 폴링을 조이는 것보다 이쪽이 서버·기기에 부담이 없다 — 어차피 원본이 3초마다만 바뀐다.
 *
 * duration 은 폴링 주기(3초)보다 살짝 짧게. 더 길면 다음 값이 올 때까지 못 따라잡아
 * 계속 뒤처지고, 너무 짧으면 굴러가다 멈춰서 오히려 끊겨 보인다.
 * target 이 null(센서 끊김)이면 애니메이션하지 않는다 — 없는 값을 지어내면 안 된다. */
function useCountUp(target, duration = 2200) {
  const [shown, setShown] = useState(target ?? 0)
  const shownRef = useRef(target ?? 0)
  const rafRef = useRef(null)

  useEffect(() => {
    if (target == null) return undefined

    const from = shownRef.current
    const delta = target - from
    // 반올림하면 어차피 같은 숫자 → 애니메이션할 이유가 없다
    if (Math.abs(delta) < 0.5) {
      shownRef.current = target
      setShown(target)
      return undefined
    }

    const startedAt = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out — 빠르게 출발해 끝에서 부드럽게 선다
      const next = from + delta * eased
      shownRef.current = next
      setShown(next)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    // 새 값이 오면 진행 중이던 애니메이션은 현재 위치에서 이어받는다(shownRef 유지)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return target == null ? null : shown
}

function ResourceCard({ icon, label, value, unit, percent, color, level, live = true, fresh = true }) {
  const accent = color === 'water' ? COLORS.water : COLORS.food
  const danger = 'rgb(var(--brand-danger))'
  const low = level === 'low'
  const tint = !live ? COLORS.mute : low ? danger : accent
  const shownValue = useCountUp(live ? value : null)
  const shownPercent = useCountUp(live ? percent : null)
  return (
    <div
      className="relative overflow-hidden rounded-3xl shadow-soft px-4 py-4 flex flex-col h-full"
      style={{ backgroundColor: withAlpha(tint, 0.12) }}
    >
      <Stitch className="border-brand-brown/15" />
      <div className="relative z-10 flex flex-col h-full">
        {/* 라벨 + 상태 배지 */}
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center border border-dashed border-brand-brown/20"
              style={{ background: withAlpha(tint, 0.2), color: tint }}
            >
              {icon}
            </span>
            <p className="text-xs font-bold text-brand-brown/70 truncate">{label}</p>
          </div>
          {!live ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-dashed border-brand-brown/20 text-brand-mute" style={{ background: withAlpha(COLORS.mute, 0.15) }}>
              <AlertTriangle className="w-3 h-3 shrink-0" /> 연결 안 됨
            </span>
          ) : !fresh ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-dashed border-brand-brown/20 text-brand-mute" style={{ background: withAlpha(COLORS.mute, 0.15) }}>
              <Clock className="w-3 h-3 shrink-0" /> 갱신 대기
            </span>
          ) : low ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-dashed border-white/40 text-white animate-pulse" style={{ background: danger }}>
              <AlertTriangle className="w-3 h-3 shrink-0" /> 보충 필요
            </span>
          ) : level === 'normal' ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-dashed" style={{ background: withAlpha(accent, 0.18), color: accent, borderColor: withAlpha(accent, 0.4) }}>
              보통
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-dashed border-brand-success/40 bg-brand-success/20 text-[rgb(var(--brand-success-ink))]">
              <Check className="w-3 h-3 shrink-0" /> 여유
            </span>
          )}
        </div>

        {/* 잔여 수치 — 센서가 끊기면 숫자를 지어내지 않고 '—' 를 보여준다.
         * tabular-nums: 자릿수가 바뀌어도 숫자 폭이 고정돼 카운팅 중 글자가 덜컹거리지 않는다. */}
        <p
          className="font-display text-[34px] font-extrabold leading-none tabular-nums transition-colors duration-500"
          style={{ color: !live ? COLORS.mute : low ? danger : COLORS.brown }}
        >
          {live ? Math.round(shownValue) : '—'}
          {live && (
            <span className="text-lg ml-0.5 font-bold" style={{ color: low ? danger : COLORS.mute }}>{unit}</span>
          )}
        </p>
        {live && (
          <p className="text-[11px] font-bold mt-1 tabular-nums" style={{ color: COLORS.mute }}>
            {Math.round(shownPercent)}%
          </p>
        )}

        {/* 게이지 (스티치 트랙) — 폭은 rAF 가 매 프레임 갱신하므로 CSS transition 을 걸지
         * 않는다. 둘이 겹치면 애니메이션이 서로 밀려 늘어진다. 색만 전환한다. */}
        <div className="mt-auto pt-4">
          <div className="relative h-3 rounded-full overflow-hidden border border-dashed border-brand-brown/15" style={{ background: BG_INFO }}>
            <div
              className="h-full rounded-full transition-colors duration-500"
              style={{
                width: `${live ? Math.max(0, Math.min(100, shownPercent)) : 0}%`,
                background: low ? danger : accent,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ManualCard({ kind, title, unitLabel, amount, min, max, step, onChange, onSubmit, busy, button, icon, running = false, elapsed = 0, onStop, disabled = false, isToggle = false }) {
  const isWater = kind === 'water'
  const accent = isWater ? COLORS.water : COLORS.food
  const toggleActive = isToggle && amount === 'ON'
  const active = toggleActive || running
  const ratio = isToggle ? 0 : (amount - min) / (max - min)
  // 정지를 누른 직후 눌림 표시. 버튼이 사라지면 같이 정리된다.
  const [pressed, setPressed] = useState(false)
  useEffect(() => {
    if (!pressed) return undefined
    const timer = window.setTimeout(() => setPressed(false), STOP_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [pressed])
  return (
    <div
      className={`relative overflow-hidden rounded-3xl shadow-soft mt-4 px-5 py-5 transition-all duration-300 ${
        active ? 'ring-2 ring-inset' : ''
      }`}
      style={{
        backgroundColor: active ? withAlpha(accent, 0.1) : BG_CARD,
        '--tw-ring-color': active ? withAlpha(accent, 0.55) : undefined,
      }}
    >
      {active && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1.5 animate-pulse"
          style={{ background: accent }}
        />
      )}
      <Stitch />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span
              className={`w-10 h-10 rounded-full flex items-center justify-center border border-dashed border-brand-brown/20 ${
                active ? 'animate-pulse shadow-soft' : ''
              }`}
              style={{ background: active ? accent : withAlpha(accent, 0.15), color: active ? '#fff' : accent }}
            >
              {icon}
            </span>
            <div>
              <p className="text-xs text-brand-mute font-semibold">{title}</p>
              <p className="font-display text-base font-bold text-brand-brown">1회 제공량</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-extrabold border border-dashed ${
              active ? 'border-white/50 text-white shadow-soft' : 'border-brand-brown/20'
            }`}
            style={{ background: active ? accent : withAlpha(accent, 0.15), color: active ? '#fff' : accent }}
          >
            {active && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
            {active ? '작동 중' : amount}{!active && unitLabel}
          </span>
        </div>

        {!isToggle && <div className="flex items-center gap-3">
          <button
            onClick={() => onChange(Math.max(min, amount - step))}
            className="w-11 h-11 shrink-0 rounded-full text-white shadow-soft touch-active flex items-center justify-center border border-dashed border-white/30"
            style={{ background: accent }}
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
            className="felt-range flex-1 cursor-pointer"
            style={{
              color: accent,
              background: `linear-gradient(to right, ${accent} 0%, ${accent} ${ratio * 100}%, rgb(var(--brand-line)) ${ratio * 100}%, rgb(var(--brand-line)) 100%)`,
            }}
          />
          <button
            onClick={() => onChange(Math.min(max, amount + step))}
            className="w-11 h-11 shrink-0 rounded-full text-white shadow-soft touch-active flex items-center justify-center border border-dashed border-white/30"
            style={{ background: accent }}
            aria-label="증가"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>}

        {isToggle && (
          <div
            className={`rounded-2xl px-4 py-3 border border-dashed transition-colors duration-300 ${
              toggleActive ? 'border-brand-water/40' : 'border-transparent'
            }`}
            style={{ background: toggleActive ? '#fff' : withAlpha(accent, 0.1), color: accent }}
          >
            <p className="text-sm font-extrabold">
              {toggleActive ? '수동 급수 작동 중' : '수동 급수 대기 중'}
            </p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-brand-mute">
              {toggleActive ? '펌프가 계속 켜져 있어요. 끄기 전까지 급수가 유지됩니다.' : 'OFF 상태입니다. 켜면 펌프가 계속 작동해요.'}
            </p>
          </div>
        )}

        {!isToggle && running && (
          <div
            className="mt-3 rounded-2xl px-4 py-3 border border-dashed"
            style={{ background: '#fff', borderColor: withAlpha(accent, 0.4), color: accent }}
          >
            <p className="text-sm font-extrabold">수동 배식 작동 중</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-brand-mute">
              배식기가 작동 중이에요. 필요하면 아래 정지 버튼으로 멈출 수 있습니다.
            </p>
          </div>
        )}

        {/* 구동 중에는 같은 자리에서 정지 버튼이 된다 — 방금 배식을 누른 손가락이 이미 여기 있다.
         * 오거는 최대 8초라 다른 화면으로 옮겨가 찾을 시간이 없다. 평소엔 없어서 오발도 없다.
         * 확인창은 두지 않는다: 긴급인데 한 번 더 물으면 그 사이에 끝나고,
         * 잘못 눌러도 다시 배식하면 그만이라 피해가 없다. */}
        {/* 두 버튼을 같은 칸에 겹쳐두고 투명도로 교차시킨다. 조건부로 갈아끼우면
         * 하나가 사라지고 하나가 튀어나와서 뚝 끊기는 느낌이 난다. */}
        <div className="mt-4 grid">
          {/* disabled:opacity-60 을 쓰면 안 된다 — :disabled 의사클래스가 명시도가 높아
           * opacity-0 을 이겨서, 숨겨야 할 버튼이 60% 로 남아 정지 버튼과 겹쳐 보인다.
           * 투명도는 전부 여기서 직접 정한다. */}
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || running || disabled}
            className={`col-start-1 row-start-1 w-full inline-flex items-center justify-center gap-2 rounded-2xl text-white font-bold py-3.5 shadow-soft border border-dashed border-white/30 transition-all duration-300 ${
              running ? 'opacity-0 pointer-events-none' : busy || disabled ? 'opacity-60' : 'opacity-100'
            }`}
            style={{ background: accent }}
          >
            <Play className="w-4 h-4" />
            {button}
          </button>

          {/* 누르면 콱 눌리며 안쪽이 어두워지고 흰 테두리가 조여든다.
           *
           * 지난번에 아무것도 안 보였던 이유 세 가지를 전부 피한다:
           *  - 카드가 overflow-hidden 이라 밖으로 퍼지는 파형(animate-ping)은 잘린다
           *    -> ring-inset 으로 안쪽에 그린다
           *  - filter:brightness 는 링·테두리까지 같이 어둡게 만든다
           *    -> 자식으로 검은 막을 덮어 배경만 어둡게 한다
           *  - 빨강 버튼에 빨강 링은 안 보인다
           *    -> 흰색으로 그린다 */}
          <button
            type="button"
            onClick={() => {
              setPressed(true)
              onStop?.()
            }}
            aria-hidden={!running}
            className={`relative overflow-hidden col-start-1 row-start-1 w-full inline-flex items-center justify-center gap-2 rounded-2xl text-white font-extrabold py-3.5 border-2 border-dashed transition-all duration-200 ${
              running ? 'opacity-100' : 'opacity-0 pointer-events-none'
            } ${
              pressed
                ? 'scale-95 shadow-none border-white/90 ring-4 ring-inset ring-white/60'
                : 'shadow-soft border-white/40'
            }`}
            style={{ background: 'rgb(var(--brand-danger))' }}
          >
            {/* 배경만 어둡게 — 테두리/링은 밝게 남는다 */}
            <span
              aria-hidden
              className={`absolute inset-0 bg-black transition-opacity duration-200 ${
                pressed ? 'opacity-40' : 'opacity-0'
              }`}
            />
            <X className="relative w-5 h-5" />
            <span className="relative">정지</span>
            <span className="relative text-sm font-bold tabular-nums opacity-90">{Math.floor(elapsed)}초</span>
          </button>
        </div>
      </div>
    </div>
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

/* 스케줄 추가/수정 — 풀스크린 페이지(아래에서 위로 꽉 차게 슬라이딩) */
/* 펠트 탄색 라벨 칩 (종류·시간·급여량) */
function FeltLabel({ children, icon, className = '' }) {
  return (
    <span
      className={`mt-4 inline-flex items-center gap-1 rounded-lg border border-dashed border-brand-brown/25 px-2.5 py-1 text-xs font-extrabold text-brand-brown ${className}`}
      style={{ backgroundColor: BG_INFO }}
    >
      {icon}
      {children}
    </span>
  )
}

/* 사료는 양(g), 물은 시간(초). 물통이 저수조 겸 음수대라 펌프를 돌려도 물이 통 밖으로
 * 나가지 않아(순환) 'ml 급수'가 성립하지 않는다. 수동 급수와 같은 눈금을 쓴다.
 * 물의 상한 90초는 펌웨어가 자르는 값(WATER_PUMP_MAX_RUN_MS)과 맞춘 것이다. */
const SCHEDULE_RANGE = {
  food: { min: 5, max: 50, step: 5, unit: 'g', def: 25 },
  water: { min: 30, max: 90, step: 5, unit: '초', def: 60 },
}

function ScheduleModal({ initial, onClose, onSave }) {
  const isEdit = initial.id != null
  const [time, setTime] = useState(initial.time)
  const [type, setType] = useState(initial.type)
  // 사료(g)와 물(초)은 서로 다른 값이다. 종류를 오가도 각자 값을 그대로 들고 있어야
  // 사료 30g 보다가 물 봤다가 돌아왔을 때 30g 이 살아있다. 편집 중인 종류만 저장값을
  // 쓰고, 반대쪽은 기본값(사료 25g / 물 60초)으로 시작한다.
  const [amounts, setAmounts] = useState(() => {
    const next = { food: SCHEDULE_RANGE.food.def, water: SCHEDULE_RANGE.water.def }
    const t = SCHEDULE_RANGE[initial.type] ? initial.type : 'food'
    const r = SCHEDULE_RANGE[t]
    // 예전에 ml(5~50)로 저장된 물 스케줄을 열어도 슬라이더가 어긋나지 않게 범위로 clamp
    next[t] = Math.min(Math.max(Number(initial.amount) || r.def, r.min), r.max)
    return next
  })
  const amount = amounts[type] ?? SCHEDULE_RANGE.food.def
  // useState 처럼 값/함수 둘 다 받는다 (+/- 버튼은 함수형, 슬라이더는 값)
  const setAmount = (next) =>
    setAmounts((prev) => ({
      ...prev,
      [type]: typeof next === 'function' ? next(prev[type]) : next,
    }))
  const [show, setShow] = useState(false) // 슬라이드 인/아웃 제어

  // 마운트 직후 풀스크린으로 슬라이드 업
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
  const { min, max, step, unit } = SCHEDULE_RANGE[type] ?? SCHEDULE_RANGE.food
  const accent = isFood ? COLORS.food : COLORS.water
  const ratio = (Number(amount) - min) / (max - min)

  // 종류만 바꾼다. 양은 amounts 가 종류별로 따로 들고 있어서 clamp 할 필요가 없다 —
  // 여기서 값을 옮기면 반대쪽에 있던 값을 덮어써버린다.
  const switchType = (next) => setType(next)

  const submit = (e) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!time || !amt || amt <= 0) return
    dismiss(() => onSave({ id: initial.id, time, type, amount: amt }))
  }

  const segBase = 'inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-base font-extrabold border-2 border-dashed transition-colors touch-active'
  const segOn = (c) => ({ background: c, color: '#fff', borderColor: 'rgba(255,255,255,0.45)' })
  const segOff = { background: BG_INFO, color: COLORS.brown, borderColor: 'rgb(var(--brand-brown) / 0.2)' }
  const circleBtn = 'w-10 h-10 rounded-full border-2 border-dashed border-brand-brown/20 shadow-soft flex items-center justify-center shrink-0 text-brand-brown touch-active'

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:pb-6" onClick={() => dismiss(onClose)}>
      {/* 딤 + 블러 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: show ? 1 : 0 }}
      />

      {/* 바텀 시트 — 하단에 가로로 꽉 차게 붙어 아래에서 위로 슬라이드 업 */}
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] max-h-[90dvh] overflow-y-auto rounded-t-[28px] sm:rounded-b-[28px] px-6 pt-3 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{
          backgroundColor: BG_CARD,
          transform: show ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
        }}
      >
        <Stitch className="!inset-[8px] !rounded-[22px]" />
        <div className="relative">
          {/* 잡이 핸들 */}
          <div className="mx-auto w-10 h-1.5 rounded-full bg-brand-line mb-2" />

          {/* 제목 + 닫기 */}
          <div className="relative flex items-center justify-center">
            <h3 className="font-display text-xl font-extrabold text-brand-brown">{isEdit ? '스케줄 수정' : '스케줄 추가'}</h3>
            <button type="button" onClick={() => dismiss(onClose)} aria-label="닫기" className="absolute right-0 text-brand-mute touch-active"><X className="w-5 h-5" /></button>
          </div>

          {/* 종류 */}
          <div><FeltLabel className="!mt-3">종류</FeltLabel></div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => switchType('food')} className={segBase} style={isFood ? segOn(COLORS.food) : segOff}>
              <UtensilsCrossed className="w-5 h-5" /> 사료
            </button>
            <button type="button" onClick={() => switchType('water')} className={segBase} style={!isFood ? segOn(COLORS.water) : segOff}>
              <Droplets className="w-5 h-5" /> 물
            </button>
          </div>

          {/* 시간 (시/분 휠) */}
          <div><FeltLabel className="!mt-3" icon={<Clock className="w-3.5 h-3.5" />}>시간</FeltLabel></div>
          <div className="mt-2 rounded-2xl p-1.5 border-2 border-dashed border-brand-brown/15" style={{ background: BG_INFO }}>
            <TimeWheel value={time} onChange={setTime} visibleRows={3} />
          </div>

          {/* 급여량/급수 시간 (슬라이드 막대) */}
          <div className="mt-3 flex items-center justify-between">
            <FeltLabel className="!mt-0">{isFood ? '급여량' : '급수 시간'}</FeltLabel>
            <span className="px-3 py-1 rounded-full text-sm font-extrabold text-white border border-dashed border-white/40" style={{ background: accent }}>
              {amount}{unit}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <button type="button" onClick={() => setAmount((a) => Math.max(min, Number(a) - step))} className={circleBtn} style={{ background: BG_INFO }}><Minus className="w-5 h-5" /></button>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label={isFood ? '급여량' : '급수 시간'}
              className="felt-range flex-1 cursor-pointer"
              style={{
                color: accent,
                background: `linear-gradient(to right, ${accent} 0%, ${accent} ${ratio * 100}%, rgb(var(--brand-line)) ${ratio * 100}%, rgb(var(--brand-line)) 100%)`,
              }}
            />
            <button type="button" onClick={() => setAmount((a) => Math.min(max, Number(a) + step))} className={circleBtn} style={{ background: BG_INFO }}><Plus className="w-5 h-5" /></button>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-dashed border-brand-brown/15 text-brand-mute" style={{ background: BG_INFO }}>{min}{unit}</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-dashed border-brand-brown/15 text-brand-mute" style={{ background: BG_INFO }}>{max}{unit}</span>
          </div>

          {/* 취소 / 추가 */}
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => dismiss(onClose)} className="flex-1 rounded-2xl py-3 text-base font-extrabold border-2 border-dashed border-brand-brown/20 text-brand-brown touch-active" style={{ background: BG_INFO }}>취소</button>
            <button type="submit" className="flex-1 rounded-2xl py-3 text-base font-extrabold text-white border-2 border-dashed border-white/40 shadow-soft touch-active" style={{ background: accent }}>{isEdit ? '저장' : '추가'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default Dispenser
