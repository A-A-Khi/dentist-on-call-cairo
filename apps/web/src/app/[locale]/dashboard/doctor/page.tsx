import React from "react";
import { getDictionary } from "../../../../i18n/get-dictionary";
import { AppShell } from "../../../../components/layout/AppShell";
import { PageHeader } from "../../../../components/layout/PageHeader";
import { ButtonLink } from "../../../../components/ui/Button";
import { DoctorLiveQueue } from "../../../../components/dashboard/DoctorLiveQueue";

export default async function DoctorDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return (
    <AppShell locale={locale} role="DOCTOR">
      <PageHeader
        title={dict.dashboard.doctorTitle}
        subtitle={dict.dashboard.doctorSubtitle}
        actions={
          <>
            <ButtonLink href={`/${locale}/patients`} variant="secondary" size="sm">
              {dict.nav.patients}
            </ButtonLink>
            <ButtonLink href={`/${locale}/calendar`} variant="primary" size="sm">
              {dict.nav.calendar}
            </ButtonLink>
          </>
        }
      />
      <DoctorLiveQueue locale={locale} />
    </AppShell>
  );
}
