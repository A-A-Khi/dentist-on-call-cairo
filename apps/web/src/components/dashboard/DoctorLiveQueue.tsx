"use client";

import React, { useEffect, useState } from "react";
import { ButtonLink } from "../ui/Button";
import { SkeletonCard, SkeletonMetricHero, SkeletonTable } from "../ui/Skeleton";
import { fetchDashboardOverview } from "../../lib/clinical-api";
import type { Appointment, DashboardOverview } from "../../lib/clinical-data";

interface DoctorLiveQueueProps {
  locale: string;
}

function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG").format(value);
}

function statusTone(status: string): string {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "text-emerald-700 border-emerald-200 bg-emerald-50";
  if (s === "CONFIRMED" || s === "IN_PROGRESS") {
    return "text-[var(--gold-light)] border-[var(--border-gold)] bg-[#caa95a]/10";
  }
  return "text-amber-800 border-amber-200 bg-amber-50";
}

export function DoctorLiveQueue({ locale }: DoctorLiveQueueProps) {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        setOverview(await fetchDashboardOverview());
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const isAr = locale === "ar";
  const todayLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());

  const appointments: Appointment[] = overview?.todayQueue ?? [];
  const queueCount = overview?.counts.todayQueue ?? appointments.length;
  const patientsInCare = overview?.counts.patientsInCare ?? 0;

  if (isLoading) {
    return (
      <>
        <SkeletonMetricHero />
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </section>
        <SkeletonTable rows={4} />
      </>
    );
  }

  return (
    <>
      <section className="glass-card-gold rounded-2xl p-6 sm:p-8 animate-fade-in-up">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          {isAr ? "طابور اليوم" : "Today's queue"}
          <span className="mx-2 text-slate-300">·</span>
          <span className="normal-case tracking-normal">{todayLabel}</span>
        </p>
        <p className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight text-primary tabular-nums leading-none">
          {formatCount(queueCount, locale)}
          <span className="ms-2 text-base sm:text-lg font-medium text-secondary">
            {isAr ? "مرضى" : "patients"}
          </span>
        </p>
        <p className="mt-2 text-xs text-secondary">
          {queueCount > 0
            ? isAr
              ? "بانتظار كرسي العلاج"
              : "Queued for the clinical chair"
            : isAr
              ? "لا توجد مواعيد بالانتظار"
              : "No appointments queued"}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="glass-card rounded-xl px-4 py-3.5 animate-fade-in-up stagger-1">
          <p className="text-[11px] text-muted">
            {isAr ? "مرضاي في نطاق الرعاية" : "Patients in care scope"}
          </p>
          <p className="mt-1 text-xl font-semibold text-primary tabular-nums leading-none">
            {formatCount(patientsInCare, locale)}
          </p>
          <p className="mt-1.5 text-[11px] text-secondary">
            {isAr ? "تعيين نشط أو جدول حالي" : "Active assignment or schedule"}
          </p>
        </div>
        <div className="glass-card rounded-xl px-4 py-3.5 animate-fade-in-up stagger-2">
          <p className="text-[11px] text-muted">{isAr ? "الجاهزية" : "Availability"}</p>
          <p className="mt-1 text-xl font-semibold text-primary leading-none">
            {isAr ? "تحت الطلب" : "On call"}
          </p>
          <p className="mt-1.5 text-[11px] text-secondary">
            {isAr ? "طوارئ القاهرة نشطة" : "Cairo emergency active"}
          </p>
        </div>
      </section>

      <section className="glass-card rounded-2xl overflow-hidden animate-fade-in-up stagger-3">
        <div className="border-b border-[var(--border-subtle)] px-5 py-3.5">
          <h3 className="text-sm font-semibold text-primary">
            {isAr ? "طابور المرضى لليوم" : "Clinical patient queue"}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted">
            {isAr
              ? "تنبيهات سريرية وتسجيل زيارة فوري"
              : "Medical alerts and visit launcher"}
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {appointments.length > 0 ? (
            appointments.map((apt) => (
              <div key={apt.id} className="px-5 py-4 transition-colors hover:bg-slate-50/60">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[var(--gold-primary)] tabular-nums">
                        {apt.time}
                      </span>
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium ${statusTone(apt.status)}`}
                      >
                        {apt.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-primary">
                      {apt.patientName}{" "}
                      <span className="font-mono text-[11px] font-normal text-muted">
                        ({apt.patientCode})
                      </span>
                    </p>
                    <p className="text-xs text-secondary">
                      {apt.procedure}
                      {apt.location ? ` · ${apt.location}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <ButtonLink
                      href={`/${locale}/patients/${apt.patientCode}`}
                      variant="secondary"
                      size="xs"
                    >
                      {isAr ? "الملف" : "Chart"}
                    </ButtonLink>
                    {apt.status.toUpperCase() !== "COMPLETED" &&
                    apt.status.toUpperCase() !== "CANCELLED" &&
                    apt.status.toUpperCase() !== "NO_SHOW" ? (
                      <ButtonLink
                        href={`/${locale}/patients/${apt.patientCode}/visit/new?appointmentId=${encodeURIComponent(apt.id)}&chiefComplaint=${encodeURIComponent(apt.chiefComplaint || apt.procedure || "")}&returnTo=calendar`}
                        variant="primary"
                        size="xs"
                      >
                        {isAr ? "بدء الزيارة" : "Start visit"}
                      </ButtonLink>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-xs text-muted">
              {isAr ? "لا يوجد مرضى معينون في طابورك لليوم." : "No patients assigned to your queue today."}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
