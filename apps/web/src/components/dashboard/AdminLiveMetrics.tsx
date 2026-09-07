"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "../ui/Card";
import { Badge } from "../ui/Badge";
import type { Dictionary } from "../../i18n/get-dictionary";
import { fetchAppointments, fetchFinancialTransactions, fetchPatients } from "../../lib/clinical-api";
import type { Appointment, FinancialTransaction, Patient } from "../../lib/clinical-data";

interface AdminLiveMetricsProps {
  locale: string;
  dict: Dictionary;
}

export function AdminLiveMetrics({ locale, dict }: AdminLiveMetricsProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);

  useEffect(() => {
    async function load() {
      const [pts, apts, txs] = await Promise.all([
        fetchPatients(),
        fetchAppointments(),
        fetchFinancialTransactions(),
      ]);
      setPatients(pts);
      setAppointments(apts);
      setTransactions(txs);
    }
    load();
  }, []);

  const totalRevenue = transactions
    .filter((t) => t.type === "REVENUE")
    .reduce((sum, t) => sum + t.amountEGP, 0);

  const isAr = locale === "ar";

  const stats = [
    {
      label: dict.dashboard.stats.totalPatients,
      value: String(patients.length),
      change: patients.length > 0
        ? (isAr ? `${patients.length} ملف مسجل` : `${patients.length} registered file(s)`)
        : (isAr ? "لا يوجد مرضى مسجلون حالياً" : "No patients registered yet"),
      icon: (
        <svg className="h-5 w-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: dict.dashboard.stats.todayVisits,
      value: String(appointments.length),
      change: appointments.length > 0
        ? (isAr ? `${appointments.length} جلسة نشطة` : `${appointments.length} active session(s)`)
        : (isAr ? "٠ قيد التنفيذ" : "0 in progress"),
      icon: (
        <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      label: dict.dashboard.stats.monthlyRevenue,
      value: `${totalRevenue.toLocaleString()} ${isAr ? "ج.م" : "EGP"}`,
      change: totalRevenue > 0
        ? (isAr ? "دفتر القيود محدث" : "Ledger updated")
        : (isAr ? "لا توجد معاملات مسجلة" : "No transactions posted"),
      icon: (
        <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: dict.dashboard.stats.activeDoctors,
      value: isAr ? "١ في الجدول" : "1 on roster",
      change: isAr ? "د. طارق عمر (جراحة الفم والأسنان)" : "Dr. Tarek Omar (Oral & Maxillofacial)",
      icon: (
        <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, idx) => (
          <Card key={idx} variant="elevated" className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-secondary">{stat.label}</span>
              <div className="glass rounded-xl p-2">
                {stat.icon}
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-primary">{stat.value}</div>
              <p className="mt-1 text-[11px] text-gold">{stat.change}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Main 2-column content area */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Schedule Table (2 columns) */}
        <div className="lg:col-span-2">
          <Card variant="default">
            <CardHeader>
              <CardTitle>{dict.dashboard.todaySchedule.title}</CardTitle>
              <Link
                href={`/${locale}/calendar`}
                className="text-xs text-gold hover:text-gold-hover transition-colors"
              >
                {dict.dashboard.quickActions.viewCalendar} →
              </Link>
            </CardHeader>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead>
                  <tr className="border-b glass-divider text-muted">
                    <th className="pb-3 font-medium">{dict.dashboard.todaySchedule.time}</th>
                    <th className="pb-3 font-medium">{dict.dashboard.todaySchedule.patient}</th>
                    <th className="pb-3 font-medium">{dict.dashboard.todaySchedule.doctor}</th>
                    <th className="pb-3 font-medium">{dict.dashboard.todaySchedule.procedure}</th>
                    <th className="pb-3 font-medium">{dict.dashboard.todaySchedule.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {appointments.length > 0 ? (
                    appointments.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="glass-hover transition-colors">
                        <td className="py-3.5 font-medium text-gold">{row.time}</td>
                        <td className="py-3.5">
                          <div className="font-semibold text-primary">{row.patientName}</div>
                          <div className="text-[10px] text-muted">{row.patientCode}</div>
                        </td>
                        <td className="py-3.5 text-secondary">{row.doctorName}</td>
                        <td className="py-3.5 text-primary">{row.procedure}</td>
                        <td className="py-3.5">
                          <Badge
                            variant={
                              row.status === "COMPLETED"
                                ? "emerald"
                                : row.status === "CONFIRMED"
                                ? "gold"
                                : "amber"
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-muted">
                        {isAr ? "لا توجد مواعيد مجدولة لليوم." : "No appointments scheduled for today."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Card View */}
            <div className="sm:hidden divide-y divide-slate-200 space-y-3">
              {appointments.length > 0 ? (
                appointments.slice(0, 5).map((row, idx) => (
                  <div key={idx} className="pt-3 first:pt-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-gold">{row.time}</span>
                      <Badge
                        variant={
                          row.status === "COMPLETED"
                            ? "emerald"
                            : row.status === "CONFIRMED"
                            ? "gold"
                            : "amber"
                        }
                        size="sm"
                      >
                        {row.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-semibold text-sm text-primary block">{row.patientName}</span>
                      <span className="font-mono text-[10px] text-muted">{row.patientCode} • {row.doctorName}</span>
                    </div>
                    <p className="text-xs text-[#cbd5e1] font-medium">{row.procedure}</p>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-muted">
                  {isAr ? "لا توجد مواعيد مجدولة لليوم." : "No appointments scheduled for today."}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Recent Activity (1 column) */}
        <div>
          <Card variant="default">
            <CardHeader>
              <CardTitle>{dict.dashboard.activityLog.title}</CardTitle>
            </CardHeader>

            <div className="space-y-4">
              {patients.length > 0 ? (
                patients.slice(0, 3).map((p, idx) => (
                  <div
                    key={idx}
                    className="glass-card rounded-xl p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="gold" size="sm">
                        PATIENT
                      </Badge>
                      <span className="text-[10px] text-muted">{p.lastVisit}</span>
                    </div>
                    <p className="text-primary leading-relaxed">
                      Registered patient file for <span className="font-bold text-gold">{p.fullName}</span> ({p.code})
                    </p>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-muted">
                  No audit activity logged yet.
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t glass-divider text-center">
              <Link
                href={`/${locale}/activity`}
                className="text-xs text-gold hover:underline"
              >
                {dict.dashboard.activityLog.viewAll}
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
