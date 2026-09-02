import React from "react";
import { AppNavbar } from "./AppNavbar";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { getDictionarySync } from "../../i18n/get-dictionary";

export interface AppShellProps {
  locale: string;
  role?: "ADMIN" | "DOCTOR";
  children: React.ReactNode;
}

export function AppShell({
  locale,
  role = "ADMIN",
  children,
}: AppShellProps) {
  const dict = getDictionarySync(locale);

  return (
    <div className="flex min-h-screen flex-col bg-[#080a0f] text-[#f8fafc] selection:bg-[#caa95a] selection:text-[#080a0f]">
      {/* Top Header */}
      <AppNavbar
        locale={locale}
        userName={role === "ADMIN" ? "Operations Director" : "Dr. Tarek Omar"}
        userRole={role}
        brandName={dict.brand.name}
        brandTag={dict.brand.tagline}
        logoutText={dict.nav.logout}
        adminLabel={dict.roles.admin}
        doctorLabel={dict.roles.doctor}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex">
          <AppSidebar locale={locale} role={role} dict={dict.nav} />
        </div>

        {/* Primary Content Surface */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-28 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav locale={locale} role={role} />
    </div>
  );
}
