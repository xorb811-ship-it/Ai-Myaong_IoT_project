const DEFAULT_BACKEND_PORT = "8000";

function defaultApiBaseUrl() {
  const host = window.location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1") {
    return "http://127.0.0.1:8000/";
  }
  return `${window.location.protocol}//${host}:${DEFAULT_BACKEND_PORT}/`;
}

export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return (configured || defaultApiBaseUrl()).replace(/\/$/, "");
}

export function getWebSocketUrl(path = "/ws/connect") {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) return configured;

  const url = new URL(getApiBaseUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}
