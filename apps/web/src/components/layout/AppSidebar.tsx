"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavSections, type NavDict } from "./nav-config";
import { NAV_ICONS } from "./nav-icons";

export interface AppSidebarProps {
  locale: string;
  role: "ADMIN" | "DOCTOR";
  dict: NavDict;
}

export function AppSidebar({ locale, role, dict }: AppSidebarProps) {
  const pathname = usePathname();
  const sections = getNavSections(locale, role, dict);

  return (
    <aside className="glass-sidebar hidden md:flex w-60 shrink-0 border-e p-4 flex-col justify-between">
      <nav className="space-y-1" aria-label="Primary">
        {sections.map((section) => (
          <div key={section.id} className="nav-section">
            <div className="nav-section-label">{section.label}</div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
                      isActive
                        ? "glass-active text-gold-light font-semibold"
                        : "text-secondary glass-hover hover:text-primary"
                    }`}
                  >
                    <span className={isActive ? "text-gold" : "text-muted"}>
                      {NAV_ICONS[item.key]}
                    </span>
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="glass rounded-xl p-3 text-center space-y-2 mt-4">
        <div className="mx-auto flex h-12 w-full max-w-[11rem] items-center justify-center overflow-hidden rounded-xl border border-[#caa95a]/30 bg-black px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.png" alt="" className="max-h-full w-full object-contain" />
        </div>
        <p className="text-[11px] font-medium text-gold">Dentist on Call</p>
        <p className="text-[10px] text-muted mt-0.5">Cairo Season 2026</p>
      </div>
    </aside>
  );
}
