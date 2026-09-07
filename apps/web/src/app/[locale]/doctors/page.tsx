"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { fetchDoctors } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { Doctor } from "../../../lib/clinical-data";

export default function DoctorsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchDoctors();
        setDoctors(data);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell locale={locale}>
      <div className="space-y-6">
        <PageHeader title={dict.doctors.title} subtitle={dict.doctors.subtitle} />

        {/* Doctors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoading ? (
            <div className="col-span-2 py-12 text-center text-xs text-secondary">
              {locale === "ar" ? "جاري تحميل قائمة الأطباء..." : "Loading doctor roster..."}
            </div>
          ) : doctors.length > 0 ? (
            doctors.map((doc) => (
              <div
                key={doc.id}
                className="glass-card rounded-2xl p-5 space-y-4 shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#dfbf70] to-[#99782a] text-sm font-bold text-on-gold">
                      {doc.name.replace("Dr. ", "").split(" ").map((n: string) => n[0]).join("")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-primary">{doc.name}</h3>
                        <span className="font-mono text-[10px] text-gold bg-[#caa95a]/10 px-1.5 py-0.5 rounded">
                          {doc.code}
                        </span>
                      </div>
                      <p className="text-xs text-gold font-medium mt-0.5">{doc.specialization}</p>
                      <p className="font-mono text-xs text-secondary mt-0.5">{doc.phone}</p>
                    </div>
                  </div>

                  <Badge variant="green" size="sm">
                    {doc.status}
                  </Badge>
                </div>

                {/* Productivity KPIs */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t glass-divider/60">
                  <div className="glass rounded-xl p-3 text-center">
                    <span className="text-[11px] text-secondary block">{dict.doctors.activePatients}</span>
                    <span className="text-base font-bold text-primary mt-0.5 block">{doc.activePatients}</span>
                  </div>
                  <div className="glass rounded-xl p-3 text-center">
                    <span className="text-[11px] text-secondary block">{dict.doctors.monthlyVisits}</span>
                    <span className="text-base font-bold text-gold mt-0.5 block">{doc.completedVisitsThisMonth}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <Link
                    href={`/${locale}/calendar`}
                    className="text-xs font-semibold text-gold hover:underline"
                  >
                    {locale === "ar" ? "عرض الجدول الميداني" : "View Schedule"} →
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2">
              <EmptyState
                title={locale === "ar" ? "لا يوجد أطباء مسجلون" : "No specialists registered yet"}
                description={locale === "ar" ? "سيظهر فريق الأطباء هنا بعد إضافة السجلات." : "Doctor roster entries will appear here once staff records are added."}
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
