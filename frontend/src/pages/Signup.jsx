import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  User,
  Smile,
  PawPrint,
  Dog,
  Cat,
  Calendar,
  Scale,
  Ruler,
  Camera,
  Plus,
  PartyPopper,
  Trash2,
  Pencil,
} from "lucide-react";
import { GoogleButton } from "../components/GoogleButton";
import { EmailVerifyField } from "../components/EmailVerifyField";
import { DateWheel } from "../components/DateWheel";
import { PasswordField, isStrongPassword } from "../components/PasswordField";
import { saveAccount } from "../lib/accountRepository";
import { api } from "../api/api";
import { fromApiPet } from "../lib/petMap";

/* Warm-tone 팔레트 (Login.jsx 와 동일) */
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
  danger: 'rgb(var(--brand-danger))',
  ok: 'rgb(var(--brand-success))',
}

/* 단계 메타 (약관 동의 단계 제거 → 유저 정보부터 시작) */
const STEPS = [
  { key: "user", label: "정보 입력" },
  { key: "pet", label: "펫 정보" },
];
const STEP_USER = 0;
const STEP_PET = 1;

/* 오늘 날짜 (생년월일 미래 선택 방지용) */
const TODAY = new Date().toISOString().slice(0, 10);

/* 빈 펫 객체 — 초기값 & Reset 용 */
const emptyPet = () => ({
  name: "",
  species: "DOG",
  breed: "",
  gender: "M",
  birthDate: "",
  weightKg: "",
  heightCm: "",
  circumference: "", // (선택) 고양이: 갈비뼈 둘레 / 강아지: 골반 둘레 (cm)
  legLength: "", // (선택) 하퇴골 길이 (cm) — 체지방률 계산용
  photo: "", // Base64 미리보기 문자열
  notes: "",
});

/**
 * 다중 단계 회원가입 (프론트 전용).
 * - userInfo 오브젝트 + petList 배열로 전체 흐름 상태 관리
 * - 백엔드 없음 → 최종 페이로드는 console.log + localStorage 저장
 */
export default function Signup({ onComplete, onBackToLogin }) {
  // 화면 전환: 'signup' → 'done'
  const [screen, setScreen] = useState("signup");
  const [step, setStep] = useState(0);

  // 상위 폼 상태
  const [userInfo, setUserInfo] = useState({
    userId: "", // 로그인용 아이디
    password: "",
    passwordConfirm: "",
    email: "", // 아이디/비밀번호 찾기용 이메일
    nickname: "",
  });
  const [emailVerified, setEmailVerified] = useState(false); // 이메일 인증 완료 여부
  const [provider, setProvider] = useState("email"); // 'email' | 'google'
  const [pet, setPet] = useState(emptyPet()); // 펫 1마리

  const [finalPayload, setFinalPayload] = useState(null); // 완료 화면용
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false); // 추가

  const [fieldErrors, setFieldErrors] = useState({}); // 빈/잘못된 칸 강조용
  const [usernameCheck, setUsernameCheck] = useState({
    value: "",
    available: false,
    message: "",
  });
  const [checkingUsername, setCheckingUsername] = useState(false);

  const clearFieldError = (k) =>
    setFieldErrors((p) => (p[k] ? { ...p, [k]: false } : p));

  const setUser = (k, v) => {
    setUserInfo((p) => ({ ...p, [k]: v }));
    if (k === "userId") {
      setUsernameCheck({ value: "", available: false, message: "" });
    }
    clearFieldError(k);
  };
  const setPetField = (k, v) => {
    setPet((p) => ({ ...p, [k]: v }));
    clearFieldError(k);
  };

  const handleEmailVerified = (v) => {
    setEmailVerified(v);
    if (v) clearFieldError("email");
  };

  const handleGoogleSignup = async (profile) => {
    setErr("");
    setFieldErrors({});
    setLoading(true);
    try {
      const result = await api.googleAuth({
        email: profile.email,
        name: profile.name,
        oauth_id: profile.sub,
        picture: profile.picture,
        allow_create: true,
      });
      sessionStorage.setItem("aimyaong:token", result.access_token);
      sessionStorage.setItem("aimyaong:user", JSON.stringify(result.user));

      const savedPets = (result.user?.pets || []).map((p) => fromApiPet(p));
      const savedUser = {
        userId: result.user?.username || "",
        email: result.user?.email || profile.email,
        nickname: result.user?.nickname || profile.name || "",
      };

      saveAccount({
        provider: "google",
        user: savedUser,
        pets: savedPets,
        createdAt: new Date().toISOString(),
      });
      setProvider("google");
      setFinalPayload({ provider: "google", user: savedUser, pets: savedPets });
      setScreen("done");
    } catch (e) {
      setErr(e.message || "구글 회원가입에 실패했어요.");
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameCheck = async () => {
    const username = userInfo.userId.trim();
    if (!username) {
      setUsernameCheck({
        value: "",
        available: false,
        message: "아이디를 입력해 주세요.",
      });
      setFieldErrors((p) => ({ ...p, userId: true }));
      return;
    }

    setCheckingUsername(true);
    setErr("");
    try {
      const result = await api.checkUsername(username);
      setUsernameCheck({
        value: username,
        available: result.available,
        message: result.available
          ? "사용 가능한 아이디입니다."
          : "이미 사용 중인 아이디입니다.",
      });
      setFieldErrors((p) => ({ ...p, userId: !result.available }));
    } catch (error) {
      setUsernameCheck({
        value: username,
        available: false,
        message: error?.message || "아이디 중복 확인에 실패했습니다.",
      });
      setFieldErrors((p) => ({ ...p, userId: true }));
    } finally {
      setCheckingUsername(false);
    }
  };

  /* ── 현재 단계에서 비었거나 잘못된 항목 수집 ── */
  const getStepIssues = () => {
    if (step === STEP_USER) {
      return [
        {
          key: "userId",
          bad: !userInfo.userId.trim(),
          msg: "아이디를 입력해 주세요.",
        },
        {
          key: "userId",
          bad:
            !!userInfo.userId.trim() &&
            (!usernameCheck.available ||
              usernameCheck.value !== userInfo.userId.trim()),
          msg: "아이디 중복 확인을 해주세요.",
        },
        {
          key: "password",
          bad: !isStrongPassword(userInfo.password),
          msg: "비밀번호는 8자 이상이며 영문·숫자·특수문자를 포함해야 합니다.",
        },
        {
          key: "passwordConfirm",
          bad:
            !userInfo.passwordConfirm ||
            userInfo.password !== userInfo.passwordConfirm,
          msg: "비밀번호 확인이 일치하지 않습니다.",
        },
        {
          key: "email",
          bad: !userInfo.email.includes("@") || !emailVerified,
          msg: "이메일 인증을 완료해 주세요.",
        },
        {
          key: "nickname",
          bad: !userInfo.nickname.trim(),
          msg: "닉네임을 입력해 주세요.",
        },
      ];
    }
    if (step === STEP_PET) {
      return [
        { key: "name", bad: !pet.name.trim(), msg: "펫 이름을 입력해 주세요." },
        { key: "breed", bad: !pet.breed.trim(), msg: "품종을 입력해 주세요." },
        {
          key: "birthDate",
          bad: !!pet.birthDate && pet.birthDate > TODAY,
          msg: "생년월일은 오늘 이후로 선택할 수 없어요.",
        },
      ];
    }
    return [];
  };

  // 첫 번째 오류 칸으로 스크롤 (data-field 속성 기준)
  const scrollToField = (key) => {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-field="${key}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const next = () => {
    const failing = getStepIssues().filter((c) => c.bad);
    if (failing.length) {
      const fe = {}
      failing.forEach((c) => { fe[c.key] = true })
      setFieldErrors(fe)
      setErr(failing.length > 1 ? '입력하지 않았거나 올바르지 않은 항목이 있어요.' : failing[0].msg)
      scrollToField(failing[0].key)
      return
    }
    setFieldErrors({});
    setErr("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prev = () => {
    setErr("");
    setFieldErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };

  /* 최종 가입: 페이로드 조립 → console + localStorage */
  const finish = async () => {
    const failing = getStepIssues().filter((c) => c.bad);
    if (failing.length) {
      const fe = {}
      failing.forEach((c) => { fe[c.key] = true })
      setFieldErrors(fe)
      setErr(failing.length > 1 ? '입력하지 않았거나 올바르지 않은 항목이 있어요.' : failing[0].msg)
      scrollToField(failing[0].key)
      return
    }

    setLoading(true);
    setErr("");
    try {
      const result = await api.signup({
        username: userInfo.userId.trim(),
        email: userInfo.email,
        password: userInfo.password,
        nickname: userInfo.nickname,
        pets: [
          {
            name: pet.name,
            species: pet.species,
            breed: pet.breed,
            gender: pet.gender,
            birth_date: pet.birthDate || null,
            weight_kg: pet.weightKg ? Number(pet.weightKg) : null,
            height_cm: pet.heightCm ? Number(pet.heightCm) : null,
            circumference: pet.circumference ? Number(pet.circumference) : null,
            leg_length: pet.legLength ? Number(pet.legLength) : null,
          },
        ],
      });
      sessionStorage.setItem("aimyaong:token", result.access_token);
      sessionStorage.setItem("aimyaong:user", JSON.stringify(result.user));
      const savedPets = (result.user?.pets || []).map((p, index) =>
        fromApiPet(p, index === 0 ? pet.photo : ""),
      );
      const savedUser = {
        userId: result.user?.username || userInfo.userId,
        email: result.user?.email || userInfo.email,
        nickname: result.user?.nickname || userInfo.nickname,
      };
      saveAccount({
        provider,
        user: savedUser,
        pets: savedPets.length ? savedPets : [pet],
        createdAt: new Date().toISOString(),
      });
      setFinalPayload({ provider, user: savedUser, pets: savedPets.length ? savedPets : [pet] });
      setScreen("done");
    } catch (e) {
      setErr(e.message || "가입 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  };

  /* ───────── 환영 로딩 화면 ───────── */
  if (screen === "welcome") {
    return (
      <WelcomeSplash
        nickname={finalPayload?.user?.nickname}
        onDone={onComplete}
      />
    );
  }

  /* ───────── 완료(가상 대시보드) 화면 ───────── */
  if (screen === 'done' && finalPayload) {
    return (
      <DonePanel
        payload={finalPayload}
        onGo={() => setScreen('welcome')}
        onEdit={() => {
          // 등록한 값(pet state) 유지한 채 펫 정보 단계로 돌아가 수정
          setErr('')
          setFieldErrors({})
          setScreen('signup')
          setStep(STEP_PET)
        }}
      />
    )
  }

  /* ───────── 회원가입 단계 화면 ───────── */
  return (
    <div
      className="page-enter font-cute flex-1 flex flex-col h-[100dvh] overflow-hidden"
      style={{ background: C.bg }}
    >
      {/* 상단 고정: 브랜드 + 단계 인디케이터 */}
      <div className="shrink-0 px-5 pt-6 sm:px-8">
        <div className="text-center">
          <h1
            className="font-display text-3xl font-bold tracking-tight"
            style={{ color: C.brown }}
          >
            Ai<span style={{ color: C.primary }}>:</span>Myaong
          </h1>
          <p className="mt-1 text-sm font-semibold" style={{ color: C.mute }}>
            회원가입
          </p>
          {onBackToLogin && step === STEP_USER && (
            <button
              type="button"
              onClick={onBackToLogin}
              className="mt-2 text-sm font-bold hover:underline"
              style={{ color: C.primary }}
            >
              이미 계정이 있으신가요? 로그인
            </button>
          )}
        </div>
        <Stepper step={step} />
      </div>

      {/* 중앙: 스크롤 영역 (폼 카드) */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 pt-4 pb-6 sm:px-8">
        <div
          className="rounded-3xl p-6 shadow-lg"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <div key={step} className="page-enter">
            {step === STEP_USER && (
              <UserStep
                userInfo={userInfo}
                setUser={setUser}
                emailVerified={emailVerified}
                setEmailVerified={handleEmailVerified}
                onGoogle={handleGoogleSignup}
                errors={fieldErrors}
                usernameCheck={usernameCheck}
                checkingUsername={checkingUsername}
                onCheckUsername={handleUsernameCheck}
              />
            )}
            {step === STEP_PET && <PetStep pet={pet} setPetField={setPetField} count={0} errors={fieldErrors} />}
          </div>
        </div>
      </div>

      {/* 하단 고정: 에러 + 네비게이션 */}
      <div
        className="shrink-0 px-5 pt-3 sm:px-8"
        style={{ background: C.bg, borderTop: `1px solid ${C.border}`, paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.75rem)' }}
      >
        {err && (
          <p className="mb-2.5 text-center text-sm font-bold" style={{ color: C.danger }}>
            {err}
          </p>
        )}
        <div className="flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={prev}
            className="inline-flex items-center justify-center gap-1 rounded-2xl px-6 py-4 text-base font-bold transition-colors active:brightness-95"
            style={{
              background: C.input,
              color: C.brown,
              border: `1.5px solid ${C.border}`,
            }}
          >
            <ChevronLeft className="w-5 h-5" /> 이전
          </button>
        )}

        {step < STEP_PET && (
          <button
            type="button"
            onClick={next}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-2xl text-white px-6 py-4 text-base font-bold shadow-md transition-colors active:brightness-90"
            style={{ background: C.primary }}
          >
            다음 <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {step === STEP_PET && (
          <button
            type="button"
            onClick={finish}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl text-white px-6 py-4 text-base font-bold shadow-md transition-colors active:brightness-90"
            style={{ background: C.primaryDeep }}
          >
            <Check className="w-5 h-5" /> 가입 완료
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 단계 인디케이터 ─────────────── */
function Stepper({ step }) {
  return (
    <div className="mt-5 flex items-center justify-center gap-2">
      {STEPS.map((s, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
                style={{
                  background: active ? C.primary : done ? C.ok : C.input,
                  color: active || done ? "#fff" : C.mute,
                  border: `1.5px solid ${active ? C.primary : done ? C.ok : C.border}`,
                }}
              >
                {done ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className="mt-1.5 text-xs font-bold"
                style={{ color: active ? C.brown : C.mute }}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="w-6 h-0.5 rounded-full mb-5"
                style={{ background: done ? C.ok : C.border }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────── Step 1 · 유저 정보 ─────────────── */
function UserStep({
  userInfo,
  setUser,
  emailVerified,
  setEmailVerified,
  onGoogle,
  errors = {},
  usernameCheck,
  checkingUsername,
  onCheckUsername,
}) {
  return (
    <div>
      <SectionTitle
        icon={<User className="w-5 h-5" />}
        title="회원 정보를 입력해 주세요"
      />

      <div className="mt-5">
        <GoogleButton label="Google로 빠른 가입" onSuccess={onGoogle} />
      </div>
      <Divider />

      <div data-field="userId">
        <UsernameField
          value={userInfo.userId}
          onChange={(v) => setUser('userId', v)}
          onCheck={onCheckUsername}
          checking={checkingUsername}
          status={usernameCheck}
          invalid={errors.userId}
        />
      </div>
      <div data-field="password">
        <PasswordField label="비밀번호" value={userInfo.password}
          onChange={(v) => setUser('password', v)} invalid={errors.password} />
      </div>
      <div data-field="passwordConfirm">
        <PasswordField label="비밀번호 확인" value={userInfo.passwordConfirm}
          onChange={(v) => setUser('passwordConfirm', v)} placeholder="비밀번호 재입력" showStrength={false} invalid={errors.passwordConfirm} />
        {userInfo.passwordConfirm && (
          <p className="mt-1.5 text-xs font-bold pl-1"
            style={{ color: userInfo.password === userInfo.passwordConfirm ? C.ok : C.danger }}>
            {userInfo.password === userInfo.passwordConfirm ? '✓ 비밀번호가 일치해요' : '비밀번호가 일치하지 않아요'}
          </p>
        )}
      </div>
      <div data-field="email">
        <EmailVerifyField
          email={userInfo.email}
          onEmailChange={(v) => setUser('email', v)}
          verified={emailVerified}
          onVerifiedChange={setEmailVerified}
          label="이메일"
          hint="아이디/비밀번호 찾기에 사용돼요."
          invalid={errors.email}
        />
      </div>
      <div data-field="nickname">
        <Field icon={<Smile className="w-5 h-5" />} label="닉네임" value={userInfo.nickname}
          onChange={(v) => setUser('nickname', v)} placeholder="집사 이름" invalid={errors.nickname} />
      </div>
    </div>
  );
}

/* "또는" 구분선 */
function Divider() {
  return (
    <div className="mt-5 flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: C.border }} />
      <span className="text-xs font-bold" style={{ color: C.mute }}>
        또는
      </span>
      <div className="flex-1 h-px" style={{ background: C.border }} />
    </div>
  );
}

/* ─────────────── Step 2 · 펫 정보 ─────────────── */
function PetStep({ pet, setPetField, count, errors = {} }) {
  const fileRef = useRef(null);

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPetField("photo", reader.result); // Base64
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <SectionTitle
        icon={<PawPrint className="w-5 h-5" />}
        title={
          count === 0
            ? "반려동물을 등록해 주세요"
            : `${count + 1}번째 반려동물 등록`
        }
      />

      {/* 프로필 이미지 미리보기 */}
      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative w-28 h-28 rounded-full flex items-center justify-center overflow-hidden transition-colors"
          style={{ background: C.input, border: `2px dashed ${C.border}` }}
        >
          {pet.photo ? (
            <img
              src={pet.photo}
              alt="펫 미리보기"
              className="w-full h-full object-cover"
            />
          ) : (
            <Camera className="w-8 h-8" style={{ color: C.mute }} />
          )}
          <span
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: C.primary, border: "2px solid #fff" }}
          >
            <Camera className="w-4 h-4 text-white" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickImage}
          className="hidden"
        />
      </div>

      <div data-field="name">
        <Field icon={<PawPrint className="w-5 h-5" />} label="이름" value={pet.name}
          onChange={(v) => setPetField('name', v)} placeholder="예: 나비" invalid={errors.name} />
      </div>

      {/* 종류 (DOG / CAT) */}
      <FieldLabel>종류</FieldLabel>
      <div className="mt-1.5 grid grid-cols-2 gap-2.5">
        <SegBtn
          active={pet.species === "DOG"}
          onClick={() => setPetField("species", "DOG")}
          icon={<Dog className="w-5 h-5" />}
          label="강아지"
        />
        <SegBtn
          active={pet.species === "CAT"}
          onClick={() => setPetField("species", "CAT")}
          icon={<Cat className="w-5 h-5" />}
          label="고양이"
        />
      </div>

      <div data-field="breed">
        <Field icon={<PawPrint className="w-5 h-5" />} label="품종" value={pet.breed}
          onChange={(v) => setPetField('breed', v)} placeholder="예: 코리안숏헤어" invalid={errors.breed} />
      </div>

      {/* 성별 */}
      <FieldLabel>성별</FieldLabel>
      <div className="mt-1.5 grid grid-cols-2 gap-2.5">
        <SegBtn
          active={pet.gender === "M"}
          onClick={() => setPetField("gender", "M")}
          label="♂ 수컷"
        />
        <SegBtn
          active={pet.gender === "F"}
          onClick={() => setPetField("gender", "F")}
          label="♀ 암컷"
        />
      </div>

      <div data-field="birthDate">
        <FieldLabel>생년월일</FieldLabel>
        <div className="mt-1.5">
          <DateWheel value={pet.birthDate} onChange={(v) => setPetField('birthDate', v)} />
        </div>
      </div>
      <Field
        icon={<Scale className="w-5 h-5" />}
        label="몸무게 (kg)"
        value={pet.weightKg}
        onChange={(v) => setPetField("weightKg", v)}
        placeholder="예: 4.2"
        type="number"
      />
      <Field
        icon={<Ruler className="w-5 h-5" />}
        label="키 (cm)"
        value={pet.heightCm}
        onChange={(v) => setPetField("heightCm", v)}
        placeholder="예: 25"
        type="number"
      />
      <Field
        icon={<Ruler className="w-5 h-5" />}
        label={`${pet.species === "CAT" ? "갈비뼈 둘레" : "골반 둘레"} (cm)`}
        value={pet.circumference}
        onChange={(v) => setPetField("circumference", v)}
        placeholder="선택 · 예: 32"
        type="number"
      />
      <Field
        icon={<Ruler className="w-5 h-5" />}
        label="하퇴골 길이 (cm)"
        value={pet.legLength}
        onChange={(v) => setPetField("legLength", v)}
        placeholder="선택 · 예: 12"
        type="number"
      />
      <p className="mt-1.5 text-xs pl-1" style={{ color: C.mute }}>
        둘레·하퇴골 길이를 입력하면 체지방률이 자동 계산돼요. (선택)
      </p>

      {/* 특이사항 */}
      <FieldLabel>특이사항</FieldLabel>
      <textarea
        value={pet.notes}
        onChange={(e) => setPetField("notes", e.target.value)}
        rows={3}
        placeholder="알러지, 복용 약, 성격 등"
        className="font-sans mt-1.5 w-full rounded-2xl px-4 py-4 text-base outline-none resize-none placeholder:opacity-60"
        style={{
          background: C.input,
          border: `1.5px solid ${C.border}`,
          color: C.brown,
        }}
      />
    </div>
  );
}

/* ─────────────── 환영 로딩 스플래시 ─────────────── */
const WELCOME_MESSAGES = [
  "집사님 맞이할 준비 중…",
  "사료 그릇 반짝반짝 닦는 중 🍚",
  "포근한 낮잠 자리 데우는 중 😴",
  "꼬리 흔드는 연습 중 🐾",
  "거의 다 왔어요! 🐶🐱",
];

function WelcomeSplash({ nickname, onDone }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % WELCOME_MESSAGES.length);
    }, 650);
    const done = setTimeout(onDone, 2800);
    return () => {
      clearInterval(interval);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      className="font-cute flex-1 flex flex-col items-center justify-center h-[100dvh] px-8 text-center"
      style={{ background: C.bg }}
    >
      <style>{`@keyframes wmFill{from{width:0%}to{width:100%}}`}</style>

      {/* 통통 튀는 발바닥 */}
      <div className="text-7xl animate-bounce">🐾</div>

      <h1
        className="mt-6 font-display text-3xl font-bold"
        style={{ color: C.brown }}
      >
        {nickname ? `${nickname}님, 환영해요!` : "환영해요!"}
      </h1>

      {/* 회전 문구 */}
      <p className="mt-2 text-sm font-semibold h-5" style={{ color: C.mute }}>
        {WELCOME_MESSAGES[msgIdx]}
      </p>

      {/* 진행 바 */}
      <div
        className="mt-7 w-full max-w-[240px] h-2.5 rounded-full overflow-hidden"
        style={{ background: C.border }}
      >
        <div
          className="h-full rounded-full"
          style={{
            background: C.primary,
            animation: "wmFill 2.8s ease-out forwards",
          }}
        />
      </div>

      <p className="mt-4 text-xs" style={{ color: C.mute }}>
        잠시만 기다려 주세요 🐈
      </p>
    </div>
  );
}

/* ─────────────── 완료(가상 대시보드) ─────────────── */
function DonePanel({ payload, onGo, onEdit }) {
  const pet = payload.pets[0]
  const chip = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold'
  return (
    <div
      className="font-cute flex-1 flex flex-col h-[100dvh] overflow-y-auto px-5 pt-10 pb-8 sm:px-8"
      style={{ background: C.bg }}
    >
      <div className="text-center">
        <div
          className="mx-auto w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: C.primary }}
        >
          <PartyPopper className="w-10 h-10 text-white" />
        </div>
        <h1
          className="mt-5 font-display text-2xl font-bold"
          style={{ color: C.brown }}
        >
          {payload.user.nickname} 님, 환영해요!
        </h1>
        <p className="mt-1.5 text-sm font-semibold" style={{ color: C.mute }}>
          반려동물 정보까지 등록이 완료되었어요
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between px-1">
        <p className="text-sm font-bold tracking-widest uppercase" style={{ color: C.primary }}>내 반려동물</p>
        <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: C.mute }}>
          <Pencil className="w-3.5 h-3.5" /> 눌러서 수정
        </span>
      </div>

      {pet && (
        <button
          type="button"
          onClick={onEdit}
          className="mt-3 w-full text-left rounded-3xl p-6 shadow-lg transition-transform active:scale-[0.98]"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center shadow-md"
              style={{ background: C.card, border: `2px solid ${C.border}` }}
            >
              {pet.photo
                ? <img src={pet.photo} alt={pet.name} className="w-full h-full object-cover" />
                : <PawPrint className="w-12 h-12" style={{ color: C.mute }} />}
            </div>
            <p className="mt-4 font-display text-2xl font-bold" style={{ color: C.brown }}>{pet.name}</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: C.mute }}>
              {pet.species === 'DOG' ? '강아지' : '고양이'}{pet.breed ? ` · ${pet.breed}` : ''}
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {pet.gender && (
                <span className={chip} style={{ background: C.input, color: C.brown, border: `1px solid ${C.border}` }}>
                  {pet.gender === 'M' ? '♂ 수컷' : '♀ 암컷'}
                </span>
              )}
              {pet.weightKg && (
                <span className={chip} style={{ background: C.input, color: C.brown, border: `1px solid ${C.border}` }}>
                  {pet.weightKg}kg
                </span>
              )}
              {pet.heightCm && (
                <span className={chip} style={{ background: C.input, color: C.brown, border: `1px solid ${C.border}` }}>
                  {pet.heightCm}cm
                </span>
              )}
              {pet.birthDate && (
                <span className={chip} style={{ background: C.input, color: C.brown, border: `1px solid ${C.border}` }}>
                  {pet.birthDate}
                </span>
              )}
            </div>

            <span
              className="mt-5 inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-bold"
              style={{ background: C.input, color: C.primaryDeep, border: `1px solid ${C.border}` }}
            >
              <Pencil className="w-4 h-4" /> 정보 수정하기
            </span>
          </div>
        </button>
      )}

      <button
        type="button"
        onClick={onGo}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl text-white py-4 text-base font-bold shadow-md transition-colors active:brightness-90"
        style={{ background: C.primary }}
      >
        대시보드로 이동 <ChevronRight className="w-5 h-5" />
      </button>

      <p className="mt-4 text-center text-sm" style={{ color: C.mute }}>
        페이로드는 콘솔 & localStorage(<code>aimyaong:signup</code>)에
        저장되었어요.
      </p>
    </div>
  );
}

/* ─────────────── 공통 UI ─────────────── */
function SectionTitle({ icon, title }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: C.primary }}>{icon}</span>
      <h2 className="text-xl font-bold" style={{ color: C.brown }}>
        {title}
      </h2>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <span
      className="mt-5 block text-sm font-bold pl-1"
      style={{ color: C.mute }}
    >
      {children}
    </span>
  );
}

function UsernameField({
  value,
  onChange,
  onCheck,
  checking,
  status = {},
  invalid,
}) {
  const trimmed = value.trim();
  const confirmed = status.available && status.value === trimmed;
  const messageColor = confirmed ? C.ok : C.danger;

  return (
    <label className="mt-5 block">
      <span
        className="text-sm font-bold pl-1"
        style={{ color: invalid ? C.danger : C.mute }}
      >
        아이디
      </span>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div
          className="flex items-center gap-2.5 rounded-2xl px-4 py-4"
          style={{
            background: invalid ? "#FDECE9" : C.input,
            border: `1.5px solid ${invalid ? C.danger : C.border}`,
          }}
        >
          <span style={{ color: invalid ? C.danger : C.mute }}>
            <User className="w-5 h-5" />
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="로그인에 사용할 아이디"
            className="font-sans flex-1 min-w-0 bg-transparent text-base outline-none placeholder:opacity-60"
            style={{ color: C.brown }}
          />
        </div>
        <button
          type="button"
          onClick={onCheck}
          disabled={checking || !trimmed}
          className="inline-flex min-w-[92px] items-center justify-center gap-1.5 rounded-2xl px-4 py-4 text-sm font-bold transition-colors disabled:opacity-50 active:brightness-95"
          style={{
            background: confirmed ? C.ok : C.primary,
            color: "#fff",
            border: `1.5px solid ${confirmed ? C.ok : C.primary}`,
          }}
        >
          {confirmed && <Check className="w-4 h-4" />}
          {checking ? "확인 중" : confirmed ? "확인됨" : "중복확인"}
        </button>
      </div>
      {status.message && (
        <p className="mt-1.5 text-xs font-bold pl-1" style={{ color: messageColor }}>
          {status.message}
        </p>
      )}
    </label>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  invalid,
  max,
}) {
  return (
    <label className="mt-5 block">
      <span
        className="text-sm font-bold pl-1"
        style={{ color: invalid ? C.danger : C.mute }}
      >
        {label}
      </span>
      <div
        className="mt-1.5 flex items-center gap-2.5 rounded-2xl px-4 py-4"
        style={{
          background: invalid ? "#FDECE9" : C.input,
          border: `1.5px solid ${invalid ? C.danger : C.border}`,
        }}
      >
        {icon && (
          <span style={{ color: invalid ? C.danger : C.mute }}>{icon}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          max={max}
          className="font-sans flex-1 min-w-0 bg-transparent text-base outline-none placeholder:opacity-60"
          style={{ color: C.brown }}
        />
      </div>
    </label>
  );
}

function SegBtn({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 rounded-2xl py-4 text-base font-bold transition-colors active:brightness-95"
      style={{
        background: active ? C.primary : C.input,
        color: active ? "#fff" : C.brown,
        border: `1.5px solid ${active ? C.primary : C.border}`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
