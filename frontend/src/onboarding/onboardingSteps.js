/* 온보딩 코치마크 단계 데이터 (뷰/로직과 분리 관리)
 * target : 강조할 영역 식별자 (각 화면의 data-tour 값과 매칭)
 * route  : 해당 단계에서 머물러야 할 경로 (뷰가 자동 이동시킴)
 * title/content : 말풍선에 표시할 안내
 * RN 이식 시에도 이 데이터는 그대로 재사용 (route 는 RN 네비게이션으로 매핑) */
export const onboardingSteps = [
  // ── 대시보드 ──
  {
    target: 'dashboard',
    route: '/',
    title: '대시보드 탭',
    content: '집사님과 반려동물의 모든 현황이 모이는 홈 화면이에요.',
  },
  {
    target: 'dash-pet',
    route: '/',
    title: '반려동물 프로필',
    content: '이름·나이·건강 상태를 보여줘요. 탭하면 상세 정보로 이동해요.',
  },
  {
    target: 'dash-cam',
    route: '/',
    title: '실시간 캠',
    content: '지금 우리 아이 모습을 바로 확인! 탭하면 로봇 비전으로 이동해요.',
  },
  {
    target: 'dash-shortcuts',
    route: '/',
    title: '빠른 작업',
    content: '배식·외출 모드·음성 호출·캡처를 버튼 한 번으로 실행해요.',
  },
  // ── 로봇 비전(로봇 바디) ──
  {
    target: 'vision',
    route: '/vision',
    title: '로봇 비전 탭',
    content: '기기 본체를 움직여 우리 아이를 따라다니며 살펴봐요.',
  },
  {
    target: 'vision-stream',
    route: '/vision',
    title: '실시간 영상',
    content: '실시간 화면을 보고, 전체화면에서 직접 조종할 수 있어요.',
  },
  {
    target: 'vision-controls',
    route: '/vision',
    title: '카메라 제어',
    content: '야간(IR)·녹화·캡처를 여기에서 제어해요.',
  },
  // ── 디스펜서 ──
  {
    target: 'dispenser',
    route: '/dispenser',
    title: '디스펜서 탭',
    content: '사료와 물 급여를 관리하는 곳이에요.',
  },
  {
    target: 'disp-manual',
    route: '/dispenser',
    title: '수동 배식·급수',
    content: '양을 조절하고 버튼을 누르면 그 즉시 배식돼요.',
  },
  {
    target: 'disp-schedule',
    route: '/dispenser',
    title: '자동 스케줄',
    content: '시간대별 자동 배식을 예약하고 관리할 수 있어요.',
  },
]
