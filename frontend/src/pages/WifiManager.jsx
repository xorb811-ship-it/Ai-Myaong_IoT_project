import { useEffect, useState } from 'react'
import { Wifi, Lock, RefreshCw, Loader2, Check, AlertTriangle, ChevronDown } from 'lucide-react'
import { getApiBaseUrl } from '../lib/backendUrls'

/**
 * 주변 Wi-Fi 스캔 + 연결 UI (FastAPI 연동 대비)
 * - GET  /api/wifi/scan     → 주변 네트워크 목록
 * - POST /api/wifi/connect  → { ssid, password } 전송
 * 백엔드 미배포 시 Mock 데이터로 UI 흐름을 그대로 테스트할 수 있게 처리.
 */

const BACKEND_URL = getApiBaseUrl()

/* 샌드박스용 Mock 데이터 (백엔드 OFF일 때 UI 테스트) */
const MOCK_NETWORKS = [
  { ssid: 'My_Home_WiFi', bssid: 'aa:bb:cc:dd:ee:ff', signal_level: -48, security: 'WPA2' },
  { ssid: 'iptime5G_2', bssid: '99:88:77:66:55:44', signal_level: -63, security: 'WPA2' },
  { ssid: 'Cafe_Free_WiFi', bssid: '11:22:33:44:55:66', signal_level: -75, security: 'Open' },
  { ssid: 'KT_GiGA_2.4G', bssid: 'de:ad:be:ef:00:11', signal_level: -82, security: 'WPA2' },
]

/* 신호 세기(dBm) → 0~3 막대 */
function signalLevel(dbm) {
  if (dbm >= -55) return 3
  if (dbm >= -67) return 2
  if (dbm >= -78) return 1
  return 0
}

export default function WifiManager() {
  const [networks, setNetworks] = useState([])
  const [loading, setLoading] = useState(false)      // 스캔 로딩
  const [selected, setSelected] = useState(null)     // 펼친 SSID
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false) // 연결 진행 중
  const [result, setResult] = useState(null)         // { status, message }

  // 최초 렌더링 시 자동 스캔
  useEffect(() => {
    scanWifi()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* API ① 스캔 (GET) */
  async function scanWifi() {
    setLoading(true)
    setResult(null)
    setSelected(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/wifi/scan`)
      if (!res.ok) throw new Error(`스캔 응답 오류: HTTP ${res.status}`)
      const data = await res.json()
      setNetworks(Array.isArray(data) ? data : [])
    } catch (err) {
      // ── 샌드박스 대응 ── 백엔드가 꺼져 있거나 실패하면 Mock 으로 UI 흐름 테스트
      console.warn('[WifiManager] 스캔 실패 → Mock 데이터로 대체합니다.', err)
      setNetworks(MOCK_NETWORKS)
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(ssid) {
    setResult(null)
    setPassword('')
    setSelected((prev) => (prev === ssid ? null : ssid))
  }

  /* API ② 연결 (POST) */
  async function connectWifi(network) {
    if (connecting) return
    setConnecting(true)
    setResult(null)

    const payload = { ssid: network.ssid, password } // FastAPI Pydantic 모델 규격

    try {
      const res = await fetch(`${BACKEND_URL}/api/wifi/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))

      // FastAPI 표준 응답: { status, message }
      if (!res.ok || data.status === 'error') {
        setResult({ status: 'error', message: data.message || `연결 실패 (HTTP ${res.status})` })
      } else {
        setResult({ status: 'success', message: data.message || `${network.ssid}에 연결되었습니다.` })
      }
    } catch (err) {
      // ── 샌드박스 대응 ── 백엔드 없을 때 응답을 흉내내어 흐름 확인
      console.warn('[WifiManager] 연결 요청 실패 → Mock 응답으로 대체합니다.', err)
      await new Promise((r) => setTimeout(r, 1800)) // 기계 인증 딜레이 흉내
      if (network.security !== 'Open' && password.length < 8) {
        setResult({ status: 'error', message: 'Authentication failed (mock)' })
      } else {
        setResult({ status: 'success', message: `Successfully connected to ${network.ssid} (mock)` })
      }
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-slate-100 py-8 px-4">
      {/* slide-down 키프레임 */}
      <style>{`@keyframes wmSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
              <Wifi className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold text-slate-800 leading-tight">Wi-Fi 연결</h1>
              <p className="text-xs text-slate-500">기기를 네트워크에 연결하세요</p>
            </div>
          </div>
          <button
            type="button"
            onClick={scanWifi}
            disabled={loading || connecting}
            className="w-10 h-10 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            aria-label="새로고침"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-3xl shadow-lg shadow-slate-200/60 overflow-hidden">
          {/* 로딩 */}
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin" />
              <p className="mt-3 text-sm font-semibold">주변 Wi-Fi 검색 중…</p>
            </div>
          ) : networks.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">검색된 Wi-Fi가 없어요.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {networks.map((net) => {
                const open = selected === net.ssid
                const level = signalLevel(net.signal_level)
                const secure = net.security && net.security !== 'Open'
                return (
                  <li key={net.bssid || net.ssid}>
                    {/* 네트워크 행 */}
                    <button
                      type="button"
                      onClick={() => toggleSelect(net.ssid)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <SignalBars level={level} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-slate-800 truncate">{net.ssid}</span>
                        <span className="block text-[11px] text-slate-400">{net.security} · {net.signal_level}dBm</span>
                      </span>
                      {secure && <Lock className="w-4 h-4 text-slate-400 shrink-0" />}
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {/* slide-down 연결 폼 */}
                    {open && (
                      <div className="px-4 pb-4" style={{ animation: 'wmSlide 200ms ease-out' }}>
                        {secure && (
                          <div className="relative">
                            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              disabled={connecting}
                              autoFocus
                              placeholder="비밀번호"
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                            />
                          </div>
                        )}

                        {/* 결과 메시지 */}
                        {result && (
                          <div className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold
                            ${result.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                            {result.status === 'success' ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                            <span>{result.message}</span>
                          </div>
                        )}

                        {/* 연결 버튼 */}
                        <button
                          type="button"
                          onClick={() => connectWifi(net)}
                          disabled={connecting}
                          className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition-colors disabled:bg-blue-400"
                        >
                          {connecting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              기계가 Wi-Fi 신호를 인증 중입니다…
                            </>
                          ) : '연결하기'}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          백엔드 미연결 시 Mock 데이터로 표시됩니다 · {BACKEND_URL}
        </p>
      </div>
    </div>
  )
}

/* 신호 세기 막대 */
function SignalBars({ level }) {
  return (
    <span className="w-9 h-9 rounded-2xl bg-slate-100 flex items-end justify-center gap-0.5 p-2 shrink-0">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 rounded-full"
          style={{ height: `${6 + i * 5}px`, background: i < level ? '#2563eb' : '#cbd5e1' }}
        />
      ))}
    </span>
  )
}
