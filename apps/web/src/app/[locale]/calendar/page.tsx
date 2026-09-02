"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { Badge } from "../../../components/ui/Badge";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { INITIAL_DOCTORS } from "../../../lib/clinical-data";
import { fetchAppointments, fetchPatients, scheduleAppointment } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { Appointment, Patient } from "../../../lib/clinical-data";

export default function CalendarPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  const [currentView, setCurrentView] = useState<"Day" | "Week" | "Month" | "Agenda">("Day");
  const [selectedDoctor, setSelectedDoctor] = useState("ALL");
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  useEffect(() => {
    async function loadData() {
      const [apts, pts] = await Promise.all([fetchAppointments(), fetchPatients()]);
      setAppointments(apts);
      setPatients(pts);
    }
    loadData();
  }, []);

  const filteredAppointments = selectedDoctor === "ALL"
    ? appointments
    : appointments.filter((a) => a.doctorName.includes(selectedDoctor));

  const timeSlots = [
    "09:00 AM",
    "10:00 AM",
    "11:00 AM",
    "12:00 PM",
    "01:00 PM",
    "02:00 PM",
    "03:00 PM",
    "04:00 PM",
    "05:00 PM",
  ];

  return (
    <AppShell locale={locale} role="ADMIN">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#f8fafc] sm:text-2xl">
              {dict.calendar.title}
            </h1>
            <p className="mt-1 text-xs text-[#94a3b8]">
              {dict.calendar.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsBookingOpen(true)}
            >
              {dict.calendar.bookAppointment}
            </Button>
          </div>
        </div>

        {/* Calendar Controls Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 glass-card rounded-2xl p-3">
          {/* Date Navigator */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="font-bold text-xs text-[#f8fafc] px-2">
              {locale === "ar" ? "جدول العمليات والعيادة السنية" : "Clinical Practice Schedule"}
            </span>
          </div>

          {/* Filters & View Selectors */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              className="glass rounded-xl px-3 py-1.5 text-xs text-[#f8fafc] focus:border-[#caa95a] focus:outline-none"
            >
              <option value="ALL">{dict.calendar.filterDoctor}: {locale === "ar" ? "الكل" : "All"}</option>
              {INITIAL_DOCTORS.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>

            {/* View mode toggle */}
            <div className="flex items-center glass rounded-xl p-1 text-xs overflow-x-auto max-w-full">
              {(["Day", "Week", "Month", "Agenda"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setCurrentView(view)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    currentView === view
                      ? "bg-[#caa95a] text-[#0a0d14] font-semibold"
                      : "text-[#94a3b8] hover:text-[#f8fafc]"
                  }`}
                >
                  {view === "Day" ? dict.calendar.views.day : view === "Week" ? dict.calendar.views.week : view === "Month" ? dict.calendar.views.month : dict.calendar.views.agenda}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar Day Slots View */}
        <div className="glass-card rounded-2xl overflow-hidden shadow-xl">
          <div className="flex items-center justify-between p-4 border-b glass-divider/60">
            <span className="text-xs font-semibold text-[#caa95a]">
              {locale === "ar" ? "الجدول الزمني لليوم" : "Daily Operatory Timeline"}
            </span>
            <span className="text-xs text-[#94a3b8]">
              {filteredAppointments.length} {locale === "ar" ? "مواعيد مجدولة" : "Appointments"}
            </span>
          </div>

          <div className="space-y-3">
            {timeSlots.map((slot) => {
              const matchedAppt = filteredAppointments.find((a) => a.time === slot);

              return (
                <div
                  key={slot}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 py-2 border-b glass-divider/30 last:border-0"
                >
                  <div className="w-20 shrink-0 font-mono text-xs font-bold text-[#94a3b8]">
                    {slot}
                  </div>

                  {matchedAppt ? (
                    <div className="flex-1 glass-active rounded-xl p-3 shadow-md">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-[#f8fafc]">
                              {matchedAppt.patientName}
                            </span>
                            <span className="font-mono text-[10px] text-[#caa95a]">
                              {matchedAppt.patientCode}
                            </span>
                            <Badge variant="green" size="sm">
                              {matchedAppt.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-[#cbd5e1] mt-1 font-medium">
                            {matchedAppt.procedure}
                          </p>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">
                            {matchedAppt.doctorName} • {matchedAppt.location}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/${locale}/patients/${matchedAppt.patientCode}`}
                            className="rounded-lg glass px-2.5 py-1 text-[11px] text-[#94a3b8] hover:text-[#f8fafc]"
                          >
                            {dict.patients.table.viewChart}
                          </Link>
                          <Link
                            href={`/${locale}/patients/${matchedAppt.patientCode}/visit/new`}
                            className="rounded-lg bg-[#caa95a]/15 border border-[#caa95a]/30 px-2.5 py-1 text-[11px] font-medium text-[#caa95a] hover:bg-[#caa95a]/25"
                          >
                            {dict.patients.table.recordVisit}
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="glass flex-1 rounded-xl border-dashed p-2.5 text-xs text-[#64748b]">
                      {locale === "ar" ? "الوقت متاح للحجز" : "Chair available for booking"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Book Appointment Modal */}
      <Modal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        title={dict.calendar.bookAppointment}
        description={locale === "ar" ? "تحديد وقت الكرسي والأخصائي والإجراء المطلوب" : "Assign specialist chair time and procedure"}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const patientCode = (formData.get("patientCode") as string) || "";
            const doctorName = (formData.get("doctorName") as string) || "Dr. Tarek Omar";
            const date = (formData.get("date") as string) || new Date().toISOString().split("T")[0];
            const time = (formData.get("time") as string) || "10:00 AM";
            const room = (formData.get("room") as string) || "Room 1";
            const procedure = (formData.get("procedure") as string) || "Consultation & Exam";
            const chiefComplaint = (formData.get("chiefComplaint") as string) || procedure;

            if (patientCode) {
              await scheduleAppointment({
                patientIdOrCode: patientCode,
                doctorName,
                date,
                time,
                procedure,
                chiefComplaint,
                location: room,
              });
              const updated = await fetchAppointments();
              setAppointments(updated);
            }
            setIsBookingOpen(false);
          }}
          className="space-y-4 text-xs"
        >
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1">
              {locale === "ar" ? "اختيار المريض" : "Select Patient"}
            </label>
            <select name="patientCode" required className="w-full glass rounded-xl px-3.5 py-2 text-xs text-[#f8fafc] focus:border-[#caa95a] focus:outline-none">
              {patients.length > 0 ? (
                patients.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.fullName} ({p.code})
                  </option>
                ))
              ) : (
                <option value="">{locale === "ar" ? "لا يوجد مرضى مسجلون" : "No patients registered yet"}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1">
              {dict.calendar.filterDoctor}
            </label>
            <select name="doctorName" className="w-full glass rounded-xl px-3.5 py-2 text-xs text-[#f8fafc] focus:border-[#caa95a] focus:outline-none">
              {INITIAL_DOCTORS.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name} ({d.specialization})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input name="date" label={locale === "ar" ? "تاريخ الموعد" : "Appointment Date"} type="date" required defaultValue={new Date().toISOString().split("T")[0]} />
            <Input name="time" label={locale === "ar" ? "الوقت" : "Start Time"} type="text" placeholder="10:00 AM" required defaultValue="10:00 AM" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1">
                {locale === "ar" ? "المدة المتوقعة" : "Duration"}
              </label>
              <select name="duration" className="w-full glass rounded-xl px-3.5 py-2 text-xs text-[#f8fafc] focus:border-[#caa95a] focus:outline-none">
                <option value="30">30 {locale === "ar" ? "دقيقة" : "Minutes"}</option>
                <option value="45">45 {locale === "ar" ? "دقيقة" : "Minutes"}</option>
                <option value="60">60 {locale === "ar" ? "دقيقة" : "Minutes"}</option>
                <option value="90">90 {locale === "ar" ? "دقيقة" : "Minutes"}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1">
                {locale === "ar" ? "الغرفة / الكرسي" : "Clinic Room"}
              </label>
              <select name="room" className="w-full glass rounded-xl px-3.5 py-2 text-xs text-[#f8fafc] focus:border-[#caa95a] focus:outline-none">
                <option>{locale === "ar" ? "عيادة ١ — الكرسي الرئيسي" : "Room 1 — Main Operatory"}</option>
                <option>{locale === "ar" ? "عيادة ٢ — جناح علاج الجذور" : "Room 2 — Periodontal Suite"}</option>
                <option>{locale === "ar" ? "عيادة ٣ — جراحة الفم والأسنان" : "Room 3 — Surgical Suite"}</option>
              </select>
            </div>
          </div>

          <Input
            name="chiefComplaint"
            label={locale === "ar" ? "الشكوى الرئيسية للمريض عند الحجز" : "Patient Chief Complaint at Booking"}
            placeholder={locale === "ar" ? "ألم حاد في الضرس السفلي، كسر في الحشوة..." : "e.g. Severe throbbing pain lower molar, chipped veneer..."}
            required
          />

          <Input
            name="procedure"
            label={locale === "ar" ? "الإجراء الطبي المتوقع" : "Expected Clinical Procedure"}
            placeholder={locale === "ar" ? "مثل: كشف، حشو تجميلي، سحب عصب..." : "e.g. Consultation, Composite filling, Root Canal..."}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t glass-divider/60">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsBookingOpen(false)}
            >
              {dict.patientNew.cancelButton}
            </Button>
            <Button variant="primary" size="sm" type="submit">
              {locale === "ar" ? "تأكيد الحجز" : "Confirm Booking"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
