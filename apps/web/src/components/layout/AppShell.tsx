"use client";

import React, { useEffect, useState } from "react";
import { AppNavbar } from "./AppNavbar";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { GlassBackground } from "./GlassBackground";
import { getDictionarySync } from "../../i18n/get-dictionary";
import { getCurrentUser } from "../../lib/auth";
import { ApiError } from "../../lib/api-client";
import {
  clearSessionUser,
  getStoredSessionUser,
  persistSessionUser,
  type SessionUser,
} from "../../lib/session";
import type { UserRole } from "../../types/auth";

export interface AppShellProps {
  locale: string;
  role?: UserRole;
  children: React.ReactNode;
}

export function AppShell({ locale, role: roleProp, children }: AppShellProps) {
  const dict = getDictionarySync(locale);
  // Always start null so SSR and first client paint match (avoids React #418).
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stored = getStoredSessionUser();
    if (stored) {
      setSession(stored);
    }
    setSessionReady(true);

    getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        persistSessionUser(user);
        setSession({
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          role: user.role,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        // apiClient already attempted refresh; clear ghost session on hard auth failure.
        if (err instanceof ApiError && err.status === 401) {
          clearSessionUser();
          setSession(null);
          window.location.href = `/${locale}/login`;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const role: UserRole = session?.role ?? roleProp ?? "DOCTOR";
  const userName = !sessionReady
    ? "\u00a0"
    : session?.display_name ??
      (role === "ADMIN"
        ? locale === "ar"
          ? "مدير العمليات"
          : "Operations Director"
        : locale === "ar"
          ? "الطبيب"
          : "Doctor");

  if (sessionReady && !session) {
    return (
      <div className="relative flex min-h-screen items-center justify-center text-primary">
        <GlassBackground />
        <p className="text-sm text-muted">Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col text-primary selection:bg-[#caa95a] selection:text-[#1a1408]">
      <GlassBackground />

      <AppNavbar
        locale={locale}
        userName={userName}
        userRole={role}
        brandName={dict.brand.name}
        brandTag={dict.brand.tagline}
        logoutText={dict.nav.logout}
        adminLabel={dict.roles.admin}
        doctorLabel={dict.roles.doctor}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex shrink-0">
          <AppSidebar locale={locale} role={role} dict={dict.nav} />
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 mobile-nav-pad">
          <div className="page-container animate-fade-in">{children}</div>
        </main>
      </div>

      <MobileNav locale={locale} role={role} />
    </div>
  );
}
