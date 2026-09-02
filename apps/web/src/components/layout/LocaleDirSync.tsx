"use client";

import { useEffect } from "react";

export function LocaleDirSync({ locale, dir }: { locale: string; dir: "ltr" | "rtl" }) {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = dir;
      document.documentElement.lang = locale;
    }
  }, [locale, dir]);

  return null;
}
