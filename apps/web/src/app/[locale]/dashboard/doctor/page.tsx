import React from "react";
import Link from "next/link";
import { getDictionary } from "../../../../i18n/get-dictionary";
import { AppNavbar } from "../../../../components/layout/AppNavbar";
import { AppSidebar } from "../../../../components/layout/AppSidebar";
import { MobileNav } from "../../../../components/layout/MobileNav";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { DoctorLiveQueue } from "../../../../components/dashboard/DoctorLiveQueue";

export default async function DoctorDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0d14]">
      <AppNavbar
        locale={locale}
        userName="Dr. Tarek Omar"
        userRole="DOCTOR"
        brandName={dict.brand.name}
        brandTag={dict.brand.tagline}
        logoutText={dict.nav.logout}
        adminLabel={dict.roles.admin}
        doctorLabel={dict.roles.doctor}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <AppSidebar locale={locale} role="DOCTOR" dict={dict.nav} />
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-28 md:pb-8 space-y-6 sm:space-y-8 overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#f8fafc]">
                  {dict.dashboard.doctorTitle}
                </h1>
                <Badge variant="gold" size="sm">
                  Oral & Maxillofacial Specialist
                </Badge>
              </div>
              <p className="text-xs text-[#94a3b8] mt-1">{dict.dashboard.doctorSubtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/${locale}/patients`}>
                <Button variant="secondary" size="sm">
                  {dict.nav.patients}
                </Button>
              </Link>
              <Link href={`/${locale}/calendar`}>
                <Button variant="primary" size="sm">
                  {dict.nav.calendar}
                </Button>
              </Link>
            </div>
          </div>

          <DoctorLiveQueue locale={locale} />
        </main>
      </div>

      <MobileNav locale={locale} role="DOCTOR" />
    </div>
  );
}
