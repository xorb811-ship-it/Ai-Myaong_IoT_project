import { useEffect, useRef, useState } from 'react'

/* Warm-tone 일부 (버튼 테두리용) */
const C = {
  brown: 'rgb(var(--brand-brown))',
  border: 'rgb(var(--brand-line))',
  card: 'rgb(var(--brand-card))',
  danger: 'rgb(var(--brand-danger))',
}

/* Google OAuth Client ID.
 * 우선순위: .env(VITE_GOOGLE_CLIENT_ID) → 없으면 아래 공개 기본값.
 * 웹 OAuth Client ID는 비밀값이 아니라 공개값이다(어차피 브라우저 번들에 노출됨).
 * 보안 경계는 "승인된 JavaScript 원본(도메인)"이며, .env 가 없는 배포 빌드(예: Vercel git 빌드)에서도
 * 구글 로그인이 동작하도록 기본값을 둔다. */
const DEFAULT_CLIENT_ID =
  '1034586846978-d24vdc078j1ae041c1d77anqrc3s005j.apps.googleusercontent.com'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID
const GIS_SRC = 'https://accounts.google.com/gsi/client'

/* Google Identity Services 스크립트 1회 로드 */
function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    let s = document.getElementById('gis-client')
    if (s) {
      s.addEventListener('load', () => resolve())
      s.addEventListener('error', () => reject(new Error('GIS 스크립트 로드 실패')))
      return
    }
    s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.id = 'gis-client'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('GIS 스크립트 로드 실패'))
    document.head.appendChild(s)
  })
}

/* 컬러 구글 'G' 로고 */
function GoogleG({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 12.9 2 4 10.9 4 22s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.5 5.5C40.9 36.9 44 31 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  )
}

/**
 * 실제 구글 OAuth 로그인 버튼 (Google Identity Services).
 * - 클릭 → 구글 OAuth 팝업 → access token → userinfo 조회
 * - onSuccess({ email, name, picture, verified }) 로 실제 구글 프로필 전달
 *
 * 사전 준비:
 *  1) Google Cloud Console에서 OAuth 2.0 Client ID(웹) 발급 (무료)
 *  2) 승인된 JavaScript 원본에 개발 주소 등록 (예: http://localhost:5173)
 *  3) frontend/.env 에  VITE_GOOGLE_CLIENT_ID=발급받은_클라이언트_ID  추가 후 dev 서버 재시작
 */
export function GoogleButton({ onSuccess, onError, label = 'Google 계정으로 계속하기' }) {
  const [loading, setLoading] = useState(false)
  const tokenClientRef = useRef(null)
  const cbRef = useRef({})
  cbRef.current = { onSuccess, onError } // 항상 최신 핸들러 참조

  /* userinfo 조회 후 프로필 전달 */
  const fetchProfile = async (accessToken) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`userinfo ${res.status}`)
      const info = await res.json()
      cbRef.current.onSuccess?.({
        email: info.email,
        name: info.name || info.given_name || info.email?.split('@')[0],
        picture: info.picture,
        verified: info.email_verified,
        sub: info.sub,
      })
    } catch (e) {
      cbRef.current.onError?.(e)
    } finally {
      setLoading(false)
    }
  }

  /* GIS 로드 + 토큰 클라이언트 초기화 (1회) */
  const ensureClient = async () => {
    await loadGis()
    if (!tokenClientRef.current) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'openid email profile',
        callback: (resp) => {
          if (resp.error) { setLoading(false); cbRef.current.onError?.(resp); return }
          fetchProfile(resp.access_token)
        },
        error_callback: (err) => { setLoading(false); cbRef.current.onError?.(err) },
      })
    }
    return tokenClientRef.current
  }

  /* CLIENT_ID 있으면 미리 스크립트 로드 (첫 클릭 지연 감소) */
  useEffect(() => {
    if (CLIENT_ID) loadGis().catch(() => { /* 클릭 시 재시도 */ })
  }, [])

  const handleClick = async () => {
    if (!CLIENT_ID) {
      const msg = 'Google Client ID가 없습니다. frontend/.env 에 VITE_GOOGLE_CLIENT_ID 를 설정하고 dev 서버를 재시작하세요.'
      console.error('[GoogleButton]', msg)
      cbRef.current.onError?.(new Error(msg))
      alert(msg)
      return
    }
    setLoading(true)
    try {
      const client = await ensureClient()
      client.requestAccessToken() // 구글 OAuth 팝업
    } catch (e) {
      setLoading(false)
      console.error('[GoogleButton]', e)
      cbRef.current.onError?.(e)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl py-3.5 text-base font-bold transition-colors active:brightness-95 disabled:opacity-60"
      style={{ background: C.card, color: C.brown, border: `1.5px solid ${C.border}` }}
    >
      <GoogleG />
      {loading ? '구글 로그인 중…' : label}
    </button>
  )
}

export default GoogleButton
