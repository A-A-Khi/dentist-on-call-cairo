"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "../../../../components/layout/AppShell";
import { Breadcrumb } from "../../../../components/layout/Breadcrumb";
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
    <AppShell locale={locale}>
            <Breadcrumb
              items={[
                { label: dict.nav.patients, href: `/${locale}/patients` },
                { label: patient.code },
              ]}
            />

            {/* Patient Header Banner */}
            <div className="glass-card rounded-2xl p-5 sm:p-6 shadow-xl shadow-black/40">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                {/* Identity */}
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#dfbf70] via-[#caa95a] to-[#99782a] text-lg font-bold text-on-gold shadow-md shadow-[#caa95a]/20">
                    {patient.fullName
                      .split(" ")
                      .map((n: string) => n[0])
                      .slice(0, 2)
                      .join("")}
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
                      <span>{patient.age} {locale === "ar" ? "سنة" : "years old"} ({patient.dob})</span>
                      <span>•</span>
                      <span>{patient.gender}</span>
                      <span>•</span>
                      <span className="font-mono">{patient.phone}</span>
                      <span>•</span>
                      <span>{dict.patients.table.assignedDoctor}: <strong className="text-primary">{patient.assignedDoctor}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Primary CTA Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2 md:pt-0">
                  <Link
                    href={`/${locale}/patients/${patient.code}/visit/new`}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-4 py-2.5 text-xs font-bold text-on-gold shadow-lg shadow-[#caa95a]/25 hover:opacity-95 transition-all"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>{dict.patientProfile.startVisit}</span>
                  </Link>

                  <Link
                    href={`/${locale}/calendar`}
                    className="inline-flex items-center gap-1.5 glass rounded-xl px-3.5 py-2.5 text-xs font-medium text-primary hover:bg-slate-100 transition-colors"
                  >
                    <svg className="h-4 w-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{dict.patientProfile.scheduleAppointment}</span>
                  </Link>
                </div>
              </div>

              {/* Critical Medical Alert Badges */}
              {patient.medicalAlerts.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t glass-divider/60">
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Clinical Alerts:
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

            {/* Navigation Tabs */}
            <Tabs items={tabs} activeTab={activeTab} onChange={setActiveTab} />

            {/* Tab 1: Overview */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Next Appointment Card */}
                  <div className="glass-card rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gold uppercase tracking-wider">
                        Next Appointment
                      </span>
                      <Badge variant="blue" size="sm">Confirmed</Badge>
                    </div>
                    {patient.nextAppointment ? (
                      <div>
                        <p className="text-base font-bold text-primary">{patient.nextAppointment}</p>
                        <p className="text-xs text-secondary mt-0.5">
                          Root Canal Obturation (#16) with {patient.assignedDoctor}
                        </p>
                        <p className="text-[11px] text-muted mt-1">Location: New Cairo Clinic — Room 1</p>
                      </div>
                    ) : (
                      <p className="text-xs text-secondary">No upcoming appointment booked.</p>
                    )}
                  </div>

                  {/* Latest Visit Card */}
                  <div className="glass-card rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gold uppercase tracking-wider">
                        Latest Visit
                      </span>
                      <span className="text-xs text-secondary">{patient.lastVisit}</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-primary">
                        Symptomatic Apical Periodontitis secondary to Pulpal Necrosis (#16)
                      </p>
                      <p className="text-xs text-secondary mt-1 line-clamp-2">
                        Chemo-mechanical canal preparation done, 4 canals shaped, calcium hydroxide placed.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Patient Summary Details & Emergency Contact */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 glass-card rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-primary">Demographics & Contact Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted block">Home Address</span>
                        <span className="text-primary font-medium">{patient.address}</span>
                      </div>
                      <div>
                        <span className="text-muted block">Email</span>
                        <span className="text-primary font-medium">{patient.email}</span>
                      </div>
                      <div>
                        <span className="text-muted block">WhatsApp</span>
                        <span className="text-primary font-medium font-mono">{patient.whatsappPhone}</span>
                      </div>
                      <div>
                        <span className="text-muted block">Smoking Status</span>
                        <span className="text-primary font-medium">{patient.medicalHistory.smokingStatus}</span>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card rounded-2xl p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-primary">Emergency Contact</h3>
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-primary">{patient.emergencyContact.name}</p>
                      <p className="text-secondary">{patient.emergencyContact.relationship}</p>
                      <p className="font-mono text-gold">{patient.emergencyContact.phone}</p>
                    </div>
                  </div>
                </div>

                {/* Chronological Treatment Timeline */}
                <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-primary">Clinical Timeline Events</h3>

                  <div className="relative ps-6 space-y-6 before:absolute before:start-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {/* Event 1 */}
                    <div className="relative">
                      <span className="absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#caa95a]" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-primary">Clinical Visit Executed</span>
                          <span className="text-muted">•</span>
                          <span className="text-secondary">2026-09-01</span>
                          <span className="text-muted">by {patient.assignedDoctor}</span>
                        </div>
                        <p className="text-xs text-[#cbd5e1]">
                          Performed emergency chemo-mechanical instrumentation on tooth #16. Prescribed Clindamycin 300mg.
                        </p>
                      </div>
                    </div>

                    {/* Event 2 */}
                    <div className="relative">
                      <span className="absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-400" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-primary">Periapical Digital X-Ray Uploaded</span>
                          <span className="text-muted">•</span>
                          <span className="text-secondary">2026-09-01</span>
                        </div>
                        <p className="text-xs text-secondary">
                          High-resolution digital sensor exposure captured periapical radiolucency at mesiobuccal root.
                        </p>
                      </div>
                    </div>

                    {/* Event 3 */}
                    <div className="relative">
                      <span className="absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-primary">Patient File Created</span>
                          <span className="text-muted">•</span>
                          <span className="text-secondary">2026-08-30</span>
                        </div>
                        <p className="text-xs text-secondary">
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
              <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-6">
                <h3 className="text-sm font-semibold text-primary">Medical History & Systemic Conditions</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-xl border border-rose-500/30 bg-rose-50 p-4 space-y-1.5">
                    <span className="font-bold text-rose-700 block">Drug & Material Allergies</span>
                    <p className="text-rose-100">{patient.medicalHistory.allergies}</p>
                  </div>

                  <div className="glass rounded-xl p-4 space-y-1.5">
                    <span className="font-bold text-gold block">Chronic Conditions</span>
                    <p className="text-primary">
                      {patient.medicalHistory.conditions.join(", ") || "None reported"}
                    </p>
                  </div>

                  <div className="glass rounded-xl p-4 space-y-1.5">
                    <span className="font-bold text-gold block">Current Medications</span>
                    <p className="text-primary">{patient.medicalHistory.medications}</p>
                  </div>

                  <div className="glass rounded-xl p-4 space-y-1.5">
                    <span className="font-bold text-gold block">Previous Surgeries</span>
                    <p className="text-primary">{patient.medicalHistory.surgeries}</p>
                  </div>
                </div>

                <div className="glass rounded-xl p-4 space-y-1.5 text-xs">
                  <span className="font-bold text-secondary block">Clinical Precautions & Notes</span>
                  <p className="text-primary">{patient.medicalHistory.additionalNotes}</p>
                </div>
              </div>
            )}

            {/* Tab 3: Dental History */}
            {activeTab === "dental" && (
              <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-6">
                <h3 className="text-sm font-semibold text-primary">Dental History & Previous Interventions</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="glass rounded-xl p-4 space-y-1.5">
                    <span className="font-bold text-gold block">Previous Treatments</span>
                    <p className="text-primary">{patient.dentalHistory.previousTreatment}</p>
                  </div>
                  <div className="glass rounded-xl p-4 space-y-1.5">
                    <span className="font-bold text-gold block">Extractions</span>
                    <p className="text-primary">{patient.dentalHistory.extractions}</p>
                  </div>
                  <div className="glass rounded-xl p-4 space-y-1.5">
                    <span className="font-bold text-gold block">Root Canals</span>
                    <p className="text-primary">{patient.dentalHistory.rootCanals}</p>
                  </div>
                  <div className="glass rounded-xl p-4 space-y-1.5">
                    <span className="font-bold text-gold block">Periodontal / Gum Status</span>
                    <p className="text-primary">{patient.dentalHistory.gumProblems}</p>
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
                      className="glass-card rounded-2xl p-5 sm:p-6 space-y-4 shadow-md"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b glass-divider/60 gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm text-primary">{v.date}</span>
                          <span className="text-xs text-secondary font-mono">{v.time}</span>
                          <Badge variant="green" size="sm">{v.status}</Badge>
                        </div>
                        <span className="text-xs text-gold font-medium">Doctor: {v.doctorName}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="font-semibold text-secondary block">Chief Complaint</span>
                          <p className="text-primary mt-0.5">{v.chiefComplaint}</p>
                        </div>
                        <div>
                          <span className="font-semibold text-secondary block">Diagnosis</span>
                          <p className="text-primary mt-0.5">{v.diagnosis}</p>
                        </div>
                      </div>

                      {/* Procedures Performed */}
                      <div className="glass rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gold block">
                            {locale === "ar" ? "الإجراءات المنفذة والتسعير السريري" : "Procedures Completed & Clinical Fees"}
                          </span>
                          <span className="font-mono text-xs font-bold text-gold">
                            {v.procedures.reduce((s: number, p: any) => s + (p.costEGP || 0), 0).toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-200 text-xs">
                          {v.procedures.map((p: any) => (
                            <div key={p.id} className="py-2 flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-primary">{p.name}</span>
                                {p.toothNumber && (
                                  <span className="ms-2 font-mono text-[11px] text-gold bg-[#caa95a]/10 px-1.5 py-0.5 rounded border border-[#caa95a]/20">
                                    Tooth {p.toothNumber}
                                  </span>
                                )}
                                {p.notes && <p className="text-[11px] text-secondary mt-0.5">{p.notes}</p>}
                              </div>
                              <span className="font-mono font-bold text-emerald-400 shrink-0 ms-4">
                                {p.costEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Financial Ledger Auto-post indication */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t glass-divider/60 text-xs">
                          <div className="flex items-center gap-2">
                            <Badge variant="green" size="sm">
                              ✓ {locale === "ar" ? "مقيد في الدفتر المالي العام" : "POSTED TO FINANCIAL LEDGER"}
                            </Badge>
                            <span className="text-muted text-[11px]">
                              {v.procedures.length} {locale === "ar" ? "إجراءات معتمدة" : "procedures billed"}
                            </span>
                          </div>
                          <div className="text-end font-mono text-xs text-secondary">
                            {locale === "ar" ? "إيراد عيادة مؤكد" : "Settled Clinical Revenue"}
                          </div>
                        </div>
                      </div>

                      {/* Doctor Progress Notes & Rx */}
                      <div className="text-xs space-y-1">
                        <span className="font-semibold text-secondary block">Clinical Notes</span>
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
                  <div className="glass-card rounded-2xl border-dashed p-12 text-center">
                    <p className="text-sm font-semibold text-primary">No clinical visits recorded yet</p>
                    <p className="text-xs text-secondary mt-1 max-w-sm mx-auto">
                      Use the visit recorder to document findings, odontogram tooth numbers, and completed procedures.
                    </p>
                    <div className="mt-4">
                      <Link
                        href={`/${locale}/patients/${patient.code}/visit/new`}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-4 py-2 text-xs font-semibold text-on-gold"
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
                  <h3 className="text-sm font-semibold text-primary">Radiographs & Clinical Photos</h3>
                  <button
                    type="button"
                    className="rounded-xl border border-[#caa95a]/40 bg-[#caa95a]/15 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-[#caa95a]/25 transition-colors"
                  >
                    + Upload New Attachment
                  </button>
                </div>

                <div className="glass-card rounded-2xl border-dashed p-12 text-center">
                  <p className="text-sm font-semibold text-primary">No radiographs or clinical photos uploaded</p>
                  <p className="text-xs text-secondary mt-1">
                    Upload intraoral camera images, periapical X-rays, or panoramic radiographs.
                  </p>
                </div>
              </div>
            )}

      <Modal
        isOpen={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
        title={selectedMedia || "Media Viewer"}
        size="lg"
      >
        <div className="glass aspect-video w-full rounded-xl flex flex-col items-center justify-center p-6 text-center space-y-3">
          <svg className="h-16 w-16 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-primary">{selectedMedia}</p>
            <p className="text-xs text-secondary mt-1">High-resolution sensor format (2048 x 1536 px) • DICOM encrypted</p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button className="rounded-lg glass px-3 py-1 text-xs text-primary">
              Zoom In
            </button>
            <button className="rounded-lg glass px-3 py-1 text-xs text-primary">
              Rotate 90°
            </button>
            <button className="rounded-lg border border-[#caa95a]/40 bg-[#caa95a]/20 px-3 py-1 text-xs text-gold">
              Download
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
