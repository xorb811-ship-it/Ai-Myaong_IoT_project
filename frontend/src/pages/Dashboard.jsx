import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../api/api";
import { getWebSocketUrl } from "../lib/backendUrls";

import {
  Wifi,
  Bell,
  PhoneCall,
  Camera,
  PawPrint,
  AlertTriangle,
  UtensilsCrossed,
  UserX,
  Plane,
  ChevronRight,
  Footprints,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Card, CreamCard, PageHeader, Badge } from "../components/ui";
import { useAccount, petAgeLabel, speciesLabel, addPet, getAccount, saveAccount } from "../lib/accountRepository";
import { AddPetModal } from "../components/AddPetModal";
import { useNotifications, addNotification } from "../lib/notificationRepository";
import { useFeedSettings } from "../lib/dispenserSettings";
import { toApiPet, fromApiPet } from "../lib/petMap";

const RECENT = [
  {
    id: 1,
    icon: UtensilsCrossed,
    tone: "primary",
    title: "자동 배식 완료",
    desc: "15g · 정기 스케줄",
    time: "방금 전",
  },
  {
    id: 2,
    icon: AlertTriangle,
    tone: "warn",
    title: "이상 행동 감지",
    desc: "거실 카메라",
    time: "12분 전",
  },
  {
    id: 3,
    icon: UserX,
    tone: "danger",
    title: "외부인 감지",
    desc: "현관 카메라",
    time: "1시간 전",
  },
  {
    id: 4,
    icon: PawPrint,
    tone: "brown",
    title: "발자국 활동 기록",
    desc: "12회",
    time: "오늘",
  },
];

const TONE = {
  primary: "bg-brand-primary/15 text-brand-primary",
  warn: "bg-brand-warning/20 text-[#A06B1A]",
  danger: "bg-brand-danger/15 text-brand-danger",
  brown: "bg-brand-brown/10 text-brand-brown",
};

const SHORTCUTS = [
  {
    id: "feed",
    label: "빠른 배식",
    icon: UtensilsCrossed,
    tone: "bg-brand-primary text-white",
  },
  {
    id: "away",
    label: "외출 모드",
    icon: Plane,
    tone: "bg-brand-cream text-brand-brown",
  },
  {
    id: "call",
    label: "음성 호출",
    icon: PhoneCall,
    tone: "bg-brand-cream text-brand-brown",
  },
  {
    id: "cap",
    label: "캡처",
    icon: Camera,
    tone: "bg-brand-cream text-brand-brown",
  },
];

/* 최근 N개월 활동량(발자국) — 현재 달이 오른쪽 끝, "N월" 라벨 */
function buildMonthlyActivity(count = 12) {
  const now = new Date();
  const arr = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const seed = d.getFullYear() * 12 + m;
    const value = 1300 + Math.round(Math.sin(seed) * 250) + (m % 4) * 80;
    arr.push({ label: `${m}월`, value });
  }
  return arr;
}

/* 펫 활동량(발자국 수) — 일/주/월. 백엔드 붙으면 API 로 교체 */
const ACTIVITY = {
  day: [
    { label: "아침", value: 32 },
    { label: "낮", value: 58 },
    { label: "오후", value: 45 },
    { label: "저녁", value: 70 },
    { label: "밤", value: 16 },
  ],
  week: [
    { label: "월", value: 240 },
    { label: "화", value: 310 },
    { label: "수", value: 280 },
    { label: "목", value: 330 },
    { label: "금", value: 300 },
    { label: "토", value: 380 },
    { label: "일", value: 420 },
  ],
  month: buildMonthlyActivity(12),
};
const ACT_PRIMARY = "#F08D86";
const actTooltip = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid #EFE3D2",
    fontSize: 12,
    fontWeight: 700,
    color: "#4B3621",
  },
  labelStyle: { color: "#9C8A78", fontWeight: 700 },
};

/* 활동량 영역 차트 (일/주/월 공용) */
function ActivityArea({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACT_PRIMARY} stopOpacity={0.32} />
            <stop offset="100%" stopColor={ACT_PRIMARY} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#EFE3D2" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9C8A78" }} axisLine={false} tickLine={false} />
        <Tooltip {...actTooltip} formatter={(v) => [`${v}회`, "발자국"]} cursor={{ stroke: ACT_PRIMARY, strokeOpacity: 0.3 }} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={ACT_PRIMARY}
          strokeWidth={2.5}
          fill="url(#actFill)"
          dot={{ r: 3, fill: ACT_PRIMARY, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          animationDuration={500}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { isConnected } = useWebSocket(getWebSocketUrl());
  const account = useAccount();
  const notifications = useNotifications();
  const unread = notifications.filter((n) => !n.read).length;
  const feed = useFeedSettings(); // 디스펜서에서 설정한 1회 제공량 공유

  // 실시간 캠 스트림 (RobotVision 과 동일한 소스 재사용 · 프론트만)
  const [streamUrl, setStreamUrl] = useState("");
  const [streamFailed, setStreamFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getStreamUrl()
      .then((data) => {
        if (alive) {
          setStreamUrl(data.url || "");
          setStreamFailed(false);
        }
      })
      .catch(() => {
        if (alive) setStreamFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const showLive = streamUrl && !streamFailed;

  // 가입/로그인 데이터 기반 값 (가짜 하드코딩 없음)
  const nickname = account?.user?.nickname || "집사";
  const pets = account?.pets ?? [];
  const pet = pets[0] || null;
  // 아래 값들은 펫 카드가 pet 있을 때만 렌더되므로 가짜 fallback 불필요
  const petName = pet?.name || "";
  const petBreed = pet?.breed || "";
  const petSpecies = pet ? speciesLabel(pet.species) : "";
  const ageLabel = pet ? petAgeLabel(pet.birthDate) : "";
  const ageBreed = [ageLabel, petBreed].filter(Boolean).join(" · ");

  // 펫 등록 (없을 때 바로 등록) — DB 반영 + 로컬 동기화
  const [showRegister, setShowRegister] = useState(false);
  const handleRegister = async (newPet) => {
    setShowRegister(false);
    let saved = newPet;
    try {
      const r = await api.createPet(toApiPet(newPet)); // DB 저장 → pet_id 반환
      saved = fromApiPet(r, newPet.photo);
    } catch {
      /* 백엔드 미연결 → 로컬만 */
    }
    if (!getAccount()) {
      saveAccount({
        provider: "guest",
        user: { userId: "guest", nickname },
        pets: [saved],
        createdAt: new Date().toISOString(),
      });
    } else {
      addPet(saved);
    }
    showToast(`🐾 ${saved.name || "반려동물"} 등록 완료`);
  };

  // 활동량 통계 (일/주/월)
  const [actPeriod, setActPeriod] = useState("day");
  const actData = ACTIVITY[actPeriod];
  const actTotal = actData.reduce((s, d) => s + d.value, 0);
  const actAvg = Math.round(actTotal / actData.length);
  const actAvgLabel =
    actPeriod === "day" ? "시간대 평균" : actPeriod === "week" ? "일 평균" : "월 평균";

  // 월간 차트: 진입 시 최신(현재 달, 오른쪽 끝)으로 스크롤
  const monthScrollRef = useRef(null);
  const monthDrag = useRef(null);
  useEffect(() => {
    if (actPeriod === "month" && monthScrollRef.current) {
      monthScrollRef.current.scrollLeft = monthScrollRef.current.scrollWidth;
    }
  }, [actPeriod]);

  // 마우스 휠 → 가로 스크롤
  const onMonthWheel = (e) => {
    const el = monthScrollRef.current;
    if (!el) return;
    const delta = e.deltaY || e.deltaX;
    if (delta) el.scrollLeft += delta;
  };
  // 마우스로 잡고 좌우 드래그 (터치는 네이티브 스크롤 유지)
  const onMonthDown = (e) => {
    if (e.pointerType === "touch") return;
    const el = monthScrollRef.current;
    if (!el) return;
    monthDrag.current = { x: e.clientX, left: el.scrollLeft };
    el.setPointerCapture?.(e.pointerId);
  };
  const onMonthMove = (e) => {
    if (!monthDrag.current) return;
    const el = monthScrollRef.current;
    if (el) el.scrollLeft = monthDrag.current.left - (e.clientX - monthDrag.current.x);
  };
  const onMonthUp = (e) => {
    if (!monthDrag.current) return;
    monthDrag.current = null;
    monthScrollRef.current?.releasePointerCapture?.(e.pointerId);
  };

  // 외출 모드 (백엔드 전까지 프론트 localStorage 로 유지)
  const AWAY_KEY = "aimyaong:awayMode";
  const [awayMode, setAwayMode] = useState(() => {
    try {
      return localStorage.getItem(AWAY_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [busyId, setBusyId] = useState(null);

  // 토스트
  const [toast, setToast] = useState(null);
  const [toastOn, setToastOn] = useState(false);
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    requestAnimationFrame(() => setToastOn(true));
    toastTimer.current = setTimeout(() => {
      setToastOn(false);
      setTimeout(() => setToast(null), 300);
    }, 2200);
  };

  // 외출 모드 토글 (즉시 반영 + 서버 동기화 시도 · 실패해도 프론트는 동작)
  const toggleAway = () => {
    const next = !awayMode;
    setAwayMode(next);
    try {
      localStorage.setItem(AWAY_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    showToast(next ? "✈️ 외출 모드를 켰어요" : "🏠 외출 모드를 껐어요");
    api.setAwayMode(next).catch(() => {
      /* 백엔드 미구현 — 프론트 상태만 유지 */
    });
  };

  // 단축 작업 핸들러 (백엔드 있으면 실연결, 없으면 안내)
  const handleShortcut = async (id) => {
    if (id === "away") return toggleAway();
    if (busyId) return;
    setBusyId(id);
    try {
      if (id === "feed") {
        await api.dispenserFeed(feed.food);
        showToast(`🍚 사료 ${feed.food}g를 배식했어요`);
        addNotification({
          type: "feed",
          title: "빠른 배식",
          desc: `사료 ${feed.food}g을 배식했어요`,
          link: "/feeding",
        });
      } else if (id === "call") {
        await api.voiceCall();
        showToast("📞 음성 호출을 시작했어요");
      } else if (id === "cap") {
        await api.captureSnapshot();
        showToast("📸 화면을 캡처했어요");
      }
    } catch {
      // 서버 미연결/미구현
      const msg = {
        feed: "배식 실패 — 기기 연결을 확인해 주세요",
        call: "음성 호출은 곧 지원돼요 (기기 연동 준비 중)",
        cap: "캡처는 곧 지원돼요 (기기 연동 준비 중)",
      }[id];
      showToast(msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-5 pb-6">
      <PageHeader
        title={`안녕하세요, ${nickname}님! 🐾`}
        subtitle="오늘도 우리 아이를 살펴봐요"
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/notifications")}
              className="relative w-11 h-11 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active"
              aria-label="알림"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-danger text-white text-[10px] font-bold flex items-center justify-center border-2 border-brand-bg">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="w-11 h-11 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active"
              aria-label="설정"
            >
              <Wifi
                className={`w-5 h-5 ${isConnected ? "text-brand-success" : "text-brand-danger"}`}
              />
            </button>
          </div>
        }
      />

      {/* 1) 펫 프로필 — 등록된 펫 있으면 카드, 없으면 귀여운 빈 상태 */}
      {pet ? (
        <button
          type="button"
          data-tour="dash-pet"
          onClick={() => navigate("/pet/0")}
          className="w-full text-left touch-active"
        >
          <Card className="paw-watermark px-5 py-5 flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-brand-cream flex items-center justify-center shadow-soft-inset overflow-hidden">
                {pet.photo ? (
                  <img src={pet.photo} alt={petName} className="w-full h-full object-cover" />
                ) : (
                  <PawPrint className="w-9 h-9 text-brand-primary" />
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-brand-success border-2 border-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-brand-mute font-semibold">우리집 {petSpecies}</p>
              <h2 className="font-display text-2xl font-bold text-brand-brown leading-tight">
                {petName}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ageBreed && <Badge tone="brown">{ageBreed}</Badge>}
                <Badge tone="success">건강 양호</Badge>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-brand-mute shrink-0" />
          </Card>
        </button>
      ) : (
        <Card data-tour="dash-pet" className="paw-watermark px-5 py-6 text-center">
          <span className="mx-auto w-16 h-16 rounded-full bg-brand-cream flex items-center justify-center mb-3">
            <PawPrint className="w-8 h-8 text-brand-primary/70" />
          </span>
          <p className="font-display text-lg font-bold text-brand-brown">
            아직 등록된 반려동물이 없어요
          </p>
          <p className="text-sm text-brand-mute mt-1">
            우리 아이를 등록하고 건강을 관리해 보세요 🐾
          </p>
          <button
            type="button"
            onClick={() => setShowRegister(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-brand-primary text-white font-bold px-5 py-2.5 shadow-soft touch-active"
          >
            <PawPrint className="w-4 h-4" /> 반려동물 등록하기
          </button>
        </Card>
      )}

      {/* 2) 캠 미리보기 (탭하면 /vision 이동) */}
      <button
        type="button"
        data-tour="dash-cam"
        onClick={() => navigate("/vision")}
        className="mt-4 w-full text-left touch-active"
      >
        <Card className="overflow-hidden">
          <div className="relative aspect-video bg-gradient-to-br from-brand-brown to-brand-brown-soft">
            {showLive ? (
              <img
                src={streamUrl}
                alt="실시간 캠"
                onError={() => setStreamFailed(true)}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/85">
                <div className="text-center">
                  <Camera className="w-10 h-10 mx-auto mb-2 opacity-90" />
                  <p className="text-sm font-semibold">
                    {streamFailed ? "캠 연결 대기 중" : "실시간 캠 보기"}
                  </p>
                  <p className="text-xs opacity-75">탭하여 로봇 비전으로 이동</p>
                </div>
              </div>
            )}
            <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45 text-white text-[11px] font-bold">
              <span
                className={`w-2 h-2 rounded-full ${showLive ? "bg-red-400 animate-pulse" : "bg-white/50"}`}
              />
              {showLive ? "LIVE" : "OFF"}
            </span>
            <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-white/85 text-brand-brown text-[11px] font-bold">
              HD
            </span>
          </div>
        </Card>
      </button>

      {/* 3) 숏컷 (Grid) */}
      <section className="mt-5" data-tour="dash-shortcuts">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-3">
          빠른 작업
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {SHORTCUTS.map(({ id, label, icon: Icon, tone }) => {
            const active = id === "away" && awayMode;
            const isBusy = busyId === id;
            const toneCls = active ? "bg-brand-primary text-white" : tone;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleShortcut(id)}
                disabled={isBusy}
                className="flex flex-col items-center gap-2 touch-active disabled:opacity-60"
              >
                <span
                  className={`w-14 h-14 rounded-3xl flex items-center justify-center shadow-soft transition-colors ${toneCls} ${isBusy ? "animate-pulse" : ""}`}
                >
                  <Icon className="w-6 h-6" />
                </span>
                <span className="text-[11px] font-semibold text-brand-brown text-center leading-tight">
                  {id === "away" ? (awayMode ? "외출 모드 ON" : "외출 모드") : label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4) 최근 활동 */}
      <section className="mt-6">
        <div className="flex items-center justify-between px-1 mb-3">
          <h3 className="font-display text-base font-bold text-brand-brown">
            최근 활동
          </h3>
          <button
            type="button"
            onClick={() => navigate("/activity")}
            className="text-xs text-brand-mute font-semibold flex items-center touch-active"
          >
            전체보기 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <CreamCard className="divide-y divide-brand-line">
          {RECENT.map(({ id, icon: Icon, tone, title, desc, time }) => (
            <div key={id} className="flex items-center gap-3 px-4 py-3.5">
              <span
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${TONE[tone]}`}
              >
                <Icon className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-brand-brown truncate">
                  {title}
                </p>
                <p className="text-xs text-brand-mute truncate">{desc}</p>
              </div>
              <span className="text-[11px] text-brand-mute shrink-0">
                {time}
              </span>
            </div>
          ))}
        </CreamCard>
      </section>

      {/* 5) 펫 활동량 통계 (일/주/월) */}
      <section className="mt-6">
        <Card className="px-5 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center">
                <Footprints className="w-5 h-5" />
              </span>
              <div>
                <p className="font-display text-base font-bold text-brand-brown leading-tight">
                  활동량
                </p>
                <p className="text-[11px] text-brand-mute">우리 아이 발자국 🐾</p>
              </div>
            </div>
            {/* 일/주/월 탭 */}
            <div className="inline-flex bg-brand-cream rounded-full p-1 shadow-soft-inset">
              {[
                ["day", "일간"],
                ["week", "주간"],
                ["month", "월간"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActPeriod(id)}
                  className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                    actPeriod === id ? "bg-brand-primary text-white shadow-soft" : "text-brand-mute"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 영역(라인) 차트 — 월간은 가로 스크롤 */}
          {actPeriod === "month" ? (
            <div
              ref={monthScrollRef}
              onWheel={onMonthWheel}
              onPointerDown={onMonthDown}
              onPointerMove={onMonthMove}
              onPointerUp={onMonthUp}
              onPointerCancel={onMonthUp}
              tabIndex={-1}
              className="mt-4 overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing select-none outline-none focus:outline-none"
            >
              <div style={{ width: Math.max(actData.length * 52, 320), height: 160 }}>
                <ActivityArea data={actData} />
              </div>
            </div>
          ) : (
            <div key={actPeriod} className="page-enter mt-4" style={{ width: "100%", height: 160 }}>
              <ActivityArea data={actData} />
            </div>
          )}

          {/* 요약 */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-brand-cream px-4 py-3">
              <p className="text-[11px] font-semibold text-brand-mute">총 발자국 🐾</p>
              <p className="font-display text-lg font-bold text-brand-brown leading-none mt-1">
                {actTotal.toLocaleString()}회
              </p>
            </div>
            <div className="rounded-2xl bg-brand-cream px-4 py-3">
              <p className="text-[11px] font-semibold text-brand-mute">{actAvgLabel}</p>
              <p className="font-display text-lg font-bold text-brand-brown leading-none mt-1">
                {actAvg.toLocaleString()}회
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed left-1/2 bottom-24 z-50 px-5 py-3 rounded-2xl shadow-soft-lg text-sm font-bold text-white"
          style={{
            transform: `translateX(-50%) translateY(${toastOn ? "0" : "10px"})`,
            opacity: toastOn ? 1 : 0,
            transition: "all 250ms ease",
            background: "#4B3621",
            maxWidth: "88%",
          }}
        >
          {toast}
        </div>
      )}

      {/* 반려동물 등록 모달 */}
      {showRegister && (
        <AddPetModal
          title="반려동물 등록"
          submitLabel="등록"
          onClose={() => setShowRegister(false)}
          onSave={handleRegister}
        />
      )}
    </div>
  );
}

export default Dashboard;
