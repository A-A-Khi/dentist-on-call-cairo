"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDictionarySync } from "../../i18n/get-dictionary";

export interface MobileNavProps {
  locale: string;
  role?: "ADMIN" | "DOCTOR";
}

function NavItem({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center rounded-xl px-1.5 py-1 text-[10px] font-medium transition-all duration-200 ${
        active
          ? "glass-active text-gold-light font-semibold"
          : "text-secondary hover:text-primary hover:bg-slate-900/[0.04]"
      }`}
    >
      <span className={active ? "text-gold" : "text-muted"}>{children}</span>
      <span className="truncate max-w-[56px] text-center leading-tight">{label}</span>
    </Link>
  );
}

export function MobileNav({ locale, role = "ADMIN" }: MobileNavProps) {
  const pathname = usePathname();
  const dict = getDictionarySync(locale);

  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const dashboardHref = `/${locale}/dashboard/${role === "ADMIN" ? "admin" : "doctor"}`;
  const fabHref = `/${locale}/patients/new`;
  const fabTitle = dict.patients.addPatient;

  return (
    <nav
      className="glass-nav fixed bottom-0 inset-x-0 z-40 md:hidden border-t px-1.5 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Primary"
    >
      <div className="flex items-center justify-around gap-0.5">
        <NavItem href={dashboardHref} label={dict.nav.dashboard} active={isCurrent(dashboardHref)}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </NavItem>

        <NavItem
          href={`/${locale}/patients`}
          label={dict.nav.patients}
          active={isCurrent(`/${locale}/patients`)}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </NavItem>

        <Link
          href={fabHref}
          className="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#a8842d] via-[#caa95a] to-[#dfbf70] text-on-gold shadow-lg shadow-[#caa95a]/35 ring-4 ring-[var(--bg-main)] active:scale-95 transition-transform shrink-0 hover:brightness-105"
          title={fabTitle}
          aria-label={fabTitle}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
        </Link>

        <NavItem
          href={`/${locale}/calendar`}
          label={dict.nav.calendar}
          active={isCurrent(`/${locale}/calendar`)}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </NavItem>

        <NavItem
          href={`/${locale}/reservations`}
          label={dict.nav.reservations}
          active={isCurrent(`/${locale}/reservations`)}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </NavItem>
      </div>
    </nav>
  );
}
