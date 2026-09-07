"use client";

import React, { useEffect, useState } from "react";
import { AppNavbar } from "./AppNavbar";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { GlassBackground } from "./GlassBackground";
import { getDictionarySync } from "../../i18n/get-dictionary";
import { getCurrentUser } from "../../lib/auth";
import { getStoredSessionUser, persistSessionUser, type SessionUser } from "../../lib/session";
import type { UserRole } from "../../types/auth";

export interface AppShellProps {
  locale: string;
  role?: UserRole;
  children: React.ReactNode;
}

export function AppShell({ locale, role: roleProp, children }: AppShellProps) {
  const dict = getDictionarySync(locale);
  const [session, setSession] = useState<SessionUser | null>(() => getStoredSessionUser());

  useEffect(() => {
    let cancelled = false;
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
      .catch(() => {
        // Keep stored session / prop fallback when offline or unauthorized.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const role: UserRole = session?.role ?? roleProp ?? "ADMIN";
  const userName =
    session?.display_name ??
    (role === "ADMIN"
      ? locale === "ar"
        ? "مدير العمليات"
        : "Operations Director"
      : locale === "ar"
        ? "الطبيب"
        : "Doctor");

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

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-28 md:pb-8">
          <div className="page-container">{children}</div>
        </main>
      </div>

      <MobileNav locale={locale} role={role} />
    </div>
  );
}
