import React from "react";
import Link from "next/link";
import { getDictionary } from "../../../../i18n/get-dictionary";
import { AppShell } from "../../../../components/layout/AppShell";
import { PageHeader } from "../../../../components/layout/PageHeader";
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
    <AppShell locale={locale} role="ADMIN">
      <PageHeader
        title={dict.dashboard.adminTitle}
        subtitle={dict.dashboard.adminSubtitle}
        actions={
          <>
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
          </>
        }
      />
      <AdminLiveMetrics locale={locale} dict={dict} />
    </AppShell>
  );
}
