"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "../../../../components/layout/AppShell";
import { Breadcrumb } from "../../../../components/layout/Breadcrumb";
import { Badge } from "../../../../components/ui/Badge";
import { Tabs } from "../../../../components/ui/Tabs";
import { getDictionarySync } from "../../../../i18n/get-dictionary";
import { fetchPatientById, fetchPatientVisits, recordVisitPayment } from "../../../../lib/clinical-api";
import type { Patient, Visit } from "../../../../lib/clinical-data";

function visitMoney(v: Visit) {
  const total =
    v.totalCostEGP ?? v.procedures.reduce((sum, p) => sum + (p.costEGP || 0), 0);
  const paid = v.paidAmountEGP ?? total;
  const remaining = v.remainingEGP ?? Math.max(total - paid, 0);
  return { total, paid, remaining };
}

export default function PatientProfilePage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const t = dict.patientProfile;
  const patientId = (params?.patientId as string) || "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [payingVisitId, setPayingVisitId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

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
          <Link href={`/${locale}/patients`} className="inline-flex btn-gold mt-2">
            {dict.nav.patients}
          </Link>
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

          <div className="flex flex-wrap items-center gap-2.5 pt-2 md:pt-0">
            <Link
              href={`/${locale}/patients/${patient.code}/visit/new`}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-4 py-2.5 text-xs font-bold text-on-gold shadow-lg shadow-[#caa95a]/25 hover:opacity-95 transition-all"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>{t.startVisit}</span>
            </Link>

            <Link
              href={`/${locale}/calendar`}
              className="inline-flex items-center gap-1.5 glass rounded-xl px-3.5 py-2.5 text-xs font-medium text-primary hover:bg-slate-100 transition-colors"
            >
              <svg className="h-4 w-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{t.scheduleAppointment}</span>
            </Link>
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
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm text-primary">{v.date}</span>
                    {v.time && <span className="text-xs text-secondary font-mono">{v.time}</span>}
                    <Badge variant="green" size="sm">{v.status}</Badge>
                  </div>
                  {v.doctorName && (
                    <span className="text-xs text-gold font-medium">
                      {t.doctor}: {v.doctorName}
                    </span>
                  )}
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
                      <span className="font-mono text-xs font-bold text-gold">
                        {visitMoney(v).total.toLocaleString()} {t.currency}
                      </span>
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
                          <span className="font-mono font-bold text-emerald-600 shrink-0 ms-4">
                            {(p.costEGP || 0).toLocaleString()} {t.currency}
                          </span>
                        </div>
                      ))}
                    </div>

                    {(() => {
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

                          {money.remaining > 0 ? (
                            payingVisitId === v.id ? (
                              <div className="space-y-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={money.remaining}
                                  value={paymentAmount}
                                  onChange={(e) => setPaymentAmount(e.target.value)}
                                  placeholder={t.paymentAmount}
                                  className="w-full glass rounded-xl px-3 py-2 text-xs font-mono focus:border-[#caa95a] focus:outline-none"
                                />
                                {paymentError && (
                                  <p className="text-[11px] text-rose-600">{paymentError}</p>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => void handleRecordPayment(v)}
                                    className="rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-3 py-1.5 text-[11px] font-semibold text-on-gold"
                                  >
                                    {t.confirmPayment}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayingVisitId(null);
                                      setPaymentAmount("");
                                      setPaymentError(null);
                                    }}
                                    className="glass rounded-xl px-3 py-1.5 text-[11px] text-secondary"
                                  >
                                    {t.cancel}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayingVisitId(v.id);
                                  setPaymentAmount(String(money.remaining));
                                  setPaymentError(null);
                                }}
                                className="rounded-xl border border-rose-400/40 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700"
                              >
                                {t.recordPayment}
                              </button>
                            )
                          ) : money.total > 0 ? (
                            <Badge variant="green" size="sm">
                              {t.fullyPaid}
                            </Badge>
                          ) : null}
                        </div>
                      );
                    })()}
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
                <Link
                  href={`/${locale}/patients/${patient.code}/visit/new`}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-4 py-2 text-xs font-semibold text-on-gold"
                >
                  {t.recordFirstVisit}
                </Link>
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
    </AppShell>
  );
}
