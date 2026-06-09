import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wifi,
  Bell,
  Power,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  Lock,
  Signal,
  Cpu,
  Check,
  X,
} from "lucide-react";
import {
  Card,
  CreamCard,
  PageHeader,
  ToggleSwitch,
  Badge,
  PrimaryButton,
  GhostButton,
} from "../components/ui";
import { ThemeToggle } from "../components/ThemeToggle";
import { api } from "../api/api";

const ESP32_SETUP_URL_KEY = "aimyaong:esp32SetupUrl";
const ESP32_MQTT_HOST_KEY = "aimyaong:esp32MqttHost";
const ROBOT_SERIAL_KEY = "aimyaong:robotSerial";
const DEFAULT_ESP32_SETUP_URL =
  import.meta.env.VITE_ESP32_SETUP_URL || "http://192.168.4.1";
const DEFAULT_ESP32_MQTT_HOST =
  import.meta.env.VITE_ESP32_MQTT_HOST || "10.1.82.103";

export function Settings() {
  const navigate = useNavigate();
  const [pushOn, setPushOn] = useState(true);
  const [motionAlert, setMotionAlert] = useState(true);
  const [strangerAlert, setStrangerAlert] = useState(true);
  const [feedAlert, setFeedAlert] = useState(false);
  const [setupUrl, setSetupUrl] = useState(() =>
    readLocal(ESP32_SETUP_URL_KEY, DEFAULT_ESP32_SETUP_URL),
  );
  const [mqttHost, setMqttHost] = useState(() =>
    readLocal(ESP32_MQTT_HOST_KEY, DEFAULT_ESP32_MQTT_HOST),
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

  useEffect(() => writeLocal(ESP32_SETUP_URL_KEY, setupUrl), [setupUrl]);
  useEffect(() => writeLocal(ESP32_MQTT_HOST_KEY, mqttHost), [mqttHost]);

  // 로봇 시리얼 번호 (기기 등록)
  const [serial, setSerial] = useState(() => readLocal(ROBOT_SERIAL_KEY, ""));
  const [serialInput, setSerialInput] = useState("");
  useEffect(() => writeLocal(ROBOT_SERIAL_KEY, serial), [serial]);

  const registerSerial = () => {
    const v = serialInput.trim().toUpperCase();
    if (!v) return;
    setSerial(v);
    setSerialInput("");
    // TODO(백엔드): await api.registerDevice(v)
  };
  const unregisterSerial = () => setSerial("");

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
      if (data.mqttHost) setMqttHost(data.mqttHost);
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
          mqttHost,
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
      const host = data.raspberrypiEnv?.MQTT_BROKER_HOST;
      if (host) setMqttHost(host);
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
          mqttHost: mqttHost.trim() || "auto",
          mqttPort: 1883,
          esp32SetupUrl: setupUrl,
          piApFallback,
        });
      } catch {
        data = await api.configureSharedWifi({
          ssid: selectedSsid,
          password: wifiPassword,
          mqttHost: mqttHost.trim() || "auto",
          mqttPort: 1883,
          esp32SetupUrl: setupUrl,
          piApFallback,
        });
      }
      const nextHost = data.raspberrypiEnv?.MQTT_BROKER_HOST;
      if (nextHost) setMqttHost(nextHost);
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
          className="w-10 h-10 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-brand-brown leading-tight">
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

        {/* 현재 연결 상태 */}
        <Card className="px-4 py-4 flex items-center gap-3">
          <span
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${wifiStatus?.stationConnected ? "bg-brand-success/15 text-brand-success" : "bg-brand-warning/20 text-[#A06B1A]"}`}
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
        </Card>

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

        <CreamCard
          className={`divide-y divide-brand-line ${
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
        </CreamCard>

        {/* 고급 설정 (접기) */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-3 w-full flex items-center justify-between px-1 text-xs font-bold text-brand-mute touch-active"
        >
          <span>고급 설정 (ESP32 · MQTT)</span>
          <ChevronRight
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
          />
        </button>
        {showAdvanced && (
          <Card className="mt-2 p-4">
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

            <label className="mt-3 block text-[11px] font-bold text-brand-mute pl-1">
              MQTT 호스트
            </label>
            <input
              value={mqttHost}
              onChange={(event) => setMqttHost(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-brand-line bg-brand-card px-3 py-2 text-sm font-semibold text-brand-brown outline-none focus:border-brand-primary"
              placeholder="IP 또는 비우면 자동"
            />

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
          </Card>
        )}


        {networkMessage && (
          <p className="mt-3 px-1 text-xs font-semibold text-brand-mute">
            {networkMessage}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          알림 제어
        </h3>
        <CreamCard className="divide-y divide-brand-line">
          <Row
            icon={<Bell className="w-5 h-5" />}
            title="푸시 알림"
            desc="모든 푸시 알림 전역 On/Off"
            right={
              <ToggleSwitch
                checked={pushOn}
                onChange={setPushOn}
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
                onChange={setMotionAlert}
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
                onChange={setStrangerAlert}
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
                onChange={setFeedAlert}
                label="배식 알림"
              />
            }
            disabled={!pushOn}
          />
        </CreamCard>
      </section>

      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          화면 테마
        </h3>
        <CreamCard className="px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand-brown">테마</p>
            <p className="text-xs text-brand-mute">라이트 · 다크 · 시스템 설정</p>
          </div>
          <ThemeToggle />
        </CreamCard>
      </section>

      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          기기 제어
        </h3>

        {/* 로봇 시리얼 번호 (기기 등록) */}
        {serial ? (
          <Card className="px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl bg-brand-success/15 text-brand-success flex items-center justify-center shrink-0">
                <Cpu className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-brand-success flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> 기기 등록됨
                </p>
                <p className="font-display text-base font-bold text-brand-brown tracking-wide truncate">
                  {serial}
                </p>
              </div>
              <button
                type="button"
                onClick={unregisterSerial}
                className="text-xs font-bold text-brand-mute px-3 py-1.5 rounded-full bg-brand-cream touch-active shrink-0"
              >
                해제
              </button>
            </div>
          </Card>
        ) : (
          <Card className="px-4 py-4">
            <label className="flex items-center gap-1.5 text-xs font-bold text-brand-mute pl-0.5">
              <Cpu className="w-4 h-4 text-brand-primary" /> 로봇 시리얼 번호
            </label>
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
                disabled={!serialInput.trim()}
              >
                등록
              </PrimaryButton>
            </div>
            <p className="mt-2 text-[11px] text-brand-mute pl-0.5">
              기기 밑면 또는 포장 박스의 시리얼 번호를 입력해 주세요.
            </p>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          <button
            type="button"
            disabled={!serial}
            className="flex flex-col items-center gap-2 py-5 rounded-3xl bg-brand-card shadow-soft touch-active disabled:opacity-50"
          >
            <span className="w-11 h-11 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center">
              <RotateCw className="w-5 h-5" />
            </span>
            <span className="text-sm font-bold text-brand-brown">재부팅</span>
          </button>
          <button
            type="button"
            disabled={!serial}
            className="flex flex-col items-center gap-2 py-5 rounded-3xl bg-brand-card shadow-soft touch-active disabled:opacity-50"
          >
            <span className="w-11 h-11 rounded-2xl bg-brand-danger/15 text-brand-danger flex items-center justify-center">
              <Power className="w-5 h-5" />
            </span>
            <span className="text-sm font-bold text-brand-brown">전원 Off</span>
          </button>
        </div>
        {!serial && (
          <p className="mt-2 px-1 text-[11px] text-brand-mute">
            기기를 먼저 등록하면 재부팅·전원 제어를 사용할 수 있어요.
          </p>
        )}
      </section>

      <section className="mt-6">
        <Card className="divide-y divide-brand-line">
          <LinkRow
            icon={<Info className="w-5 h-5 text-brand-mute" />}
            title="앱 정보 · 버전 1.0.0"
            onClick={() => setShowAppInfo(true)}
          />
        </Card>
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
    <span className="w-9 h-9 rounded-2xl bg-brand-cream flex items-end justify-center gap-0.5 p-2 shrink-0">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 rounded-full"
          style={{
            height: `${6 + i * 5}px`,
            background: i < level ? "#F08D86" : "#E7D8C2",
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

function Row({ icon, title, desc, right, disabled }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${disabled ? "opacity-50" : ""}`}
    >
      {icon && (
        <span className="w-10 h-10 rounded-2xl bg-brand-card text-brand-primary flex items-center justify-center shrink-0 shadow-soft">
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
          <span className="w-11 h-11 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center">
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
            className="w-9 h-9 rounded-full flex items-center justify-center text-brand-mute touch-active shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="rounded-2xl bg-brand-card border border-brand-line divide-y divide-brand-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-brand-mute shrink-0">{k}</span>
              <span className="text-sm font-bold text-brand-brown text-right break-all">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[11px] text-brand-mute">
          © 2026 AiMyaong · 반려동물 IoT 케어
        </p>
      </div>
    </div>
  );
}

function LinkRow({ icon, title, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 touch-active text-left">
      <span className="w-10 h-10 rounded-2xl bg-brand-cream flex items-center justify-center shrink-0">
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
