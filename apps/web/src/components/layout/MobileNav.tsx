"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDictionarySync } from "../../i18n/get-dictionary";

export interface MobileNavProps {
  locale: string;
  role?: "ADMIN" | "DOCTOR";
}

export function MobileNav({ locale, role = "ADMIN" }: MobileNavProps) {
  const pathname = usePathname();
  const dict = getDictionarySync(locale);

  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const dashboardHref = `/${locale}/dashboard/${role === "ADMIN" ? "admin" : "doctor"}`;

  return (
    <nav className="glass-nav fixed bottom-0 inset-x-0 z-40 md:hidden border-t px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-around">
        {/* Dashboard */}
        <Link
          href={dashboardHref}
          className={`flex flex-col items-center gap-1 p-1 min-w-[56px] min-h-[44px] justify-center text-[10px] font-medium transition-colors ${
            isCurrent(dashboardHref)
              ? "text-[#caa95a] font-semibold"
              : "text-[#94a3b8] hover:text-[#f8fafc]"
          }`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="truncate max-w-[56px] text-center">{dict.nav.dashboard}</span>
        </Link>

        {/* Patients */}
        <Link
          href={`/${locale}/patients`}
          className={`flex flex-col items-center gap-1 p-1 min-w-[56px] min-h-[44px] justify-center text-[10px] font-medium transition-colors ${
            isCurrent(`/${locale}/patients`)
              ? "text-[#caa95a] font-semibold"
              : "text-[#94a3b8] hover:text-[#f8fafc]"
          }`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="truncate max-w-[56px] text-center">{dict.nav.patients}</span>
        </Link>

        {/* Floating Action: + New Patient / Visit */}
        <Link
          href={`/${locale}/patients/new`}
          className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#caa95a] to-[#dfbf70] text-[#0a0d14] shadow-lg shadow-[#caa95a]/30 active:scale-95 transition-transform shrink-0"
          title={dict.patients.addPatient}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
        </Link>

        {/* Calendar */}
        <Link
          href={`/${locale}/calendar`}
          className={`flex flex-col items-center gap-1 p-1 min-w-[56px] min-h-[44px] justify-center text-[10px] font-medium transition-colors ${
            isCurrent(`/${locale}/calendar`)
              ? "text-[#caa95a] font-semibold"
              : "text-[#94a3b8] hover:text-[#f8fafc]"
          }`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="truncate max-w-[56px] text-center">{dict.nav.calendar}</span>
        </Link>

        {/* Reservations */}
        <Link
          href={`/${locale}/reservations`}
          className={`flex flex-col items-center gap-1 p-1 min-w-[56px] min-h-[44px] justify-center text-[10px] font-medium transition-colors ${
            isCurrent(`/${locale}/reservations`)
              ? "text-[#caa95a] font-semibold"
              : "text-[#94a3b8] hover:text-[#f8fafc]"
          }`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="truncate max-w-[56px] text-center">{dict.nav.reservations}</span>
        </Link>
      </div>
    </nav>
  );
}
