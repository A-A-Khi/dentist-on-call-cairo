"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../../../../components/layout/AppShell";
import { PageHeader } from "../../../../../../components/layout/PageHeader";
import { Breadcrumb } from "../../../../../../components/layout/Breadcrumb";
import { Textarea } from "../../../../../../components/ui/Textarea";
import { Button, ButtonLink } from "../../../../../../components/ui/Button";
import { Badge } from "../../../../../../components/ui/Badge";
import { getDictionarySync } from "../../../../../../i18n/get-dictionary";
import { fetchCaseStreams, fetchPatientById, recordClinicalVisit } from "../../../../../../lib/clinical-api";
import { PROCEDURE_PRICE_LIST, type PriceListItem } from "../../../../../../lib/price-list";
import type { CaseStream, Patient } from "../../../../../../lib/clinical-data";
import { getStoredSessionUser } from "../../../../../../lib/session";

interface ProcedureRow {
  id: string;
  name: string;
  tooth: string;
  cost: number;
  isManual?: boolean;
}

function NewVisitPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const patientId = (params?.patientId as string) || "";

  // Prefill from calendar / reservations query params
  const queryComplaint = searchParams?.get("chiefComplaint") || "";
  const appointmentId = searchParams?.get("appointmentId") || "";
  const returnTo = searchParams?.get("returnTo") || "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(true);
  const [streams, setStreams] = useState<CaseStream[]>([]);
  const [sourceStreamId, setSourceStreamId] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin((getStoredSessionUser()?.role ?? "DOCTOR") === "ADMIN");
  }, []);

  // Visits can only start from a calendar booking — keep doctors on that path.
  useEffect(() => {
    if (!appointmentId) {
      router.replace(`/${locale}/calendar${patientId ? `?bookPatient=${encodeURIComponent(patientId)}` : ""}`);
    }
  }, [appointmentId, locale, patientId, router]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setPatientLoading(true);
      try {
        const [p, streamData] = await Promise.all([fetchPatientById(patientId), fetchCaseStreams()]);
        if (!isMounted) return;
        setPatient(p);
        setStreams(streamData);
        // Each visit chooses its own source; do not inherit the patient's last stream.
        setSourceStreamId("");
      } finally {
        if (isMounted) setPatientLoading(false);
      }
    }
    if (patientId && appointmentId) load();
    else if (!appointmentId) setPatientLoading(false);
    return () => {
      isMounted = false;
    };
  }, [patientId, appointmentId]);

  const [chiefComplaint, setChiefComplaint] = useState(queryComplaint);
  const [clinicalFindings, setClinicalFindings] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [doctorNotes, setDoctorNotes] = useState("");
  const [prescriptions, setPrescriptions] = useState("");

  const [procedures, setProcedures] = useState<ProcedureRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);
  const [caseCost, setCaseCost] = useState(0);
  const [caseCostNote, setCaseCostNote] = useState("");
  const prevTotalRef = useRef(0);

  const totalCost = procedures.reduce((sum, p) => sum + p.cost, 0);
  const clampedPaid = Math.max(0, Math.min(paidAmount, totalCost));
  const remainingBalance = totalCost - clampedPaid;
  const clampedCaseCost = Math.max(0, caseCost);
  const splitBasis = Math.max(0, clampedPaid - clampedCaseCost);
  const selectedStream = streams.find((s) => s.id === sourceStreamId);
  const referralPercent = selectedStream?.referralPercent ?? 0;
  const doctorShareEGP = Math.floor((splitBasis * 35) / 100);
  const assistantShareEGP = Math.floor((splitBasis * 15) / 100);
  const referralShareEGP = Math.floor((splitBasis * referralPercent) / 100);
  const orgShareEGP = splitBasis - doctorShareEGP - assistantShareEGP - referralShareEGP;
  const streamLabel = (stream: CaseStream) =>
    locale === "ar" && stream.nameAr ? stream.nameAr : stream.nameEn;

  useEffect(() => {
    if (paidAmount === prevTotalRef.current) {
      setPaidAmount(totalCost);
    } else if (paidAmount > totalCost) {
      setPaidAmount(totalCost);
    }
    prevTotalRef.current = totalCost;
  }, [totalCost]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add procedure from standard fee schedule
  const addProcedureFromCatalog = (item: PriceListItem) => {
    setProcedures((prev) => [
      ...prev,
      {
        id: "proc-" + Date.now() + Math.random().toString().slice(2, 6),
        name: locale === "ar" ? item.nameAr : item.nameEn,
        tooth: "General",
        cost: item.defaultCostEGP,
        isManual: false,
      },
    ]);
  };

  // Add manual / custom procedure with doctor-signed price
  const addManualProcedure = () => {
    setProcedures((prev) => [
      ...prev,
      {
        id: "proc-" + Date.now() + Math.random().toString().slice(2, 6),
        name: locale === "ar" ? "إجراء سريري مخصص" : "Custom Clinical Procedure",
        tooth: "Universal",
        cost: 1000,
        isManual: true,
      },
    ]);
  };

  const removeProcedure = (id: string) => {
    setProcedures((prev) => prev.filter((p) => p.id !== id));
  };

  const updateProcedure = (id: string, updates: Partial<ProcedureRow>) => {
    setProcedures((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const handleSave = async () => {
    if (!patient) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await recordClinicalVisit({
        patientIdentifier: patient.code,
        chiefComplaint: chiefComplaint.trim(),
        clinicalFindings: clinicalFindings.trim(),
        diagnosis: diagnosis.trim(),
        doctorNotes,
        prescriptions: prescriptions || "",
        procedures: procedures.map((p) => ({
          name: p.name,
          toothNumber: p.tooth,
          costEGP: p.cost,
        })),
        status: "Completed",
        paidEGP: isAdmin ? clampedPaid : 0,
        caseCostEGP: isAdmin ? clampedCaseCost : 0,
        caseCostNote: isAdmin ? caseCostNote.trim() || undefined : undefined,
        // Empty string => Dentist on Call / fully ours for this visit.
        sourceStreamId: sourceStreamId || undefined,
        appointmentId: appointmentId || undefined,
      });
      if (returnTo === "calendar") {
        router.push(`/${locale}/calendar`);
      } else {
        router.push(`/${locale}/patients/${patient.code}`);
      }
    } catch {
      setSaveError(dict.visitNew.saveError);
      setIsSaving(false);
    }
  };

  const quickSymptoms = [
    locale === "ar" ? "ألم حاد نابض" : "Severe Throbbing Pain",
    locale === "ar" ? "حساسية بارد وساخن" : "Cold/Hot Sensitivity",
    locale === "ar" ? "تورم / خراج" : "Swelling / Abscess",
    locale === "ar" ? "كسر بالسن" : "Chipped Tooth",
    locale === "ar" ? "سقوط طربوش" : "Crown Came Off",
    locale === "ar" ? "نزيف لثة" : "Bleeding Gums",
  ];

  if (!appointmentId) {
    return (
      <AppShell locale={locale}>
        <div className="py-16 text-center space-y-3">
          <p className="text-sm font-semibold text-primary">
            {locale === "ar" ? "ابدأ الزيارة من التقويم فقط" : "Start visits from the calendar only"}
          </p>
          <p className="text-xs text-secondary max-w-sm mx-auto">
            {locale === "ar"
              ? "احجز موعداً في التقويم أولاً، ثم اضغط «بدء الزيارة» عندما يحين الوقت."
              : "Book a chair time on the calendar first, then tap Start visit when the patient is due."}
          </p>
          <ButtonLink href={`/${locale}/calendar`} variant="primary" size="sm" className="mt-2">
            {dict.nav.calendar}
          </ButtonLink>
        </div>
      </AppShell>
    );
  }

  if (patientLoading) {
    return (
      <AppShell locale={locale}>
        <div className="py-16 text-center text-xs text-secondary">
          {locale === "ar" ? "جاري تحميل بيانات المريض..." : "Loading patient..."}
        </div>
      </AppShell>
    );
  }

  if (!patient) {
    return (
      <AppShell locale={locale}>
        <div className="glass-card rounded-2xl border-dashed p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-primary">
            {locale === "ar" ? "المريض غير موجود" : "Patient not found"}
          </p>
          <ButtonLink href={`/${locale}/patients`} variant="primary" size="sm" className="mt-2">
            {dict.nav.patients}
          </ButtonLink>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell locale={locale}>
          <div className="max-w-4xl mx-auto space-y-6 pb-28">
            <PageHeader
              breadcrumb={
                <Breadcrumb
                  items={[
                    ...(returnTo === "calendar"
                      ? [{ label: dict.nav.calendar, href: `/${locale}/calendar` }]
                      : [{ label: dict.nav.patients, href: `/${locale}/patients` }]),
                    { label: patient.code, href: `/${locale}/patients/${patient.code}` },
                    { label: dict.visitNew.title },
                  ]}
                />
              }
              title={appointmentId ? dict.calendar.startVisit : dict.visitNew.title}
              subtitle={`${dict.visitNew.patientContext}: ${patient.fullName} (${patient.code})${patient.assignedDoctor ? ` • ${dict.patients.table.assignedDoctor}: ${patient.assignedDoctor}` : ""}`}
            />

              {appointmentId ? (
                <div className="flex items-center gap-2 rounded-xl border border-[#caa95a]/30 bg-[#caa95a]/10 px-3 py-2 text-xs text-gold">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>
                    {locale === "ar"
                      ? "زيارة من التقويم — بعد الحفظ سيتم تسجيل الموعد كمكتمل."
                      : "Started from calendar — saving will mark this booking as completed."}
                  </span>
                </div>
              ) : null}

              {/* Medical Alerts Banner */}
              {patient.medicalAlerts.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <svg className="h-4 w-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{patient.medicalAlerts.join(", ")}</span>
                </div>
              )}

            {/* Referrer / Case Stream — per visit */}
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-primary">
                  {dict.visitNew.referrerTitle}
                </h3>
                <p className="text-xs text-secondary mt-0.5">{dict.visitNew.referrerHelp}</p>
                {patient.sourceStream ? (
                  <p className="text-[11px] text-muted mt-1">
                    {dict.visitNew.patientLastSource}:{" "}
                    <span className="text-secondary font-medium">{patient.sourceStream}</span>
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-secondary mb-1">
                    {dict.patientNew.caseStream}
                  </label>
                  <select
                    value={sourceStreamId}
                    onChange={(e) => setSourceStreamId(e.target.value)}
                    className="w-full glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  >
                    <option value="">{dict.visitNew.oursSource}</option>
                    {streams.map((stream) => (
                      <option key={stream.id} value={stream.id}>
                        {streamLabel(stream)}
                        {isAdmin && typeof stream.referralPercent === "number"
                          ? ` — ${stream.referralPercent}%`
                          : ""}
                      </option>
                    ))}
                  </select>
                  {streams.length === 0 ? (
                    <p className="mt-1 text-[10px] text-muted">{dict.visitNew.noStreams}</p>
                  ) : null}
                </div>
                {isAdmin ? (
                  <div className="rounded-xl glass px-3 py-2">
                    <span className="text-[11px] text-secondary block">{dict.visitNew.referrerPercent}</span>
                    <span className="text-lg font-mono font-bold text-gold">{referralPercent}%</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Section 1: Chief Complaint */}
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-primary">
                    1. {locale === "ar" ? "الشكوى الرئيسية للمريض (Chief Complaint)" : "Patient Chief Complaint"}
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    {locale === "ar" ? "سبب حضور المريض أو حجز الموعد بكلماته الخاصة" : "Document the presenting symptom or reservation request"}
                  </p>
                </div>
                {queryComplaint && (
                  <Badge variant="gold" size="sm">
                    {locale === "ar" ? "مستورد من الحجز" : "From Reservation"}
                  </Badge>
                )}
              </div>

              {/* Quick Symptom Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {quickSymptoms.map((sym, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setChiefComplaint((prev) => (prev ? `${prev}. ${sym}` : sym))}
                    className="rounded-lg glass px-2.5 py-1 text-[11px] text-secondary hover:border-[#caa95a]/50 hover:text-primary transition-colors"
                  >
                    + {sym}
                  </button>
                ))}
              </div>

              <Textarea
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                rows={2}
                placeholder={locale === "ar" ? "اكتب شكوى المريض الرئيسية..." : "Enter patient's chief complaint in their own words..."}
              />
            </div>

            {/* Section 2: Clinical Findings & Diagnosis */}
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-primary">
                2. {locale === "ar" ? "الفحص السريري والتشخيص الطبي (Examination & Diagnosis)" : "Clinical Examination & Diagnosis"}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Textarea
                  label={locale === "ar" ? "نتائج الفحص داخل الفم (Clinical Findings)" : "Intraoral Clinical Findings"}
                  value={clinicalFindings}
                  onChange={(e) => setClinicalFindings(e.target.value)}
                  rows={3}
                  placeholder={locale === "ar" ? "فحص الأسنان، اللثة، اختبار الحيوية، والقرع..." : "Percussion tenderness, periodontal probing, vitality results..."}
                />
                <Textarea
                  label={locale === "ar" ? "التشخيص النهائي (Clinical Diagnosis)" : "Clinical Diagnosis"}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={3}
                  placeholder={locale === "ar" ? "التشخيص مع تحديد رقم السن/الضرس المتأثر..." : "Definitive diagnosis with tooth numbering..."}
                />
              </div>
            </div>

            {/* Section 3: Procedures Executed & Price List Catalog */}
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-primary">
                    3. {locale === "ar" ? "الإجراءات المنفذة والتسعير (Procedures & Fees)" : "Procedures Executed & Clinical Fees"}
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    {locale === "ar"
                      ? "اختر من لائحة الأسعار الرسمية أو حدد إجراءً يدوياً بسعر مخصص"
                      : "Choose from standard fee schedule or sign a manual custom procedure"}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button type="button" variant="secondary" size="xs" onClick={addManualProcedure}>
                    + {locale === "ar" ? "إجراء يدوي بسعر مخصص" : "Manual / Custom Procedure"}
                  </Button>
                </div>
              </div>

              {/* Price List Catalog Quick Selector */}
              <div className="glass rounded-xl p-3 space-y-2">
                <label className="block text-[11px] font-semibold text-gold">
                  {locale === "ar" ? "📋 اختيار سريع من لائحة أسعار العيادة الرسمية:" : "📋 Quick Add from Standard Dental Fee Schedule:"}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const item = PROCEDURE_PRICE_LIST.find((p) => p.id === e.target.value);
                      if (item) {
                        addProcedureFromCatalog(item);
                        e.target.value = "";
                      }
                    }}
                    className="w-full glass rounded-xl px-3 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  >
                    <option value="" disabled>
                      {locale === "ar" ? "-- اضغط لاختيار إجراء من لائحة الأسعار --" : "-- Select procedure from price list catalog --"}
                    </option>
                    <optgroup label={locale === "ar" ? "الكشف والاستشارات" : "Consultation"}>
                      {PROCEDURE_PRICE_LIST.filter((p) => p.category === "Consultation").map((p) => (
                        <option key={p.id} value={p.id}>
                          {locale === "ar" ? p.nameAr : p.nameEn} — ({p.defaultCostEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={locale === "ar" ? "العلاج التحفظي وحشوات التجميل" : "Restorative & Fillings"}>
                      {PROCEDURE_PRICE_LIST.filter((p) => p.category === "Restorative").map((p) => (
                        <option key={p.id} value={p.id}>
                          {locale === "ar" ? p.nameAr : p.nameEn} — ({p.defaultCostEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={locale === "ar" ? "علاج الجذور وسحب العصب" : "Endodontics"}>
                      {PROCEDURE_PRICE_LIST.filter((p) => p.category === "Endodontics").map((p) => (
                        <option key={p.id} value={p.id}>
                          {locale === "ar" ? p.nameAr : p.nameEn} — ({p.defaultCostEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={locale === "ar" ? "جراحة الفم والخلع وزراعة الأسنان" : "Oral Surgery & Implants"}>
                      {PROCEDURE_PRICE_LIST.filter((p) => p.category === "Surgery").map((p) => (
                        <option key={p.id} value={p.id}>
                          {locale === "ar" ? p.nameAr : p.nameEn} — ({p.defaultCostEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={locale === "ar" ? "التركيبات الثابتة والزركونيا" : "Crowns & Prosthodontics"}>
                      {PROCEDURE_PRICE_LIST.filter((p) => p.category === "Prosthodontics").map((p) => (
                        <option key={p.id} value={p.id}>
                          {locale === "ar" ? p.nameAr : p.nameEn} — ({p.defaultCostEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={locale === "ar" ? "الوقاية والتنظيف والتجميل" : "Preventive & Aesthetics"}>
                      {PROCEDURE_PRICE_LIST.filter((p) => p.category === "Preventive" || p.category === "Cosmetics").map((p) => (
                        <option key={p.id} value={p.id}>
                          {locale === "ar" ? p.nameAr : p.nameEn} — ({p.defaultCostEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Active Procedures List */}
              <div className="space-y-3 pt-2">
                {procedures.length === 0 ? (
                  <div className="glass-card rounded-xl border-dashed p-6 text-center text-xs text-muted">
                    {locale === "ar"
                      ? "لم يتم تحديد أي إجراءات بعد. اختر إجراءً من اللائحة أعلاه أو أضف إجراءً مخصصاً."
                      : "No procedures cataloged yet. Select from the fee schedule above or add a manual custom procedure."}
                  </div>
                ) : (
                  procedures.map((p) => (
                    <div
                      key={p.id}
                      className="glass rounded-xl p-3.5 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={p.isManual ? "amber" : "gold"} size="sm">
                            {p.isManual
                              ? (locale === "ar" ? "سعر يدوي مخصص" : "Manual Doctor Fee")
                              : (locale === "ar" ? "لائحة الأسعار الرسمية" : "Fee Schedule")}
                          </Badge>
                          <span className="text-[10px] text-muted font-mono">{p.id.slice(0, 10)}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeProcedure(p.id)}
                          className="rounded p-1 text-muted hover:text-rose-400 transition-colors"
                          title={locale === "ar" ? "حذف الإجراء" : "Remove"}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] text-muted mb-1">
                            {locale === "ar" ? "اسم الإجراء الطبي" : "Procedure Name"}
                          </label>
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => updateProcedure(p.id, { name: e.target.value })}
                            className="w-full rounded-lg glass px-3 py-1.5 text-xs text-primary focus:border-[#caa95a] focus:outline-none font-medium"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] text-muted mb-1">
                            {locale === "ar" ? "رقم السن / الموضع" : "Tooth # / Site"}
                          </label>
                          <input
                            type="text"
                            value={p.tooth}
                            onChange={(e) => updateProcedure(p.id, { tooth: e.target.value })}
                            placeholder="e.g. #36 or Universal"
                            className="w-full rounded-lg glass px-3 py-1.5 text-xs text-primary font-mono focus:border-[#caa95a] focus:outline-none"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] text-muted mb-1">
                            {locale === "ar" ? "التكلفة السريرية (ج.م)" : "Fee (EGP)"}
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={p.cost}
                            onChange={(e) => updateProcedure(p.id, { cost: Number(e.target.value) || 0 })}
                            className="w-full rounded-lg glass px-3 py-1.5 text-xs text-primary font-mono font-bold focus:border-[#caa95a] focus:outline-none text-emerald-400"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Financial Ledger Attestation Card — admin only */}
                {procedures.length > 0 && isAdmin && (
                  <div className="rounded-2xl border border-[#caa95a]/40 bg-gradient-to-br from-[#caa95a]/10 via-white to-slate-50 p-4 space-y-3 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b glass-divider pb-3">
                      <div>
                        <span className="text-xs font-semibold text-gold block">
                          {dict.visitNew.totalCost}
                        </span>
                        <span className="text-[11px] text-secondary">
                          {dict.visitNew.paymentHint}
                        </span>
                      </div>
                      <div className="text-end sm:text-right rtl:sm:text-left">
                        <span className="text-xl font-mono font-bold text-gold">
                          {totalCost.toLocaleString()} {dict.patientProfile.currency}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-secondary mb-1">
                          {dict.visitNew.amountPaid}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={totalCost}
                          step={50}
                          value={clampedPaid}
                          onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                          className="w-full rounded-lg glass px-3 py-2 text-sm text-primary font-mono font-bold focus:border-[#caa95a] focus:outline-none"
                        />
                      </div>
                      <div className="rounded-xl glass px-3 py-2 flex flex-col justify-center">
                        <span className="text-[11px] text-secondary">{dict.visitNew.remainingBalance}</span>
                        <span
                          className={`text-lg font-mono font-bold ${
                            remainingBalance > 0 ? "text-rose-500" : "text-emerald-600"
                          }`}
                        >
                          {remainingBalance.toLocaleString()} {dict.patientProfile.currency}
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
                          value={clampedCaseCost}
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

                    {clampedCaseCost > 0 && (
                      <div className="rounded-xl glass px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-secondary">{dict.visitNew.splitBasis}</span>
                        <span className="font-mono font-bold text-primary">
                          {splitBasis.toLocaleString()} {dict.patientProfile.currency}
                          <span className="ms-1 font-normal text-muted">
                            ({clampedPaid.toLocaleString()} − {clampedCaseCost.toLocaleString()})
                          </span>
                        </span>
                      </div>
                    )}

                    <p className="text-[11px] text-muted">
                      {remainingBalance > 0
                        ? dict.visitNew.partialPayment
                        : dict.visitNew.fullyPaid}
                      {" · "}
                      {procedures.length} {locale === "ar" ? "إجراءات" : "procedures"}
                    </p>

                    {clampedPaid > 0 && (
                      <div className="rounded-xl border border-[#caa95a]/25 bg-white/60 px-3 py-2 space-y-1.5">
                        <p className="text-[11px] font-semibold text-secondary">{dict.visitNew.splitPreview}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <div>
                            <span className="text-muted block">{dict.patientProfile.shareDoctor} 35%</span>
                            <span className="font-mono font-semibold text-primary">
                              {doctorShareEGP.toLocaleString()} {dict.patientProfile.currency}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted block">{dict.patientProfile.shareAssistant} 15%</span>
                            <span className="font-mono font-semibold text-primary">
                              {assistantShareEGP.toLocaleString()} {dict.patientProfile.currency}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted block">
                              {dict.patientProfile.shareReferral} {referralPercent}%
                            </span>
                            <span className="font-mono font-semibold text-primary">
                              {referralShareEGP.toLocaleString()} {dict.patientProfile.currency}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted block">{dict.patientProfile.shareOrg}</span>
                            <span className="font-mono font-semibold text-emerald-600">
                              {orgShareEGP.toLocaleString()} {dict.patientProfile.currency}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Prescriptions & Doctor Notes */}
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-primary">
                4. {locale === "ar" ? "الوصفة الطبية وتوصيات الرعاية المنزلية" : "Prescriptions & Home Care Instructions"}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Textarea
                  label={locale === "ar" ? "الروشتة الدوائية (Rx Prescriptions)" : "Prescriptions (Rx)"}
                  value={prescriptions}
                  onChange={(e) => setPrescriptions(e.target.value)}
                  rows={3}
                  placeholder={locale === "ar" ? "المضاد الحيوي، المسكن، المضمضة..." : "e.g. Augmentin 1g tab q12h, Ibuprofen 600mg po tid..."}
                />
                <Textarea
                  label={locale === "ar" ? "ملاحظات الطبيب السريرية للزيارة القادمة" : "Clinical Follow-up Notes"}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  rows={3}
                  placeholder={locale === "ar" ? "ملاحظات الاستدعاء، مواعيد تبديل الحشو، جلسة المتابعة..." : "Recall interval, post-op instructions, planned second stage..."}
                />
              </div>
            </div>
          </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-16 md:bottom-0 inset-x-0 z-30 border-t glass-divider bg-[#f4f6fb]/95 px-4 py-3 backdrop-blur-md">
        <div className="max-w-4xl mx-auto space-y-2">
          {saveError && (
            <p className="text-xs text-rose-600 font-medium">{saveError}</p>
          )}
          <div className="flex items-center justify-between gap-4">
          <div className="text-xs">
            <span className="text-secondary">{locale === "ar" ? "توثيق لجلسة: " : "Documenting: "}</span>
            <strong className="text-primary">{patient.fullName}</strong>
            <span className="font-mono text-gold ms-2 font-bold">
              {isAdmin
                ? `• ${clampedPaid.toLocaleString()}/${totalCost.toLocaleString()} ${dict.patientProfile.currency}${
                    remainingBalance > 0
                      ? ` (${dict.visitNew.remainingBalance}: ${remainingBalance.toLocaleString()})`
                      : ""
                  }`
                : procedures.length > 0
                  ? `• ${procedures.length} ${locale === "ar" ? "إجراءات" : "procedures"}`
                  : ""}
            </span>
            {selectedStream ? (
              <span className="ms-2 text-secondary">
                · {streamLabel(selectedStream)}
                {isAdmin ? ` (${referralPercent}%)` : ""}
              </span>
            ) : (
              <span className="ms-2 text-secondary">· {dict.visitNew.oursSourceShort}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ButtonLink href={`/${locale}/patients/${patient.code}`} variant="secondary" size="sm">
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </ButtonLink>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={isSaving}
            >
              {locale === "ar" ? "اعتماد الجلسة وقيد المعاملة المالية" : "Save & Post Financial Record"}
            </Button>
          </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function NewVisitPage() {
  return (
    <Suspense fallback={null}>
      <NewVisitPageContent />
    </Suspense>
  );
}
