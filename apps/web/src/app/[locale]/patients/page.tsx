"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
} from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { deletePatientRecord, fetchPatients } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import { getStoredSessionUser } from "../../../lib/session";
import type { Patient } from "../../../lib/clinical-data";

function PatientsPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const isAr = locale === "ar";

  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [density, setDensity] = useTableDensity("default");
  const [sort, setSort] = useState<SortState>({ id: "name", dir: "asc" });
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Patient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setIsAdmin((getStoredSessionUser()?.role ?? "DOCTOR") === "ADMIN");
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchPatients(searchQuery);
        if (isMounted) setPatients(data);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    const timeoutId = setTimeout(load, 200);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  const filteredPatients = useMemo(() => {
    const base = patients.filter((p) => statusFilter === "ALL" || p.status === statusFilter);
    if (!sort) return base;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const av =
        sort.id === "code"
          ? a.code
          : sort.id === "name"
            ? a.fullName
            : sort.id === "lastVisit"
              ? a.lastVisit || ""
              : sort.id === "doctor"
                ? a.assignedDoctor || ""
                : a.status;
      const bv =
        sort.id === "code"
          ? b.code
          : sort.id === "name"
            ? b.fullName
            : sort.id === "lastVisit"
              ? b.lastVisit || ""
              : sort.id === "doctor"
                ? b.assignedDoctor || ""
                : b.status;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * dir;
    });
  }, [patients, statusFilter, sort]);

  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "ALL";

  function closeDeleteConfirm() {
    if (isDeleting) return;
    setPendingDelete(null);
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!pendingDelete || !isAdmin) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deletePatientRecord(pendingDelete.code);
      setPatients((prev) =>
        prev.filter((p) => p.id !== pendingDelete.id && p.code !== pendingDelete.code)
      );
      setPendingDelete(null);
    } catch {
      setDeleteError(dict.patients.deleteFailed);
    } finally {
      setIsDeleting(false);
    }
  }

  const columns: DataColumn<Patient>[] = [
    {
      id: "code",
      header: dict.patients.table.code,
      sortable: true,
      minWidth: 110,
      cardRole: "id",
      cardLabel: isAr ? "كود المريض" : "Patient ID",
      cell: (p) => <span className="font-mono font-medium text-[var(--gold-primary)]">{dash(p.code)}</span>,
      truncate: false,
    },
    {
      id: "name",
      header: dict.patients.table.name,
      pin: true,
      sortable: true,
      minWidth: 180,
      cardRole: "identity",
      cardCell: (p) => dash(p.fullName),
      truncate: false,
      cell: (p) => (
        <div className="min-w-0 max-w-[14rem]">
          <TableText className="font-semibold text-primary">{dash(p.fullName)}</TableText>
          {p.sourceStream ? (
            <TableText className="text-[10px] text-[var(--gold-primary)]">{p.sourceStream}</TableText>
          ) : null}
          {p.medicalAlerts?.[0] ? (
            <TableText className="text-[10px] text-amber-700">⚠ {p.medicalAlerts[0]}</TableText>
          ) : null}
        </div>
      ),
    },
    {
      id: "ageGender",
      header: dict.patients.table.ageGender,
      cardRole: "detail",
      cell: (p) =>
        p.age != null
          ? `${p.age} ${isAr ? "سنة" : "y/o"} · ${dash(p.gender)}`
          : dash(p.gender),
    },
    {
      id: "phone",
      header: dict.patients.table.phone,
      cardRole: "detail",
      cell: (p) => <span className="font-mono text-secondary">{dash(p.phone)}</span>,
      truncate: false,
    },
    {
      id: "doctor",
      header: dict.patients.table.assignedDoctor,
      sortable: true,
      cardRole: "detail",
      cardLabel: isAr ? "الطبيب" : "Doctor",
      cell: (p) => dash(p.assignedDoctor),
    },
    {
      id: "lastVisit",
      header: dict.patients.table.lastVisit,
      sortable: true,
      numeric: true,
      cardRole: "meta",
      cardLabel: isAr ? "آخر زيارة" : "Last visit",
      cell: (p) => dash(p.lastVisit),
    },
    {
      id: "status",
      header: dict.patients.table.status,
      sortable: true,
      cardRole: "state",
      truncate: false,
      cell: (p) =>
        p.status ? (
          <Badge
            variant={p.status === "In Treatment" ? "gold" : p.status === "Active" ? "green" : "blue"}
            size="sm"
          >
            {p.status}
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
      cell: (p) => (
        <TableActions
          items={[
            {
              id: "book",
              label: dict.patients.table.bookAppointment,
              href: `/${locale}/calendar?bookPatient=${encodeURIComponent(p.code)}`,
              tone: "accent",
            },
            {
              id: "chart",
              label: dict.patients.table.viewChart,
              href: `/${locale}/patients/${p.code}`,
            },
            ...(isAdmin
              ? [
                  {
                    id: "delete",
                    label: dict.patients.deletePatient,
                    tone: "danger" as const,
                    onClick: () => {
                      setDeleteError("");
                      setPendingDelete(p);
                    },
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <AppShell locale={locale}>
      <PageHeader
        title={dict.patients.title}
        subtitle={dict.patients.subtitle}
        actions={
          <ButtonLink href={`/${locale}/patients/new`} variant="primary" size="sm">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>+ {dict.patients.addPatient}</span>
          </ButtonLink>
        }
      />

      <div className="filter-bar">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={dict.patients.searchPlaceholder}
            className="glass-input w-full rounded-lg py-2 ps-9 pe-3 text-xs text-primary placeholder:text-muted"
          />
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="glass-input w-full sm:w-auto rounded-lg px-3 py-2 text-xs text-primary"
        >
          <option value="ALL">{dict.patients.filterStatus}</option>
          <option value="Active">Active</option>
          <option value="In Treatment">In Treatment</option>
          <option value="Follow-up">Follow-up</option>
        </select>
      </div>

      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : filteredPatients.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? dict.patients.emptySearchTitle : dict.patients.emptyTitle}
          description={hasActiveFilters ? dict.patients.emptySearchDescription : dict.patients.emptyDescription}
          actionLabel={`+ ${dict.patients.addPatient}`}
          actionHref={`/${locale}/patients/new`}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={filteredPatients}
          getRowId={(p) => p.id}
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
          sheetTitle={(p) => p.fullName}
          sheetDescription={(p) => p.code}
          toolbar={
            <span className="text-[11px] text-muted tabular-nums">
              {filteredPatients.length} {isAr ? "مريض" : "patients"}
            </span>
          }
        />
      )}

      <Modal
        isOpen={pendingDelete !== null}
        onClose={closeDeleteConfirm}
        title={dict.patients.confirmDeleteTitle}
        description={dict.patients.confirmDeleteBody}
      >
        {pendingDelete ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-slate-50/80 px-4 py-3">
              <p className="font-semibold text-sm text-primary">{pendingDelete.fullName}</p>
              <p className="mt-0.5 font-mono text-[11px] text-gold">{pendingDelete.code}</p>
            </div>
            {deleteError ? <p className="text-xs text-rose-600">{deleteError}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={isDeleting} onClick={closeDeleteConfirm}>
                {dict.common.cancel}
              </Button>
              <Button type="button" variant="danger" size="sm" isLoading={isDeleting} onClick={confirmDelete}>
                {isDeleting ? dict.patients.deleting : dict.patients.confirmDelete}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={null}>
      <PatientsPageContent />
    </Suspense>
  );
}
