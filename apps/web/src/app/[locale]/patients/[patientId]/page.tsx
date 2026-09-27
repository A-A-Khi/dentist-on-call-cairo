"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../../components/layout/AppShell";
import { Breadcrumb } from "../../../../components/layout/Breadcrumb";
import { Badge } from "../../../../components/ui/Badge";
import { Button, ButtonLink } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal";
import { Tabs } from "../../../../components/ui/Tabs";
import { getDictionarySync } from "../../../../i18n/get-dictionary";
import {
  deletePatientRecord,
  fetchPatientById,
  fetchPatientVisits,
  recordVisitPayment,
  updateClinicalVisit,
} from "../../../../lib/clinical-api";
import type { Patient, Visit } from "../../../../lib/clinical-data";
import { getStoredSessionUser } from "../../../../lib/session";

function visitMoney(v: Visit) {
  const total =
    v.totalCostEGP ??
    v.procedures.reduce((sum, p) => sum + (typeof p.costEGP === "number" ? p.costEGP : 0), 0);
  const paid = v.paidAmountEGP ?? 0;
  const remaining = v.remainingEGP ?? Math.max(total - paid, 0);
  return { total, paid, remaining };
}

export default function PatientProfilePage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const t = dict.patientProfile;
  const patientId = (params?.patientId as string) || "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [payingVisitId, setPayingVisitId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"add" | "edit">("add");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isAdmin, setIsAdmin] = useState(
    () => (getStoredSessionUser()?.role ?? "ADMIN") === "ADMIN"
  );
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setIsAdmin((getStoredSessionUser()?.role ?? "ADMIN") === "ADMIN");
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const [p, v] = await Promise.all([
          fetchPatientById(patientId),
          fetchPatientVisits(patientId),
        ]);
        if (!isMounted) return;
        setPatient(p);
        setVisits(v);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    if (patientId) loadData();
    return () => {
      isMounted = false;
    };
  }, [patientId]);

  const latestVisit = useMemo(() => {
    if (visits.length === 0) return null;
    return [...visits].sort((a, b) => {
      const aKey = `${a.date} ${a.time}`;
      const bKey = `${b.date} ${b.time}`;
      return bKey.localeCompare(aKey);
    })[0];
  }, [visits]);

  const handleRecordPayment = async (visit: Visit) => {
    const { remaining } = visitMoney(visit);
    const amount = parseInt(paymentAmount, 10);
    if (!amount || amount <= 0 || amount > remaining) {
      setPaymentError(t.paymentError);
      return;
    }
    setIsPaying(true);
    setPaymentError(null);
    try {
      const updated = await recordVisitPayment(visit.id, amount);
      setVisits((prev) =>
        prev.map((v) =>
          v.id === visit.id
            ? {
                ...v,
                totalCostEGP: updated.totalCostEGP,
                paidAmountEGP: updated.paidAmountEGP,
                remainingEGP: updated.remainingEGP,
                revenueShare: updated.revenueShare ?? v.revenueShare,
              }
            : v
        )
      );
      setPayingVisitId(null);
      setPaymentAmount("");
    } catch {
      setPaymentError(t.paymentError);
    } finally {
      setIsPaying(false);
    }
  };

  const handleSetPaidAmount = async (visit: Visit) => {
    const { total } = visitMoney(visit);
    const amount = parseInt(paymentAmount, 10);
    if (Number.isNaN(amount) || amount < 0 || amount > total) {
      setPaymentError(t.paidEditError);
      return;
    }
    setIsPaying(true);
    setPaymentError(null);
    try {
      const updated = await updateClinicalVisit(visit.id, { paidEGP: amount });
      setVisits((prev) =>
        prev.map((v) =>
          v.id === visit.id
            ? {
                ...v,
                totalCostEGP: updated.totalCostEGP ?? v.totalCostEGP,
                paidAmountEGP: updated.paidAmountEGP ?? amount,
                remainingEGP: updated.remainingEGP ?? Math.max(total - amount, 0),
                revenueShare: updated.revenueShare ?? v.revenueShare,
              }
            : v
        )
      );
      setPayingVisitId(null);
      setPaymentAmount("");
    } catch (err) {
      setPaymentError(
        err instanceof Error && err.message ? err.message : t.paidEditError
      );
    } finally {
      setIsPaying(false);
    }
  };

  const closePaymentForm = () => {
    setPayingVisitId(null);
    setPaymentAmount("");
    setPaymentError(null);
  };

  async function confirmDeletePatient() {
    if (!patient || !isAdmin) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deletePatientRecord(patient.code);
      router.push(`/${locale}/patients`);
    } catch {
      setDeleteError(t.deleteFailed);
      setIsDeleting(false);
    }
  }

  const tabs = [
    { id: "overview", label: t.tabs.overview },
    { id: "medical", label: t.tabs.medicalHistory },
    { id: "dental", label: t.tabs.dentalHistory },
    { id: "visits", label: t.tabs.visits, count: visits.length },
    { id: "attachments", label: t.tabs.attachments, count: 0 },
  ];

  if (isLoading) {
    return (
      <AppShell locale={locale}>
        <div className="py-16 text-center text-xs text-secondary">{t.loading}</div>
      </AppShell>
    );
  }

  if (!patient) {
    return (
      <AppShell locale={locale}>
        <Breadcrumb
          items={[
            { label: dict.nav.patients, href: `/${locale}/patients` },
            { label: patientId || "—" },
          ]}
        />
        <div className="glass-card rounded-2xl border-dashed p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-primary">{t.notFound}</p>
          <p className="text-xs text-secondary">{t.notFoundDescription}</p>
          <ButtonLink href={`/${locale}/patients`} variant="primary" size="sm" className="mt-2">
            {dict.nav.patients}
          </ButtonLink>
        </div>
      </AppShell>
    );
  }

  const displayValue = (value?: string | null, empty = "—") => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : empty;
  };

  return (
    <AppShell locale={locale}>
      <Breadcrumb
        items={[
          { label: dict.nav.patients, href: `/${locale}/patients` },
          { label: patient.code },
        ]}
      />

      <div className="glass-card rounded-2xl p-5 sm:p-6 shadow-xl shadow-black/40">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#dfbf70] via-[#caa95a] to-[#99782a] text-lg font-bold text-on-gold shadow-md shadow-[#caa95a]/20">
              {patient.fullName
                .split(" ")
                .filter(Boolean)
                .map((n: string) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase() || "—"}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-primary sm:text-2xl">
                  {patient.fullName}
                </h1>
                <span className="font-mono text-xs font-semibold text-gold bg-[#caa95a]/10 px-2 py-0.5 rounded-lg border border-[#caa95a]/20">
                  {patient.code}
                </span>
                <Badge
                  variant={patient.status === "In Treatment" ? "gold" : "green"}
                  size="sm"
                >
                  {patient.status}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary">
                <span>
                  {patient.age} {t.yearsOld}
                  {patient.dob ? ` (${patient.dob})` : ""}
                </span>
                <span>•</span>
                <span>{patient.gender}</span>
                {patient.phone && patient.phone !== "—" && (
                  <>
                    <span>•</span>
                    <span className="font-mono">{patient.phone}</span>
                  </>
                )}
                {patient.assignedDoctor && (
                  <>
                    <span>•</span>
                    <span>
                      {dict.patients.table.assignedDoctor}:{" "}
                      <strong className="text-primary">{patient.assignedDoctor}</strong>
                    </span>
                  </>
                )}
                {patient.sourceStream && (
                  <>
                    <span>•</span>
                    <span>
                      {t.stream}:{" "}
                      <strong className="text-primary">{patient.sourceStream}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 md:justify-end">
            <ButtonLink
              href={`/${locale}/calendar?bookPatient=${encodeURIComponent(patient.code)}`}
              variant="primary"
              size="sm"
              className="whitespace-nowrap"
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{t.scheduleAppointment}</span>
            </ButtonLink>

            {isAdmin && (
              <>
                <ButtonLink
                  href={`/${locale}/patients/${patient.code}/edit`}
                  variant="secondary"
                  size="sm"
                  className="whitespace-nowrap"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>{t.editDemographics}</span>
                </ButtonLink>
                <Button
                  type="button"
                  variant="danger-soft"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => {
                    setDeleteError("");
                    setConfirmDeleteOpen(true);
                  }}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>{t.deletePatient}</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {patient.medicalAlerts.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t glass-divider/60">
            <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {t.medicalAlerts}:
            </span>
            {patient.medicalAlerts.map((alert: string, idx: number) => (
              <span
                key={idx}
                className="rounded-lg border border-rose-500/40 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
              >
                {alert}
              </span>
            ))}
          </div>
        )}
      </div>

      <Tabs items={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <span className="text-xs font-semibold text-gold uppercase tracking-wider">
                {t.nextAppointmentCard}
              </span>
              {patient.nextAppointment ? (
                <p className="text-base font-bold text-primary">{patient.nextAppointment}</p>
              ) : (
                <p className="text-xs text-secondary">{t.noUpcomingAppointment}</p>
              )}
            </div>

            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gold uppercase tracking-wider">
                  {t.lastVisitCard}
                </span>
                {latestVisit && (
                  <span className="text-xs text-secondary">
                    {latestVisit.date}
                    {latestVisit.time ? ` • ${latestVisit.time}` : ""}
                  </span>
                )}
              </div>
              {latestVisit ? (
                <div>
                  <p className="text-xs font-bold text-primary">
                    {displayValue(latestVisit.diagnosis, t.noDiagnosis)}
                  </p>
                  {latestVisit.chiefComplaint && (
                    <p className="text-xs text-secondary mt-1 line-clamp-2">
                      {latestVisit.chiefComplaint}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-secondary">{t.noVisitsYet}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 glass-card rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-primary">{t.demographicsTitle}</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted block">{t.homeAddress}</span>
                  <span className="text-primary font-medium">{displayValue(patient.address)}</span>
                </div>
                <div>
                  <span className="text-muted block">{t.email}</span>
                  <span className="text-primary font-medium">{displayValue(patient.email)}</span>
                </div>
                <div>
                  <span className="text-muted block">{t.whatsapp}</span>
                  <span className="text-primary font-medium font-mono">
                    {displayValue(patient.whatsappPhone)}
                  </span>
                </div>
                <div>
                  <span className="text-muted block">{t.smokingStatus}</span>
                  <span className="text-primary font-medium">
                    {displayValue(patient.medicalHistory?.smokingStatus)}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold text-primary">{t.emergencyTitle}</h3>
              <div className="text-xs space-y-1">
                <p className="font-medium text-primary">
                  {displayValue(patient.emergencyContact?.name)}
                </p>
                <p className="text-secondary">
                  {displayValue(patient.emergencyContact?.relationship)}
                </p>
                <p className="font-mono text-gold">
                  {displayValue(patient.emergencyContact?.phone)}
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <h3 className="text-sm font-semibold text-primary">{t.timelineTitle}</h3>

            {visits.length > 0 ? (
              <div className="relative ps-6 space-y-6 before:absolute before:start-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {[...visits]
                  .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
                  .map((v) => (
                    <div key={v.id} className="relative">
                      <span className="absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#caa95a]" />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-primary">{t.clinicalVisit}</span>
                          <span className="text-muted">•</span>
                          <span className="text-secondary">
                            {v.date}
                            {v.time ? ` ${v.time}` : ""}
                          </span>
                          {v.doctorName && (
                            <span className="text-muted">
                              {t.byDoctor} {v.doctorName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-secondary">
                          {displayValue(v.diagnosis || v.chiefComplaint, t.noDetails)}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-secondary">{t.timelineEmpty}</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "medical" && (
        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-6">
          <h3 className="text-sm font-semibold text-primary">{t.medicalHistoryTitle}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded-xl border border-rose-500/30 bg-rose-50 p-4 space-y-1.5">
              <span className="font-bold text-rose-700 block">{t.allergies}</span>
              <p className="text-rose-700">
                {displayValue(patient.medicalHistory?.allergies, t.noneReported)}
              </p>
            </div>

            <div className="glass rounded-xl p-4 space-y-1.5">
              <span className="font-bold text-gold block">{t.conditions}</span>
              <p className="text-primary">
                {patient.medicalHistory?.conditions?.length
                  ? patient.medicalHistory.conditions.join(", ")
                  : t.noneReported}
              </p>
            </div>

            <div className="glass rounded-xl p-4 space-y-1.5">
              <span className="font-bold text-gold block">{t.medications}</span>
              <p className="text-primary">
                {displayValue(patient.medicalHistory?.medications, t.noneReported)}
              </p>
            </div>

            <div className="glass rounded-xl p-4 space-y-1.5">
              <span className="font-bold text-gold block">{t.surgeries}</span>
              <p className="text-primary">
                {displayValue(patient.medicalHistory?.surgeries, t.noneReported)}
              </p>
            </div>
          </div>

          {patient.medicalHistory?.additionalNotes?.trim() && (
            <div className="glass rounded-xl p-4 space-y-1.5 text-xs">
              <span className="font-bold text-secondary block">{t.clinicalNotesLabel}</span>
              <p className="text-primary">{patient.medicalHistory.additionalNotes}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "dental" && (
        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-6">
          <h3 className="text-sm font-semibold text-primary">{t.dentalHistoryTitle}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="glass rounded-xl p-4 space-y-1.5">
              <span className="font-bold text-gold block">{t.previousTreatments}</span>
              <p className="text-primary">
                {displayValue(patient.dentalHistory?.previousTreatment, t.noneReported)}
              </p>
            </div>
            <div className="glass rounded-xl p-4 space-y-1.5">
              <span className="font-bold text-gold block">{t.extractions}</span>
              <p className="text-primary">
                {displayValue(patient.dentalHistory?.extractions, t.noneReported)}
              </p>
            </div>
            <div className="glass rounded-xl p-4 space-y-1.5">
              <span className="font-bold text-gold block">{t.rootCanals}</span>
              <p className="text-primary">
                {displayValue(patient.dentalHistory?.rootCanals, t.noneReported)}
              </p>
            </div>
            <div className="glass rounded-xl p-4 space-y-1.5">
              <span className="font-bold text-gold block">{t.gumStatus}</span>
              <p className="text-primary">
                {displayValue(patient.dentalHistory?.gumProblems, t.noneReported)}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "visits" && (
        <div className="space-y-4">
          {visits.length > 0 ? (
            visits.map((v) => (
              <div
                key={v.id}
                className="glass-card rounded-2xl p-5 sm:p-6 space-y-4 shadow-md"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b glass-divider/60 gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-sm text-primary">{v.date}</span>
                    {v.time && <span className="text-xs text-secondary font-mono">{v.time}</span>}
                    <Badge variant="green" size="sm">{v.status}</Badge>
                    <Badge variant="gold" size="sm">
                      {t.visitSource}: {v.sourceStream || "Dentist on Call"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {v.doctorName && (
                      <span className="text-xs text-gold font-medium whitespace-nowrap">
                        {t.doctor}: {v.doctorName}
                      </span>
                    )}
                    {isAdmin && (
                      <ButtonLink
                        href={`/${locale}/patients/${patient.code}/visit/${v.id}/edit`}
                        variant="secondary"
                        size="sm"
                        className="whitespace-nowrap"
                      >
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>{t.editVisit}</span>
                      </ButtonLink>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-secondary block">{t.chiefComplaint}</span>
                    <p className="text-primary mt-0.5">{displayValue(v.chiefComplaint)}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-secondary block">{t.diagnosis}</span>
                    <p className="text-primary mt-0.5">{displayValue(v.diagnosis)}</p>
                  </div>
                </div>

                {v.procedures.length > 0 && (
                  <div className="glass rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gold block">{t.procedures}</span>
                      {isAdmin ? (
                        <span className="font-mono text-xs font-bold text-gold">
                          {visitMoney(v).total.toLocaleString()} {t.currency}
                        </span>
                      ) : null}
                    </div>
                    <div className="divide-y divide-slate-200 text-xs">
                      {v.procedures.map((p) => (
                        <div key={p.id} className="py-2 flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-primary">{p.name}</span>
                            {p.toothNumber && (
                              <span className="ms-2 font-mono text-[11px] text-gold bg-[#caa95a]/10 px-1.5 py-0.5 rounded border border-[#caa95a]/20">
                                {t.tooth} {p.toothNumber}
                              </span>
                            )}
                            {p.notes && <p className="text-[11px] text-secondary mt-0.5">{p.notes}</p>}
                          </div>
                          {isAdmin && typeof p.costEGP === "number" ? (
                            <span className="font-mono font-bold text-emerald-600 shrink-0 ms-4">
                              {p.costEGP.toLocaleString()} {t.currency}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {isAdmin ? (() => {
                      const money = visitMoney(v);
                      return (
                        <div className="pt-2 border-t glass-divider/60 space-y-2">
                          <div className="grid grid-cols-3 gap-2 text-[11px]">
                            <div>
                              <span className="text-muted block">{t.totalCost}</span>
                              <span className="font-mono font-bold text-primary">
                                {money.total.toLocaleString()} {t.currency}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block">{t.amountPaid}</span>
                              <span className="font-mono font-bold text-emerald-600">
                                {money.paid.toLocaleString()} {t.currency}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block">{t.remainingBalance}</span>
                              <span
                                className={`font-mono font-bold ${
                                  money.remaining > 0 ? "text-rose-500" : "text-emerald-600"
                                }`}
                              >
                                {money.remaining.toLocaleString()} {t.currency}
                              </span>
                            </div>
                          </div>

                          {payingVisitId === v.id ? (
                            <div className="space-y-2">
                              <input
                                type="number"
                                min={paymentMode === "edit" ? 0 : 1}
                                max={paymentMode === "edit" ? money.total : money.remaining}
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                placeholder={paymentMode === "edit" ? t.editPaid : t.paymentAmount}
                                className="w-full glass rounded-xl px-3 py-2 text-xs font-mono focus:border-[#caa95a] focus:outline-none"
                              />
                              {paymentError && (
                                <p className="text-[11px] text-rose-600">{paymentError}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  className="whitespace-nowrap"
                                  disabled={isPaying}
                                  onClick={() =>
                                    void (paymentMode === "edit"
                                      ? handleSetPaidAmount(v)
                                      : handleRecordPayment(v))
                                  }
                                >
                                  {paymentMode === "edit" ? t.savePaid : t.confirmPayment}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="whitespace-nowrap"
                                  onClick={closePaymentForm}
                                >
                                  {t.cancel}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {money.remaining > 0 ? (
                                <Button
                                  type="button"
                                  variant="danger-soft"
                                  size="sm"
                                  className="whitespace-nowrap"
                                  onClick={() => {
                                    setPayingVisitId(v.id);
                                    setPaymentMode("add");
                                    setPaymentAmount(String(money.remaining));
                                    setPaymentError(null);
                                  }}
                                >
                                  {t.recordPayment}
                                </Button>
                              ) : money.total > 0 ? (
                                <Badge variant="green" size="sm">
                                  {t.fullyPaid}
                                </Badge>
                              ) : null}
                              {(money.total > 0 || money.paid > 0) && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="whitespace-nowrap"
                                  onClick={() => {
                                    setPayingVisitId(v.id);
                                    setPaymentMode("edit");
                                    setPaymentAmount(String(money.paid));
                                    setPaymentError(null);
                                  }}
                                >
                                  {t.editPaid}
                                </Button>
                              )}
                            </div>
                          )}

                          {v.revenueShare && money.paid > 0 ? (
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-secondary">
                                  {t.revenueShare}
                                </span>
                                <span className="text-[10px] text-muted">{t.shareOfPaid}</span>
                              </div>
                              {(v.caseCostEGP ?? v.revenueShare.caseCostEGP ?? 0) > 0 ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] border-b border-slate-200/70 pb-2">
                                  <span className="text-muted">
                                    {t.caseCosts}
                                    {(v.caseCostNote || v.revenueShare.caseCostNote)
                                      ? ` — ${v.caseCostNote || v.revenueShare.caseCostNote}`
                                      : ""}
                                  </span>
                                  <span className="font-mono font-semibold text-rose-600">
                                    −{(v.caseCostEGP ?? v.revenueShare.caseCostEGP ?? 0).toLocaleString()}{" "}
                                    {t.currency}
                                  </span>
                                  <span className="w-full text-muted">
                                    {t.splitBasis}:{" "}
                                    <span className="font-mono font-semibold text-primary">
                                      {v.revenueShare.basisEGP.toLocaleString()} {t.currency}
                                    </span>
                                  </span>
                                </div>
                              ) : null}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                                <div>
                                  <span className="text-muted block">
                                    {t.shareDoctor} ({v.revenueShare.doctorPercent}%)
                                  </span>
                                  <span className="font-mono font-bold text-primary">
                                    {v.revenueShare.doctorEGP.toLocaleString()} {t.currency}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted block">
                                    {t.shareAssistant} ({v.revenueShare.assistantPercent}%)
                                  </span>
                                  <span className="font-mono font-bold text-primary">
                                    {v.revenueShare.assistantEGP.toLocaleString()} {t.currency}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted block">
                                    {t.shareReferral} ({v.revenueShare.referralPercent}%)
                                  </span>
                                  <span className="font-mono font-bold text-primary">
                                    {v.revenueShare.referralEGP.toLocaleString()} {t.currency}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted block">
                                    {t.shareOrg} ({v.revenueShare.orgPercent}%)
                                  </span>
                                  <span className="font-mono font-bold text-emerald-700">
                                    {v.revenueShare.orgEGP.toLocaleString()} {t.currency}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })() : null}
                  </div>
                )}

                {v.doctorNotes?.trim() && (
                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-secondary block">{t.clinicalNotes}</span>
                    <p className="text-primary">{v.doctorNotes}</p>
                  </div>
                )}

                {v.prescriptions && v.prescriptions.length > 0 && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-50 p-3 text-xs space-y-1">
                    <span className="font-bold text-blue-700 block">{t.prescriptions}</span>
                    <ul className="list-disc list-inside text-blue-800 space-y-0.5">
                      {v.prescriptions.map((rx: string, i: number) => (
                        <li key={i}>{rx}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="glass-card rounded-2xl border-dashed p-12 text-center">
              <p className="text-sm font-semibold text-primary">{t.noVisitsTitle}</p>
              <p className="text-xs text-secondary mt-1 max-w-sm mx-auto">
                {t.noVisitsDescription}
              </p>
              <div className="mt-4">
                <ButtonLink
                  href={`/${locale}/calendar?bookPatient=${encodeURIComponent(patient.code)}`}
                  variant="primary"
                  size="sm"
                >
                  {t.scheduleAppointment}
                </ButtonLink>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "attachments" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary">{t.attachmentsTitle}</h3>
          <div className="glass-card rounded-2xl border-dashed p-12 text-center">
            <p className="text-sm font-semibold text-primary">{t.noAttachmentsTitle}</p>
            <p className="text-xs text-secondary mt-1">{t.noAttachmentsDescription}</p>
          </div>
        </div>
      )}

      <Modal
        isOpen={confirmDeleteOpen}
        onClose={() => {
          if (isDeleting) return;
          setConfirmDeleteOpen(false);
          setDeleteError("");
        }}
        title={t.confirmDeleteTitle}
        description={t.confirmDeleteBody}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-slate-50/80 px-4 py-3">
            <p className="font-semibold text-sm text-primary">{patient.fullName}</p>
            <p className="mt-0.5 font-mono text-[11px] text-gold">{patient.code}</p>
          </div>
          {deleteError ? <p className="text-xs text-rose-600">{deleteError}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isDeleting}
              onClick={() => {
                setConfirmDeleteOpen(false);
                setDeleteError("");
              }}
            >
              {dict.common.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={isDeleting}
              onClick={confirmDeletePatient}
            >
              {isDeleting ? t.deleting : t.confirmDelete}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
