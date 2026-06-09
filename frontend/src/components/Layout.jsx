import { Outlet } from 'react-router-dom'
import { BottomTabBar } from './BottomTabBar'
import { OnboardingTour } from './OnboardingTour'
import { PageTransition } from './PageTransition'

/**
 * 글로벌 모바일 셸.
 * - 데스크톱에서는 480px 폭으로 중앙 정렬, 모바일에서는 풀폭.
 * - 가로 스크롤 차단, 세로 스크롤은 inner main 영역에서 발생.
 */
function MobileShell({ children }) {
  return (
    <div className="min-h-screen w-full flex justify-center bg-brand-brown/10">
      <div
        data-app-frame
        className="relative w-full max-w-[480px] mx-auto min-h-screen overflow-x-hidden bg-brand-bg text-brand-brown flex flex-col shadow-soft-lg"
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Public 라우트용 (Splash / Login).
 * 하단 탭 바 없음. 컨텐츠가 전체 셸을 채움.
 */
export function PublicLayout() {
  return (
    <MobileShell>
      <Outlet />
    </MobileShell>
  )
}

/**
 * Private 라우트용 (대시보드 외 메인 5개 탭).
 * Safe area + 하단 탭 바 포함.
 */
export function PrivateLayout() {
  return (
    <MobileShell>
      <div className="h-safe-top bg-brand-bg" />
      <main className="flex-1 overflow-y-auto pb-24">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <BottomTabBar />
      <OnboardingTour />
    </MobileShell>
  )
}
