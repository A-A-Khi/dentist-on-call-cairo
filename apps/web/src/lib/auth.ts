import { apiClient } from "./api-client";
import type { AuthenticatedUser } from "../types/auth";

export interface LoginPayload {
  email: string;
  password: string;
}

export async function loginUser(payload: LoginPayload): Promise<AuthenticatedUser> {
  const user = await apiClient<AuthenticatedUser>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (user.access_token && typeof window !== "undefined") {
    localStorage.setItem("doc_access_token", user.access_token);
  }
  return user;
}

export async function refreshUserSession(): Promise<AuthenticatedUser> {
  const user = await apiClient<AuthenticatedUser>("/auth/refresh", {
    method: "POST",
  });
  if (user.access_token && typeof window !== "undefined") {
    localStorage.setItem("doc_access_token", user.access_token);
  }
  return user;
}

export async function logoutUser(): Promise<{ status: string }> {
  try {
    const res = await apiClient<{ status: string }>("/auth/logout", {
      method: "POST",
    });
    if (typeof window !== "undefined") {
      localStorage.removeItem("doc_access_token");
    }
    return res;
  } catch {
    if (typeof window !== "undefined") {
      localStorage.removeItem("doc_access_token");
    }
    return { status: "logged_out" };
  }
}

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  return apiClient<AuthenticatedUser>("/auth/me");
}

export async function requestPasswordReset(email: string): Promise<{ status: string; message: string }> {
  return apiClient<{ status: string; message: string }>("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
