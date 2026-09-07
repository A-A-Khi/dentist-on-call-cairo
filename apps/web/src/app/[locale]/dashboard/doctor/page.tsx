import React from "react";
import Link from "next/link";
import { getDictionary } from "../../../../i18n/get-dictionary";
import { AppShell } from "../../../../components/layout/AppShell";
import { PageHeader } from "../../../../components/layout/PageHeader";
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
    <AppShell locale={locale} role="DOCTOR">
      <PageHeader
        title={
          <div className="flex flex-wrap items-center gap-3">
            <span>{dict.dashboard.doctorTitle}</span>
            <Badge variant="gold" size="sm">
              Oral & Maxillofacial Specialist
            </Badge>
          </div>
        }
        subtitle={dict.dashboard.doctorSubtitle}
        actions={
          <>
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
          </>
        }
      />
      <DoctorLiveQueue locale={locale} />
    </AppShell>
  );
}
