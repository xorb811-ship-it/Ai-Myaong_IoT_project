import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  PawPrint,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Calendar,
  AlertTriangle,
  KeyRound,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { Card, CreamCard, Badge } from "../components/ui";
import { useAccount, petAgeLabel, speciesLabel, clearAccount, saveAccount } from "../lib/accountRepository";
import { api } from "../api/api";
import { isStrongPassword } from "../components/PasswordField";

function handleLogout() {
  try {
    sessionStorage.removeItem("aimyaong:auth");
    sessionStorage.removeItem("aimyaong:token");
    sessionStorage.removeItem("aimyaong:user");
  } catch {
    /* ignore */
  }
  window.location.href = "/splash";
}

async function handleWithdraw() {
  // 회원 탈퇴 — 백엔드에서 계정+펫 삭제(DELETE /api/auth/me), 그 후 로컬 정리
  try {
    await api.deleteMe();
  } catch {
    /* 백엔드 미연결/오류여도 로컬은 정리하고 로그아웃 */
  }
  try {
    sessionStorage.removeItem("aimyaong:auth");
    sessionStorage.removeItem("aimyaong:token");
    sessionStorage.removeItem("aimyaong:user");
  } catch {
    /* ignore */
  }
  clearAccount();
  window.location.href = "/splash";
}

const FALLBACK_PET = {
  name: "미야옹",
  breed: "코리안 숏헤어",
  birthDate: "2023-04-12",
  weightKg: 4.2,
};

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toISOString().slice(0, 10);
}

export function MyPage() {
  const navigate = useNavigate();
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showCredentialSetup, setShowCredentialSetup] = useState(false);

  // 대시보드와 동일한 소스(useAccount) 사용 → 닉네임/펫 일치
  const account = useAccount();
  const user = account?.user || {};
  const rawPet = account?.pets?.[0] || null;
  const hasPet = Boolean(rawPet);
  const pet = rawPet || {};

  const nickname = user.nickname || "집사";
  const email = user.email || "";
  const initial = (nickname.trim().charAt(0) || "집");
  const registeredAt = fmtDate(account?.createdAt);

  let sessionUser = {};
  try {
    sessionUser = JSON.parse(sessionStorage.getItem("aimyaong:user") || "{}");
  } catch {
    sessionUser = {};
  }

  const googleLinked =
    account?.provider === "google" || sessionUser.oauth_provider === "google";
  const googleEmail = googleLinked ? email : null;
  const hasLocalLogin = Boolean(user.userId || sessionUser.username);
  const canAddLocalLogin = googleLinked && !hasLocalLogin;

  return (
    <div className="px-5 pb-6">
      {/* 헤더 + 뒤로가기 */}
      <header className="flex items-center gap-2.5 pt-5 pb-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="뒤로가기"
          className="w-10 h-10 rounded-2xl bg-brand-card shadow-soft flex items-center justify-center text-brand-brown touch-active shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-brand-brown leading-tight">
            마이페이지
          </h1>
          <p className="text-sm text-brand-mute truncate">
            펫 프로필과 계정을 관리해요
          </p>
        </div>
      </header>

      {/* 유저 카드 */}
      <Card className="px-5 py-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-brand-primary/15 text-brand-primary flex items-center justify-center shadow-soft-inset">
          <span className="font-display text-2xl font-bold">{initial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg font-bold text-brand-brown">
            {nickname}
          </p>
          <p className="text-xs text-brand-mute truncate">{email}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/profile/edit")}
          className="px-3 py-1.5 rounded-2xl bg-brand-cream text-brand-brown text-xs font-bold touch-active shadow-soft"
        >
          편집
        </button>
      </Card>

      {/* 펫 프로필 (1마리 · 탭하면 상세) */}
      <section className="mt-5">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          펫 프로필
        </h3>

        {hasPet ? (
          <button
            type="button"
            onClick={() => navigate("/pet/0")}
            className="w-full text-left touch-active"
          >
            <Card className="paw-watermark px-5 py-5">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-3xl bg-brand-cream flex items-center justify-center shadow-soft-inset overflow-hidden shrink-0">
                  {pet.photo ? (
                    <img
                      src={pet.photo}
                      alt={pet.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <PawPrint className="w-10 h-10 text-brand-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-2xl font-bold text-brand-brown leading-tight truncate">
                    {pet.name}
                  </p>
                  <p className="text-xs text-brand-mute truncate">
                    {pet.breed || speciesLabel(pet.species)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {petAgeLabel(pet.birthDate) && (
                      <Badge tone="brown">{petAgeLabel(pet.birthDate)}</Badge>
                    )}
                    {pet.weightKg && (
                      <Badge tone="primary">{pet.weightKg}kg</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-brand-line grid grid-cols-2 gap-3">
                <InfoCell
                  label="생일"
                  value={pet.birthDate || "-"}
                  icon={<Calendar className="w-4 h-4" />}
                />
                <InfoCell label="등록일" value={registeredAt} />
              </div>
            </Card>
          </button>
        ) : (
          <Card className="paw-watermark px-5 py-8 text-center">
            <span className="mx-auto w-16 h-16 rounded-full bg-brand-cream flex items-center justify-center mb-3">
              <PawPrint className="w-8 h-8 text-brand-primary/70" />
            </span>
            <p className="font-display text-lg font-bold text-brand-brown">
              등록된 반려동물이 없어요
            </p>
            <p className="text-sm text-brand-mute mt-1">
              우리 아이를 등록하고 관리해 보세요 🐾
            </p>
            <button
              type="button"
              onClick={() => navigate("/pet/0")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-brand-primary text-white font-bold px-5 py-2.5 shadow-soft touch-active"
            >
              <PawPrint className="w-4 h-4" /> 반려동물 등록하기
            </button>
          </Card>
        )}
      </section>

      {/* 계정 연동 (구글) */}
      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          계정 연동
        </h3>
        <CreamCard className="px-4 py-4">
          {googleLinked ? (
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-brand-card flex items-center justify-center shrink-0 shadow-soft">
                <GoogleG />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-brand-brown">
                  Google 계정
                </p>
                {googleEmail && (
                  <p className="text-xs text-brand-mute truncate">
                    {googleEmail}
                  </p>
                )}
                {canAddLocalLogin && (
                  <p className="mt-1 text-[11px] text-brand-mute">
                    원하면 아이디/비밀번호 로그인도 추가할 수 있어요.
                  </p>
                )}
              </div>
              <Badge tone="success">연결됨</Badge>
            </div>
          ) : (
            <div>
              <p className="text-sm text-brand-mute mb-3">
                연결된 소셜 계정이 없어요.
              </p>
            </div>
          )}
        </CreamCard>
      </section>

      {/* 계정 관리 */}
      <section className="mt-6">
        <h3 className="font-display text-base font-bold text-brand-brown px-1 mb-2">
          계정 관리
        </h3>
        <Card className="divide-y divide-brand-line">
          {canAddLocalLogin && (
            <ActionRow
              icon={<KeyRound className="w-5 h-5 text-brand-brown" />}
              title="아이디/비밀번호 설정"
              onClick={() => setShowCredentialSetup(true)}
            />
          )}
          {googleLinked && hasLocalLogin && (
            <InfoRow
              icon={<KeyRound className="w-5 h-5 text-brand-brown" />}
              title="아이디/비밀번호 설정됨"
            />
          )}
          <ActionRow
            icon={<LogOut className="w-5 h-5 text-brand-brown" />}
            title="로그아웃"
            onClick={handleLogout}
          />
        </Card>
      </section>

      <p className="mt-6 text-center text-[11px] text-brand-mute">
        AiMyaong v1.0.0 · 사료를 전하고 싶다던가 🐾
      </p>

      {/* 회원 탈퇴 (눈에 띄지 않게, 작게) */}
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={() => setShowWithdraw(true)}
          className="text-[11px] text-brand-mute/60 underline underline-offset-2 hover:text-brand-mute"
        >
          회원 탈퇴
        </button>
      </div>

      {showWithdraw && (
        <WithdrawModal
          onCancel={() => setShowWithdraw(false)}
          onConfirm={handleWithdraw}
        />
      )}
      {showCredentialSetup && (
        <CredentialSetupModal
          account={account}
          onCancel={() => setShowCredentialSetup(false)}
          onDone={() => setShowCredentialSetup(false)}
        />
      )}
    </div>
  );
}

function CredentialSetupModal({ account, onCancel, onDone }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState({ value: "", available: false, message: "" });
  const [err, setErr] = useState("");

  const confirmed = check.available && check.value === username.trim();
  const passwordOk = isStrongPassword(password);
  const passwordMatch = password && password === passwordConfirm;

  const checkUsername = async () => {
    const value = username.trim();
    if (!value) {
      setCheck({ value: "", available: false, message: "아이디를 입력해 주세요." });
      return;
    }
    setChecking(true);
    setErr("");
    try {
      const result = await api.checkUsername(value);
      setCheck({
        value,
        available: result.available,
        message: result.available ? "사용 가능한 아이디입니다." : "이미 사용 중인 아이디입니다.",
      });
    } catch (e) {
      setCheck({ value, available: false, message: e.message || "중복 확인에 실패했습니다." });
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    if (!confirmed) {
      setErr("아이디 중복 확인을 먼저 해주세요.");
      return;
    }
    if (!passwordOk) {
      setErr("비밀번호는 8자 이상, 영문/숫자/특수문자를 포함해야 합니다.");
      return;
    }
    if (!passwordMatch) {
      setErr("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setSaving(true);
    setErr("");
    try {
      const updated = await api.setCredentials({ username: username.trim(), password });
      const nextAccount = {
        ...account,
        user: {
          ...(account?.user || {}),
          userId: updated.username,
          email: updated.email,
          nickname: updated.nickname,
        },
      };
      saveAccount(nextAccount);
      sessionStorage.setItem("aimyaong:user", JSON.stringify(updated));
      onDone();
    } catch (e) {
      setErr(e.message || "아이디/비밀번호 설정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{ background: "rgba(45,37,32,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[380px] rounded-3xl bg-brand-card p-6 shadow-soft-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-14 h-14 rounded-full bg-brand-primary/15 flex items-center justify-center">
          <KeyRound className="w-7 h-7 text-brand-primary" />
        </div>
        <h3 className="mt-4 font-display text-lg font-bold text-brand-brown text-center">
          아이디/비밀번호 설정
        </h3>
        <p className="mt-2 text-sm text-brand-mute leading-relaxed text-center">
          설정하면 다음부터 일반 로그인으로도 들어올 수 있어요.
        </p>

        <label className="mt-5 block">
          <span className="text-xs font-bold text-brand-mute pl-1">아이디</span>
          <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setCheck({ value: "", available: false, message: "" });
              }}
              className="min-w-0 rounded-2xl bg-brand-input border border-brand-line px-4 py-3 text-sm font-semibold text-brand-brown outline-none"
              placeholder="로그인 아이디"
              autoComplete="username"
            />
            <button
              type="button"
              onClick={checkUsername}
              disabled={checking || !username.trim()}
              className={`inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50 ${
                confirmed ? "bg-brand-success" : "bg-brand-primary"
              }`}
            >
              {confirmed && <Check className="w-4 h-4" />}
              {checking ? "확인 중" : confirmed ? "확인됨" : "중복확인"}
            </button>
          </div>
          {check.message && (
            <p className={`mt-1.5 text-xs font-bold pl-1 ${confirmed ? "text-brand-success" : "text-brand-danger"}`}>
              {check.message}
            </p>
          )}
        </label>

        <CredentialPasswordField
          label="비밀번호"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <CredentialPasswordField
          label="비밀번호 확인"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          autoComplete="new-password"
        />

        {password && (
          <p className={`mt-2 text-xs font-bold ${passwordOk ? "text-brand-success" : "text-brand-danger"}`}>
            {passwordOk ? "사용 가능한 비밀번호입니다." : "8자 이상, 영문/숫자/특수문자를 포함해 주세요."}
          </p>
        )}
        {passwordConfirm && (
          <p className={`mt-1 text-xs font-bold ${passwordMatch ? "text-brand-success" : "text-brand-danger"}`}>
            {passwordMatch ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
          </p>
        )}
        {err && <p className="mt-3 text-sm font-bold text-brand-danger">{err}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl py-3.5 text-base font-bold bg-brand-cream text-brand-brown touch-active"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-1 rounded-2xl py-3.5 text-base font-bold text-white touch-active disabled:opacity-50 bg-brand-primary"
          >
            {saving ? "저장 중" : "설정"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CredentialPasswordField({ label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);

  return (
    <label className="mt-4 block">
      <span className="text-xs font-bold text-brand-mute pl-1">{label}</span>
      <div className="mt-1.5 flex items-center rounded-2xl bg-brand-input border border-brand-line px-4 py-3">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-brand-brown outline-none"
          placeholder={label}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-xl text-brand-mute touch-active"
          aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </label>
  );
}

function WithdrawModal({ onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{ background: "rgba(45,37,32,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[360px] rounded-3xl bg-brand-card p-6 shadow-soft-lg text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-14 h-14 rounded-full bg-brand-danger/15 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-brand-danger" />
        </div>
        <h3 className="mt-4 font-display text-lg font-bold text-brand-brown">
          정말 탈퇴하시겠어요?
        </h3>
        <p className="mt-2 text-sm text-brand-mute leading-relaxed">
          탈퇴하면 계정과 등록한 모든 반려동물 정보가 삭제되며, 이 작업은 되돌릴
          수 없습니다.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl py-3.5 text-base font-bold bg-brand-cream text-brand-brown touch-active"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-2xl py-3.5 text-base font-bold text-white touch-active"
            style={{ background: "#E26D5C" }}
          >
            탈퇴하기
          </button>
        </div>
      </div>
    </div>
  );
}

/* 펫 삭제 확인 — 부드럽고 공감하는 톤의 바텀 시트 */
function GoogleG({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 12.9 2 4 10.9 4 22s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.5 5.5C40.9 36.9 44 31 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

function InfoCell({ label, value, icon }) {
  return (
    <div className="rounded-2xl bg-brand-cream px-3 py-2.5">
      <p className="text-[11px] text-brand-mute font-semibold flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="text-sm font-bold text-brand-brown mt-0.5">{value}</p>
    </div>
  );
}

function LinkRow({ icon, title, right }) {
  return (
    <button className="w-full flex items-center gap-3 px-4 py-3.5 touch-active text-left">
      <span className="w-10 h-10 rounded-2xl bg-brand-card flex items-center justify-center shrink-0 shadow-soft">
        {icon}
      </span>
      <p className="flex-1 text-sm font-bold text-brand-brown">{title}</p>
      {right || <ChevronRight className="w-4 h-4 text-brand-mute" />}
    </button>
  );
}

function ActionRow({ icon, title, danger, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 touch-active text-left"
    >
      <span className="w-10 h-10 rounded-2xl bg-brand-cream flex items-center justify-center shrink-0">
        {icon}
      </span>
      <p
        className={`flex-1 text-sm font-bold ${danger ? "text-brand-danger" : "text-brand-brown"}`}
      >
        {title}
      </p>
      <ChevronRight className="w-4 h-4 text-brand-mute" />
    </button>
  );
}

function InfoRow({ icon, title }) {
  return (
    <div className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
      <span className="w-10 h-10 rounded-2xl bg-brand-cream flex items-center justify-center shrink-0">
        {icon}
      </span>
      <p className="flex-1 text-sm font-bold text-brand-brown">{title}</p>
      <Badge tone="success">완료</Badge>
    </div>
  );
}

export default MyPage;
