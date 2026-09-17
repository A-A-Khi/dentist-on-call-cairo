"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import { Modal } from "../../../components/ui/Modal";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { INITIAL_DOCTORS } from "../../../lib/clinical-data";
import { fetchAppointments, fetchPatients, scheduleAppointment, deleteAppointment, deletePatientRecord } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { Appointment, Patient } from "../../../lib/clinical-data";
import { getStoredSessionUser } from "../../../lib/session";

type CalendarView = "Day" | "Week" | "Month" | "Agenda";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar: three months back through three months ahead. */
function calendarWindow(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 4, 0);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function statusBadgeVariant(status: string): "gold" | "emerald" | "amber" | "rose" | "neutral" {
  switch (status) {
    case "COMPLETED":
      return "emerald";
    case "CONFIRMED":
      return "gold";
    case "CANCELLED":
    case "NO_SHOW":
      return "rose";
    case "PENDING":
      return "amber";
    default:
      return "neutral";
  }
}

function statusAccent(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "from-emerald-400 to-emerald-600";
    case "CONFIRMED":
      return "from-[#dfbf70] to-[#99782a]";
    case "CANCELLED":
    case "NO_SHOW":
      return "from-rose-400 to-rose-600";
    case "PENDING":
      return "from-amber-400 to-amber-600";
    default:
      return "from-slate-300 to-slate-500";
  }
}

function statusDot(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-500";
    case "CONFIRMED":
      return "bg-[#caa95a]";
    case "CANCELLED":
    case "NO_SHOW":
      return "bg-rose-500";
    case "PENDING":
      return "bg-amber-500";
    default:
      return "bg-slate-400";
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Parse display times like "10:30 AM", "9:00AM", or "21:15" into hour 0–23. */
function parseAppointmentHour(time: string): number | null {
  const raw = (time || "").trim();
  if (!raw) return null;
  const meridiem = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (meridiem) {
    let hours = Number(meridiem[1]);
    const meridian = meridiem[3].toUpperCase();
    if (meridian === "PM" && hours < 12) hours += 12;
    if (meridian === "AM" && hours === 12) hours = 0;
    return Number.isFinite(hours) ? hours : null;
  }
  const twentyFour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const hours = Number(twentyFour[1]);
    return hours >= 0 && hours <= 23 ? hours : null;
  }
  return null;
}

function hourToSlotLabel(hour: number): string {
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const meridian = hour < 12 ? "AM" : "PM";
  return `${String(hour12).padStart(2, "0")}:00 ${meridian}`;
}

function toDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun
  d.setDate(d.getDate() - day);
  d.setHours(12, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function canStartVisit(status: Appointment["status"]): boolean {
  return status === "PENDING" || status === "CONFIRMED";
}

function CalendarPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "en";
  const isAr = locale === "ar";
  const dict = getDictionarySync(locale);
  const dayScrollRef = useRef<HTMLDivElement>(null);

  const [currentView, setCurrentView] = useState<CalendarView>("Day");
  const [selectedDoctor, setSelectedDoctor] = useState("ALL");
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [prefillTime, setPrefillTime] = useState("10:00 AM");
  const [prefillPatientCode, setPrefillPatientCode] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showQuietHours, setShowQuietHours] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    | { type: "reservation"; appointment: Appointment }
    | { type: "patient"; appointment: Appointment }
    | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setIsAdmin((getStoredSessionUser()?.role ?? "DOCTOR") === "ADMIN");
  }, []);

  useEffect(() => {
    async function loadData() {
      const [apts, pts] = await Promise.all([
        fetchAppointments(undefined, calendarWindow()),
        fetchPatients(),
      ]);
      setAppointments(apts);
      setPatients(pts);
    }
    loadData();
  }, []);

  useEffect(() => {
    const bookPatient = searchParams?.get("bookPatient") || "";
    if (!bookPatient) return;
    setPrefillPatientCode(bookPatient);
    setIsBookingOpen(true);
  }, [searchParams]);

  const selected = useMemo(() => parseDateKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const doctorFiltered = useMemo(() => {
    return appointments.filter(
      (a) =>
        a.status !== "CANCELLED" &&
        (selectedDoctor === "ALL" || a.doctorName.includes(selectedDoctor)),
    );
  }, [appointments, selectedDoctor]);

  const dayAppointments = useMemo(() => {
    return doctorFiltered
      .filter((a) => !a.date || a.date === selectedDate)
      .sort((a, b) => (parseAppointmentHour(a.time) ?? 99) - (parseAppointmentHour(b.time) ?? 99));
  }, [doctorFiltered, selectedDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selected);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected]);

  const weekAppointmentsByDate = useMemo(() => {
    const keys = new Set(weekDays.map(toDateKey));
    const map = new Map<string, Appointment[]>();
    for (const key of keys) map.set(key, []);
    for (const appt of doctorFiltered) {
      if (!appt.date || !keys.has(appt.date)) continue;
      map.get(appt.date)!.push(appt);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (parseAppointmentHour(a.time) ?? 99) - (parseAppointmentHour(b.time) ?? 99));
    }
    return map;
  }, [doctorFiltered, weekDays]);

  const monthGrid = useMemo(() => {
    const monthStart = startOfMonth(selected);
    const gridStart = startOfWeek(monthStart);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [selected]);

  const monthAppointmentsByDate = useMemo(() => {
    const y = selected.getFullYear();
    const m = selected.getMonth();
    const map = new Map<string, Appointment[]>();
    for (const appt of doctorFiltered) {
      if (!appt.date) continue;
      const d = parseDateKey(appt.date);
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      const list = map.get(appt.date) ?? [];
      list.push(appt);
      map.set(appt.date, list);
    }
    return map;
  }, [doctorFiltered, selected]);

  const timeSlots = useMemo(() => Array.from({ length: 24 }, (_, hour) => hourToSlotLabel(hour)), []);

  const appointmentsByHour = useMemo(() => {
    const map = new Map<number, Appointment[]>();
    for (const appt of dayAppointments) {
      const hour = parseAppointmentHour(appt.time);
      if (hour === null) continue;
      const list = map.get(hour) ?? [];
      list.push(appt);
      map.set(hour, list);
    }
    return map;
  }, [dayAppointments]);

  const visibleHours = useMemo(() => {
    const booked = Array.from(appointmentsByHour.keys());
    if (showQuietHours || booked.length === 0) {
      return Array.from({ length: 24 }, (_, h) => h);
    }
    const min = Math.max(0, Math.min(...booked) - 1);
    const max = Math.min(23, Math.max(...booked) + 1);
    // Prefer clinic daytime band when bookings are sparse
    const start = Math.min(min, 8);
    const end = Math.max(max, 20);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [appointmentsByHour, showQuietHours]);

  const bookedCount = dayAppointments.length;
  const confirmedCount = dayAppointments.filter((a) => a.status === "CONFIRMED").length;
  const weekBookedCount = useMemo(
    () => Array.from(weekAppointmentsByDate.values()).reduce((n, list) => n + list.length, 0),
    [weekAppointmentsByDate],
  );
  const monthBookedCount = useMemo(
    () => Array.from(monthAppointmentsByDate.values()).reduce((n, list) => n + list.length, 0),
    [monthAppointmentsByDate],
  );

  const formattedDate = useMemo(() => {
    try {
      if (currentView === "Week") {
        const start = weekDays[0];
        const end = weekDays[6];
        const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        return `${start.toLocaleDateString(isAr ? "ar-EG" : "en-GB", opts)} – ${end.toLocaleDateString(
          isAr ? "ar-EG" : "en-GB",
          { ...opts, year: "numeric" },
        )}`;
      }
      if (currentView === "Month") {
        return selected.toLocaleDateString(isAr ? "ar-EG" : "en-GB", {
          month: "long",
          year: "numeric",
        });
      }
      return selected.toLocaleDateString(isAr ? "ar-EG" : "en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate, isAr, currentView, weekDays, selected]);

  useEffect(() => {
    if (currentView !== "Day" || !dayScrollRef.current) return;
    const firstBooked = Math.min(...Array.from(appointmentsByHour.keys()), 9);
    const el = dayScrollRef.current.querySelector(`[data-hour="${firstBooked}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentView, selectedDate, appointmentsByHour]);

  function shiftRange(delta: number) {
    const next = parseDateKey(selectedDate);
    if (currentView === "Week") next.setDate(next.getDate() + delta * 7);
    else if (currentView === "Month") next.setMonth(next.getMonth() + delta);
    else next.setDate(next.getDate() + delta);
    setSelectedDate(toDateKey(next));
  }

  function openBooking(time?: string, date?: string) {
    if (time) setPrefillTime(time);
    if (date) setSelectedDate(date);
    setIsBookingOpen(true);
  }

  function closeBooking() {
    setIsBookingOpen(false);
    setPrefillPatientCode("");
  }

  function visitStartHref(appt: Appointment) {
    const complaint = encodeURIComponent(appt.chiefComplaint || appt.procedure || "");
    return `/${locale}/patients/${appt.patientCode}/visit/new?appointmentId=${encodeURIComponent(appt.id)}&chiefComplaint=${complaint}&returnTo=calendar`;
  }

  function selectDayAndShow(dateKey: string) {
    setSelectedDate(dateKey);
    setCurrentView("Day");
  }

  function closeDeleteConfirm() {
    if (isDeleting) return;
    setPendingDelete(null);
    setDeleteError("");
  }

  async function confirmPendingDelete() {
    if (!pendingDelete || !isAdmin) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      if (pendingDelete.type === "reservation") {
        await deleteAppointment(pendingDelete.appointment.id);
      } else {
        await deletePatientRecord(pendingDelete.appointment.patientCode);
      }
      const [apts, pts] = await Promise.all([
        fetchAppointments(undefined, calendarWindow()),
        fetchPatients(),
      ]);
      setAppointments(apts);
      setPatients(pts);
      setPendingDelete(null);
    } catch {
      setDeleteError(
        isAr ? "تعذر إتمام الحذف. حاول مرة أخرى." : "Could not complete delete. Please try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function renderAppointmentActions(appt: Appointment) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <ButtonLink href={`/${locale}/patients/${appt.patientCode}`} variant="secondary" size="xs">
          {dict.patients.table.viewChart}
        </ButtonLink>
        {canStartVisit(appt.status) ? (
          <ButtonLink href={visitStartHref(appt)} variant="primary" size="xs">
            {dict.calendar.startVisit}
          </ButtonLink>
        ) : appt.status === "COMPLETED" ? (
          <span className="inline-flex items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            {dict.calendar.visitCompleted}
          </span>
        ) : null}
        {isAdmin ? (
          <>
            <Button
              type="button"
              variant="danger-soft"
              size="xs"
              onClick={() => {
                setDeleteError("");
                setPendingDelete({ type: "reservation", appointment: appt });
              }}
            >
              {dict.calendar.deleteReservation}
            </Button>
            <Button
              type="button"
              variant="danger-soft"
              size="xs"
              onClick={() => {
                setDeleteError("");
                setPendingDelete({ type: "patient", appointment: appt });
              }}
            >
              {dict.calendar.deletePatient}
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  function renderDayAppointmentCard(appt: Appointment) {
    return (
      <div
        key={appt.id}
        className="relative overflow-hidden rounded-xl glass-elevated px-3 py-2.5 transition-all hover:shadow-md hover:shadow-[#caa95a]/10"
      >
        <div className={`absolute inset-y-0 start-0 w-1 bg-gradient-to-b ${statusAccent(appt.status)}`} />
        <div className="ps-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#dfbf70] via-[#caa95a] to-[#99782a] text-[10px] font-bold text-on-gold">
              {initials(appt.patientName)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-sm text-primary truncate">{appt.patientName}</span>
                <span className="font-mono text-[10px] text-gold bg-[#caa95a]/10 px-1.5 py-0.5 rounded border border-[#caa95a]/20">
                  {appt.patientCode}
                </span>
                <Badge variant={statusBadgeVariant(appt.status)} size="sm">
                  {appt.status}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-primary truncate">{appt.procedure}</p>
              <p className="text-[11px] text-secondary truncate">
                <span className="font-mono font-bold text-gold">{appt.time}</span>
                <span className="mx-1 text-muted">·</span>
                {appt.doctorName}
              </p>
            </div>
          </div>
          {renderAppointmentActions(appt)}
        </div>
      </div>
    );
  }

  const weekdayLabels = useMemo(() => {
    const base = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) =>
      addDays(base, i).toLocaleDateString(isAr ? "ar-EG" : "en-GB", { weekday: "short" }),
    );
  }, [isAr]);

  const metricBooked =
    currentView === "Week" ? weekBookedCount : currentView === "Month" ? monthBookedCount : bookedCount;
  const metricLabel =
    currentView === "Week"
      ? isAr
        ? "مواعيد الأسبوع"
        : "This week"
      : currentView === "Month"
        ? isAr
          ? "مواعيد الشهر"
          : "This month"
        : isAr
          ? "مواعيد اليوم"
          : "Today";

  return (
    <AppShell locale={locale}>
      <div className="space-y-4">
        <PageHeader
          title={dict.calendar.title}
          subtitle={dict.calendar.subtitle}
          actions={
            <>
              <ButtonLink href={`/${locale}/reservations`} variant="secondary" size="sm">
                {dict.nav.reservations}
              </ButtonLink>
              <Button type="button" variant="primary" size="sm" onClick={() => openBooking()}>
                {dict.calendar.bookAppointment}
              </Button>
            </>
          }
        />

        {/* Compact metrics strip */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="glass-card rounded-xl px-3 py-2.5 sm:px-4">
            <p className="text-[10px] font-medium text-secondary truncate">{metricLabel}</p>
            <p className="text-xl font-bold text-primary">{metricBooked}</p>
          </div>
          <div className="glass-card rounded-xl px-3 py-2.5 sm:px-4">
            <p className="text-[10px] font-medium text-secondary truncate">
              {isAr ? "مؤكدة اليوم" : "Confirmed today"}
            </p>
            <p className="text-xl font-bold text-gold">{confirmedCount}</p>
          </div>
          <div className="glass-card rounded-xl px-3 py-2.5 sm:px-4">
            <p className="text-[10px] font-medium text-secondary truncate">
              {isAr ? "ساعات محجوزة" : "Busy hours"}
            </p>
            <p className="text-xl font-bold text-sky-500">{appointmentsByHour.size}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="glass-card rounded-2xl p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => shiftRange(-1)}
                className="!px-2 shrink-0"
                aria-label={isAr ? "السابق" : "Previous"}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d={isAr ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"}
                  />
                </svg>
              </Button>
              <div className="min-w-0 flex-1 rounded-xl bg-gradient-to-r from-[#dfbf70]/20 via-[#caa95a]/10 to-transparent px-3 py-2 border border-[#caa95a]/25">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                  {currentView === "Week"
                    ? isAr
                      ? "الأسبوع"
                      : "Week"
                    : currentView === "Month"
                      ? isAr
                        ? "الشهر"
                        : "Month"
                      : isAr
                        ? "اليوم المحدد"
                        : "Selected day"}
                </p>
                <p className="truncate text-sm font-bold text-primary">{formattedDate}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => shiftRange(1)}
                className="!px-2 shrink-0"
                aria-label={isAr ? "التالي" : "Next"}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d={isAr ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"}
                  />
                </svg>
              </Button>
              <Button
                type="button"
                variant="accent"
                size="xs"
                onClick={() => setSelectedDate(todayKey)}
                className="hidden sm:inline-flex shrink-0"
              >
                {isAr ? "اليوم" : "Today"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="glass rounded-xl px-3 py-1.5 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
              />
              {isAdmin ? (
                <select
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  className="glass rounded-xl px-3 py-1.5 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                >
                  <option value="ALL">
                    {dict.calendar.filterDoctor}: {isAr ? "الكل" : "All"}
                  </option>
                  {INITIAL_DOCTORS.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              ) : null}

              <div className="flex items-center gap-1 glass rounded-xl p-1">
                {(["Day", "Week", "Month", "Agenda"] as const).map((view) => (
                  <Button
                    key={view}
                    type="button"
                    size="xs"
                    variant={currentView === view ? "primary" : "ghost"}
                    onClick={() => setCurrentView(view)}
                    className="whitespace-nowrap"
                  >
                    {view === "Day"
                      ? dict.calendar.views.day
                      : view === "Week"
                        ? dict.calendar.views.week
                        : view === "Month"
                          ? dict.calendar.views.month
                          : dict.calendar.views.agenda}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main calendar body */}
        <div className="glass-card rounded-2xl overflow-hidden shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b glass-divider/60 px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gold">
                {isAr ? "الجدول" : "Schedule"}
              </p>
              <h2 className="text-sm font-bold text-primary">
                {currentView === "Day"
                  ? isAr
                    ? "جدول اليوم"
                    : "Day schedule"
                  : currentView === "Week"
                    ? isAr
                      ? "نظرة أسبوعية"
                      : "Week overview"
                    : currentView === "Month"
                      ? isAr
                        ? "نظرة شهرية"
                        : "Month overview"
                      : isAr
                        ? "قائمة المواعيد"
                        : "Appointment agenda"}
              </h2>
            </div>
            {currentView === "Day" ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowQuietHours((v) => !v)}
              >
                {showQuietHours
                  ? isAr
                    ? "إخفاء الساعات الهادئة"
                    : "Hide quiet hours"
                  : isAr
                    ? "إظهار كل الساعات"
                    : "Show all 24 hours"}
              </Button>
            ) : null}
          </div>

          {currentView === "Day" ? (
            <div ref={dayScrollRef} className="max-h-[min(62vh,36rem)] overflow-y-auto overscroll-contain">
              {dayAppointments.length === 0 && !showQuietHours ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm font-semibold text-primary">{dict.calendar.emptyTitle}</p>
                  <p className="text-xs text-secondary max-w-sm mx-auto">{dict.calendar.emptyDescription}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" variant="primary" size="sm" onClick={() => openBooking("10:00 AM")}>
                      {dict.calendar.bookAppointment}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowQuietHours(true)}>
                      {isAr ? "تصفح الساعات" : "Browse hours"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-200/60 dark:divide-white/5">
                  {visibleHours.map((hour) => {
                    const slot = hourToSlotLabel(hour);
                    const slotAppointments = appointmentsByHour.get(hour) ?? [];
                    const hasBookings = slotAppointments.length > 0;

                    return (
                      <div key={slot} data-hour={hour} className="px-3 sm:px-4 py-1.5">
                        <div className="flex gap-3 items-start">
                          <div className="w-16 shrink-0 pt-1 text-end">
                            <span
                              className={`font-mono text-[11px] font-bold ${
                                hasBookings ? "text-gold" : "text-secondary"
                              }`}
                            >
                              {slot}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            {hasBookings ? (
                              <>
                                {slotAppointments.map(renderDayAppointmentCard)}
                                <button
                                  type="button"
                                  onClick={() => openBooking(slot)}
                                  className="text-[11px] font-medium text-secondary hover:text-gold px-1 py-0.5"
                                >
                                  {isAr ? "+ إضافة في هذه الساعة" : "+ Add this hour"}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openBooking(slot)}
                                className="w-full rounded-lg border border-dashed border-slate-300/70 px-3 py-1.5 text-start text-[11px] text-secondary hover:border-[#caa95a]/50 hover:bg-[#caa95a]/5 hover:text-gold"
                              >
                                {dict.calendar.chairAvailable}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {currentView === "Week" ? (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 min-w-[52rem] divide-x divide-slate-200/60 dark:divide-white/5">
                {weekDays.map((day) => {
                  const key = toDateKey(day);
                  const list = weekAppointmentsByDate.get(key) ?? [];
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDate;
                  return (
                    <div key={key} className="min-h-[22rem] flex flex-col bg-transparent">
                      <button
                        type="button"
                        onClick={() => selectDayAndShow(key)}
                        className={`sticky top-0 z-10 border-b glass-divider/60 px-2 py-2 text-center transition-colors ${
                          isSelected
                            ? "bg-[#caa95a]/15"
                            : isToday
                              ? "bg-[#caa95a]/8"
                              : "bg-white/40 dark:bg-white/5"
                        }`}
                      >
                        <p className="text-[10px] font-semibold uppercase text-secondary">
                          {day.toLocaleDateString(isAr ? "ar-EG" : "en-GB", { weekday: "short" })}
                        </p>
                        <p
                          className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                            isToday ? "bg-gradient-to-br from-[#dfbf70] to-[#99782a] text-on-gold" : "text-primary"
                          }`}
                        >
                          {day.getDate()}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gold font-medium">
                          {list.length} {isAr ? "موعد" : "apt"}
                        </p>
                      </button>
                      <div className="flex-1 space-y-1 p-1.5 overflow-y-auto max-h-[28rem]">
                        {list.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => openBooking("10:00 AM", key)}
                            className="w-full rounded-lg border border-dashed border-slate-300/60 px-1.5 py-3 text-[10px] text-secondary hover:border-[#caa95a]/40 hover:text-gold"
                          >
                            {isAr ? "+ حجز" : "+ Book"}
                          </button>
                        ) : (
                          list.map((appt) => (
                            <button
                              key={appt.id}
                              type="button"
                              onClick={() => selectDayAndShow(key)}
                              className="w-full rounded-lg glass-elevated px-1.5 py-1.5 text-start hover:ring-1 hover:ring-[#caa95a]/40"
                            >
                              <div className="flex items-center gap-1">
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot(appt.status)}`} />
                                <span className="font-mono text-[10px] font-bold text-gold truncate">
                                  {appt.time}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] font-semibold text-primary truncate">
                                {appt.patientName}
                              </p>
                              <p className="text-[10px] text-secondary truncate">{appt.procedure}</p>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {currentView === "Month" ? (
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {weekdayLabels.map((label) => (
                  <div key={label} className="text-center text-[10px] font-semibold uppercase text-secondary py-1">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthGrid.map((day) => {
                  const key = toDateKey(day);
                  const inMonth = day.getMonth() === selected.getMonth();
                  const list = monthAppointmentsByDate.get(key) ?? [];
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDate;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectDayAndShow(key)}
                      className={`min-h-[4.5rem] sm:min-h-[5.5rem] rounded-xl p-1.5 text-start transition-colors border ${
                        isSelected
                          ? "border-[#caa95a]/60 bg-[#caa95a]/15"
                          : inMonth
                            ? "border-transparent glass hover:border-[#caa95a]/30"
                            : "border-transparent opacity-40 hover:opacity-70"
                      }`}
                    >
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          isToday
                            ? "bg-gradient-to-br from-[#dfbf70] to-[#99782a] text-on-gold"
                            : "text-primary"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {list.slice(0, 3).map((appt) => (
                          <div
                            key={appt.id}
                            className="flex items-center gap-1 rounded px-1 py-0.5 bg-[#caa95a]/10"
                          >
                            <span className={`h-1 w-1 rounded-full shrink-0 ${statusDot(appt.status)}`} />
                            <span className="truncate text-[9px] sm:text-[10px] font-medium text-primary">
                              {appt.patientName}
                            </span>
                          </div>
                        ))}
                        {list.length > 3 ? (
                          <p className="text-[9px] text-gold font-semibold px-1">
                            +{list.length - 3} {isAr ? "أخرى" : "more"}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {currentView === "Agenda" ? (
            <div className="p-4 space-y-2 max-h-[min(62vh,36rem)] overflow-y-auto">
              {dayAppointments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#caa95a]/30 bg-[#caa95a]/5 p-8 text-center space-y-3">
                  <p className="text-sm font-semibold text-primary">{dict.calendar.emptyTitle}</p>
                  <p className="text-xs text-secondary max-w-sm mx-auto">{dict.calendar.emptyDescription}</p>
                  <Button type="button" variant="primary" size="sm" onClick={() => openBooking()} className="inline-flex">
                    {dict.calendar.bookAppointment}
                  </Button>
                </div>
              ) : (
                dayAppointments.map(renderDayAppointmentCard)
              )}
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        isOpen={isBookingOpen}
        onClose={closeBooking}
        title={dict.calendar.bookAppointment}
        description={
          isAr
            ? "تحديد وقت الكرسي والأخصائي والإجراء المطلوب"
            : "Assign specialist chair time and procedure"
        }
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const patientCode = (formData.get("patientCode") as string) || "";
            const doctorName = (formData.get("doctorName") as string) || "Dr. Sayed El-Bahy";
            const date = (formData.get("date") as string) || selectedDate;
            const time = (formData.get("time") as string) || prefillTime;
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
              const updated = await fetchAppointments(undefined, calendarWindow());
              setAppointments(updated);
            }
            closeBooking();
          }}
          className="space-y-4 text-xs"
        >
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              {isAr ? "اختيار المريض" : "Select Patient"}
            </label>
            <select
              name="patientCode"
              required
              defaultValue={prefillPatientCode}
              key={`patient-${prefillPatientCode}-${isBookingOpen}`}
              className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
            >
              {patients.length > 0 ? (
                patients.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.fullName} ({p.code})
                  </option>
                ))
              ) : (
                <option value="">
                  {isAr ? "لا يوجد مرضى مسجلون" : "No patients registered yet"}
                </option>
              )}
            </select>
          </div>

          {isAdmin ? (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                {dict.calendar.filterDoctor}
              </label>
              <select
                name="doctorName"
                className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
              >
                {INITIAL_DOCTORS.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name} ({d.specialization})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Input
              name="date"
              label={isAr ? "تاريخ الموعد" : "Appointment Date"}
              type="date"
              required
              defaultValue={selectedDate}
              key={`date-${selectedDate}-${isBookingOpen}`}
            />
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                {isAr ? "الوقت" : "Start Time"}
              </label>
              <select
                name="time"
                required
                defaultValue={prefillTime}
                key={`time-${prefillTime}-${isBookingOpen}`}
                className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
              >
                {timeSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                {isAr ? "المدة المتوقعة" : "Duration"}
              </label>
              <select
                name="duration"
                className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
              >
                <option value="30">30 {isAr ? "دقيقة" : "Minutes"}</option>
                <option value="45">45 {isAr ? "دقيقة" : "Minutes"}</option>
                <option value="60">60 {isAr ? "دقيقة" : "Minutes"}</option>
                <option value="90">90 {isAr ? "دقيقة" : "Minutes"}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                {isAr ? "الغرفة / الكرسي" : "Clinic Room"}
              </label>
              <select
                name="room"
                className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
              >
                <option>{isAr ? "عيادة ١ — الكرسي الرئيسي" : "Room 1 — Main Operatory"}</option>
                <option>{isAr ? "عيادة ٢ — جناح علاج الجذور" : "Room 2 — Periodontal Suite"}</option>
                <option>{isAr ? "عيادة ٣ — جراحة الفم والأسنان" : "Room 3 — Surgical Suite"}</option>
              </select>
            </div>
          </div>

          <Input
            name="chiefComplaint"
            label={isAr ? "الشكوى الرئيسية للمريض عند الحجز" : "Patient Chief Complaint at Booking"}
            placeholder={
              isAr
                ? "ألم حاد في الضرس السفلي، كسر في الحشوة..."
                : "e.g. Severe throbbing pain lower molar, chipped veneer..."
            }
            required
          />

          <Input
            name="procedure"
            label={isAr ? "الإجراء الطبي المتوقع" : "Expected Clinical Procedure"}
            placeholder={
              isAr
                ? "مثل: كشف، حشو تجميلي، سحب عصب..."
                : "e.g. Consultation, Composite filling, Root Canal..."
            }
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t glass-divider/60">
            <Button variant="outline" size="sm" type="button" onClick={closeBooking}>
              {dict.patientNew.cancelButton}
            </Button>
            <Button variant="primary" size="sm" type="submit">
              {isAr ? "تأكيد الحجز" : "Confirm Booking"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={pendingDelete !== null}
        onClose={closeDeleteConfirm}
        title={
          pendingDelete?.type === "patient"
            ? dict.calendar.confirmDeletePatientTitle
            : dict.calendar.confirmDeleteReservationTitle
        }
        description={
          pendingDelete?.type === "patient"
            ? dict.calendar.confirmDeletePatientBody
            : dict.calendar.confirmDeleteReservationBody
        }
        size="sm"
      >
        {pendingDelete ? (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl glass px-3 py-2.5">
              <p className="font-semibold text-sm text-primary">{pendingDelete.appointment.patientName}</p>
              <p className="mt-0.5 font-mono text-[11px] text-gold">{pendingDelete.appointment.patientCode}</p>
              {pendingDelete.type === "reservation" ? (
                <p className="mt-1 text-secondary">
                  <span className="font-mono font-bold text-gold">{pendingDelete.appointment.time}</span>
                  <span className="mx-1 text-muted">·</span>
                  {pendingDelete.appointment.date}
                  <span className="mx-1 text-muted">·</span>
                  {pendingDelete.appointment.procedure}
                </p>
              ) : null}
            </div>
            {deleteError ? <p className="text-rose-600">{deleteError}</p> : null}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {dict.patientNew.cancelButton}
              </Button>
              <Button
                variant="danger"
                size="sm"
                type="button"
                onClick={() => void confirmPendingDelete()}
                disabled={isDeleting}
              >
                {isDeleting ? dict.calendar.deleting : dict.calendar.confirmDelete}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageContent />
    </Suspense>
  );
}
