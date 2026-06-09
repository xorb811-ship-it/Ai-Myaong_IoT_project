import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Maximize2,
  Minimize2,
  Zap,
  ZapOff,
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
} from 'lucide-react'
import { Card, Badge } from '../components/ui'
import { api, resolveMediaUrl } from '../api/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { getWebSocketUrl } from '../lib/backendUrls'

/* 이벤트 로그 — clip_id 로 백엔드 클립(CLIPS) 참조 (활동 기록과 동일 구조) */
const EVENT_LOG = [
  { id: 1, type: '움직임 감지', time: '14:22:08', icon: Video, clip_id: 301, location: '거실', duration: 12, storage_path: '/clips/clip-301.mp4' },
  { id: 2, type: '배식 동작', time: '13:00:00', icon: UtensilsCrossed, clip_id: 302, location: '식기 앞', duration: 6, storage_path: '/clips/clip-302.mp4' },
  { id: 3, type: '음성 호출', time: '11:45:12', icon: Mic, clip_id: null, location: '집사 호출' },
  { id: 4, type: '외부인 감지', time: '09:11:55', icon: UserX, clip_id: 304, location: '현관', duration: 9, danger: true, storage_path: '/clips/clip-304.mp4' },
  { id: 5, type: '수면 감지', time: '03:20:41', icon: Moon, clip_id: 305, location: '안방', duration: 20, storage_path: '/clips/clip-305.mp4' },
]

const MOVE_COMMANDS = {
  up: 'FORWARD',
  down: 'BACKWARD',
  left: 'LEFT',
  right: 'RIGHT',
}

const CAMERA_COMMANDS = {
  up: 'CAM_UP',
  down: 'CAM_DOWN',
  left: 'CAM_LEFT',
  right: 'CAM_RIGHT',
  center: 'CAM_CENTER',
}

export function RobotVision() {
  const navigate = useNavigate()
  const { isConnected } = useWebSocket(getWebSocketUrl())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [irOn, setIrOn] = useState(false)
  const [recording, setRecording] = useState(false)
  const [selectedClip, setSelectedClip] = useState(null)
  const [controlBusy, setControlBusy] = useState(false)
  const [streamInfo, setStreamInfo] = useState({ url: '', mode: 'loading' })
  const [streamError, setStreamError] = useState('')
  const controlBusyRef = useRef(false)
  const commandQueueRef = useRef(Promise.resolve())
  // 뷰포트가 portrait 인데 전체화면이면 CSS 로 강제 가로 회전.
  // Android Chrome 등에서 screen.orientation.lock 이 성공하면 false 로 유지.
  const [forceCssLandscape, setForceCssLandscape] = useState(false)
  const fsRef = useRef(null)

  useEffect(() => {
    let mounted = true
    api.getStreamUrl()
      .then((data) => {
        if (!mounted) return
        setStreamInfo({ url: data.url, mode: data.mode || 'live' })
        setStreamError('')
      })
      .catch((error) => {
        if (!mounted) return
        console.error('[RobotVision] stream URL failed:', error)
        setStreamError('스트림 주소를 불러오지 못했습니다')
      })

    return () => {
      mounted = false
    }
  }, [])

  // Fullscreen API ↔ React 상태 동기화 (ESC 해제 포함)
  useEffect(() => {
    const sync = () => {
      const active = !!document.fullscreenElement
      setIsFullscreen(active)
      if (!active) {
        // 풀스크린 종료 시 orientation lock 도 해제
        try { window.screen?.orientation?.unlock?.() } catch { /* noop */ }
        setForceCssLandscape(false)
      }
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  // 풀스크린 중 실제 가로 회전이 일어나면 CSS 회전을 풀고, portrait 로 돌아오면 다시 적용
  useEffect(() => {
    if (!isFullscreen) return
    const check = () => {
      const portrait = window.innerHeight > window.innerWidth
      setForceCssLandscape(portrait)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [isFullscreen])

  const enterFullscreen = async () => {
    const el = fsRef.current
    if (!el) return
    try {
      const req = el.requestFullscreen || el.webkitRequestFullscreen
      if (req) {
        await req.call(el)
      } else {
        setIsFullscreen(true)
      }
    } catch {
      setIsFullscreen(true)
    }
    // 전체화면 진입 직후 가로 모드 잠금 시도 (Android Chrome 등)
    try {
      const orientation = window.screen?.orientation
      if (orientation?.lock) {
        await orientation.lock('landscape')
      }
    } catch {
      // iOS Safari 등 미지원 → CSS 회전 폴백이 useEffect 에서 자동 적용됨
    }
  }

  const exitFullscreen = async () => {
    try { window.screen?.orientation?.unlock?.() } catch { /* noop */ }
    try {
      if (document.fullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        await exit?.call(document)
      } else {
        setIsFullscreen(false)
      }
    } catch {
      setIsFullscreen(false)
    }
    setForceCssLandscape(false)
  }

  const sendCommand = (kind, command) => {
    if (!command) return

    commandQueueRef.current = commandQueueRef.current
      .catch(() => {})
      .then(async () => {
        controlBusyRef.current = true
        setControlBusy(true)
        try {
          if (kind === 'camera') {
            await api.moveCamera(command)
          } else {
            await api.moveRobot(command)
          }
        } catch (error) {
          console.error(`[RobotVision] ${kind} command failed:`, error)
        } finally {
          controlBusyRef.current = false
          setControlBusy(false)
        }
      })
  }

  const onMove = (dir) => {
    sendCommand('move', MOVE_COMMANDS[dir])
  }

  const onMoveStop = () => {
    sendCommand('move', 'STOP')
  }

  const onPan = (dir) => {
    sendCommand('camera', CAMERA_COMMANDS[dir])
  }

  return (
    <div className="px-5 pt-5 pb-6">
      <div className="flex items-center gap-2.5 mb-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="뒤로가기"
          className="w-10 h-10 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 font-display text-2xl font-bold text-brand-brown">로봇 비전</h1>
        <Badge tone={isConnected ? "success" : "danger"}>
          {isConnected ? "연결됨" : "연결 끊김"}
        </Badge>
      </div>

      {/* 일반 모드 비디오 */}
      <Card className="overflow-hidden" data-tour="vision-stream">
        <div ref={fsRef} className={isFullscreen ? 'fullscreen-stage' : 'relative w-full aspect-video bg-gradient-to-br from-brand-brown to-black overflow-hidden'}>
          {isFullscreen ? (
            <div className={forceCssLandscape ? 'landscape-rotor' : 'landscape-native'}>
              <FullscreenView
                onExit={exitFullscreen}
                onMove={onMove}
                onMoveStop={onMoveStop}
                onPan={onPan}
                recording={recording}
                irOn={irOn}
                setIrOn={setIrOn}
                streamUrl={streamInfo.url}
                streamError={streamError}
              />
            </div>
          ) : (
            <>
              <StreamFrame
                src={streamInfo.url}
                mode={streamInfo.mode}
                error={streamError}
                className="absolute inset-0"
              />
              <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" /> LIVE
              </span>
              {recording && (
                <span className="absolute top-3 left-20 px-2.5 py-1 rounded-full bg-brand-danger text-white text-[11px] font-bold">
                  ● REC
                </span>
              )}
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

      {/* 세로 모드 조종 패드 (이동 + 카메라) — 스트리밍 바로 아래 */}
      <section className="mt-5">
        <h3 className="font-display text-base font-bold text-brand-brown mb-3">조종 패드</h3>
        <Card className="px-4 py-6">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col items-center gap-2">
              <DPad label="이동" onPress={onMove} onRelease={onMoveStop} tone="light" holdToPress />
              <span className="text-[11px] font-bold text-brand-mute">기기 이동</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <DPad label="카메라" onPress={onPan} centerAction="center" muted tone="light" />
              <span className="text-[11px] font-bold text-brand-mute">카메라 회전</span>
            </div>
          </div>
        </Card>
      </section>

      {/* 컨트롤 (IR / 녹화 / 캡처) */}
      <section className="mt-5" data-tour="vision-controls">
        <h3 className="font-display text-base font-bold text-brand-brown mb-3">제어</h3>
        <Card className="px-5 py-5">
          <div className="flex items-center justify-around gap-3">
            <button
              onClick={() => setIrOn((v) => !v)}
              className={`flex flex-col items-center gap-1 px-4 py-3 rounded-3xl shadow-soft min-w-[88px] transition-colors ${
                irOn ? 'bg-brand-brown text-white active:bg-brand-brown/80' : 'bg-brand-card text-brand-brown active:bg-brand-cream'
              }`}
            >
              {irOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
              <span className="text-xs font-bold">IR {irOn ? 'ON' : 'OFF'}</span>
            </button>
            <button
              onClick={() => setRecording((v) => !v)}
              className={`flex flex-col items-center gap-1 px-4 py-3 rounded-3xl shadow-soft min-w-[88px] transition-colors ${
                recording ? 'bg-brand-danger text-white active:bg-brand-danger/80' : 'bg-brand-card text-brand-brown active:bg-brand-cream'
              }`}
            >
              <Video className="w-5 h-5" />
              <span className="text-xs font-bold">{recording ? '녹화 중' : '녹화'}</span>
            </button>
            <button className="flex flex-col items-center gap-1 px-4 py-3 rounded-3xl bg-brand-card text-brand-brown shadow-soft active:bg-brand-cream transition-colors min-w-[88px]">
              <Camera className="w-5 h-5" />
              <span className="text-xs font-bold">캡처</span>
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-brand-mute">
            가로 조종 패드는 <span className="font-bold text-brand-primary">전체화면</span>에서 활성화됩니다.
          </p>
        </Card>
      </section>

      {/* 이벤트 로그 */}
      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown mb-3">이벤트 로그</h3>
        <Card className="divide-y divide-brand-line">
          {EVENT_LOG.map((e) => {
            const Icon = e.icon || Video
            return (
              <button
                key={e.id}
                onClick={() => setSelectedClip(e)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-brand-cream transition-colors"
              >
                <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${e.danger ? 'bg-brand-danger/15 text-brand-danger' : 'bg-brand-primary/15 text-brand-primary'}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-brand-brown truncate">{e.type}</p>
                  <p className="text-xs text-brand-mute truncate">{e.location}{e.clip_id ? '' : ' · 영상 없음'}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge tone={e.danger ? 'danger' : 'primary'}>{e.clip_id ? 'VOD' : '기록'}</Badge>
                  <span className="text-[11px] text-brand-mute">{e.time}</span>
                  <ChevronRight className="w-4 h-4 text-brand-mute" />
                </div>
              </button>
            )
          })}
        </Card>
      </section>

      {/* 클립 뷰어 (활동 기록 상세와 동일 형식) */}
      {selectedClip && (
        <ClipModal clip={selectedClip} onClose={() => setSelectedClip(null)} />
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
  )
}

/**
 * 전체화면(Landscape) 뷰:
 *  - 배경: 전체 화면 비디오 스트림
 *  - 좌측 하단: 기계 이동 D-Pad (십자, 발바닥 아이콘)
 *  - 우측 하단: 카메라 Pan/Tilt D-Pad (십자, 반투명 배경)
 *  - 상단: IR 토글 + 마이크 + 종료
 *
 * 양손 엄지 동선을 고려해 컨트롤은 하단 좌우, 토글은 상단에 배치.
 */
function FullscreenView({ onExit, onMove, onMoveStop, onPan, recording, irOn, setIrOn, streamUrl, streamError }) {
  const [micOn, setMicOn] = useState(false)
  const toggleMic = () => {
    setMicOn((v) => {
      console.log('[RobotVision] mic:', !v ? 'ON' : 'OFF')
      return !v
    })
  }

  return (
    <>
      {/* 배경 비디오 스트림 (전체화면) */}
      <StreamFrame
        src={streamUrl}
        error={streamError}
        className="absolute inset-0"
        fullscreen
      />

      {/* 상단 좌측: LIVE / REC 인디케이터 */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-[11px] font-bold">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" /> LIVE
        </span>
        {recording && (
          <span className="px-2.5 py-1 rounded-full bg-brand-danger text-white text-[11px] font-bold">
            ● REC
          </span>
        )}
      </div>

      {/* 상단 우측: IR 토글 + 마이크 + 전체화면 종료 */}
      <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
        <IRToggle on={irOn} onChange={setIrOn} />
        <MicButton on={micOn} onClick={toggleMic} />
        <button
          onClick={onExit}
          className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:bg-brand-brown"
          aria-label="전체화면 종료"
        >
          <Minimize2 className="w-5 h-5" />
        </button>
      </div>

      {/* 좌측 하단: 기계 이동 D-Pad */}
      <DPad
        className="absolute bottom-6 left-6 z-50"
        label="이동"
        onPress={onMove}
        onRelease={onMoveStop}
        holdToPress
      />

      {/* 우측 하단: 카메라 Pan/Tilt D-Pad */}
      <DPad
        className="absolute bottom-6 right-6 z-50"
        label="카메라"
        onPress={onPan}
        centerAction="center"
        muted
      />
    </>
  )
}

/* 클립 뷰어 — 바텀시트 + 실제 영상 재생 (활동 기록 상세와 동일 형식).
 * 백엔드가 클립을 저장/서빙하면 자동 재생, 미구현 시 placeholder 폴백. */
function ClipModal({ clip, onClose }) {
  const [show, setShow] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [videoFailed, setVideoFailed] = useState(false)
  const Icon = clip.icon || Video

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!clip?.clip_id) return undefined
    let alive = true
    api
      .getClipUrl(clip.clip_id)
      .then((u) => { if (alive && u) setVideoUrl(u) })
      .catch(() => { if (alive && clip.storage_path) setVideoUrl(resolveMediaUrl(clip.storage_path)) })
    return () => { alive = false }
  }, [clip])

  const dismiss = () => {
    setShow(false)
    setTimeout(onClose, 280)
  }
  const hasClip = !!clip?.clip_id
  const showVideo = hasClip && videoUrl && !videoFailed

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={dismiss}>
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: 'rgba(45,37,32,0.45)', opacity: show ? 1 : 0 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-brand-bg px-5 pt-3 pb-8 shadow-soft-lg transition-transform duration-300 ease-out"
        style={{ transform: show ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div className="mx-auto w-10 h-1.5 rounded-full bg-brand-line mb-4" />

        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${clip.danger ? 'bg-brand-danger/15 text-brand-danger' : 'bg-brand-primary/15 text-brand-primary'}`}>
            <Icon className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-bold text-brand-brown leading-tight">{clip.type}</h3>
            <p className="text-xs text-brand-mute">오늘 {clip.time}</p>
          </div>
          <button type="button" onClick={dismiss} aria-label="닫기" className="text-brand-mute touch-active">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 영상 */}
        <div className="mt-4 relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-brand-brown to-black">
          {hasClip ? (
            <>
              {showVideo ? (
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  onError={() => setVideoFailed(true)}
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-2">
                  <span className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                    <Play className="w-6 h-6 ml-0.5" />
                  </span>
                  <span className="text-[11px] font-semibold">영상 준비 중 · 처리되면 자동 재생</span>
                </div>
              )}
              <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold pointer-events-none">
                <Video className="w-3.5 h-3.5" /> REC
              </span>
              <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold pointer-events-none">
                <MapPin className="w-3.5 h-3.5" /> {clip.location}
              </span>
              {!showVideo && clip.duration && (
                <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-bold tabular-nums pointer-events-none">
                  00:{String(clip.duration).padStart(2, '0')}
                </span>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/75 text-sm font-semibold">
              저장된 영상이 없는 이벤트예요
            </div>
          )}
        </div>

        {/* 메타 */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-brand-cream p-3.5">
            <p className="flex items-center gap-1 text-[11px] font-bold text-brand-mute"><Clock className="w-4 h-4" /> 탐지 시각</p>
            <p className="mt-1 font-display text-lg font-bold text-brand-brown leading-none">{clip.time}</p>
          </div>
          <div className="rounded-2xl bg-brand-cream p-3.5">
            <p className="flex items-center gap-1 text-[11px] font-bold text-brand-mute"><MapPin className="w-4 h-4" /> 위치</p>
            <p className="mt-1 font-display text-lg font-bold text-brand-brown leading-none truncate">{clip.location}</p>
          </div>
        </div>

        {clip.danger && (
          <div className="mt-3 rounded-2xl bg-brand-danger/10 p-3.5 flex items-center gap-2">
            <UserX className="w-5 h-5 text-brand-danger shrink-0" />
            <p className="text-sm font-bold text-brand-danger">주의가 필요한 감지예요. 영상을 확인해 주세요.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function StreamFrame({ src, mode, error, className = '', fullscreen = false }) {
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    setImageError(false)
  }, [src])

  const showFallback = !src || error || imageError

  return (
    <div className={`${className} bg-black flex items-center justify-center overflow-hidden`}>
      {src && !imageError && (
        <img
          src={src}
          alt="Robot camera live stream"
          onError={() => setImageError(true)}
          className="w-full h-full object-cover"
        />
      )}
      {showFallback && (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-brown via-[#2a1d12] to-black flex items-center justify-center text-white/75">
          <div className="text-center px-6">
            <Video className={`${fullscreen ? 'w-16 h-16' : 'w-12 h-12'} mx-auto mb-2 opacity-75`} />
            <p className="text-sm font-semibold">
              {error || imageError ? '카메라 스트림 연결 대기 중' : '스트림 준비 중'}
            </p>
            <p className="mt-1 text-xs opacity-70">
              {mode === 'simulated' ? '시뮬레이션 스트림' : 'MJPEG 실시간 캠'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 표준 십자(Cross) D-Pad.
 *  - 외형: 평범한 cross 레이아웃 (전체 패드는 발바닥 모양 아님).
 *  - 각 방향 버튼 아이콘만 고양이 발바닥(PawPrint)으로.
 *  - 영상 위 시인성을 위해 반투명 배경 + 블러.
 *  - 누름 피드백: scale 변화 없이 배경색만 brand-brown 으로 즉시 전환.
 */
function DPad({ centerAction = null, className = '', holdToPress = false, label, onPress, onRelease = null, muted = false, tone = 'dark' }) {
  const light = tone === 'light'
  const baseBg = light ? 'bg-brand-cream' : muted ? 'bg-white/12' : 'bg-white/18'
  const labelBox = light ? 'bg-brand-primary/15 text-brand-primary' : 'bg-black/35 backdrop-blur-sm text-white/85'
  return (
    <div className={className}>
      <div className="relative">
        <div className="grid grid-cols-3 gap-1.5 w-[148px]">
          <span />
          <DBtn onClick={() => onPress('up')} onRelease={onRelease} holdToPress={holdToPress} bg={baseBg} tone={tone} aria="Up" />
          <span />
          <DBtn onClick={() => onPress('left')} onRelease={onRelease} holdToPress={holdToPress} bg={baseBg} tone={tone} aria="Left" rotate="rotate-[270deg]" />
          {centerAction ? (
            <CenterBtn onClick={() => onPress(centerAction)} tone={tone} />
          ) : (
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${labelBox}`}>
              <span className="text-[10px] font-bold tracking-wider">{label}</span>
            </div>
          )}
          <DBtn onClick={() => onPress('right')} onRelease={onRelease} holdToPress={holdToPress} bg={baseBg} tone={tone} aria="Right" rotate="rotate-90" />
          <span />
          <DBtn onClick={() => onPress('down')} onRelease={onRelease} holdToPress={holdToPress} bg={baseBg} tone={tone} aria="Down" rotate="rotate-180" />
          <span />
        </div>
      </div>
    </div>
  )
}

function DBtn({ onClick, onRelease = null, holdToPress = false, bg, aria, rotate = '', tone = 'dark' }) {
  const activePointerRef = useRef(null)

  const startPress = (event) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    activePointerRef.current = event.pointerId
    onClick()
  }

  const endPress = (event) => {
    if (activePointerRef.current !== event.pointerId) return
    activePointerRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (holdToPress && onRelease) {
      onRelease()
    }
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        if (event.detail === 0) {
          onClick()
          if (holdToPress && onRelease) {
            onRelease()
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
        ${tone === 'light'
          ? 'text-brand-brown shadow-soft active:bg-brand-primary active:text-white'
          : 'backdrop-blur-sm text-white shadow-md active:bg-brand-brown'}
      `}
    >
      <PawPrint className={`w-5 h-5 ${rotate}`} strokeWidth={2.2} />
    </button>
  )
}

function CenterBtn({ onClick, tone = 'dark' }) {
  const light = tone === 'light'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Center"
      className={`
        w-12 h-12 rounded-2xl
        flex items-center justify-center
        transition-colors duration-75
        ${light
          ? 'bg-brand-primary/15 text-brand-primary shadow-soft active:bg-brand-primary active:text-white'
          : 'bg-black/45 backdrop-blur-sm text-white shadow-md active:bg-brand-brown'}
      `}
    >
      <span className="text-[9px] font-bold tracking-wider">CENTER</span>
    </button>
  )
}

/**
 * IR ON/OFF 토글 - pill 모양, 상태 즉시 인지 가능.
 */
function IRToggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`
        h-11 px-4 inline-flex items-center gap-1.5 rounded-full
        font-bold text-sm shadow-md transition-colors
        ${on
          ? 'bg-brand-primary text-white active:bg-brand-brown'
          : 'bg-white/15 backdrop-blur-sm text-white/85 active:bg-brand-brown'}
      `}
    >
      {on ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
      IR {on ? 'ON' : 'OFF'}
    </button>
  )
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
      aria-label={on ? '마이크 끄기' : '마이크 켜기'}
      className={`
        w-11 h-11 rounded-full shadow-md flex items-center justify-center
        transition-colors
        ${on
          ? 'bg-brand-primary text-white active:bg-brand-brown ring-2 ring-white/60'
          : 'bg-white/15 backdrop-blur-sm text-white/85 active:bg-brand-brown'}
      `}
    >
      {on ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
    </button>
  )
}

export default RobotVision
