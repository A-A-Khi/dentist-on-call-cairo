import { ApiError, apiClient } from "./api-client";
import type {
  Appointment,
  AuditLogRecord,
  CaseStream,
  DashboardOverview,
  Doctor,
  FinancialCategory,
  FinancialSummary,
  FinancialTransaction,
  Patient,
  ReportAnalytics,
  RevenueShare,
  Visit,
} from "./clinical-data";

const STORAGE_KEYS = {
  PATIENTS: "doc_clinical_patients",
  VISITS: "doc_clinical_visits",
  APPOINTMENTS: "doc_clinical_appointments",
  FINANCIALS: "doc_clinical_financials",
};

function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, val: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Ignore quota issues
  }
}

/** Re-throw server errors so UI does not treat validation/auth failures as offline success. */
function rethrowApiError(err: unknown): void {
  if (err instanceof ApiError) {
    throw err;
  }
}

type SmokingStatus = Patient["medicalHistory"]["smokingStatus"];

function asSmokingStatus(value?: string): SmokingStatus {
  if (value === "Smoker" || value === "Former smoker" || value === "Non-smoker") {
    return value;
  }
  return "Non-smoker";
}

interface AuditLogApiRow {
  id: string;
  actor_user_id?: string | null;
  actor_role?: "ADMIN" | "DOCTOR" | null;
  action: string;
  target_id?: string | null;
  occurred_at: string;
  description?: string | null;
}

// -----------------------------
// PATIENTS API
// -----------------------------

export async function fetchPatients(query?: string): Promise<Patient[]> {
  try {
    const endpoint = query ? `/patients?q=${encodeURIComponent(query)}` : "/patients";
    const data = await apiClient<Patient[]>(endpoint);
    if (Array.isArray(data)) {
      setLocal(STORAGE_KEYS.PATIENTS, data);
      return data;
    }
  } catch {
    // Fallback to local persistent cache only when API is unreachable
  }
  const cached = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
  if (!query) return cached;
  const q = query.toLowerCase();
  return cached.filter(
    (p) =>
      p.fullName.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.phone.includes(q)
  );
}

export async function fetchPatientById(patientId: string): Promise<Patient | null> {
  try {
    const data = await apiClient<Patient>(`/patients/${encodeURIComponent(patientId)}`);
    if (data && data.id) {
      return data;
    }
  } catch (err) {
    // 404 means the patient is not on the server — do not resurrect stale local ghosts.
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
  }
  const cached = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
  return cached.find((p) => p.code === patientId || p.id === patientId) || null;
}

export interface CreatePatientInput {
  fullName: string;
  dob?: string;
  gender?: "Male" | "Female";
  phone?: string;
  whatsappPhone?: string;
  email?: string;
  address?: string;
  sourceStreamId?: string;
  emergencyContact?: { name: string; relationship: string; phone: string };
  assignedDoctorId?: string;
  medicalHistory?: {
    allergies?: string;
    conditions?: string;
    medications?: string;
    surgeries?: string;
    smokingStatus?: string;
    additionalNotes?: string;
  };
  dentalHistory?: {
    previousTreatment?: string;
    extractions?: string;
    rootCanals?: string;
    gumProblems?: string;
    sensitivity?: string;
    other?: string;
  };
}

export async function createPatientRecord(input: CreatePatientInput): Promise<{ id: string; code: string; fullName: string }> {
  try {
    const response = await apiClient<{ id: string; code: string; fullName: string }>("/patients", {
      method: "POST",
      body: JSON.stringify({
        full_name: input.fullName,
        date_of_birth: input.dob || null,
        gender: input.gender || "Male",
        phone: input.phone || null,
        whatsapp_phone: input.whatsappPhone || null,
        email: input.email || null,
        address: input.address || null,
        source_stream_id: input.sourceStreamId || null,
        emergency_contact: input.emergencyContact || null,
        assigned_doctor_id: input.assignedDoctorId || null,
        medical_history: input.medicalHistory
          ? {
              allergies: input.medicalHistory.allergies,
              conditions: input.medicalHistory.conditions,
              medications: input.medicalHistory.medications,
              surgeries: input.medicalHistory.surgeries,
              smoking_status: input.medicalHistory.smokingStatus,
              additional_notes: input.medicalHistory.additionalNotes,
            }
          : null,
        dental_history: input.dentalHistory
          ? {
              previous_treatment: input.dentalHistory.previousTreatment,
              extractions: input.dentalHistory.extractions,
              root_canals: input.dentalHistory.rootCanals,
              gum_problems: input.dentalHistory.gumProblems,
              sensitivity: input.dentalHistory.sensitivity,
              other: input.dentalHistory.other,
            }
          : null,
      }),
    });

    // Refresh local cache
    const existing = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
    const newRecord: Patient = {
      id: response.id,
      code: response.code,
      fullName: response.fullName,
      dob: input.dob || "",
      age: input.dob ? new Date().getFullYear() - new Date(input.dob).getFullYear() : 0,
      gender: input.gender || "Male",
      phone: input.phone || "—",
      whatsappPhone: input.whatsappPhone || "—",
      email: input.email || "",
      address: input.address || "",
      emergencyContact: input.emergencyContact || { name: "—", relationship: "—", phone: "—" },
      assignedDoctor: "Dr. Sayed El-Bahy",
      status: "Active",
      lastVisit: new Date().toISOString().split("T")[0],
      nextAppointment: null,
      sourceStreamId: input.sourceStreamId || null,
      sourceStream: null,
      medicalAlerts: input.medicalHistory?.allergies ? [`Allergy: ${input.medicalHistory.allergies}`] : [],
      medicalHistory: {
        allergies: input.medicalHistory?.allergies || "None reported",
        conditions: input.medicalHistory?.conditions ? [input.medicalHistory.conditions] : [],
        medications: input.medicalHistory?.medications || "None",
        surgeries: input.medicalHistory?.surgeries || "None",
        smokingStatus: asSmokingStatus(input.medicalHistory?.smokingStatus),
        additionalNotes: input.medicalHistory?.additionalNotes || "",
      },
      dentalHistory: {
        previousTreatment: input.dentalHistory?.previousTreatment || "None",
        extractions: input.dentalHistory?.extractions || "None",
        rootCanals: input.dentalHistory?.rootCanals || "None",
        gumProblems: input.dentalHistory?.gumProblems || "None",
        sensitivity: input.dentalHistory?.sensitivity || "None",
        lastVisitDate: "First visit",
      },
    };
    setLocal(STORAGE_KEYS.PATIENTS, [newRecord, ...existing]);
    return response;
  } catch (err) {
    // Auth/CSRF/validation failures must surface — do not invent local-only patients.
    rethrowApiError(err);
    // Local offline creation fallback (network / server down)
    const existing = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
    const nextNum = 100 + existing.length + 1;
    const code = `DOC-${String(nextNum).padStart(6, "0")}`;
    const id = `loc_${Date.now()}`;
    const newRecord: Patient = {
      id,
      code,
      fullName: input.fullName,
      dob: input.dob || "",
      age: input.dob ? new Date().getFullYear() - new Date(input.dob).getFullYear() : 0,
      gender: input.gender || "Male",
      phone: input.phone || "—",
      whatsappPhone: input.whatsappPhone || "—",
      email: input.email || "",
      address: input.address || "",
      emergencyContact: input.emergencyContact || { name: "—", relationship: "—", phone: "—" },
      assignedDoctor: "Dr. Sayed El-Bahy",
      status: "Active",
      lastVisit: new Date().toISOString().split("T")[0],
      nextAppointment: null,
      sourceStreamId: input.sourceStreamId || null,
      sourceStream: null,
      medicalAlerts: input.medicalHistory?.allergies ? [`Allergy: ${input.medicalHistory.allergies}`] : [],
      medicalHistory: {
        allergies: input.medicalHistory?.allergies || "None reported",
        conditions: input.medicalHistory?.conditions ? [input.medicalHistory.conditions] : [],
        medications: input.medicalHistory?.medications || "None",
        surgeries: input.medicalHistory?.surgeries || "None",
        smokingStatus: asSmokingStatus(input.medicalHistory?.smokingStatus),
        additionalNotes: input.medicalHistory?.additionalNotes || "",
      },
      dentalHistory: {
        previousTreatment: input.dentalHistory?.previousTreatment || "None",
        extractions: input.dentalHistory?.extractions || "None",
        rootCanals: input.dentalHistory?.rootCanals || "None",
        gumProblems: input.dentalHistory?.gumProblems || "None",
        sensitivity: input.dentalHistory?.sensitivity || "None",
        lastVisitDate: "First visit",
      },
    };
    setLocal(STORAGE_KEYS.PATIENTS, [newRecord, ...existing]);
    return { id, code, fullName: input.fullName };
  }
}

export type UpdatePatientInput = CreatePatientInput & {
  status?: string;
};

export async function updatePatientRecord(
  patientIdentifier: string,
  input: UpdatePatientInput
): Promise<Patient> {
  try {
    const response = await apiClient<Patient>(`/patients/${encodeURIComponent(patientIdentifier)}`, {
      method: "PATCH",
      body: JSON.stringify({
        full_name: input.fullName,
        date_of_birth: input.dob || null,
        gender: input.gender || "Male",
        phone: input.phone || null,
        whatsapp_phone: input.whatsappPhone || null,
        email: input.email || null,
        address: input.address || null,
        source_stream_id: input.sourceStreamId || null,
        emergency_contact: input.emergencyContact || null,
        assigned_doctor_id: input.assignedDoctorId || null,
        status: input.status || null,
        medical_history: input.medicalHistory
          ? {
              allergies: input.medicalHistory.allergies,
              conditions: input.medicalHistory.conditions,
              medications: input.medicalHistory.medications,
              surgeries: input.medicalHistory.surgeries,
              smoking_status: input.medicalHistory.smokingStatus,
              additional_notes: input.medicalHistory.additionalNotes,
            }
          : null,
        dental_history: input.dentalHistory
          ? {
              previous_treatment: input.dentalHistory.previousTreatment,
              extractions: input.dentalHistory.extractions,
              root_canals: input.dentalHistory.rootCanals,
              gum_problems: input.dentalHistory.gumProblems,
              sensitivity: input.dentalHistory.sensitivity,
              other: input.dentalHistory.other,
            }
          : null,
      }),
    });

    const existing = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
    setLocal(
      STORAGE_KEYS.PATIENTS,
      existing.map((p) => (p.id === response.id || p.code === response.code ? { ...p, ...response } : p))
    );
    return response;
  } catch (err) {
    rethrowApiError(err);
    const existing = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
    const idx = existing.findIndex((p) => p.code === patientIdentifier || p.id === patientIdentifier);
    if (idx < 0) throw new Error("Patient not found");
    const current = existing[idx];
    const updated: Patient = {
      ...current,
      fullName: input.fullName,
      dob: input.dob || current.dob,
      age: input.dob ? new Date().getFullYear() - new Date(input.dob).getFullYear() : current.age,
      gender: input.gender || current.gender,
      phone: input.phone || current.phone,
      whatsappPhone: input.whatsappPhone || current.whatsappPhone,
      email: input.email || current.email,
      address: input.address || current.address,
      sourceStreamId: input.sourceStreamId ?? current.sourceStreamId,
      emergencyContact: input.emergencyContact || current.emergencyContact,
      medicalAlerts: input.medicalHistory?.allergies
        ? [`Allergy: ${input.medicalHistory.allergies}`]
        : current.medicalAlerts,
      medicalHistory: {
        allergies: input.medicalHistory?.allergies || current.medicalHistory.allergies,
        conditions: input.medicalHistory?.conditions
          ? [input.medicalHistory.conditions]
          : current.medicalHistory.conditions,
        medications: input.medicalHistory?.medications || current.medicalHistory.medications,
        surgeries: input.medicalHistory?.surgeries || current.medicalHistory.surgeries,
        smokingStatus: asSmokingStatus(
          input.medicalHistory?.smokingStatus || current.medicalHistory.smokingStatus
        ),
        additionalNotes:
          input.medicalHistory?.additionalNotes ?? current.medicalHistory.additionalNotes,
      },
      dentalHistory: {
        previousTreatment:
          input.dentalHistory?.previousTreatment || current.dentalHistory.previousTreatment,
        extractions: input.dentalHistory?.extractions || current.dentalHistory.extractions,
        rootCanals: input.dentalHistory?.rootCanals || current.dentalHistory.rootCanals,
        gumProblems: input.dentalHistory?.gumProblems || current.dentalHistory.gumProblems,
        sensitivity: input.dentalHistory?.sensitivity || current.dentalHistory.sensitivity,
        lastVisitDate: current.dentalHistory.lastVisitDate,
      },
    };
    const next = [...existing];
    next[idx] = updated;
    setLocal(STORAGE_KEYS.PATIENTS, next);
    return updated;
  }
}

export async function deletePatientRecord(
  patientIdentifier: string
): Promise<{ id: string; code: string; deleted: boolean }> {
  try {
    const response = await apiClient<{ id: string; code: string; deleted: boolean }>(
      `/patients/${encodeURIComponent(patientIdentifier)}`,
      { method: "DELETE" }
    );
    const existing = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
    setLocal(
      STORAGE_KEYS.PATIENTS,
      existing.filter((p) => p.id !== response.id && p.code !== response.code && p.code !== patientIdentifier && p.id !== patientIdentifier)
    );
    const apts = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
    setLocal(
      STORAGE_KEYS.APPOINTMENTS,
      apts.filter((a) => a.patientCode !== response.code && a.patientCode !== patientIdentifier)
    );
    return response;
  } catch (err) {
    // Production API may not have DELETE yet — deactivate + cancel open bookings.
    if (err instanceof ApiError && (err.status === 405 || err.status === 404)) {
      const patient = await fetchPatientById(patientIdentifier);
      if (!patient) throw err;
      await updatePatientRecord(patientIdentifier, {
        fullName: patient.fullName,
        status: "INACTIVE",
      });
      const apts = await fetchAppointments(undefined, {
        from: new Date().toISOString().slice(0, 10),
      });
      await Promise.all(
        apts
          .filter(
            (a) =>
              (a.patientCode === patient.code || a.patientCode === patientIdentifier) &&
              (a.status === "PENDING" || a.status === "CONFIRMED")
          )
          .map((a) => updateAppointmentStatus(a.id, "CANCELLED", "Patient deleted"))
      );
      const existing = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
      setLocal(
        STORAGE_KEYS.PATIENTS,
        existing.filter((p) => p.id !== patient.id && p.code !== patient.code)
      );
      return { id: patient.id, code: patient.code, deleted: true };
    }
    if (err instanceof ApiError) throw err;
    const existing = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
    const match = existing.find((p) => p.code === patientIdentifier || p.id === patientIdentifier);
    if (!match) throw err;
    setLocal(
      STORAGE_KEYS.PATIENTS,
      existing.filter((p) => p.id !== match.id)
    );
    const apts = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
    setLocal(
      STORAGE_KEYS.APPOINTMENTS,
      apts.filter((a) => a.patientCode !== match.code)
    );
    return { id: match.id, code: match.code, deleted: true };
  }
}

// -----------------------------
// VISITS API
// -----------------------------

export async function fetchPatientVisits(patientIdentifier: string): Promise<Visit[]> {
  try {
    const data = await apiClient<Visit[]>(`/patients/${encodeURIComponent(patientIdentifier)}/visits`);
    if (Array.isArray(data)) {
      return data;
    }
  } catch {
    // Fallback
  }
  const cached = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
  return cached.filter((v) => v.patientId === patientIdentifier);
}

export interface CreateVisitInput {
  patientIdentifier: string;
  chiefComplaint: string;
  clinicalFindings: string;
  diagnosis: string;
  doctorNotes: string;
  prescriptions: string;
  procedures: { name: string; toothNumber?: string; costEGP: number }[];
  status?: "Completed" | "Draft";
  paidEGP?: number;
  caseCostEGP?: number;
  caseCostNote?: string;
  sourceStreamId?: string;
  appointmentId?: string;
}

function visitPaymentFields(procedures: { costEGP: number }[], paidEGP?: number) {
  const totalCostEGP = procedures.reduce((sum, p) => sum + (p.costEGP || 0), 0);
  const paidAmountEGP =
    paidEGP === undefined ? totalCostEGP : Math.max(0, Math.min(paidEGP, totalCostEGP));
  return {
    totalCostEGP,
    paidAmountEGP,
    remainingEGP: totalCostEGP - paidAmountEGP,
  };
}

export async function recordClinicalVisit(input: CreateVisitInput): Promise<{ id: string; status: string }> {
  const payment = visitPaymentFields(input.procedures, input.paidEGP);
  const caseCostEGP = Math.max(0, input.caseCostEGP || 0);
  const caseCostNote = input.caseCostNote?.trim() || undefined;
  try {
    const response = await apiClient<{ id: string; status: string }>(
      `/patients/${encodeURIComponent(input.patientIdentifier)}/visits`,
      {
        method: "POST",
        body: JSON.stringify({
          chief_complaint: input.chiefComplaint,
          clinical_findings: input.clinicalFindings,
          diagnosis: input.diagnosis,
          doctor_notes: input.doctorNotes,
          prescriptions: input.prescriptions,
          procedures: input.procedures.map((p) => ({
            name: p.name,
            tooth_number: p.toothNumber || null,
            cost_egp: p.costEGP || 0,
          })),
          status: input.status || "Completed",
          paid_egp: payment.paidAmountEGP,
          case_cost_egp: caseCostEGP,
          case_cost_note: caseCostNote || null,
          source_stream_id: input.sourceStreamId || null,
          appointment_id: input.appointmentId || null,
        }),
      }
    );

    // Keep local appointment cache in sync when visit came from calendar.
    if (input.appointmentId) {
      const existingApts = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
      setLocal(
        STORAGE_KEYS.APPOINTMENTS,
        existingApts.map((a) =>
          a.id === input.appointmentId ? { ...a, status: "COMPLETED" as const } : a
        )
      );
    }

    // Save locally
    const existing = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
    const newVisit: Visit = {
      id: response.id,
      patientId: input.patientIdentifier,
      doctorName: "Dr. Sayed El-Bahy",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      chiefComplaint: input.chiefComplaint || "—",
      clinicalFindings: input.clinicalFindings || "—",
      diagnosis: input.diagnosis || "—",
      procedures: input.procedures.map((p, i) => ({
        id: `proc_${i}_${Date.now()}`,
        name: p.name,
        toothNumber: p.toothNumber || "General",
        costEGP: p.costEGP,
        status: "Completed",
      })),
      attachments: [],
      doctorNotes: input.doctorNotes || "—",
      prescriptions: input.prescriptions ? [input.prescriptions] : [],
      status: "Completed",
      caseCostEGP,
      caseCostNote: caseCostNote || null,
      ...payment,
    };
    setLocal(STORAGE_KEYS.VISITS, [newVisit, ...existing]);

    if (payment.paidAmountEGP > 0) {
      const existingTx = getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
      const procList = input.procedures.map((p) => `${p.name}${p.toothNumber ? ` (#${p.toothNumber})` : ""}`).join(", ");
      const newTx: FinancialTransaction = {
        id: `TX-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split("T")[0],
        type: "REVENUE",
        category: "Clinical Procedures",
        amountEGP: payment.paidAmountEGP,
        patientName: input.patientIdentifier,
        patientCode: input.patientIdentifier,
        doctorName: "Dr. Sayed El-Bahy",
        description:
          payment.remainingEGP > 0
            ? `Partial payment ${payment.paidAmountEGP}/${payment.totalCostEGP} EGP: ${procList}`
            : `Procedures: ${procList}`,
        status: "POSTED",
      };
      setLocal(STORAGE_KEYS.FINANCIALS, [newTx, ...existingTx]);
    }

    return response;
  } catch (err) {
    // Server rejected the visit (auth, validation, missing patient) — do not fake success.
    rethrowApiError(err);
    const id = `visit_${Date.now()}`;
    const existing = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
    const newVisit: Visit = {
      id,
      patientId: input.patientIdentifier,
      doctorName: "Dr. Sayed El-Bahy",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      chiefComplaint: input.chiefComplaint || "—",
      clinicalFindings: input.clinicalFindings || "—",
      diagnosis: input.diagnosis || "—",
      procedures: input.procedures.map((p, i) => ({
        id: `proc_${i}_${Date.now()}`,
        name: p.name,
        toothNumber: p.toothNumber || "General",
        costEGP: p.costEGP,
        status: "Completed",
      })),
      attachments: [],
      doctorNotes: input.doctorNotes || "—",
      prescriptions: input.prescriptions ? [input.prescriptions] : [],
      status: "Completed",
      caseCostEGP,
      caseCostNote: caseCostNote || null,
      ...payment,
    };
    setLocal(STORAGE_KEYS.VISITS, [newVisit, ...existing]);

    if (input.appointmentId) {
      const existingApts = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
      setLocal(
        STORAGE_KEYS.APPOINTMENTS,
        existingApts.map((a) =>
          a.id === input.appointmentId ? { ...a, status: "COMPLETED" as const } : a
        )
      );
    }

    if (payment.paidAmountEGP > 0) {
      const existingTx = getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
      const procList = input.procedures.map((p) => `${p.name}${p.toothNumber ? ` (#${p.toothNumber})` : ""}`).join(", ");
      const newTx: FinancialTransaction = {
        id: `TX-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split("T")[0],
        type: "REVENUE",
        category: "Clinical Procedures",
        amountEGP: payment.paidAmountEGP,
        patientName: input.patientIdentifier,
        patientCode: input.patientIdentifier,
        doctorName: "Dr. Sayed El-Bahy",
        description:
          payment.remainingEGP > 0
            ? `Partial payment ${payment.paidAmountEGP}/${payment.totalCostEGP} EGP: ${procList}`
            : `Procedures: ${procList}`,
        status: "POSTED",
      };
      setLocal(STORAGE_KEYS.FINANCIALS, [newTx, ...existingTx]);
    }

    return { id, status: "Completed" };
  }
}

export async function recordVisitPayment(
  visitId: string,
  amountEGP: number
): Promise<{
  id: string;
  totalCostEGP: number;
  paidAmountEGP: number;
  remainingEGP: number;
  revenueShare?: RevenueShare;
}> {
  try {
    const response = await apiClient<{
      id: string;
      totalCostEGP: number;
      paidAmountEGP: number;
      remainingEGP: number;
      revenueShare?: RevenueShare;
    }>(`/visits/${encodeURIComponent(visitId)}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount_egp: amountEGP }),
    });

    const visits = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
    const updated = visits.map((v) =>
      v.id === visitId
        ? {
            ...v,
            totalCostEGP: response.totalCostEGP,
            paidAmountEGP: response.paidAmountEGP,
            remainingEGP: response.remainingEGP,
            revenueShare: response.revenueShare ?? v.revenueShare,
          }
        : v
    );
    setLocal(STORAGE_KEYS.VISITS, updated);

    if (amountEGP > 0) {
      const existingTx = getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
      const visit = updated.find((v) => v.id === visitId);
      const newTx: FinancialTransaction = {
        id: `TX-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split("T")[0],
        type: "REVENUE",
        category: "Clinical Procedures",
        amountEGP,
        patientName: visit?.patientName || visit?.patientId,
        patientCode: visit?.patientId,
        doctorName: visit?.doctorName,
        description: `Visit balance payment ${amountEGP} EGP (remaining ${response.remainingEGP})`,
        status: "POSTED",
      };
      setLocal(STORAGE_KEYS.FINANCIALS, [newTx, ...existingTx]);
    }

    return response;
  } catch (err) {
    rethrowApiError(err);
    const visits = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) {
      throw new Error("Visit not found");
    }
    const total =
      visit.totalCostEGP ??
      visit.procedures.reduce((sum, p) => sum + (p.costEGP || 0), 0);
    const paid = visit.paidAmountEGP ?? total;
    const remaining = Math.max(total - paid, 0);
    if (amountEGP <= 0 || amountEGP > remaining) {
      throw new Error("Invalid payment amount");
    }
    const paidAmountEGP = paid + amountEGP;
    const remainingEGP = total - paidAmountEGP;
    const updated = visits.map((v) =>
      v.id === visitId
        ? { ...v, totalCostEGP: total, paidAmountEGP, remainingEGP }
        : v
    );
    setLocal(STORAGE_KEYS.VISITS, updated);

    const existingTx = getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
    const newTx: FinancialTransaction = {
      id: `TX-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString().split("T")[0],
      type: "REVENUE",
      category: "Clinical Procedures",
      amountEGP,
      patientName: visit.patientName || visit.patientId,
      patientCode: visit.patientId,
      doctorName: visit.doctorName,
      description: `Visit balance payment ${amountEGP} EGP (remaining ${remainingEGP})`,
      status: "POSTED",
    };
    setLocal(STORAGE_KEYS.FINANCIALS, [newTx, ...existingTx]);

    return { id: visitId, totalCostEGP: total, paidAmountEGP, remainingEGP };
  }
}

export async function fetchOutstandingVisits(): Promise<Visit[]> {
  try {
    const data = await apiClient<Visit[]>("/visits/outstanding");
    if (Array.isArray(data)) {
      return data;
    }
  } catch {
    // Fallback
  }
  return getLocal<Visit[]>(STORAGE_KEYS.VISITS, []).filter((v) => {
    const total =
      v.totalCostEGP ?? v.procedures.reduce((sum, p) => sum + (p.costEGP || 0), 0);
    const paid = v.paidAmountEGP ?? total;
    return total > 0 && paid < total;
  });
}

export async function fetchVisitById(visitId: string): Promise<Visit | null> {
  try {
    const data = await apiClient<Visit>(`/visits/${encodeURIComponent(visitId)}`);
    if (data?.id) return data;
  } catch {
    // Fallback
  }
  return getLocal<Visit[]>(STORAGE_KEYS.VISITS, []).find((v) => v.id === visitId) || null;
}

export interface UpdateVisitInput {
  chiefComplaint?: string;
  clinicalFindings?: string;
  diagnosis?: string;
  doctorNotes?: string;
  prescriptions?: string;
  procedures?: { name: string; toothNumber?: string; costEGP: number }[];
  status?: "Completed" | "Draft" | "Amended";
  caseCostEGP?: number;
  caseCostNote?: string | null;
  paidEGP?: number;
}

export async function updateClinicalVisit(visitId: string, input: UpdateVisitInput): Promise<Visit> {
  try {
    const response = await apiClient<Visit>(`/visits/${encodeURIComponent(visitId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        chief_complaint: input.chiefComplaint,
        clinical_findings: input.clinicalFindings,
        diagnosis: input.diagnosis,
        doctor_notes: input.doctorNotes,
        prescriptions: input.prescriptions,
        procedures: input.procedures?.map((p) => ({
          name: p.name,
          tooth_number: p.toothNumber || null,
          cost_egp: p.costEGP || 0,
        })),
        status: input.status,
        case_cost_egp: input.caseCostEGP,
        case_cost_note: input.caseCostNote,
        paid_egp: input.paidEGP,
      }),
    });

    const existing = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
    setLocal(
      STORAGE_KEYS.VISITS,
      existing.map((v) => (v.id === visitId ? { ...v, ...response } : v))
    );
    return response;
  } catch (err) {
    rethrowApiError(err);
    const existing = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
    const current = existing.find((v) => v.id === visitId);
    if (!current) throw new Error("Visit not found");
    const procedures = input.procedures
      ? input.procedures.map((p, i) => ({
          id: `proc_${i}_${Date.now()}`,
          name: p.name,
          toothNumber: p.toothNumber || "General",
          costEGP: p.costEGP,
          status: "Completed" as const,
        }))
      : current.procedures;
    const totalCostEGP = procedures.reduce((sum, p) => sum + (p.costEGP || 0), 0);
    const paidAmountEGP =
      input.paidEGP !== undefined
        ? Math.max(0, input.paidEGP)
        : (current.paidAmountEGP ?? 0);
    if (paidAmountEGP > totalCostEGP) {
      throw new Error(`Paid amount cannot exceed the visit total of ${totalCostEGP} EGP.`);
    }
    const updated: Visit = {
      ...current,
      chiefComplaint: input.chiefComplaint ?? current.chiefComplaint,
      clinicalFindings: input.clinicalFindings ?? current.clinicalFindings,
      diagnosis: input.diagnosis ?? current.diagnosis,
      doctorNotes: input.doctorNotes ?? current.doctorNotes,
      prescriptions: input.prescriptions ? [input.prescriptions] : current.prescriptions,
      procedures,
      status: input.status === "Draft" ? "Draft" : "Completed",
      totalCostEGP,
      paidAmountEGP,
      remainingEGP: totalCostEGP - paidAmountEGP,
      caseCostEGP: input.caseCostEGP ?? current.caseCostEGP ?? 0,
      caseCostNote:
        input.caseCostNote !== undefined ? input.caseCostNote : current.caseCostNote,
    };
    setLocal(
      STORAGE_KEYS.VISITS,
      existing.map((v) => (v.id === visitId ? updated : v))
    );
    return updated;
  }
}

// -----------------------------
// APPOINTMENTS API
// -----------------------------

export async function fetchAppointments(
  statusFilter?: string,
  range?: { from?: string; to?: string }
): Promise<Appointment[]> {
  try {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set("status", statusFilter);
    if (range?.from) qs.set("from", range.from);
    if (range?.to) qs.set("to", range.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const data = await apiClient<Appointment[]>(`/appointments${suffix}`);
    if (Array.isArray(data)) {
      // Only mirror full-ish windows into localStorage so delete fallbacks stay usable.
      if (!statusFilter && !range?.from && !range?.to) {
        setLocal(STORAGE_KEYS.APPOINTMENTS, data);
      }
      return data;
    }
  } catch {
    // Fallback
  }
  return getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
}

export async function scheduleAppointment(input: {
  patientIdOrCode: string;
  doctorName?: string;
  date: string;
  time: string;
  procedure?: string;
  chiefComplaint?: string;
  location?: string;
  durationMinutes?: number;
}): Promise<{ id: string; status: string }> {
  try {
    const response = await apiClient<{ id: string; status: string }>("/appointments", {
      method: "POST",
      body: JSON.stringify({
        patient_id_or_code: input.patientIdOrCode,
        doctor_name: input.doctorName || "Dr. Sayed El-Bahy",
        date: input.date,
        time: input.time,
        procedure: input.procedure || "Clinical Consultation",
        chief_complaint: input.chiefComplaint || input.procedure || "Clinical Consultation",
        location: input.location || "Room 1 — Main Operatory",
        duration_minutes: input.durationMinutes || 30,
      }),
    });
    return response;
  } catch (err) {
    rethrowApiError(err);
    const id = `apt_${Date.now()}`;
    const existing = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
    const newApt: Appointment = {
      id,
      patientCode: input.patientIdOrCode,
      patientName: "Scheduled Patient",
      patientPhone: "—",
      doctorName: input.doctorName || "Dr. Sayed El-Bahy",
      date: input.date,
      time: input.time,
      durationMinutes: input.durationMinutes || 30,
      procedure: input.procedure || "Clinical Consultation",
      chiefComplaint: input.chiefComplaint || input.procedure || "Clinical Consultation",
      location: input.location || "Room 1",
      status: "CONFIRMED",
    };
    setLocal(STORAGE_KEYS.APPOINTMENTS, [...existing, newApt]);
    return { id, status: "CONFIRMED" };
  }
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: Appointment["status"],
  reason?: string
): Promise<{ id: string; status: string }> {
  try {
    return await apiClient<{ id: string; status: string }>(
      `/appointments/${encodeURIComponent(appointmentId)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status, reason: reason || null }),
      }
    );
  } catch {
    const existing = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
    const updated = existing.map((a) =>
      a.id === appointmentId ? { ...a, status } : a
    );
    setLocal(STORAGE_KEYS.APPOINTMENTS, updated);
    return { id: appointmentId, status };
  }
}

export async function deleteAppointment(
  appointmentId: string
): Promise<{ id: string; deleted: boolean; status: string }> {
  try {
    const response = await apiClient<{ id: string; deleted: boolean; status: string }>(
      `/appointments/${encodeURIComponent(appointmentId)}`,
      { method: "DELETE" }
    );
    const existing = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
    if (response.deleted) {
      setLocal(
        STORAGE_KEYS.APPOINTMENTS,
        existing.filter((a) => a.id !== appointmentId)
      );
    } else {
      setLocal(
        STORAGE_KEYS.APPOINTMENTS,
        existing.map((a) =>
          a.id === appointmentId ? { ...a, status: "CANCELLED" as Appointment["status"] } : a
        )
      );
    }
    return response;
  } catch (err) {
    // Production API may not have DELETE yet (405) — cancel instead so calendar clears.
    if (err instanceof ApiError && (err.status === 405 || err.status === 404)) {
      await updateAppointmentStatus(appointmentId, "CANCELLED", "Deleted from calendar");
      return { id: appointmentId, deleted: false, status: "CANCELLED" };
    }
    if (err instanceof ApiError) throw err;
    const existing = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
    setLocal(
      STORAGE_KEYS.APPOINTMENTS,
      existing.filter((a) => a.id !== appointmentId)
    );
    return { id: appointmentId, deleted: true, status: "DELETED" };
  }
}

export async function updateAppointment(
  appointmentId: string,
  input: {
    date?: string;
    time?: string;
    durationMinutes?: number;
    procedure?: string;
    chiefComplaint?: string;
    location?: string;
    notes?: string;
    doctorName?: string;
  }
): Promise<Appointment> {
  try {
    const response = await apiClient<Appointment>(
      `/appointments/${encodeURIComponent(appointmentId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          date: input.date,
          time: input.time,
          duration_minutes: input.durationMinutes,
          procedure: input.procedure,
          chief_complaint: input.chiefComplaint,
          location: input.location,
          notes: input.notes,
          doctor_name: input.doctorName,
        }),
      }
    );
    const existing = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
    setLocal(
      STORAGE_KEYS.APPOINTMENTS,
      existing.map((a) => (a.id === appointmentId ? { ...a, ...response } : a))
    );
    return response;
  } catch (err) {
    rethrowApiError(err);
    const existing = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
    const current = existing.find((a) => a.id === appointmentId);
    if (!current) throw new Error("Appointment not found");
    const updated: Appointment = {
      ...current,
      date: input.date || current.date,
      time: input.time || current.time,
      durationMinutes: input.durationMinutes ?? current.durationMinutes,
      procedure: input.procedure || current.procedure,
      chiefComplaint: input.chiefComplaint ?? current.chiefComplaint,
      location: input.location || current.location,
      notes: input.notes ?? current.notes,
      doctorName: input.doctorName || current.doctorName,
    };
    setLocal(
      STORAGE_KEYS.APPOINTMENTS,
      existing.map((a) => (a.id === appointmentId ? updated : a))
    );
    return updated;
  }
}

// -----------------------------
// FINANCIALS API
// -----------------------------

export async function fetchFinancialTransactions(): Promise<FinancialTransaction[]> {
  try {
    const data = await apiClient<FinancialTransaction[]>("/financials/transactions");
    if (Array.isArray(data)) {
      setLocal(STORAGE_KEYS.FINANCIALS, data);
      return data;
    }
  } catch {
    // Fallback
  }
  return getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
}

export async function fetchFinancialSummary(): Promise<FinancialSummary | null> {
  try {
    return await apiClient<FinancialSummary>("/financials/summary");
  } catch {
    return null;
  }
}

export async function fetchDashboardOverview(): Promise<DashboardOverview | null> {
  try {
    return await apiClient<DashboardOverview>("/dashboard/overview");
  } catch {
    return null;
  }
}

export async function fetchReportsAnalytics(params?: {
  preset?: "week" | "month" | "quarter" | "year" | "custom";
  from?: string;
  to?: string;
  streamId?: string;
  doctorId?: string;
}): Promise<ReportAnalytics | null> {
  try {
    const qs = new URLSearchParams();
    if (params?.preset && params.preset !== "custom") qs.set("preset", params.preset);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.streamId) qs.set("stream_id", params.streamId);
    if (params?.doctorId) qs.set("doctor_id", params.doctorId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return await apiClient<ReportAnalytics>(`/reports/analytics${suffix}`);
  } catch {
    return null;
  }
}

export async function fetchFinancialCategories(
  type?: "REVENUE" | "EXPENSE",
  includeInactive = false
): Promise<FinancialCategory[]> {
  try {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (includeInactive) params.set("include_inactive", "true");
    const qs = params.toString();
    const endpoint = qs ? `/financials/categories?${qs}` : "/financials/categories";
    const data = await apiClient<FinancialCategory[]>(endpoint);
    if (Array.isArray(data)) return data;
  } catch {
    // Fallback
  }
  return [];
}

export async function createFinancialCategory(input: {
  transactionType: "REVENUE" | "EXPENSE";
  nameEn: string;
  nameAr?: string;
}): Promise<FinancialCategory> {
  return apiClient<FinancialCategory>("/financials/categories", {
    method: "POST",
    body: JSON.stringify({
      transaction_type: input.transactionType,
      name_en: input.nameEn,
      name_ar: input.nameAr || null,
    }),
  });
}

export async function updateFinancialCategory(
  id: string,
  input: { nameEn?: string; nameAr?: string; isActive?: boolean }
): Promise<FinancialCategory> {
  return apiClient<FinancialCategory>(`/financials/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name_en: input.nameEn,
      name_ar: input.nameAr,
      is_active: input.isActive,
    }),
  });
}

export async function postFinancialTransaction(input: {
  type: "REVENUE" | "EXPENSE";
  amountEGP: number;
  description: string;
  patientIdOrCode?: string;
  categoryId?: string;
  categoryName?: string;
}): Promise<{ id: string; status: string }> {
  try {
    const response = await apiClient<{ id: string; status: string }>("/financials/transactions", {
      method: "POST",
      body: JSON.stringify({
        type: input.type,
        amount_egp: input.amountEGP,
        description: input.description,
        patient_id_or_code: input.patientIdOrCode || null,
        category_id: input.categoryId || null,
        category_name: input.categoryName || null,
      }),
    });
    return response;
  } catch (err) {
    rethrowApiError(err);
    const id = `tx_${Date.now()}`;
    const existing = getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
    const newTx: FinancialTransaction = {
      id,
      date: new Date().toISOString().split("T")[0],
      type: input.type,
      category: input.categoryName || (input.type === "REVENUE" ? "Clinical Treatment" : "Operating Expense"),
      categoryId: input.categoryId,
      amountEGP: input.amountEGP,
      patientName: input.patientIdOrCode ? "Patient" : undefined,
      patientCode: input.patientIdOrCode,
      doctorName: "Dr. Sayed El-Bahy",
      description: input.description,
      status: "POSTED",
      isManual: true,
    };
    setLocal(STORAGE_KEYS.FINANCIALS, [newTx, ...existing]);
    return { id, status: "POSTED" };
  }
}

export async function updateFinancialTransaction(
  id: string,
  input: {
    type?: "REVENUE" | "EXPENSE";
    amountEGP?: number;
    description?: string;
    categoryId?: string;
    categoryName?: string;
    effectiveOn?: string;
  }
): Promise<{ id: string; status: string }> {
  try {
    return await apiClient<{ id: string; status: string }>(`/financials/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        type: input.type ?? null,
        amount_egp: input.amountEGP ?? null,
        description: input.description ?? null,
        category_id: input.categoryId ?? null,
        category_name: input.categoryName ?? null,
        effective_on: input.effectiveOn ?? null,
      }),
    });
  } catch (error) {
    rethrowApiError(error);
    const existing = getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
    const idx = existing.findIndex((tx) => tx.id === id);
    if (idx < 0) throw error;
    const current = existing[idx];
    if (current.isManual === false) throw error;
    const updated: FinancialTransaction = {
      ...current,
      type: input.type ?? current.type,
      amountEGP: input.amountEGP ?? current.amountEGP,
      description: input.description ?? current.description,
      category: input.categoryName ?? current.category,
      categoryId: input.categoryId ?? current.categoryId,
      date: input.effectiveOn ?? current.date,
      isManual: true,
    };
    const next = [...existing];
    next[idx] = updated;
    setLocal(STORAGE_KEYS.FINANCIALS, next);
    return { id, status: "POSTED" };
  }
}

export async function fetchCaseStreams(includeInactive = false): Promise<CaseStream[]> {
  try {
    const endpoint = includeInactive ? "/case-streams?include_inactive=true" : "/case-streams";
    const data = await apiClient<CaseStream[]>(endpoint);
    if (Array.isArray(data)) {
      return data.map((s) => ({
        ...s,
        referralPercent: s.referralPercent ?? 0,
      }));
    }
  } catch {
    // Fallback
  }
  return [];
}

export async function createCaseStream(input: {
  nameEn: string;
  nameAr?: string;
  referralPercent?: number;
}): Promise<CaseStream> {
  return apiClient<CaseStream>("/case-streams", {
    method: "POST",
    body: JSON.stringify({
      name_en: input.nameEn,
      name_ar: input.nameAr || null,
      referral_percent: input.referralPercent ?? 0,
    }),
  });
}

export async function updateCaseStream(
  id: string,
  input: { nameEn?: string; nameAr?: string; isActive?: boolean; referralPercent?: number }
): Promise<CaseStream> {
  return apiClient<CaseStream>(`/case-streams/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name_en: input.nameEn,
      name_ar: input.nameAr,
      is_active: input.isActive,
      referral_percent: input.referralPercent,
    }),
  });
}

// -----------------------------
// DOCTORS API
// -----------------------------

export async function fetchDoctors(): Promise<Doctor[]> {
  try {
    const data = await apiClient<Doctor[]>("/doctors");
    if (Array.isArray(data)) {
      return data;
    }
  } catch {
    // Fallback
  }
  return [];
}

// -----------------------------
// AUDIT LOGS API
// -----------------------------

export async function fetchAuditLogs(): Promise<AuditLogRecord[]> {
  try {
    const data = await apiClient<AuditLogApiRow[]>("/audit/logs");
    if (Array.isArray(data)) {
      return data.map((d) => ({
        id: d.id,
        user: d.actor_user_id ? "Operations Staff" : "System Admin",
        role: d.actor_role || "ADMIN",
        action: d.action,
        target: d.target_id || "System",
        time: new Date(d.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        description: d.description || "",
      }));
    }
  } catch {
    // Fallback
  }
  return [];
}
