"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../../components/layout/AppShell";
import { PageHeader } from "../../../../components/layout/PageHeader";
import { Breadcrumb } from "../../../../components/layout/Breadcrumb";
import { Input } from "../../../../components/ui/Input";
import { Textarea } from "../../../../components/ui/Textarea";
import { Button } from "../../../../components/ui/Button";
import { createPatientRecord } from "../../../../lib/clinical-api";
import { getDictionarySync } from "../../../../i18n/get-dictionary";

export default function NewPatientPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  const [hasAllergies, setHasAllergies] = useState(false);
  const [hasSystemicConditions, setHasSystemicConditions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const smokingStatus = (formData.get("smokingStatus") as "Non-smoker" | "Smoker" | "Former smoker") || "Non-smoker";
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
            <Link
              href={`/${locale}/patients`}
              className="glass rounded-xl px-3.5 py-2 text-xs font-medium text-secondary hover:text-primary transition-colors"
            >
              {dict.patientNew.cancelButton}
            </Link>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Demographics */}
          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b glass-divider/60">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#caa95a]/20 text-xs font-bold text-gold">
                1
              </div>
              <h2 className="text-sm font-semibold text-primary">
                {dict.patientNew.step1Title}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="fullName"
                label={dict.patientNew.fullName}
                placeholder="e.g. Mahmoud Hassan"
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  name="dob"
                  label={dict.patientNew.dob}
                  type="date"
                  required
                />
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">
                    {dict.patientNew.gender}
                  </label>
                  <select
                    name="gender"
                    className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  >
                    <option value="Male">{locale === "ar" ? "ذكر" : "Male"}</option>
                    <option value="Female">{locale === "ar" ? "أنثى" : "Female"}</option>
                  </select>
                </div>
              </div>

              <Input
                name="phone"
                label={dict.patientNew.phone}
                placeholder="+20 1XX XXX XXXX"
                type="tel"
                required
              />

              <Input
                name="whatsappPhone"
                label={dict.patientNew.whatsapp}
                placeholder="+20 1XX XXX XXXX"
                type="tel"
              />

              <Input
                name="email"
                label={dict.patientNew.email}
                placeholder="patient@example.com"
                type="email"
              />

              <Input
                name="address"
                label={dict.patientNew.address}
                placeholder="e.g. Zamalek, Cairo"
              />
            </div>
          </div>

          {/* Section 2: Medical History */}
          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b glass-divider/60">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-xs font-bold text-amber-400">
                2
              </div>
              <h2 className="text-sm font-semibold text-primary">
                {dict.patientNew.step2Title}
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-secondary">
                    {dict.patientNew.allergiesLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => setHasAllergies(!hasAllergies)}
                    className={`text-xs font-semibold transition-colors ${
                      hasAllergies ? "text-rose-400" : "text-muted hover:text-secondary"
                    }`}
                  >
                    {hasAllergies
                      ? locale === "ar" ? "● نعم، توجد حساسية" : "● Has Allergies"
                      : locale === "ar" ? "+ تحديد وجود حساسية" : "+ Mark Allergies"}
                  </button>
                </div>
                {hasAllergies ? (
                  <Input
                    name="allergies"
                    placeholder={dict.patientNew.allergiesPlaceholder}
                    required
                  />
                ) : (
                  <div className="glass rounded-xl/50 px-3.5 py-2 text-xs text-muted">
                    {locale === "ar" ? "لا توجد حساسية دوائية أو غذائية مسجلة" : "No known allergies reported"}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-secondary">
                    {dict.patientNew.conditionsLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => setHasSystemicConditions(!hasSystemicConditions)}
                    className={`text-xs font-semibold transition-colors ${
                      hasSystemicConditions ? "text-amber-400" : "text-muted hover:text-secondary"
                    }`}
                  >
                    {hasSystemicConditions
                      ? locale === "ar" ? "● نعم، أمراض مزمنة" : "● Chronic Conditions"
                      : locale === "ar" ? "+ تحديد أمراض مزمنة" : "+ Add Conditions"}
                  </button>
                </div>
                {hasSystemicConditions ? (
                  <Input
                    name="conditions"
                    placeholder={locale === "ar" ? "مثل: سكري، ضغط، سيولة الدم..." : "e.g. Hypertension, Diabetes, Heart Disease..."}
                    required
                  />
                ) : (
                  <div className="glass rounded-xl/50 px-3.5 py-2 text-xs text-muted">
                    {locale === "ar" ? "لا توجد أمراض مزمنة مسجلة" : "No systemic chronic conditions"}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  name="medications"
                  label={dict.patientNew.medicationsLabel}
                  placeholder={locale === "ar" ? "مثل: أسبرين، ميتفورمين..." : "e.g. Aspirin, Anticoagulants, Metformin..."}
                />

                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">
                    {dict.patientNew.smokingLabel}
                  </label>
                  <select
                    name="smokingStatus"
                    className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  >
                    <option value="Non-smoker">{locale === "ar" ? "غير مدخن" : "Non-smoker"}</option>
                    <option value="Smoker">{locale === "ar" ? "مدخن" : "Smoker"}</option>
                    <option value="Former smoker">{locale === "ar" ? "مدخن سابق" : "Former smoker"}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Emergency Contact & Assignment */}
          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b glass-divider/60">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-400">
                3
              </div>
              <h2 className="text-sm font-semibold text-primary">
                {dict.patientNew.step3Title}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                name="emergencyName"
                label={dict.patientNew.emergencyName}
                placeholder="e.g. Sara Hassan"
              />
              <Input
                name="emergencyRelation"
                label={dict.patientNew.emergencyRelation}
                placeholder={locale === "ar" ? "مثل: زوجة، أب، أخ..." : "e.g. Spouse, Father, Sibling"}
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
              placeholder={locale === "ar" ? "سبب الحضور للعيادة أو الشكوى السنية الحالية..." : "Initial notes, chief complaint, referral source..."}
              rows={3}
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href={`/${locale}/patients`}
              className="glass rounded-xl px-5 py-2.5 text-xs font-semibold text-secondary hover:text-primary transition-colors"
            >
              {dict.patientNew.cancelButton}
            </Link>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? locale === "ar" ? "جاري إنشاء الملف..." : "Creating Record..."
                : dict.patientNew.submitButton}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
