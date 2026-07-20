import emailjs from '@emailjs/browser'

/* EmailJS 설정.
 * 우선순위: .env(VITE_EMAILJS_*) → 없으면 아래 공개 기본값.
 * EmailJS 의 service/template ID 와 PUBLIC KEY 는 비밀값이 아니라 공개값이다
 * (어차피 브라우저 번들에 노출됨). .env 가 없는 배포 빌드/팀원 환경에서도
 * 실제 메일 발송이 되도록 기본값을 둔다.
 * ⚠️ 공개값이라 제3자가 발송 할당량을 도용할 수 있음 → 남용 시 키 재발급. */
const DEFAULT_SERVICE_ID = 'service_ys3gyas'
const DEFAULT_TEMPLATE_ID = 'template_5517zca'
const DEFAULT_PUBLIC_KEY = 'QpoSG0GYOKglql4ec'

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || DEFAULT_SERVICE_ID
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || DEFAULT_TEMPLATE_ID
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || DEFAULT_PUBLIC_KEY

/* 3개 키가 모두 있어야 실제 발송 (이제 기본값이 있어 항상 true → 실제 발송) */
export const emailjsConfigured = Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY)

/**
 * 인증번호 메일 발송 (EmailJS · 프론트 전용).
 * 템플릿에서 사용할 수 있는 변수: {{email}}, {{code}}, {{passcode}}
 * - EmailJS 템플릿의 "To Email" 을 {{email}} 로 설정하세요.
 * - 본문 어딘가에 {{code}} (또는 {{passcode}}) 를 넣으세요.
 */
export async function sendVerificationEmail(email, code) {
  if (!emailjsConfigured) throw new Error('EmailJS가 설정되지 않았습니다.')
  return emailjs.send(
    SERVICE_ID,
    TEMPLATE_ID,
    { email, to_email: email, code, passcode: code },
    { publicKey: PUBLIC_KEY },
  )
}
