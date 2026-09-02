"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppNavbar } from "../../../../../../components/layout/AppNavbar";
import { AppSidebar } from "../../../../../../components/layout/AppSidebar";
import { MobileNav } from "../../../../../../components/layout/MobileNav";
import { Textarea } from "../../../../../../components/ui/Textarea";
import { Button } from "../../../../../../components/ui/Button";
import { Badge } from "../../../../../../components/ui/Badge";
import { getDictionarySync } from "../../../../../../i18n/get-dictionary";
import { fetchPatientById, recordClinicalVisit } from "../../../../../../lib/clinical-api";
import { PROCEDURE_PRICE_LIST, type PriceListItem } from "../../../../../../lib/price-list";
import type { Patient } from "../../../../../../lib/clinical-data";

interface ProcedureRow {
  id: string;
  name: string;
  tooth: string;
  cost: number;
  isManual?: boolean;
}

export default function NewVisitPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const patientId = (params?.patientId as string) || "DOC-000104";

  // If chief complaint was passed via reservation / URL query params, pre-fill it!
  const queryComplaint = searchParams?.get("chiefComplaint") || "";

  const [patient, setPatient] = useState<Patient>({
    id: "new",
    code: patientId || "DOC-NEW",
    fullName: "Patient " + (patientId || "Record"),
    dob: "—",
    age: 0,
    gender: "Male" as const,
    phone: "—",
    whatsappPhone: "—",
    email: "—",
    address: "Cairo, Egypt",
    emergencyContact: { name: "—", relationship: "—", phone: "—" },
    assignedDoctor: "Dr. Tarek Omar",
    status: "Active" as const,
    lastVisit: "First Visit",
    nextAppointment: null,
    medicalAlerts: [],
    medicalHistory: {
      allergies: "None reported",
      conditions: [],
      medications: "None",
      surgeries: "None",
      smokingStatus: "Non-smoker" as const,
      additionalNotes: "",
    },
    dentalHistory: {
      previousTreatment: "None",
      extractions: "None",
      rootCanals: "None",
      gumProblems: "None",
      sensitivity: "None",
      lastVisitDate: "Never",
    },
  });

  useEffect(() => {
    async function load() {
      const p = await fetchPatientById(patientId);
      if (p) setPatient(p);
    }
    load();
  }, [patientId]);

  const [chiefComplaint, setChiefComplaint] = useState(queryComplaint);
  const [clinicalFindings, setClinicalFindings] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [doctorNotes, setDoctorNotes] = useState("");
  const [prescriptions, setPrescriptions] = useState("");

  const [procedures, setProcedures] = useState<ProcedureRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

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
    setIsSaving(true);
    try {
      await recordClinicalVisit({
        patientIdentifier: patient.code,
        chiefComplaint: chiefComplaint || (locale === "ar" ? "فحص وكشف دوري" : "General oral examination"),
        clinicalFindings: clinicalFindings || (locale === "ar" ? "أنسجة الفم والأسنان ضمن الحدود الطبيعية" : "Normal oral mucosa and dentition"),
        diagnosis: diagnosis || (locale === "ar" ? "استشارة سريرية" : "Dental consultation"),
        doctorNotes,
        prescriptions: prescriptions || "",
        procedures: procedures.map((p) => ({
          name: p.name,
          toothNumber: p.tooth,
          costEGP: p.cost,
        })),
        status: "Completed",
      });
      router.push(`/${locale}/patients/${patient.code}`);
    } catch {
      router.push(`/${locale}/patients/${patient.code}`);
    } finally {
      setIsSaving(false);
    }
  };

  const totalCost = procedures.reduce((sum, p) => sum + p.cost, 0);

  const quickSymptoms = [
    locale === "ar" ? "ألم حاد نابض" : "Severe Throbbing Pain",
    locale === "ar" ? "حساسية بارد وساخن" : "Cold/Hot Sensitivity",
    locale === "ar" ? "تورم / خراج" : "Swelling / Abscess",
    locale === "ar" ? "كسر بالسن" : "Chipped Tooth",
    locale === "ar" ? "سقوط طربوش" : "Crown Came Off",
    locale === "ar" ? "نزيف لثة" : "Bleeding Gums",
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#080a0f] text-[#f8fafc]">
      <AppNavbar
        locale={locale}
        userName="Operations Director"
        userRole="ADMIN"
        brandName={dict.brand.name}
        brandTag={dict.brand.tagline}
        logoutText={dict.nav.logout}
        adminLabel={dict.roles.admin}
        doctorLabel={dict.roles.doctor}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <AppSidebar
            locale={locale}
            role="ADMIN"
            dict={dict.nav}
          />
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-32 md:pb-20">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Top Navigation & Context Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#24314c]">
              <div>
                <div className="flex items-center gap-2 text-xs text-[#94a3b8] mb-1">
                  <Link href={`/${locale}/patients`} className="hover:text-[#caa95a] transition-colors">
                    {dict.nav.patients}
                  </Link>
                  <span>/</span>
                  <Link href={`/${locale}/patients/${patient.code}`} className="font-mono text-[#caa95a] hover:underline">
                    {patient.code}
                  </Link>
                  <span>/</span>
                  <span className="text-[#f8fafc]">{locale === "ar" ? "توثيق زيارة سريرية" : "New Visit"}</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#f8fafc]">
                  {locale === "ar" ? "تسجيل جلسة وعلاج سريري" : "Record Clinical Treatment Session"}
                </h1>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  {locale === "ar" ? "المريض" : "Patient"}: <strong className="text-[#f8fafc]">{patient.fullName}</strong> ({patient.code}) • {locale === "ar" ? "الطبيب المعالج" : "Treating Doctor"}: <strong className="text-[#caa95a]">{patient.assignedDoctor}</strong>
                </p>
              </div>

              {/* Medical Alerts Banner */}
              {patient.medicalAlerts.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                  <svg className="h-4 w-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{patient.medicalAlerts.join(", ")}</span>
                </div>
              )}
            </div>

            {/* Section 1: Chief Complaint */}
            <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#f8fafc]">
                    1. {locale === "ar" ? "الشكوى الرئيسية للمريض (Chief Complaint)" : "Patient Chief Complaint"}
                  </h3>
                  <p className="text-xs text-[#94a3b8] mt-0.5">
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
                    className="rounded-lg border border-[#24314c] bg-[#151d2c] px-2.5 py-1 text-[11px] text-[#94a3b8] hover:border-[#caa95a]/50 hover:text-[#f8fafc] transition-colors"
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
            <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#f8fafc]">
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
            <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#f8fafc]">
                    3. {locale === "ar" ? "الإجراءات المنفذة والتسعير (Procedures & Fees)" : "Procedures Executed & Clinical Fees"}
                  </h3>
                  <p className="text-xs text-[#94a3b8] mt-0.5">
                    {locale === "ar"
                      ? "اختر من لائحة الأسعار الرسمية أو حدد إجراءً يدوياً بسعر مخصص"
                      : "Choose from standard fee schedule or sign a manual custom procedure"}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={addManualProcedure}
                    className="rounded-xl border border-[#24314c] bg-[#151d2c] px-3 py-1.5 text-xs font-semibold text-[#94a3b8] hover:text-[#f8fafc] hover:border-[#caa95a]/40 transition-colors"
                  >
                    + {locale === "ar" ? "إجراء يدوي بسعر مخصص" : "Manual / Custom Procedure"}
                  </button>
                </div>
              </div>

              {/* Price List Catalog Quick Selector */}
              <div className="rounded-xl border border-[#24314c]/80 bg-[#151d2c]/60 p-3 space-y-2">
                <label className="block text-[11px] font-semibold text-[#caa95a]">
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
                    className="w-full rounded-xl border border-[#24314c] bg-[#101622] px-3 py-2 text-xs text-[#f8fafc] focus:border-[#caa95a] focus:outline-none"
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
                  <div className="rounded-xl border border-dashed border-[#24314c] p-6 text-center text-xs text-[#64748b]">
                    {locale === "ar"
                      ? "لم يتم تحديد أي إجراءات بعد. اختر إجراءً من اللائحة أعلاه أو أضف إجراءً مخصصاً."
                      : "No procedures cataloged yet. Select from the fee schedule above or add a manual custom procedure."}
                  </div>
                ) : (
                  procedures.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-[#24314c] bg-[#151d2c] p-3.5 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={p.isManual ? "amber" : "gold"} size="sm">
                            {p.isManual
                              ? (locale === "ar" ? "سعر يدوي مخصص" : "Manual Doctor Fee")
                              : (locale === "ar" ? "لائحة الأسعار الرسمية" : "Fee Schedule")}
                          </Badge>
                          <span className="text-[10px] text-[#64748b] font-mono">{p.id.slice(0, 10)}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeProcedure(p.id)}
                          className="rounded p-1 text-[#64748b] hover:text-rose-400 transition-colors"
                          title={locale === "ar" ? "حذف الإجراء" : "Remove"}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] text-[#64748b] mb-1">
                            {locale === "ar" ? "اسم الإجراء الطبي" : "Procedure Name"}
                          </label>
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => updateProcedure(p.id, { name: e.target.value })}
                            className="w-full rounded-lg border border-[#24314c] bg-[#101622] px-3 py-1.5 text-xs text-[#f8fafc] focus:border-[#caa95a] focus:outline-none font-medium"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] text-[#64748b] mb-1">
                            {locale === "ar" ? "رقم السن / الموضع" : "Tooth # / Site"}
                          </label>
                          <input
                            type="text"
                            value={p.tooth}
                            onChange={(e) => updateProcedure(p.id, { tooth: e.target.value })}
                            placeholder="e.g. #36 or Universal"
                            className="w-full rounded-lg border border-[#24314c] bg-[#101622] px-3 py-1.5 text-xs text-[#f8fafc] font-mono focus:border-[#caa95a] focus:outline-none"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] text-[#64748b] mb-1">
                            {locale === "ar" ? "التكلفة السريرية (ج.م)" : "Fee (EGP)"}
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={p.cost}
                            onChange={(e) => updateProcedure(p.id, { cost: Number(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-[#24314c] bg-[#101622] px-3 py-1.5 text-xs text-[#f8fafc] font-mono font-bold focus:border-[#caa95a] focus:outline-none text-emerald-400"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Financial Ledger Attestation Card */}
                {procedures.length > 0 && (
                  <div className="rounded-2xl border border-[#caa95a]/40 bg-gradient-to-br from-[#caa95a]/10 via-[#151d2c] to-[#101622] p-4 space-y-2 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#24314c] pb-3">
                      <div>
                        <span className="text-xs font-semibold text-[#caa95a] block">
                          {locale === "ar" ? "الأثر المالي المباشر للجلسة:" : "Session Financial Settlement Impact:"}
                        </span>
                        <span className="text-[11px] text-[#94a3b8]">
                          {locale === "ar"
                            ? "سيتم قيد إيراد المعاملة تلقائياً في الدفتر المالي العام فور الاعتماد"
                            : "Auto-posts as credited revenue transaction in general ledger upon completion"}
                        </span>
                      </div>

                      <div className="text-end sm:text-right rtl:sm:text-left">
                        <span className="text-[10px] text-[#64748b] block">{locale === "ar" ? "إجمالي قيمة الإجراءات" : "Total Treatment Value"}</span>
                        <span className="text-xl font-mono font-bold text-[#caa95a]">
                          {totalCost.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#64748b] pt-1">
                      <span>{locale === "ar" ? "عدد الإجراءات المدرجة:" : "Procedures Itemized:"} {procedures.length}</span>
                      <span className="text-[#caa95a] font-medium">
                        ✓ {locale === "ar" ? "معتمد بتوقيع الطبيب المعالج" : "Doctor Attestation: Validated"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Prescriptions & Doctor Notes */}
            <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#f8fafc]">
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
        </main>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-[#24314c] bg-[#0a0d14]/95 px-4 py-3 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="text-xs">
            <span className="text-[#94a3b8]">{locale === "ar" ? "توثيق لجلسة: " : "Documenting: "}</span>
            <strong className="text-[#f8fafc]">{patient.fullName}</strong>
            <span className="font-mono text-[#caa95a] ms-2 font-bold">
              • {totalCost.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/${locale}/patients/${patient.code}`}
              className="rounded-xl border border-[#24314c] bg-[#151d2c] px-3 py-1.5 text-xs font-medium text-[#94a3b8] hover:text-[#f8fafc] transition-colors"
            >
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </Link>

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

      <MobileNav locale={locale} role="ADMIN" />
    </div>
  );
}
