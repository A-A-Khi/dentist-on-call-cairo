"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { fetchAppointments, fetchPatients } from "../../lib/clinical-api";
import type { Appointment, Patient } from "../../lib/clinical-data";

interface DoctorLiveQueueProps {
  locale: string;
}

export function DoctorLiveQueue({ locale }: DoctorLiveQueueProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  useEffect(() => {
    async function load() {
      const [apts, pts] = await Promise.all([fetchAppointments(), fetchPatients()]);
      setAppointments(apts);
      setPatients(pts);
    }
    load();
  }, []);

  const isAr = locale === "ar";

  const doctorStats = [
    {
      label: isAr ? "مرضاي المجدولون لليوم" : "My Scheduled Patients Today",
      value: `${appointments.length} ${isAr ? "مرضى" : "Patients"}`,
      highlight: appointments.length > 0
        ? (isAr ? "بانتظار كرسي العلاج" : "Queued for clinical chair")
        : (isAr ? "لا توجد مواعيد بالانتظار" : "No appointments queued"),
    },
    {
      label: isAr ? "حالات علاجية نشطة" : "Active Ongoing Treatments",
      value: `${patients.length} ${isAr ? "حالات" : "Cases"}`,
      highlight: patients.length > 0
        ? (isAr ? "قيد المتابعة السريرية" : "Under clinical care")
        : (isAr ? "جاهز للاستقبال" : "Ready for intake"),
    },
    {
      label: isAr ? "جاهزية الطبيب" : "Specialist Availability",
      value: isAr ? "تحت الطلب" : "On Call",
      highlight: isAr ? "طوارئ القاهرة نشطة" : "Cairo Emergency Active",
    },
  ];

  return (
    <>
      {/* KPI Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {doctorStats.map((stat, idx) => (
          <Card key={idx} variant="elevated" className="p-5">
            <p className="text-xs font-medium text-secondary">{stat.label}</p>
            <div className="mt-2 text-2xl font-bold text-primary">{stat.value}</div>
            <p className="mt-1 text-[11px] text-gold">{stat.highlight}</p>
          </Card>
        ))}
      </div>

      {/* Assigned Patients Timeline / Clinical Queue */}
      <Card variant="gold-bordered">
        <CardHeader>
          <div>
            <CardTitle>
              {isAr ? "طابور المرضى الإكلينيكي لليوم" : "Today's Clinical Patient Queue"}
            </CardTitle>
            <p className="text-xs text-muted mt-0.5">
              {isAr
                ? "وصول طبي مصرح مع التنبيهات السريرية وتسجيل الزيارات الفوري"
                : "Care-scoped patient access with medical alerts and visit launcher"}
            </p>
          </div>
        </CardHeader>

        <div className="space-y-4">
          {appointments.length > 0 ? (
            appointments.map((apt, idx) => (
              <div
                key={idx}
                className="glass rounded-xl p-4 transition-all hover:border-[#caa95a]/40"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#caa95a]/10 text-xs font-bold text-gold border border-[#caa95a]/20">
                      {apt.time.split(" ")[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-primary">{apt.patientName}</span>
                        <span className="text-xs text-muted">({apt.patientCode})</span>
                        <Badge
                          variant={
                            apt.status.toUpperCase() === "COMPLETED"
                              ? "emerald"
                              : apt.status.toUpperCase() === "IN_PROGRESS"
                              ? "blue"
                              : "amber"
                          }
                          size="sm"
                        >
                          {apt.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-gold font-medium mt-1">
                        {isAr ? "الإجراء الطبي" : "Procedure"}: <span className="text-primary">{apt.procedure}</span>
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {isAr ? "الموقع" : "Location"}: {apt.location}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 glass-divider">
                    <Link href={`/${locale}/patients/${apt.patientCode}`} className="flex-1 sm:flex-none">
                      <Button variant="secondary" size="sm" className="w-full sm:w-auto">
                        {isAr ? "الملف" : "Chart"}
                      </Button>
                    </Link>
                    <Link href={`/${locale}/patients/${apt.patientCode}/visit/new`} className="flex-1 sm:flex-none">
                      <Button variant="primary" size="sm" className="w-full sm:w-auto">
                        {isAr ? "تسجيل زيارة" : "Record Visit"}
                      </Button>
                    </Link>
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
      </Card>
    </>
  );
}
