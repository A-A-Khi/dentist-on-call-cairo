"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Badge } from "../ui/Badge";
import { logoutUser } from "../../lib/auth";
import { getDictionarySync } from "../../i18n/get-dictionary";
import { getNavItems, getNavSectionLabel } from "./nav-config";

export interface AppNavbarProps {
  locale: string;
  userName?: string;
  userRole?: "ADMIN" | "DOCTOR";
  brandName: string;
  brandTag: string;
  logoutText: string;
  adminLabel: string;
  doctorLabel: string;
}

export function AppNavbar({
  locale,
  userName = "Clinical Staff",
  userRole = "ADMIN",
  brandName,
  brandTag,
  logoutText,
  adminLabel,
  doctorLabel,
}: AppNavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const dict = getDictionarySync(locale);

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const navLinks = getNavItems(locale, userRole, dict.nav);
  const sectionLabel = getNavSectionLabel(locale, userRole);
  const roleLabel = userRole === "ADMIN" ? adminLabel : doctorLabel;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logoutUser();
    } catch {
      // Continue redirect
    } finally {
      router.push(`/${locale}/login`);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/${locale}/patients?q=${encodeURIComponent(searchQuery.trim())}`);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="glass-nav sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open Navigation Menu"
            className="glass flex md:hidden items-center justify-center h-9 w-9 rounded-xl text-secondary hover:text-primary shrink-0"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link
            href={`/${locale}/dashboard/${userRole === "ADMIN" ? "admin" : "doctor"}`}
            className="flex items-center gap-2 sm:gap-2.5 transition-opacity hover:opacity-90 min-w-0"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#dfbf70] via-[#caa95a] to-[#99782a] text-on-gold shadow-md shadow-[#caa95a]/20 shrink-0">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2C8.5 2 6 4.5 6 8c0 4 3 9 6 14 3-5 6-10 6-14 0-3.5-2.5-6-6-6z" />
                <path d="M9 8h6" />
              </svg>
            </div>
            <div className="min-w-0 truncate">
              <span className="font-bold tracking-tight text-primary text-xs sm:text-base truncate block">{brandName}</span>
              <span className="hidden lg:inline-block text-[10px] text-secondary ltr:ml-2 rtl:mr-2 font-normal">
                | {brandTag}
              </span>
            </div>
          </Link>
        </div>

        <div className="hidden md:flex flex-1 max-w-xs mx-6">
          <form onSubmit={handleSearch} className="w-full relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={locale === "ar" ? "بحث سريع (DOC-XXXXXX)..." : "Quick patient search (DOC-ID)..."}
              className="glass-input w-full rounded-xl py-1.5 ps-9 pe-3 text-xs text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[#caa95a]"
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-muted">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </form>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <LanguageSwitcher currentLocale={locale} />

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="glass relative rounded-xl p-2 text-secondary hover:text-primary transition-colors"
              title={locale === "ar" ? "الإشعارات" : "Notifications"}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>

            {showNotifications && (
              <div className="glass-popover absolute end-0 mt-2 w-72 sm:w-80 max-w-[90vw] rounded-2xl p-4 z-50">
                <div className="flex items-center justify-between pb-2 border-b glass-divider">
                  <h4 className="text-xs font-semibold text-primary">
                    {locale === "ar" ? "الإشعارات" : "Notifications"}
                  </h4>
                  <Link
                    href={`/${locale}/activity`}
                    onClick={() => setShowNotifications(false)}
                    className="text-[10px] text-gold hover:underline"
                  >
                    {locale === "ar" ? "سجل النشاط" : "View activity"}
                  </Link>
                </div>
                <div className="py-6 text-center text-xs text-muted">
                  {locale === "ar" ? "لا توجد إشعارات جديدة حالياً" : "No notifications right now"}
                </div>
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2.5">
            <div className="text-right rtl:text-left">
              <p className="text-xs font-semibold text-primary">{userName}</p>
              <div className="mt-0.5">
                <Badge variant={userRole === "ADMIN" ? "gold" : "blue"} size="sm">
                  {roleLabel}
                </Badge>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="glass flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-medium text-secondary transition-all hover:border-rose-500/40 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
            title={logoutText}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">{logoutText}</span>
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/25 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div className="glass-sidebar relative z-10 w-72 max-w-[85vw] border-e flex flex-col justify-between h-full p-4 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b glass-divider">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#dfbf70] to-[#99782a] text-on-gold font-bold shrink-0">
                    DOC
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-primary block truncate">{userName}</span>
                    <span className="text-[10px] text-gold font-medium">{roleLabel}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-secondary glass-hover hover:text-primary"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSearch} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={locale === "ar" ? "بحث سريع..." : "Quick patient search..."}
                  className="glass-input w-full rounded-xl py-2 ps-9 pe-3 text-xs text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[#caa95a]"
                />
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-muted">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </form>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted px-2 block">
                  {sectionLabel}
                </span>

                {navLinks.map((link) => {
                  const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
                        isActive
                          ? "glass-active text-gold-light font-semibold"
                          : "text-secondary glass-hover hover:text-primary"
                      }`}
                    >
                      <span>{link.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t glass-divider space-y-3">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-50 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>{logoutText}</span>
              </button>

              <div className="text-center text-[10px] text-muted">
                Dentist on Call Cairo • 2026
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
