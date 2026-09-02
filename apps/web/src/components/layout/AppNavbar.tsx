"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Badge } from "../ui/Badge";
import { logoutUser } from "../../lib/auth";
import { getDictionarySync } from "../../i18n/get-dictionary";

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

  const navLinks = [
    { name: dict.nav.dashboard, href: `/${locale}/dashboard/admin` },
    { name: dict.nav.patients, href: `/${locale}/patients` },
    { name: dict.nav.calendar, href: `/${locale}/calendar` },
    { name: dict.nav.reservations, href: `/${locale}/reservations` },
    { name: dict.nav.doctors, href: `/${locale}/doctors` },
    { name: dict.nav.financials, href: `/${locale}/financials` },
    { name: dict.nav.reports, href: `/${locale}/reports` },
    { name: dict.nav.activity, href: `/${locale}/activity` },
    { name: dict.nav.settings, href: `/${locale}/settings` },
  ];

  const notifications: {
    id: string;
    title: string;
    desc: string;
    time: string;
    unread: boolean;
  }[] = [];

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#24314c] bg-[#0a0d14]/95 px-3 sm:px-6 backdrop-blur-md">
        {/* Brand & Context */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open Navigation Menu"
            className="flex md:hidden items-center justify-center h-9 w-9 rounded-xl border border-[#24314c] bg-[#101622] text-[#94a3b8] hover:text-[#f8fafc] shrink-0"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link
            href={`/${locale}/dashboard/${userRole === "ADMIN" ? "admin" : "doctor"}`}
            className="flex items-center gap-2 sm:gap-2.5 transition-opacity hover:opacity-90 min-w-0"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#dfbf70] via-[#caa95a] to-[#99782a] text-[#0a0d14] shadow-md shadow-[#caa95a]/20 shrink-0">
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
              <span className="font-bold tracking-tight text-white text-xs sm:text-base truncate block">{brandName}</span>
              <span className="hidden lg:inline-block text-[10px] text-[#94a3b8] ltr:ml-2 rtl:mr-2 font-normal">
                | {brandTag}
              </span>
            </div>
          </Link>
        </div>

        {/* Center Search (Quick patient lookup - Desktop) */}
        <div className="hidden md:flex flex-1 max-w-xs mx-6">
          <form onSubmit={handleSearch} className="w-full relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={locale === "ar" ? "بحث سريع (DOC-XXXXXX)..." : "Quick patient search (DOC-ID)..."}
              className="w-full rounded-xl border border-[#24314c] bg-[#101622] py-1.5 ps-9 pe-3 text-xs text-[#f8fafc] placeholder-[#64748b] focus:border-[#caa95a] focus:outline-none focus:ring-1 focus:ring-[#caa95a]"
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-[#64748b]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </form>
        </div>

        {/* Right side tools */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <LanguageSwitcher currentLocale={locale} />

          {/* Notifications Popover Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative rounded-xl border border-[#24314c] bg-[#101622] p-2 text-[#94a3b8] hover:text-[#f8fafc] transition-colors"
              title="Notifications"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -end-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#caa95a] text-[9px] font-bold text-[#0a0d14]">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute end-0 mt-2 w-72 sm:w-80 max-w-[90vw] rounded-2xl border border-[#24314c] bg-[#101622] p-4 shadow-2xl shadow-black/90 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-[#24314c]">
                  <h4 className="text-xs font-semibold text-[#f8fafc]">
                    {locale === "ar" ? "الإشعارات" : "Notifications"}
                  </h4>
                  <span className="text-[10px] text-[#caa95a]">
                    {unreadCount > 0 ? `${unreadCount} new` : locale === "ar" ? "محدثة بالكامل" : "All caught up"}
                  </span>
                </div>
                <div className="divide-y divide-[#24314c]/50 mt-2">
                  <div className="py-6 text-center text-xs text-[#64748b]">
                    {locale === "ar" ? "لا توجد إشعارات جديدة حالياً" : "No notifications right now"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User context */}
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="text-right rtl:text-left">
              <p className="text-xs font-semibold text-[#f8fafc]">{userName}</p>
              <div className="mt-0.5">
                <Badge variant={userRole === "ADMIN" ? "gold" : "blue"} size="sm">
                  {userRole === "ADMIN" ? adminLabel : doctorLabel}
                </Badge>
              </div>
            </div>
          </div>

          {/* Logout button */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 rounded-xl border border-[#24314c] bg-[#101622] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#94a3b8] transition-all hover:border-rose-500/40 hover:bg-rose-950/20 hover:text-rose-300 disabled:opacity-50"
            title={logoutText}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">{logoutText}</span>
          </button>
        </div>
      </header>

      {/* Mobile Slide-Out Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Sheet */}
          <div className="relative z-10 w-72 max-w-[85vw] bg-[#0d121c] border-e border-[#24314c] flex flex-col justify-between h-full p-4 overflow-y-auto shadow-2xl">
            <div className="space-y-4">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#24314c]">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#dfbf70] to-[#99782a] text-[#0a0d14] font-bold">
                    DOC
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">{brandName}</span>
                    <span className="text-[10px] text-[#caa95a] font-medium">{adminLabel}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#151d2c]"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Mobile Quick Patient Search */}
              <form onSubmit={handleSearch} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={locale === "ar" ? "بحث سريع..." : "Quick patient search..."}
                  className="w-full rounded-xl border border-[#24314c] bg-[#151d2c] py-2 ps-9 pe-3 text-xs text-[#f8fafc] placeholder-[#64748b] focus:border-[#caa95a] focus:outline-none"
                />
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-[#64748b]">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </form>

              {/* Navigation Links */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] px-2 block">
                  {locale === "ar" ? "العمليات السريرية" : "Clinical Operations"}
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
                          ? "bg-[#caa95a]/15 text-[#f5e8c7] border border-[#caa95a]/30 font-semibold"
                          : "text-[#94a3b8] hover:bg-[#151d2c] hover:text-[#f8fafc]"
                      }`}
                    >
                      <span>{link.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="pt-4 border-t border-[#24314c] space-y-3">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>{logoutText}</span>
              </button>

              <div className="text-center text-[10px] text-[#64748b]">
                Dentist on Call Cairo • 2026
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
