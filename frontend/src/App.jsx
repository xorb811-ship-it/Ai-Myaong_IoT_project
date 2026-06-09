import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { PublicLayout, PrivateLayout } from './components/Layout'
import { Splash } from './pages/Splash'
import { Login } from './pages/Login'
import Signup from './pages/Signup'
import FindId from './pages/FindId'
import FindPassword from './pages/FindPassword'
import ResetPassword from './pages/ResetPassword'
import PetAuthFlow from './pages/PetAuthFlow'
import BodyFatCalculator from './pages/BodyFatCalculator'
import WifiManager from './pages/WifiManager'
import AlertConsole from './pages/AlertConsole'
import { Dashboard } from './pages/Dashboard'
import { RobotVision } from './pages/RobotVision'
import { Dispenser } from './pages/Dispenser'
import { Feeding } from './pages/Feeding'
import { Activity } from './pages/Activity'
import { PetDetail } from './pages/PetDetail'
import { ProfileEdit } from './pages/ProfileEdit'
import { Settings } from './pages/Settings'
import { MyPage } from './pages/MyPage'
import { WifiSetup } from './pages/WifiSetup'
import { Notifications } from './pages/Notifications'

const AUTH_KEY = "aimyaong:auth";

function App() {
  const [authenticated, setAuthenticated] = useState(() => {
    try {
      return !!sessionStorage.getItem('aimyaong:token')
    } catch {
      return false
    }
  })

  const logout = () => {
    sessionStorage.removeItem('aimyaong:token')
    sessionStorage.removeItem('aimyaong:user')
    sessionStorage.removeItem(AUTH_KEY)
    setAuthenticated(false)
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* 단독 데모: 인증→펫 등록→대시보드 통합 플로우 (자체 셸 포함) */}
        <Route path="/flow" element={<PetAuthFlow />} />
        {/* 단독: 반려동물 비만도(체지방률) 계산기 */}
        <Route path="/body-fat" element={<BodyFatCalculator />} />
        {/* 단독: Wi-Fi 스캔/연결 (FastAPI 연동 대비) */}
        <Route path="/wifi-manager" element={<WifiManager />} />
        {/* 단독: 알림 관제 센터 (2열 대시보드 · INTRUSION/FEEDING 상세) */}
        <Route path="/console" element={<AlertConsole />} />

        {/* Public: Splash / Login - 하단 탭 바 없음 */}
        <Route element={<PublicLayout />}>
          <Route path="/splash" element={<Splash />} />
          <Route path="/wifi-setup" element={<WifiSetup />} />
          <Route
            path="/login"
            element={
              authenticated ?
                <Navigate to="/" replace />
              : <LoginRoute onLogin={() => setAuthenticated(true)} />
            }
          />
          <Route
            path="/signup"
            element={
              authenticated
                ? <Navigate to="/" replace />
                : <SignupRoute onLogin={() => setAuthenticated(true)} />
            }
          />
          <Route path="/find-id" element={<FindIdRoute />} />
          <Route path="/find-password" element={<FindPasswordRoute />} />
          <Route path="/reset-password" element={<ResetPasswordRoute />} />
        </Route>

        {/* Private: 메인 5개 탭 - 하단 탭 바 포함 */}
        <Route
          element={
            authenticated ?
              <PrivateLayout />
            : <Navigate to="/splash" replace />
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="vision" element={<RobotVision />} />
          <Route path="dispenser" element={<Dispenser />} />
          <Route path="feeding" element={<Feeding />} />
          <Route path="activity" element={<Activity />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="pet/:idx" element={<PetDetail />} />
          <Route path="profile/edit" element={<ProfileEdit />} />
          <Route path="settings" element={<Settings />} />
          <Route path="mypage" element={<MyPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/splash" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function LoginRoute({ onLogin }) {
  const navigate = useNavigate();
  return (
    <Login
      onLogin={() => {
        onLogin();
        navigate("/", { replace: true });
      }}
      onSignup={() => navigate('/signup')}
      onFindId={() => navigate('/find-id')}
      onFindPassword={() => navigate('/find-password')}
    />
  )
}

function FindIdRoute() {
  const navigate = useNavigate()
  return <FindId onBackToLogin={() => navigate('/login')} />
}

function FindPasswordRoute() {
  const navigate = useNavigate()
  return (
    <FindPassword
      onBackToLogin={() => navigate('/login')}
      onReset={() => navigate('/reset-password')}
    />
  )
}

function ResetPasswordRoute() {
  const navigate = useNavigate()
  return (
    <ResetPassword
      onBackToLogin={() => navigate('/login')}
      onDone={() => navigate('/login')}
    />
  )
}

function SignupRoute({ onLogin }) {
  const navigate = useNavigate()
  return (
    <Signup
      onComplete={() => {
        onLogin()
        navigate('/', { replace: true })
      }}
      onBackToLogin={() => navigate('/login')}
    />
  );
}

export default App;
