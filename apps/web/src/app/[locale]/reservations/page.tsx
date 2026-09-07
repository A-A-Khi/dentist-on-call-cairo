"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { fetchAppointments } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { Appointment } from "../../../lib/clinical-data";

export default function ReservationsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  const [reservations, setReservations] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchAppointments();
        setReservations(data);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filtered = reservations.filter((r) => {
    if (statusFilter !== "ALL" && r.status.toUpperCase() !== statusFilter.toUpperCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.patientName.toLowerCase().includes(q) ||
        r.patientCode.toLowerCase().includes(q) ||
        r.procedure.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AppShell locale={locale}>
      <div className="space-y-6">
        <PageHeader
          title={dict.reservations.title}
          subtitle={dict.reservations.subtitle}
          actions={
            <Link
              href={`/${locale}/calendar`}
              className="inline-flex items-center gap-1.5 glass rounded-xl px-3.5 py-2 text-xs font-medium text-primary glass-hover transition-colors"
            >
              <svg className="h-4 w-4 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{dict.dashboard.quickActions.viewCalendar}</span>
            </Link>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-3 glass-card rounded-2xl p-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={locale === "ar" ? "البحث بالاسم، كود المريض، أو الإجراء..." : "Search reservations by patient, code, or procedure..."}
            className="w-full sm:flex-1 glass rounded-xl px-3.5 py-2 text-xs text-primary placeholder:text-muted focus:border-[#caa95a] focus:outline-none"
          />

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none w-full sm:w-auto"
            >
              <option value="ALL">{dict.reservations.filterStatus}: {locale === "ar" ? "الكل" : "All"}</option>
              <option value="CONFIRMED">{locale === "ar" ? "مؤكد" : "Confirmed"}</option>
              <option value="PENDING">{locale === "ar" ? "قيد الانتظار" : "Pending"}</option>
              <option value="COMPLETED">{locale === "ar" ? "مكتمل" : "Completed"}</option>
              <option value="CANCELLED">{locale === "ar" ? "ملغي" : "Cancelled"}</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-secondary">
            {locale === "ar" ? "جاري تحميل الحجوزات..." : "Loading reservations..."}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={dict.reservations.emptyTitle}
            description={dict.reservations.emptyDescription}
            actionLabel={dict.dashboard.quickActions.viewCalendar}
            actionHref={`/${locale}/calendar`}
          />
        ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left rtl:text-right text-xs">
              <thead className="glass-table-header text-secondary">
                <tr>
                  <th className="px-4 py-3.5 font-medium">{locale === "ar" ? "كود الحجز" : "Booking ID"}</th>
                  <th className="px-4 py-3.5 font-medium">{locale === "ar" ? "المريض" : "Patient"}</th>
                  <th className="px-4 py-3.5 font-medium">{locale === "ar" ? "التاريخ والوقت" : "Date & Time"}</th>
                  <th className="px-4 py-3.5 font-medium">{locale === "ar" ? "الأخصائي" : "Specialist"}</th>
                  <th className="px-4 py-3.5 font-medium">{locale === "ar" ? "الإجراء" : "Procedure"}</th>
                  <th className="px-4 py-3.5 font-medium">{locale === "ar" ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-3.5 font-medium text-end">{locale === "ar" ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-primary">
                {filtered.map((r) => (
                    <tr key={r.id} className="glass-hover transition-colors">
                      <td className="px-4 py-3.5 font-mono text-gold font-medium">{r.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/${locale}/patients/${r.patientCode}`}
                          className="font-semibold text-primary hover:text-gold"
                        >
                          {r.patientName}
                        </Link>
                        <div className="font-mono text-[10px] text-muted">{r.patientCode} • {r.patientPhone}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-primary">{r.date}</div>
                        <div className="font-mono text-[10px] text-secondary">{r.time} ({r.durationMinutes}m)</div>
                      </td>
                      <td className="px-4 py-3.5 text-primary">{r.doctorName}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-primary">{r.procedure}</div>
                        {r.chiefComplaint && r.chiefComplaint !== r.procedure && (
                          <div className="text-[10px] text-gold italic mt-0.5 max-w-xs truncate">
                            &ldquo;{r.chiefComplaint}&rdquo;
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant={r.status.toUpperCase() === "CONFIRMED" ? "green" : "gold"}
                          size="sm"
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/${locale}/patients/${r.patientCode}/visit/new?chiefComplaint=${encodeURIComponent(r.chiefComplaint || r.procedure)}`}
                            className="rounded-lg bg-[#caa95a]/15 border border-[#caa95a]/30 px-2.5 py-1 text-[11px] font-medium text-gold hover:bg-[#caa95a]/25"
                          >
                            {locale === "ar" ? "تسجيل زيارة" : "Record Visit"}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Card View */}
          <div className="md:hidden divide-y divide-slate-200 p-3 space-y-3">
              {filtered.map((r) => (
                <div key={r.id} className="pt-3 first:pt-0 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-[10px] text-gold block">{r.id.slice(0, 8).toUpperCase()}</span>
                      <Link
                        href={`/${locale}/patients/${r.patientCode}`}
                        className="font-bold text-sm text-primary hover:text-gold"
                      >
                        {r.patientName}
                      </Link>
                      <span className="font-mono text-[10px] text-muted block">{r.patientCode}</span>
                    </div>

                    <Badge
                      variant={r.status.toUpperCase() === "CONFIRMED" ? "green" : "gold"}
                      size="sm"
                    >
                      {r.status}
                    </Badge>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-xs text-[#cbd5e1]">
                      <strong className="text-gold font-medium">{r.procedure}</strong>
                    </p>
                    {r.chiefComplaint && r.chiefComplaint !== r.procedure && (
                      <p className="text-[11px] text-secondary italic">&ldquo;{r.chiefComplaint}&rdquo;</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-secondary pt-1">
                    <span>{r.date} • {r.time}</span>
                    <span className="text-primary font-medium">{r.doctorName}</span>
                  </div>

                  <div className="pt-1 flex justify-end">
                    <Link
                      href={`/${locale}/patients/${r.patientCode}/visit/new?chiefComplaint=${encodeURIComponent(r.chiefComplaint || r.procedure)}`}
                      className="w-full text-center rounded-xl bg-[#caa95a]/15 border border-[#caa95a]/30 py-2 text-xs font-semibold text-gold hover:bg-[#caa95a]/25"
                    >
                      {locale === "ar" ? "تسجيل زيارة" : "Record Visit"}
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        </div>
        )}
      </div>
    </AppShell>
  );
}
