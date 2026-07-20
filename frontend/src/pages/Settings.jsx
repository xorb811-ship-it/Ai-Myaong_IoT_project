import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wifi,
  Bell,
  Power,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Info,
  Lock,
  Cpu,
  Check,
  X,
  Moon,
} from '../components/icons';
import {
  ToggleSwitch,
  Badge,
  PrimaryButton,
  GhostButton,
} from "../components/ui";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../theme/ThemeProvider";
import { api } from "../api/api";
import { requestPushPermission } from "../lib/notificationRepository";

const ESP32_SETUP_URL_KEY = "aimyaong:esp32SetupUrl";
const ROBOT_SERIAL_KEY = "aimyaong:robotSerial";
const PRESENCE_GATE_KEY = "aimyaong:presenceGateEnabled";
const ROBOT_DEVICE_CLAIM_ENABLED =
  import.meta.env.VITE_ROBOT_DEVICE_CLAIM_ENABLED === "true";
const DEFAULT_ESP32_SETUP_URL =
  import.meta.env.VITE_ESP32_SETUP_URL || "http://192.168.4.1";

// 카드 배경: 흰색 80% + 크림 20% (대시보드·마이페이지와 동일) / 정보·칩: 따뜻한 탄
const BG_CARD = "color-mix(in srgb, rgb(var(--brand-card)) 80%, rgb(var(--brand-cream)) 20%)";
const BG_INFO = "color-mix(in srgb, rgb(var(--brand-cream)) 78%, rgb(var(--brand-mute)) 22%)";
// 은은한 갈색 강조 — 크림 베이스에 갈색을 아주 살짝(약 5%)만 섞어 깔끔하게 (통일감 유지)
const BG_HILITE = "color-mix(in srgb, rgb(var(--brand-cream)) 95%, rgb(var(--brand-brown)) 5%)";

/* 안쪽 점선 바느질 테두리 (펠트 느낌) */
function Stitch({ className = "" }) {
  return (
    <span className={`pointer-events-none absolute inset-[6px] rounded-[18px] border border-dashed border-brand-brown/15 ${className}`} />
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

/* 펠트 카드 컨테이너 — BG_CARD + 점선 스티치 (콘텐츠는 z-10) */
function FeltCard({ className = "", innerClassName = "", decorations = null, bg = BG_CARD, accent = false, children }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl shadow-soft ${className}`} style={{ backgroundColor: bg }}>
      <Stitch />
      {/* 왼쪽 갈색 액센트 바 (강조 카드) */}
      {accent && <span className="pointer-events-none absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-brand-brown/40" />}
      {decorations}
      <div className={`relative z-10 ${innerClassName}`}>{children}</div>
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [pushOn, setPushOn] = useState(true);
  const [motionAlert, setMotionAlert] = useState(true);
  const [strangerAlert, setStrangerAlert] = useState(true);
  const [feedAlert, setFeedAlert] = useState(false);
  const [setupUrl, setSetupUrl] = useState(() =>
    readLocal(ESP32_SETUP_URL_KEY, DEFAULT_ESP32_SETUP_URL),
  );
  const [wifiStatus, setWifiStatus] = useState(null);
  const [networks, setNetworks] = useState([]);
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [selectedSsid, setSelectedSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [networkBusy, setNetworkBusy] = useState(false);
  const [networkMessage, setNetworkMessage] = useState("");
  const [piNetworkStatus, setPiNetworkStatus] = useState(null);
  const [piApFallback, setPiApFallback] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sheetNetwork, setSheetNetwork] = useState(null); // 연결하려는 네트워크
  const [showAppInfo, setShowAppInfo] = useState(false); // 앱 정보(빌드 현황) 시트
  const [tareBusy, setTareBusy] = useState("");
  const [tareMessage, setTareMessage] = useState("");
  const [presenceGateEnabled, setPresenceGateEnabled] = useState(
    () => readLocal(PRESENCE_GATE_KEY, "false") === "true",
  );
  const [presenceBusy, setPresenceBusy] = useState(false);

  useEffect(() => writeLocal(ESP32_SETUP_URL_KEY, setupUrl), [setupUrl]);

  // ESP32 설정 주소 변경 시 디바운스 후 DB 저장 (초기/로드값은 건너뜀)
  const esp32Ready = useRef(false);
  useEffect(() => {
    if (!esp32Ready.current) {
      esp32Ready.current = true;
      return;
    }
    const t = setTimeout(() => {
      saveSettings({ esp32_setup_url: setupUrl });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupUrl]);

  // 로봇 시리얼 번호 (기기 등록)
  const [serial, setSerial] = useState(() =>
    ROBOT_DEVICE_CLAIM_ENABLED ? "" : readLocal(ROBOT_SERIAL_KEY, ""),
  );
  const [serialInput, setSerialInput] = useState("");
  const [serialBusy, setSerialBusy] = useState(false);
  const [serialMessage, setSerialMessage] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberMessage, setMemberMessage] = useState("");
  const [robotRole, setRobotRole] = useState("");
  const [serialPanelOpen, setSerialPanelOpen] = useState(false);
  const [memberPanelOpen, setMemberPanelOpen] = useState(false);
  const [robotActionBusy, setRobotActionBusy] = useState("");
  const [robotActionMessage, setRobotActionMessage] = useState("");
  useEffect(() => {
    if (!ROBOT_DEVICE_CLAIM_ENABLED) {
      writeLocal(ROBOT_SERIAL_KEY, serial);
      return;
    }
    if (serial) writeLocal(ROBOT_SERIAL_KEY, serial);
    else {
      try {
        localStorage.removeItem(ROBOT_SERIAL_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [serial]);

  // settings 일부 필드 DB 저장 (실패해도 로컬은 유지)
  const saveSettings = (patch) => {
    api.updateSettings(patch).catch(() => {});
  };

  const updateMotionAlert = async (value) => {
    const previous = motionAlert;
    setMotionAlert(value);
    try {
      await api.setVisionEmergency(value);
    } catch {
      setMotionAlert(previous);
    }
  };

  const updatePushEnabled = async (value) => {
    if (value) await requestPushPermission();
    setPushOn(value);
    saveSettings({ push_enabled: value ? "Y" : "N" });
  };

  // 알림 제어 상태를 localStorage 에 미러 → notificationRepository 가 발송 전 확인 (꺼진 알림 차단)
  useEffect(() => {
    try {
      localStorage.setItem(
        "aimyaong:alertSettings",
        JSON.stringify({
          push_enabled: pushOn,
          motion_alert: motionAlert,
          stranger_alert: strangerAlert,
          feed_alert: feedAlert,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [pushOn, motionAlert, strangerAlert, feedAlert]);

  // 마운트 시 DB 설정 불러오기 (있으면 화면 상태에 반영)
  useEffect(() => {
    api
      .getSettings()
      .then(async (s) => {
        setPushOn(s.push_enabled !== "N");
        setMotionAlert(s.motion_alert !== "N");
        setStrangerAlert(s.stranger_alert !== "N");
        setFeedAlert(s.feed_alert === "Y");
        if (s.dark_mode) setTheme(s.dark_mode); // DB 테마 → 화면 반영
        if (ROBOT_DEVICE_CLAIM_ENABLED) {
          try {
            const result = await api.getMyRobotDevices();
            const authorizedDevice = result.devices?.[0] || null;
            const authorizedSerial = authorizedDevice?.robot_serial || "";
            setSerial(authorizedSerial);
            setRobotRole(authorizedDevice?.role || "");
            if (authorizedSerial && s.robot_serial !== authorizedSerial) {
              saveSettings({ robot_serial: authorizedSerial });
            }
            if (!authorizedSerial && s.robot_serial) {
              saveSettings({ robot_serial: "" });
            }
          } catch {
            setSerial("");
            setRobotRole("");
          }
        } else if (s.robot_serial) {
          setSerial(s.robot_serial);
          setRobotRole("OWNER");
        }
        // esp32/mqtt: DB에 있으면 반영, 없으면(null) 현재 기본값을 DB에 자동 저장
        const patch = {};
        if (s.esp32_setup_url) setSetupUrl(s.esp32_setup_url);
        else patch.esp32_setup_url = setupUrl;
        if (Object.keys(patch).length) saveSettings(patch);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 테마(라이트/다크/시스템) 변경 시 DB 저장 (마운트 첫 렌더는 건너뜀)
  const themeFirst = useRef(false);
  useEffect(() => {
    if (!themeFirst.current) {
      themeFirst.current = true;
      return;
    }
    saveSettings({ dark_mode: theme });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const registerSerial = async () => {
    const v = serialInput.trim().toUpperCase();
    if (!v) return;
    setSerialBusy(true);
    setSerialMessage("");
    try {
      if (ROBOT_DEVICE_CLAIM_ENABLED) {
        const claimed = await api.claimRobotDevice(v);
        setRobotRole(claimed.role || "OWNER");
        setSerialMessage("로봇 등록이 완료되었습니다.");
      } else {
        setSerialMessage("시리얼 번호가 임시 저장되었습니다. DB 반영 후 기기 인증으로 전환됩니다.");
      }
      setSerial(v);
      setSerialInput("");
      if (!ROBOT_DEVICE_CLAIM_ENABLED) {
        saveSettings({ robot_serial: v });
      }
    } catch (error) {
      setSerialMessage(error.message || "로봇 등록에 실패했습니다.");
    } finally {
      setSerialBusy(false);
    }
  };
  const unregisterSerial = async () => {
    if (!serial) return;
    setSerialBusy(true);
    setSerialMessage("");
    try {
      if (ROBOT_DEVICE_CLAIM_ENABLED) {
        await api.releaseRobotDevice(serial);
      } else {
        saveSettings({ robot_serial: "" });
      }
      setSerial("");
      setRobotRole("");
      setMemberEmail("");
      setMemberMessage("");
      setSerialMessage("시리얼 번호 연결을 해제했습니다.");
    } catch (error) {
      setSerialMessage(error.message || "시리얼 번호 해제에 실패했습니다.");
    } finally {
      setSerialBusy(false);
    }
  };

  const grantMemberAccess = async () => {
    const email = memberEmail.trim().toLowerCase();
    if (!serial || !email) return;
    setMemberBusy(true);
    setMemberMessage("");
    try {
      if (ROBOT_DEVICE_CLAIM_ENABLED) {
        await api.grantRobotDeviceMember({
          robotSerial: serial,
          userEmail: email,
        });
        setMemberMessage(`${email} 사용자에게 로봇 사용 권한을 부여했습니다.`);
      } else {
        setMemberMessage("DB 반영 후 사용자 권한 부여 기능을 사용할 수 있습니다.");
      }
      setMemberEmail("");
    } catch (error) {
      setMemberMessage(error.message || "권한 부여에 실패했습니다.");
    } finally {
      setMemberBusy(false);
    }
  };

  const runRobotSystemAction = async (action) => {
    if (!serial || robotActionBusy) return;
    setRobotActionBusy(action);
    setRobotActionMessage("");
    try {
      if (action === "reboot") {
        await api.rebootRobot();
        setRobotActionMessage("로봇 재부팅 명령을 보냈습니다.");
      } else if (action === "powerOff") {
        await api.setRobotPower(false);
        setRobotActionMessage("로봇 전원 OFF 명령을 보냈습니다.");
      } else if (action === "powerOn") {
        await api.setRobotPower(true);
        setRobotActionMessage("로봇 전원 ON 명령을 보냈습니다.");
      }
    } catch (error) {
      setRobotActionMessage(error.message || "로봇 명령 전송에 실패했습니다.");
    } finally {
      setRobotActionBusy("");
    }
  };

  const selectedIsCompatible =
    selectedNetwork?.compatible ?? selectedNetwork?.esp32Compatible ?? true;

  useEffect(() => {
    refreshWifiStatus();
    refreshPiNetworkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function esp32Request(path, options = {}) {
    const base = setupUrl.replace(/\/$/, "");
    const response = await fetch(`${base}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `ESP32 API error: ${response.status}`);
    }
    return data;
  }

  async function refreshWifiStatus({ silent = false } = {}) {
    try {
      if (!silent) setNetworkMessage("");
      const data = await esp32Request("/api/wifi/status");
      setWifiStatus(data);
    } catch {
      setWifiStatus(null);
      if (!silent) setNetworkMessage("ESP32 설정 주소에 연결할 수 없습니다.");
    }
  }

  async function scanWifi() {
    setNetworkBusy(true);
    setNetworkMessage("라즈베리파이에서 주변 Wi-Fi를 검색하는 중입니다.");
    try {
      let data;
      try {
        data = await api.scanPiWifi();
      } catch {
        setNetworkMessage(
          "라즈베리파이 스캔 실패. ESP32 스캔으로 다시 시도합니다.",
        );
        data = await esp32Request("/api/wifi/scan");
      }
      const nextNetworks = data.networks || [];
      setNetworks(nextNetworks);
      setSelectedNetwork(null);
      setNetworkMessage(
        nextNetworks.length
          ? "검색 완료. 연결할 Wi-Fi를 선택하세요."
          : "검색된 Wi-Fi가 없습니다.",
      );
      await refreshWifiStatus({ silent: true });
    } catch (error) {
      setNetworkMessage(error.message || "Wi-Fi 검색에 실패했습니다.");
    } finally {
      setNetworkBusy(false);
    }
  }

  async function connectWifi() {
    if (!selectedSsid) {
      setNetworkMessage("연결할 Wi-Fi를 선택해 주세요.");
      return;
    }
    if (!selectedIsCompatible) {
      setNetworkMessage(
        "선택한 Wi-Fi는 ESP32가 지원하지 않습니다. 2.4GHz 네트워크를 선택하세요.",
      );
      return;
    }

    setNetworkBusy(true);
    setNetworkMessage("ESP32에 Wi-Fi 설정을 저장하는 중입니다.");
    try {
      const data = await esp32Request("/api/wifi/connect", {
        method: "POST",
        body: JSON.stringify({
          ssid: selectedSsid,
          password: wifiPassword,
          reboot: false,
        }),
      });
      setNetworkMessage(
        data.rebooting
          ? "저장 완료. ESP32가 재부팅됩니다."
          : data.connected
            ? `연결됨. ${data.ip}`
            : "저장 완료.",
      );
      await refreshWifiStatus({ silent: true });
    } catch (error) {
      setNetworkMessage(
        error.message || "ESP32 Wi-Fi 설정 저장에 실패했습니다.",
      );
    } finally {
      setNetworkBusy(false);
    }
  }

  async function refreshPiNetworkStatus() {
    try {
      const data = await api.getNetworkStatus();
      setPiNetworkStatus(data);
    } catch {
      setPiNetworkStatus(null);
    }
  }

  async function applySharedWifi() {
    if (!selectedSsid) {
      setNetworkMessage("같이 적용할 Wi-Fi를 선택해 주세요.");
      return;
    }
    if (!selectedIsCompatible) {
      setNetworkMessage(
        "선택한 Wi-Fi는 ESP32가 지원하지 않습니다. 2.4GHz 네트워크를 선택하세요.",
      );
      return;
    }

    setNetworkBusy(true);
    setNetworkMessage("라즈베리파이와 ESP32 설정을 같이 적용하는 중입니다.");
    try {
      let data;
      try {
        data = await api.configurePiWifi({
          ssid: selectedSsid,
          password: wifiPassword,
          piApFallback,
        });
      } catch {
        data = await api.configureSharedWifi({
          ssid: selectedSsid,
          password: wifiPassword,
          piApFallback,
        });
      }
      const nextHost = data.raspberrypiEnv?.MQTT_BROKER_HOST;
      setNetworkMessage(
        nextHost ? `적용 완료. MQTT ${nextHost}:1883` : "적용 완료.",
      );
      await refreshPiNetworkStatus();
      await refreshWifiStatus({ silent: true });
    } catch (error) {
      setNetworkMessage(error.message || "공통 Wi-Fi 설정에 실패했습니다.");
    } finally {
      setNetworkBusy(false);
    }
  }

  async function tareDispenser(target) {
    setTareBusy(target);
    setTareMessage("");
    try {
      if (target === "food") await api.dispenserTareFood();
      else if (target === "water") await api.dispenserTareWater();
      else await api.dispenserTare();
      window.setTimeout(() => api.requestDispenserWeight().catch(() => {}), 700);
      const label = target === "food" ? "사료" : target === "water" ? "물" : "전체";
      setTareMessage(`${label} 영점 조정 명령을 전송했습니다. 영점은 ESP32에 저장됩니다.`);
    } catch (error) {
      setTareMessage(error.message || "영점 조정 명령 전송에 실패했습니다.");
    } finally {
      setTareBusy("");
    }
  }

  async function updatePresenceGate(enabled) {
    const previous = presenceGateEnabled;
    setPresenceGateEnabled(enabled);
    setPresenceBusy(true);
    try {
      await api.setDispenserPresenceGate(enabled);
      writeLocal(PRESENCE_GATE_KEY, String(enabled));
    } catch {
      setPresenceGateEnabled(previous);
    } finally {
      setPresenceBusy(false);
    }
  }

  // 네트워크 행 탭 → 연결 시트 열기
  const openWifiSheet = (network) => {
    setSelectedSsid(network.ssid);
    setWifiPassword("");
    setNetworkMessage("");
    setSheetNetwork(network);
  };

  // 시트에서 연결 (라즈베리파이 + ESP32 같이 적용)
  const connectSelected = async () => {
    await applySharedWifi();
    setSheetNetwork(null);
  };

  return (
    <div className="px-5 pb-6">
      {/* 헤더 + 뒤로가기 */}
      <header className="flex items-center gap-2.5 pt-5 pb-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="뒤로가기"
          className="w-9 h-9 -ml-1 flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="min-w-0">
          <h1 className="font-cute text-2xl font-bold text-brand-brown leading-tight">
            설정
          </h1>
          <p className="text-sm text-brand-mute truncate">
            기기와 알림을 관리해요
          </p>
        </div>
      </header>

      <section id="network" className="scroll-mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          네트워크
        </h3>

        {/* 현재 연결 상태 — 네트워크의 핵심 상태라 은은한 갈색으로 강조 */}
        <FeltCard
          bg={BG_HILITE}
          accent
          innerClassName="px-4 py-4 flex items-center gap-3 pl-5"
          decorations={
            <>
              <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute -right-3 -bottom-3 w-16 h-16 rotate-6" />
              <PaperIcon shape="heart" color="rgb(var(--brand-primary))" opacity={0.45} className="absolute right-5 top-3 w-3.5 h-3.5" />
            </>
          }
        >
          <span
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-dashed ${wifiStatus?.stationConnected ? "bg-brand-success/15 text-brand-success border-brand-success/30" : "bg-brand-warning/20 text-[rgb(var(--brand-warning-ink))] border-[rgb(var(--brand-warning-ink)/0.3)]"}`}
          >
            <Wifi className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brand-brown truncate">
              {wifiStatus?.ssid ||
                wifiStatus?.savedSsid ||
                piNetworkStatus?.wifiSsid ||
                "연결된 Wi-Fi 없음"}
            </p>
            <p className="text-xs text-brand-mute truncate">
              {wifiStatus?.stationConnected
                ? `${wifiStatus?.ip || ""} · MQTT ${wifiStatus?.mqttConnected ? "연결됨" : "대기"}`
                : "아래에서 네트워크를 선택해 연결하세요"}
            </p>
          </div>
          <Badge tone={wifiStatus?.stationConnected ? "success" : "warn"}>
            {wifiStatus?.stationConnected ? "연결됨" : "설정 모드"}
          </Badge>
        </FeltCard>

        {/* 사용 가능한 Wi-Fi (폰 스타일 목록) */}
        <div className="mt-4 flex items-center justify-between px-1 mb-2">
          <h4 className="text-sm font-bold text-brand-brown">
            사용 가능한 Wi-Fi
          </h4>
          <button
            type="button"
            onClick={scanWifi}
            disabled={networkBusy}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary touch-active disabled:opacity-50"
          >
            <RotateCw
              className={`w-3.5 h-3.5 ${networkBusy ? "animate-spin" : ""}`}
            />
            {networkBusy ? "검색 중" : "검색"}
          </button>
        </div>

        <FeltCard
          innerClassName={`divide-y divide-brand-line/70 ${
            networks.length > 5 ? "max-h-[296px] overflow-y-auto" : ""
          }`}
        >
          {networks.length === 0 ? (
            <button
              type="button"
              onClick={scanWifi}
              disabled={networkBusy}
              className="w-full px-4 py-8 text-center text-sm text-brand-mute touch-active"
            >
              {networkBusy
                ? "주변 Wi-Fi를 검색하는 중…"
                : "검색을 눌러 주변 Wi-Fi를 찾아보세요 🐾"}
            </button>
          ) : (
            networks.map((network, index) => {
              const level = signalLevel(network.rssi);
              const connected =
                wifiStatus?.stationConnected &&
                wifiStatus?.ssid === network.ssid;
              return (
                <button
                  key={`${network.ssid}-${network.channel}-${index}`}
                  type="button"
                  onClick={() => openWifiSheet(network)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left touch-active"
                >
                  <SignalIcon level={level} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-brand-brown truncate">
                      {network.ssid || "숨겨진 네트워크"}
                    </span>
                    {connected && (
                      <span className="block text-xs text-brand-success font-semibold">
                        연결됨
                      </span>
                    )}
                  </span>
                  {network.secure && (
                    <Lock className="w-4 h-4 text-brand-mute shrink-0" />
                  )}
                  <ChevronRight className="w-4 h-4 text-brand-mute shrink-0" />
                </button>
              );
            })
          )}
        </FeltCard>

        {/* 고급 설정 (접기) */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-3 w-full flex items-center justify-between px-1 text-xs font-bold text-brand-mute touch-active"
        >
          <span>고급 설정 (ESP32)</span>
          <ChevronRight
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
          />
        </button>
        {showAdvanced && (
          <FeltCard className="mt-2" innerClassName="p-4">
            <label className="block text-[11px] font-bold text-brand-mute pl-1">
              ESP32 설정 주소
            </label>
            <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
              <input
                value={setupUrl}
                onChange={(event) => setSetupUrl(event.target.value)}
                className="min-w-0 rounded-2xl border border-brand-line bg-brand-cream px-3 py-2 text-sm font-semibold text-brand-brown outline-none focus:border-brand-primary"
                placeholder="http://192.168.4.1"
              />
              <GhostButton
                className="px-3 py-2 text-sm rounded-2xl"
                onClick={refreshWifiStatus}
              >
                <RotateCw className="w-4 h-4" />
              </GhostButton>
            </div>


            <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-brand-cream px-3 py-2.5">
              <span className="text-xs font-bold text-brand-brown">
                실패 시 Pi AP 모드
              </span>
              <input
                type="checkbox"
                checked={piApFallback}
                onChange={(event) => setPiApFallback(event.target.checked)}
                className="h-4 w-4 accent-brand-primary"
              />
            </label>
            <PrimaryButton
              className="mt-3 w-full py-2.5 rounded-2xl text-sm"
              onClick={applySharedWifi}
              disabled={networkBusy || !selectedIsCompatible}
            >
              <Wifi className="w-4 h-4" />
              라즈베리파이 + ESP32 같이 적용
            </PrimaryButton>

            <GhostButton
              className="mt-3 w-full py-2.5 rounded-2xl text-sm"
              onClick={connectWifi}
              disabled={networkBusy}
            >
              ESP32 단독 연결
            </GhostButton>
          </FeltCard>
        )}


        {networkMessage && (
          <p className="mt-3 px-1 text-xs font-semibold text-brand-mute">
            {networkMessage}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          자동 급수 고양이 감지
        </h3>
        <FeltCard innerClassName="p-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-brand-cream text-brand-brown flex items-center justify-center shrink-0">
              <Wifi className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-brand-brown">감지 후 자동 급수</p>
              <p className="mt-1 text-xs font-semibold text-brand-mute">
                자동 스케줄 시간이 되면 고양이를 감지할 때까지 기다립니다. 수동 급수는 바로 실행됩니다.
              </p>
            </div>
            <ToggleSwitch
              checked={presenceGateEnabled}
              onChange={updatePresenceGate}
              label="자동 급수 고양이 감지"
              disabled={presenceBusy}
            />
          </div>
          <p className="mt-3 rounded-2xl bg-brand-cream px-3 py-2.5 text-xs font-semibold text-brand-brown">
            감지 대기는 최대 10분이며, 감지되지 않으면 해당 급수는 취소됩니다.
          </p>
        </FeltCard>
      </section>

      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          디스펜서 무게 영점
        </h3>
        <FeltCard innerClassName="p-4">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-2xl bg-brand-cream text-brand-brown flex items-center justify-center shrink-0">
              <Cpu className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-brown">용기를 완전히 비운 뒤 실행하세요</p>
              <p className="mt-1 text-xs font-semibold text-brand-mute">
                조정한 영점은 ESP32에 저장되어 재부팅 후에도 유지됩니다.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <GhostButton
              className="rounded-2xl py-2.5 text-sm"
              onClick={() => tareDispenser("food")}
              disabled={Boolean(tareBusy)}
            >
              {tareBusy === "food" ? "조정 중…" : "사료 영점"}
            </GhostButton>
            <GhostButton
              className="rounded-2xl py-2.5 text-sm"
              onClick={() => tareDispenser("water")}
              disabled={Boolean(tareBusy)}
            >
              {tareBusy === "water" ? "조정 중…" : "물 영점"}
            </GhostButton>
          </div>
          <PrimaryButton
            className="mt-2 w-full rounded-2xl py-2.5 text-sm"
            onClick={() => tareDispenser("all")}
            disabled={Boolean(tareBusy)}
          >
            {tareBusy === "all" ? "조정 중…" : "사료 + 물 전체 영점"}
          </PrimaryButton>
          {tareMessage && (
            <p className="mt-3 rounded-2xl bg-brand-cream px-3 py-2.5 text-xs font-semibold text-brand-brown">
              {tareMessage}
            </p>
          )}
        </FeltCard>
      </section>

      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          알림 제어
        </h3>
        <FeltCard
          innerClassName="divide-y divide-brand-line/70"
          decorations={
            <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.08} className="absolute -right-3 -bottom-3 w-16 h-16 rotate-6" />
          }
        >
          <Row
            highlight
            icon={<Bell className="w-5 h-5" />}
            title="푸시 알림"
            desc="모든 푸시 알림 전역 On/Off"
            right={
              <ToggleSwitch
                checked={pushOn}
                onChange={updatePushEnabled}
                label="푸시 알림"
              />
            }
          />
          <Row
            title="이상 행동 감지"
            desc="비정상 패턴 감지 시 알림"
            right={
              <ToggleSwitch
                checked={motionAlert}
                onChange={updateMotionAlert}
                label="이상 행동"
              />
            }
            disabled={!pushOn}
          />
          <Row
            title="외부인 감지"
            desc="등록되지 않은 사람 알림"
            right={
              <ToggleSwitch
                checked={strangerAlert}
                onChange={(v) => { setStrangerAlert(v); saveSettings({ stranger_alert: v ? "Y" : "N" }); }}
                label="외부인 감지"
              />
            }
            disabled={!pushOn}
          />
          <Row
            title="배식 완료 알림"
            desc="자동 배식이 끝났을 때"
            right={
              <ToggleSwitch
                checked={feedAlert}
                onChange={(v) => { setFeedAlert(v); saveSettings({ feed_alert: v ? "Y" : "N" }); }}
                label="배식 알림"
              />
            }
            disabled={!pushOn}
          />
        </FeltCard>
      </section>

      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          화면 테마
        </h3>
        <FeltCard
          innerClassName="px-4 py-4 flex items-center justify-between gap-3"
          decorations={
            <PaperIcon shape="heart" color="rgb(var(--brand-primary))" opacity={0.4} className="absolute right-24 top-4 w-3.5 h-3.5" />
          }
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-dashed border-brand-brown/20 text-brand-primary" style={{ backgroundColor: BG_INFO }}>
              <Moon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-brown">테마</p>
              <p className="text-xs text-brand-mute">라이트 · 다크</p>
            </div>
          </div>
          <ThemeToggle />
        </FeltCard>
      </section>

      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          기기 제어
        </h3>

        <button
          type="button"
          onClick={() => setSerialPanelOpen((open) => !open)}
          className="w-full flex items-center justify-between rounded-3xl px-4 py-3 shadow-soft touch-active"
          style={{ backgroundColor: BG_CARD }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center border border-dashed border-brand-primary/30">
              <Cpu className="w-4 h-4" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-xs font-bold text-brand-mute">기기 등록</span>
              <span className="block text-sm font-bold text-brand-brown truncate">
                로봇 시리얼 번호
              </span>
            </span>
          </span>
          <ChevronRight className={`w-5 h-5 text-brand-mute transition-transform ${serialPanelOpen ? "rotate-90" : ""}`} />
        </button>

        {serialPanelOpen && (
        <>
        {/* 로봇 시리얼 번호 (기기 등록) */}
        {serial ? (
          <FeltCard
            className="mt-3"
            innerClassName="px-4 py-4"
            decorations={
              <PaperIcon shape="bone" color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute -right-3 -bottom-3 w-14 h-14 rotate-6" />
            }
          >
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl bg-brand-success/15 text-brand-success flex items-center justify-center shrink-0 border border-dashed border-brand-success/30">
                <Cpu className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-brand-success flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> 기기 등록됨
                </p>
                <p className="font-display text-base font-bold text-brand-brown tracking-wide truncate">
                  {serial}
                </p>
                {serialMessage && (
                  <p className="mt-1 text-[11px] font-semibold text-brand-primary truncate">
                    {serialMessage}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={unregisterSerial}
                className="text-xs font-bold text-brand-brown px-3 py-1.5 rounded-full border border-dashed border-brand-brown/25 touch-active shrink-0"
                style={{ backgroundColor: BG_INFO }}
              >
                해제
              </button>
            </div>
          </FeltCard>
        ) : (
          <FeltCard innerClassName="px-4 py-4">
            <label className="flex items-center gap-1.5 text-xs font-bold text-brand-mute pl-0.5">
              <Cpu className="w-4 h-4 text-brand-primary" /> 로봇 시리얼 번호
            </label>
            <div className="mt-3 rounded-2xl border border-dashed border-brand-primary/30 bg-brand-primary/10 px-3 py-2.5">
              <p className="text-xs font-bold text-brand-brown">
                로봇 기능을 사용하려면 먼저 시리얼 번호를 등록해 주세요.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-brand-mute">
                최초 등록한 사용자가 소유자가 되며, 다른 사용자는 소유자가 권한을 부여한 경우에만 사용할 수 있습니다.
              </p>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <input
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && registerSerial()}
                placeholder="예: AIM-7F3A-22K9"
                className="min-w-0 rounded-2xl border border-brand-line bg-brand-card px-3 py-2.5 text-sm font-semibold tracking-wide text-brand-brown outline-none focus:border-brand-primary placeholder:font-normal placeholder:text-brand-mute/60"
              />
              <PrimaryButton
                className="px-4 py-2.5 rounded-2xl text-sm disabled:opacity-50"
                onClick={registerSerial}
                disabled={!serialInput.trim() || serialBusy}
              >
                {serialBusy ? "확인 중" : "등록"}
              </PrimaryButton>
            </div>
            {serialMessage && (
              <p className="mt-2 text-[11px] font-semibold text-brand-primary pl-0.5">
                {serialMessage}
              </p>
            )}
            <p className="mt-2 text-[11px] text-brand-mute pl-0.5">
              기기 밑면 또는 포장 박스의 시리얼 번호를 입력해 주세요.
            </p>
          </FeltCard>
        )}
        </>
        )}

        <button
          type="button"
          onClick={() => setMemberPanelOpen((open) => !open)}
          className="mt-3 w-full flex items-center justify-between rounded-3xl px-4 py-3 shadow-soft touch-active"
          style={{ backgroundColor: BG_CARD }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center border border-dashed border-brand-primary/30">
              <Lock className="w-4 h-4" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-xs font-bold text-brand-mute">로봇 권한 관리</span>
              <span className="block text-sm font-bold text-brand-brown truncate">
                {robotRole === "MEMBER" ? "권한 받은 상태" : "다른 사용자 권한 부여"}
              </span>
            </span>
          </span>
          <ChevronRight className={`w-5 h-5 text-brand-mute transition-transform ${memberPanelOpen ? "rotate-90" : ""}`} />
        </button>

        {memberPanelOpen && (
        <FeltCard innerClassName="px-4 py-4" className="mt-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center border border-dashed border-brand-primary/30">
              <Lock className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-brand-mute">로봇 권한 관리</p>
              <p className="text-sm font-bold text-brand-brown">
                {robotRole === "MEMBER" ? "권한 받은 상태" : "다른 사용자 권한 부여"}
              </p>
            </div>
          </div>
          {robotRole === "MEMBER" ? (
            <div className="mt-3 rounded-2xl border border-dashed border-brand-success/35 bg-brand-success/10 px-3 py-2.5">
              <p className="text-xs font-bold text-brand-success flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> 로봇 사용 권한을 받았습니다.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-brand-mute">
                소유자가 부여한 권한으로 로봇비전과 디스펜서 기능을 사용할 수 있습니다.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[11px] leading-relaxed text-brand-mute">
              최초 등록자만 다른 사용자에게 로봇과 디스펜서 사용 권한을 줄 수 있습니다.
            </p>
          )}
          {!serial && (
            <p className="mt-2 text-[11px] font-semibold text-brand-primary">
              시리얼 번호를 먼저 등록하면 권한 부여를 사용할 수 있습니다.
            </p>
          )}
          {serial && robotRole === "OWNER" && (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <input
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && grantMemberAccess()}
              placeholder="사용자 이메일"
              disabled={!serial}
              className="min-w-0 rounded-2xl border border-brand-line bg-brand-card px-3 py-2.5 text-sm font-semibold text-brand-brown outline-none focus:border-brand-primary placeholder:font-normal placeholder:text-brand-mute/60 disabled:opacity-60"
            />
            <PrimaryButton
              className="px-4 py-2.5 rounded-2xl text-sm disabled:opacity-50"
              onClick={grantMemberAccess}
              disabled={!serial || !memberEmail.trim() || memberBusy}
            >
              {memberBusy ? "처리 중" : "권한 부여"}
            </PrimaryButton>
          </div>
          )}
          {serial && !robotRole && (
            <p className="mt-2 text-[11px] font-semibold text-brand-primary">
              권한 정보를 확인하는 중입니다.
            </p>
          )}
          {memberMessage && (
            <p className="mt-2 text-[11px] font-semibold text-brand-primary">
              {memberMessage}
            </p>
          )}
        </FeltCard>
        )}

        <div className="grid grid-cols-3 gap-3 mt-3">
          <button
            type="button"
            onClick={() => runRobotSystemAction("reboot")}
            disabled={!serial || !!robotActionBusy}
            className="relative overflow-hidden flex flex-col items-center gap-2 py-5 rounded-3xl shadow-soft touch-active disabled:opacity-50"
            style={{ backgroundColor: BG_CARD }}
          >
            <Stitch />
            <span className="relative z-10 w-11 h-11 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center border border-dashed border-brand-primary/30">
              <RotateCw className="w-5 h-5" />
            </span>
            <span className="relative z-10 text-sm font-bold text-brand-brown">
              {robotActionBusy === "reboot" ? "전송 중" : "재부팅"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => runRobotSystemAction("powerOn")}
            disabled={!serial || !!robotActionBusy}
            className="relative overflow-hidden flex flex-col items-center gap-2 py-5 rounded-3xl shadow-soft touch-active disabled:opacity-50"
            style={{ backgroundColor: BG_CARD }}
          >
            <Stitch />
            <span className="relative z-10 w-11 h-11 rounded-2xl bg-brand-success/15 text-brand-success flex items-center justify-center border border-dashed border-brand-success/30">
              <Power className="w-5 h-5" />
            </span>
            <span className="relative z-10 text-sm font-bold text-brand-brown">
              {robotActionBusy === "powerOn" ? "전송 중" : "전원 On"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => runRobotSystemAction("powerOff")}
            disabled={!serial || !!robotActionBusy}
            className="relative overflow-hidden flex flex-col items-center gap-2 py-5 rounded-3xl shadow-soft touch-active disabled:opacity-50"
            style={{ backgroundColor: BG_CARD }}
          >
            <Stitch />
            <span className="relative z-10 w-11 h-11 rounded-2xl bg-brand-danger/15 text-brand-danger flex items-center justify-center border border-dashed border-brand-danger/30">
              <Power className="w-5 h-5" />
            </span>
            <span className="relative z-10 text-sm font-bold text-brand-brown">
              {robotActionBusy === "powerOff" ? "전송 중" : "전원 Off"}
            </span>
          </button>
        </div>
        {robotActionMessage && (
          <p className="mt-2 px-1 text-[11px] font-semibold text-brand-primary">
            {robotActionMessage}
          </p>
        )}
        {!serial && (
          <p className="mt-2 px-1 text-[11px] text-brand-mute">
            기기를 먼저 등록하면 재부팅·전원 제어를 사용할 수 있어요.
          </p>
        )}
      </section>

      <section className="mt-6">
        <FeltCard innerClassName="divide-y divide-brand-line/70">
          <LinkRow
            icon={<Info className="w-5 h-5 text-brand-mute" />}
            title="앱 정보 · 버전 1.0.0"
            onClick={() => setShowAppInfo(true)}
          />
        </FeltCard>
      </section>

      {/* Wi-Fi 연결 바텀 시트 */}
      {sheetNetwork && (
        <WifiSheet
          network={sheetNetwork}
          password={wifiPassword}
          onPassword={setWifiPassword}
          busy={networkBusy}
          onClose={() => setSheetNetwork(null)}
          onConnect={connectSelected}
        />
      )}

      {/* 앱 정보(빌드 현황) 바텀 시트 */}
      {showAppInfo && <AppInfoSheet onClose={() => setShowAppInfo(false)} />}
    </div>
  );
}

/* 신호 세기 (rssi → 0~3) */
function signalLevel(rssi) {
  if (rssi == null) return 2;
  if (rssi >= -55) return 3;
  if (rssi >= -67) return 2;
  if (rssi >= -78) return 1;
  return 0;
}

function SignalIcon({ level }) {
  return (
    <span className="w-9 h-9 rounded-2xl flex items-end justify-center gap-0.5 p-2 shrink-0 border border-dashed border-brand-brown/20" style={{ backgroundColor: BG_INFO }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 rounded-full"
          style={{
            height: `${6 + i * 5}px`,
            background: i < level ? "rgb(var(--brand-primary))" : "rgb(var(--brand-line))",
          }}
        />
      ))}
    </span>
  );
}

/* Wi-Fi 비밀번호 입력 바텀 시트 */
function WifiSheet({
  network,
  password,
  onPassword,
  busy,
  onClose,
  onConnect,
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const dismiss = (after) => {
    setShow(false);
    setTimeout(after, 280);
  };
  const submit = (e) => {
    e.preventDefault();
    onConnect();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={() => dismiss(onClose)}
    >
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: "rgba(45,37,32,0.45)", opacity: show ? 1 : 0 }}
      />
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] rounded-t-3xl bg-brand-card px-6 pt-3 pb-8 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{ transform: show ? "translateY(0)" : "translateY(100%)" }}
      >
        <div className="mx-auto w-10 h-1.5 rounded-full bg-brand-line mb-4" />
        <div className="flex items-center gap-2">
          <span className="w-10 h-10 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center shrink-0">
            <Wifi className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold text-brand-brown truncate">
              {network.ssid || "숨겨진 네트워크"}
            </h3>
            <p className="text-xs text-brand-mute">
              {network.secure ? "비밀번호 보호됨" : "개방형 네트워크"}
            </p>
          </div>
        </div>

        {network.secure && (
          <label className="mt-5 block">
            <span className="text-sm font-bold text-brand-mute pl-1 flex items-center gap-1">
              <Lock className="w-4 h-4" /> 비밀번호
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              autoFocus
              placeholder="Wi-Fi 비밀번호"
              className="mt-1.5 w-full rounded-2xl px-4 py-3.5 text-base font-semibold text-brand-brown bg-brand-cream outline-none border-[1.5px] border-brand-line focus:border-brand-primary"
            />
          </label>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => dismiss(onClose)}
            className="flex-1 rounded-2xl py-3.5 text-base font-bold bg-brand-cream text-brand-brown touch-active"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-2xl py-3.5 text-base font-bold text-white bg-brand-primary shadow-soft touch-active disabled:opacity-60"
          >
            {busy ? "연결 중…" : "연결"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Row({ icon, title, desc, right, disabled, highlight }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${disabled ? "opacity-50" : ""} ${
        highlight ? "border-l-[3px] border-brand-brown/30" : ""
      }`}
      style={highlight ? { backgroundColor: BG_HILITE } : undefined}
    >
      {icon && (
        <span
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-dashed border-brand-brown/20 text-brand-primary shadow-soft"
          style={{ backgroundColor: BG_INFO }}
        >
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-brand-brown truncate">{title}</p>
        {desc && <p className="text-xs text-brand-mute truncate">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

/* 앱 정보 · 빌드 현황 바텀 시트 */
function AppInfoSheet({ onClose }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const dismiss = () => {
    setShow(false);
    setTimeout(onClose, 280);
  };

  const rows = [
    ["앱 이름", "AiMyaong"],
    ["버전", "v1.0.0"],
    ["빌드", "2026.06.05"],
    ["환경", import.meta.env.MODE],
    ["프레임워크", "React 18 · Vite"],
    ["API 서버", import.meta.env.VITE_API_BASE_URL || "기본값 (127.0.0.1:8000)"],
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={dismiss}>
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: "rgba(45,37,32,0.45)", opacity: show ? 1 : 0 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] rounded-t-3xl bg-brand-bg px-5 pt-3 pb-8 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{ transform: show ? "translateY(0)" : "translateY(100%)" }}
      >
        <div className="mx-auto w-10 h-1.5 rounded-full bg-brand-line mb-4" />
        <div className="flex items-center gap-3 mb-4">
          <span className="w-11 h-11 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center border border-dashed border-brand-primary/30">
            <Info className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-bold text-brand-brown leading-tight">앱 정보</h3>
            <p className="text-xs text-brand-mute">빌드 현황</p>
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
        <div className="relative overflow-hidden rounded-3xl shadow-soft" style={{ backgroundColor: BG_CARD }}>
          <Stitch />
          <PaperIcon shape="paw" color="rgb(var(--brand-primary-deep))" opacity={0.1} className="absolute -right-3 -bottom-3 w-16 h-16 rotate-6" />
          <PaperIcon shape="bone" color="rgb(var(--brand-primary-deep))" opacity={0.12} className="absolute right-4 top-3 w-6 h-6 -rotate-12" />
          <div className="relative z-10 divide-y divide-brand-line/70">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm text-brand-mute shrink-0">{k}</span>
                <span className="text-sm font-bold text-brand-brown text-right break-all">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-brand-mute">
          © 2026 AiMyaong · 반려동물 IoT 케어 🐾
        </p>
      </div>
    </div>
  );
}

function LinkRow({ icon, title, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 touch-active text-left">
      <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-dashed border-brand-brown/20" style={{ backgroundColor: BG_INFO }}>
        {icon}
      </span>
      <p className="flex-1 text-sm font-bold text-brand-brown">{title}</p>
      <ChevronRight className="w-4 h-4 text-brand-mute" />
    </button>
  );
}

function readLocal(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export default Settings;
