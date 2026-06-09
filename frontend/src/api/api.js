import { getApiBaseUrl } from "../lib/backendUrls";

const API_BASE = getApiBaseUrl();
const STREAM_URL = import.meta.env.VITE_STREAM_URL?.trim();

function resolveStreamUrl(url) {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

/* 저장된 미디어(클립 등) 경로 → 재생 가능한 절대 URL.
 * CLIPS.storage_path 같은 상대경로를 API_BASE 기준으로 변환한다. */
export function resolveMediaUrl(path) {
  return resolveStreamUrl(path);
}

async function request(path, options = {}) {
  const token = sessionStorage.getItem("aimyaong:token");
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error(
      `백엔드 서버에 연결할 수 없습니다. ${API_BASE} 실행 상태를 확인하세요.`,
    );
  }

  if (!response.ok) {
    const message = await response.text();
    let errorMessage = message || `API error: ${response.status}`;
    try {
      const parsed = JSON.parse(message);
      errorMessage = extractErrorMessage(parsed) || errorMessage;
    } catch {
      /* keep raw message */
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

function extractErrorMessage(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.detail) return extractErrorMessage(value.detail);
  if (typeof value.stderr === "string" && value.stderr.trim())
    return value.stderr.trim();
  if (typeof value.stdout === "string" && value.stdout.trim())
    return value.stdout.trim();
  if (Array.isArray(value.tried) && value.tried.length) {
    return value.tried
      .map((item) => `${item.baseUrl}: ${item.error}`)
      .join("\n");
  }
  if (typeof value.message === "string") return value.message;
  return "";
}

export const api = {
  getDashboard: () => request("/api/robot/dashboard"),
  getStatus: () => request("/api/robot/status"),
  getStreamUrl: async () => {
    try {
      const data = await request("/api/stream/url");
      return {
        ...data,
        url: resolveStreamUrl(data.url),
      };
    } catch (error) {
      if (STREAM_URL) {
        return { url: resolveStreamUrl(STREAM_URL), mode: "external" };
      }
      throw error;
    }
  },
  /* 감지 클립 재생 URL — 백엔드가 영상 저장/서빙하면 동작.
   * 응답 예: { url } 또는 { storage_path }. 미구현 시 호출 측에서 폴백 처리. */
  getClipUrl: async (clipId) => {
    const data = await request(`/api/clips/${clipId}`);
    return resolveStreamUrl(data.url || data.storage_path || "");
  },
  moveRobot: (command) =>
    request("/api/robot/move", {
      method: "POST",
      body: JSON.stringify({ command }),
    }),
  moveCamera: (direction) =>
    request("/api/robot/camera", {
      method: "POST",
      body: JSON.stringify({ direction }),
    }),
  dispenserFeed: (amount = 1) =>
    request("/api/dispenser/feed", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  dispenserWater: (amount = 1) =>
    request("/api/dispenser/water", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  /* ── 아래 3개는 백엔드 준비 전 "연동 지점" 정의 ──
   * 백엔드가 해당 엔드포인트를 구현하면 그대로 동작한다.
   * (미구현 동안에는 호출 측에서 실패를 잡아 안내 토스트로 처리) */
  // 즉시 1회 스냅샷 캡처 — 응답 예: { imageUrl }
  captureSnapshot: () =>
    request("/api/robot/capture", { method: "POST" }),
  // 양방향 음성 호출 시작
  voiceCall: () =>
    request("/api/robot/voice-call", { method: "POST" }),
  // 외출 모드 on/off 서버 동기화
  setAwayMode: (on) =>
    request("/api/robot/away-mode", {
      method: "POST",
      body: JSON.stringify({ on }),
    }),
  getNetworkStatus: () => request("/api/network/status"),
  scanPiWifi: () => request("/api/network/pi-wifi-scan"),
  configurePiWifi: ({
    ssid,
    password,
    mqttHost,
    mqttPort = 1883,
    esp32SetupUrl,
    piApFallback = false,
  }) =>
    request("/api/network/pi-wifi-connect", {
      method: "POST",
      body: JSON.stringify({
        ssid,
        password,
        mqtt_host: mqttHost,
        mqtt_port: mqttPort,
        esp32_setup_url: esp32SetupUrl,
        pi_ap_fallback: piApFallback,
      }),
    }),
  configureSharedWifi: ({
    ssid,
    password,
    mqttHost,
    mqttPort = 1883,
    esp32SetupUrl,
    piApFallback = false,
  }) =>
    request("/api/network/shared-wifi", {
      method: "POST",
      body: JSON.stringify({
        ssid,
        password,
        mqtt_host: mqttHost,
        mqtt_port: mqttPort,
        esp32_setup_url: esp32SetupUrl,
        pi_ap_fallback: piApFallback,
      }),
    }),

  checkUsername: (username) =>
    request(`/api/auth/check-username?username=${encodeURIComponent(username)}`),

  signup: ({ username, email, password, nickname, pets }) =>
    request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, email, password, nickname, pets }),
    }),

  login: ({ username, password }) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  getMe: () => request("/api/auth/me"),

  // 회원정보 수정 (백엔드에 PATCH /api/auth/me 추가되면 그대로 DB 반영)
  updateMe: (body) =>
    request("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  setCredentials: ({ username, password }) =>
    request("/api/auth/me/credentials", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  // 회원 탈퇴 (계정 + 펫 DB 삭제)
  deleteMe: () => request("/api/auth/me", { method: "DELETE" }),

  // 펫 CRUD (DB 반영) — body 는 toApiPet 으로 변환된 스네이크 형태
  getPets: () => request("/api/pets"),
  createPet: (body) =>
    request("/api/pets", { method: "POST", body: JSON.stringify(body) }),
  updatePetApi: (petId, body) =>
    request(`/api/pets/${petId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePetApi: (petId) =>
    request(`/api/pets/${petId}`, { method: "DELETE" }),

  googleAuth: ({ email, name, oauth_id, picture, allow_create = true }) =>
    request("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ email, name, oauth_id, picture, allow_create }),
    }),
};
