import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Maximize2,
  Minimize2,
  Video,
  Camera,
  PawPrint,
  Mic,
  MicOff,
  Moon,
  ChevronLeft,
  ChevronRight,
  UserX,
  UtensilsCrossed,
  MapPin,
  Play,
  Clock,
  X,
  Trash2,
  ShieldAlert,
  Lock,
  Activity,
} from '../components/icons';
import { Card, Badge } from "../components/ui";
import { LogDatePicker } from "../components/LogDatePicker";
import { api, resolveMediaUrl } from "../api/api";
import { useWebSocket } from "../hooks/useWebSocket";
import { getWebSocketUrl } from "../lib/backendUrls";
import { filterLogsByDate, groupLogsByDate } from "../lib/logGrouping";
import { mapVisionEventForList } from "../lib/visionEventMapper";

// 카드 배경: 흰색 80% + 크림 20% (대시보드·마이페이지 공통) / 정보·칩: 따뜻한 탄
const BG_CARD = "color-mix(in srgb, rgb(var(--brand-card)) 80%, rgb(var(--brand-cream)) 20%)";
const BG_INFO = "color-mix(in srgb, rgb(var(--brand-cream)) 78%, rgb(var(--brand-mute)) 22%)";
const VISION_FLIP_HORIZONTAL =
  String(import.meta.env.VITE_VISION_FLIP_HORIZONTAL || "").toLowerCase() === "true";

/* 안쪽 점선 바느질 테두리 (펠트 느낌) */
function Stitch({ className = "" }) {
  return (
    <span className={`pointer-events-none absolute inset-[6px] rounded-[18px] border border-dashed border-brand-brown/15 ${className}`} />
  );
}

/* 버튼 안쪽 은은한 스티치 — 켜짐(컬러 배경)이면 흰색, 꺼짐이면 갈색 점선 */
function BtnStitch({ active }) {
  return (
    <span className={`pointer-events-none absolute inset-[5px] rounded-[16px] border border-dashed ${active ? "border-white/30" : "border-brand-brown/20"}`} />
  );
}

/* 종이질감 장식 아이콘 — public/icons/*.svg 실루엣을 마스크로, paper.jpg 텍스처를 그 안에만.
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

/* 이벤트 로그 — clip_id 로 백엔드 클립(CLIPS) 참조 (활동 기록과 동일 구조) */
const EVENT_LOG = [
  {
    id: 1,
    type: "움직임 감지",
    time: "14:22:08",
    icon: Video,
    clip_id: 301,
    location: "거실",
    duration: 12,
    storage_path: "/clips/clip-301.mp4",
  },
  {
    id: 2,
    type: "배식 동작",
    time: "13:00:00",
    icon: UtensilsCrossed,
    clip_id: 302,
    location: "식기 앞",
    duration: 6,
    storage_path: "/clips/clip-302.mp4",
  },
  {
    id: 3,
    type: "음성 호출",
    time: "11:45:12",
    icon: Mic,
    clip_id: null,
    location: "집사 호출",
  },
  {
    id: 4,
    type: "외부인 감지",
    time: "09:11:55",
    icon: UserX,
    clip_id: 304,
    location: "현관",
    duration: 9,
    danger: true,
    storage_path: "/clips/clip-304.mp4",
  },
  {
    id: 5,
    type: "수면 감지",
    time: "03:20:41",
    icon: Moon,
    clip_id: 305,
    location: "안방",
    duration: 20,
    storage_path: "/clips/clip-305.mp4",
  },
];

const MOVE_COMMANDS = {
  up: "FORWARD",
  down: "BACKWARD",
  left: "LEFT",
  right: "RIGHT",
};

const MOVE_HOLD_REPEAT_MS = 300;
const CAMERA_HOLD_REPEAT_MS = 180;
const ROBOT_SERIAL_KEY = "aimyaong:robotSerial";
const ROBOT_DEVICE_CLAIM_ENABLED =
  import.meta.env.VITE_ROBOT_DEVICE_CLAIM_ENABLED === "true";

const CAMERA_COMMANDS = {
  up: "CAM_UP",
  down: "CAM_DOWN",
  left: "CAM_LEFT",
  right: "CAM_RIGHT",
  center: "CAM_CENTER",
};

export function RobotVision() {
  const navigate = useNavigate();
  const { isConnected } = useWebSocket(getWebSocketUrl());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [awayMode, setAwayMode] = useState(() => {
    try {
      return localStorage.getItem("aimyaong:awayMode") === "1";
    } catch {
      return false;
    }
  });
  const [abnormalDetection, setAbnormalDetection] = useState(true);
  const [recording, setRecording] = useState(false);
  const [selectedClip, setSelectedClip] = useState(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [robotSerial, setRobotSerial] = useState(() => {
    if (ROBOT_DEVICE_CLAIM_ENABLED) return "";
    try {
      return localStorage.getItem(ROBOT_SERIAL_KEY) || "";
    } catch {
      return "";
    }
  });
  const [robotNotice, setRobotNotice] = useState("");
  const [streamInfo, setStreamInfo] = useState({ url: "", mode: "loading" });
  const [streamError, setStreamError] = useState("");
  const [detections, setDetections] = useState(null);
  const [eventLog, setEventLog] = useState([]);
  const [captureNotice, setCaptureNotice] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false); // 캡처 버튼 짧은 반응(찰칵)
  const [camStatus, setCamStatus] = useState("connecting"); // connecting | live | off
  const controlBusyRef = useRef(false);
  const pendingCommandCountRef = useRef(0);
  const captureNoticeTimerRef = useRef(null);
  const captureFlashTimerRef = useRef(null);
  // 뷰포트가 portrait 인데 전체화면이면 CSS 로 강제 가로 회전.
  // Android Chrome 등에서 screen.orientation.lock 이 성공하면 false 로 유지.
  const [forceCssLandscape, setForceCssLandscape] = useState(false);
  const fsRef = useRef(null);
  const visibleEventLog = eventLog.slice(0, 5);
  const hasRobotSerial = !!robotSerial.trim();

  const blockRobotAction = () => {
    if (hasRobotSerial) return false;
    setRobotNotice("로봇을 사용하려면 설정에서 시리얼 번호를 먼저 등록해 주세요.");
    return true;
  };

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

  useEffect(() => {
    api
      .getSettings()
      .then((settings) => setAbnormalDetection(settings.motion_alert !== "N"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!hasRobotSerial) {
      setStreamInfo({ url: "", mode: "locked" });
      setStreamError("");
      setCamStatus("off");
      return () => {
        mounted = false;
      };
    }
    api
      .getStreamUrl()
      .then((data) => {
        if (!mounted) return;
        setStreamInfo({ url: data.url, mode: data.mode || "live" });
        setStreamError("");
      })
      .catch((error) => {
        if (!mounted) return;
        console.error("[RobotVision] stream URL failed:", error);
        setStreamError("스트림 주소를 불러오지 못했습니다");
      });

    return () => {
      mounted = false;
    };
  }, [hasRobotSerial]);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      if (!hasRobotSerial) {
        setDetections(null);
        return;
      }
      api
        .getLatestDetections()
        .then((data) => {
          if (mounted) setDetections(data);
        })
        .catch(() => {
          if (mounted) setDetections(null);
        });
    };
    load();
    // 후방 센서값은 1Hz(파이가 1초마다 push, 장애물이면 즉시)라 250ms 폴링이면 충분히 빠릿하게 잡는다.
    const timer = window.setInterval(load, 250);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [hasRobotSerial]);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      api
        .getVisionEvents(20)
        .then((data) => {
          if (mounted)
            setEventLog((data.events || []).map(mapVisionEventForList));
        })
        .catch(() => {
          if (mounted) setEventLog([]);
        });
    };
    load();
    const timer = window.setInterval(load, 3000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (captureNoticeTimerRef.current) {
        window.clearTimeout(captureNoticeTimerRef.current);
      }
      if (captureFlashTimerRef.current) {
        window.clearTimeout(captureFlashTimerRef.current);
      }
    };
  }, []);

  const deleteVisionEvent = async (event, domEvent) => {
    domEvent?.stopPropagation();
    if (!event?.eventId) return;
    try {
      await api.deleteAlert(event.eventId);
      setEventLog((items) =>
        items.filter((item) => item.eventId !== event.eventId),
      );
      setSelectedClip((current) =>
        current?.eventId === event.eventId ? null : current,
      );
    } catch (error) {
      console.error("[RobotVision] delete event failed:", error);
    }
  };

  // Fullscreen API ↔ React 상태 동기화 (ESC 해제 포함)
  useEffect(() => {
    const sync = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (!active) {
        // 풀스크린 종료 시 orientation lock 도 해제
        try {
          window.screen?.orientation?.unlock?.();
        } catch {
          /* noop */
        }
        setForceCssLandscape(false);
      }
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  // 풀스크린 중 실제 가로 회전이 일어나면 CSS 회전을 풀고, portrait 로 돌아오면 다시 적용
  useEffect(() => {
    if (!isFullscreen) return;
    const check = () => {
      const portrait = window.innerHeight > window.innerWidth;
      setForceCssLandscape(portrait);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, [isFullscreen]);

  const enterFullscreen = async () => {
    const el = fsRef.current;
    if (!el) return;
    try {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        await req.call(el);
      } else {
        setIsFullscreen(true);
      }
    } catch {
      setIsFullscreen(true);
    }
    // 전체화면 진입 직후 가로 모드 잠금 시도 (Android Chrome 등)
    try {
      const orientation = window.screen?.orientation;
      if (orientation?.lock) {
        await orientation.lock("landscape");
      }
    } catch {
      // iOS Safari 등 미지원 → CSS 회전 폴백이 useEffect 에서 자동 적용됨
    }
  };

  const exitFullscreen = async () => {
    try {
      window.screen?.orientation?.unlock?.();
    } catch {
      /* noop */
    }
    try {
      if (document.fullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit?.call(document);
      } else {
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(false);
    }
    setForceCssLandscape(false);
  };

  const sendCommand = (kind, command) => {
    if (!command) return;
    if (blockRobotAction()) return;

    pendingCommandCountRef.current += 1;
    controlBusyRef.current = true;
    setControlBusy(true);

    const request =
      kind === "camera" ? api.moveCamera(command) : api.moveRobot(command);

    request
      .catch((error) => {
        console.error(`[RobotVision] ${kind} command failed:`, error);
      })
      .finally(() => {
        pendingCommandCountRef.current = Math.max(
          0,
          pendingCommandCountRef.current - 1,
        );
        if (pendingCommandCountRef.current === 0) {
          controlBusyRef.current = false;
          setControlBusy(false);
        }
      });
  };

  // 후진 차단/자동정지 신호 — '즉시 위험'(생값 기준, 필터 우회)로 첫 근접에 바로 반응.
  // (경고 글로우는 RearWarning이 필터값으로 부드럽게 처리 — 역할 분리)
  const rearObstacle = !!detections?.rear_sensor?.rear_obstacle_immediate;

  const onMove = (dir) => {
    if (blockRobotAction()) return;
    // 후진(아래)은 후방 장애물 시 차단하고 즉시 정지 명령을 보낸다.
    if (dir === "down" && rearObstacle) {
      sendCommand("move", "STOP");
      return;
    }
    sendCommand("move", MOVE_COMMANDS[dir]);
  };

  const onMoveStop = () => {
    if (!hasRobotSerial) return;
    sendCommand("move", "STOP");
  };

  // 위험이 발생하는 순간(false→true) 후진 중이면 자동으로 멈춘다.
  useEffect(() => {
    if (rearObstacle && hasRobotSerial) {
      sendCommand("move", "STOP");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rearObstacle, hasRobotSerial]);

  const onPan = (dir) => {
    if (blockRobotAction()) return;
    sendCommand("camera", CAMERA_COMMANDS[dir]);
  };

  const toggleAwayMode = async () => {
    if (blockRobotAction()) return;
    const next = !awayMode;
    const previous = awayMode;
    setAwayMode(next);
    try {
      localStorage.setItem("aimyaong:awayMode", next ? "1" : "0");
      await api.setAwayMode(next);
    } catch (error) {
      console.error("[RobotVision] away mode command failed:", error);
      setAwayMode(previous);
      try {
        localStorage.setItem("aimyaong:awayMode", previous ? "1" : "0");
      } catch {
        /* ignore */
      }
    }
  };

  const toggleAbnormalDetection = async () => {
    if (blockRobotAction()) return;
    const next = !abnormalDetection;
    const previous = abnormalDetection;
    setAbnormalDetection(next);
    try {
      await api.setVisionEmergency(next);
    } catch (error) {
      console.error("[RobotVision] abnormal detection setting failed:", error);
      setAbnormalDetection(previous);
    }
  };

  const captureSnapshot = async () => {
    if (blockRobotAction()) return;
    try {
      await api.captureSnapshot();
      setCaptureNotice(true);
      if (captureNoticeTimerRef.current) {
        window.clearTimeout(captureNoticeTimerRef.current);
      }
      captureNoticeTimerRef.current = window.setTimeout(() => {
        setCaptureNotice(false);
      }, 3000);
      // 버튼은 짧게 '찰칵' 반응만 (다른 버튼 활성색과 동일한 코랄)
      setCaptureFlash(true);
      if (captureFlashTimerRef.current) {
        window.clearTimeout(captureFlashTimerRef.current);
      }
      captureFlashTimerRef.current = window.setTimeout(() => {
        setCaptureFlash(false);
      }, 700);
    } catch (error) {
      console.error("[RobotVision] capture command failed:", error);
    }
  };

  const toggleRecording = async () => {
    if (blockRobotAction()) return;
    const next = !recording;
    const previous = recording;
    setRecording(next);
    try {
      await api.setVisionRecording(next);
    } catch (error) {
      console.error("[RobotVision] recording command failed:", error);
      setRecording(previous);
    }
  };

  return (
    <div className="px-5 pt-5 pb-6">
      <div className="flex items-center gap-2.5 mb-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="뒤로가기"
          className="w-9 h-9 -ml-1 flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 font-cute text-2xl font-bold text-brand-brown">
          로봇 비전
        </h1>
        <Badge tone={isConnected ? "success" : "danger"}>
          {isConnected ? "연결됨" : "연결 끊김"}
        </Badge>
      </div>

      {/* 일반 모드 비디오 */}
      {!hasRobotSerial && (
        <div className="mb-3 rounded-3xl border border-dashed border-brand-primary/30 bg-brand-primary/10 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 w-4 h-4 text-brand-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-brown">
                시리얼 번호 등록이 필요합니다.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-brand-mute">
                로봇 이동, 카메라 제어, 외출 모드, 녹화와 캡처는 설정에서 로봇 시리얼 번호를 등록한 뒤 사용할 수 있습니다.
              </p>
              {robotNotice && (
                <p className="mt-1 text-xs font-bold text-brand-primary">
                  {robotNotice}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden" data-tour="vision-stream">
        <div
          ref={fsRef}
          className={
            isFullscreen
              ? "fullscreen-stage"
              : "relative w-full aspect-video bg-gradient-to-br from-brand-cream to-brand-line dark:from-[#2b2520] dark:to-black overflow-hidden"
          }
        >
          {isFullscreen ? (
            <div
              className={
                forceCssLandscape ? "landscape-rotor" : "landscape-native"
              }
            >
              <FullscreenView
                onExit={exitFullscreen}
                onMove={onMove}
                onMoveStop={onMoveStop}
                onPan={onPan}
                recording={recording}
                awayMode={awayMode}
                captureNotice={captureNotice}
                streamUrl={streamInfo.url}
                streamError={streamError}
                detections={detections}
              />
            </div>
          ) : (
            <>
              {hasRobotSerial ? (
                <>
                  <StreamFrame
                    src={streamInfo.url}
                    mode={streamInfo.mode}
                    error={streamError}
                    className="absolute inset-0"
                    onStatusChange={setCamStatus}
                  />
                  <DetectionOverlay
                    detections={detections}
                    className="absolute inset-0"
                  />
                  <RearWarning sensor={detections?.rear_sensor} className="absolute inset-0 z-20" />
                </>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-brand-cream via-brand-line to-brand-line flex items-center justify-center text-brand-mute">
                  <div className="text-center px-6">
                    <span className="w-16 h-16 mb-2.5 mx-auto rounded-full flex items-center justify-center bg-white/50 ring-1 ring-inset ring-white/60 shadow-sm">
                      <Lock className="w-7 h-7 text-brand-primary" />
                    </span>
                    <p className="text-sm font-bold text-brand-brown">
                      영상 스트리밍 잠김
                    </p>
                    <p className="mt-1 text-xs leading-relaxed">
                      설정에서 로봇 시리얼 번호를 등록하면 실시간 영상을 볼 수 있습니다.
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] font-bold ${camStatus === "live" ? "bg-black/55" : "bg-black/40"}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${camStatus === "live" ? "bg-red-400 animate-pulse" : camStatus === "connecting" ? "bg-amber-300 animate-pulse" : "bg-white/40"}`}
                  />
                  {camStatus === "live"
                    ? "LIVE"
                    : camStatus === "connecting"
                      ? "연결 중"
                      : "오프라인"}
                </span>
                <RearSensorChip sensor={detections?.rear_sensor} compact />
                {recording && (
                  <span className="px-2.5 py-1 rounded-full bg-brand-danger text-white text-[11px] font-bold">
                    ● REC
                  </span>
                )}
                {awayMode && (
                  <span className="px-2.5 py-1 rounded-full bg-brand-primary text-white text-[11px] font-bold">
                    외출 모드
                  </span>
                )}
                {captureNotice && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-brand-brown text-[11px] font-bold shadow-soft">
                    <Camera className="w-3.5 h-3.5" /> 캡처 완료
                  </span>
                )}
              </div>
              <button
                onClick={enterFullscreen}
                className="absolute top-3 right-3 w-10 h-10 rounded-2xl bg-black/55 text-white flex items-center justify-center active:bg-black/80 transition-colors"
                title="전체화면 (가로 모드)"
                aria-label="전체화면"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </Card>

      {/* 후방 충돌 거리 기준 안내 — 경고 색이 뜻하는 거리 단계 */}
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-brand-mute">
        <span className="inline-flex items-center gap-1">
          <ShieldAlert className="w-3.5 h-3.5" /> 후방 거리
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-danger))" }} />
          위험 ≤15cm
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-warning))" }} />
          주의 15~40cm
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-success))" }} />
          안전 {">"}40cm
        </span>
      </div>

      {/* 세로 모드 조종 패드 (이동 + 카메라) — 스트리밍 바로 아래 */}
      <section className="mt-5">
        {/* 제목 줄에 알림 칩 — 카드/버튼 레이아웃을 밀지 않도록 흐름 밖이 아닌 '항상 있는 헤더'에 표시 */}
        <div className="flex items-center justify-between mb-3 min-h-[1.75rem]">
          <h3 className="font-display text-base font-bold text-brand-brown">
            조종 패드
          </h3>
          {rearObstacle && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: "rgb(var(--brand-danger) / 0.12)", color: "rgb(var(--brand-danger))", border: "1px dashed rgb(var(--brand-danger) / 0.5)" }}
            >
              <Lock className="w-3 h-3" /> 후진 제한됨
            </span>
          )}
        </div>
        <div className="relative overflow-hidden rounded-3xl shadow-soft px-4 py-6" style={{ backgroundColor: BG_CARD }}>
          <Stitch />
          <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.08} className="absolute -right-3 -bottom-3 w-16 h-16 rotate-6" />
          <div className="relative z-10 flex items-start justify-between gap-2">
            <div className="flex flex-col items-center gap-2">
              <DPad
                label="이동"
                onPress={onMove}
                onRelease={onMoveStop}
                tone="light"
                holdToPress
                disabledDir={rearObstacle ? "down" : null}
              />
              <span className="text-[11px] font-bold text-brand-mute">
                기기 이동
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <DPad
                label="카메라"
                onPress={onPan}
                centerAction="center"
                muted
                tone="light"
                holdToPress
                repeatMs={CAMERA_HOLD_REPEAT_MS}
              />
              <span className="text-[11px] font-bold text-brand-mute">
                카메라 회전
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 컨트롤 (외출 / 이상 감지 / 녹화 / 캡처) */}
      <section className="mt-5" data-tour="vision-controls">
        <h3 className="font-display text-base font-bold text-brand-brown mb-3">
          제어
        </h3>
        <div className="relative overflow-hidden rounded-3xl shadow-soft px-5 py-5" style={{ backgroundColor: BG_CARD }}>
          <Stitch />
          <PaperIcon shape="bone" color="rgb(var(--brand-primary-deep))" opacity={0.08} className="absolute right-4 top-3 w-8 h-8 rotate-12" />
          <div className="relative z-10">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={toggleAwayMode}
              disabled={!hasRobotSerial}
              className={`relative overflow-hidden flex flex-col items-center gap-1 px-4 py-3 rounded-3xl shadow-soft min-w-[88px] border border-dashed transition-colors ${
                awayMode
                  ? "bg-brand-primary text-white border-white/30 active:bg-brand-primary/80"
                  : "text-brand-brown border-brand-brown/15 active:brightness-95"
              }`}
              style={awayMode ? undefined : { backgroundColor: BG_INFO }}
            >
              <BtnStitch active={awayMode} />
              <Moon className="w-5 h-5" />
              <span className="text-xs font-bold">
                {awayMode ? "외출 ON" : "외출 모드"}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleAbnormalDetection}
              aria-pressed={abnormalDetection}
              disabled={!hasRobotSerial}
              className={`relative overflow-hidden flex flex-col items-center gap-1 px-4 py-3 rounded-3xl shadow-soft min-w-[88px] border border-dashed transition-colors ${
                abnormalDetection
                  ? "bg-brand-primary text-white border-white/30 active:bg-brand-primary/80"
                  : "text-brand-brown border-brand-brown/15 active:brightness-95"
              }`}
              style={abnormalDetection ? undefined : { backgroundColor: BG_INFO }}
            >
              <BtnStitch active={abnormalDetection} />
              <ShieldAlert className="w-5 h-5" />
              <span className="text-xs font-bold">
                {abnormalDetection ? "이상 감지 ON" : "이상 행동 감지"}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={!hasRobotSerial}
              className={`relative overflow-hidden flex flex-col items-center gap-1 px-4 py-3 rounded-3xl shadow-soft min-w-[88px] border border-dashed transition-colors ${
                recording
                  ? "bg-brand-primary text-white border-white/30 active:bg-brand-primary/80"
                  : "text-brand-brown border-brand-brown/15 active:brightness-95"
              }`}
              style={recording ? undefined : { backgroundColor: BG_INFO }}
            >
              <BtnStitch active={recording} />
              <Video className="w-5 h-5" />
              <span className="text-xs font-bold">
                {recording ? "녹화 중" : "녹화"}
              </span>
            </button>
            <button
              type="button"
              onClick={captureSnapshot}
              disabled={!hasRobotSerial}
              className={`relative overflow-hidden flex flex-col items-center gap-1 px-4 py-3 rounded-3xl shadow-soft min-w-[88px] border border-dashed transition-colors ${
                captureFlash
                  ? "bg-brand-primary text-white border-white/30"
                  : "text-brand-brown border-brand-brown/15 active:brightness-95"
              }`}
              style={captureFlash ? undefined : { backgroundColor: BG_INFO }}
            >
              <BtnStitch active={captureFlash} />
              {captureFlash && (
                <span className="capture-flash pointer-events-none absolute inset-0 z-20 bg-white" />
              )}
              <Camera className={`w-5 h-5 ${captureFlash ? "capture-pop" : ""}`} />
              <span className="text-xs font-bold">{captureFlash ? "찰칵!" : "캡처"}</span>
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-brand-mute">
            가로 조종 패드는{" "}
            <span className="font-bold text-brand-primary">전체화면</span>에서
            활성화됩니다.
          </p>
          </div>
        </div>
      </section>

      {/* 이벤트 로그 */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display text-base font-bold text-brand-brown">
              이벤트 로그
            </h3>
            <p className="mt-0.5 text-[11px] font-semibold text-brand-mute">
              최근 이벤트는 30일 동안 보관돼요.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-brand-mute font-semibold">
              {Math.min(eventLog.length, 5)}/5
            </span>
            <button
              type="button"
              onClick={() => setShowAllEvents(true)}
              className="text-xs text-brand-mute font-semibold flex items-center touch-active"
            >
              전체보기 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="relative rounded-3xl shadow-soft" style={{ backgroundColor: BG_CARD }}>
          <Stitch />
          <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.08} className="absolute -right-3 -bottom-3 w-16 h-16 rotate-6" />
          <div className="relative z-10 m-1.5 rounded-[18px] overflow-hidden divide-y divide-brand-line/70">
          {visibleEventLog.length === 0 && (
            <div className="px-4 py-6 flex flex-col items-center text-center">
              <span className="w-12 h-12 rounded-full flex items-center justify-center mb-2 border border-dashed border-brand-brown/20" style={{ backgroundColor: BG_INFO }}>
                <Video className="w-6 h-6 text-brand-primary/70" />
              </span>
              <p className="text-sm font-semibold text-brand-mute">아직 기록된 비전 이벤트가 없어요 🐾</p>
            </div>
          )}
          {visibleEventLog.map((e) => {
            const Icon = e.icon || EVENT_ICON[e.eventType] || Video;
            const hasEventMedia = !!(e.storage_path || e.clip_id);
            return (
              <div
                key={e.id}
                className="w-full flex items-center gap-2 px-4 py-3.5"
              >
                <button
                  type="button"
                  onClick={() => setSelectedClip(e)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left active:bg-brand-cream transition-colors rounded-2xl"
                >
                  <span
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-dashed ${e.danger ? "bg-brand-danger/15 text-brand-danger border-brand-danger/30" : e.warning ? "bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))] border-[rgb(var(--brand-warning-ink)/0.3)]" : "bg-brand-primary/15 text-brand-primary border-brand-primary/30"}`}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-brand-brown truncate">
                      {e.type}
                    </p>
                    <p className="text-xs text-brand-mute truncate">
                      {e.location}
                      {hasEventMedia ? "" : " · 영상 없음"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge tone={e.danger ? "danger" : e.warning ? "warn" : "primary"}>
                      {hasEventMedia ? "VOD" : "기록"}
                    </Badge>
                    <span className="text-[11px] text-brand-mute">{e.time}</span>
                    <ChevronRight className="w-4 h-4 text-brand-mute" />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(event) => deleteVisionEvent(e, event)}
                  className="w-9 h-9 rounded-2xl text-brand-mute flex items-center justify-center shrink-0 border border-dashed border-brand-brown/15 active:bg-brand-danger/10 active:text-brand-danger transition-colors"
                  style={{ backgroundColor: BG_INFO }}
                  aria-label="로그 삭제"
                  title="로그 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
          </div>
        </div>
      </section>

      {/* 클립 뷰어 (활동 기록 상세와 동일 형식) */}
      {selectedClip && (
        <ClipModal clip={selectedClip} onClose={() => setSelectedClip(null)} />
      )}
      {showAllEvents && (
        <EventLogSheet
          items={eventLog}
          onClose={() => setShowAllEvents(false)}
          onDelete={deleteVisionEvent}
          onSelect={(event) => {
            setShowAllEvents(false);
            setSelectedClip(event);
          }}
        />
      )}

      {/* 전체화면 스테이지 - 가로 모드 풀스크린 */}
      <style>{`
        .fullscreen-stage {
          position: fixed;
          inset: 0;
          z-index: 50;
          width: 100vw;
          height: 100vh;
          background: #000;
          overflow: hidden;
        }
        /* OS 가 직접 가로로 회전해 준 경우 */
        .landscape-native {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        /* iOS Safari 등 orientation lock 미지원 → CSS 로 강제 회전.
         * 사용자가 폰을 가로로 잡으면 콘텐츠가 올바른 방향으로 보임. */
        .landscape-rotor {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100vh;
          height: 100vw;
          transform: translate(-50%, -50%) rotate(90deg);
          transform-origin: center center;
          background: #000;
        }
      `}</style>
    </div>
  );
}

/**
 * 전체화면(Landscape) 뷰:
 *  - 배경: 전체 화면 비디오 스트림
 *  - 좌측 하단: 기계 이동 D-Pad (십자, 발바닥 아이콘)
 *  - 우측 하단: 카메라 Pan/Tilt D-Pad (십자, 반투명 배경)
 *  - 상단: 마이크 + 종료
 *
 * 양손 엄지 동선을 고려해 컨트롤은 하단 좌우, 토글은 상단에 배치.
 */
function FullscreenView({
  onExit,
  onMove,
  onMoveStop,
  onPan,
  recording,
  awayMode,
  captureNotice,
  streamUrl,
  streamError,
  detections,
}) {
  const [micOn, setMicOn] = useState(false);
  const [camStatus, setCamStatus] = useState("connecting"); // connecting | live | off
  const rearObstacle = !!detections?.rear_sensor?.rear_obstacle_immediate; // 즉시 위험 → 후진 잠금
  const toggleMic = () => {
    setMicOn((v) => {
      console.log("[RobotVision] mic:", !v ? "ON" : "OFF");
      return !v;
    });
  };

  return (
    <>
      {/* 배경 비디오 스트림 (전체화면) */}
      <StreamFrame
        src={streamUrl}
        error={streamError}
        className="absolute inset-0"
        fullscreen
        onStatusChange={setCamStatus}
      />
      <DetectionOverlay
        detections={detections}
        className="absolute inset-0 z-10"
      />
      <RearWarning sensor={detections?.rear_sensor} className="absolute inset-0 z-10" large />

      {/* 상단 좌측: LIVE / REC / 외출모드 인디케이터 */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-[11px] font-bold">
          <span
            className={`w-2 h-2 rounded-full ${camStatus === "live" ? "bg-red-400 animate-pulse" : camStatus === "connecting" ? "bg-amber-300 animate-pulse" : "bg-white/40"}`}
          />
          {camStatus === "live"
            ? "LIVE"
            : camStatus === "connecting"
              ? "연결 중"
              : "오프라인"}
        </span>
        <RearSensorChip sensor={detections?.rear_sensor} />
        {recording && (
          <span className="px-2.5 py-1 rounded-full bg-brand-danger text-white text-[11px] font-bold">
            ● REC
          </span>
        )}
        {awayMode && (
          <span className="px-2.5 py-1 rounded-full bg-brand-primary text-white text-[11px] font-bold">
            외출 모드
          </span>
        )}
        {captureNotice && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-brand-brown text-[11px] font-bold shadow-md">
            <Camera className="w-3.5 h-3.5" /> 캡처 완료
          </span>
        )}
      </div>

      {/* 상단 우측: 마이크 + 전체화면 종료 */}
      <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
        <MicButton on={micOn} onClick={toggleMic} />
        <button
          onClick={onExit}
          className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:bg-brand-brown"
          aria-label="전체화면 종료"
        >
          <Minimize2 className="w-5 h-5" />
        </button>
      </div>

      {/* 좌측 하단: 기계 이동 D-Pad (후방 장애물 시 후진 잠금) */}
      <div className="absolute bottom-6 left-6 z-50 flex flex-col items-center gap-2">
        {rearObstacle && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: "rgb(0 0 0 / 0.6)", color: "rgb(var(--brand-danger))", border: "1px solid rgb(var(--brand-danger))" }}
          >
            <Lock className="w-3 h-3" /> 후진 제한
          </span>
        )}
        <DPad
          label="이동"
          onPress={onMove}
          onRelease={onMoveStop}
          holdToPress
          disabledDir={rearObstacle ? "down" : null}
        />
      </div>

      {/* 우측 하단: 카메라 Pan/Tilt D-Pad */}
      <DPad
        className="absolute bottom-6 right-6 z-50"
        label="카메라"
        onPress={onPan}
        centerAction="center"
        muted
        holdToPress
        repeatMs={CAMERA_HOLD_REPEAT_MS}
      />
    </>
  );
}

/* 클립 뷰어 — 바텀시트 + 실제 영상 재생 (활동 기록 상세와 동일 형식).
 * 백엔드가 클립을 저장/서빙하면 자동 재생, 미구현 시 placeholder 폴백. */
function EventLogSheet({ items, onClose, onDelete, onSelect }) {
  const [show, setShow] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const filteredItems = useMemo(() => filterLogsByDate(items, selectedDate), [items, selectedDate]);
  const groups = useMemo(() => groupLogsByDate(filteredItems), [filteredItems]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dismiss = () => {
    setShow(false);
    setTimeout(onClose, 280);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={dismiss}
    >
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: "rgba(45,37,32,0.45)", opacity: show ? 1 : 0 }}
      />
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-[480px] max-h-[88dvh] overflow-hidden rounded-t-3xl sm:rounded-b-3xl px-5 pt-3 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{
          backgroundColor: BG_CARD,
          transform: show ? "translateY(0)" : "translateY(100%)",
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        }}
      >
        <Stitch className="!inset-[8px] !rounded-[22px]" />
        <div className="relative z-10">
          <div className="mx-auto w-10 h-1.5 rounded-full bg-brand-line mb-4" />
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-dashed bg-brand-primary/15 text-brand-primary border-brand-primary/30">
              <Video className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-lg font-bold text-brand-brown leading-tight">
                이벤트 로그 전체보기
              </h3>
              <p className="text-xs text-brand-mute">
                날짜별로 최근 비전 이벤트를 확인해요.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="닫기"
              className="w-9 h-9 rounded-full flex items-center justify-center text-brand-mute touch-active shrink-0 border border-dashed border-brand-brown/20"
              style={{ backgroundColor: BG_INFO }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <LogDatePicker
            items={items}
            open={calendarOpen}
            selectedDate={selectedDate}
            onToggle={() => setCalendarOpen((open) => !open)}
            onSelectDate={(dateKey) => {
              setSelectedDate(dateKey);
              setCalendarOpen(false);
            }}
            onClearDate={() => setSelectedDate("")}
            className="mt-4"
          />

          <div className="mt-4 max-h-[62dvh] overflow-y-auto no-scrollbar rounded-[18px] overflow-hidden">
            {groups.length === 0 && (
              <div className="px-4 py-10 flex flex-col items-center text-center bg-brand-card">
                <span className="w-14 h-14 rounded-full flex items-center justify-center mb-3 border border-dashed border-brand-brown/20" style={{ backgroundColor: BG_INFO }}>
                  <Video className="w-7 h-7 text-brand-primary/70" />
                </span>
                <p className="text-sm font-semibold text-brand-mute">
                  아직 기록된 이벤트가 없어요.
                </p>
              </div>
            )}
            {groups.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-10 px-4 py-2 bg-brand-cream/95 backdrop-blur text-[11px] font-bold text-brand-mute border-y border-brand-line/70 first:border-t-0">
                  {group.label}
                </div>
                <div className="divide-y divide-brand-line/70">
                  {group.items.map((event) => {
                    const Icon = event.icon || EVENT_ICON[event.eventType] || Video;
                    const hasMedia = !!(event.storage_path || event.clip_id);
                    return (
                      <div
                        key={event.id}
                        className="w-full flex items-center gap-2 px-4 py-3.5 bg-brand-card"
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(event)}
                          className="flex-1 min-w-0 flex items-center gap-3 text-left active:bg-brand-cream/60 transition-colors rounded-2xl"
                        >
                          <span
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-dashed ${event.danger ? "bg-brand-danger/15 text-brand-danger border-brand-danger/30" : event.warning ? "bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))] border-[rgb(var(--brand-warning-ink)/0.3)]" : "bg-brand-primary/15 text-brand-primary border-brand-primary/30"}`}
                          >
                            <Icon className="w-5 h-5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-brand-brown truncate">
                              {event.type}
                            </p>
                            <p className="text-xs text-brand-mute truncate">
                              {event.location}
                              {hasMedia ? "" : " · 미디어 없음"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge tone={event.danger ? "danger" : event.warning ? "warn" : "primary"}>
                              {hasMedia ? "VOD" : "기록"}
                            </Badge>
                            <span className="text-[11px] text-brand-mute">{event.time}</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(domEvent) => onDelete(event, domEvent)}
                          className="w-9 h-9 rounded-2xl text-brand-mute flex items-center justify-center shrink-0 border border-dashed border-brand-brown/15 active:bg-brand-danger/10 active:text-brand-danger transition-colors"
                          style={{ backgroundColor: BG_INFO }}
                          aria-label="로그 삭제"
                          title="로그 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClipModal({ clip, onClose }) {
  const [show, setShow] = useState(false);
  const [mediaUrl, setMediaUrl] = useState(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const Icon = clip.icon || Video;
  const isCapture = clip.eventType === "capture_saved";
  const isAwayPerson = clip.eventType === "away_person";
  const hasMedia = !!(clip.storage_path || clip.clip_id);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setMediaUrl(null);
    setMediaFailed(false);
    if (clip?.storage_path) {
      setMediaUrl(api.getVisionMediaUrl(clip.storage_path));
      return undefined;
    }
    if (!clip?.clip_id) return undefined;
    let alive = true;
    api
      .getClipUrl(clip.clip_id)
      .then((u) => {
        if (alive && u) setMediaUrl(u);
      })
      .catch(() => {
        if (alive && clip.storage_path)
          setMediaUrl(resolveMediaUrl(clip.storage_path));
      });
    return () => {
      alive = false;
    };
  }, [clip]);

  const dismiss = () => {
    setShow(false);
    setTimeout(onClose, 280);
  };
  const showImage = isCapture && mediaUrl && !mediaFailed;
  const showVideo = !isCapture && mediaUrl && !mediaFailed;
  const openLocalPath = () => {
    if (!clip.storage_path) return;
    api.revealVisionMedia(clip.storage_path).catch((error) => {
      console.error("[RobotVision] reveal media failed:", error);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={dismiss}
    >
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: "rgba(45,37,32,0.45)", opacity: show ? 1 : 0 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-b-3xl px-5 pt-3 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{
          backgroundColor: BG_CARD,
          transform: show ? "translateY(0)" : "translateY(100%)",
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
        }}
      >
        <Stitch className="!inset-[8px] !rounded-[22px]" />
        <div className="mx-auto w-10 h-1.5 rounded-full bg-brand-line mb-4" />

        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <span
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-dashed ${clip.danger ? "bg-brand-danger/15 text-brand-danger border-brand-danger/30" : "bg-brand-primary/15 text-brand-primary border-brand-primary/30"}`}
          >
            <Icon className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-bold text-brand-brown leading-tight">
              {clip.type}
            </h3>
            <p className="text-xs text-brand-mute">오늘 {clip.time}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="닫기"
            className="w-9 h-9 rounded-full flex items-center justify-center text-brand-mute touch-active shrink-0 border border-dashed border-brand-brown/20"
            style={{ backgroundColor: BG_INFO }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isAwayPerson && (
          <div className="mt-4 rounded-2xl bg-brand-danger/10 p-4 flex items-start gap-3">
            <span className="w-9 h-9 rounded-2xl bg-brand-danger/15 text-brand-danger flex items-center justify-center shrink-0">
              <UserX className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-danger">{clip.type}</p>
              <p className="mt-1 text-sm text-brand-brown/80">{clip.desc}</p>
            </div>
          </div>
        )}

        {/* 영상 */}
        <div className="mt-4 relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-brand-brown to-black">
            {hasMedia ? (
              <>
                {showImage ? (
                  <img
                    src={mediaUrl}
                    alt={clip.type}
                    onError={() => setMediaFailed(true)}
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                  />
                ) : showVideo ? (
                  <video
                    src={mediaUrl}
                    controls
                    playsInline
                    preload="metadata"
                    onError={() => setMediaFailed(true)}
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-2">
                    <span className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                      {isCapture ? (
                        <Camera className="w-6 h-6" />
                      ) : (
                        <Play className="w-6 h-6 ml-0.5" />
                      )}
                    </span>
                    <span className="text-[11px] font-semibold">
                      {mediaFailed
                        ? "미리보기를 불러오지 못했어요"
                        : "미리보기 준비 중"}
                    </span>
                  </div>
                )}
                <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold pointer-events-none">
                  {isCapture ? (
                    <Camera className="w-3.5 h-3.5" />
                  ) : (
                    <Video className="w-3.5 h-3.5" />
                  )}
                  {isCapture ? "CAPTURE" : "REC"}
                </span>
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold pointer-events-none">
                  <MapPin className="w-3.5 h-3.5" /> {clip.location}
                </span>
                {!showVideo && clip.duration && (
                  <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-bold tabular-nums pointer-events-none">
                    00:{String(clip.duration).padStart(2, "0")}
                  </span>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/75 text-sm font-semibold">
                저장된 미디어가 없는 이벤트예요
              </div>
            )}
        </div>

        {/* 메타 */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl p-3.5 border border-dashed border-brand-brown/15" style={{ backgroundColor: BG_INFO }}>
            <p className="flex items-center gap-1 text-[11px] font-bold text-brand-mute">
              <span className="text-brand-primary-deep"><Clock className="w-4 h-4" /></span> 탐지 시각
            </p>
            <p className="mt-1 font-display text-lg font-bold text-brand-brown leading-none">
              {clip.time}
            </p>
          </div>
          <button
            type="button"
            onClick={openLocalPath}
            disabled={!clip.storage_path}
            className="rounded-2xl p-3.5 text-left border border-dashed border-brand-brown/15 disabled:cursor-default active:bg-brand-line/40"
            style={{ backgroundColor: BG_INFO }}
            title={clip.storage_path || clip.location}
          >
            <p className="flex items-center gap-1 text-[11px] font-bold text-brand-mute">
              <span className="text-brand-primary-deep"><MapPin className="w-4 h-4" /></span> 위치
            </p>
            <p className="mt-1 font-display text-lg font-bold text-brand-brown leading-none truncate">
              {clip.location}
            </p>
          </button>
        </div>

        {clip.danger && (
          <div className="mt-3 rounded-2xl bg-brand-danger/10 p-3.5 flex items-center gap-2">
            <UserX className="w-5 h-5 text-brand-danger shrink-0" />
            <p className="text-sm font-bold text-brand-danger">
              주의가 필요한 감지예요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StreamFrame({
  src,
  mode,
  error,
  className = "",
  fullscreen = false,
  onStatusChange,
}) {
  const [imageError, setImageError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setImageError(false);
    setLoaded(false);
  }, [src]);

  // connecting(주소 확인/로딩 중) → live(실제 로드됨) / off(실패)
  const status =
    error || imageError ? "off" : src && loaded ? "live" : "connecting";
  const showFallback = status !== "live";

  // 실제 스트림 연결 상태를 부모에 알림 (LIVE/연결중/오프라인 배지용)
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  return (
    <div
      className={`${className} bg-brand-cream dark:bg-black flex items-center justify-center overflow-hidden`}
    >
      {src && !imageError && (
        <>
          <img
            src={src}
            alt="Robot camera live stream"
            onError={() => setImageError(true)}
            onLoad={() => { setImageError(false); setLoaded(true) }}
            className="w-full h-full object-contain bg-black brightness-95 saturate-[0.95] dark:brightness-[0.78] dark:saturate-90"
            style={VISION_FLIP_HORIZONTAL ? { transform: "scaleX(-1)" } : undefined}
          />
          {/* 심플·모던: 상하 은은한 그라데이션으로 차분하게 + 배지 가독성 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/35" />
        </>
      )}
      {showFallback && (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-cream via-brand-line to-brand-line dark:from-[#2b2520] dark:via-[#1f1815] dark:to-black flex items-center justify-center text-brand-mute dark:text-white/75">
          {/* 글래스 빛 반사(sheen) + 유리 테두리 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/50 via-white/5 to-transparent dark:from-white/10 dark:via-white/0" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/40 dark:ring-white/10" />
          <div className="relative text-center px-6">
            <span className={`${fullscreen ? "w-20 h-20 mb-3" : "w-16 h-16 mb-2.5"} mx-auto rounded-full flex items-center justify-center bg-white/40 dark:bg-white/10 backdrop-blur-md ring-1 ring-inset ring-white/50 dark:ring-white/15 shadow-sm`}>
              <Video className={`${fullscreen ? "w-9 h-9" : "w-7 h-7"} opacity-80`} />
            </span>
            <p className="text-sm font-semibold">
              {status === "off" ? "카메라 스트림 연결 대기 중" : "연결 중…"}
            </p>
            <p className="mt-1 text-xs opacity-70">
              {mode === "simulated" ? "시뮬레이션 스트림" : "MJPEG 실시간 캠"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

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

/* 후방 초음파 경고 오버레이 — 하단 테두리 글로우(깜빡) + 반투명 토스트.
 * sensor: { distance_cm, rear_obstacle, threshold_cm } (백엔드 /vision/detections/latest 의 rear_sensor) */
function RearWarning({ sensor, className = "", large = false }) {
  if (!sensor) return null;
  const dist = sensor.distance_cm;
  const thr = sensor.threshold_cm ?? 15; // 위험 임계(아두이노 장애물 ON 기준, 보통 15cm)
  const WARN_CM = 40; // 주의 임계: 위험~40cm 사이는 '접근 중'
  const danger = sensor.rear_obstacle || (dist != null && dist <= thr); // 🔴 ≤15cm
  const warn = !danger && dist != null && dist <= WARN_CM; // 🟡 15~40cm
  if (!danger && !warn) return null; // 🟢 >40cm 숨김

  // 위험도별 색: 위험=빨강, 접근=주황 (토큰이라 라이트/다크 자동 대응)
  const colorVar = danger ? "var(--brand-danger)" : "var(--brand-warning)";
  const distLabel = dist != null ? `${dist}cm` : ""; // 후방 거리(cm) — 폴링값이라 실시간 갱신
  const label = danger ? "후방 장애물 감지!" : "후방 주의";

  // 전체화면(large)에서는 글로우·토스트를 키워서 한눈에 보이게
  const glow = large ? "inset 0 0 110px 30px" : "inset 0 0 55px 14px";
  const toastPos = large ? "top-7" : "top-4";
  const toastBox = large ? "gap-3 px-7 py-3.5" : "gap-2 px-4 py-2";
  const iconSize = large ? "w-7 h-7" : "w-4 h-4";
  const textSize = large ? "text-2xl" : "text-sm";

  return (
    <div className={`pointer-events-none overflow-hidden ${className}`}>
      {/* 사방(상하좌우) 테두리 글로우 — 가장자리에서 안쪽으로 번짐, 깜빡임(위험=빠르게) */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `${glow} rgb(${colorVar} / 0.7)`,
          // 위험색이 '딱' 꽂히도록 빠르게 스냅(0.12s). 깜빡임도 위험 시 더 긴박하게.
          transition: "box-shadow 0.12s ease",
          animation: `pulse ${danger ? 0.5 : 1.2}s ease-in-out infinite`,
        }}
      />
      {/* 반투명 경고 토스트 (중앙 상단) */}
      <div className={`absolute ${toastPos} left-1/2 -translate-x-1/2`}>
        <div
          className={`flex items-center rounded-full bg-black/60 shadow-soft-lg backdrop-blur-sm ${toastBox}`}
          style={{
            border: `${large ? 2 : 1.5}px solid rgb(${colorVar})`,
            transition: "border-color 0.12s ease",
          }}
        >
          <ShieldAlert
            className={`${iconSize} shrink-0`}
            style={{ color: `rgb(${colorVar})`, transition: "color 0.12s ease" }}
          />
          <span className={`whitespace-nowrap font-bold text-white ${textSize}`}>
            ⚠️ {label}
            {distLabel && (
              <span
                className="ml-1"
                style={{ color: `rgb(${colorVar})`, transition: "color 0.12s ease" }}
              >
                · {distLabel}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/* 후방 충돌감지 센서 상태칩 — 라이브(fresh)면 초록 ON, 끊기면 빨강 OFF.
 * compact=true(작은 창): 아이콘만 / compact=false(전체화면): "후방 충돌감지 ON/OFF" 텍스트. */
function RearSensorChip({ sensor, compact = false }) {
  const active = !!sensor?.fresh;
  const color = active ? "rgb(var(--brand-success))" : "rgb(var(--brand-danger))";
  const title = `후방 충돌감지 ${active ? "ON" : "OFF"}`;

  if (compact) {
    // 작은 창 — 아이콘만(시야 방해 최소). 색으로 ON/OFF, OFF면 붉은 테두리로 눈에 띄게.
    return (
      <span
        title={title}
        aria-label={title}
        className="flex items-center justify-center w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm"
        style={{ border: active ? "none" : "1.5px solid rgb(var(--brand-danger))" }}
      >
        <Activity className="w-4 h-4" style={{ color }} />
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-bold">
      <Activity className="w-3.5 h-3.5" style={{ color }} />
      후방 충돌감지 {active ? "ON" : "OFF"}
    </span>
  );
}

function DetectionOverlay({ detections, className = "" }) {
  const boxes = detections?.boxes || [];
  const frameWidth = detections?.frame_width || 0;
  const frameHeight = detections?.frame_height || 0;
  const updatedAt = detections?.updated_at || 0;
  const isFresh = updatedAt && Date.now() / 1000 - updatedAt < 2;

  if (!isFresh || !frameWidth || !frameHeight || boxes.length === 0) {
    return <div className={`${className} pointer-events-none`} />;
  }

  return (
    <div className={`${className} pointer-events-none flex items-center justify-center overflow-hidden`}>
      <div
        className="relative max-w-full max-h-full"
        style={{
          height: "100%",
          aspectRatio: `${frameWidth} / ${frameHeight}`,
        }}
      >
        {boxes.map((box, index) => {
          const left = (box.x / frameWidth) * 100;
          const top = (box.y / frameHeight) * 100;
          const width = (box.w / frameWidth) * 100;
          const height = (box.h / frameHeight) * 100;
          const label = `${box.label} ${Math.round((box.confidence || 0) * 100)}%`;

          return (
            <div
              key={`${box.label}-${index}-${box.x}-${box.y}`}
              className="absolute border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
              }}
            >
              <span className="absolute left-0 top-0 -translate-y-full rounded-t-md bg-black/70 px-2 py-0.5 text-[11px] font-bold text-emerald-200">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 표준 십자(Cross) D-Pad.
 *  - 외형: 평범한 cross 레이아웃 (전체 패드는 발바닥 모양 아님).
 *  - 각 방향 버튼 아이콘만 고양이 발바닥(PawPrint)으로.
 *  - 영상 위 시인성을 위해 반투명 배경 + 블러.
 *  - 누름 피드백: scale 변화 없이 배경색만 brand-brown 으로 즉시 전환.
 */
function DPad({
  centerAction = null,
  className = "",
  holdToPress = false,
  repeatMs,
  label,
  onPress,
  onRelease = null,
  muted = false,
  tone = "dark",
  disabledDir = null,
}) {
  const light = tone === "light";
  const baseBg = light
    ? "bg-brand-cream"
    : muted
      ? "bg-white/12"
      : "bg-white/18";
  const labelBox = light
    ? "bg-brand-primary/15 text-brand-primary"
    : "bg-black/35 backdrop-blur-sm text-white/85";
  return (
    <div className={className}>
      <div className="relative">
        <div className="grid grid-cols-3 gap-1.5 w-[148px]">
          <span />
          <DBtn
            onClick={() => onPress("up")}
            onRelease={onRelease}
            holdToPress={holdToPress}
            repeatMs={repeatMs}
            bg={baseBg}
            tone={tone}
            aria="Up"
          />
          <span />
          <DBtn
            onClick={() => onPress("left")}
            onRelease={onRelease}
            holdToPress={holdToPress}
            repeatMs={repeatMs}
            bg={baseBg}
            tone={tone}
            aria="Left"
            rotate="rotate-[270deg]"
          />
          {centerAction ? (
            <CenterBtn onClick={() => onPress(centerAction)} tone={tone} />
          ) : (
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center ${labelBox}`}
            >
              <span className="text-[10px] font-bold tracking-wider">
                {label}
              </span>
            </div>
          )}
          <DBtn
            onClick={() => onPress("right")}
            onRelease={onRelease}
            holdToPress={holdToPress}
            repeatMs={repeatMs}
            bg={baseBg}
            tone={tone}
            aria="Right"
            rotate="rotate-90"
          />
          <span />
          <DBtn
            onClick={() => onPress("down")}
            onRelease={onRelease}
            holdToPress={holdToPress}
            repeatMs={repeatMs}
            bg={baseBg}
            tone={tone}
            aria="Down"
            rotate="rotate-180"
            disabled={disabledDir === "down"}
          />
          <span />
        </div>
      </div>
    </div>
  );
}

function DBtn({
  onClick,
  onRelease = null,
  holdToPress = false,
  repeatMs = MOVE_HOLD_REPEAT_MS,
  bg,
  aria,
  rotate = "",
  tone = "dark",
  disabled = false,
}) {
  const activePointerRef = useRef(null);
  const holdTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        window.clearInterval(holdTimerRef.current);
      }
    };
  }, []);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const startPress = (event) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointerRef.current = event.pointerId;
    onClick();
    clearHoldTimer();
    if (holdToPress) {
      holdTimerRef.current = window.setInterval(onClick, repeatMs);
    }
  };

  const endPress = (event) => {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    clearHoldTimer();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (holdToPress && onRelease) {
      onRelease();
    }
  };

  if (disabled) {
    // 후방 장애물로 잠긴 버튼 — 누름 무효, 잠금 아이콘 + 붉은 점선 테두리
    return (
      <div
        aria-label={`${aria} (잠김)`}
        aria-disabled="true"
        className="w-12 h-12 rounded-2xl flex items-center justify-center bg-brand-danger/15 border border-dashed border-brand-danger/60 cursor-not-allowed"
        style={{ color: "rgb(var(--brand-danger))" }}
      >
        <Lock className="w-4 h-4" strokeWidth={2.2} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        if (event.detail === 0) {
          onClick();
          if (holdToPress && onRelease) {
            onRelease();
          }
        }
      }}
      onPointerCancel={endPress}
      onPointerDown={startPress}
      onPointerUp={endPress}
      aria-label={aria}
      className={`
        w-12 h-12 rounded-2xl
        ${bg}
        flex items-center justify-center
        transition-colors duration-75
        ${
          tone === "light"
            ? "text-brand-brown shadow-soft active:bg-brand-primary active:text-white"
            : "backdrop-blur-sm text-white shadow-md active:bg-brand-brown"
        }
      `}
    >
      <PawPrint className={`w-5 h-5 ${rotate}`} strokeWidth={2.2} />
    </button>
  );
}

function CenterBtn({ onClick, tone = "dark" }) {
  const light = tone === "light";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Center"
      className={`
        w-12 h-12 rounded-2xl
        flex items-center justify-center
        transition-colors duration-75
        ${
          light
            ? "bg-brand-primary/15 text-brand-primary shadow-soft active:bg-brand-primary active:text-white"
            : "bg-black/45 backdrop-blur-sm text-white shadow-md active:bg-brand-brown"
        }
      `}
    >
      <span className="text-[9px] font-bold tracking-wider">CENTER</span>
    </button>
  );
}

/**
 * 마이크 버튼 - 클릭으로 ON/OFF 토글.
 */
function MicButton({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? "마이크 끄기" : "마이크 켜기"}
      className={`
        w-11 h-11 rounded-full shadow-md flex items-center justify-center
        transition-colors
        ${
          on
            ? "bg-brand-primary text-white active:bg-brand-brown ring-2 ring-white/60"
            : "bg-white/15 backdrop-blur-sm text-white/85 active:bg-brand-brown"
        }
      `}
    >
      {on ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
    </button>
  );
}

export default RobotVision;
