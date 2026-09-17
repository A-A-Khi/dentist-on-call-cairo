import React from "react";
import { getDictionary } from "../../../../i18n/get-dictionary";
import { AppShell } from "../../../../components/layout/AppShell";
import { PageHeader } from "../../../../components/layout/PageHeader";
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
      />
      <AdminLiveMetrics locale={locale} dict={dict} />
    </AppShell>
  );
}
