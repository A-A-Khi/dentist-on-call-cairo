"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import {
  DataTable,
  TableActions,
  TableText,
  dash,
  useTableDensity,
  type DataColumn,
  type SortState,
  type TableActionItem,
} from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import {
  deleteAppointment,
  fetchAppointments,
  updateAppointment,
  updateAppointmentStatus,
} from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import { getStoredSessionUser } from "../../../lib/session";
import type { Appointment } from "../../../lib/clinical-data";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Reservations board: past month through next two months. */
function reservationsWindow(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  const to = new Date(now);
  to.setDate(to.getDate() + 60);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function toTimeInputValue(displayTime: string): string {
  const match = displayTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return "10:00";
  let hours = Number(match[1]);
  const minutes = match[2];
  const meridian = match[3]?.toUpperCase();
  if (meridian === "PM" && hours < 12) hours += 12;
  if (meridian === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

export default function ReservationsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const isAr = locale === "ar";
  const actions = dict.reservations.actions;

  const [reservations, setReservations] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isAdmin, setIsAdmin] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [density, setDensity] = useTableDensity("default");
  const [sort, setSort] = useState<SortState>({ id: "when", dir: "asc" });

  useEffect(() => {
    setIsAdmin((getStoredSessionUser()?.role ?? "ADMIN") === "ADMIN");
  }, []);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchAppointments(undefined, reservationsWindow());
        setReservations(data);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
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

  const sorted = [...filtered].sort((a, b) => {
    if (!sort) return 0;
    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.id === "patient") return a.patientName.localeCompare(b.patientName) * dir;
    if (sort.id === "when") {
      const ak = `${a.date} ${a.time}`;
      const bk = `${b.date} ${b.time}`;
      return ak.localeCompare(bk) * dir;
    }
    if (sort.id === "status") return a.status.localeCompare(b.status) * dir;
    if (sort.id === "ref") return a.id.localeCompare(b.id) * dir;
    return 0;
  });

  const refresh = async () => {
    const data = await fetchAppointments(undefined, reservationsWindow());
    setReservations(data);
  };

  const changeStatus = async (appointment: Appointment, status: Appointment["status"]) => {
    if (!isAdmin) return;
    setBusyId(appointment.id);
    try {
      await updateAppointmentStatus(appointment.id, status);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const removeReservation = async (appointment: Appointment) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(
      isAr
        ? `حذف حجز ${appointment.patientName}؟`
        : `Delete reservation for ${appointment.patientName}?`,
    );
    if (!confirmed) return;
    setBusyId(appointment.id);
    try {
      await deleteAppointment(appointment.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    setIsSavingEdit(true);
    const formData = new FormData(e.currentTarget);
    try {
      await updateAppointment(editing.id, {
        date: (formData.get("date") as string) || editing.date,
        time: (formData.get("time") as string) || toTimeInputValue(editing.time),
        durationMinutes: Number(formData.get("duration") || editing.durationMinutes),
        procedure: (formData.get("procedure") as string) || editing.procedure,
        chiefComplaint: (formData.get("chiefComplaint") as string) || editing.chiefComplaint,
        location: (formData.get("location") as string) || editing.location,
      });
      await refresh();
      setEditing(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const actionItems = (r: Appointment): TableActionItem[] => {
    const status = r.status.toUpperCase();
    const closed = status === "CANCELLED" || status === "COMPLETED" || status === "NO_SHOW";
    const busy = busyId === r.id;
    const items: TableActionItem[] = [];

    if (isAdmin && !closed) {
      if (status === "PENDING") {
        items.push({
          id: "confirm",
          label: actions.confirm,
          disabled: busy,
          onClick: () => void changeStatus(r, "CONFIRMED"),
        });
      }
      items.push(
        {
          id: "reschedule",
          label: actions.reschedule,
          disabled: busy,
          onClick: () => setEditing(r),
        },
        {
          id: "complete",
          label: actions.complete,
          disabled: busy,
          onClick: () => void changeStatus(r, "COMPLETED"),
        },
        {
          id: "noshow",
          label: actions.noShow,
          disabled: busy,
          onClick: () => void changeStatus(r, "NO_SHOW"),
        },
        {
          id: "cancel",
          label: actions.cancel,
          disabled: busy,
          tone: "danger",
          onClick: () => void changeStatus(r, "CANCELLED"),
        },
        {
          id: "delete",
          label: isAr ? "حذف" : "Delete",
          disabled: busy,
          tone: "danger",
          onClick: () => void removeReservation(r),
        }
      );
    }
    if (isAdmin && closed) {
      items.push(
        {
          id: "reschedule",
          label: actions.reschedule,
          disabled: busy,
          onClick: () => setEditing(r),
        },
        {
          id: "delete",
          label: isAr ? "حذف" : "Delete",
          disabled: busy,
          tone: "danger",
          onClick: () => void removeReservation(r),
        }
      );
    }
    if (!closed) {
      items.push({
        id: "visit",
        label: isAr ? "بدء الزيارة" : "Start visit",
        tone: "accent",
        href: `/${locale}/patients/${r.patientCode}/visit/new?appointmentId=${encodeURIComponent(r.id)}&chiefComplaint=${encodeURIComponent(r.chiefComplaint || r.procedure)}&returnTo=calendar`,
      });
    }
    return items;
  };

  const columns: DataColumn<Appointment>[] = [
    {
      id: "ref",
      header: isAr ? "كود الحجز" : "Booking ID",
      sortable: true,
      minWidth: 100,
      cardRole: "id",
      cardLabel: isAr ? "كود الحجز" : "Booking ID",
      truncate: false,
      cell: (r) => (
        <span className="font-mono font-medium text-[var(--gold-primary)]">
          {dash(r.id.slice(0, 8).toUpperCase())}
        </span>
      ),
    },
    {
      id: "patient",
      header: isAr ? "المريض" : "Patient",
      pin: true,
      sortable: true,
      minWidth: 160,
      cardRole: "identity",
      cardCell: (r) => dash(r.patientName),
      truncate: false,
      cell: (r) => (
        <div className="min-w-0 max-w-[14rem]">
          <Link
            href={`/${locale}/patients/${r.patientCode}`}
            className="font-semibold text-primary hover:text-[var(--gold-primary)]"
          >
            <TableText>{dash(r.patientName)}</TableText>
          </Link>
          <TableText className="font-mono text-[10px] text-muted">
            {dash(r.patientCode)}
            {r.patientPhone ? ` · ${r.patientPhone}` : ""}
          </TableText>
        </div>
      ),
    },
    {
      id: "when",
      header: isAr ? "التاريخ والوقت" : "Date & Time",
      sortable: true,
      truncate: false,
      cell: (r) => (
        <div>
          <div className="font-medium text-primary tabular-nums">{dash(r.date)}</div>
          <div className="font-mono text-[10px] text-secondary tabular-nums">
            {dash(r.time)}
            {r.durationMinutes != null ? ` (${r.durationMinutes}m)` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "time",
      header: isAr ? "الوقت" : "Time",
      cardRole: "value",
      cardOnly: true,
      cardCell: (r) => <span className="data-table-num">{dash(r.time)}</span>,
      cell: () => null,
    },
    {
      id: "due",
      header: isAr ? "الموعد" : "Due",
      cardRole: "meta",
      cardOnly: true,
      cardLabel: isAr ? "موعد" : "Due",
      cardCell: (r) => <span className="tabular-nums">{dash(r.date)}</span>,
      cell: () => null,
    },
    {
      id: "doctor",
      header: isAr ? "الأخصائي" : "Specialist",
      cardRole: "detail",
      cardLabel: isAr ? "الأخصائي" : "Specialist",
      cell: (r) => dash(r.doctorName),
    },
    {
      id: "procedure",
      header: isAr ? "الإجراء" : "Procedure",
      minWidth: 160,
      cardRole: "detail",
      cardLabel: isAr ? "الإجراء" : "Procedure",
      truncate: false,
      cell: (r) => (
        <div className="min-w-0 max-w-[14rem]">
          <TableText className="font-semibold text-primary">{dash(r.procedure)}</TableText>
          {r.chiefComplaint && r.chiefComplaint !== r.procedure ? (
            <TableText className="text-[10px] italic text-[var(--gold-primary)]">
              “{r.chiefComplaint}”
            </TableText>
          ) : null}
        </div>
      ),
    },
    {
      id: "complaint",
      header: isAr ? "الشكوى" : "Notes",
      cardRole: "detail",
      cardOnly: true,
      cardLabel: isAr ? "الشكوى" : "Notes",
      cardCell: (r) => dash(r.chiefComplaint),
      cell: () => null,
    },
    {
      id: "status",
      header: isAr ? "الحالة" : "Status",
      sortable: true,
      cardRole: "state",
      truncate: false,
      cell: (r) =>
        r.status ? (
          <Badge variant={r.status.toUpperCase() === "CONFIRMED" ? "green" : "gold"} size="sm">
            {r.status}
          </Badge>
        ) : (
          "–"
        ),
    },
    {
      id: "actions",
      header: dict.common.actions,
      actions: true,
      cardRole: "actions",
      truncate: false,
      cell: (r) => <TableActions items={actionItems(r)} />,
    },
  ];

  return (
    <AppShell locale={locale}>
      <div className="space-y-6">
        <PageHeader
          title={dict.reservations.title}
          subtitle={dict.reservations.subtitle}
          actions={
            <ButtonLink href={`/${locale}/calendar`} variant="secondary" size="sm">
              {dict.dashboard.quickActions.viewCalendar}
            </ButtonLink>
          }
        />

        <div className="filter-bar">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isAr
                ? "البحث بالاسم، كود المريض، أو الإجراء..."
                : "Search reservations by patient, code, or procedure..."
            }
            className="glass-input w-full sm:flex-1 rounded-lg px-3.5 py-2 text-xs text-primary placeholder:text-muted"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="glass-input w-full sm:w-auto rounded-lg px-3 py-2 text-xs text-primary"
          >
            <option value="ALL">
              {dict.reservations.filterStatus}: {isAr ? "الكل" : "All"}
            </option>
            <option value="CONFIRMED">{isAr ? "مؤكد" : "Confirmed"}</option>
            <option value="PENDING">{isAr ? "قيد الانتظار" : "Pending"}</option>
            <option value="COMPLETED">{isAr ? "مكتمل" : "Completed"}</option>
            <option value="CANCELLED">{isAr ? "ملغي" : "Cancelled"}</option>
            <option value="NO_SHOW">{isAr ? "لم يحضر" : "No Show"}</option>
          </select>
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={dict.reservations.emptyTitle}
            description={dict.reservations.emptyDescription}
            actionLabel={dict.dashboard.quickActions.viewCalendar}
            actionHref={`/${locale}/calendar`}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={sorted}
            getRowId={(r) => r.id}
            density={density}
            onDensityChange={setDensity}
            densityLabels={{
              compact: dict.common.densityCompact,
              default: dict.common.densityDefault,
              comfortable: dict.common.densityComfortable,
            }}
            sort={sort}
            onSortChange={setSort}
            sortControlLabel={dict.common.sort}
            emptyMessage={dict.common.noRecordsFound}
            sheetTitle={(r) => r.patientName}
            sheetDescription={(r) => r.id.slice(0, 8).toUpperCase()}
            toolbar={
              <span className="text-[11px] text-muted tabular-nums">
                {sorted.length} {isAr ? "حجز" : "bookings"}
              </span>
            }
          />
        )}
      </div>

      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={actions.reschedule}
        description={
          editing
            ? `${editing.patientName} (${editing.patientCode})`
            : undefined
        }
        size="md"
      >
        {editing && (
          <form onSubmit={(e) => void handleEditSubmit(e)} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <Input name="date" label={isAr ? "التاريخ" : "Date"} type="date" required defaultValue={editing.date} />
              <Input
                name="time"
                label={isAr ? "الوقت" : "Time"}
                type="time"
                required
                defaultValue={toTimeInputValue(editing.time)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                {isAr ? "المدة" : "Duration"}
              </label>
              <select
                name="duration"
                defaultValue={String(editing.durationMinutes)}
                className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
              >
                <option value="30">30</option>
                <option value="45">45</option>
                <option value="60">60</option>
                <option value="90">90</option>
              </select>
            </div>
            <Input
              name="procedure"
              label={isAr ? "الإجراء" : "Procedure"}
              defaultValue={editing.procedure}
            />
            <Input
              name="chiefComplaint"
              label={isAr ? "الشكوى" : "Chief complaint"}
              defaultValue={editing.chiefComplaint || ""}
            />
            <Input
              name="location"
              label={isAr ? "الموقع" : "Location"}
              defaultValue={editing.location}
            />
            <div className="flex justify-end gap-2 pt-2 border-t glass-divider/60">
              <Button variant="outline" size="sm" type="button" onClick={() => setEditing(null)}>
                {dict.patientProfile.cancel}
              </Button>
              <Button variant="primary" size="sm" type="submit" isLoading={isSavingEdit}>
                {isAr ? "حفظ التعديلات" : "Save changes"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
