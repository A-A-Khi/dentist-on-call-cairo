"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { fetchPatients } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { Patient } from "../../../lib/clinical-data";

function PatientsPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchPatients(searchQuery);
        if (isMounted) {
          setPatients(data);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    const timeoutId = setTimeout(load, 200);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  const filteredPatients = patients.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "ALL";

  return (
    <AppShell locale={locale}>
      <PageHeader
        title={dict.patients.title}
        subtitle={dict.patients.subtitle}
        actions={
          <Link href={`/${locale}/patients/new`} className="btn-gold">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>+ {dict.patients.addPatient}</span>
          </Link>
        }
      />

      {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 glass-card rounded-2xl p-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={dict.patients.searchPlaceholder}
              className="w-full glass rounded-xl py-2 ps-9 pe-3 text-xs text-primary placeholder:text-muted focus:border-[#caa95a] focus:outline-none"
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none w-full sm:w-auto"
            >
              <option value="ALL">{dict.patients.filterStatus}</option>
              <option value="Active">Active</option>
              <option value="In Treatment">In Treatment</option>
              <option value="Follow-up">Follow-up</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-secondary">
            {locale === "ar" ? "جاري تحميل سجلات المرضى..." : "Loading patient records..."}
          </div>
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
          <>
            {/* Desktop Data Table */}
            <div className="hidden md:block overflow-hidden glass-card rounded-2xl">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="glass-table-header text-secondary">
                  <tr>
                    <th className="px-4 py-3.5 font-medium">{dict.patients.table.code}</th>
                    <th className="px-4 py-3.5 font-medium">{dict.patients.table.name}</th>
                    <th className="px-4 py-3.5 font-medium">{dict.patients.table.ageGender}</th>
                    <th className="px-4 py-3.5 font-medium">{dict.patients.table.phone}</th>
                    <th className="px-4 py-3.5 font-medium">{dict.patients.table.assignedDoctor}</th>
                    <th className="px-4 py-3.5 font-medium">{dict.patients.table.lastVisit}</th>
                    <th className="px-4 py-3.5 font-medium">{dict.patients.table.status}</th>
                    <th className="px-4 py-3.5 font-medium text-end">{dict.patients.table.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-primary">
                  {filteredPatients.map((p) => (
                    <tr key={p.id} className="glass-hover transition-colors">
                      <td className="px-4 py-3.5 font-mono text-gold font-medium">{p.code}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-primary">{p.fullName}</div>
                        {p.medicalAlerts && p.medicalAlerts.length > 0 && (
                          <span className="inline-block mt-0.5 text-[10px] text-amber-400 font-medium">
                            ⚠ {p.medicalAlerts[0]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-secondary">
                        {p.age} {locale === "ar" ? "سنة" : "y/o"} • {p.gender}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-secondary">{p.phone}</td>
                      <td className="px-4 py-3.5 text-primary">{p.assignedDoctor}</td>
                      <td className="px-4 py-3.5 text-secondary">{p.lastVisit}</td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant={
                            p.status === "In Treatment"
                              ? "gold"
                              : p.status === "Active"
                              ? "green"
                              : "blue"
                          }
                          size="sm"
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-end">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/${locale}/patients/${p.code}/visit/new`}
                            className="rounded-lg bg-[#caa95a]/15 border border-[#caa95a]/30 px-2.5 py-1 text-[11px] font-medium text-gold hover:bg-[#caa95a]/25 transition-colors"
                          >
                            {dict.patients.table.recordVisit}
                          </Link>
                          <Link
                            href={`/${locale}/patients/${p.code}`}
                            className="rounded-lg glass px-2.5 py-1 text-[11px] font-medium text-secondary hover:text-primary transition-colors"
                          >
                            {dict.patients.table.viewChart}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Card List */}
            <div className="md:hidden space-y-3">
              {filteredPatients.map((p) => (
                <div
                  key={p.id}
                  className="glass-card rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-xs font-semibold text-gold">{p.code}</span>
                      <h3 className="text-sm font-bold text-primary mt-0.5">{p.fullName}</h3>
                      <p className="text-xs text-secondary">
                        {p.age} {locale === "ar" ? "سنة" : "y/o"} • {p.gender} • {p.phone}
                      </p>
                    </div>
                    <Badge
                      variant={p.status === "In Treatment" ? "gold" : "green"}
                      size="sm"
                    >
                      {p.status}
                    </Badge>
                  </div>

                  {p.medicalAlerts && p.medicalAlerts.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
                      ⚠ {p.medicalAlerts.join(" • ")}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t glass-divider/60 text-xs text-secondary">
                    <span>{dict.patients.table.assignedDoctor}: <strong className="text-primary">{p.assignedDoctor}</strong></span>
                    <span>{dict.patients.table.lastVisit}: {p.lastVisit}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Link
                      href={`/${locale}/patients/${p.code}`}
                      className="w-full text-center glass rounded-xl py-2 text-xs font-medium text-primary hover:bg-slate-100 transition-colors"
                    >
                      {dict.patients.table.viewChart}
                    </Link>
                    <Link
                      href={`/${locale}/patients/${p.code}/visit/new`}
                      className="w-full text-center rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] py-2 text-xs font-semibold text-on-gold hover:opacity-95 transition-opacity"
                    >
                      {dict.patients.table.recordVisit}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
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
