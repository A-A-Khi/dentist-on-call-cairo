"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppNavbar } from "../../../../components/layout/AppNavbar";
import { AppSidebar } from "../../../../components/layout/AppSidebar";
import { MobileNav } from "../../../../components/layout/MobileNav";
import { Badge } from "../../../../components/ui/Badge";
import { Tabs } from "../../../../components/ui/Tabs";
import { Modal } from "../../../../components/ui/Modal";
import { getDictionarySync } from "../../../../i18n/get-dictionary";
import { fetchPatientById, fetchPatientVisits } from "../../../../lib/clinical-api";
import type { Patient, Visit } from "../../../../lib/clinical-data";

export default function PatientProfilePage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const patientId = (params?.patientId as string) || "DOC-000104";

  const [patient, setPatient] = useState<Patient>({
    id: "unknown",
    code: patientId || "DOC-NEW",
    fullName: "Patient (" + (patientId || "Unknown") + ")",
    dob: "—",
    age: 0,
    gender: "Male" as const,
    phone: "—",
    whatsappPhone: "—",
    email: "—",
    address: "—",
    emergencyContact: { name: "—", relationship: "—", phone: "—" },
    assignedDoctor: "Dr. Tarek Omar",
    status: "Active" as const,
    lastVisit: "None",
    nextAppointment: null,
    medicalAlerts: [],
    medicalHistory: {
      allergies: "None",
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
      lastVisitDate: "None",
    },
  });

  const [visits, setVisits] = useState<Visit[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const p = await fetchPatientById(patientId);
      if (p) setPatient(p);
      const v = await fetchPatientVisits(patientId);
      setVisits(v);
    }
    loadData();
  }, [patientId]);

  const tabs = [
    { id: "overview", label: dict.patientProfile.tabs.overview },
    { id: "medical", label: dict.patientProfile.tabs.medicalHistory },
    { id: "dental", label: dict.patientProfile.tabs.dentalHistory },
    { id: "visits", label: dict.patientProfile.tabs.visits, count: visits.length },
    { id: "attachments", label: dict.patientProfile.tabs.attachments, count: 0 },
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

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
              <Link href={`/${locale}/patients`} className="hover:text-[#caa95a] transition-colors">
                Patients
              </Link>
              <span>/</span>
              <span className="font-mono text-[#caa95a]">{patient.code}</span>
            </div>

            {/* Patient Header Banner */}
            <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 shadow-xl shadow-black/40">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                {/* Identity */}
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#dfbf70] via-[#caa95a] to-[#99782a] text-lg font-bold text-[#0a0d14] shadow-md shadow-[#caa95a]/20">
                    {patient.fullName
                      .split(" ")
                      .map((n: string) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h1 className="text-xl font-bold text-[#f8fafc] sm:text-2xl">
                        {patient.fullName}
                      </h1>
                      <span className="font-mono text-xs font-semibold text-[#caa95a] bg-[#caa95a]/10 px-2 py-0.5 rounded-lg border border-[#caa95a]/20">
                        {patient.code}
                      </span>
                      <Badge
                        variant={patient.status === "In Treatment" ? "gold" : "green"}
                        size="sm"
                      >
                        {patient.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#94a3b8]">
                      <span>{patient.age} {locale === "ar" ? "سنة" : "years old"} ({patient.dob})</span>
                      <span>•</span>
                      <span>{patient.gender}</span>
                      <span>•</span>
                      <span className="font-mono">{patient.phone}</span>
                      <span>•</span>
                      <span>{dict.patients.table.assignedDoctor}: <strong className="text-[#f8fafc]">{patient.assignedDoctor}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Primary CTA Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2 md:pt-0">
                  <Link
                    href={`/${locale}/patients/${patient.code}/visit/new`}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-4 py-2.5 text-xs font-bold text-[#0a0d14] shadow-lg shadow-[#caa95a]/25 hover:opacity-95 transition-all"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>{dict.patientProfile.startVisit}</span>
                  </Link>

                  <Link
                    href={`/${locale}/calendar`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#24314c] bg-[#151d2c] px-3.5 py-2.5 text-xs font-medium text-[#f8fafc] hover:bg-[#1c263b] transition-colors"
                  >
                    <svg className="h-4 w-4 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{dict.patientProfile.scheduleAppointment}</span>
                  </Link>
                </div>
              </div>

              {/* Critical Medical Alert Badges */}
              {patient.medicalAlerts.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-[#24314c]/60">
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Clinical Alerts:
                  </span>
                  {patient.medicalAlerts.map((alert: string, idx: number) => (
                    <span
                      key={idx}
                      className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-xs font-semibold text-rose-300"
                    >
                      {alert}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <Tabs items={tabs} activeTab={activeTab} onChange={setActiveTab} />

            {/* Tab 1: Overview */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Next Appointment Card */}
                  <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#caa95a] uppercase tracking-wider">
                        Next Appointment
                      </span>
                      <Badge variant="blue" size="sm">Confirmed</Badge>
                    </div>
                    {patient.nextAppointment ? (
                      <div>
                        <p className="text-base font-bold text-[#f8fafc]">{patient.nextAppointment}</p>
                        <p className="text-xs text-[#94a3b8] mt-0.5">
                          Root Canal Obturation (#16) with {patient.assignedDoctor}
                        </p>
                        <p className="text-[11px] text-[#64748b] mt-1">Location: New Cairo Clinic — Room 1</p>
                      </div>
                    ) : (
                      <p className="text-xs text-[#94a3b8]">No upcoming appointment booked.</p>
                    )}
                  </div>

                  {/* Latest Visit Card */}
                  <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#caa95a] uppercase tracking-wider">
                        Latest Visit
                      </span>
                      <span className="text-xs text-[#94a3b8]">{patient.lastVisit}</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#f8fafc]">
                        Symptomatic Apical Periodontitis secondary to Pulpal Necrosis (#16)
                      </p>
                      <p className="text-xs text-[#94a3b8] mt-1 line-clamp-2">
                        Chemo-mechanical canal preparation done, 4 canals shaped, calcium hydroxide placed.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Patient Summary Details & Emergency Contact */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 rounded-2xl border border-[#24314c] bg-[#101622] p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-[#f8fafc]">Demographics & Contact Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#64748b] block">Home Address</span>
                        <span className="text-[#f8fafc] font-medium">{patient.address}</span>
                      </div>
                      <div>
                        <span className="text-[#64748b] block">Email</span>
                        <span className="text-[#f8fafc] font-medium">{patient.email}</span>
                      </div>
                      <div>
                        <span className="text-[#64748b] block">WhatsApp</span>
                        <span className="text-[#f8fafc] font-medium font-mono">{patient.whatsappPhone}</span>
                      </div>
                      <div>
                        <span className="text-[#64748b] block">Smoking Status</span>
                        <span className="text-[#f8fafc] font-medium">{patient.medicalHistory.smokingStatus}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-[#f8fafc]">Emergency Contact</h3>
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-[#f8fafc]">{patient.emergencyContact.name}</p>
                      <p className="text-[#94a3b8]">{patient.emergencyContact.relationship}</p>
                      <p className="font-mono text-[#caa95a]">{patient.emergencyContact.phone}</p>
                    </div>
                  </div>
                </div>

                {/* Chronological Treatment Timeline */}
                <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-[#f8fafc]">Clinical Timeline Events</h3>

                  <div className="relative ps-6 space-y-6 before:absolute before:start-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#24314c]">
                    {/* Event 1 */}
                    <div className="relative">
                      <span className="absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-[#101622] bg-[#caa95a]" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-[#f8fafc]">Clinical Visit Executed</span>
                          <span className="text-[#64748b]">•</span>
                          <span className="text-[#94a3b8]">2026-09-01</span>
                          <span className="text-[#64748b]">by {patient.assignedDoctor}</span>
                        </div>
                        <p className="text-xs text-[#cbd5e1]">
                          Performed emergency chemo-mechanical instrumentation on tooth #16. Prescribed Clindamycin 300mg.
                        </p>
                      </div>
                    </div>

                    {/* Event 2 */}
                    <div className="relative">
                      <span className="absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-[#101622] bg-blue-400" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-[#f8fafc]">Periapical Digital X-Ray Uploaded</span>
                          <span className="text-[#64748b]">•</span>
                          <span className="text-[#94a3b8]">2026-09-01</span>
                        </div>
                        <p className="text-xs text-[#94a3b8]">
                          High-resolution digital sensor exposure captured periapical radiolucency at mesiobuccal root.
                        </p>
                      </div>
                    </div>

                    {/* Event 3 */}
                    <div className="relative">
                      <span className="absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-[#101622] bg-emerald-400" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-[#f8fafc]">Patient File Created</span>
                          <span className="text-[#64748b]">•</span>
                          <span className="text-[#94a3b8]">2026-08-30</span>
                        </div>
                        <p className="text-xs text-[#94a3b8]">
                          Registered through emergency triage. Medical alert flags recorded.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Medical History */}
            {activeTab === "medical" && (
              <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-6">
                <h3 className="text-sm font-semibold text-[#f8fafc]">Medical History & Systemic Conditions</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 space-y-1.5">
                    <span className="font-bold text-rose-300 block">Drug & Material Allergies</span>
                    <p className="text-rose-100">{patient.medicalHistory.allergies}</p>
                  </div>

                  <div className="rounded-xl border border-[#24314c] bg-[#151d2c] p-4 space-y-1.5">
                    <span className="font-bold text-[#caa95a] block">Chronic Conditions</span>
                    <p className="text-[#f8fafc]">
                      {patient.medicalHistory.conditions.join(", ") || "None reported"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#24314c] bg-[#151d2c] p-4 space-y-1.5">
                    <span className="font-bold text-[#caa95a] block">Current Medications</span>
                    <p className="text-[#f8fafc]">{patient.medicalHistory.medications}</p>
                  </div>

                  <div className="rounded-xl border border-[#24314c] bg-[#151d2c] p-4 space-y-1.5">
                    <span className="font-bold text-[#caa95a] block">Previous Surgeries</span>
                    <p className="text-[#f8fafc]">{patient.medicalHistory.surgeries}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-[#24314c] bg-[#151d2c] p-4 space-y-1.5 text-xs">
                  <span className="font-bold text-[#94a3b8] block">Clinical Precautions & Notes</span>
                  <p className="text-[#f8fafc]">{patient.medicalHistory.additionalNotes}</p>
                </div>
              </div>
            )}

            {/* Tab 3: Dental History */}
            {activeTab === "dental" && (
              <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-6">
                <h3 className="text-sm font-semibold text-[#f8fafc]">Dental History & Previous Interventions</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-xl border border-[#24314c] bg-[#151d2c] p-4 space-y-1.5">
                    <span className="font-bold text-[#caa95a] block">Previous Treatments</span>
                    <p className="text-[#f8fafc]">{patient.dentalHistory.previousTreatment}</p>
                  </div>
                  <div className="rounded-xl border border-[#24314c] bg-[#151d2c] p-4 space-y-1.5">
                    <span className="font-bold text-[#caa95a] block">Extractions</span>
                    <p className="text-[#f8fafc]">{patient.dentalHistory.extractions}</p>
                  </div>
                  <div className="rounded-xl border border-[#24314c] bg-[#151d2c] p-4 space-y-1.5">
                    <span className="font-bold text-[#caa95a] block">Root Canals</span>
                    <p className="text-[#f8fafc]">{patient.dentalHistory.rootCanals}</p>
                  </div>
                  <div className="rounded-xl border border-[#24314c] bg-[#151d2c] p-4 space-y-1.5">
                    <span className="font-bold text-[#caa95a] block">Periodontal / Gum Status</span>
                    <p className="text-[#f8fafc]">{patient.dentalHistory.gumProblems}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 4: Visits Timeline */}
            {activeTab === "visits" && (
              <div className="space-y-4">
                {visits.length > 0 ? (
                  visits.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4 shadow-md"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#24314c]/60 gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm text-[#f8fafc]">{v.date}</span>
                          <span className="text-xs text-[#94a3b8] font-mono">{v.time}</span>
                          <Badge variant="green" size="sm">{v.status}</Badge>
                        </div>
                        <span className="text-xs text-[#caa95a] font-medium">Doctor: {v.doctorName}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="font-semibold text-[#94a3b8] block">Chief Complaint</span>
                          <p className="text-[#f8fafc] mt-0.5">{v.chiefComplaint}</p>
                        </div>
                        <div>
                          <span className="font-semibold text-[#94a3b8] block">Diagnosis</span>
                          <p className="text-[#f8fafc] mt-0.5">{v.diagnosis}</p>
                        </div>
                      </div>

                      {/* Procedures Performed */}
                      <div className="rounded-xl border border-[#24314c] bg-[#151d2c] p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#caa95a] block">
                            {locale === "ar" ? "الإجراءات المنفذة والتسعير السريري" : "Procedures Completed & Clinical Fees"}
                          </span>
                          <span className="font-mono text-xs font-bold text-[#caa95a]">
                            {v.procedures.reduce((s: number, p: any) => s + (p.costEGP || 0), 0).toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
                          </span>
                        </div>
                        <div className="divide-y divide-[#24314c]/40 text-xs">
                          {v.procedures.map((p: any) => (
                            <div key={p.id} className="py-2 flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-[#f8fafc]">{p.name}</span>
                                {p.toothNumber && (
                                  <span className="ms-2 font-mono text-[11px] text-[#caa95a] bg-[#caa95a]/10 px-1.5 py-0.5 rounded border border-[#caa95a]/20">
                                    Tooth {p.toothNumber}
                                  </span>
                                )}
                                {p.notes && <p className="text-[11px] text-[#94a3b8] mt-0.5">{p.notes}</p>}
                              </div>
                              <span className="font-mono font-bold text-emerald-400 shrink-0 ms-4">
                                {p.costEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Financial Ledger Auto-post indication */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#24314c]/60 text-xs">
                          <div className="flex items-center gap-2">
                            <Badge variant="green" size="sm">
                              ✓ {locale === "ar" ? "مقيد في الدفتر المالي العام" : "POSTED TO FINANCIAL LEDGER"}
                            </Badge>
                            <span className="text-[#64748b] text-[11px]">
                              {v.procedures.length} {locale === "ar" ? "إجراءات معتمدة" : "procedures billed"}
                            </span>
                          </div>
                          <div className="text-end font-mono text-xs text-[#94a3b8]">
                            {locale === "ar" ? "إيراد عيادة مؤكد" : "Settled Clinical Revenue"}
                          </div>
                        </div>
                      </div>

                      {/* Doctor Progress Notes & Rx */}
                      <div className="text-xs space-y-1">
                        <span className="font-semibold text-[#94a3b8] block">Clinical Notes</span>
                        <p className="text-[#cbd5e1]">{v.doctorNotes}</p>
                      </div>

                      {v.prescriptions && v.prescriptions.length > 0 && (
                        <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3 text-xs space-y-1">
                          <span className="font-bold text-blue-300 block">Prescriptions Issued</span>
                          <ul className="list-disc list-inside text-blue-100 space-y-0.5">
                            {v.prescriptions.map((rx: string, i: number) => (
                              <li key={i}>{rx}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#24314c] bg-[#101622]/40 p-12 text-center">
                    <p className="text-sm font-semibold text-[#f8fafc]">No clinical visits recorded yet</p>
                    <p className="text-xs text-[#94a3b8] mt-1 max-w-sm mx-auto">
                      Use the visit recorder to document findings, odontogram tooth numbers, and completed procedures.
                    </p>
                    <div className="mt-4">
                      <Link
                        href={`/${locale}/patients/${patient.code}/visit/new`}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-4 py-2 text-xs font-semibold text-[#0a0d14]"
                      >
                        + Record First Visit
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 5: Attachments & Media Gallery */}
            {activeTab === "attachments" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#f8fafc]">Radiographs & Clinical Photos</h3>
                  <button
                    type="button"
                    className="rounded-xl border border-[#caa95a]/40 bg-[#caa95a]/15 px-3 py-1.5 text-xs font-semibold text-[#caa95a] hover:bg-[#caa95a]/25 transition-colors"
                  >
                    + Upload New Attachment
                  </button>
                </div>

                <div className="rounded-2xl border border-dashed border-[#24314c] bg-[#101622]/40 p-12 text-center">
                  <p className="text-sm font-semibold text-[#f8fafc]">No radiographs or clinical photos uploaded</p>
                  <p className="text-xs text-[#94a3b8] mt-1">
                    Upload intraoral camera images, periapical X-rays, or panoramic radiographs.
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Lightbox Media Viewer Modal */}
      <Modal
        isOpen={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
        title={selectedMedia || "Media Viewer"}
        size="lg"
      >
        <div className="aspect-video w-full rounded-xl bg-[#080a0f] border border-[#24314c] flex flex-col items-center justify-center p-6 text-center space-y-3">
          <svg className="h-16 w-16 text-[#caa95a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-[#f8fafc]">{selectedMedia}</p>
            <p className="text-xs text-[#94a3b8] mt-1">High-resolution sensor format (2048 x 1536 px) • DICOM encrypted</p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button className="rounded-lg border border-[#24314c] bg-[#151d2c] px-3 py-1 text-xs text-[#f8fafc]">
              Zoom In
            </button>
            <button className="rounded-lg border border-[#24314c] bg-[#151d2c] px-3 py-1 text-xs text-[#f8fafc]">
              Rotate 90°
            </button>
            <button className="rounded-lg border border-[#caa95a]/40 bg-[#caa95a]/20 px-3 py-1 text-xs text-[#caa95a]">
              Download
            </button>
          </div>
        </div>
      </Modal>

      <MobileNav locale={locale} role="ADMIN" />
    </div>
  );
}
