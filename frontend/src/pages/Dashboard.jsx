import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../api/api";
import { getWebSocketUrl } from "../lib/backendUrls";

import {
  Wifi,
  WifiOff,
  Bell,
  Camera,
  Video,
  UserX,
  PawPrint,
  UtensilsCrossed,
  Droplets,
  Plane,
  ChevronRight,
  ChevronDown,
  Footprints,
  Activity,
  Sparkles,
  X,
  Maximize2,
  Trash2,
  HeartPulse,
  AlertTriangle,
  ShieldAlert,
  Calendar,
  Scale,
  Dog,
  Cake,
} from '../components/icons';
import {
  AreaChart, Area, XAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Card, CreamCard, PageHeader, Badge } from "../components/ui";
import { useAccount, petAgeLabel, speciesLabel, addPet, getAccount, saveAccount } from "../lib/accountRepository";
import { AddPetModal } from "../components/AddPetModal";
import { useNotifications, unreadCount, timeAgo, addNotification } from "../lib/notificationRepository";
import { useFeedSettings } from "../lib/dispenserSettings";
import { toApiPet, fromApiPet } from "../lib/petMap";
import { mapVisionEventForList } from "../lib/visionEventMapper";

// 최근 활동 = DB(feed_logs/water_logs)의 배식·급수 기록을 최근순으로 표시 (mock 제거)

const TONE = {
  primary: "bg-brand-primary/15 text-brand-primary",
  warn: "bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))]",
  danger: "bg-brand-danger/15 text-brand-danger",
  brown: "bg-brand-brown/10 text-brand-brown",
};

const EVENT_ICON = {
  away_person: UserX,
  fall_detected: UserX,
  no_motion: UserX,
  no_motion_warning: UserX,
  no_motion_emergency: UserX,
  seizure_suspected: UserX,
  capture_saved: Camera,
  clip_saved: Video,
};

const FEED_TYPE_LABEL = {
  quick: "빠른 배식",
  manual: "수동 배식",
  auto: "자동 배식",
};

const WATER_TYPE_LABEL = {
  manual: "수동 급수",
  auto: "자동 급수",
};

// AI 리포트 risk_level → 펫 카드 건강 상태 배지
const HEALTH_STATUS = {
  low: { label: "건강 양호", tone: "success", Icon: HeartPulse },
  medium: { label: "주의 필요", tone: "warn", Icon: AlertTriangle },
  high: { label: "건강 경고", tone: "danger", Icon: ShieldAlert },
};
const DEFAULT_HEALTH = { label: "분석 전", tone: "brown", Icon: Sparkles };

// 카드 배경: 흰색 80% + 크림 20% (대시보드·마이페이지 공통) / 정보·칩: 따뜻한 탄
const BG_CARD = "color-mix(in srgb, rgb(var(--brand-card)) 80%, rgb(var(--brand-cream)) 20%)";
const BG_INFO = "color-mix(in srgb, rgb(var(--brand-cream)) 78%, rgb(var(--brand-mute)) 22%)";

/* 안쪽 점선 바느질 테두리 (펠트 느낌) */
function Stitch({ className = "" }) {
  return (
    <span className={`pointer-events-none absolute inset-[6px] rounded-[18px] border border-dashed border-brand-brown/15 ${className}`} />
  );
}

const SHORTCUTS = [
  {
    id: "feed",
    label: "빠른 배식",
    icon: UtensilsCrossed,
    tone: "bg-brand-primary text-white border-white/30",
  },
  {
    id: "away",
    label: "외출 모드",
    icon: Plane,
    tone: "bg-brand-cream text-brand-brown border-brand-brown/15",
  },
  {
    id: "abnormal",
    label: "이상 행동 감지",
    icon: ShieldAlert,
    tone: "bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))] border-[rgb(var(--brand-warning-ink)/0.3)]",
  },
  // 디스펜서 긴급 정지 — 사료 오거는 최대 8초 돌기 때문에 디스펜서 화면까지 이동할
  // 시간이 없다. 여기서 바로 멈출 수 있어야 한다. 구동 중이 아니면 눌러도 무해하다.
  {
    id: "dispenser-stop",
    label: "디스펜서 정지",
    icon: X,
    tone: "bg-brand-danger/15 text-brand-danger border-brand-danger/40",
  },
];

const ACT_PRIMARY = "#F08D86";
const ACTIVITY_STATUS_TONE = {
  NO_MOTION: "text-brand-mute",
  LOW: "text-[rgb(var(--brand-warning-ink))]",
  NORMAL: "text-brand-primary",
  ACTIVE: "text-brand-danger",
  NO_DATA: "text-brand-mute",
};

function ActivityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-brand-line bg-brand-card px-3 py-2 shadow-soft">
      <p className="text-xs font-bold text-brand-mute">{label}</p>
      {point?.value == null ? (
        <p className="mt-1 text-xs font-bold text-brand-brown">데이터 없음</p>
      ) : (
        <>
          <p className="mt-1 text-xs font-bold text-brand-brown">
            활동량: {point.value}%
          </p>
          <p className="text-[11px] font-semibold text-brand-mute">
            상태: {point.statusLabel}
          </p>
        </>
      )}
    </div>
  );
}

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
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#EFE3D2"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#9C8A78" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<ActivityTooltip />}
          cursor={{ stroke: ACT_PRIMARY, strokeOpacity: 0.3 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          connectNulls={false}
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

/* 종이질감 장식 아이콘 — 아이콘 실루엣(public/icons/*.svg)을 마스크로 써서
 * paper.jpg 텍스처를 그 모양 "안에만" 보이게 한다. (painted-on-paper 느낌)
 * 아이콘 출처: Phosphor Icons (MIT) — public/icons/{paw,bone,heart}.svg */
function PaperIcon({ shape, color, className = "", opacity = 1 }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none ${className}`}
      style={{
        backgroundColor: color,
        backgroundImage: "url(/paper.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundBlendMode: "multiply",
        WebkitMaskImage: `url(/icons/${shape}.svg)`,
        maskImage: `url(/icons/${shape}.svg)`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        opacity,
      }}
    />
  );
}

function ActivityCriterion({ color, label }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { isConnected } = useWebSocket(getWebSocketUrl());
  const account = useAccount();
  const notifications = useNotifications();
  const unread = unreadCount(notifications);
  const [visionEvents, setVisionEvents] = useState([]);
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const feed = useFeedSettings(); // 디스펜서에서 설정한 1회 제공량 공유

  // 최근 활동 = DB(배식/급수 기록)에서 최근순으로
  const [recentLogs, setRecentLogs] = useState({ feed: [], water: [] });
  const refreshLogs = useCallback(
    () =>
      api
        .getDispenserLogs()
        .then((d) => setRecentLogs({ feed: d.feed || [], water: d.water || [] }))
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    refreshLogs();
    const timer = window.setInterval(refreshLogs, 3000);
    return () => window.clearInterval(timer);
  }, [refreshLogs]);

  const recentActivity = useMemo(() => {
    // 0g 행은 자동 배식 스케줄러가 남기는 '이 분에 이미 배식함' 잠금 기록이라 보여줄 게 없다.
    // 실제 배식량은 ESP32 가 저울로 잰 값이 별도 행으로 들어온다. (물 0ml 도 같은 이유)
    const feed = (recentLogs.feed || [])
      .filter((x) => (Number(x.amount_g) || 0) > 0)
      .map((x) => ({
        key: `f-${x.created_at}-${x.amount_g}`,
        icon: UtensilsCrossed,
        tone: "primary",
        title: FEED_TYPE_LABEL[x.feed_type] || "배식 완료",
        desc: `사료 ${Math.round(Number(x.amount_g) || 0)}g`,
        t: new Date(x.created_at).getTime(),
      }));
    // 0ml 행은 자동 급수 스케줄러가 '이 분에 이미 급수했다'를 표시하려고 남기는 잠금 기록이다.
    // 물통이 저수조 겸 음수대라 펌프를 돌려도 물이 통에서 줄지 않아 급수량 ml 이 없다.
    // 활동 기록에 "물 0ml" 로 띄울 내용이 아니라 걸러낸다. (실제 마신 양은 water_type='consumed')
    const water = (recentLogs.water || [])
      .filter((x) => (Number(x.amount_ml) || 0) > 0)
      .map((x) => ({
        key: `w-${x.created_at}-${x.amount_ml}`,
        icon: Droplets,
        tone: "brown",
        title: WATER_TYPE_LABEL[x.water_type] || "급수 완료",
        desc: `물 ${Math.round(Number(x.amount_ml) || 0)}ml`,
        t: new Date(x.created_at).getTime(),
      }));
    return [...feed, ...water]
      .sort((a, b) => b.t - a.t)
      .slice(0, 30)
      .map((x) => ({ ...x, time: timeAgo(new Date(x.t).toISOString()) }));
  }, [recentLogs]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .getVisionEvents(8)
        .then((data) => {
          if (!alive) return;
          const events = data.events || [];
          setVisionEvents(events);
        })
        .catch(() => {
          if (alive) setVisionEvents([]);
        });
    };

    load();
    const timer = window.setInterval(load, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const recentItems = useMemo(() => {
    const vision = (visionEvents || []).map((event) => {
      const item = mapVisionEventForList(event);
      return {
        ...item,
        key: item.id,
        t: new Date(item.rawTime).getTime(),
      };
    });

    return [...vision, ...recentActivity]
      .sort((a, b) => (b.t || 0) - (a.t || 0))
      .slice(0, 30);
  }, [visionEvents, recentActivity]);
  const visibleRecentItems = useMemo(() => recentItems.slice(0, 5), [recentItems]);

  const deleteRecentVisionEvent = async (item) => {
    if (!item?.eventId) return;
    try {
      await api.deleteAlert(item.eventId);
      setVisionEvents((events) => events.filter((event) => event.id !== item.eventId));
    } catch (error) {
      console.error("[Dashboard] delete recent event failed:", error);
    }
  };

  // 가입/로그인 데이터 기반 값 (가짜 하드코딩 없음)
  const nickname = account?.user?.nickname || "집사";
  const pets = account?.pets ?? [];
  const pet = pets[0] || null;
  // 아래 값들은 펫 카드가 pet 있을 때만 렌더되므로 가짜 fallback 불필요
  const petName = pet?.name || "";
  const petBreed = pet?.breed || "";
  const petSpecies = pet ? speciesLabel(pet.species) : "";
  const ageLabel = pet ? (pet.age !== "" && pet.age != null ? `${pet.age}살` : petAgeLabel(pet.birthDate)) : "";

  // AI 리포트 최신 위험도 → 건강 상태 배지 (하드코딩 제거)
  const [healthRisk, setHealthRisk] = useState(null);
  useEffect(() => {
    const pid = pet?.pet_id;
    if (!pid) {
      setHealthRisk(null);
      return;
    }
    let alive = true;
    api
      .getLatestHealthReport(pid)
      .then((d) => {
        if (alive) setHealthRisk(d?.risk_level || null);
      })
      .catch(() => {
        if (alive) setHealthRisk(null);
      });
    return () => {
      alive = false;
    };
  }, [pet?.pet_id]);
  const health = HEALTH_STATUS[healthRisk] || DEFAULT_HEALTH;

  // 펫 등록 (없을 때 바로 등록) — DB 반영 + 로컬 동기화
  const [showRegister, setShowRegister] = useState(false);
  const handleRegister = async (newPet) => {
    setShowRegister(false);
    const { photoFile, ...localPet } = newPet;
    let saved = localPet;
    try {
      const r = await api.createPet(toApiPet(newPet)); // DB 저장 → pet_id 반환
      saved = fromApiPet(r, newPet.photo);
      if (photoFile) {
        const photoResult = await api.uploadPetPhoto(r.pet_id, photoFile);
        saved = fromApiPet(photoResult, newPet.photo);
      }
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
  const [activityMonth, setActivityMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [activityStats, setActivityStats] = useState(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityCriteriaOpen, setActivityCriteriaOpen] = useState(false);
  const currentActivityMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const activityMonthLabel = useMemo(() => {
    const [year, month] = activityMonth.split("-");
    return `${year}년 ${Number(month)}월`;
  }, [activityMonth]);
  const canNextActivityMonth = activityMonth < currentActivityMonth;
  const moveActivityMonth = (offset) => {
    setActivityMonth((value) => {
      const [year, month] = value.split("-").map(Number);
      const next = new Date(year, month - 1 + offset, 1);
      const nextValue = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
      return nextValue > currentActivityMonth ? currentActivityMonth : nextValue;
    });
  };

  useEffect(() => {
    let alive = true;
    const load = () => {
      setActivityLoading(true);
      api
        .getActivityStats(actPeriod, actPeriod === "month" ? activityMonth : undefined)
        .then((data) => {
          if (alive) setActivityStats(data);
        })
        .catch(() => {
          if (alive) setActivityStats(null);
        })
        .finally(() => {
          if (alive) setActivityLoading(false);
        });
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [actPeriod, activityMonth]);

  const actData = useMemo(
    () =>
      (activityStats?.points || []).map((point) => ({
        label: point.label,
        value: point.activity_percent,
        status: point.status,
        statusLabel: point.status_label,
      })),
    [activityStats],
  );
  const actAvg = activityStats?.average_percent;
  const activityStatus = activityStats?.status || "NO_DATA";
  const activityStatusLabel = activityStats?.status_label || "데이터 없음";
  const hasActivityData = actData.some((point) => point.value != null);

  // 월간 차트: 진입 시 최신(현재 달, 오른쪽 끝)으로 스크롤
  const monthScrollRef = useRef(null);
  const monthDrag = useRef(null);
  useEffect(() => {
    if (actPeriod === "month" && monthScrollRef.current) {
      monthScrollRef.current.scrollLeft = monthScrollRef.current.scrollWidth;
    }
  }, [actPeriod, activityMonth]);

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

  // 스크롤 투 탑 버튼
  // 외출 모드 (백엔드 전까지 프론트 localStorage 로 유지)
  const AWAY_KEY = "aimyaong:awayMode";
  const [awayMode, setAwayMode] = useState(() => {
    try {
      return localStorage.getItem(AWAY_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [abnormalDetection, setAbnormalDetection] = useState(true);
  const [busyId, setBusyId] = useState(null);
  // 정지 버튼이 눌린 직후 잠깐 켜지는 표시 (id | null)
  const [stopFlash, setStopFlash] = useState(null);

  // settings DB 에서 외출모드 동기화 (로그인 상태면 DB값으로 반영)
  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        const on = s.away_mode === "Y";
        setAwayMode(on);
        setAbnormalDetection(s.motion_alert !== "N");
        try {
          localStorage.setItem(AWAY_KEY, on ? "1" : "0");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    api.updateSettings({ away_mode: next ? "Y" : "N" }).catch(() => {}); // settings DB 저장
    api.setAwayMode(next).catch(() => {
      /* 로봇 기기 명령 — 미구현/미연결이어도 프론트 상태는 유지 */
    });
  };

  const toggleAbnormalDetection = async () => {
    const next = !abnormalDetection;
    const previous = abnormalDetection;
    setAbnormalDetection(next);
    try {
      await api.setVisionEmergency(next);
      showToast(next ? "이상 행동 감지를 켰어요" : "이상 행동 감지를 껐어요");
    } catch (error) {
      console.error("[Dashboard] abnormal detection setting failed:", error);
      setAbnormalDetection(previous);
      showToast("이상 행동 감지 설정을 변경하지 못했어요");
    }
  };

  // 단축 작업 핸들러 (백엔드 있으면 실연결, 없으면 안내)
  const handleShortcut = async (id) => {
    if (id === "away") return toggleAway();
    if (id === "abnormal") return toggleAbnormalDetection();
    // 긴급 정지는 busyId 가드를 타지 않는다 — 배식 요청이 진행 중이라는 이유로
    // 정지가 막히면 정작 멈춰야 할 순간에 못 멈춘다.
    if (id === "dispenser-stop") {
      // 서버 응답을 기다리지 않고 바로 반응한다 — 눌렀는데 아무 일도 안 일어나는
      // 순간이 있으면 급한 상황에 연타하게 된다.
      setStopFlash(id);
      // animate-ping 이 1초 주기라, 파형이 한 번 온전히 퍼지고 사라질 만큼 유지한다
      window.setTimeout(() => setStopFlash(null), 1000);
      try {
        await api.dispenserStop();
        showToast("⏹ 디스펜서를 정지했어요");
        // 명령이 실제로 나간 뒤에만 남긴다 — 실패했는데 '정지됨'이 기록되면 안 된다
        addNotification({
          type: "dispenser_stopped",
          title: "디스펜서 정지",
          desc: "배식/급수를 중간에 멈췄어요.",
          link: "/dispenser",
        });
      } catch {
        showToast("정지 실패 — 기기 연결을 확인해 주세요");
      }
      return;
    }
    if (busyId) return;
    setBusyId(id);
    try {
      if (id === "feed") {
        await api.dispenserFeed(feed.food);
        // 통계 기록은 백엔드가 한다 — ESP32 가 저울로 잰 실제 배출량이 도착하면
        // 그때 FEED_LOGS 에 쌓인다. 여기서 지시값(feed.food)을 같이 남기면
        // 가짜 기록과 실측 기록이 이중으로 쌓인다.
        // 배출 + 저울 안정화가 끝나야 기록되므로 조금 뒤에 다시 불러온다.
        window.setTimeout(() => refreshLogs(), 12000);
        showToast(`🍚 사료 ${feed.food}g를 배식했어요`);
        // 배식은 '일상'이라 알림(경고)으로 보내지 않음 → 최근 활동/통계로만 표현
      }
    } catch {
      // 서버 미연결/미구현
      const msg = {
        feed: "배식 실패 — 기기 연결을 확인해 주세요",
      }[id];
      showToast(msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-5 pb-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            안녕하세요, {nickname}님!
            <PawPrint className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
          </span>
        }
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
              className={`relative w-11 h-11 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active ${
                isConnected ? "" : "ring-2 ring-brand-danger/60"
              }`}
              aria-label={isConnected ? "설정 · 연결됨" : "설정 · 연결 끊김"}
            >
              {isConnected ? (
                <Wifi className="w-5 h-5 text-brand-success" />
              ) : (
                <WifiOff className="w-5 h-5 text-brand-danger" />
              )}
              {!isConnected && (
                <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-brand-danger text-white flex items-center justify-center border-2 border-brand-bg animate-pulse">
                  <X className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
              )}
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
          {/* 장식 아이콘: Phosphor Icons (MIT) · react-icons 경유 — 출처: src/components/icons.jsx */}
          <div
            className="relative overflow-hidden rounded-3xl border border-brand-line/60 bg-brand-card p-4 shadow-soft"
            style={{ backgroundColor: "color-mix(in srgb, rgb(var(--brand-card)) 80%, rgb(var(--brand-cream)) 20%)" }}
          >
            {/* 점선 스티치 (얇고 은은하게) */}
            <span className="pointer-events-none absolute inset-[6px] rounded-[18px] border border-dashed border-brand-brown/15" />
            {/* 배경 장식 (우측, 클릭 비활성) — 종이질감(paper.jpg) 입힌 발바닥·뼈·하트 */}
            <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.5} className="absolute right-4 top-2 w-9 h-9 rotate-12" />
            <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.32} className="absolute right-16 top-10 w-6 h-6 -rotate-12" />
            <PaperIcon shape="bone" color="rgb(var(--brand-primary-deep))" opacity={0.62} className="absolute right-[80px] top-3 w-5 h-5 -rotate-12" />
            <PaperIcon shape="heart" color="rgb(var(--brand-primary))" opacity={0.8} className="absolute right-[100px] top-1 w-[18px] h-[18px]" />
            <PaperIcon shape="heart" color="rgb(var(--brand-primary))" opacity={0.5} className="absolute right-10 top-[54px] w-3.5 h-3.5" />
            <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.12} className="absolute -right-4 -bottom-2 w-20 h-20 rotate-6" />

            {/* 상단: 사진 + 이름/배지 + 화살표 */}
            <div className="relative z-10 flex items-center gap-4">
              <div className="relative shrink-0">
                {/* 글로우 오라 (부드러운 코랄 — 누런기 제거) */}
                <div
                  className="aura-glow pointer-events-none absolute -inset-2.5 rounded-full blur-xl"
                  style={{ background: "rgb(var(--brand-primary) / 0.18)" }}
                />
                <div className="relative w-24 h-24 rounded-full bg-brand-bg flex items-center justify-center shadow-soft-inset overflow-hidden ring-1 ring-brand-line/70">
                  {pet.photo ? (
                    <img src={pet.photo} alt={petName} className="w-full h-full object-cover" />
                  ) : (
                    <PawPrint className="w-12 h-12 text-brand-primary" />
                  )}
                </div>
                {/* 상태 점 (광택 그린) */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full border-[3px] border-brand-card shadow-sm"
                  style={{ background: "radial-gradient(circle at 35% 30%, #A9DDA0, rgb(var(--brand-success)))" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-brand-mute">나의 소중한 단짝</p>
                <h2 className="font-display text-[26px] font-extrabold text-brand-brown leading-tight truncate">
                  {petName}
                </h2>
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold ${
                      health.tone === "success"
                        ? "bg-brand-success/20 text-[rgb(var(--brand-success-ink))]"
                        : health.tone === "warn"
                        ? "bg-brand-warning/25 text-[rgb(var(--brand-warning-ink))]"
                        : health.tone === "danger"
                        ? "bg-brand-primary-soft/50 text-brand-danger"
                        : "bg-brand-brown/10 text-brand-brown"
                    }`}
                  >
                    <health.Icon className="w-4 h-4" />
                    {health.label}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-brand-mute shrink-0" />
            </div>

            {/* 펫 지표 스트립 (밝은 패널 + 아이콘 라벨) */}
            <div className="relative z-10 mt-4 grid grid-cols-3 divide-x divide-brand-line rounded-2xl bg-brand-cream/50 py-3.5 shadow-soft-inset">
              <div className="px-2 text-center">
                <p className="flex items-center justify-center gap-1 text-xs font-bold text-brand-brown/60">
                  <Cake className="w-4 h-4 text-brand-primary-deep" /> 나이
                </p>
                <p className="mt-1 text-[17px] font-extrabold text-brand-brown leading-none">
                  {ageLabel || "-"}
                </p>
              </div>
              <div className="px-2 text-center">
                <p className="flex items-center justify-center gap-1 text-xs font-bold text-brand-brown/60">
                  <Scale className="w-4 h-4 text-brand-primary" /> 몸무게
                </p>
                <p className="mt-1 text-[17px] font-extrabold text-brand-brown leading-none">
                  {pet.weightKg ? `${pet.weightKg}kg` : "-"}
                </p>
              </div>
              <div className="px-2 text-center min-w-0">
                <p className="flex items-center justify-center gap-1 text-xs font-bold text-brand-brown/60">
                  <Dog className="w-4 h-4 text-brand-primary-deep" /> 품종
                </p>
                <p className="mt-1 text-[17px] font-extrabold text-brand-brown leading-none truncate">
                  {petBreed || "-"}
                </p>
              </div>
            </div>
          </div>
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

      {/* 1.5) AI 건강 분석 진입 — 고양이 배너 (public/ai-analysis/AICAT.png) */}
      <button
        type="button"
        data-tour="dash-health"
        onClick={() => (pet ? navigate("/health-report/0") : showToast("🐾 반려동물을 먼저 등록해 주세요"))}
        className="group mt-4 block w-full text-left touch-active"
      >
        <div
          className="relative overflow-hidden rounded-3xl border border-brand-line/50 shadow-soft transition-transform duration-200 ease-out group-active:scale-[0.98]"
          style={{
            background:
              "linear-gradient(90deg, rgb(var(--brand-cream)) 0%, rgb(var(--brand-cream)) 45%, rgb(var(--brand-primary) / 0.16) 100%)",
          }}
        >
          {/* 우측 큰 별 + 작은 반짝이 데코 */}
          <Sparkles className="pointer-events-none absolute -right-3 top-1/2 -translate-y-1/2 w-24 h-24 text-brand-primary/15" />
          <Sparkles className="pointer-events-none absolute right-12 top-3 w-4 h-4 text-brand-primary/40" />

          <div className="relative flex items-center gap-1">
            {/* 고양이 캐릭터 (하단 정렬, 크게) */}
            <img
              src="/ai-analysis/AICAT.png"
              alt="AI 건강 분석"
              draggable={false}
              className="w-28 h-28 shrink-0 self-end object-contain transition-transform duration-200 ease-out group-active:scale-95 group-active:-rotate-3"
            />

            {/* 텍스트 */}
            <div className="flex-1 min-w-0 py-3 pr-2">
              {/* 말풍선 (꼬리 포함) */}
              <div
                className="relative inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5"
                style={{ background: "rgb(var(--brand-primary) / 0.2)" }}
              >
                <span className="font-display text-lg font-extrabold leading-none text-brand-brown">
                  AI 건강 분석
                </span>
                <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-extrabold leading-none text-white">
                  NEW
                </span>
                {/* 말풍선 꼬리 (왼쪽 아래 → 고양이 방향) */}
                <span
                  className="absolute -bottom-1 left-4 w-3 h-3 rotate-45"
                  style={{ background: "rgb(var(--brand-primary) / 0.2)" }}
                />
              </div>
              {/* 부제 (한 줄) */}
              <p className="mt-2.5 text-xs font-bold leading-snug text-brand-brown/75">
                우리 아이 데이터로 건강 상태를 분석하러 가기
              </p>
            </div>

            {/* 버튼 affordance — '가기' 화살표 (탭 가능 표시 + 살짝 통통) */}
            <span className="relative z-10 mr-1 flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full bg-brand-primary/15 text-brand-primary shadow-sm transition-transform duration-200 ease-out group-active:translate-x-0.5">
              <ChevronRight className="h-5 w-5" />
            </span>
          </div>
        </div>
      </button>

      {/* 3) 숏컷 (Grid) */}
      <section className="mt-5" data-tour="dash-shortcuts">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-3">
          빠른 작업
        </h3>
        {/* 4개가 한 줄에 — 아이콘/글씨를 살짝 줄여 좁은 화면에서도 안 접힌다 */}
        <div className="grid grid-cols-4 gap-2">
          {SHORTCUTS.map(({ id, label, icon: Icon, tone }) => {
            const active =
              (id === "away" && awayMode) ||
              (id === "abnormal" && abnormalDetection);
            const isBusy = busyId === id;
            const toneCls = active ? "bg-brand-primary text-white border-white/30" : tone;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleShortcut(id)}
                disabled={isBusy}
                className="flex flex-col items-center gap-2 touch-active disabled:opacity-60"
              >
                {/* 정지를 누르면 파형이 퍼져나가고 꽉 찬 빨강으로 차오르며 눌린다.
                 * 여기는 자르는 컨테이너가 없어서 파형이 온전히 퍼진다. */}
                <span className="relative">
                  {stopFlash === id && (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-3xl bg-brand-danger animate-ping"
                    />
                  )}
                  <span
                    className={`relative w-14 h-14 rounded-3xl flex items-center justify-center shadow-soft border border-dashed transition-all duration-300 ${toneCls} ${isBusy ? "animate-pulse" : ""} ${
                      stopFlash === id ? "!bg-brand-danger !text-white !border-white/50 scale-90" : ""
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                  </span>
                </span>
                <span className="text-[10px] font-semibold text-brand-brown text-center leading-tight">
                  {id === "away"
                    ? awayMode
                      ? "외출 모드 ON"
                      : "외출 모드"
                    : id === "abnormal"
                      ? abnormalDetection
                        ? "이상 감지 ON"
                        : "이상 행동 감지"
                      : label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4) 최근 활동 */}
      <section className="mt-6">
        <div className="flex items-center justify-between px-1 mb-3">
          <button
            type="button"
            onClick={() => setRecentCollapsed((value) => !value)}
            className="flex items-center gap-1.5 text-left touch-active"
            aria-expanded={!recentCollapsed}
          >
            <h3 className="font-display text-base font-bold text-brand-brown">
              최근 활동
            </h3>
            <ChevronDown
              className={`w-4 h-4 text-brand-mute transition-transform ${recentCollapsed ? "-rotate-90" : ""}`}
            />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-brand-mute font-semibold">
              {Math.min(recentItems.length, 5)}/5
            </span>
            <button
              type="button"
              onClick={() => navigate("/activity")}
              className="text-xs text-brand-mute font-semibold flex items-center touch-active"
            >
              전체보기 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div
          className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
            recentCollapsed ? "grid-rows-[0fr] opacity-0 -mt-1" : "grid-rows-[1fr] opacity-100"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <CreamCard className="divide-y divide-brand-line">
              {visibleRecentItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-brand-mute">최근 활동이 없어요</p>
              ) : (
                visibleRecentItems.map((item) => {
                  const { id, key, icon, eventType, tone, title, desc, time, eventId } = item;
                  const Icon = icon || EVENT_ICON[eventType] || PawPrint;
                  return (
                  <div key={key || id} className="flex items-center gap-3 px-4 py-3.5">
                    <span
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${TONE[tone]}`}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-brand-brown truncate">{title}</p>
                      <p className="text-xs text-brand-mute truncate">{desc}</p>
                    </div>
                    <span className="text-[11px] text-brand-mute shrink-0">{time}</span>
                    {eventId && (
                      <button
                        type="button"
                        onClick={() => deleteRecentVisionEvent(item)}
                        className="w-8 h-8 rounded-2xl bg-brand-card text-brand-mute flex items-center justify-center shrink-0 active:bg-brand-danger/10 active:text-brand-danger transition-colors"
                        aria-label="로그 삭제"
                        title="로그 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )})
              )}
            </CreamCard>
          </div>
        </div>
      </section>

      {/* 5) 펫 활동량 통계 (일/주/월) */}
      <section className="mt-6">
        <div className="relative overflow-hidden rounded-3xl shadow-soft px-5 py-5" style={{ backgroundColor: BG_CARD }}>
          <Stitch />
          <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.08} className="absolute -right-3 -bottom-3 w-16 h-16 rotate-6" />
          <PaperIcon shape="heart" color="rgb(var(--brand-primary))" opacity={0.45} className="absolute right-5 top-4 w-3.5 h-3.5" />
          <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center border border-dashed border-brand-brown/20">
                <Activity className="w-5 h-5" />
              </span>
              <div>
                <p className="font-display text-base font-bold text-brand-brown leading-tight">
                  활동량
                </p>
                <p className="text-[11px] text-brand-mute">우리 아이 발자국 🐾</p>
              </div>
            </div>
            {/* 일/주/월 탭 */}
            {actPeriod === "month" && (
              <div className="pointer-events-auto absolute right-5 top-16 z-20 inline-flex h-7 items-center rounded-full bg-brand-card/90 px-1 shadow-soft-inset border border-dashed border-brand-brown/15">
                <button
                  type="button"
                  onClick={() => moveActivityMonth(-1)}
                  className="h-6 w-6 rounded-full text-xs font-extrabold text-brand-brown touch-active"
                  aria-label="previous month"
                >
                  {"<"}
                </button>
                <span className="min-w-[74px] px-1 text-center text-[11px] font-extrabold text-brand-brown">
                  {activityMonthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => moveActivityMonth(1)}
                  disabled={!canNextActivityMonth}
                  className="h-6 w-6 rounded-full text-xs font-extrabold text-brand-brown disabled:opacity-30 touch-active"
                  aria-label="next month"
                >
                  {">"}
                </button>
              </div>
            )}
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
              key={activityMonth}
              ref={monthScrollRef}
              onWheel={onMonthWheel}
              onPointerDown={onMonthDown}
              onPointerMove={onMonthMove}
              onPointerUp={onMonthUp}
              onPointerCancel={onMonthUp}
              tabIndex={-1}
              className="page-enter mt-4 overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing select-none outline-none focus:outline-none"
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

          {activityLoading && (
            <p className="mt-2 text-center text-xs font-semibold text-brand-mute">
              활동량을 불러오는 중이에요.
            </p>
          )}
          {!activityLoading && !hasActivityData && (
            <p className="mt-2 text-center text-xs font-semibold text-brand-mute">
              아직 측정된 활동량이 없어요.
            </p>
          )}

          {/* 요약 */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl px-4 py-3 border border-dashed border-brand-brown/15" style={{ backgroundColor: BG_INFO }}>
              <p className="text-[11px] font-semibold text-brand-mute flex items-center gap-1">
                <Footprints className="w-3.5 h-3.5 text-brand-primary-deep" /> 평균 활동량
              </p>
              <p className="font-display text-lg font-bold text-brand-brown leading-none mt-1">
                {actAvg == null ? "--" : `${actAvg}%`}
              </p>
            </div>
            <div className="rounded-2xl px-4 py-3 border border-dashed border-brand-brown/15" style={{ backgroundColor: BG_INFO }}>
              <p className="text-[11px] font-semibold text-brand-mute flex items-center gap-1">
                <PawPrint className="w-3.5 h-3.5 text-brand-primary-deep" /> 대표 상태
              </p>
              <p
                className={`font-display text-base font-bold leading-none mt-1 ${ACTIVITY_STATUS_TONE[activityStatus]}`}
              >
                {activityStatusLabel}
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-brand-line pt-3">
            <button
              type="button"
              onClick={() => setActivityCriteriaOpen((open) => !open)}
              className="flex w-full items-center justify-between text-left touch-active"
              aria-expanded={activityCriteriaOpen}
            >
              <span className="text-xs font-bold text-brand-brown">
                활동량 기준
              </span>
              <ChevronDown
                className={`h-4 w-4 text-brand-mute transition-transform duration-300 ${
                  activityCriteriaOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                activityCriteriaOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="pt-3 text-[11px] leading-relaxed text-brand-mute">
                  카메라에서 감지한 움직임 점수를 0~100%로 환산한 상대
                  활동량이에요. 1,500점 이상은 100%로 표시하며 실제 걸음
                  수와는 달라요.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] font-semibold text-brand-brown">
                  <ActivityCriterion color="bg-brand-mute" label="0~9% 움직임 없음" />
                  <ActivityCriterion color="bg-brand-warning" label="10~39% 활동량 낮음" />
                  <ActivityCriterion color="bg-brand-primary" label="40~69% 활동량 보통" />
                  <ActivityCriterion color="bg-brand-danger" label="70~100% 활발" />
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
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
