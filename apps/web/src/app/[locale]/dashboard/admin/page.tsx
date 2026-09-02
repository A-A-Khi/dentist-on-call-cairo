import React from "react";
import Link from "next/link";
import { getDictionary } from "../../../../i18n/get-dictionary";
import { AppNavbar } from "../../../../components/layout/AppNavbar";
import { AppSidebar } from "../../../../components/layout/AppSidebar";
import { MobileNav } from "../../../../components/layout/MobileNav";
import { Button } from "../../../../components/ui/Button";
import { AdminLiveMetrics } from "../../../../components/dashboard/AdminLiveMetrics";

export default async function AdminDashboardPage({
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
        userName="Operations Director"
        userRole="ADMIN"
        brandName={dict.brand.name}
        brandTag={dict.brand.tagline}
        logoutText={dict.nav.logout}
        adminLabel={dict.roles.admin}
        doctorLabel={dict.roles.doctor}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <AppSidebar locale={locale} role="ADMIN" dict={dict.nav} />
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-28 md:pb-8 space-y-6 lg:space-y-8 overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#f8fafc] sm:text-2xl">
                {dict.dashboard.adminTitle}
              </h1>
              <p className="mt-1 text-xs text-[#94a3b8]">{dict.dashboard.adminSubtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Link href={`/${locale}/patients/new`}>
                <Button variant="primary" size="sm">
                  + {dict.dashboard.quickActions.newPatient}
                </Button>
              </Link>
              <Link href={`/${locale}/calendar`}>
                <Button variant="secondary" size="sm">
                  {dict.dashboard.quickActions.newAppointment}
                </Button>
              </Link>
            </div>
          </div>

          <AdminLiveMetrics locale={locale} dict={dict} />
        </main>
      </div>

      <MobileNav locale={locale} role="ADMIN" />
    </div>
  );
}
