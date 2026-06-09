import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PawPrint } from 'lucide-react'

const AUTH_KEY = 'aimyaong:auth'

export function Splash() {
  const navigate = useNavigate()

  useEffect(() => {
    const isAuth = (() => {
      // App.jsx 와 동일하게 token 기준으로 판단 (키 불일치 시 /splash↔/ 무한 루프 방지)
      try { return !!sessionStorage.getItem('aimyaong:token') } catch { return false }
    })()
    const t = setTimeout(() => {
      navigate(isAuth ? '/' : '/login', { replace: true })
    }, 1600)
    return () => clearTimeout(t)
  }, [navigate])

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 bg-brand-bg">
      <div className="flex flex-col items-center gap-5 animate-[fadeIn_500ms_ease-out]">
        <div className="relative">
          <div className="w-28 h-28 rounded-[2rem] bg-brand-primary flex items-center justify-center shadow-soft-lg">
            <PawPrint className="w-14 h-14 text-white" strokeWidth={2.2} />
          </div>
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-brand-cream shadow-soft" />
        </div>

        <div className="text-center mt-2">
          <h1 className="font-display text-4xl font-bold text-brand-brown tracking-tight">
            Ai<span className="text-brand-primary">:</span>Myaong
          </h1>
          <p className="mt-2 text-sm text-brand-mute font-semibold">
            🐾 사료를 전하고 싶다던가 🐾
          </p>
        </div>
      </div>

      <div className="absolute bottom-12 left-0 right-0 flex justify-center">
        <div className="flex gap-1.5">
          <Dot delay="0ms" />
          <Dot delay="120ms" />
          <Dot delay="240ms" />
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseDot { 0%, 100% { transform: scale(0.7); opacity: 0.4 } 50% { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  )
}

function Dot({ delay }) {
  return (
    <span
      className="w-2 h-2 rounded-full bg-brand-primary"
      style={{ animation: `pulseDot 900ms ease-in-out ${delay} infinite` }}
    />
  )
}

export default Splash
