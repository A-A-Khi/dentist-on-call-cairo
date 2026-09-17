"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../../../components/layout/AppShell";
import { PageHeader } from "../../../../../components/layout/PageHeader";
import { Breadcrumb } from "../../../../../components/layout/Breadcrumb";
import { Input } from "../../../../../components/ui/Input";
import { Textarea } from "../../../../../components/ui/Textarea";
import { Button, ButtonLink } from "../../../../../components/ui/Button";
import { fetchCaseStreams, fetchPatientById, updatePatientRecord } from "../../../../../lib/clinical-api";
import { getDictionarySync } from "../../../../../i18n/get-dictionary";
import { getStoredSessionUser } from "../../../../../lib/session";
import type { CaseStream, Patient } from "../../../../../lib/clinical-data";

function cleanPlaceholder(value?: string | null) {
  if (!value || value === "—" || value === "None" || value === "None reported") return "";
  return value;
}

export default function EditPatientPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const isAr = locale === "ar";
  const patientId = (params?.patientId as string) || "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<CaseStream[]>([]);
  const [sourceStreamId, setSourceStreamId] = useState("");
  const [hasAllergies, setHasAllergies] = useState(false);
  const [hasSystemicConditions, setHasSystemicConditions] = useState(false);
  const [isAdmin, setIsAdmin] = useState(true);

  useEffect(() => {
    const session = getStoredSessionUser();
    setIsAdmin((session?.role ?? "ADMIN") === "ADMIN");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [p, streamData] = await Promise.all([
          fetchPatientById(patientId),
          fetchCaseStreams(),
        ]);
        if (cancelled) return;
        setPatient(p);
        setStreams(streamData);
        if (p?.sourceStreamId) {
          setSourceStreamId(p.sourceStreamId);
        } else if (streamData[0]) {
          setSourceStreamId(streamData[0].id);
        }
        const allergy = cleanPlaceholder(p?.medicalHistory?.allergies);
        const conditions = p?.medicalHistory?.conditions?.filter(Boolean).join(", ") || "";
        setHasAllergies(Boolean(allergy));
        setHasSystemicConditions(Boolean(conditions));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    if (patientId) void load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!patient || !isAdmin) return;
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const fullName = (formData.get("fullName") as string) || "";
    const dob = (formData.get("dob") as string) || "";
    const gender = (formData.get("gender") as "Male" | "Female") || "Male";
    const phone = (formData.get("phone") as string) || "";
    const whatsappPhone = (formData.get("whatsappPhone") as string) || phone;
    const email = (formData.get("email") as string) || "";
    const address = (formData.get("address") as string) || "";
    const allergies = (formData.get("allergies") as string) || "";
    const conditions = (formData.get("conditions") as string) || "";
    const medications = (formData.get("medications") as string) || "";
    const surgeries = (formData.get("surgeries") as string) || "";
    const smokingStatus =
      (formData.get("smokingStatus") as "Non-smoker" | "Smoker" | "Former smoker") || "Non-smoker";
    const emergencyName = (formData.get("emergencyName") as string) || "";
    const emergencyRelation = (formData.get("emergencyRelation") as string) || "";
    const emergencyPhone = (formData.get("emergencyPhone") as string) || "";
    const notes = (formData.get("notes") as string) || "";
    const previousTreatment = (formData.get("previousTreatment") as string) || "";
    const extractions = (formData.get("extractions") as string) || "";
    const rootCanals = (formData.get("rootCanals") as string) || "";
    const gumProblems = (formData.get("gumProblems") as string) || "";
    const sensitivity = (formData.get("sensitivity") as string) || "";

    try {
      const updated = await updatePatientRecord(patient.code, {
        fullName,
        dob,
        gender,
        phone,
        whatsappPhone,
        email,
        address,
        sourceStreamId: sourceStreamId || undefined,
        emergencyContact: {
          name: emergencyName,
          relationship: emergencyRelation,
          phone: emergencyPhone,
        },
        medicalHistory: {
          allergies: hasAllergies ? allergies : "None reported",
          conditions: hasSystemicConditions ? conditions : "",
          medications,
          surgeries,
          smokingStatus,
          additionalNotes: notes,
        },
        dentalHistory: {
          previousTreatment,
          extractions,
          rootCanals,
          gumProblems,
          sensitivity,
        },
      });
      router.push(`/${locale}/patients/${updated.code}`);
    } catch {
      setError(
        isAr ? "تعذر حفظ تعديلات المريض. حاول مرة أخرى." : "Could not save patient changes. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  const streamLabel = (stream: CaseStream) =>
    isAr && stream.nameAr ? stream.nameAr : stream.nameEn;

  if (isLoading) {
    return (
      <AppShell locale={locale}>
        <div className="py-16 text-center text-xs text-secondary">{dict.patientProfile.loading}</div>
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
            {isAr ? "تعديل بيانات المرضى متاح للإدارة فقط" : "Only administrators can edit patient records"}
          </p>
          <ButtonLink href={`/${locale}/patients/${patient.code}`} variant="primary" size="sm" className="mt-2">
            {isAr ? "العودة للملف" : "Back to chart"}
          </ButtonLink>
        </div>
      </AppShell>
    );
  }

  const allergyDefault = cleanPlaceholder(patient.medicalHistory?.allergies);
  const conditionsDefault = patient.medicalHistory?.conditions?.filter(Boolean).join(", ") || "";

  return (
    <AppShell locale={locale}>
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader
          breadcrumb={
            <Breadcrumb
              items={[
                { label: dict.nav.patients, href: `/${locale}/patients` },
                { label: patient.code, href: `/${locale}/patients/${patient.code}` },
                { label: dict.patientEdit.title },
              ]}
            />
          }
          title={dict.patientEdit.title}
          subtitle={`${patient.fullName} (${patient.code})`}
          actions={
            <ButtonLink href={`/${locale}/patients/${patient.code}`} variant="secondary" size="sm">
              {dict.patientEdit.cancelButton}
            </ButtonLink>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-primary pb-3 border-b glass-divider/60">
              {dict.patientNew.step1Title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="fullName"
                label={dict.patientNew.fullName}
                required
                defaultValue={patient.fullName}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input name="dob" label={dict.patientNew.dob} type="date" defaultValue={patient.dob || ""} />
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">{dict.patientNew.gender}</label>
                  <select
                    name="gender"
                    defaultValue={patient.gender || "Male"}
                    className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  >
                    <option value="Male">{isAr ? "ذكر" : "Male"}</option>
                    <option value="Female">{isAr ? "أنثى" : "Female"}</option>
                  </select>
                </div>
              </div>
              <Input
                name="phone"
                label={dict.patientNew.phone}
                type="tel"
                defaultValue={cleanPlaceholder(patient.phone)}
              />
              <Input
                name="whatsappPhone"
                label={dict.patientNew.whatsapp}
                type="tel"
                defaultValue={cleanPlaceholder(patient.whatsappPhone)}
              />
              <Input name="email" label={dict.patientNew.email} type="email" defaultValue={patient.email || ""} />
              <Input name="address" label={dict.patientNew.address} defaultValue={patient.address || ""} />
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-secondary mb-1">{dict.patientNew.caseStream}</label>
                <select
                  value={sourceStreamId}
                  onChange={(e) => setSourceStreamId(e.target.value)}
                  className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                >
                  {streams.length === 0 ? (
                    <option value="">{isAr ? "لا توجد قنوات" : "No streams"}</option>
                  ) : (
                    streams.map((stream) => (
                      <option key={stream.id} value={stream.id}>
                        {streamLabel(stream)}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-primary pb-3 border-b glass-divider/60">
              {dict.patientNew.step2Title}
            </h2>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-secondary">{dict.patientNew.allergiesLabel}</label>
                  <button
                    type="button"
                    onClick={() => setHasAllergies(!hasAllergies)}
                    className={`text-xs font-semibold ${hasAllergies ? "text-rose-400" : "text-muted"}`}
                  >
                    {hasAllergies
                      ? isAr
                        ? "● نعم، توجد حساسية"
                        : "● Has Allergies"
                      : isAr
                        ? "+ تحديد وجود حساسية"
                        : "+ Mark Allergies"}
                  </button>
                </div>
                {hasAllergies && (
                  <Input name="allergies" defaultValue={allergyDefault} placeholder={dict.patientNew.allergiesPlaceholder} />
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-secondary">{dict.patientNew.conditionsLabel}</label>
                  <button
                    type="button"
                    onClick={() => setHasSystemicConditions(!hasSystemicConditions)}
                    className={`text-xs font-semibold ${hasSystemicConditions ? "text-amber-400" : "text-muted"}`}
                  >
                    {hasSystemicConditions
                      ? isAr
                        ? "● توجد حالات جهازية"
                        : "● Has Conditions"
                      : isAr
                        ? "+ إضافة حالات طبية"
                        : "+ Add Conditions"}
                  </button>
                </div>
                {hasSystemicConditions && <Input name="conditions" defaultValue={conditionsDefault} />}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  name="medications"
                  label={dict.patientNew.medicationsLabel}
                  defaultValue={cleanPlaceholder(patient.medicalHistory?.medications)}
                />
                <Input
                  name="surgeries"
                  label={dict.patientNew.surgeriesLabel}
                  defaultValue={cleanPlaceholder(patient.medicalHistory?.surgeries)}
                />
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">{dict.patientNew.smokingLabel}</label>
                  <select
                    name="smokingStatus"
                    defaultValue={patient.medicalHistory?.smokingStatus || "Non-smoker"}
                    className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  >
                    <option value="Non-smoker">{isAr ? "غير مدخن" : "Non-smoker"}</option>
                    <option value="Smoker">{isAr ? "مدخن" : "Smoker"}</option>
                    <option value="Former smoker">{isAr ? "مدخن سابق" : "Former smoker"}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-primary pb-3 border-b glass-divider/60">
              {dict.patientProfile.dentalHistoryTitle}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="previousTreatment"
                label={dict.patientProfile.previousTreatments}
                defaultValue={cleanPlaceholder(patient.dentalHistory?.previousTreatment)}
              />
              <Input
                name="extractions"
                label={dict.patientProfile.extractions}
                defaultValue={cleanPlaceholder(patient.dentalHistory?.extractions)}
              />
              <Input
                name="rootCanals"
                label={dict.patientProfile.rootCanals}
                defaultValue={cleanPlaceholder(patient.dentalHistory?.rootCanals)}
              />
              <Input
                name="gumProblems"
                label={dict.patientProfile.gumStatus}
                defaultValue={cleanPlaceholder(patient.dentalHistory?.gumProblems)}
              />
              <Input
                name="sensitivity"
                label={isAr ? "الحساسية" : "Sensitivity"}
                defaultValue={cleanPlaceholder(patient.dentalHistory?.sensitivity)}
              />
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-primary pb-3 border-b glass-divider/60">
              {dict.patientNew.step3Title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                name="emergencyName"
                label={dict.patientNew.emergencyName}
                defaultValue={cleanPlaceholder(patient.emergencyContact?.name)}
              />
              <Input
                name="emergencyRelation"
                label={dict.patientNew.emergencyRelation}
                defaultValue={cleanPlaceholder(patient.emergencyContact?.relationship)}
              />
              <Input
                name="emergencyPhone"
                label={dict.patientNew.emergencyPhone}
                type="tel"
                defaultValue={cleanPlaceholder(patient.emergencyContact?.phone)}
              />
            </div>
            <Textarea
              name="notes"
              label={dict.patientProfile.clinicalNotesLabel}
              rows={3}
              defaultValue={patient.medicalHistory?.additionalNotes || ""}
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <ButtonLink href={`/${locale}/patients/${patient.code}`} variant="secondary" size="md">
              {dict.patientEdit.cancelButton}
            </ButtonLink>
            <Button variant="primary" size="md" type="submit" disabled={isSubmitting}>
              {isSubmitting ? dict.patientEdit.saving : dict.patientEdit.saveButton}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
