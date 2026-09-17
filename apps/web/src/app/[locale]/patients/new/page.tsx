"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../../components/layout/AppShell";
import { PageHeader } from "../../../../components/layout/PageHeader";
import { Breadcrumb } from "../../../../components/layout/Breadcrumb";
import { Input } from "../../../../components/ui/Input";
import { Textarea } from "../../../../components/ui/Textarea";
import { Button, ButtonLink } from "../../../../components/ui/Button";
import { createPatientRecord, fetchCaseStreams } from "../../../../lib/clinical-api";
import { getDictionarySync } from "../../../../i18n/get-dictionary";
import type { CaseStream } from "../../../../lib/clinical-data";

export default function NewPatientPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const isAr = locale === "ar";

  const [hasAllergies, setHasAllergies] = useState(false);
  const [hasSystemicConditions, setHasSystemicConditions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streams, setStreams] = useState<CaseStream[]>([]);
  const [sourceStreamId, setSourceStreamId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadStreams() {
      const data = await fetchCaseStreams();
      if (!cancelled) {
        setStreams(data);
        if (data[0]) setSourceStreamId(data[0].id);
      }
    }
    void loadStreams();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

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
    const smokingStatus =
      (formData.get("smokingStatus") as "Non-smoker" | "Smoker" | "Former smoker") || "Non-smoker";
    const emergencyName = (formData.get("emergencyName") as string) || "";
    const emergencyRelation = (formData.get("emergencyRelation") as string) || "";
    const emergencyPhone = (formData.get("emergencyPhone") as string) || "";
    const notes = (formData.get("notes") as string) || "";

    try {
      const result = await createPatientRecord({
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
          smokingStatus,
          additionalNotes: notes,
        },
      });
      router.push(`/${locale}/patients/${result.code}`);
    } catch {
      router.push(`/${locale}/patients`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const streamLabel = (stream: CaseStream) =>
    isAr && stream.nameAr ? stream.nameAr : stream.nameEn;

  return (
    <AppShell locale={locale}>
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader
          breadcrumb={
            <Breadcrumb
              items={[
                { label: dict.nav.patients, href: `/${locale}/patients` },
                { label: dict.patientNew.title },
              ]}
            />
          }
          title={dict.patientNew.title}
          subtitle={dict.patientNew.subtitle}
          actions={
            <ButtonLink href={`/${locale}/patients`} variant="secondary" size="sm">
              {dict.patientNew.cancelButton}
            </ButtonLink>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b glass-divider/60">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#caa95a]/20 text-xs font-bold text-gold">
                1
              </div>
              <h2 className="text-sm font-semibold text-primary">{dict.patientNew.step1Title}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input name="fullName" label={dict.patientNew.fullName} placeholder="e.g. Mahmoud Hassan" required />

              <div className="grid grid-cols-2 gap-3">
                <Input name="dob" label={dict.patientNew.dob} type="date" required />
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">{dict.patientNew.gender}</label>
                  <select
                    name="gender"
                    className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  >
                    <option value="Male">{isAr ? "ذكر" : "Male"}</option>
                    <option value="Female">{isAr ? "أنثى" : "Female"}</option>
                  </select>
                </div>
              </div>

              <Input name="phone" label={dict.patientNew.phone} placeholder="+20 1XX XXX XXXX" type="tel" required />
              <Input name="whatsappPhone" label={dict.patientNew.whatsapp} placeholder="+20 1XX XXX XXXX" type="tel" />
              <Input name="email" label={dict.patientNew.email} placeholder="patient@example.com" type="email" />
              <Input name="address" label={dict.patientNew.address} placeholder="e.g. Zamalek, Cairo" />

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-secondary mb-1">{dict.patientNew.caseStream}</label>
                <select
                  name="sourceStreamId"
                  value={sourceStreamId}
                  onChange={(e) => setSourceStreamId(e.target.value)}
                  required={streams.length > 0}
                  className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                >
                  {streams.length === 0 ? (
                    <option value="">{isAr ? "لا توجد قنوات — أضف من الإعدادات" : "No streams — add in Settings"}</option>
                  ) : (
                    streams.map((stream) => (
                      <option key={stream.id} value={stream.id}>
                        {streamLabel(stream)}
                      </option>
                    ))
                  )}
                </select>
                <p className="mt-1.5 text-[10px] text-muted">
                  {isAr
                    ? "من أين جاءت الحالة؟ إعلانات، عيادات شريكة، حضور مباشر، إلخ. يمكن للإدمن إضافة قنوات جديدة من الإعدادات."
                    : "Where did this case come from? Ads, partnership clinics, walk-in, etc. Admins can add streams in Settings."}
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b glass-divider/60">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-xs font-bold text-amber-400">
                2
              </div>
              <h2 className="text-sm font-semibold text-primary">{dict.patientNew.step2Title}</h2>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-secondary">{dict.patientNew.allergiesLabel}</label>
                  <button
                    type="button"
                    onClick={() => setHasAllergies(!hasAllergies)}
                    className={`text-xs font-semibold transition-colors ${
                      hasAllergies ? "text-rose-400" : "text-muted hover:text-secondary"
                    }`}
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
                {hasAllergies ? (
                  <Input name="allergies" placeholder={dict.patientNew.allergiesPlaceholder} required />
                ) : (
                  <p className="text-[11px] text-muted italic">{isAr ? "لا توجد حساسية مسجلة." : "No allergies marked."}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-secondary">{dict.patientNew.conditionsLabel}</label>
                  <button
                    type="button"
                    onClick={() => setHasSystemicConditions(!hasSystemicConditions)}
                    className={`text-xs font-semibold transition-colors ${
                      hasSystemicConditions ? "text-amber-400" : "text-muted hover:text-secondary"
                    }`}
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
                {hasSystemicConditions && (
                  <Input
                    name="conditions"
                    placeholder={isAr ? "مثل: سكري، ضغط، أمراض قلب..." : "e.g. Diabetes, Hypertension, Cardiac..."}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  name="medications"
                  label={dict.patientNew.medicationsLabel}
                  placeholder={isAr ? "مثل: أسبرين، إنسولين..." : "e.g. Aspirin, Insulin..."}
                />
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">{dict.patientNew.smokingLabel}</label>
                  <select
                    name="smokingStatus"
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
            <div className="flex items-center gap-2 pb-3 border-b glass-divider/60">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-400">
                3
              </div>
              <h2 className="text-sm font-semibold text-primary">{dict.patientNew.step3Title}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input name="emergencyName" label={dict.patientNew.emergencyName} placeholder="e.g. Sara Hassan" />
              <Input
                name="emergencyRelation"
                label={dict.patientNew.emergencyRelation}
                placeholder={isAr ? "مثل: زوجة، أب، أخ..." : "e.g. Spouse, Father, Sibling"}
              />
              <Input
                name="emergencyPhone"
                label={dict.patientNew.emergencyPhone}
                placeholder="+20 1XX XXX XXXX"
                type="tel"
              />
            </div>

            <Textarea
              name="notes"
              label={dict.patientNew.chiefComplaintInitial}
              placeholder={isAr ? "سبب الحضور للعيادة أو الشكوى السنية الحالية..." : "Initial notes or chief complaint..."}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <ButtonLink href={`/${locale}/patients`} variant="secondary" size="md">
              {dict.patientNew.cancelButton}
            </ButtonLink>
            <Button variant="primary" size="md" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? isAr
                  ? "جاري إنشاء الملف..."
                  : "Creating Record..."
                : dict.patientNew.submitButton}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
