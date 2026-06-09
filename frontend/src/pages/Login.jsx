import { useEffect, useRef, useState } from "react";
import { Lock, LogIn, User } from "lucide-react";
import { GoogleButton } from "../components/GoogleButton";
import { saveAccount } from "../lib/accountRepository";
import { api } from "../api/api";
import { fromApiPet } from "../lib/petMap";

const DEMO_ID = "admin";
const DEMO_PW = "meow1234";

/* Warm-tone 팔레트 */
const C = {
  bg: 'rgb(var(--brand-bg))',
  card: 'rgb(var(--brand-card))',
  input: 'rgb(var(--brand-input))',
  border: 'rgb(var(--brand-line))',
  brown: 'rgb(var(--brand-brown))',
  mute: 'rgb(var(--brand-mute))',
  primary: 'rgb(var(--brand-primary))',
  primaryDeep: 'rgb(var(--brand-primary-deep))',
  outline: 'rgb(var(--brand-brown))',
  // 고양이 일러스트 색은 의도된 고정값 (다크에서도 동일 유지)
  catOrange: '#F0A56E',
  catOrangeDark: '#E58A4F',
  catCream: '#FAF1E2',
  catPink: '#F5B5A4',
}

/* 로그인 결과를 화면용 계정 저장소(useAccount)에 반영.
 * 펫은 DB(getMe)에서 불러와 pet_id 포함으로 저장 (실패 시 빈 배열). */
async function applyLoggedInUser(result, provider) {
  const u = result?.user || {};
  let pets = [];
  try {
    const me = await api.getMe(); // user + pets (DB)
    pets = (me.pets || []).map((p) => fromApiPet(p));
  } catch {
    /* DB 조회 실패 → 펫 없이 진행 */
  }
  saveAccount({
    provider,
    user: { userId: u.username, email: u.email, nickname: u.nickname },
    pets,
    createdAt: new Date().toISOString(),
  });
}

/**
 * 로그인 화면.
 * - 마우스/터치 좌표 → 머리 전체가 부드럽게 갸웃 (눈은 감겨 있어 눈동자 트래킹은 생략).
 * - 좌표 변화 시 꼬리만 살짝 흔들림.
 */
export function Login({ onLogin, onSignup, onFindId, onFindPassword }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const stageRef = useRef(null);
  const headRef = useRef(null);
  const tailRef = useRef(null);
  const eyeLRef = useRef(null);
  const eyeRRef = useRef(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const apply = (clientX, clientY) => {
      const rect = stage.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2.4;
      const nx = Math.max(-1, Math.min(1, (clientX - cx) / (rect.width / 2)));
      const ny = Math.max(-1, Math.min(1, (clientY - cy) / (rect.height / 2)));

      // 고양이: 커서 향해 갸웃 (translate + rotate)
      if (headRef.current) {
        const tx = nx * 7;
        const ty = ny * 5;
        const rotZ = nx * 8;
        headRef.current.style.transform = `translate(${tx}px, ${ty}px) rotate(${rotZ}deg)`;
      }
      // 눈동자: 살짝 따라감 (±3px / ±2px)
      const ex = nx * 3;
      const ey = ny * 2;
      if (eyeLRef.current)
        eyeLRef.current.style.transform = `translate(${ex}px, ${ey}px)`;
      if (eyeRRef.current)
        eyeRRef.current.style.transform = `translate(${ex}px, ${ey}px)`;
      // 꼬리: 좌우 살짝 흔들림 (±6deg)
      if (tailRef.current) {
        const rotZ = nx * 6;
        tailRef.current.style.transform = `rotate(${rotZ}deg)`;
      }
    };

    const onMouse = (e) => apply(e.clientX, e.clientY);
    const onTouch = (e) => {
      if (e.touches?.length) apply(e.touches[0].clientX, e.touches[0].clientY);
    };
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchstart", onTouch);
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const result = await api.login({ username: id, password: pw });
      sessionStorage.setItem("aimyaong:token", result.access_token);
      sessionStorage.setItem("aimyaong:user", JSON.stringify(result.user));
      await applyLoggedInUser(result, "email");
      onLogin?.();
    } catch (e) {
      setErr(e.message || "아이디 또는 비밀번호를 확인해 주세요");
    }
  };

  const handleGoogleLogin = async (profile) => {
    try {
      const result = await api.googleAuth({
        email: profile.email,
        name: profile.name,
        oauth_id: profile.sub,
        picture: profile.picture,
        allow_create: false,
      });
      sessionStorage.setItem("aimyaong:token", result.access_token);
      sessionStorage.setItem("aimyaong:user", JSON.stringify(result.user));
      await applyLoggedInUser(result, "google");
      onLogin?.();
    } catch (e) {
      setErr(e.message || "구글 로그인 실패");
    }
  };

  return (
    <div
      ref={stageRef}
      className="page-enter flex-1 flex flex-col px-5 pt-8 pb-6 sm:px-8 sm:pt-12"
      style={{ background: C.bg }}
    >
      {/* 브랜드 */}
      <div className="text-center">
        <h1
          className="font-display text-3xl font-bold tracking-tight"
          style={{ color: C.brown }}
        >
          Ai<span style={{ color: C.primary }}>:</span>Myaong
        </h1>
        <p className="mt-1 text-xs font-semibold" style={{ color: C.mute }}>
          사료를 전하고 싶다던가 🐾
        </p>
      </div>

      {/* 반응형 고양이 이미지 */}
      <div className="mt-4 sm:mt-6 flex justify-center">
        <div className="w-full max-w-[240px]">
          <ReactiveCat headRef={headRef} />
        </div>
      </div>

      {/* 로그인 폼 */}
      <form
        onSubmit={submit}
        className="mt-4 sm:mt-6 rounded-3xl p-5 shadow-lg"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
      >
        <p
          className="text-center text-xs font-bold tracking-widest uppercase"
          style={{ color: C.primary }}
        >
          로그인
        </p>

        <WarmField
          icon={<User className="w-4 h-4" />}
          label="아이디"
          value={id}
          onChange={setId}
          placeholder="아이디를 입력해 주세요"
          autoComplete="username"
        />
        <WarmField
          icon={<Lock className="w-4 h-4" />}
          label="비밀번호"
          value={pw}
          onChange={setPw}
          type="password"
          placeholder="비밀번호"
          autoComplete="current-password"
        />

        {err && (
          <p
            className="mt-2 text-xs font-semibold"
            style={{ color: "#E26D5C" }}
          >
            {err}
          </p>
        )}

        <button
          type="submit"
          className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl text-white font-bold py-3.5 shadow-md transition-colors active:brightness-90"
          style={{ background: C.primary }}
        >
          <LogIn className="w-4 h-4" />
          들어가기
        </button>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: C.border }} />
          <span className="text-xs font-bold" style={{ color: C.mute }}>
            또는
          </span>
          <div className="flex-1 h-px" style={{ background: C.border }} />
        </div>
        <div className="mt-4">
          <GoogleButton
            label="Google 계정으로 로그인"
            onSuccess={handleGoogleLogin}
            onError={(e) =>
              setErr(
                e?.message ||
                  e?.error_description ||
                  e?.error ||
                  "구글 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.",
              )
            }
          />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onFindId}
            className="rounded-2xl py-3 text-sm font-semibold transition-colors active:brightness-95"
            style={{
              background: C.input,
              color: C.brown,
              border: `1.5px solid ${C.border}`,
            }}
          >
            아이디 찾기
          </button>
          <button
            type="button"
            onClick={onFindPassword}
            className="rounded-2xl py-3 text-sm font-semibold transition-colors active:brightness-95"
            style={{
              background: C.input,
              color: C.brown,
              border: `1.5px solid ${C.border}`,
            }}
          >
            비밀번호 찾기
          </button>
          <button
            type="button"
            onClick={onSignup}
            className="rounded-2xl py-3 text-sm font-bold text-white transition-colors active:brightness-90"
            style={{ background: C.primary }}
          >
            회원가입
          </button>
        </div>

        <p className="mt-3 text-center text-[11px]" style={{ color: C.mute }}>
          테스트 계정 · {DEMO_ID} / {DEMO_PW}
        </p>
      </form>
    </div>
  );
}

/* ─────────────── Warm Input ─────────────── */
function WarmField({
  icon,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}) {
  return (
    <label className="mt-4 block">
      <span
        className="text-[11px] font-semibold pl-1"
        style={{ color: C.mute }}
      >
        {label}
      </span>
      <div
        className="mt-1 flex items-center gap-2 rounded-2xl px-4 py-3 transition-colors"
        style={{ background: C.input, border: `1.5px solid ${C.border}` }}
      >
        <span style={{ color: C.mute }}>{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:opacity-60"
          style={{ color: C.brown }}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
      </div>
    </label>
  );
}

/* ─────────────── 반응형 고양이 이미지 (public/AAA.png) ───────────────
 * - headRef 래퍼: 커서 방향으로 기울기/이동 (Login 의 mousemove 핸들러가 제어)
 * - cat-bob: 가만히 있을 때 둥실 떠 있는 애니메이션
 * - img: 마우스 올리면 살짝 커지고, 누르면 살짝 작아짐
 * (세 가지를 각각 다른 요소에 둬서 transform 충돌 없이 합성)
 */
function ReactiveCat({ headRef }) {
  return (
    <div
      ref={headRef}
      style={{
        transformOrigin: "center bottom",
        transition: "transform 200ms ease-out",
        willChange: "transform",
      }}
    >
      <div className="cat-bob">
        <img
          src="/AAA.png"
          alt="고양이"
          draggable={false}
          className="w-full h-auto select-none transition-transform duration-300 hover:scale-105 active:scale-95"
          style={{ filter: "drop-shadow(0 16px 22px rgba(92,61,31,0.18))" }}
        />
      </div>
    </div>
  );
}

/* ─────────────── 잠자는 둥근 고양이 (참조 이미지 기반) ───────────────
 * - 옆으로 살짝 기운 둥근 loaf 자세
 * - 흰 가슴/배 + 흰 앞발, 주황 등/머리/꼬리
 * - 감은 눈(C자 곡선), 작은 핑크 코, ω 미소
 * - 검은 외곽선 (~2px)
 * - viewBox 기반 → 부모 width 에 맞춰 자연스럽게 반응형
 */
function ChubbyCat({ headRef, tailRef, eyeLRef, eyeRRef }) {
  return (
    <svg
      viewBox="0 0 240 220"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="w-full h-auto"
      style={{ filter: "drop-shadow(0 16px 22px rgba(92,61,31,0.18))" }}
    >
      {/* 발 밑 그림자 (파스텔 민트 살짝) */}
      <ellipse cx="120" cy="200" rx="80" ry="10" fill="#B8D9CC" opacity="0.7" />
      <ellipse
        cx="120"
        cy="201"
        rx="80"
        ry="10"
        fill="none"
        stroke={C.outline}
        strokeWidth="2"
      />

      {/* 꼬리 (오른쪽으로 휘어진 줄무늬) — 트래킹 그룹 */}
      <g
        ref={tailRef}
        style={{
          transformOrigin: "170px 170px",
          transition: "transform 250ms ease-out",
          willChange: "transform",
        }}
      >
        {/* 꼬리 본체 */}
        <path
          d="M168 178 C 210 178 222 160 220 138"
          stroke={C.catCream}
          strokeWidth="20"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M168 178 C 210 178 222 160 220 138"
          stroke={C.outline}
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        {/* 꼬리 줄무늬 */}
        <path
          d="M190 176 q2 -8 6 -8"
          stroke={C.catOrange}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M205 170 q3 -7 5 -10"
          stroke={C.catOrange}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M216 156 q3 -6 4 -10"
          stroke={C.catOrange}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      {/* ─── 몸통 ─── */}
      {/* 등(흰색 기본) - 둥근 loaf */}
      <path
        d="M44 168
           C 42 124 72 92 120 92
           C 168 92 198 124 196 168
           C 196 192 168 198 120 198
           C 72 198 44 192 44 168 Z"
        fill={C.catCream}
        stroke={C.outline}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />

      {/* 등 위쪽 주황 패치 (어깨~등 위) */}
      <path
        d="M58 138
           C 70 108 100 100 120 100
           C 140 100 170 108 182 138
           C 174 144 150 140 120 140
           C 90 140 66 144 58 138 Z"
        fill={C.catOrange}
        stroke={C.outline}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />

      {/* 앞발 (흰색, 작고 둥글) */}
      <path
        d="M86 188 q-2 14 14 16 q14 -2 14 -16 z"
        fill={C.catCream}
        stroke={C.outline}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M126 188 q-2 14 14 16 q14 -2 14 -16 z"
        fill={C.catCream}
        stroke={C.outline}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* 발가락 라인 */}
      <line
        x1="96"
        y1="200"
        x2="96"
        y2="196"
        stroke={C.outline}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="104"
        y1="201"
        x2="104"
        y2="197"
        stroke={C.outline}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="136"
        y1="200"
        x2="136"
        y2="196"
        stroke={C.outline}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="144"
        y1="201"
        x2="144"
        y2="197"
        stroke={C.outline}
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* ─── 머리 (트래킹 그룹) ─── */}
      <g
        ref={headRef}
        style={{
          transformOrigin: "120px 92px",
          transition: "transform 200ms ease-out",
          willChange: "transform",
        }}
      >
        {/* 귀 (왼쪽) */}
        <path
          d="M64 60 Q58 22 96 40 L100 70 Z"
          fill={C.catOrange}
          stroke={C.outline}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M74 56 Q72 38 90 48 L92 62 Z" fill={C.catPink} />
        {/* 귀 (오른쪽) */}
        <path
          d="M176 60 Q182 22 144 40 L140 70 Z"
          fill={C.catOrange}
          stroke={C.outline}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M166 56 Q168 38 150 48 L148 62 Z" fill={C.catPink} />

        {/* 머리 (흰 베이스) */}
        <ellipse
          cx="120"
          cy="94"
          rx="60"
          ry="52"
          fill={C.catCream}
          stroke={C.outline}
          strokeWidth="2.6"
        />

        {/* 머리 윗부분 주황 패치 (이마/정수리) */}
        <path
          d="M68 86
             Q72 56 120 52
             Q168 56 172 86
             Q150 96 120 96
             Q90 96 68 86 Z"
          fill={C.catOrange}
          stroke={C.outline}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />

        {/* 정수리 줄무늬 (참조: 머리 위 3줄) */}
        <line
          x1="112"
          y1="60"
          x2="112"
          y2="72"
          stroke={C.outline}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="120"
          y1="56"
          x2="120"
          y2="70"
          stroke={C.outline}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="128"
          y1="60"
          x2="128"
          y2="72"
          stroke={C.outline}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* 흰 페이스 마스크 (눈 아래쪽 강조용 - 살짝만) */}
        <path
          d="M88 110
             Q92 132 120 134
             Q148 132 152 110
             Q150 100 120 100
             Q90 100 88 110 Z"
          fill={C.catCream}
          opacity="0.001"
        />

        {/* 볼터치 (분홍 동그라미) */}
        <circle cx="84" cy="116" r="7" fill={C.catPink} opacity="0.85" />
        <circle cx="156" cy="116" r="7" fill={C.catPink} opacity="0.85" />

        {/* 큰 까만 눈 - 트래킹 */}
        <g
          ref={eyeLRef}
          style={{
            transition: "transform 120ms ease-out",
            willChange: "transform",
          }}
        >
          <circle cx="103" cy="108" r="8.5" fill={C.outline} />
          {/* 큰 하이라이트 */}
          <circle cx="100" cy="105" r="2.6" fill="#FFFFFF" />
          {/* 작은 ✨ */}
          <circle cx="106" cy="112" r="1.2" fill="#FFFFFF" />
        </g>
        <g
          ref={eyeRRef}
          style={{
            transition: "transform 120ms ease-out",
            willChange: "transform",
          }}
        >
          <circle cx="137" cy="108" r="8.5" fill={C.outline} />
          <circle cx="134" cy="105" r="2.6" fill="#FFFFFF" />
          <circle cx="140" cy="112" r="1.2" fill="#FFFFFF" />
        </g>

        {/* 코 (작은 핑크 삼각) */}
        <path
          d="M116 122 L124 122 L120 127 Z"
          fill={C.catPink}
          stroke={C.outline}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* 입 (작은 ω - 살짝 미소) */}
        <path
          d="M120 127 q-4 5 -8 3"
          stroke={C.outline}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M120 127 q4 5 8 3"
          stroke={C.outline}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />

        {/* 수염 (3쌍) */}
        <g
          stroke={C.outline}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.85"
        >
          <line x1="60" y1="112" x2="80" y2="114" />
          <line x1="58" y1="120" x2="80" y2="118" />
          <line x1="60" y1="128" x2="80" y2="122" />
          <line x1="180" y1="112" x2="160" y2="114" />
          <line x1="182" y1="120" x2="160" y2="118" />
          <line x1="180" y1="128" x2="160" y2="122" />
        </g>
      </g>
    </svg>
  );
}

export default Login;
