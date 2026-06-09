import { useLocation } from 'react-router-dom'

/* ───────────────────────────────────────────────────────────
 * 탭/라우트 전환 애니메이션 (은은한 페이드 + 살짝 떠오름)
 *
 * 이 컴포넌트는 "활성 화면이 바뀌면 진입 애니메이션을 재생한다"는
 * 책임만 가진다. 웹에서는 CSS 키프레임(.page-enter)으로 표현하고,
 * pathname 을 key 로 줘서 화면이 바뀔 때 다시 마운트되며 애니메이션이 재생된다.
 *
 * React Native 이식 시:
 *  - react-navigation 을 쓰면 화면 전환은 네비게이터가 담당하므로 이 컴포넌트는 불필요
 *    (cardStyleInterpolator / animation 옵션으로 동일한 fade+slide 지정).
 *  - 직접 만들 경우 Animated.View 의 opacity(0→1) + translateY(8→0) 로 동일하게 구현.
 *  즉 표현 계층만 교체하면 되고, 화면 구성/네비게이션 구조는 그대로 유지된다.
 * ─────────────────────────────────────────────────────────── */
export function PageTransition({ children }) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  )
}

export default PageTransition
