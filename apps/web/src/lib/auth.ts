import { apiClient } from "./api-client";
import type { AuthenticatedUser } from "../types/auth";
import { clearSessionUser, persistSessionUser } from "./session";

export interface LoginPayload {
  email: string;
  password: string;
}

const AUTH_MARKER_COOKIE = "doc_authenticated";
const ROLE_MARKER_COOKIE = "doc_role";

function setAuthMarkerCookies(role: string): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 14;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_MARKER_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  document.cookie = `${ROLE_MARKER_COOKIE}=${encodeURIComponent(role)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearAuthMarkerCookies(): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  document.cookie = `${ROLE_MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function persistCsrfOnly(user: AuthenticatedUser): void {
  if (typeof window === "undefined") return;
  // Access/refresh tokens stay in HttpOnly API cookies. Only CSRF is needed by JS.
  localStorage.removeItem("doc_access_token");
  localStorage.removeItem("doc_refresh_token");
  if (user.csrf_token) {
    localStorage.setItem("doc_csrf_token", user.csrf_token);
  }
}

function clearAuthSecrets(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("doc_access_token");
  localStorage.removeItem("doc_refresh_token");
  localStorage.removeItem("doc_csrf_token");
  clearAuthMarkerCookies();
}

export async function loginUser(payload: LoginPayload): Promise<AuthenticatedUser> {
  const user = await apiClient<AuthenticatedUser>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  persistCsrfOnly(user);
  setAuthMarkerCookies(user.role);
  persistSessionUser(user);
  return user;
}

export async function refreshUserSession(): Promise<AuthenticatedUser> {
  // Prefer HttpOnly refresh cookie; body token only kept for legacy clients.
  const user = await apiClient<AuthenticatedUser>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: null }),
  });
  persistCsrfOnly(user);
  setAuthMarkerCookies(user.role);
  persistSessionUser(user);
  return user;
}

export async function logoutUser(): Promise<{ status: string }> {
  try {
    const res = await apiClient<{ status: string }>("/auth/logout", {
      method: "POST",
    });
    clearAuthSecrets();
    clearSessionUser();
    return res;
  } catch {
    clearAuthSecrets();
    clearSessionUser();
    return { status: "logged_out" };
  }
}

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const user = await apiClient<AuthenticatedUser>("/auth/me");
  persistCsrfOnly(user);
  setAuthMarkerCookies(user.role);
  persistSessionUser(user);
  return user;
}

export async function requestPasswordReset(email: string): Promise<{ status: string; message: string }> {
  return apiClient<{ status: string; message: string }>("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
