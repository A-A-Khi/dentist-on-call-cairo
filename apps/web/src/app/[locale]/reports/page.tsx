"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Button } from "../../../components/ui/Button";
import { SkeletonCard, SkeletonTable } from "../../../components/ui/Skeleton";
import { fetchReportsAnalytics } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { ReportAnalytics } from "../../../lib/clinical-data";
import { getStoredSessionUser } from "../../../lib/session";
import { getDashboardHref } from "../../../components/layout/nav-config";

type Preset = "week" | "month" | "quarter" | "year" | "custom";

function money(n: number, currency: string) {
  return `${(n || 0).toLocaleString()} ${currency}`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const v = String(cell ?? "");
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  useEffect(() => {
    const role = getStoredSessionUser()?.role ?? "DOCTOR";
    if (role !== "ADMIN") {
      router.replace(getDashboardHref(locale, "DOCTOR"));
    }
  }, [locale, router]);
  const isAr = locale === "ar";
  const currency = isAr ? "ج.م" : "EGP";
  const t = dict.reports;

  const [preset, setPreset] = useState<Preset>("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [streamId, setStreamId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [data, setData] = useState<ReportAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchReportsAnalytics({
          preset: preset === "custom" ? "custom" : preset,
          from: preset === "custom" ? dateFrom || undefined : undefined,
          to: preset === "custom" ? dateTo || undefined : undefined,
          streamId: streamId || undefined,
          doctorId: doctorId || undefined,
        });
        if (cancelled) return;
        if (!result) {
          setError(t.loadError);
          setData(null);
        } else {
          setData(result);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [preset, dateFrom, dateTo, streamId, doctorId, t.loadError]);

  const sourceLabel = (s: { nameEn: string; nameAr?: string | null }) =>
    isAr && s.nameAr ? s.nameAr : s.nameEn;

  const maxDayVisits = useMemo(
    () => Math.max(1, ...(data?.byDay.map((d) => d.visits) || [1])),
    [data]
  );
  const maxProcRevenue = useMemo(
    () => Math.max(1, ...(data?.topProcedures.map((p) => p.revenueEGP) || [1])),
    [data]
  );

  const handleExportCsv = () => {
    if (!data) return;
    const cases = data.cases ?? [];
    const rows: string[][] = [
      ["Money flow", "Amount EGP"],
      ["Collected", String(data.totals.grossCollectedEGP)],
      ["Case costs", String(data.totals.caseCostsEGP ?? 0)],
      ["Amount after costs", String(data.totals.splitBasisEGP ?? 0)],
      ["Doctor share", String(data.totals.doctorShareEGP)],
      ["Assistant share", String(data.totals.assistantShareEGP)],
      ["Referrer share", String(data.totals.referralShareEGP)],
      ["Dentist on Call", String(data.totals.clinicShareEGP)],
      [],
      [
        "Case",
        "Date",
        "Patient",
        "Paid EGP",
        "Case cost EGP",
        "Cost note",
        "After costs EGP",
        "Doctor EGP",
        "Assistant EGP",
        "Referrer EGP",
        "Clinic EGP",
      ],
      ...cases.map((c) => [
        "Case",
        c.occurredAt.slice(0, 10),
        c.patientName,
        String(c.paidEGP),
        String(c.caseCostEGP),
        c.caseCostNote || "",
        String(c.splitBasisEGP),
        String(c.doctorEGP),
        String(c.assistantEGP),
        String(c.referralEGP),
        String(c.clinicEGP),
      ]),
      [
        "Total",
        "",
        "",
        String(data.totals.grossCollectedEGP),
        String(data.totals.caseCostsEGP ?? 0),
        "",
        String(data.totals.splitBasisEGP ?? 0),
        String(data.totals.doctorShareEGP),
        String(data.totals.assistantShareEGP),
        String(data.totals.referralShareEGP),
        String(data.totals.clinicShareEGP),
      ],
      [],
      ["Section", "Label", "Visits", "Percent", "Paid EGP", "Clinic Share EGP", "Referral Share EGP"],
      ...data.bySource.map((s) => [
        "Source",
        sourceLabel(s),
        String(s.visitCount),
        `${s.percentOfVisits}%`,
        String(s.paidEGP),
        String(s.clinicShareEGP),
        String(s.referralShareEGP),
      ]),
      [],
      ["Procedure", "Name", "Count", "Revenue %", "Revenue EGP"],
      ...data.topProcedures.map((p) => [
        "Procedure",
        p.name,
        String(p.count),
        `${p.percentOfRevenue}%`,
        String(p.revenueEGP),
      ]),
      [],
      ["Day", "Date", "Visits", "Paid EGP", "Clinic Share EGP"],
      ...data.byDay.map((d) => [
        "Day",
        d.date,
        String(d.visits),
        String(d.paidEGP),
        String(d.clinicShareEGP),
      ]),
    ];
    downloadCsv(`dentist-on-call-report-${data.period.from}_${data.period.to}.csv`, rows);
  };

  const presets: { id: Preset; label: string }[] = [
    { id: "week", label: t.periodWeek },
    { id: "month", label: t.periodMonth },
    { id: "quarter", label: t.periodQuarter },
    { id: "year", label: t.periodYear },
    { id: "custom", label: t.periodCustom },
  ];

  return (
    <AppShell locale={locale}>
      <div className="space-y-6">
        <PageHeader
          title={t.title}
          subtitle={t.subtitle}
          actions={
            <Button type="button" variant="secondary" size="sm" onClick={handleExportCsv} disabled={!data}>
              {t.exportCSV}
            </Button>
          }
        />

        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-secondary">{t.dateRange}</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {presets.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="xs"
                  variant={preset === p.id ? "primary" : "ghost"}
                  onClick={() => setPreset(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {preset === "custom" && (
              <>
                <div>
                  <label className="block text-[10px] text-muted mb-1">{t.from}</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted mb-1">{t.to}</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-[10px] text-muted mb-1">{t.filterSource}</label>
              <select
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className="w-full glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
              >
                <option value="">{t.allSources}</option>
                {(data?.filterOptions.streams || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {sourceLabel(s)} ({s.referralPercent}%)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-1">{t.filterDoctor}</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
              >
                <option value="">{t.allDoctors}</option>
                {(data?.filterOptions.doctors || []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {data && (
            <p className="text-[11px] text-muted">
              {t.showingPeriod}: <strong className="text-secondary">{data.period.from}</strong>
              {" → "}
              <strong className="text-secondary">{data.period.to}</strong>
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4" role="status" aria-label={t.loading}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonTable rows={5} />
          </div>
        ) : error ? (
          <div className="glass-card rounded-2xl p-8 text-center text-sm text-rose-600">{error}</div>
        ) : !data ? (
          <div className="glass-card rounded-2xl p-8 text-center text-xs text-muted">{t.empty}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="glass-card rounded-2xl p-4 space-y-1">
                <span className="text-[11px] text-secondary">{t.kpiVisits}</span>
                <span className="block text-2xl font-mono font-bold text-primary">
                  {data.totals.visits}
                </span>
                <span className="text-[10px] text-muted">
                  {data.totals.patients} {t.uniquePatients}
                </span>
              </div>
              <div className="glass-card rounded-2xl p-4 space-y-1">
                <span className="text-[11px] text-secondary">{t.kpiCollected}</span>
                <span className="block text-xl font-mono font-bold text-gold">
                  {money(data.totals.grossCollectedEGP, currency)}
                </span>
                <span className="text-[10px] text-muted">
                  {t.collectionRate}: {data.totals.collectionRatePercent}%
                </span>
              </div>
              <div className="glass-card rounded-2xl p-4 space-y-1">
                <span className="text-[11px] text-secondary">{t.kpiCaseCosts}</span>
                <span className="block text-xl font-mono font-bold text-rose-500">
                  {money(data.totals.caseCostsEGP ?? 0, currency)}
                </span>
                <span className="text-[10px] text-muted">
                  {t.rowAfterCosts}: {money(data.totals.splitBasisEGP ?? 0, currency)}
                </span>
              </div>
              <div className="glass-card rounded-2xl p-4 space-y-1">
                <span className="text-[11px] text-secondary">{t.kpiClinic}</span>
                <span className="block text-xl font-mono font-bold text-emerald-600">
                  {money(data.totals.clinicShareEGP, currency)}
                </span>
                <span className="text-[10px] text-muted">
                  {t.afterTeamReferrer}
                </span>
              </div>
              <div className="glass-card rounded-2xl p-4 space-y-1 col-span-2 lg:col-span-1">
                <span className="text-[11px] text-secondary">{t.kpiNewPatients}</span>
                <span className="block text-2xl font-mono font-bold text-primary">
                  {data.totals.newPatients}
                </span>
                <span className="text-[10px] text-muted">
                  {t.avgCase}: {money(data.totals.avgPaidPerVisitEGP, currency)}
                </span>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-primary">{t.moneyFlow}</h3>
                <p className="text-[11px] text-muted mt-0.5">{t.moneyFlowHelp}</p>
              </div>
              <div className="space-y-0 text-xs divide-y divide-[color-mix(in_srgb,var(--foreground)_8%,transparent)]">
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-secondary">{t.rowCollected}</span>
                  <span className="font-mono font-bold text-gold">
                    {money(data.totals.grossCollectedEGP, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-secondary">{t.rowCaseCosts}</span>
                  <span className="font-mono font-bold text-rose-500">
                    −{money(data.totals.caseCostsEGP ?? 0, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-semibold text-primary">{t.rowAfterCosts}</span>
                  <span className="font-mono font-bold text-primary">
                    {money(data.totals.splitBasisEGP ?? 0, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5 ps-3 sm:ps-5">
                  <span className="text-secondary">
                    {t.shareDoctor} (35%)
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {money(data.totals.doctorShareEGP, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5 ps-3 sm:ps-5">
                  <span className="text-secondary">
                    {t.shareAssistant} (15%)
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {money(data.totals.assistantShareEGP, currency)}
                  </span>
                </div>
                {(data.totals.referralShareEGP > 0) && (
                  <div className="flex items-center justify-between gap-3 py-2.5 ps-3 sm:ps-5">
                    <span className="text-secondary">{t.shareReferral}</span>
                    <span className="font-mono font-semibold text-primary">
                      {money(data.totals.referralShareEGP, currency)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 py-2.5 ps-3 sm:ps-5">
                  <span className="font-semibold text-emerald-700">
                    {t.shareClinic}
                  </span>
                  <span className="font-mono font-bold text-emerald-600">
                    {money(data.totals.clinicShareEGP, currency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-primary">{t.caseDeductions}</h3>
                <p className="text-[11px] text-muted mt-0.5">{t.caseDeductionsHelp}</p>
              </div>
              {(data.cases ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-muted">{t.noCaseCosts}</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[720px] text-xs text-start">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-muted border-b border-[color-mix(in_srgb,var(--foreground)_10%,transparent)]">
                          <th className="py-2 pe-3 font-semibold">{t.colDate}</th>
                          <th className="py-2 pe-3 font-semibold">{t.colPatient}</th>
                          <th className="py-2 pe-3 font-semibold text-end">{t.colPaid}</th>
                          <th className="py-2 pe-3 font-semibold text-end">{t.colCost}</th>
                          <th className="py-2 pe-3 font-semibold">{t.colNote}</th>
                          <th className="py-2 pe-3 font-semibold text-end">{t.colAfterCosts}</th>
                          <th className="py-2 pe-3 font-semibold text-end">{t.colDoctor}</th>
                          <th className="py-2 pe-3 font-semibold text-end">{t.colAssistant}</th>
                          <th className="py-2 pe-3 font-semibold text-end">{t.colReferrer}</th>
                          <th className="py-2 font-semibold text-end">{t.colClinic}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.cases ?? []).map((c) => (
                          <tr
                            key={c.visitId}
                            className="border-b border-[color-mix(in_srgb,var(--foreground)_6%,transparent)] last:border-0"
                          >
                            <td className="py-2.5 pe-3 font-mono text-secondary whitespace-nowrap">
                              {c.occurredAt.slice(0, 10)}
                            </td>
                            <td className="py-2.5 pe-3 font-medium text-primary max-w-[140px] truncate">
                              {c.patientName}
                            </td>
                            <td className="py-2.5 pe-3 font-mono text-end text-primary">
                              {c.paidEGP.toLocaleString()}
                            </td>
                            <td className="py-2.5 pe-3 font-mono text-end text-rose-500">
                              {c.caseCostEGP > 0 ? c.caseCostEGP.toLocaleString() : "—"}
                            </td>
                            <td className="py-2.5 pe-3 text-muted max-w-[120px] truncate">
                              {c.caseCostNote || "—"}
                            </td>
                            <td className="py-2.5 pe-3 font-mono text-end text-primary">
                              {c.splitBasisEGP.toLocaleString()}
                            </td>
                            <td className="py-2.5 pe-3 font-mono text-end text-secondary">
                              {c.doctorEGP.toLocaleString()}
                            </td>
                            <td className="py-2.5 pe-3 font-mono text-end text-secondary">
                              {c.assistantEGP.toLocaleString()}
                            </td>
                            <td className="py-2.5 pe-3 font-mono text-end text-secondary">
                              {c.referralEGP > 0 ? c.referralEGP.toLocaleString() : "—"}
                            </td>
                            <td className="py-2.5 font-mono text-end font-semibold text-emerald-600">
                              {c.clinicEGP.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] font-semibold">
                          <td className="py-3 pe-3 text-primary" colSpan={2}>
                            {t.colTotal}
                          </td>
                          <td className="py-3 pe-3 font-mono text-end text-gold">
                            {data.totals.grossCollectedEGP.toLocaleString()}
                          </td>
                          <td className="py-3 pe-3 font-mono text-end text-rose-500">
                            {(data.totals.caseCostsEGP ?? 0).toLocaleString()}
                          </td>
                          <td className="py-3 pe-3" />
                          <td className="py-3 pe-3 font-mono text-end text-primary">
                            {(data.totals.splitBasisEGP ?? 0).toLocaleString()}
                          </td>
                          <td className="py-3 pe-3 font-mono text-end text-primary">
                            {data.totals.doctorShareEGP.toLocaleString()}
                          </td>
                          <td className="py-3 pe-3 font-mono text-end text-primary">
                            {data.totals.assistantShareEGP.toLocaleString()}
                          </td>
                          <td className="py-3 pe-3 font-mono text-end text-primary">
                            {data.totals.referralShareEGP > 0
                              ? data.totals.referralShareEGP.toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-3 font-mono text-end text-emerald-600">
                            {data.totals.clinicShareEGP.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="md:hidden space-y-3">
                    {(data.cases ?? []).map((c) => (
                      <div
                        key={c.visitId}
                        className="rounded-xl glass px-3 py-3 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-primary block truncate">
                              {c.patientName}
                            </span>
                            <span className="font-mono text-[10px] text-muted">
                              {c.occurredAt.slice(0, 10)}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-gold shrink-0">
                            {money(c.paidEGP, currency)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                          <span className="text-muted">{t.colCost}</span>
                          <span className="font-mono text-end text-rose-500">
                            {c.caseCostEGP > 0
                              ? `${c.caseCostEGP.toLocaleString()} ${currency}${
                                  c.caseCostNote ? ` · ${c.caseCostNote}` : ""
                                }`
                              : "—"}
                          </span>
                          <span className="text-muted">{t.colAfterCosts}</span>
                          <span className="font-mono text-end text-primary">
                            {money(c.splitBasisEGP, currency)}
                          </span>
                          <span className="text-muted">
                            {t.colDoctor} {c.doctorPercent}%
                          </span>
                          <span className="font-mono text-end">
                            {money(c.doctorEGP, currency)}
                          </span>
                          <span className="text-muted">
                            {t.colAssistant} {c.assistantPercent}%
                          </span>
                          <span className="font-mono text-end">
                            {money(c.assistantEGP, currency)}
                          </span>
                          {c.referralEGP > 0 && (
                            <>
                              <span className="text-muted">
                                {t.colReferrer} {c.referralPercent}%
                              </span>
                              <span className="font-mono text-end">
                                {money(c.referralEGP, currency)}
                              </span>
                            </>
                          )}
                          <span className="text-muted font-semibold text-emerald-700">
                            {t.colClinic} {c.orgPercent}%
                          </span>
                          <span className="font-mono text-end font-bold text-emerald-600">
                            {money(c.clinicEGP, currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-xl border border-[#caa95a]/30 bg-[color-mix(in_srgb,#caa95a_8%,transparent)] px-3 py-3 space-y-1 text-xs">
                      <span className="font-semibold text-primary block">{t.colTotal}</span>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <span className="text-muted">{t.colPaid}</span>
                        <span className="font-mono text-end text-gold">
                          {money(data.totals.grossCollectedEGP, currency)}
                        </span>
                        <span className="text-muted">{t.colCost}</span>
                        <span className="font-mono text-end text-rose-500">
                          {money(data.totals.caseCostsEGP ?? 0, currency)}
                        </span>
                        <span className="text-muted">{t.colAfterCosts}</span>
                        <span className="font-mono text-end">
                          {money(data.totals.splitBasisEGP ?? 0, currency)}
                        </span>
                        <span className="text-muted">{t.shareDoctor}</span>
                        <span className="font-mono text-end">
                          {money(data.totals.doctorShareEGP, currency)}
                        </span>
                        <span className="text-muted">{t.shareAssistant}</span>
                        <span className="font-mono text-end">
                          {money(data.totals.assistantShareEGP, currency)}
                        </span>
                        <span className="text-muted font-semibold">{t.shareClinic}</span>
                        <span className="font-mono text-end font-bold text-emerald-600">
                          {money(data.totals.clinicShareEGP, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-primary">{t.casesBySource}</h3>
                  <p className="text-[11px] text-muted mt-0.5">{t.casesBySourceHelp}</p>
                </div>
                <div className="text-[11px] text-secondary">
                  <span className="me-3">
                    {t.ownedChannels}:{" "}
                    <strong className="text-primary">{data.insights.ownedChannelVisits}</strong>
                  </span>
                  <span>
                    {t.referrerChannels}:{" "}
                    <strong className="text-primary">{data.insights.referrerChannelVisits}</strong>
                  </span>
                </div>
              </div>

              {data.bySource.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted">{t.noSourceData}</p>
              ) : (
                <div className="space-y-3">
                  {data.bySource.map((s) => (
                    <div key={s.streamId || "unassigned"} className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-semibold text-primary">{sourceLabel(s)}</span>
                          <span className="ms-2 text-muted">
                            {s.isOwnedChannel
                              ? t.ownedTag
                              : `${t.referrerTag} ${s.referralPercent}%`}
                          </span>
                        </div>
                        <div className="text-end shrink-0">
                          <span className="font-mono font-bold text-gold">
                            {s.visitCount} {t.cases} ({s.percentOfVisits}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full glass overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            s.isOwnedChannel
                              ? "bg-gradient-to-r from-[#caa95a] to-[#dfbf70]"
                              : "bg-gradient-to-r from-slate-400 to-slate-500"
                          }`}
                          style={{ width: `${Math.min(100, s.percentOfVisits)}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
                        <span>
                          {t.patients}: {s.patientCount}
                        </span>
                        <span>
                          {t.paid}: {money(s.paidEGP, currency)}
                        </span>
                        <span>
                          {t.clinicShare}: {money(s.clinicShareEGP, currency)}
                        </span>
                        {!s.isOwnedChannel && (
                          <span>
                            {t.referrerShare}: {money(s.referralShareEGP, currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-primary">{t.revenueReport}</h3>
                  {data.insights.peakDay && (
                    <span className="text-[10px] text-muted">
                      {t.peakDay}: {data.insights.peakDay.date} ({data.insights.peakDay.visits})
                    </span>
                  )}
                </div>
                {data.topProcedures.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted">{t.noProcedureData}</p>
                ) : (
                  <div className="space-y-3">
                    {data.topProcedures.map((proc) => (
                      <div key={proc.name} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-primary truncate">{proc.name}</span>
                          <span className="font-mono text-gold shrink-0">
                            {proc.count}× · {money(proc.revenueEGP, currency)} ({proc.percentOfRevenue}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full glass overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#caa95a] to-[#dfbf70] rounded-full"
                            style={{
                              width: `${Math.min(100, (proc.revenueEGP / maxProcRevenue) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-primary">{t.doctorReport}</h3>
                  {data.insights.peakMonth && (
                    <span className="text-[10px] text-muted">
                      {t.peakMonth}: {data.insights.peakMonth.month} ({data.insights.peakMonth.visits})
                    </span>
                  )}
                </div>
                {data.byDoctor.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted">{t.empty}</p>
                ) : (
                  <div className="space-y-3">
                    {data.byDoctor.map((d) => (
                      <div
                        key={d.doctorId}
                        className="flex items-center justify-between gap-3 rounded-xl glass px-3 py-2.5 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-primary block">{d.name}</span>
                          <span className="text-[10px] text-muted">
                            {d.visits} {t.visitsLabel}
                          </span>
                        </div>
                        <div className="text-end">
                          <span className="font-mono font-bold text-gold block">
                            {money(d.paidEGP, currency)}
                          </span>
                          <span className="text-[10px] text-muted">
                            {t.clinicShare}: {money(d.clinicShareEGP, currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-primary">{t.dailyProductivity}</h3>
              {data.byDay.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">{t.empty}</p>
              ) : (
                <div className="space-y-2">
                  {data.byDay.map((d) => (
                    <div key={d.date} className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-3 sm:col-span-2 font-mono text-secondary">{d.date}</span>
                      <div className="col-span-6 sm:col-span-7">
                        <div className="h-2 w-full rounded-full glass overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#caa95a]"
                            style={{ width: `${(d.visits / maxDayVisits) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="col-span-3 sm:col-span-3 text-end font-mono text-primary">
                        {d.visits} · {money(d.paidEGP, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.byMonth.length > 1 && (
              <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
                <h3 className="text-sm font-semibold text-primary">{t.monthlyProductivity}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.byMonth.map((m) => (
                    <div key={m.month} className="rounded-xl glass px-3 py-3 text-xs space-y-1">
                      <span className="font-mono font-semibold text-secondary">{m.month}</span>
                      <span className="block text-lg font-mono font-bold text-primary">
                        {m.visits} {t.visitsLabel}
                      </span>
                      <span className="text-muted">
                        {money(m.paidEGP, currency)} · {t.clinicShare}{" "}
                        {money(m.clinicShareEGP, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.totals.outstandingEGP > 0 && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                {t.outstandingHint}:{" "}
                <strong>{money(data.totals.outstandingEGP, currency)}</strong>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
