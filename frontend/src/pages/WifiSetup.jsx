import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  RefreshCw,
  Router,
  Search,
  Signal,
  Wifi,
} from '../components/icons'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, GhostButton, PrimaryButton } from '../components/ui'
import { api } from '../api/api'

const ESP32_SETUP_URL_KEY = 'aimyaong:esp32SetupUrl'
const PENDING_PI_WIFI_KEY = 'aimyaong:pendingPiWifi'
const DEFAULT_ESP32_SETUP_URL = import.meta.env.VITE_ESP32_SETUP_URL || 'http://192.168.4.1'

export function WifiSetup() {
  const navigate = useNavigate()
  const [setupUrl, setSetupUrl] = useState(() => readLocal(ESP32_SETUP_URL_KEY, DEFAULT_ESP32_SETUP_URL))
  const [status, setStatus] = useState(null)
  const [piStatus, setPiStatus] = useState(null)
  const [networks, setNetworks] = useState([])
  const [selectedNetwork, setSelectedNetwork] = useState(null)
  const [pendingNetwork, setPendingNetwork] = useState(null)
  const [modalSsid, setModalSsid] = useState('')
  const [modalPassword, setModalPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [snackbar, setSnackbar] = useState('')
  const [piApFallback, setPiApFallback] = useState(false)

  const sortedNetworks = useMemo(
    () => [...networks].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)),
    [networks],
  )
  const currentNetwork = piStatus?.wifiSsid || status?.ssid || status?.savedSsid || ''
  const currentIp = piStatus?.wifiIp || status?.ip || ''
  const mqttHost = piStatus?.raspberrypiEnv?.MQTT_BROKER_HOST || status?.mqttHost || ''

  useEffect(() => writeLocal(ESP32_SETUP_URL_KEY, setupUrl), [setupUrl])

  useEffect(() => {
    refreshStatus({ silent: true })
    refreshPiStatus()
    const pending = readJsonLocal(PENDING_PI_WIFI_KEY)
    if (pending?.ssid) {
      waitForPiReconnect(pending.ssid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!snackbar) return undefined
    const timer = window.setTimeout(() => setSnackbar(''), 3500)
    return () => window.clearTimeout(timer)
  }, [snackbar])

  function showMessage(text) {
    setMessage(text)
    setSnackbar(text)
  }

  async function esp32Request(path, options = {}) {
    const base = setupUrl.replace(/\/$/, '')
    let response
    try {
      response = await fetch(`${base}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        ...options,
      })
    } catch {
      throw new Error(`ESP32 설정 주소에 연결할 수 없습니다: ${base}`)
    }
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `ESP32 API 오류: ${response.status}`)
    return data
  }

  async function refreshStatus({ silent = false } = {}) {
    try {
      if (!silent) setMessage('')
      const data = await esp32Request('/api/wifi/status')
      setStatus(data)
    } catch {
      setStatus(null)
      if (!silent) showMessage('ESP32 설정 주소에 연결할 수 없습니다.')
    }
  }

  async function refreshPiStatus() {
    try {
      const data = await api.getNetworkStatus()
      setPiStatus(data)
    } catch {
      setPiStatus(null)
    }
  }

  async function scanWifi() {
    setBusy(true)
    showMessage('주변 Wi-Fi를 검색하는 중입니다.')
    try {
      let data
      try {
        data = await api.scanPiWifi()
      } catch {
        data = await esp32Request('/api/wifi/scan')
      }

      const nextNetworks = (data.networks || []).filter(
        (network) => (network.compatible ?? network.esp32Compatible ?? false) === true,
      )
      setNetworks(nextNetworks)
      setSelectedNetwork(null)
      showMessage(nextNetworks.length ? '검색 완료' : '검색된 Wi-Fi가 없습니다.')
      await refreshStatus({ silent: true })
      await refreshPiStatus()
    } catch (error) {
      showMessage(error.message || 'Wi-Fi 검색에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function startEsp32SetupMode() {
    setBusy(true)
    showMessage('ESP32 설정 모드를 시작하는 중입니다.')
    try {
      const data = await api.startEsp32SetupMode()
      if (data.setupUrl) setSetupUrl(data.setupUrl)
      showMessage(`${data.ssid || 'AiMyaong-Setup'} Wi-Fi에 연결한 뒤 아래에서 저장하세요.`)
    } catch (error) {
      showMessage(error.message || 'ESP32 설정 모드를 시작하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  function chooseNetwork(network) {
    if ((network.compatible ?? network.esp32Compatible ?? true) === false) {
      showMessage('ESP32는 2.4GHz Wi-Fi만 지원합니다.')
      return
    }

    setPendingNetwork(network)
    setModalSsid(network.ssid || '')
    setModalPassword('')
    setMessage('')
  }

  function closeNetworkModal() {
    closeModalSilently()
    showMessage('Wi-Fi 연결을 취소했습니다.')
  }

  function modalNetworkPayload() {
    const ssid = modalSsid.trim()
    const secure = pendingNetwork?.secure ?? true
    const compatible = pendingNetwork?.compatible ?? pendingNetwork?.esp32Compatible ?? true
    return {
      ssid,
      password: secure ? modalPassword : '',
      secure,
      compatible,
    }
  }

  function validateModalPayload({ ssid, password, secure, compatible }) {
    if (!ssid) {
      showMessage('SSID를 입력하세요.')
      return false
    }
    if (!compatible) {
      showMessage('선택한 Wi-Fi는 ESP32가 지원하지 않습니다.')
      return false
    }
    if (secure && !password) {
      showMessage('Wi-Fi 비밀번호를 입력하세요.')
      return false
    }
    return true
  }

  async function saveEsp32OnlyFromModal() {
    const payload = modalNetworkPayload()
    if (!validateModalPayload(payload)) return

    setBusy(true)
    showMessage('ESP32 설정을 저장하는 중입니다.')
    try {
      const data = await esp32Request('/api/wifi/connect', {
        method: 'POST',
        body: JSON.stringify({
          ssid: payload.ssid,
          password: payload.password,
          reboot: false,
        }),
      })
      setSelectedNetwork(pendingNetwork)
      showMessage(data.rebooting ? '저장 완료. ESP32 재부팅 중입니다.' : '저장 완료.')
      closeModalSilently()
    } catch (error) {
      showMessage(error.message || 'ESP32 설정 저장에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function saveSharedWifiFromModal() {
    const payload = modalNetworkPayload()
    if (!validateModalPayload(payload)) return

    setBusy(true)
    rememberPendingPiWifi(payload.ssid)
    showMessage(`${payload.ssid} 연결을 시작합니다.`)
    try {
      const data = await api.configurePiWifi({
        ssid: payload.ssid,
        password: payload.password,
        piApFallback,
      })
      const nextHost = data.raspberrypiEnv?.MQTT_BROKER_HOST || data.backendEnv?.MQTT_BROKER_HOST
      setSelectedNetwork(pendingNetwork)
      if (data.pendingReconnect) {
        showMessage(`${payload.ssid}로 이동 중입니다. 라즈베리파이의 새 IP를 찾는 중입니다.`)
        waitForPiReconnect(payload.ssid)
      } else {
        clearPendingPiWifi()
        showMessage(nextHost ? `적용 완료. MQTT ${nextHost}:1883` : '적용 완료.')
      }
      closeModalSilently()
      await refreshPiStatus()
      await refreshStatus({ silent: true })
    } catch (error) {
      showMessage(normalizeWifiError(error.message))
    } finally {
      setBusy(false)
    }
  }

  function rememberPendingPiWifi(ssid) {
    writeJsonLocal(PENDING_PI_WIFI_KEY, {
      ssid,
      previousIp: currentIp,
      startedAt: Date.now(),
    })
  }

  function clearPendingPiWifi() {
    try { localStorage.removeItem(PENDING_PI_WIFI_KEY) } catch { /* ignore */ }
  }

  async function waitForPiReconnect(targetSsid) {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      await sleep(attempt === 0 ? 6000 : 5000)
      try {
        const data = await api.getNetworkStatus()
        setPiStatus(data)
        const wifiJob = data.wifiJob || {}
        if (wifiJob.state === 'rolled_back' || wifiJob.state === 'failed') {
          clearPendingPiWifi()
          showMessage(wifiJob.message || `${targetSsid} 연결에 실패했습니다.`)
          return
        }
        if (wifiJob.state === 'running') {
          showMessage(wifiJob.message || `${targetSsid} 연결 상태를 확인하는 중입니다.`)
          continue
        }
        if (data.wifiIp || data.wifiSsid) {
          clearPendingPiWifi()
          showMessage(wifiJob.message || (data.wifiSsid ? `라즈베리파이가 ${data.wifiSsid}에 다시 연결됐습니다.` : `${targetSsid} 연결 후 라즈베리파이 새 IP를 찾았습니다.`))
          return
        }
      } catch {
        showMessage(`${targetSsid} 연결 후 라즈베리파이 새 IP를 찾는 중입니다.`)
      }
    }
    showMessage('라즈베리파이 새 IP를 찾지 못했습니다. 잠시 후 다시 스캔하세요.')
  }

  function closeModalSilently() {
    setPendingNetwork(null)
    setModalSsid('')
    setModalPassword('')
  }

  return (
    <div className="min-h-screen bg-brand-bg px-5 pt-safe pb-6">
      <header className="flex items-center gap-3 pt-4 pb-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-11 h-11 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active"
          aria-label="뒤로"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-cute text-2xl font-bold text-brand-brown leading-tight">Wi-Fi</h1>
          <p className="mt-1 text-sm text-brand-mute truncate">{currentNetwork || '연결 설정'}</p>
        </div>
        <Badge tone={status?.stationConnected ? 'success' : 'warn'}>
          {status?.stationConnected ? '연결됨' : '설정'}
        </Badge>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <StatusTile icon={<Wifi className="w-5 h-5" />} label="ESP32" value={status?.apIp || '192.168.4.1'} />
        <StatusTile icon={<Router className="w-5 h-5" />} label="MQTT" value={mqttHost || '자동'} />
      </section>

      <Card className="mt-4 p-4">
        <div className="mb-3 rounded-2xl bg-brand-cream px-3 py-3">
          <p className="text-sm font-bold text-brand-brown">ESP32 등록 Wi-Fi 변경</p>
          <p className="mt-1 text-xs font-semibold text-brand-mute">
            먼저 2.4GHz 목록을 스캔한 다음 설정 모드를 켜고 AiMyaong-Setup에 연결하세요.
          </p>
          <PrimaryButton
            type="button"
            className="mt-3 w-full rounded-2xl py-2.5"
            onClick={startEsp32SetupMode}
            disabled={busy}
          >
            ESP32 설정 모드 시작
          </PrimaryButton>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            value={setupUrl}
            onChange={(event) => setSetupUrl(event.target.value)}
            className="min-w-0 rounded-2xl border border-brand-line bg-brand-cream px-3 py-2.5 text-sm font-semibold text-brand-brown outline-none focus:border-brand-primary"
            placeholder="ESP32 설정 주소"
          />
          <GhostButton type="button" className="px-3 py-2.5 rounded-2xl" onClick={() => refreshStatus()} disabled={busy}>
            <RefreshCw className="w-4 h-4" />
          </GhostButton>
        </div>
      </Card>

      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-display text-base font-bold text-brand-brown">네트워크</h2>
          <GhostButton type="button" className="px-3 py-2 rounded-2xl text-sm" onClick={scanWifi} disabled={busy}>
            <Search className="w-4 h-4" />
            스캔
          </GhostButton>
        </div>

        <CurrentNetworkCard ssid={currentNetwork} ip={currentIp} mqttHost={mqttHost} />

        <div className="mt-3 overflow-hidden rounded-3xl border border-brand-line bg-brand-card shadow-soft">
          {sortedNetworks.length > 0 ? (
            sortedNetworks.map((network, index) => (
              <NetworkRow
                key={`${network.ssid}-${network.channel}-${index}`}
                network={network}
                selected={selectedNetwork?.ssid === network.ssid && selectedNetwork?.channel === network.channel}
                onClick={() => chooseNetwork(network)}
              />
            ))
          ) : (
            <div className="px-4 py-5 text-sm font-semibold text-brand-mute">스캔을 눌러 주변 Wi-Fi를 검색하세요.</div>
          )}
        </div>
      </section>

      {message && <p className="mt-3 text-xs font-bold text-brand-mute">{message}</p>}

      {pendingNetwork && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-4 sm:items-center sm:pb-0"
          onClick={closeNetworkModal}
        >
          <div
            className="w-full max-w-[420px] rounded-3xl bg-brand-bg p-4 shadow-soft-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wifi-connect-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/15 text-brand-primary">
                {pendingNetwork.secure ? <Lock className="h-5 w-5" /> : <Signal className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <h3 id="wifi-connect-title" className="truncate font-display text-lg font-bold text-brand-brown">
                  선택한 네트워크
                </h3>
                <p className="mt-1 truncate text-sm font-bold text-brand-brown">{pendingNetwork.ssid || '숨겨진 네트워크'}</p>
                <p className="mt-1 text-xs font-semibold text-brand-mute">
                  신호 {pendingNetwork.rssi ?? '-'} · CH {pendingNetwork.channel || '-'}{pendingNetwork.band ? ` · ${pendingNetwork.band}` : ''}
                </p>
              </div>
            </div>

            <input
              value={modalSsid}
              onChange={(event) => setModalSsid(event.target.value)}
              className="mt-4 w-full rounded-2xl border border-brand-line bg-brand-card px-3 py-3 text-sm font-semibold text-brand-brown outline-none focus:border-brand-primary"
              placeholder="SSID"
            />

            {pendingNetwork.secure ? (
              <input
                value={modalPassword}
                onChange={(event) => setModalPassword(event.target.value)}
                type="password"
                autoFocus
                className="mt-2 w-full rounded-2xl border border-brand-line bg-brand-card px-3 py-3 text-sm font-semibold text-brand-brown outline-none focus:border-brand-primary"
                placeholder="Wi-Fi 비밀번호"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !busy) saveEsp32OnlyFromModal()
                }}
              />
            ) : (
              <p className="mt-2 rounded-2xl bg-brand-cream px-3 py-3 text-sm font-semibold text-brand-brown">
                개방형 네트워크입니다.
              </p>
            )}

            <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-brand-cream px-3 py-2.5">
              <span className="text-xs font-bold text-brand-brown">실패 시 Pi AP 모드</span>
              <input
                type="checkbox"
                checked={piApFallback}
                onChange={(event) => setPiApFallback(event.target.checked)}
                className="h-4 w-4 accent-brand-primary"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <GhostButton type="button" className="rounded-2xl py-3" onClick={closeNetworkModal} disabled={busy}>
                취소
              </GhostButton>
              <PrimaryButton type="button" className="rounded-2xl py-3" onClick={saveEsp32OnlyFromModal} disabled={busy}>
                {busy ? '적용 중' : '확인'}
              </PrimaryButton>
            </div>
            {busy && (
              <p className="mt-3 rounded-2xl bg-brand-cream px-3 py-2.5 text-center text-xs font-bold text-brand-brown">
                Wi-Fi 설정을 적용하는 중입니다. 연결이 바뀌는 동안 잠시 기다려 주세요.
              </p>
            )}
            <GhostButton type="button" className="mt-2 w-full rounded-2xl py-3" onClick={saveSharedWifiFromModal} disabled={busy}>
              <CheckCircle2 className="w-4 h-4" />
              라즈베리파이에도 같이 적용
            </GhostButton>
          </div>
        </div>
      )}

      {snackbar && (
        <div className="fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
          <div className="max-w-[420px] rounded-2xl bg-brand-brown px-4 py-3 text-sm font-bold text-white shadow-soft-lg">
            {snackbar}
          </div>
        </div>
      )}
    </div>
  )
}

function CurrentNetworkCard({ ssid, ip, mqttHost }) {
  return (
    <div className="rounded-3xl border border-brand-line bg-brand-card px-4 py-3 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-success/15 text-brand-success">
          <Wifi className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-brand-mute">현재 접속 중인 네트워크</p>
          <p className="mt-0.5 truncate text-sm font-bold text-brand-brown">{ssid || '확인되지 않음'}</p>
          <p className="mt-0.5 truncate text-xs text-brand-mute">
            {ip ? `${ip} · ` : ''}MQTT {mqttHost || '자동'}
          </p>
        </div>
      </div>
    </div>
  )
}

function NetworkRow({ network, selected, onClick }) {
  const compatible = network.compatible ?? network.esp32Compatible ?? true
  const band = network.band || (network.channel >= 1 && network.channel <= 14 ? '2.4GHz' : '')

  return (
    <button
      type="button"
      className={`w-full flex items-center gap-3 border-b border-brand-line px-4 py-3 text-left last:border-b-0 touch-active ${selected ? 'bg-brand-primary/10' : 'bg-brand-card'}`}
      onClick={onClick}
    >
      <span className="w-10 h-10 rounded-2xl bg-brand-cream text-brand-brown flex items-center justify-center shrink-0">
        {network.secure ? <Lock className="w-4 h-4" /> : <Signal className="w-4 h-4" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-brand-brown truncate">{network.ssid || '숨겨진 네트워크'}</span>
        <span className="block text-xs text-brand-mute">
          신호 {network.rssi ?? '-'} · CH {network.channel || '-'}{band ? ` · ${band}` : ''}
          {!compatible ? ' · ESP32 미지원' : ''}
        </span>
      </span>
      {selected ? <Badge tone="primary">선택</Badge> : !compatible ? <Badge tone="warn">5GHz</Badge> : null}
    </button>
  )
}

function StatusTile({ icon, label, value }) {
  return (
    <Card className="p-4">
      <span className="w-10 h-10 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center">
        {icon}
      </span>
      <p className="mt-3 text-xs font-bold text-brand-mute">{label}</p>
      <p className="mt-1 text-sm font-bold text-brand-brown truncate">{value}</p>
    </Card>
  )
}

function normalizeWifiError(message) {
  if (!message) return '라즈베리파이 Wi-Fi 설정 적용에 실패했습니다.'
  if (message.includes('Not authorized to control networking')) {
    return '라즈베리파이에서 Wi-Fi 변경 권한이 없습니다. Pi에서 scripts/allow-networkmanager-control.sh를 한 번 실행하세요.'
  }
  if (message.includes('stayed in connecting state')) {
    return '라즈베리파이 Wi-Fi가 연결 중 상태에서 멈췄습니다. 비밀번호, 공유기 DHCP, 2.4GHz 지원 여부를 확인하세요.'
  }
  return message
}

function readLocal(key, fallback) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

function readJsonLocal(key) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function writeJsonLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default WifiSetup
