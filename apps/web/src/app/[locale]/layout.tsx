import React from "react";
import type { Metadata } from "next";
import { getDirection, locales } from "../../i18n/config";
import { LocaleDirSync } from "../../components/layout/LocaleDirSync";
import "../globals.css";

export const metadata: Metadata = {
  title: "Dentist on Call — Clinical Operations Platform",
  description: "Secure bilingual internal management PWA for dental care operations in Cairo.",
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dir = getDirection(locale);

  return (
    <html lang={locale} dir={dir} className="dark">
      <body className="min-h-screen bg-[#0a0d14] text-[#f8fafc] antialiased selection:bg-[#caa95a] selection:text-[#0a0d14]">
        <LocaleDirSync locale={locale} dir={dir} />
        {children}
      </body>
    </html>
  );
}
