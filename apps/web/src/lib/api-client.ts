import type { ApiErrorResponse } from "../types/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

export class ApiError extends Error {
  status: number;
  data: ApiErrorResponse;

  constructor(status: number, data: ApiErrorResponse) {
    super(data.detail || `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

function clearLocalAuthSecrets(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("doc_access_token");
  localStorage.removeItem("doc_refresh_token");
  localStorage.removeItem("doc_csrf_token");
}

function isAuthBootstrapUrl(url: string): boolean {
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/refresh") ||
    url.includes("/auth/password-reset")
  );
}

async function tryRefreshSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const { refreshUserSession } = await import("./auth");
      await refreshUserSession();
      return true;
    } catch {
      clearLocalAuthSecrets();
      const { clearSessionUser } = await import("./session");
      clearSessionUser();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
  retried = false
): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && typeof window !== "undefined") {
    const csrfToken = localStorage.getItem("doc_csrf_token") || getCookie("doc_csrf");
    if (csrfToken && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  // Cookie-only sessions: never attach Bearer from localStorage (avoids CSRF bypass).
  // Legacy tokens are cleared on login/logout.

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    if (
      response.status === 401 &&
      !retried &&
      typeof window !== "undefined" &&
      !isAuthBootstrapUrl(url)
    ) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return apiClient<T>(endpoint, options, true);
      }
    }

    let errorData: ApiErrorResponse;
    try {
      errorData = await response.json();
    } catch {
      errorData = {
        status: response.status,
        detail: response.statusText || "An unexpected error occurred",
      };
    }
    throw new ApiError(response.status, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}
