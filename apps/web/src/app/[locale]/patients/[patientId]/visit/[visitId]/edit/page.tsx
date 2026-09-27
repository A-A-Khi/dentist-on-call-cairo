"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../../../../../components/layout/AppShell";
import { PageHeader } from "../../../../../../../components/layout/PageHeader";
import { Breadcrumb } from "../../../../../../../components/layout/Breadcrumb";
import { Textarea } from "../../../../../../../components/ui/Textarea";
import { Button, ButtonLink } from "../../../../../../../components/ui/Button";
import { getDictionarySync } from "../../../../../../../i18n/get-dictionary";
import {
  deleteClinicalVisit,
  fetchCaseStreams,
  fetchPatientById,
  fetchVisitById,
  updateClinicalVisit,
} from "../../../../../../../lib/clinical-api";
import { PROCEDURE_PRICE_LIST, type PriceListItem } from "../../../../../../../lib/price-list";
import { getStoredSessionUser } from "../../../../../../../lib/session";
import type { CaseStream, Patient } from "../../../../../../../lib/clinical-data";

interface ProcedureRow {
  id: string;
  name: string;
  tooth: string;
  cost: number;
}

function cleanText(value?: string | null) {
  if (!value || value === "—") return "";
  return value;
}

export default function EditVisitPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const isAr = locale === "ar";
  const patientId = (params?.patientId as string) || "";
  const visitId = (params?.visitId as string) || "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(
    () => (getStoredSessionUser()?.role ?? "ADMIN") === "ADMIN"
  );
  const [paidAmountEGP, setPaidAmountEGP] = useState(0);
  const [caseCost, setCaseCost] = useState(0);
  const [caseCostNote, setCaseCostNote] = useState("");
  const [streams, setStreams] = useState<CaseStream[]>([]);
  const [sourceStreamId, setSourceStreamId] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [clinicalFindings, setClinicalFindings] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [doctorNotes, setDoctorNotes] = useState("");
  const [prescriptions, setPrescriptions] = useState("");
  const [procedures, setProcedures] = useState<ProcedureRow[]>([]);

  useEffect(() => {
    const session = getStoredSessionUser();
    setIsAdmin((session?.role ?? "ADMIN") === "ADMIN");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [p, visit, streamData] = await Promise.all([
          fetchPatientById(patientId),
          fetchVisitById(visitId),
          fetchCaseStreams(),
        ]);
        if (cancelled) return;
        setPatient(p);
        setStreams(streamData);
        if (visit) {
          setChiefComplaint(cleanText(visit.chiefComplaint));
          setClinicalFindings(cleanText(visit.clinicalFindings));
          setDiagnosis(cleanText(visit.diagnosis));
          setDoctorNotes(cleanText(visit.doctorNotes));
          setPrescriptions(visit.prescriptions?.join("\n") || "");
          setPaidAmountEGP(visit.paidAmountEGP ?? 0);
          setCaseCost(visit.caseCostEGP ?? 0);
          setCaseCostNote(visit.caseCostNote || "");
          setSourceStreamId(visit.sourceStreamId || "");
          setProcedures(
            visit.procedures.map((proc) => ({
              id: proc.id,
              name: proc.name,
              tooth: proc.toothNumber || "",
              cost: proc.costEGP || 0,
            }))
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    if (patientId && visitId) void load();
    return () => {
      cancelled = true;
    };
  }, [patientId, visitId]);

  const totalCost = procedures.reduce((sum, p) => sum + p.cost, 0);
  const paidToSave = Math.min(Math.max(0, paidAmountEGP), totalCost);
  const remaining = Math.max(totalCost - paidToSave, 0);
  const selectedStream = streams.find((s) => s.id === sourceStreamId);
  const streamLabel = (stream: CaseStream) =>
    isAr && stream.nameAr ? stream.nameAr : stream.nameEn;

  const clampPaid = (nextTotal: number) => {
    setPaidAmountEGP((paid) => Math.min(Math.max(0, paid), nextTotal));
  };

  const addProcedure = (item?: PriceListItem) => {
    setProcedures((prev) => [
      ...prev,
      {
        id: `proc-${Date.now()}`,
        name: item ? (isAr ? item.nameAr : item.nameEn) : isAr ? "إجراء سريري" : "Clinical Procedure",
        tooth: "",
        cost: item?.defaultCostEGP ?? 0,
      },
    ]);
  };

  const updateProcedure = (id: string, updates: Partial<ProcedureRow>) => {
    setProcedures((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      if (updates.cost !== undefined) {
        clampPaid(next.reduce((sum, p) => sum + p.cost, 0));
      }
      return next;
    });
  };

  const removeProcedure = (id: string) => {
    setProcedures((prev) => {
      const next = prev.filter((p) => p.id !== id);
      clampPaid(next.reduce((sum, p) => sum + p.cost, 0));
      return next;
    });
  };

  const handleSave = async () => {
    if (!patient || !isAdmin) return;
    if (procedures.some((p) => p.name.trim().length < 2)) {
      setError(isAr ? "اسم كل إجراء لازم يكون حرفين على الأقل." : "Each procedure name needs at least 2 characters.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await updateClinicalVisit(visitId, {
        chiefComplaint: chiefComplaint.trim(),
        clinicalFindings: clinicalFindings.trim(),
        diagnosis: diagnosis.trim(),
        doctorNotes,
        prescriptions,
        procedures: procedures.map((p) => ({
          name: p.name,
          toothNumber: p.tooth || undefined,
          costEGP: p.cost,
        })),
        caseCostEGP: Math.max(0, caseCost),
        caseCostNote: caseCostNote.trim() || null,
        paidEGP: paidToSave,
        sourceStreamId: sourceStreamId || null,
        status: "Completed",
      });
      router.push(`/${locale}/patients/${patient.code}`);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : isAr
            ? "تعذر حفظ تعديلات الزيارة."
            : "Could not save visit changes."
      );
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!patient || !isAdmin || isDeleting) return;
    if (!window.confirm(dict.visitEdit.deleteConfirm)) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteClinicalVisit(visitId);
      router.push(`/${locale}/patients/${patient.code}`);
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : dict.visitEdit.deleteFailed
      );
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell locale={locale}>
        <div className="py-16 text-center text-xs text-secondary">
          {isAr ? "جاري تحميل الزيارة..." : "Loading visit..."}
        </div>
      </AppShell>
    );
  }

  if (!patient) {
    return (
      <AppShell locale={locale}>
        <div className="glass-card rounded-2xl border-dashed p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-primary">{dict.patientProfile.notFound}</p>
          <ButtonLink href={`/${locale}/patients`} variant="primary" size="sm" className="mt-2">
            {dict.nav.patients}
          </ButtonLink>
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell locale={locale}>
        <div className="glass-card rounded-2xl border-dashed p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-primary">
            {isAr ? "تعديل الزيارات متاح للإدارة فقط" : "Only administrators can edit visits"}
          </p>
          <ButtonLink href={`/${locale}/patients/${patient.code}`} variant="primary" size="sm" className="mt-2">
            {isAr ? "العودة للملف" : "Back to chart"}
          </ButtonLink>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell locale={locale}>
      <div className="max-w-4xl mx-auto space-y-6 pb-24">
        <PageHeader
          breadcrumb={
            <Breadcrumb
              items={[
                { label: dict.nav.patients, href: `/${locale}/patients` },
                { label: patient.code, href: `/${locale}/patients/${patient.code}` },
                { label: dict.visitEdit.title },
              ]}
            />
          }
          title={dict.visitEdit.title}
          subtitle={patient.fullName}
        />

        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-primary">{dict.visitNew.referrerTitle}</h3>
            <p className="text-xs text-secondary mt-0.5">{dict.visitNew.referrerHelp}</p>
          </div>
          <select
            value={sourceStreamId}
            onChange={(e) => setSourceStreamId(e.target.value)}
            className="w-full glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
          >
            <option value="">{dict.visitNew.oursSource}</option>
            {streams.map((stream) => (
              <option key={stream.id} value={stream.id}>
                {streamLabel(stream)}
                {typeof stream.referralPercent === "number" ? ` — ${stream.referralPercent}%` : ""}
              </option>
            ))}
          </select>
          {selectedStream ? (
            <p className="text-[11px] text-muted">
              {dict.visitNew.referrerPercent}: {selectedStream.referralPercent ?? 0}%
            </p>
          ) : null}
        </div>

        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-3">
          <h3 className="text-sm font-semibold text-primary">{dict.visitNew.chiefComplaint}</h3>
          <Textarea value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} rows={2} />
        </div>

        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
          <h3 className="text-sm font-semibold text-primary">
            {isAr ? "الفحص والتشخيص" : "Examination & Diagnosis"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Textarea
              label={dict.visitNew.clinicalFindings}
              value={clinicalFindings}
              onChange={(e) => setClinicalFindings(e.target.value)}
              rows={3}
            />
            <Textarea
              label={dict.visitNew.diagnosis}
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-primary">{dict.visitNew.proceduresTitle}</h3>
            <Button type="button" variant="secondary" size="xs" onClick={() => addProcedure()}>
              {dict.visitNew.addProcedure}
            </Button>
          </div>
          <select
            defaultValue=""
            onChange={(e) => {
              const item = PROCEDURE_PRICE_LIST.find((p) => p.id === e.target.value);
              if (item) {
                addProcedure(item);
                e.target.value = "";
              }
            }}
            className="w-full glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
          >
            <option value="" disabled>
              {isAr ? "إضافة إجراء من لائحة الأسعار" : "Add a procedure from the price list"}
            </option>
            {PROCEDURE_PRICE_LIST.map((item) => (
              <option key={item.id} value={item.id}>
                {(isAr ? item.nameAr : item.nameEn)} — {item.defaultCostEGP.toLocaleString()}
              </option>
            ))}
          </select>

          {procedures.length === 0 ? (
            <p className="text-xs text-muted">{dict.visitEdit.noProcedures}</p>
          ) : (
            <div className="space-y-3">
              {procedures.map((p) => (
                <div key={p.id} className="glass rounded-xl p-3.5 space-y-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="danger-soft"
                      size="xs"
                      onClick={() => removeProcedure(p.id)}
                    >
                      {isAr ? "حذف" : "Remove"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-6">
                      <label className="block text-[10px] text-muted mb-1">{dict.visitNew.procedureName}</label>
                      <input
                        value={p.name}
                        onChange={(e) => updateProcedure(p.id, { name: e.target.value })}
                        className="w-full rounded-lg glass px-3 py-1.5 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] text-muted mb-1">{dict.visitNew.toothNumber}</label>
                      <input
                        value={p.tooth}
                        onChange={(e) => updateProcedure(p.id, { tooth: e.target.value })}
                        className="w-full rounded-lg glass px-3 py-1.5 text-xs font-mono text-primary focus:border-[#caa95a] focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] text-muted mb-1">{dict.visitNew.costEGP}</label>
                      <input
                        type="number"
                        min={0}
                        value={p.cost}
                        onChange={(e) => updateProcedure(p.id, { cost: Number(e.target.value) || 0 })}
                        className="w-full rounded-lg glass px-3 py-1.5 text-xs font-mono font-bold text-primary focus:border-[#caa95a] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-2 border-t glass-divider/60">
            <div>
              <span className="text-muted block">{dict.patientProfile.totalCost}</span>
              <span className="font-mono font-bold text-primary">
                {totalCost.toLocaleString()} {dict.patientProfile.currency}
              </span>
            </div>
            <div>
              <label className="text-muted block" htmlFor="paid-amount">
                {dict.patientProfile.amountPaid}
              </label>
              <input
                id="paid-amount"
                type="number"
                min={0}
                max={totalCost}
                step={1}
                value={paidToSave}
                onChange={(e) =>
                  setPaidAmountEGP(Math.min(totalCost, Math.max(0, Number(e.target.value) || 0)))
                }
                className="mt-1 w-full rounded-lg glass px-2 py-1 text-xs font-mono font-bold text-emerald-700 focus:border-[#caa95a] focus:outline-none"
              />
            </div>
            <div>
              <span className="text-muted block">{dict.patientProfile.remainingBalance}</span>
              <span className={`font-mono font-bold ${remaining > 0 ? "text-rose-500" : "text-emerald-600"}`}>
                {remaining.toLocaleString()} {dict.patientProfile.currency}
              </span>
            </div>
            <div>
              <span className="text-muted block">{dict.visitNew.caseCosts}</span>
              <span className="font-mono font-bold text-primary">
                {Math.max(0, caseCost).toLocaleString()} {dict.patientProfile.currency}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-secondary mb-1">
                {dict.visitNew.caseCosts}
              </label>
              <input
                type="number"
                min={0}
                step={50}
                value={caseCost}
                onChange={(e) => setCaseCost(Number(e.target.value) || 0)}
                className="w-full rounded-lg glass px-3 py-2 text-sm text-primary font-mono font-bold focus:border-[#caa95a] focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted">{dict.visitNew.caseCostsHint}</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-secondary mb-1">
                {dict.visitNew.caseCostsNote}
              </label>
              <input
                type="text"
                value={caseCostNote}
                onChange={(e) => setCaseCostNote(e.target.value)}
                placeholder={dict.visitNew.caseCostsNotePlaceholder}
                className="w-full rounded-lg glass px-3 py-2 text-sm text-primary focus:border-[#caa95a] focus:outline-none"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted">{dict.visitEdit.paymentNote}</p>
        </div>

        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Textarea
              label={dict.visitNew.prescriptions}
              value={prescriptions}
              onChange={(e) => setPrescriptions(e.target.value)}
              rows={3}
            />
            <Textarea
              label={dict.visitNew.doctorNotes}
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="danger-soft"
            size="sm"
            onClick={() => void handleDelete()}
            isLoading={isDeleting}
          >
            {dict.visitEdit.deleteVisit}
          </Button>
          <div className="flex items-center gap-3">
            <ButtonLink href={`/${locale}/patients/${patient.code}`} variant="secondary" size="sm">
              {dict.visitEdit.cancelButton}
            </ButtonLink>
            <Button variant="primary" size="sm" onClick={() => void handleSave()} isLoading={isSaving}>
              {dict.visitEdit.saveButton}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
