"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Dictionary } from "../../i18n/get-dictionary";
import { ButtonLink } from "../ui/Button";
import { SkeletonCard, SkeletonMetricHero, SkeletonTable } from "../ui/Skeleton";
import { fetchDashboardOverview } from "../../lib/clinical-api";
import type { Appointment, DashboardOverview } from "../../lib/clinical-data";

interface AdminLiveMetricsProps {
  locale: string;
  dict: Dictionary;
}

function formatEGP(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG").format(value);
}

function monthToDateLabel(locale: string, from?: string, to?: string) {
  const end = to ? new Date(`${to}T12:00:00`) : new Date();
  const start = from ? new Date(`${from}T12:00:00`) : new Date(end.getFullYear(), end.getMonth(), 1);
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  if (values.length < 2) {
    return (
      <svg viewBox="0 0 120 32" className={className} aria-hidden>
        <line x1="0" y1="28" x2="120" y2="28" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const pad = 2;
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

function statusTone(status: string): string {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "text-emerald-700 border-emerald-200 bg-emerald-50";
  if (s === "CONFIRMED") return "text-[var(--gold-light)] border-[var(--border-gold)] bg-[#caa95a]/10";
  return "text-amber-800 border-amber-200 bg-amber-50";
}

export function AdminLiveMetrics({ locale, dict }: AdminLiveMetricsProps) {
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
  const clinicProfit = overview?.month?.netClinicProfitEGP ?? overview?.month?.clinicShareEGP ?? 0;
  const grossCollected = overview?.month?.grossCollectedEGP ?? 0;
  const periodRange = monthToDateLabel(locale, overview?.month?.from, overview?.month?.to);

  const sparkValues = useMemo(() => {
    const days = overview?.month?.byDay ?? [];
    if (days.length === 0) return [];
    return days.map((d) => d.clinicShareEGP ?? d.paidEGP ?? 0);
  }, [overview]);

  const todayAppointments: Appointment[] = overview?.todaySchedule ?? [];
  const recentPatients = overview?.recentPatients ?? [];

  const secondary = [
    {
      label: dict.dashboard.stats.totalPatients,
      value: formatCount(overview?.counts.patients ?? 0, locale),
      meta: isAr ? "ملفات مسجلة" : "Registered files",
    },
    {
      label: dict.dashboard.stats.todayVisits,
      value: formatCount(overview?.counts.todayAppointments ?? 0, locale),
      meta: isAr ? "مواعيد اليوم" : "On today's board",
    },
    {
      label: dict.dashboard.stats.activeDoctors,
      value: formatCount(overview?.counts.doctors ?? 0, locale),
      meta: isAr ? "في الوردية الحالية" : "On current roster",
    },
  ];

  const quickActions = [
    {
      title: dict.dashboard.quickActions.newPatient,
      href: `/${locale}/patients/new`,
      hint: isAr ? "ملف سريري جديد" : "New clinical file",
    },
    {
      title: dict.dashboard.quickActions.newAppointment,
      href: `/${locale}/calendar`,
      hint: isAr ? "حجز على التقويم" : "Book on calendar",
    },
  ];

  if (isLoading) {
    return (
      <>
        <SkeletonMetricHero />
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </section>
        <SkeletonTable rows={4} />
      </>
    );
  }

  return (
    <>
      {/* Primary metric */}
      <section className="glass-card-gold rounded-2xl p-6 sm:p-8 animate-fade-in-up">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              {dict.dashboard.stats.monthlyRevenue}
              <span className="mx-2 text-slate-300">·</span>
              <span className="normal-case tracking-normal">{periodRange}</span>
            </p>
            <p className="text-4xl sm:text-5xl font-semibold tracking-tight text-primary tabular-nums leading-none">
              {formatEGP(clinicProfit, locale)}
              <span className="ms-2 text-base sm:text-lg font-medium text-secondary">
                {isAr ? "ج.م" : "EGP"}
              </span>
            </p>
            <p className="text-xs text-secondary">
              {isAr
                ? `صافي العيادة · ${formatEGP(grossCollected, locale)} ج.م مقبوضات منذ بداية الشهر`
                : `Clinic net · ${formatEGP(grossCollected, locale)} EGP collected month to date`}
            </p>
          </div>
          <div className="w-full max-w-[11rem] text-[var(--gold-primary)] shrink-0">
            <Sparkline values={sparkValues} className="h-10 w-full" />
            <p className="mt-1 text-[10px] text-muted">
              {isAr ? "حصة العيادة يومياً · الشهر الحالي" : "Daily clinic share · this month"}
            </p>
          </div>
        </div>
      </section>

      {/* Secondary metrics */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {secondary.map((stat, i) => (
          <div
            key={stat.label}
            className={`glass-card rounded-xl px-4 py-3.5 animate-fade-in-up stagger-${i + 1}`}
          >
            <p className="text-[11px] text-muted">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold text-primary tabular-nums leading-none">
              {stat.value}
            </p>
            <p className="mt-1.5 text-[11px] text-secondary">{stat.meta}</p>
          </div>
        ))}
      </section>

      {/* Quick actions — flat accent, no icon tiles */}
      <section className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3 animate-fade-in-up stagger-2">
        {quickActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex flex-1 items-center justify-between gap-3 rounded-xl glass px-4 py-3.5 transition-all hover:border-[#caa95a]/40 hover:shadow-md hover:shadow-[#caa95a]/10"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary">{action.title}</p>
              <p className="text-[11px] text-muted">{action.hint}</p>
            </div>
            <span className="shrink-0 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#a8842d] px-3 py-1.5 text-[11px] font-semibold text-on-gold shadow-sm shadow-[#caa95a]/20 transition-transform group-hover:scale-[1.03]">
              {isAr ? "فتح" : "Open"}
            </span>
          </Link>
        ))}
      </section>

      {/* Schedule + activity */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 animate-fade-in-up stagger-3">
        <div className="lg:col-span-2 glass-card rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5">
            <h3 className="text-sm font-semibold text-primary">{dict.dashboard.todaySchedule.title}</h3>
            <ButtonLink href={`/${locale}/calendar`} variant="accent" size="xs">
              {dict.dashboard.quickActions.viewCalendar}
            </ButtonLink>
          </div>

          <div className="hidden sm:block overflow-x-auto px-5 py-2">
            <table className="w-full text-left rtl:text-right text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-muted">
                  <th className="py-2.5 font-medium">{dict.dashboard.todaySchedule.time}</th>
                  <th className="py-2.5 font-medium">{dict.dashboard.todaySchedule.patient}</th>
                  <th className="py-2.5 font-medium">{dict.dashboard.todaySchedule.doctor}</th>
                  <th className="py-2.5 font-medium">{dict.dashboard.todaySchedule.procedure}</th>
                  <th className="py-2.5 font-medium">{dict.dashboard.todaySchedule.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todayAppointments.length > 0 ? (
                  todayAppointments.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="py-3 font-medium text-[var(--gold-primary)] tabular-nums">
                        {row.time}
                      </td>
                      <td className="py-3">
                        <div className="font-semibold text-primary">{row.patientName}</div>
                        <div className="font-mono text-[10px] text-muted">{row.patientCode}</div>
                      </td>
                      <td className="py-3 text-secondary">{row.doctorName}</td>
                      <td className="py-3 text-primary">{row.procedure}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium ${statusTone(row.status)}`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-muted">
                      {isAr ? "لا توجد مواعيد مجدولة لليوم." : "No appointments scheduled for today."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden divide-y divide-slate-100 px-4 py-2">
            {todayAppointments.length > 0 ? (
              todayAppointments.map((row) => (
                <div key={row.id} className="py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-[var(--gold-primary)] tabular-nums">
                      {row.time}
                    </span>
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium ${statusTone(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-primary">{row.patientName}</span>
                    <span className="font-mono text-[10px] text-muted">
                      {row.patientCode} · {row.doctorName}
                    </span>
                  </div>
                  <p className="text-xs text-secondary">{row.procedure}</p>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-muted">
                {isAr ? "لا توجد مواعيد مجدولة لليوم." : "No appointments scheduled for today."}
              </div>
            )}
          </div>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="border-b border-[var(--border-subtle)] px-5 py-3.5">
            <h3 className="text-sm font-semibold text-primary">{dict.dashboard.activityLog.title}</h3>
          </div>
          <div className="space-y-0 divide-y divide-slate-100 px-5">
            {recentPatients.length > 0 ? (
              recentPatients.map((p) => (
                <div key={p.id} className="py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                      {isAr ? "ملف مريض" : "Patient file"}
                    </span>
                    <span className="text-[10px] text-muted tabular-nums">{p.lastVisit}</span>
                  </div>
                  <p className="text-primary leading-relaxed">
                    {isAr ? "تسجيل " : "Registered "}
                    <span className="font-semibold text-[var(--gold-primary)]">{p.fullName}</span>
                    <span className="font-mono text-muted"> ({p.code})</span>
                  </p>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-xs text-muted">
                {isAr ? "لا يوجد نشاط مسجل بعد." : "No audit activity logged yet."}
              </div>
            )}
          </div>
          <div className="border-t border-[var(--border-subtle)] px-5 py-3 text-center">
            <ButtonLink href={`/${locale}/activity`} variant="accent" size="xs">
              {dict.dashboard.activityLog.viewAll}
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
