import { Component } from 'react'

/* ───────────────────────────────────────────────────────────
 * 전역 에러 바운더리.
 * 하위 트리에서 렌더링 중 예외가 나도 앱 전체가 흰 화면이 되지 않고
 * 안내 화면 + "다시 시도" 를 보여준다.
 * (이벤트 핸들러/비동기 에러는 못 잡음 — 렌더링 단계 에러 전용)
 * ─────────────────────────────────────────────────────────── */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
    // TODO(백엔드/모니터링): 에러 리포팅 전송 지점
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.assign('/')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-brand-bg text-brand-brown px-6">
        <div className="w-full max-w-[360px] text-center">
          <div className="text-6xl mb-4">🐾</div>
          <h1 className="font-display text-2xl font-bold">잠시 문제가 생겼어요</h1>
          <p className="mt-2 text-sm text-brand-mute leading-relaxed">
            예상치 못한 오류가 발생했어요.<br />다시 시도해 주세요.
          </p>
          <div className="mt-6 flex gap-2.5">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex-1 rounded-2xl bg-brand-cream px-4 py-3 text-sm font-bold text-brand-brown shadow-soft touch-active"
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-bold text-white shadow-soft touch-active"
            >
              처음으로
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
