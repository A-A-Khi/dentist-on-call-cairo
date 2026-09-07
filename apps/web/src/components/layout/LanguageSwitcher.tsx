"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";

export interface LanguageSwitcherProps {
  currentLocale: string;
}

export function LanguageSwitcher({ currentLocale }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSwitch = (targetLocale: "en" | "ar") => {
    if (targetLocale === currentLocale) return;

    // Persist locale cookie
    document.cookie = `NEXT_LOCALE=${targetLocale};path=/;max-age=31536000;SameSite=Lax`;

    // Immediately toggle HTML direction & lang
    if (typeof document !== "undefined") {
      document.documentElement.dir = targetLocale === "ar" ? "rtl" : "ltr";
      document.documentElement.lang = targetLocale;
    }

    // Replace locale in URL segment
    const segments = pathname.split("/");
    if (segments.length > 1 && (segments[1] === "en" || segments[1] === "ar")) {
      segments[1] = targetLocale;
    } else {
      segments.unshift("", targetLocale);
    }
    const newPath = segments.join("/") || `/${targetLocale}`;

    router.push(newPath);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1 rounded-xl glass p-1 text-xs">
      <button
        type="button"
        onClick={() => handleSwitch("en")}
        aria-label="Switch to English"
        className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
          currentLocale === "en"
            ? "bg-[#caa95a] text-on-gold font-semibold shadow-sm"
            : "text-secondary hover:text-primary"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => handleSwitch("ar")}
        aria-label="التبديل إلى العربية"
        className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
          currentLocale === "ar"
            ? "bg-[#caa95a] text-on-gold font-semibold shadow-sm"
            : "text-secondary hover:text-primary"
        }`}
      >
        العربية
      </button>
    </div>
  );
}
