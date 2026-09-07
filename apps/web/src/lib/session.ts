import type { AuthenticatedUser, UserRole } from "../types/auth";

const SESSION_KEY = "doc_session_user";

export interface SessionUser {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
}

export function persistSessionUser(user: AuthenticatedUser): void {
  if (typeof window === "undefined") return;
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getStoredSessionUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.role || !parsed?.display_name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
