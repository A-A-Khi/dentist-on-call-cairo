"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDictionarySync } from "../../i18n/get-dictionary";
import { Drawer } from "../ui/Drawer";
import {
  getDashboardHref,
  getMobileMoreItems,
  getNavSections,
  type NavRole,
} from "./nav-config";
import { NAV_ICONS } from "./nav-icons";

export interface MobileNavProps {
  locale: string;
  role?: NavRole;
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
      className={`flex flex-col items-center gap-0.5 min-w-[52px] min-h-[44px] justify-center rounded-xl px-1.5 py-1 text-[10px] font-medium transition-all duration-200 ${
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
  const [moreOpen, setMoreOpen] = useState(false);

  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const dashboardHref = getDashboardHref(locale, role);
  const fabHref = `/${locale}/patients/new`;
  const fabTitle = dict.patients.addPatient;
  const moreLabel = dict.nav.more ?? (locale === "ar" ? "المزيد" : "More");

  const moreItems = useMemo(
    () => getMobileMoreItems(locale, role, dict.nav),
    [locale, role, dict.nav],
  );
  const moreSections = useMemo(() => {
    const moreKeys = new Set(moreItems.map((i) => i.key));
    return getNavSections(locale, role, dict.nav)
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => moreKeys.has(item.key)),
      }))
      .filter((section) => section.items.length > 0);
  }, [locale, role, dict.nav, moreItems]);

  const moreActive = moreItems.some((item) => isCurrent(item.href));

  return (
    <>
      <nav
        className="glass-nav fixed bottom-0 inset-x-0 z-40 md:hidden border-t px-1.5 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        aria-label="Primary"
      >
        <div className="flex items-center justify-around gap-0.5">
          <NavItem href={dashboardHref} label={dict.nav.dashboard} active={isCurrent(dashboardHref)}>
            <span className="scale-110">{NAV_ICONS.dashboard}</span>
          </NavItem>

          <NavItem
            href={`/${locale}/patients`}
            label={dict.nav.patients}
            active={isCurrent(`/${locale}/patients`)}
          >
            <span className="scale-110">{NAV_ICONS.patients}</span>
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
            <span className="scale-110">{NAV_ICONS.calendar}</span>
          </NavItem>

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center gap-0.5 min-w-[52px] min-h-[44px] justify-center rounded-xl px-1.5 py-1 text-[10px] font-medium transition-all duration-200 ${
              moreActive || moreOpen
                ? "glass-active text-gold-light font-semibold"
                : "text-secondary hover:text-primary hover:bg-slate-900/[0.04]"
            }`}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <span className={moreActive || moreOpen ? "text-gold" : "text-muted"}>
              {NAV_ICONS.more}
            </span>
            <span className="truncate max-w-[56px] text-center leading-tight">{moreLabel}</span>
          </button>
        </div>
      </nav>

      <Drawer
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={moreLabel}
        description={
          locale === "ar" ? "الوصول السريع لباقي أقسام النظام" : "Quick access to the rest of the app"
        }
        side="bottom"
        size="md"
      >
        <div className="space-y-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {moreSections.map((section) => (
            <div key={section.id} className="space-y-1">
              <p className="nav-section-label px-1">{section.label}</p>
              <div className="grid grid-cols-1 gap-1">
                {section.items.map((item) => {
                  const active = isCurrent(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all ${
                        active
                          ? "glass-active text-gold-light"
                          : "text-secondary glass-hover hover:text-primary"
                      }`}
                    >
                      <span className={active ? "text-gold" : "text-muted"}>
                        {NAV_ICONS[item.key]}
                      </span>
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}
