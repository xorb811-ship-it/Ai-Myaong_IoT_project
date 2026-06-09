/** @type {import('tailwindcss').Config} */
export default {
  // .dark 클래스 전략 (Tailwind 3.4.1+ 'selector' = 최신 방식의 class 전략)
  darkMode: 'selector',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 값은 index.css 의 CSS 변수(RGB 채널)에서 가져옴 → .dark 에서 자동 전환.
        // rgb(var(--x) / <alpha-value>) 형태라 bg-brand-primary/15 같은 투명도 모디파이어도 그대로 동작.
        'brand-primary': 'rgb(var(--brand-primary) / <alpha-value>)',
        'brand-primary-soft': 'rgb(var(--brand-primary-soft) / <alpha-value>)',
        'brand-brown': 'rgb(var(--brand-brown) / <alpha-value>)',
        'brand-brown-soft': 'rgb(var(--brand-brown-soft) / <alpha-value>)',
        'brand-bg': 'rgb(var(--brand-bg) / <alpha-value>)',
        'brand-card': 'rgb(var(--brand-card) / <alpha-value>)',
        'brand-cream': 'rgb(var(--brand-cream) / <alpha-value>)',
        'brand-paw': 'rgb(var(--brand-paw) / <alpha-value>)',
        'brand-mute': 'rgb(var(--brand-mute) / <alpha-value>)',
        'brand-line': 'rgb(var(--brand-line) / <alpha-value>)',
        'brand-success': 'rgb(var(--brand-success) / <alpha-value>)',
        'brand-warning': 'rgb(var(--brand-warning) / <alpha-value>)',
        'brand-danger': 'rgb(var(--brand-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Gmarket Sans"', 'Pretendard', 'system-ui', 'sans-serif'],
        cute: ['Jua', 'Pretendard', 'system-ui', 'sans-serif'],
        hand: ['Gaegu', 'Jua', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'soft': '0 8px 24px -6px rgba(75, 54, 33, 0.10), 0 2px 6px -2px rgba(75, 54, 33, 0.06)',
        'soft-lg': '0 18px 40px -12px rgba(75, 54, 33, 0.18), 0 4px 10px -4px rgba(75, 54, 33, 0.06)',
        'soft-inset': 'inset 2px 2px 6px rgba(75, 54, 33, 0.08), inset -2px -2px 6px rgba(255, 255, 255, 0.7)',
        'press': '0 4px 10px -2px rgba(240, 141, 134, 0.45)',
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
}
